/* =========================
   FIREBASE CONFIG
========================= */
const firebaseConfig = {
    apiKey: "AIzaSyCE89XAuk9wzIhp9QEeCKkdVUK867PtK_Q",
    authDomain: "sentencebuilder-50ef5.firebaseapp.com",
    projectId: "sentencebuilder-50ef5",
    storageBucket: "sentencebuilder-50ef5.firebasestorage.app",
    messagingSenderId: "607531947255",
    appId: "1:607531947255:web:85162d052bdb53296deff2"
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

// Change 'session' to 'local' so the login state persists across tabs and window reopens
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

/* =========================
   STATE
========================= */
const MASTER_YEAR_ORDER = ['Year 9', 'GCSE', 'Year 12', 'Year 13'];
let currentUser = null;
let transformationsText = "";
let currentDocId = null;
let currentStudentAssignment = null;
let activeInputForVK = null;
let tokenClient = null;
let editingAssignmentId = null;
window.editingSavedSentencesMap = null;

let studentExerciseTypes = [];
let studentCurrentExIndex = 0;
let studentAnswersState = {};
window.studentCompletedExercises = window.studentCompletedExercises || {};

let nav = {
    lang: null,
    year: null,
    topic: null,
    sortBy: 'updated'
};

// Default cell factory (defined here so initial grid creation works before editor.js loads)
function c() {
    return {
        items: [{ t: "", tr: "" }],
        color: "#ffffff",
        excluded: false,
        sel: false,
        split: false,
        hidden: false,
        rS: 1,
        cS: 1
    };
}

let grid = [[c(), c(), c()], [c(), c(), c()]];
let excludedPairs = [];
let excludeSelection = [];
let disabledRoutes = [];
let excludedCombos = [];
let requiredCombos = [];

let comboPickerMode = null; // 'excluded' or 'required'
let currentComboSelection = [];

let history = [JSON.stringify(grid)];
let historyStep = 0;
let currentMode = null;
let typingTimer;
let meta = { lang: '', year: '', topic: '' };
let activeAssignmentBuilderId = null;
let activeAssignmentGrid = null;
let activeAssignmentDisabledRoutes = null;
let activeAssignmentExcludedCombos = null;
let activeAssignmentRequiredCombos = null;
let activeAssignmentExcludedPairs = null;
let activeAssignmentTransformationsText = null;

// State variables for Fullscreen controls
let currentFsFontSize = 28;
let currentFsWidthPercent = 100;
let studentSubItemIndex = 0;
let studentOneByOneTimers = [];
let firestoreDraftTimer = null;
let firestoreAutoSaveTimer = null;
let hasPendingCloudSave = false;

function getStudentDraftKey(assignmentId) {
    const email = (currentUser?.email || '').trim().toLowerCase();
    if (!assignmentId || !email) return null;
    return `${assignmentId}_${email}`;
}

function buildDraftPayload(assignmentId) {
    return {
        assignmentId: assignmentId,
        studentEmail: (currentUser?.email || '').trim().toLowerCase(),
        studentUid: currentUser?.uid || null,
        studentAnswersState: studentAnswersState || {},
        studentCompletedExercises: window.studentCompletedExercises || {},
        currentExIndex: typeof studentCurrentExIndex === 'number' ? studentCurrentExIndex : 0,
        currentSubItemIndex: typeof studentSubItemIndex === 'number' ? studentSubItemIndex : 0,
        updatedAt: Date.now()
    };
}

async function saveDraftProgress({ immediate = false } = {}) {
    if (window.isTeacherPreview) return;

    const assignmentId = currentStudentAssignment?.id;
    const draftKey = getStudentDraftKey(assignmentId);
    if (!draftKey) return;

    const payload = buildDraftPayload(assignmentId);

    // 1. Save immediately to localStorage using the exact key loadStudentTask() reads
    try {
        localStorage.setItem(`student_draft_${draftKey}`, JSON.stringify(payload));
    } catch (e) {
        console.warn('Local draft save failed:', e);
    }

    // 2. Sync to Firestore (immediately on Exercise Submit, or debounced 1.5s while typing)
    const writeToFirestore = async () => {
        clearTimeout(firestoreAutoSaveTimer);
        firestoreAutoSaveTimer = null;
        hasPendingCloudSave = false;

        try {
            await db.collection('drafts').doc(draftKey).set(payload, { merge: true });
        } catch (err) {
            console.error('Firestore draft sync failed:', err);
        }
    };

    if (immediate) {
        await writeToFirestore();
    } else {
        hasPendingCloudSave = true;
        clearTimeout(firestoreAutoSaveTimer);
        firestoreAutoSaveTimer = setTimeout(writeToFirestore, 1500);
    }
}

document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && hasPendingCloudSave) {
        saveDraftProgress({ immediate: true });
    }
});

function cancelPendingDraftSave() {
    clearTimeout(firestoreAutoSaveTimer);
    firestoreAutoSaveTimer = null;
    hasPendingCloudSave = false;
}

function triggerFirestoreDraftAutoSave() {
    if (!currentStudentAssignment || !currentStudentAssignment.id || !currentUser || !currentUser.email || window.isTeacherPreview) return;

    clearTimeout(firestoreDraftTimer);
    firestoreDraftTimer = setTimeout(() => {
        saveDraftProgress();
    }, 1500);
}

function clearStudentOneByOneTimers() {
    studentOneByOneTimers.forEach(t => {
        clearInterval(t);
        clearTimeout(t);
    });
    studentOneByOneTimers = [];
}

function initFullscreenToolbar() {
    const fontMinusBtn = document.getElementById('fs-font-minus');
    const fontPlusBtn = document.getElementById('fs-font-plus');

    if (fontMinusBtn) {
        fontMinusBtn.onclick = function() {
            if (currentFsFontSize > 16) {
                currentFsFontSize = Math.max(16, currentFsFontSize - 2);
                updateFsStyles();
            }
        };
    }

    if (fontPlusBtn) {
        fontPlusBtn.onclick = function() {
            if (currentFsFontSize < 64) {
                currentFsFontSize = Math.min(64, currentFsFontSize + 2);
                updateFsStyles();
            }
        };
    }
}

function updateFsStyles() {
    const gridContainer = document.getElementById('grid-container');
    if (!gridContainer) return;

    gridContainer.style.setProperty('--fs-font-size', currentFsFontSize + 'px');

    const fontLabel = document.getElementById('fs-font-label');
    if (fontLabel) {
        fontLabel.textContent = Math.round((currentFsFontSize / 15) * 100) + '%';
    }

    gridContainer.querySelectorAll('input').forEach(el => {
        if (typeof syncSize === 'function') {
            syncSize(el);
        }
    });
}

async function setupAssignmentBuilderContext(assign) {
    activeAssignmentBuilderId = assign.builderId || null;
    let bData = null;

    // 1. Try loading directly via builderId
    if (assign.builderId) {
        try {
            const builderDoc = await db.collection("builders").doc(assign.builderId).get();
            if (builderDoc.exists) {
                bData = builderDoc.data();
            }
        } catch (e) {
            console.warn("Could not fetch builder by builderId:", e);
        }
    }

    // 2. Fallback to assignment snapshot if builder document is unavailable
    if (!bData && assign.builderSnapshot) {
        bData = assign.builderSnapshot;
    }

    // 3. Fallback search by language and topic/title
    if (!bData && (assign.topic || assign.title)) {
        try {
            let q = db.collection("builders").where("isDeleted", "==", false);
            if (assign.lang) q = q.where("lang", "==", assign.lang);
            if (assign.topic) q = q.where("topic", "==", assign.topic);
            const snap = await q.get();
            if (!snap.empty) {
                const matched = snap.docs.find(d => d.data().title === assign.title) || snap.docs[0];
                bData = matched.data();
                activeAssignmentBuilderId = matched.id;
            }
        } catch (e) {
            console.warn("Could not search builder fallback:", e);
        }
    }

    // 4. Bind target builder grid and rules to the assignment session
    if (bData && bData.grid) {
        activeAssignmentGrid = typeof bData.grid === 'string' ? JSON.parse(bData.grid) : bData.grid;
        activeAssignmentDisabledRoutes = bData.disabledRoutes || [];
        activeAssignmentExcludedCombos = bData.excludedCombos || [];
        activeAssignmentRequiredCombos = bData.requiredCombos || [];
        activeAssignmentExcludedPairs = bData.excludedPairs || [];
        activeAssignmentTransformationsText = bData.transformationsText || bData.transformations || "";
    } else {
        activeAssignmentGrid = JSON.parse(JSON.stringify(grid));
        activeAssignmentDisabledRoutes = Array.isArray(disabledRoutes) ? [...disabledRoutes] : [];
        activeAssignmentExcludedCombos = JSON.parse(JSON.stringify(excludedCombos || []));
        activeAssignmentRequiredCombos = JSON.parse(JSON.stringify(requiredCombos || []));
        activeAssignmentExcludedPairs = JSON.parse(JSON.stringify(excludedPairs || []));
        activeAssignmentTransformationsText = document.getElementById('transformations-input')?.value || transformationsText || "";
    }
}

const allColors = ["#ffffff","#f1f5f9","#fee2e2","#ffedd5","#fef9c3","#dcfce7","#d1fae5","#e0f2fe","#e0e7ff","#ede9fe","#fae8ff","#fce7f3","#ffccd5","#bbf7d0"];

const VOWELS_REGEX = /[aeiouàéèíóúüÄÖÜäöü]/i;
const CONSONANTS_REGEX = /[bcdfghjklmnpqrstvwxyzßçñ]/i;

/* =========================
   SPECIAL CHARACTER KEYBOARDS
========================= */
const LANGUAGE_KEYBOARDS = {
    'French':  ['à', 'â', 'ä', 'é', 'è', 'ê', 'ë', 'î', 'ï', 'ô', 'ö', 'ù', 'ü', 'û', 'ç'],
    'Spanish': ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¡', '¿'],
    'German':  ['ä', 'ö', 'ü', 'ß', 'Ä', 'Ö', 'Ü'],
    'EAL':     []
};

/* =========================
   ROBUST GAP FILL PARSER
========================= */
function extractGapWord(sentenceStr) {
    if (!sentenceStr) return { fullMatch: null, cleanGap: "" };

    let m = sentenceStr.match(/\*([^*]+)\*/);
    if (m) {
        let clean = m[1].replace(/^[.,!?;:'"«»()\s]+|[.,!?;:'"«»()\s]+$/g, '').trim();
        return { fullMatch: m[0], cleanGap: clean };
    }

    m = sentenceStr.match(/"([^"]+)"/);
    if (m) {
        let clean = m[1].replace(/^[.,!?;:'"«»()\s]+|[.,!?;:'"«»()\s]+$/g, '').trim();
        return { fullMatch: m[0], cleanGap: clean };
    }

    m = sentenceStr.match(/\[([^\]]+)\]/);
    if (m) {
        let clean = m[1].replace(/^[.,!?;:'"«»()\s]+|[.,!?;:'"«»()\s]+$/g, '').trim();
        return { fullMatch: m[0], cleanGap: clean };
    }

    return { fullMatch: null, cleanGap: "" };
}

/* =========================
   GOOGLE OAUTH & TOKEN MANAGEMENT
========================= */
const GOOGLE_CLASSROOM_SCOPES = [
    'https://www.googleapis.com/auth/classroom.courses.readonly',
    'https://www.googleapis.com/auth/classroom.coursework.students',
    'https://www.googleapis.com/auth/classroom.coursework.me',
    'https://www.googleapis.com/auth/classroom.rosters.readonly',
    'https://www.googleapis.com/auth/classroom.profile.emails',
    'https://www.googleapis.com/auth/classroom.topics'
].join(' ');

function gisInit() {
    if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
        tokenClient = google.accounts.oauth2.initTokenClient({
            client_id: '607531947255-m9hi0iu66l1jl3vaghv8r05d92mi1uq0.apps.googleusercontent.com',
            scope: GOOGLE_CLASSROOM_SCOPES,
            callback: (tokenResponse) => {
                if (tokenResponse.access_token) {
                    localStorage.setItem('oauth_token', tokenResponse.access_token);
                    localStorage.setItem('oauth_token_expiry', Date.now() + (tokenResponse.expires_in * 1000));
                    if (window.gapi && gapi.client) {
                        gapi.client.setToken({ access_token: tokenResponse.access_token });
                    }
                }
            }
        });
    }
}

function getValidAccessToken() {
    const savedToken = localStorage.getItem('oauth_token');
    const tokenExpiry = localStorage.getItem('oauth_token_expiry');
    if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry, 10) - 60000) {
        return savedToken;
    }
    return null;
}

/* =========================
   UPDATED SILENT TOKEN MANAGEMENT
========================= */
function ensureClassroomToken(forcePrompt = false) {
    return new Promise((resolve) => {
        const token = getValidAccessToken();
        
        // If a valid token exists in storage and we are not forcing a prompt, attach and resolve immediately
        if (token && !forcePrompt) {
            if (window.gapi && gapi.client) {
                gapi.client.setToken({ access_token: token });
            }
            resolve(token);
            return;
        }

        if (!tokenClient) gisInit();

        if (tokenClient) {
            const oldCallback = tokenClient.callback;
            
            tokenClient.callback = (res) => {
                tokenClient.callback = oldCallback;
                if (res && res.access_token) {
                    localStorage.setItem('oauth_token', res.access_token);
                    localStorage.setItem('oauth_token_expiry', Date.now() + (res.expires_in * 1000));
                    if (window.gapi && gapi.client) {
                        gapi.client.setToken({ access_token: res.access_token });
                    }
                    resolve(res.access_token);
                } else if (!forcePrompt && currentUser && currentUser.email) {
                    // If silent background token fetch failed, fallback once to interactive popup
                    ensureClassroomToken(true).then(resolve);
                } else {
                    resolve(null);
                }
            };

            try {
                const reqConfig = {};
                if (forcePrompt) {
                    reqConfig.prompt = 'select_account';
                } else if (currentUser && currentUser.email) {
                    reqConfig.hint = currentUser.email;
                    reqConfig.prompt = ''; // Attempt silent background auth (NO POPUP!)
                } else {
                    reqConfig.prompt = 'select_account';
                }
                tokenClient.requestAccessToken(reqConfig);
            } catch (e) { 
                console.warn("Token acquisition error:", e);
                resolve(null); 
            }
        } else {
            resolve(null);
        }
    });
}

async function ensureGapiClassroomLoaded() {
    if (!window.gapi) return false;
    
    // Silently obtain or verify token
    const token = await ensureClassroomToken(false);
    if (token && window.gapi.client) {
        gapi.client.setToken({ access_token: token });
    }
    
    if (window.gapi && gapi.client && !gapi.client.classroom) {
        try {
            await new Promise((resolve, reject) => {
                gapi.client.load('classroom', 'v1').then(resolve).catch(reject);
            });
        } catch (e) {
            console.warn("Could not load classroom API client:", e);
            return false;
        }
    }
    return !!(gapi.client && gapi.client.classroom);
}

function setupVirtualKeyboard(lang, actType) {
    const bar = document.getElementById('virtual-keyboard-bar');
    if (!bar) return;

    const noKeyboardActivities = ['match', 'nospaces', 'jumbled', 'study', 'gap-en', 'faulty', 'trans-en', 'listen-trad'];
    if (noKeyboardActivities.includes(actType)) {
        bar.style.display = 'none';
        return;
    }

    const chars = LANGUAGE_KEYBOARDS[lang] || [];
    if (chars.length === 0) {
        bar.style.display = 'none';
        return;
    }

    bar.style.display = 'flex';
    bar.innerHTML = chars.map(ch => `
        <button type="button" class="vk-btn" onclick="insertVirtualChar('${ch}')">${ch}</button>
    `).join('');

    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            activeInputForVK = e.target;
        }
    });
}

function insertVirtualChar(char) {
    if (!activeInputForVK) return;
    const start = activeInputForVK.selectionStart || 0;
    const end = activeInputForVK.selectionEnd || 0;
    const val = activeInputForVK.value;
    activeInputForVK.value = val.substring(0, start) + char + val.substring(end);
    activeInputForVK.focus();
    activeInputForVK.setSelectionRange(start + 1, start + 1);
    activeInputForVK.dispatchEvent(new Event('input', { bubbles: true }));
}

/* =========================
   INITIALIZATION & AUTH
========================= */
window.onload = async () => {
    gisInit();

    if (window.gapi) {
        gapi.load('client', () => {
            gapi.client.init({}).then(() => {
                gapi.client.load('classroom', 'v1');
            });
        });
    }

    const urlParams = new URLSearchParams(window.location.search);
    const assignmentId = urlParams.get('assignmentId');

    if (assignmentId) {
        showPage('student-portal-page');
        
        auth.onAuthStateChanged(user => {
            const authTextEl = document.getElementById('student-auth-instruction-text');
            if (user && user.email.toLowerCase().endsWith("@cedarsupper.co.uk")) {
                currentUser = user;
                document.getElementById('student-login-box').style.display = 'none';
                if (authTextEl) authTextEl.style.display = 'none';
                document.getElementById('student-profile-badge').style.display = 'inline-block';
                document.getElementById('student-display-name').innerText = currentUser.displayName || 'Student';
                document.getElementById('student-display-email').innerText = `(${currentUser.email})`;
                
                loadStudentTask(assignmentId);
            } else {
                document.getElementById('student-login-box').style.display = 'block';
                if (authTextEl) authTextEl.style.display = 'block';
                document.getElementById('student-profile-badge').style.display = 'none';
                document.getElementById('student-active-exercise-card').style.display = 'none';
                document.getElementById('student-marksheet-card').style.display = 'none';
                document.getElementById('student-pending-review-card').style.display = 'none';
                document.getElementById('student-reference-banner').style.display = 'none';
                document.getElementById('student-nav-actions').style.display = 'none';
                document.getElementById('virtual-keyboard-bar').style.display = 'none';
            }
        });
        return;
    }

    auth.onAuthStateChanged(async (user) => {
        initMetaListeners();

        if (!user) {
            currentUser = null;
            showPage('login-page');
            return;
        }

        const email = user.email.toLowerCase();

        // 1. Verify school domain
        if (!email.endsWith("@cedarsupper.co.uk")) {
            alert("Access Denied: Please use your official school email account.");
            auth.signOut();
            showPage('login-page');
            return;
        }

        // 2. Determine role and assignment link parameters
        const isStudent = /^[0-9]/.test(email);

        // 3. Block students attempting to log in on the base URL without an assignmentId
        if (isStudent && !assignmentId) {
            alert("Access Denied: Students can only log in using a direct Google Classroom assignment link.");
            auth.signOut();
            showPage('login-page');
            return;
        }

        currentUser = user;

        // Safely update navbar display if present
        const userDisplay = document.getElementById('user-display');
        if (userDisplay) userDisplay.innerText = email;

        // 4. Route based on context (Student Task Portal vs Teacher Library)
        cleanupOldDeletedFiles();
        showPage('library-page');
        renderLibrary();
    });
}; 

async function login() {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('https://www.googleapis.com/auth/classroom.courses.readonly');
    provider.addScope('https://www.googleapis.com/auth/classroom.coursework.students');
    provider.addScope('https://www.googleapis.com/auth/classroom.coursework.me');
    provider.addScope('https://www.googleapis.com/auth/classroom.rosters.readonly');
    provider.addScope('https://www.googleapis.com/auth/classroom.profile.emails');
    provider.addScope('https://www.googleapis.com/auth/classroom.topics');
    
    provider.setCustomParameters({ prompt: 'select_account' });

    try {
        const result = await auth.signInWithPopup(provider);
        const email = result.user.email.toLowerCase();

        if (!email.endsWith("@cedarsupper.co.uk")) {
            alert("Access Denied: Please sign in with your official school email (@cedarsupper.co.uk).");
            await auth.signOut();
            return;
        }

        currentUser = result.user;
        if (result.credential && result.credential.accessToken) {
            localStorage.setItem('oauth_token', result.credential.accessToken);
            localStorage.setItem('oauth_token_expiry', Date.now() + (3600 * 1000));
        }

        document.getElementById('user-display').innerText = email;
        showPage('library-page');
        renderLibrary();

    } catch (e) {
        alert("Sign-in failed: " + e.message);
    }
}

async function studentLogin() {
    const provider = new firebase.auth.GoogleAuthProvider();
    try {
        const result = await auth.signInWithPopup(provider);
        const email = result.user.email.toLowerCase();

        if (!email.endsWith("@cedarsupper.co.uk")) {
            alert("Access Denied: Please use your official school Google account (@cedarsupper.co.uk).");
            await auth.signOut();
            return;
        }

        currentUser = result.user;
        document.getElementById('student-login-box').style.display = 'none';
        const authTextEl = document.getElementById('student-auth-instruction-text');
        if (authTextEl) authTextEl.style.display = 'none';

        document.getElementById('student-profile-badge').style.display = 'inline-block';
        document.getElementById('student-display-name').innerText = currentUser.displayName || 'Student';
        document.getElementById('student-display-email').innerText = `(${currentUser.email})`;

        const urlParams = new URLSearchParams(window.location.search);
        const assignmentId = urlParams.get('assignmentId');
        if (assignmentId) loadStudentTask(assignmentId);

    } catch (e) {
        alert("Authentication failed: " + e.message);
    }
}

async function logout() {
    localStorage.removeItem('oauth_token');
    localStorage.removeItem('oauth_token_expiry');
    await auth.signOut();
    location.reload();
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => {
        page.classList.remove('active-page');
    });

    const active = document.getElementById(pageId);
    if (active) {
        active.classList.add('active-page');
    }

    const teacherNav = document.getElementById('teacher-navbar');
    if (teacherNav) {
        if (pageId === 'student-portal-page' || pageId === 'login-page') {
            teacherNav.style.display = 'none';
        } else if (currentUser) {
            teacherNav.style.display = 'block';
            renderLanguageNavButtons();
        }
    }

    if (pageId === 'library-page' && currentUser) {
        renderLibrary();
    }

    if (pageId !== 'editor-page' && pageId !== 'student-portal-page') {
        const gc = document.getElementById('grid-container');
        if (gc) gc.innerHTML = '';
        currentDocId = null;
    }
}
