
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

auth.setPersistence('session');

/* =========================
   STATE
========================= */
const MASTER_YEAR_ORDER = ['Year 9', 'GCSE', 'Year 12', 'Year 13'];
    let currentUser = null;
    let transformationsText = ""
let currentDocId = null;
let currentStudentAssignment = null;
let activeInputForVK = null;
let tokenClient = null;
let editingAssignmentId = null;
window.editingSavedSentencesMap = null;
let activeEditorMode = null; // 🛠️ FIX: Declare missing state variable

let studentExerciseTypes = [];
let studentCurrentExIndex = 0;
let studentAnswersState = {};

let nav = {
    lang: null,
    year: null,
    topic: null,
    sortBy: 'updated'
};

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

const allColors = ["#ffffff","#f1f5f9","#fee2e2","#ffedd5","#fef9c3","#dcfce7","#d1fae5","#e0f2fe","#e0e7ff","#ede9fe","#fae8ff","#fce7f3","#ffccd5","#bbf7d0"];

const VOWELS_REGEX = /[aeiouàéèíóúüÄÖÜäöü]/i;
const CONSONANTS_REGEX = /[bcdfghjklmnpqrstvwxyzßçñ]/i;
let classroomStudents = [];
let selectedClassroomStudentIds = [];
let studentSelectorCourseId = null;

function updateStudentSelectionSummary() {
    const summary = document.getElementById('student-selection-summary');
    if (!summary) return;
    
    const total = classroomStudents.length;
    const selected = selectedClassroomStudentIds.length;

    if (total === 0) {
        summary.innerText = "No students";
    } else if (selected === total) {
        summary.innerText = "All students";
    } else {
        summary.innerText = `${selected} of ${total} selected`;
    }
}

function handleClassroomCourseChange(courseId) {
    loadClassroomStudents(courseId);
}
function renderClassroomStudentList() {
    const list = document.getElementById('student-list');
    if (!list) return;

    list.innerHTML = '';

    if (classroomStudents.length === 0) {
        list.innerHTML = `
            <div style="padding: 15px; text-align: center; color: #7f8c8d; font-size: 13px;">
                No students found in this class.
            </div>
        `;
        updateStudentSelectionSummary();
        return;
    }

    classroomStudents.forEach(student => {
        const studentId = student.userId;
        const profile = student.profile || {};
        const name = profile.name && profile.name.fullName ? profile.name.fullName : (profile.emailAddress || 'Unnamed student');

        const row = document.createElement('label');
        row.style.cssText = `
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 9px 12px;
            cursor: pointer;
            border-bottom: 1px solid #f1f5f9;
            font-size: 13px;
            color: #2c3e50;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedClassroomStudentIds.includes(studentId);

        if (activeEditorMode === "assignment") {
            checkbox.disabled = true;
            checkbox.style.cursor = 'not-allowed';
        }

        checkbox.style.cssText = `
            width: 16px;
            height: 16px;
            margin: 0;
            flex: 0 0 auto;
            cursor: ${activeEditorMode === "assignment" ? "not-allowed" : "pointer"};
        `;

        checkbox.addEventListener('change', () => {
            if (activeEditorMode === "assignment") return;
            if (checkbox.checked) {
                if (!selectedClassroomStudentIds.includes(studentId)) {
                    selectedClassroomStudentIds.push(studentId);
                }
            } else {
                selectedClassroomStudentIds = selectedClassroomStudentIds.filter(id => id !== studentId);
            }
            updateStudentSelectionSummary();
        });

        const textContainer = document.createElement('div');
        const nameElement = document.createElement('div');
        nameElement.style.cssText = `font-weight: 600; line-height: 1.3;`;
        nameElement.innerText = name;
        textContainer.appendChild(nameElement);

        row.appendChild(checkbox);
        row.appendChild(textContainer);
        list.appendChild(row);
    });

    updateStudentSelectionSummary();
}
async function loadClassroomStudents(courseId) {
    const summary = document.getElementById('student-selection-summary');
    const list = document.getElementById('student-list');

    if (!courseId || courseId.startsWith("Loading")) {
        classroomStudents = [];
        selectedClassroomStudentIds = [];
        studentSelectorCourseId = null;
        if (summary) summary.innerText = "No students";
        if (list) list.innerHTML = '';
        return;
    }

    studentSelectorCourseId = courseId;
    if (summary) summary.innerText = "Loading...";
    if (list) {
        list.innerHTML = `<div style="padding: 15px; text-align: center; color: #7f8c8d; font-size: 13px;">Loading students...</div>`;
    }

    try {
        await ensureGapiClassroomLoaded(); // 🛠️ Ensure GAPI classroom client is loaded
        await ensureClassroomToken();
        let allStudents = [];
        let pageToken = null;

        do {
            const response = await gapi.client.classroom.courses.students.list({
                courseId: courseId,
                pageSize: 100,
                pageToken: pageToken || undefined
            });
            const students = response.result.students || [];
            allStudents = allStudents.concat(students);
            pageToken = response.result.nextPageToken || null;
        } while (pageToken);

        classroomStudents = allStudents.sort((a, b) => {
            const nameA = a.profile?.name?.fullName || a.profile?.emailAddress || '';
            const nameB = b.profile?.name?.fullName || b.profile?.emailAddress || '';
            return nameA.localeCompare(nameB);
        });

        if (activeEditorMode !== "assignment") {
            selectedClassroomStudentIds = classroomStudents.map(student => student.userId);
        }

        renderClassroomStudentList();
    } catch (error) {
        console.error("Failed to load Google Classroom students:", error);
        classroomStudents = [];
        selectedClassroomStudentIds = [];
        if (summary) summary.innerText = "Unable to load";
        if (list) {
            list.innerHTML = `<div style="padding: 15px; color: #c0392b; font-size: 13px;">Unable to load students from Google Classroom.</div>`;
        }
    }
}

function selectAllClassroomStudents() {
    if (activeEditorMode === "assignment") return;
    selectedClassroomStudentIds = classroomStudents.map(student => student.userId);
    renderClassroomStudentList();
}

function openStudentSelector() {
    if (activeEditorMode === "assignment") return;
    const panel = document.getElementById('student-selector-panel');
    const arrow = document.getElementById('student-dropdown-arrow');
    if (!panel) return;

    const isHidden = panel.classList.toggle('hidden');
    if (arrow) {
        arrow.innerText = isHidden ? '▾' : '▴';
    }
}

function initialiseClassroomStudentSelector() {
    const allStudentsButton = document.getElementById('all-students-btn');
    const selectAllButton = document.getElementById('select-all-students-btn');

    if (allStudentsButton) allStudentsButton.onclick = openStudentSelector;
    if (selectAllButton) selectAllButton.onclick = selectAllClassroomStudents;
}
initialiseClassroomStudentSelector();
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

    const noKeyboardActivities = ['match', 'nospaces', 'jumbled', 'study', 'gap-en', 'faulty', 'trans-en'];
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

    // 🔒 TEACHER PLATFORM ACCESS CONTROL (Triggers when no assignmentId is present)
    auth.onAuthStateChanged(async (user) => {
        initMetaListeners();
        if (user) {
            const email = user.email.toLowerCase();
            
            if (!email.endsWith("@cedarsupper.co.uk")) {
                await auth.signOut();
                alert("Access Denied: Use school email.");
                showPage('login-page');
                return;
            }

            // 👇 ADD YOUR TEACHER EMAIL(S) HERE 👇
            const AUTHORIZED_TEACHERS = [
                "adaligand@cedarsupper.co.uk" // Add any additional teacher emails here if needed
            ];

            if (!AUTHORIZED_TEACHERS.includes(email)) {
                await auth.signOut();
                alert("Access Denied: Teacher portal access is restricted. Students must access tasks via their assigned link.");
                showPage('login-page');
                return;
            }

            currentUser = user;
            document.getElementById('user-display').innerText = email;
            cleanupOldDeletedFiles(); 
            showPage('library-page');
            renderLibrary();
        } else {
            currentUser = null;
            showPage('login-page');
        }
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
/* =========================
   NAVIGATION SYSTEM
========================= */
function renderLanguageNavButtons() {
    const langContainer = document.getElementById("language-nav-container");
    if (!langContainer) return;

    const languages = [
        { name: "French", flag: "🇫🇷" },
        { name: "German", flag: "🇩🇪" },
        { name: "Spanish", flag: "🇪🇸" },
        { name: "EAL", flag: "🇬🇧" }
    ];

    langContainer.innerHTML = languages.map(l => `
        <button onclick="selectLang('${l.name}')"
            style="
                padding: 6px 12px;
                border-radius: 8px;
                transition: all 0.2s ease;
                display: flex;
                align-items: center; gap: 6px; cursor: pointer;
                ${nav.lang === l.name 
                    ? 'background:#8b5cf6; color:white; border:none; box-shadow:0 2px 4px rgba(139, 92, 246, 0.3);' 
                    : 'background:#f8fafc; border:1px solid #e2e8f0; color:#475569;'}
            ">
            <span style="font-family: 'Noto Color Emoji', sans-serif; font-size: 18px;">${l.flag}</span>
            <span style="font-weight: 600; font-size: 13px;">${l.name}</span>
        </button>
    `).join("");
}

async function renderLibrary() {
    const gridContainer = document.getElementById('grid-container');
    if (gridContainer) gridContainer.innerHTML = ''; 

    renderLanguageNavButtons();

    const mainContent = document.getElementById("library-content");

    if (!nav.lang) {
        mainContent.innerHTML = '<p style="color:#64748b;">Please select a language above to view projects.</p>';
        return;
    }

    mainContent.innerHTML = `
        <div id="year-group-area"></div>
        <div id="topic-area" style="min-height: 50px;"></div>
    `;

    if (nav.lang === "EAL") {
        renderTopicsInline();
    } else {
        await renderYearGroupsInline();
    }
}

async function renderYearGroupsInline() {
    const yearArea = document.getElementById("year-group-area");
    const topicArea = document.getElementById("topic-area");
    if (!yearArea || !nav.lang || nav.lang === "EAL") return;

    yearArea.innerHTML = `<p style="color:#64748b;">Loading year groups...</p>`;

    try {
        const snap = await db.collection("builders")
            .where("lang", "==", nav.lang)
            .where("isDeleted", "==", false)
            .get();

        // Collect all year groups that have active builders for the selected language
        const usedYears = new Set(
            snap.docs.map(d => d.data().year).filter(y => y && y !== "EAL")
        );

        // Keep active year groups in master chronological order
        const activeYears = MASTER_YEAR_ORDER.filter(y => usedYears.has(y));
        
        // Append any custom year strings not present in MASTER_YEAR_ORDER
        usedYears.forEach(y => {
            if (!activeYears.includes(y)) activeYears.push(y);
        });

        if (activeYears.length === 0) {
            yearArea.innerHTML = `<p style="color:#64748b;">No active sentence builders found for ${nav.lang}.</p>`;
            if (topicArea) topicArea.innerHTML = '';
            nav.year = null;
            nav.topic = null;
            return;
        }

        // Reset selected year group if it is no longer active
        if (nav.year && !activeYears.includes(nav.year)) {
            nav.year = null;
            nav.topic = null;
        }

        let html = `
            <h3 style="margin-top:0;">Year Group</h3>
            <div style="display:flex; flex-wrap:wrap; gap:10px; margin-bottom:20px;">
        `;

        activeYears.forEach(y => {
            const isActive = (nav.year === y);
            html += `
                <button onclick="selectYear('${y}')"
                    style="padding:10px 15px; border-radius:6px; cursor:pointer; font-weight:600; transition:all 0.2s;
                    ${isActive 
                        ? 'background:#2196f3; color:white; border:none; box-shadow:0 4px 6px rgba(33,150,243,0.3);' 
                        : 'background:white; border:1px solid #e2e8f0; color:#475569;'}">
                    ${y}
                </button>`;
        });

        html += `</div>`;
        yearArea.innerHTML = html;

        if (nav.year) {
            renderTopicsInline();
        } else {
            if (topicArea) topicArea.innerHTML = '<p style="color:#64748b;">Select a year group to view topics.</p>';
        }

    } catch (error) {
        console.error("Year Groups Error:", error);
        yearArea.innerHTML = `<p style="color:#ef4444; font-weight:bold;">Error loading year groups: ${error.message}</p>`;
    }
}

function selectLang(lang) {
    nav.lang = lang;
    nav.topic = null;
    nav.year = (lang === "EAL") ? "EAL" : null;
    showPage('library-page');
    renderLibrary();
}

function selectYear(year) {
    nav.year = year;
    nav.topic = null;
    renderLibrary();
}



async function renderTopicsInline() {
    const topicArea = document.getElementById("topic-area");
    if (!topicArea || !nav.lang) return;

    let query = db.collection("builders")
        .where("lang", "==", nav.lang)
        .where("isDeleted", "==", false);

    if (nav.lang === "EAL") {
        query = query.where("year", "==", "EAL");
    } else if (nav.year) {
        query = query.where("year", "==", nav.year);
    }

    try {
        const snap = await query.get();
        
        const topicList = [...new Set(
            snap.docs.map(d => d.data().topic).filter(t => t && t.trim() !== "")
        )].sort();

        if (nav.topic && !topicList.includes(nav.topic)) {
            nav.topic = null; 
        }

        let html = `
            <div style="display: flex; align-items: center; gap: 15px; margin-top: 20px; margin-bottom: 15px;">
                <h3 style="margin: 0;">Topics</h3>
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px;">
        `;

        if (topicList.length > 0) {
            topicList.forEach(t => {
                const isActive = (nav.topic === t);
                const escaped = t.replace(/'/g, "\\'");
                html += `
                    <button onclick="selectTopic('${escaped}')"
                        style="padding:10px 18px; border-radius:8px; cursor:pointer; font-weight:600; transition:all 0.2s;
                        ${isActive 
                            ? 'background:#4caf50; color:white; border:none; box-shadow:0 4px 6px rgba(76,175,80,0.3);' 
                            : 'background:white; border:1px solid #e2e8f0; color:#475569;'}">
                        ${t}
                    </button>`;
            });
        } else {
            html += `<p style="color:#64748b;">No active topics found for ${nav.lang}.</p>`;
        }

        html += `</div><div id="projects-area"></div>`;
        topicArea.innerHTML = html;

        if (nav.topic) renderProjectsInline();

    } catch (error) {
        console.error("Firestore Error:", error);
        topicArea.innerHTML = `<p style="color:#ef4444; padding: 20px; font-weight:bold;">Error loading topics: ${error.message}</p>`;
    }
}
function selectTopic(topic) {
    nav.topic = topic;
    renderTopicsInline();
}

async function renderProjectsInline() {
    const container = document.getElementById("projects-area");
    if (!container || !nav.topic) return;

    container.innerHTML = `<p style="color:#64748b; padding: 20px;">Loading projects...</p>`;

    try {
        const snap = await db.collection("builders")
            .where("lang", "==", nav.lang)
            .where("topic", "==", nav.topic)
            .where("isDeleted", "==", false)
            .get();

        if (snap.empty) {
            container.innerHTML = `<p style="color:#64748b; padding: 20px;">No active projects in this topic.</p>`;
            return;
        }

        // Sort documents alphabetically by title (with natural number handling for 1-, 2-, 10-)
        const sortedDocs = [...snap.docs].sort((a, b) => {
            const titleA = a.data().title || "Untitled Builder";
            const titleB = b.data().title || "Untitled Builder";
            return titleA.localeCompare(titleB, undefined, { numeric: true, sensitivity: 'base' });
        });

        let html = `<div class="project-grid" style="display: grid; grid-template-columns: repeat(auto-fill, 300px); gap: 20px; padding: 10px;">`;
        
        sortedDocs.forEach(doc => {
            const p = doc.data();
            
            html += `
                <div class="project-card" onclick="loadProject('${doc.id}')" style="cursor:pointer; width:300px; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; padding:15px; border:1px solid #e2e8f0; border-radius:10px; background:white;">
                    <div class="project-left" style="flex:1; overflow:hidden;">
                        <span style="color: var(--accent); font-weight: bold; font-size: 1.1em; white-space:nowrap; text-overflow:ellipsis; display:block; overflow:hidden;">
                            ${p.title || "Untitled Builder"}
                        </span>
                    </div>
                    <div class="project-actions" onclick="event.stopPropagation();" style="display:flex; gap:10px; margin-left:10px;">
                        <span class="icon-btn" title="Duplicate" onclick="duplicateSB('${doc.id}', event)" style="cursor:pointer; font-size:1.2em;">📋</span>
                        <span class="icon-btn delete-btn" title="Delete" onclick="deleteProject('${doc.id}', event)" style="cursor:pointer; font-size:1.2em;">🗑️</span>
                    </div>
                </div>`;
        });
        
        html += `</div>`;
        container.innerHTML = html;

    } catch (error) {
        console.error("Error loading projects:", error);
        container.innerHTML = `<p style="color:red; padding: 20px;">Error loading projects.</p>`;
    }
}
function toggleBinView() {
    showPage('bin-page');
    renderBin();
}

async function renderBin() {
    const container = document.getElementById("bin-container");
    if (!container) return;

    container.innerHTML = `<p style="color:#64748b; padding:20px;">Scanning for deleted files...</p>`;

    try {
        const snap = await db.collection("builders")
            .where("uid", "==", currentUser.uid)
            .where("isDeleted", "==", true)
            .get();

        if (snap.empty) {
            container.innerHTML = `
                <div style="text-align:center; padding:50px; background:white; border-radius:15px; border:2px dashed #cbd5e1;">
                    <p style="color:#64748b; font-size:1.1em;">The bin is empty.</p>
                </div>`;
            return;
        }

        const organized = {};
        snap.forEach(doc => {
            const data = doc.data();
            const lang = data.lang || "Other Language";
            const year = data.year || "No Year Group";
            
            if (!organized[lang]) organized[lang] = {};
            if (!organized[lang][year]) organized[lang][year] = [];
            
            organized[lang][year].push({ id: doc.id, ...data });
        });

        let html = '';
        const sortedLangs = Object.keys(organized).sort();

        for (const lang of sortedLangs) {
            html += `<h2 style="margin-top:40px; color:#1e293b; border-left:5px solid #ef4444; padding-left:15px; background:#fee2e2; padding-top:10px; padding-bottom:10px; border-radius:0 8px 8px 0;">${lang}</h2>`;
            
            const sortedYears = Object.keys(organized[lang]).sort();

            for (const year of sortedYears) {
                html += `
                <div style="margin: 25px 0 10px 15px;">
                    <h4 style="color:#ef4444; font-size:1em; text-transform:uppercase; margin-bottom:15px; letter-spacing: 1px;">📅 ${year}</h4>
                    <div style="display: grid; grid-template-columns: repeat(auto-fill, 300px); gap: 25px;">
                `;

                organized[lang][year].forEach(p => {
                    const date = p.deletedAt ? p.deletedAt.toDate().toLocaleDateString() : 'Recently';
                    
                    html += `
                    <div class="project-card" style="width:300px; box-sizing:border-box; display:flex; align-items:center; justify-content:space-between; padding:15px; border:1px solid #e2e8f0; border-radius:10px; background:white;">
                        <div class="project-left" style="flex:1; overflow:hidden;">
                            <span style="color: #1e293b; font-weight: bold; font-size: 1.1em; white-space:nowrap; text-overflow:ellipsis; display:block; overflow:hidden;" title="${p.title}">
                                ${p.title || "Untitled"}
                            </span>
                            <small style="color: #b91c1c; font-weight: 600; display:block; margin-top:2px;">Topic: ${p.topic || 'General'}</small>
                            <small style="color: #94a3b8; font-size: 0.85em;">Deleted: ${date}</small>
                        </div>
                        <div class="project-actions" onclick="event.stopPropagation();" style="display:flex; gap:12px; margin-left:10px;">
                            <span class="icon-btn" title="Restore" onclick="restoreProject('${p.id}', event)" style="cursor:pointer; font-size:1.3em;">🔄</span>
                            <span class="icon-btn" title="Delete Permanently" onclick="permanentlyDelete('${p.id}', event)" style="cursor:pointer; font-size:1.3em; color:#ef4444;">❌</span>
                        </div>
                    </div>`;
                });

                html += `</div></div>`;
            }
        }
        container.innerHTML = html;

    } catch (e) {
        console.error("Bin Error:", e);
        container.innerHTML = `<p style="color:red; padding:20px;">Error loading bin content: ${e.message}</p>`;
    }
}

async function cleanupOldDeletedFiles() {
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const oldDocs = await db.collection("builders")
            .where("isDeleted", "==", true)
            .where("deletedAt", "<=", thirtyDaysAgo)
            .get();

        const batch = db.batch();
        oldDocs.forEach(doc => {
            batch.delete(doc.ref);
        });
        
        await batch.commit();
    } catch (e) {
        console.warn("Cleanup error (ignored):", e);
    }
}

async function updateMeta() {
    const langEl = document.getElementById("meta-lang");
    const yearEl = document.getElementById("meta-year");
    const topicSelect = document.getElementById("meta-topic-select");
    const topicNew = document.getElementById("meta-topic-new");

    meta.lang = langEl.value;
    meta.year = yearEl.value;

    meta.topic = topicSelect.value === "__new__"
        ? topicNew.value
        : topicSelect.value;

    if (meta.lang === "EAL") {
        yearEl.value = "EAL";
        yearEl.disabled = true;
    } else {
        yearEl.disabled = false;
    }
}

async function loadTopicsDropdown() {
    const lang = document.getElementById("meta-lang").value;
    const year = document.getElementById("meta-year").value;

    let query = db.collection("builders").where("lang", "==", lang);

    if (lang !== "EAL") {
        query = query.where("year", "==", year);
    }

    const snap = await query.get();

    const topics = [...new Set(
        snap.docs.map(d => d.data().topic).filter(Boolean)
    )].sort();

    const select = document.getElementById("meta-topic-select");

    select.innerHTML = `
        ${topics.map(t => `<option value="${t}">${t}</option>`).join("")}
        <option value="__new__">➕ Create new topic</option>
    `;
}

function handleTopicSelect() {
    const select = document.getElementById("meta-topic-select");
    const input = document.getElementById("meta-topic-new");

    if (select.value === "__new__") {
        input.style.display = "inline-block";
        input.focus();
    } else {
        input.style.display = "none";
    }

    updateMeta();
}

/* =========================
   CLOUD
========================= */
async function saveToCloud(isAutosave = false) {
    if (!currentUser) return;

    const manualStatus = document.getElementById('manual-save-status');
    const autoStatus = document.getElementById('autosave-indicator');

    try {
        const langVal = document.getElementById('meta-lang').value;
        const yearVal =
            (langVal === "EAL")
                ? "EAL"
                : document.getElementById('meta-year').value;

        const topicSelect = document.getElementById("meta-topic-select");
        const topicNew = document.getElementById("meta-topic-new");
        const topicValue =
            (topicSelect.value === "__new__")
                ? topicNew.value
                : topicSelect.value;

        if (!topicValue) {
            if (!isAutosave) {
                alert("Please select or enter a topic before saving.");
            }
            return;
        }

// Locate saveToCloud(isAutosave = false) and update the data object:
const data = {
    uid: currentUser.uid,
    title: document.getElementById('builder-title').value || "Untitled",
    lang: langVal,
    year: yearVal,
    topic: topicValue,
    grid: JSON.stringify(grid),
    disabledRoutes: disabledRoutes,
    excludedCombos: excludedCombos,
    requiredCombos: requiredCombos,
    excludedPairs: excludedPairs,
    transformationsText: document.getElementById('transformations-input')?.value || transformationsText || "", // <--- ADD THIS LINE
    isDeleted: false,
    updated: firebase.firestore.FieldValue.serverTimestamp()
};

        if (currentDocId) {
            await db.collection("builders").doc(currentDocId).update(data);
        } else {
            const doc = await db.collection("builders").add(data);
            currentDocId = doc.id;
        }

        const time = new Date().toLocaleTimeString([], {
            hour: '2-digit',
            minute: '2-digit'
        });

        if (isAutosave) {
            if (autoStatus) autoStatus.innerText = `Autosaved at ${time}`;
        } else {
            if (manualStatus) {
                manualStatus.style.color = "";
                manualStatus.innerText = "Saved!";
                setTimeout(() => { manualStatus.innerText = ""; }, 5000);
            }
        }

    } catch (e) {
        console.error("Critical Save Error:", e);

        if (!isAutosave && manualStatus) {
            manualStatus.innerText = "Error Saving!";
            manualStatus.style.color = "red";
        }
    }
}

async function loadProject(id) {
    const doc = await db.collection("builders").doc(id).get();
    const d = doc.data();

    currentDocId = id;
    grid = JSON.parse(d.grid);

    // Load routes/combos/transformations state
    disabledRoutes = Array.isArray(d.disabledRoutes) ? d.disabledRoutes : [];
    excludedCombos = Array.isArray(d.excludedCombos) ? d.excludedCombos : [];
    requiredCombos = Array.isArray(d.requiredCombos) ? d.requiredCombos : [];
    
    // <--- ADD THESE LINES:
    transformationsText = d.transformationsText || d.transformations || "";
    const transInput = document.getElementById('transformations-input');
    if (transInput) {
        transInput.value = transformationsText;
    }

    // Reset legacy visual pair outlines on project load
    excludedPairs = []; 
    excludeSelection = [];

    // Sync metadata
    meta = {
        lang: d.lang,
        year: d.year,
        topic: d.topic
    };

    // Sync global navigation state so returning via '← Back' preserves folder view
    if (typeof nav !== 'undefined') {
        nav.lang = d.lang;
        nav.year = d.year;
        nav.topic = d.topic;
    }

    // Populate editor header inputs
    document.getElementById('meta-lang').value = d.lang;
    document.getElementById('meta-year').value = d.year;
    document.getElementById('builder-title').value = d.title;

    await loadTopicsDropdown();

    const select = document.getElementById("meta-topic-select");
    const input = document.getElementById("meta-topic-new");

    if ([...select.options].some(o => o.value === d.topic)) {
        select.value = d.topic;
        input.style.display = "none";
    } else {
        select.value = "__new__";
        input.style.display = "inline-block";
        input.value = d.topic;
    }

    handleTopicSelect();

    // Reset undo/redo history stack for the newly loaded project
    history = [JSON.stringify({
        grid: grid,
        excludedPairs: excludedPairs
    })];
    historyStep = 0;

    showPage("editor-page");
    render(false);
}

async function deleteProject(id) {
    if(!confirm("Move this project to the Bin?")) return;
    
    try {
        await db.collection("builders").doc(id).update({
            isDeleted: true,
            deletedAt: firebase.firestore.Timestamp.now()
        });
        renderLibrary(); 
    } catch (e) {
        console.error("Delete failed:", e);
    }
}

async function restoreProject(id, event) {
    if (event) event.stopPropagation();
    try {
        await db.collection("builders").doc(id).update({
            isDeleted: false,
            deletedAt: null
        });
        alert("Project restored to library!");
        renderBin();
    } catch (e) {
        console.error(e);
    }
}

async function permanentlyDelete(id, event) {
    if (event) event.stopPropagation();
    if (!confirm("This will delete the file forever. Are you sure?")) return;
    
    try {
        await db.collection("builders").doc(id).delete();
        renderBin();
    } catch (e) {
        console.error(e);
    }
}
/* =========================
   DELETE PROJECT FROM EDITOR
========================= */
async function deleteCurrentProjectFromEditor() {
    if (!currentDocId) {
        if (confirm("This builder has not been saved to the cloud yet. Discard and return to Library?")) {
            showPage('library-page');
            renderLibrary();
        }
        return;
    }

    if (!confirm("Move this sentence builder to the Bin?")) return;

    try {
        await db.collection("builders").doc(currentDocId).update({
            isDeleted: true,
            deletedAt: firebase.firestore.Timestamp.now()
        });
        
        currentDocId = null;
        showPage('library-page');
        renderLibrary();
    } catch (e) {
        console.error("Delete failed:", e);
        alert("Error moving builder to bin: " + e.message);
    }
}
/* =========================
   GRID CORE
========================= */
function c() {
    return { 
        items: [{t: "", tr: ""}], 
        clr: "#ffffff", 
        excluded: false, 
        sel: false, 
        split: false, 
        hidden: false, 
        rS: 1, 
        cS: 1 
    };
}

function pushHistory() {
    history = history.slice(0, historyStep + 1);

    history.push(JSON.stringify({
        grid: grid,
        excludedPairs: excludedPairs
    }));

    historyStep = history.length - 1;
}

function undo() {
    if (historyStep > 0) {
        historyStep--;

        const state = JSON.parse(history[historyStep]);

        if (Array.isArray(state)) {
            grid = state;
            excludedPairs = [];
        } else {
            grid = state.grid;
            excludedPairs = state.excludedPairs || [];
        }

        excludeSelection = [];
        render(false);
    }
}

function redo() {
    if (historyStep < history.length - 1) {
        historyStep++;

        const state = JSON.parse(history[historyStep]);

        if (Array.isArray(state)) {
            grid = state;
            excludedPairs = [];
        } else {
            grid = state.grid;
            excludedPairs = state.excludedPairs || [];
        }

        excludeSelection = [];
        render(false);
    }
}

function sanitizeGrid() {
    if (!grid || !grid.length) return;
    const numRows = grid.length;
    const numCols = Math.max(...grid.map(r => r.length), 1);

    // 1. Pad missing cells in any row so all rows have equal lengths
    for (let r = 0; r < numRows; r++) {
        if (!grid[r]) grid[r] = [];
        while (grid[r].length < numCols) {
            grid[r].push({ items: [{ t: "", tr: "" }], color: "#ffffff", split: false, rS: 1, cS: 1, hidden: false, sel: false });
        }
    }

    // 2. Track actual coverage to fix orphaned hidden cells
    const covered = Array.from({ length: numRows }, () => new Array(numCols).fill(false));

    for (let r = 0; r < numRows; r++) {
        for (let c = 0; c < numCols; c++) {
            const cell = grid[r][c];
            
            // Normalize span values
            if (!cell.rS || cell.rS < 1) cell.rS = 1;
            if (!cell.cS || cell.cS < 1) cell.cS = 1;
            if (r + cell.rS > numRows) cell.rS = numRows - r;
            if (c + cell.cS > numCols) cell.cS = numCols - c;

            if (covered[r][c]) {
                // Cell is genuinely covered by a parent span
                cell.hidden = true;
                cell.rS = 1;
                cell.cS = 1;
            } else {
                // Cell is NOT covered by anything above/left -> MUST BE VISIBLE
                cell.hidden = false;

                // Mark downstream cells covered by this cell's span
                if (cell.rS > 1 || cell.cS > 1) {
                    for (let i = r; i < r + cell.rS; i++) {
                        for (let j = c; j < c + cell.cS; j++) {
                            if (i === r && j === c) continue;
                            if (i < numRows && j < numCols) {
                                covered[i][j] = true;
                            }
                        }
                    }
                }
            }
        }
    }
}

function render(doSave = true) {
    sanitizeGrid();
    if (doSave) pushHistory();

    const container = document.getElementById('grid-container');
    container.innerHTML = '';
    
    if (!grid || !grid.length || !grid[0]) return;
    
    const cols = Math.max(...grid.map(r => r.length), 1);
    const rows = grid.length;
    container.style.gridTemplateColumns = `repeat(${cols}, fit-content(900px))`;

    const pairColors = ['#e74c3c', '#9b59b6', '#3498db', '#e67e22', '#2ecc71', '#f1c40f'];

    // Safe visibility check preventing undefined errors
    const firstVisibleColInRow = new Array(rows).fill(-1);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r]?.[c] && !grid[r][c].hidden) {
                firstVisibleColInRow[r] = c;
                break;
            }
        }
    }

// Inside render():
const firstVisibleRowInCol = new Array(cols).fill(-1);
for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
        if (grid[r]?.[c] && !grid[r][c].hidden) {
            firstVisibleRowInCol[c] = r;
            break;
        }
    }
    // Fallback: if no visible cell in col, force index 0 so delete button renders
    if (firstVisibleRowInCol[c] === -1) firstVisibleRowInCol[c] = 0;
}

    const escapeAttr = (str) => (str || '').replace(/"/g, '&quot;');

    grid.forEach((row, r) => {
        row.forEach((cell, cIdx) => {
            if (!cell || cell.hidden) return;

            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell';

            if (cell.compact) cellDiv.classList.add('is-compact');
            cellDiv.ondblclick = (e) => { e.stopPropagation(); handleCellDblClick(r, cIdx, e); };
            cellDiv.style.outline = "none";
            cellDiv.style.border = "1px solid #ccc";

            const pairIndex = (typeof excludedPairs !== 'undefined' && Array.isArray(excludedPairs)) 
                ? excludedPairs.findIndex(pair => (pair.a.r === r && pair.a.c === cIdx) || (pair.b.r === r && pair.b.c === cIdx))
                : -1;

            if (pairIndex !== -1) {
                const borderCol = pairColors[pairIndex % pairColors.length];
                cellDiv.style.border = "none"; 
                cellDiv.style.outline = `12px double ${borderCol}`;
                cellDiv.style.outlineOffset = "-12px"; 
                cellDiv.style.zIndex = "10";
                cellDiv.classList.add('exclude-linked');
            }

            if (typeof excludeSelection !== 'undefined' && excludeSelection.some(p => p.r === r && p.c === cIdx)) {
                cellDiv.style.outline = "5px dashed #000";
                cellDiv.style.outlineOffset = "-5px";
                cellDiv.style.zIndex = "11";
            }

            cellDiv.onclick = () => {
                if (typeof currentMode !== 'undefined' && currentMode === 'exclude') {
                    if (typeof handleExcludeClick === 'function') handleExcludeClick(r, cIdx);
                }
            };

            cellDiv.style.gridRow = `${r + 1} / span ${cell.rS || 1}`;
            cellDiv.style.gridColumn = `${cIdx + 1} / span ${cell.cS || 1}`;
            cellDiv.style.backgroundColor = cell.color || "#ffffff";

            const items = cell.items || [];
            const listHTML = items.map((item, i) => `
                <div class="vocab-item">
                    <input type="text" class="target-input" placeholder="Target" 
                        data-pos="${r}-${cIdx}-${i}-t"
                        onkeydown="handleKey(event, ${r}, ${cIdx}, ${i}, 't')" 
                        oninput="updateVal(${r},${cIdx},${i},'t',this.value); syncSize(this)" value="${escapeAttr(item.t)}">
                    <div class="bracket-wrapper"><span>(</span>
                    <input type="text" class="translation-input" placeholder="Translation" 
                        data-pos="${r}-${cIdx}-${i}-tr"
                        onkeydown="handleKey(event, ${r}, ${cIdx}, ${i}, 'tr')" 
                        oninput="updateVal(${r},${cIdx},${i},'tr',this.value); syncSize(this)" value="${escapeAttr(item.tr)}">
                    <span>)</span></div>
                </div>
            `).join('');

            const swatchHTML = (typeof allColors !== 'undefined' && Array.isArray(allColors)) 
                ? allColors.map(p => `<div class="swatch" style="background:${p}" onclick="setClr(${r},${cIdx},'${p}')"></div>`).join('') 
                : '';

            cellDiv.innerHTML = `
                <div class="top-ui no-export">
                    <input type="checkbox" class="cell-checkbox" ${cell.sel ? 'checked' : ''} 
                        onchange="grid[${r}][${cIdx}].sel=this.checked">
                </div>
                <div class="vocab-list ${cell.split ? 'split' : ''}">${listHTML}</div>
                <div class="bottom-ui no-export">
                    <span class="icon-btn" onclick="toggleCellSplit(${r},${cIdx})">Ξ</span>
                    <span class="icon-btn" onclick="showColors(event, ${r}, ${cIdx})">🎨</span>
                    <div class="color-picker" id="cp-${r}-${cIdx}">${swatchHTML}</div>
                </div>
            `;

            if (typeof currentMode !== 'undefined') {
    if (currentMode === 'add-col' && r === firstVisibleRowInCol[cIdx]) {
        addIcon(cellDiv, 'btn-plus', 'left', '+', () => insertCol(cIdx));
        if (cIdx === cols - 1) addIcon(cellDiv, 'btn-plus', 'right', '+', () => insertCol(cols));
    }
    if (currentMode === 'del-col' && r === firstVisibleRowInCol[cIdx]) addIcon(cellDiv, 'btn-minus', 'top-center', '×', () => deleteCol(cIdx));
    if (currentMode === 'add-row' && cIdx === firstVisibleColInRow[r]) {
        addIcon(cellDiv, 'btn-plus', 'top-edge', '+', () => insertRow(r));
        if (r === grid.length - 1) addIcon(cellDiv, 'btn-plus', 'bottom-edge', '+', () => insertRow(grid.length));
    }
    if (currentMode === 'del-row' && cIdx === firstVisibleColInRow[r]) addIcon(cellDiv, 'btn-minus', 'left-edge', '×', () => deleteRow(r));
}

            container.appendChild(cellDiv);
            cellDiv.querySelectorAll('input').forEach(syncSize);
        });
    });
}
function handleCellDblClick(r, c, event) {
    const cell = grid[r][c]; 

    // 1. Check if the underlying cell data model contains any text
    const hasDataText = cell.items && cell.items.some(item => 
        (item.t && item.t.trim().length > 0) || 
        (item.tr && item.tr.trim().length > 0)
    );

    // 2. If the user clicked inside an input box, check its active typed value
    const isInput = event.target && event.target.tagName === 'INPUT';
    const inputValue = isInput ? (event.target.value || '').trim() : '';

    // If text exists anywhere in the cell or active input, allow default text selection
    if (hasDataText || inputValue.length > 0) {
        return; 
    }

    // Cell is completely empty -> toggle compact bridge mode
    cell.compact = !cell.compact;
    render();
    if (typeof saveToCloud === 'function') saveToCloud(true);
}
function setClr(r, c, color) {
    grid[r][c].color = color;
    document.querySelectorAll('.color-picker').forEach(p => p.style.display = 'none');
    render();
}

function toggleCellSplit(r, c) {
    grid[r][c].split = !grid[r][c].split;
    render();
}

async function duplicateSB(id, e) {
    if (e) e.stopPropagation();

    try {
        const doc = await db.collection("builders").doc(id).get();
        if (!doc.exists) return;

        const original = doc.data();
        const newTitle = prompt(
            "Enter name for the duplicate:",
            "Copy of " + original.title
        );

        if (!newTitle) return;

        const duplicateData = {
            ...original,
            title: newTitle,
            updated: firebase.firestore.FieldValue.serverTimestamp(),
            excludedPairs: JSON.parse(JSON.stringify(original.excludedPairs || []))
        };

        await db.collection("builders").add(duplicateData);
        renderProjectsInline();

    } catch (err) {
        console.error("Duplication failed:", err);
        alert("Duplication failed: " + err.message);
    }
}
/* =========================
    COPY, PASTE & CUT
========================= */
document.addEventListener('copy', (e) => {
    const active = document.activeElement;
    if (active && (active.classList.contains('target-input') || active.classList.contains('translation-input'))) {
        if (active.selectionStart !== active.selectionEnd) {
            return; 
        }

        const posParts = active.dataset.pos.split('-');
        const r = parseInt(posParts[0]);
        const cIdx = parseInt(posParts[1]);
        
        const cellData = grid[r][cIdx].items;
        const textToCopy = cellData.map(item => `${item.t}|${item.tr}`).join('\n');
        
        e.clipboardData.setData('text/plain', textToCopy);
        e.preventDefault();
        
        const cellEl = active.closest('.cell');
        if (cellEl) cellEl.classList.remove('visual-selected');
    }
});

document.addEventListener('paste', (e) => {
    const active = document.activeElement;
    if (active && (active.classList.contains('target-input') || active.classList.contains('translation-input'))) {
        
        const pastedData = e.clipboardData.getData('text/plain').replace(/\r/g, '');
        const lines = pastedData.split('\n').filter(l => l.trim() !== "");

        if (pastedData.includes('|') || lines.length > 1) {
            e.preventDefault();
            
            const posParts = active.dataset.pos.split('-');
            const r = parseInt(posParts[0]);
            const cIdx = parseInt(posParts[1]);
            const itemIdx = parseInt(posParts[2]);
            const type = posParts[3];

            const cellEl = active.closest('.cell');
            const isFullCellSelected = cellEl && cellEl.classList.contains('visual-selected');

            const newItems = lines.map(line => {
                const pts = line.split('|');
                return pts.length > 1 
                    ? { t: pts[0].trim(), tr: pts[1].trim() }
                    : (type === 'tr' ? { t: "", tr: line.trim() } : { t: line.trim(), tr: "" });
            });

            if (isFullCellSelected) {
                grid[r][cIdx].items = newItems;
                cellEl.classList.remove('visual-selected');
            } else {
                if (lines.length === 1 && !pastedData.includes('|')) {
                    grid[r][cIdx].items[itemIdx][type] = lines[0];
                } else {
                    grid[r][cIdx].items.splice(itemIdx + 1, 0, ...newItems);
                }
            }

            render();
            saveToCloud(true);

            setTimeout(() => {
                const first = document.querySelector(`input[data-pos="${r}-${cIdx}-0-t"]`);
                if (first) first.focus();
            }, 10);
        } 
    }
});

document.addEventListener('cut', (e) => {
    const active = document.activeElement;
    
    if (active && (active.classList.contains('target-input') || active.classList.contains('translation-input'))) {
        const cellEl = active.closest('.cell');
        
        if (cellEl && cellEl.classList.contains('visual-selected')) {
            const posParts = active.dataset.pos.split('-');
            const r = parseInt(posParts[0]);
            const cIdx = parseInt(posParts[1]);
            
            const cellData = grid[r][cIdx].items;
            const textToCopy = cellData.map(item => `${item.t}|${item.tr}`).join('\n');
            e.clipboardData.setData('text/plain', textToCopy);
            e.preventDefault();

            grid[r][cIdx].items = [{t: "", tr: ""}];
            
            cellEl.classList.remove('visual-selected');
            render();
            
            setTimeout(() => {
                const firstInput = document.querySelector(`input[data-pos="${r}-${cIdx}-0-t"]`);
                if (firstInput) firstInput.focus();
            }, 10);
        }
    }
});
function updateVal(r, cIdx, i, f, v) { 
    grid[r][cIdx].items[i][f] = v; 
    clearTimeout(typingTimer); 
    typingTimer = setTimeout(pushHistory, 1000); 
}

function syncSize(el) { 
    if (el.value === "") {
        el.style.width = el.classList.contains('target-input') ? "120px" : "90px"; 
    } else {
        el.style.width = '0px'; 
        el.style.width = (el.scrollWidth + 5) + 'px'; 
    } 
}

function toggleAllActivities(master) {
    document.querySelectorAll('#activity-list input').forEach(cb => cb.checked = master.checked);
    renderPerActivitySentenceBoxes();
}
/* =========================
   BALANCED SENTENCE SELECTION HELPERS
========================= */
/* =========================
   UNBIASED FISHER-YATES SHUFFLE & BALANCED SELECTION
========================= */
function shuffleArray(array) {
    if (!array || !Array.isArray(array)) return [];
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function getBalancedSelection(pool, limit) {
    if (!pool || pool.length === 0 || limit <= 0) return [];

    // Group sentences by originRow (starting row in the sentence builder)
    const rowBuckets = {};
    pool.forEach(s => {
        const r = (s.originRow !== undefined && s.originRow !== null) 
            ? s.originRow 
            : (s.parts && s.parts[0] && s.parts[0].r !== undefined ? s.parts[0].r : 0);
        if (!rowBuckets[r]) rowBuckets[r] = [];
        rowBuckets[r].push(s);
    });

    // Shuffle sentences within each row and shuffle row bucket order
    const bucketList = shuffleArray(
        Object.keys(rowBuckets).map(r => ({
            rowIndex: parseInt(r, 10),
            sentences: shuffleArray(rowBuckets[r])
        }))
    );

    const selection = [];
    let bucketPointer = 0;

    while (selection.length < limit) {
        const activeBuckets = bucketList.filter(b => b.sentences.length > 0);
        if (activeBuckets.length === 0) break;

        const currentBucket = bucketList[bucketPointer % bucketList.length];
        if (currentBucket.sentences.length > 0) {
            selection.push(currentBucket.sentences.shift());
        }
        bucketPointer++;
    }

    return selection;
}
function handleKey(e, r, cIdx, i, type) {
    const cellEl = e.target.closest('.cell');
    const isFullCellSelected = cellEl && cellEl.classList.contains('visual-selected');

    // Handle Delete or Backspace when the full cell is selected with Ctrl+A
    if (isFullCellSelected && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        grid[r][cIdx].items = [{t: "", tr: ""}];
        cellEl.classList.remove('visual-selected');
        render();
        saveToCloud(true);
        setTimeout(() => {
            const firstInput = document.querySelector(`input[data-pos="${r}-${cIdx}-0-t"]`);
            if (firstInput) firstInput.focus();
        }, 10);
        return;
    }

    if (e.key === 'Enter') {
        e.preventDefault(); 
        grid[r][cIdx].items.splice(i + 1, 0, {t: "", tr: ""}); 
        render();
        setTimeout(() => {
            const nextInput = document.querySelector(`input[data-pos="${r}-${cIdx}-${i+1}-t"]`);
            if (nextInput) nextInput.focus();
        }, 10);
    }
    
    if (e.key === 'Backspace' && e.target.value === "" && grid[r][cIdx].items.length > 1) {
        e.preventDefault(); 
        grid[r][cIdx].items.splice(i, 1); 
        render();
        setTimeout(() => {
            const prevInput = document.querySelector(`input[data-pos="${r}-${cIdx}-${Math.max(0, i-1)}-${type}"]`);
            if (prevInput) prevInput.focus();
        }, 10);
    }

    // Intercept Ctrl+A / Cmd+A to select the whole cell container
    if ((e.ctrlKey || e.metaKey) && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        
        if (cellEl) {
            cellEl.classList.add('visual-selected');

            const removeHighlight = (ev) => {
                // Do not remove highlight during key combinations (Ctrl/Cmd) or Delete/Backspace
                if (ev.type === 'keydown' && (ev.ctrlKey || ev.metaKey || ev.key === 'Delete' || ev.key === 'Backspace')) {
                    return;
                }
                cellEl.classList.remove('visual-selected');
                window.removeEventListener('mousedown', removeHighlight);
                window.removeEventListener('keydown', removeHighlight);
            };
            
            setTimeout(() => {
                window.addEventListener('mousedown', removeHighlight);
                window.addEventListener('keydown', removeHighlight);
            }, 10);
        }
    }
}

function closeModals() { 
    document.body.style.overflow = ''; // Restores standard browser scrolling
    document.querySelectorAll('.modal').forEach(m => m.style.display='none'); 
    document.getElementById('overlay').style.display='none'; 
}

async function createNewProject() {
    try {
        currentDocId = null;

        const modalLang = document.getElementById('new-lang')?.value || "French";
        const modalYear = document.getElementById('new-year')?.value || "Year 9";
        const modalTopic = document.getElementById('new-topic')?.value || "New Topic";

        meta = {
            lang: modalLang,
            year: modalLang === "EAL" ? "EAL" : modalYear,
            topic: modalTopic
        };

        document.getElementById('builder-title').value = "Untitled Builder";

        grid = [[c(), c(), c()], [c(), c(), c()]];
        excludedPairs = [];
        excludeSelection = [];

        // Reset routes, combos, and transformations state for new builder
        disabledRoutes = [];
        excludedCombos = [];
        requiredCombos = [];
        transformationsText = "";
        const transInput = document.getElementById('transformations-input');
        if (transInput) transInput.value = "";

        history = [JSON.stringify({
            grid: grid,
            excludedPairs: excludedPairs
        })];
        historyStep = 0;

        closeModals();
        showPage('editor-page');

        document.getElementById('meta-lang').value = meta.lang;
        document.getElementById('meta-year').value = meta.year;

        await loadTopicsDropdown();

        const select = document.getElementById("meta-topic-select");
        const input = document.getElementById("meta-topic-new");

        select.value = "__new__";
        input.style.display = "inline-block";
        input.value = modalTopic;

        await saveToCloud(true);
        render(false);

    } catch (err) {
        console.error("CREATE FAILED:", err);
        alert("Create failed: " + err.message);
    }
}

async function quickNewBuilder() {
    if (!confirm("Start a new builder? Any unsaved changes on this one will be lost.")) {
        return;
    }

    const newTitle = prompt("Enter a title for the new Builder:", "Untitled Builder");
    if (!newTitle) return;

    currentDocId = null;
    grid = [[c(), c(), c()], [c(), c(), c()]];

    excludedPairs = [];
    excludeSelection = [];

    // Reset routes, combos, and transformations state for new builder
    disabledRoutes = [];
    excludedCombos = [];
    requiredCombos = [];
    transformationsText = "";
    const transInput = document.getElementById('transformations-input');
    if (transInput) transInput.value = "";

    history = [JSON.stringify({
        grid: grid,
        excludedPairs: excludedPairs
    })];
    historyStep = 0;

    document.getElementById('builder-title').value = newTitle;
    await saveToCloud(true);
    render(false);
}

function showColors(e, r, c) { 
    e.stopPropagation(); 
    document.querySelectorAll('.color-picker').forEach(p => p.style.display = 'none'); 
    document.getElementById(`cp-${r}-${c}`).style.display = 'grid'; 
}

function mergeSelected() {
    let sel = [];
    grid.forEach((row, r) => row.forEach((cell, cIdx) => {
        if(cell.sel) sel.push({r, c: cIdx});
    }));

    if(sel.length < 2) return;

    let root = sel[0];
    let allItems = [];
    let maxR = 0, maxC = 0;

    sel.forEach(p => {
        const cell = grid[p.r][p.c];
        allItems = [...allItems, ...cell.items.filter(it => it.t || it.tr)];
        maxR = Math.max(maxR, p.r + (cell.rS || 1));
        maxC = Math.max(maxC, p.c + (cell.cS || 1));
    });

    grid[root.r][root.c].items = allItems.length ? allItems : [{t:"", tr:""}];
    grid[root.r][root.c].rS = maxR - root.r;
    grid[root.r][root.c].cS = maxC - root.c;
    grid[root.r][root.c].sel = false;

    for(let r = root.r; r < maxR; r++) {
        for(let c = root.c; c < maxC; c++) {
            if(r === root.r && c === root.c) continue;
            grid[r][c].hidden = true;
            grid[r][c].sel = false;
        }
    }

    render();
    saveToCloud(true);
}

function splitSelected() {
    grid.forEach((row, r) => row.forEach((cell, cIdx) => {
        if (cell.sel) {
            const rs = cell.rS || 1; 
            const cs = cell.cS || 1;
            for (let i = r; i < r + rs; i++) {
                for (let j = cIdx; j < cIdx + cs; j++) {
                    if (grid[i] && grid[i][j]) {
                        grid[i][j].hidden = false; 
                        grid[i][j].rS = 1; 
                        grid[i][j].cS = 1; 
                        grid[i][j].sel = false;
                        if (i !== r || j !== cIdx) { 
                            grid[i][j].items = [{t: "", tr: ""}]; 
                            grid[i][j].color = "#ffffff"; 
                        }
                    }
                }
            }
        }
        grid[r][cIdx].sel = false;
    }));

    render();
    saveToCloud(true);
}

function initMetaListeners() {
    const lang = document.getElementById("meta-lang");
    const year = document.getElementById("meta-year");

    if (!lang || !year) return;

    lang.addEventListener("change", async () => {
        await loadTopicsDropdown();
        handleTopicSelect();
    });

    year.addEventListener("change", async () => {
        await loadTopicsDropdown();
        handleTopicSelect();
    });
}

async function exportPDF() {
    try {
        const title = document.getElementById('builder-title').value || "Sentence Builder";
        const { jsPDF } = window.jspdf;

        const doc = new jsPDF('l', 'mm', 'a4');
        const margin = 15;
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        const availableWidth = pageWidth - (margin * 2);
        
        const fontSize = 9;
        const lineSpacing = 3.6;
        const itemGap = 1.5;
        const cellPaddingV = 4;
        const BRIDGE_WEIGHT = 5;

        doc.setFont("helvetica", "normal").setFontSize(fontSize);

        const splitText = (text, width) => doc.splitTextToSize(String(text || "").replaceAll("-", "- ").replaceAll("/", "/ "), width, { lineBreak: false });
        
        const shouldStackText = (tl, tr, effW) => {
            const wTl = doc.getTextWidth(tl || "");
            const wTr = tr ? doc.getTextWidth(` (${tr})`) : 0;
            return (wTl + wTr + 1.5 > effW * 0.9) || (tl || "").length > 24 || (tr || "").length > 28;
        };

        const colCount = grid[0].length;
        let isBridge = new Array(colCount).fill(true);
        let colWeights = new Array(colCount).fill(0);

        grid.forEach(row => {
            row.forEach((cell, cIdx) => {
                const hasText = cell.items && cell.items.some(it => it.t && it.t.trim() !== "");
                if (hasText && !cell.hidden) isBridge[cIdx] = false;
            });
        });

        grid.forEach(row => {
            row.forEach((cell, cIdx) => {
                if (cell.hidden || isBridge[cIdx]) return;
                let cellMax = 0;
                (cell.items || []).forEach(it => {
                    let len = (it.t || "").length + ((it.tr || "").length > 18 ? 3 : 0);
                    if (cell.split) len *= 0.72;
                    if (len > cellMax) cellMax = len;
                });
                const weight = cellMax / (cell.cS || 1);
                if (weight > colWeights[cIdx]) colWeights[cIdx] = weight;
            });
        });

       const rawTotalWeight = colWeights.reduce((acc, w, idx) => {
            if (grid.every(r => r[idx].hidden)) return acc;
            return acc + (isBridge[idx] ? BRIDGE_WEIGHT : Math.max(w, 12));
        }, 0);
        const totalWeight = rawTotalWeight > 0 ? rawTotalWeight : 1;

        const colWidths = colWeights.map((w, idx) => {
            if (grid.every(r => r[idx].hidden)) return 0;
            const weight = isBridge[idx] ? BRIDGE_WEIGHT : Math.max(w, 12);
            return (weight / totalWeight) * availableWidth;
        });

        let rowHeights = new Array(grid.length).fill(10);
        grid.forEach((row, rIdx) => {
            row.forEach((cell, cIdx) => {
                if (cell.hidden) return;
                const rs = cell.rS || 1;
                let cellW = 0;
                for (let i = 0; i < (cell.cS || 1); i++) cellW += colWidths[cIdx + i];
                const effW = cell.split ? (cellW / 2) - 4 : cellW - 6;

                let contentH_L = cellPaddingV, contentH_R = cellPaddingV;
                (cell.items || []).forEach((it, idx) => {
                    const stack = shouldStackText(it.t, it.tr, effW);
                    let h = stack ? (splitText(it.t, effW).length * lineSpacing) + (it.tr ? splitText(`(${it.tr})`, effW - 2).length * (lineSpacing - 0.3) : 0) : lineSpacing;
                    h += itemGap;
                    if (cell.split && idx % 2 !== 0) contentH_R += h; else contentH_L += h;
                });

                const contentH = cell.split ? Math.max(contentH_L, contentH_R) : contentH_L;
                const hPerLine = (contentH + 2) / rs;
                for (let i = 0; i < rs; i++) {
                    if (rIdx + i < rowHeights.length) {
                        rowHeights[rIdx + i] = Math.max(rowHeights[rIdx + i], hPerLine);
                    }
                }
            });
        });

        doc.setFont("helvetica", "bold").setFontSize(14);
        doc.text(title.toUpperCase(), margin, margin + 5);
        let currentY = margin + 15;

        grid.forEach((row, rIdx) => {
            let blockHeight = rowHeights[rIdx];
            if (currentY + blockHeight > pageHeight - margin) {
                doc.addPage();
                currentY = margin + 10;
                doc.setFont("helvetica", "bold").setFontSize(14).text(title, margin, margin + 5);
            }

            let currentX = margin;
            row.forEach((cell, cIdx) => {
                const w = colWidths[cIdx];
                if (cell.hidden) { currentX += w; return; }

                let cellW = 0; for (let i = 0; i < (cell.cS || 1); i++) cellW += colWidths[cIdx + i];
                let cellH = 0; for (let i = 0; i < (cell.rS || 1); i++) cellH += (rowHeights[rIdx + i] || 0);

                if (cell.color && cell.color !== "#ffffff") {
                    const rgb = hexToRgb(cell.color);
                    if (rgb) doc.setFillColor(rgb.r, rgb.g, rgb.b).rect(currentX, currentY, cellW, cellH, 'F');
                }

                doc.setDrawColor(148, 163, 184).setLineWidth(0.15).rect(currentX, currentY, cellW, cellH);

                const effW = cell.split ? (cellW / 2) - 4 : cellW - 6;
                let tL = 0, tR = 0;
                (cell.items || []).forEach((it, idx) => {
                    const stack = shouldStackText(it.t, it.tr, effW);
                    let h = stack ? (splitText(it.t, effW).length * lineSpacing) + (it.tr ? splitText(`(${it.tr})`, effW - 2).length * (lineSpacing - 0.3) : 0) : lineSpacing;
                    h += itemGap;
                    if (cell.split && idx % 2 !== 0) tR += h; else tL += h;
                });

                let yL = currentY + ((cellH - (cell.split ? Math.max(tL, tR) : tL)) / 2) + 3;
                let yR = yL;

                (cell.items || []).forEach((item, idx) => {
                    const isRight = cell.split && idx % 2 !== 0;
                    const itemX = isRight ? currentX + (cellW / 2) + 1 : currentX + 3;
                    let curY = isRight ? yR : yL;
                    const stack = shouldStackText(item.t, item.tr, effW);

                    doc.setFont("helvetica", "normal").setTextColor(0).setFontSize(fontSize);
                    if (!stack) {
                        doc.text(item.t || "", itemX, curY);
                        if (item.tr) {
                            doc.setFont("helvetica", "italic").setTextColor(41, 128, 185).setFontSize(fontSize - 1);
                            doc.text(` (${item.tr})`, itemX + doc.getTextWidth(item.t || "") + 1.5, curY);
                        }
                        curY += lineSpacing;
                    } else {
                        splitText(item.t, effW).forEach(l => { doc.text(l.trim(), itemX, curY); curY += lineSpacing; });
                        if (item.tr) {
                            doc.setFont("helvetica", "italic").setTextColor(41, 128, 185).setFontSize(fontSize - 1);
                            splitText(`(${item.tr})`, effW - 2).forEach(l => { doc.text(l.trim(), itemX + 2, curY); curY += lineSpacing - 0.4; });
                        }
                    }
                    if (isRight) yR = curY + itemGap; else { yL = curY + itemGap; if (!cell.split) yR = yL; }
                });
                currentX += w;
            });
            currentY += rowHeights[rIdx];
        });

        doc.save(`${title}.pdf`);
    } catch (err) {
        console.error("PDF Error:", err);
    }
}

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
}

/* =========================================================
   ROBUST VOCABULARY ITEM PARSER
   Recombines split multi-line brackets and target/translation pairs
   ========================================================= */
function parseCellVocab(cellItems) {
    if (!cellItems || cellItems.length === 0) {
        return [{ t: "", tr: "" }];
    }

    // Sort items with Y-line tolerance (4px threshold), then left-to-right (x ascending)
    cellItems.sort((a, b) => {
        if (Math.abs(b.y - a.y) <= 4) {
            return a.x - b.x; // Same line: left to right
        }
        return b.y - a.y;     // Different lines: top to bottom
    });

    const rawStrings = cellItems.map(i => i.str.trim()).filter(Boolean);
    
    const mergedStrings = [];
    let buffer = "";

    rawStrings.forEach(str => {
        if (!buffer) {
            buffer = str;
        } else {
            const openCount = (buffer.match(/\(/g) || []).length;
            const closeCount = (buffer.match(/\)/g) || []).length;
            if (openCount > closeCount) {
                buffer += " " + str;
            } else {
                mergedStrings.push(buffer);
                buffer = str;
            }
        }
    });
    if (buffer) mergedStrings.push(buffer);

    const vocab = [];
    let pendingTarget = "";

    const pushPair = (t, tr) => {
        const cleanT = (t || "").trim();
        const cleanTr = (tr || "").replace(/[\(\)]/g, "").trim();
        if (cleanT || cleanTr) {
            vocab.push({ t: cleanT, tr: cleanTr });
        }
    };

    mergedStrings.forEach(str => {
        if (!str) return;

        const inlineMatches = [...str.matchAll(/([^\(\)]+)\s*\(([^)]+)\)/g)];

        if (inlineMatches.length > 0) {
            if (pendingTarget) {
                pushPair(pendingTarget, "");
                pendingTarget = "";
            }
            inlineMatches.forEach(m => pushPair(m[1], m[2]));

            const lastBracketIdx = str.lastIndexOf(')');
            if (lastBracketIdx !== -1 && lastBracketIdx < str.length - 1) {
                const remainder = str.substring(lastBracketIdx + 1).trim();
                if (remainder) pendingTarget = remainder;
            }
        } 
        else if (str.startsWith('(') && str.endsWith(')')) {
            const trText = str.slice(1, -1).trim();
            if (pendingTarget) {
                pushPair(pendingTarget, trText);
                pendingTarget = "";
            } else if (vocab.length > 0 && !vocab[vocab.length - 1].tr) {
                vocab[vocab.length - 1].tr = trText;
            } else {
                pushPair("", trText);
            }
        }
        else {
            if (pendingTarget) {
                pushPair(pendingTarget, "");
            }
            pendingTarget = str;
        }
    });

    if (pendingTarget) {
        pushPair(pendingTarget, "");
    }

    return vocab.length > 0 ? vocab : [{ t: "", tr: "" }];
}
/* =========================================================
   ROBUST VECTOR & BOUNDING-BOX PDF IMPORT ENGINE
   ========================================================= */
async function handleDocxImport(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const arrayBuffer = e.target.result;
            
            // 1. Convert Word Doc to clean HTML via Mammoth
            const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
            const parser = new DOMParser();
            const doc = parser.parseFromString(result.value, 'text/html');
            const table = doc.querySelector('table');

            if (!table) {
                alert("No table found in the uploaded Word document.");
                return;
            }

            const suggestedTitle = file.name.replace(/\.docx$/i, "");
            const trElements = Array.from(table.querySelectorAll('tr'));

            // 2. Build 2D grid matrix tracking rowspans & colspans
            const gridMatrix = [];

            trElements.forEach((tr, rIdx) => {
                if (!gridMatrix[rIdx]) gridMatrix[rIdx] = [];

                const tdElements = Array.from(tr.querySelectorAll('td, th'));
                let colCursor = 0;

                tdElements.forEach(td => {
                    // Advance colCursor to skip slots occupied by rowspans from previous rows
                    while (gridMatrix[rIdx][colCursor] !== undefined) {
                        colCursor++;
                    }

                    const rS = parseInt(td.getAttribute('rowspan') || '1', 10);
                    const cS = parseInt(td.getAttribute('colspan') || '1', 10);

                    // Extract text preserving linebreaks
                    const clone = td.cloneNode(true);
                    clone.querySelectorAll('p, div, br, tr, li').forEach(el => {
                        el.insertAdjacentHTML('afterend', '\n');
                    });

                    const text = clone.textContent || "";
                    const vocabItems = [];
                    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);

                    lines.forEach(line => {
                        const pairRegex = /([^\(\)]+?)\s*\(([^)]*)\)/g;
                        let match;
                        let foundInLine = false;

                        while ((match = pairRegex.exec(line)) !== null) {
                            foundInLine = true;
                            const t = match[1].trim();
                            const tr = match[2] ? match[2].trim() : "";
                            if (t || tr) vocabItems.push({ t, tr });
                        }

                        if (!foundInLine && line.trim()) {
                            vocabItems.push({ t: line.trim(), tr: "" });
                        }
                    });

                    const originCell = {
                        items: vocabItems.length > 0 ? vocabItems : [{ t: "", tr: "" }],
                        color: "#ffffff",
                        split: false,
                        rS: rS,
                        cS: cS,
                        hidden: false,
                        sel: false
                    };

                    // Fill cell position and mark covered spanned positions as hidden
                    for (let r = rIdx; r < rIdx + rS; r++) {
                        if (!gridMatrix[r]) gridMatrix[r] = [];
                        for (let c = colCursor; c < colCursor + cS; c++) {
                            if (r === rIdx && c === colCursor) {
                                gridMatrix[r][c] = originCell;
                            } else {
                                gridMatrix[r][c] = {
                                    items: [{ t: "", tr: "" }],
                                    color: "#ffffff",
                                    split: false,
                                    rS: 1,
                                    cS: 1,
                                    hidden: true,
                                    sel: false
                                };
                            }
                        }
                    }

                    colCursor += cS;
                });
            });

            // 3. Ensure all rows have equal column counts
            const maxCols = Math.max(...gridMatrix.map(r => r.length), 1);
            gridMatrix.forEach(row => {
                while (row.length < maxCols) {
                    row.push({ items: [{ t: "", tr: "" }], color: "#ffffff", split: false, rS: 1, cS: 1, hidden: false, sel: false });
                }
            });

            const finalTitle = prompt("Confirm Project Title:", suggestedTitle);
            if (!finalTitle) return;

            const newDoc = {
                uid: currentUser.uid,
                title: finalTitle,
                lang: meta.lang || "French",
                year: meta.year || "Year 9",
                topic: meta.topic || "Imported",
                grid: JSON.stringify(gridMatrix),
                disabledRoutes: [],
                excludedCombos: [],
                requiredCombos: [],
                excludedPairs: [],
                transformationsText: "",
                updated: firebase.firestore.FieldValue.serverTimestamp(),
                isDeleted: false
            };

            const docRef = await db.collection("builders").add(newDoc);
            alert("Success! Document imported into accurate grid layout.");
            loadProject(docRef.id);

        } catch (err) {
            console.error("Docx Import Error:", err);
            alert("Import failed: " + err.message);
        }
    };

    reader.readAsArrayBuffer(file);
}
/* =========================
    PREVIEW & OPTIONS MENU
========================= */
function openPreview() {
    const sentences = getAssembledSentences();
    const content = sentences.map((s, i) => `<div class="preview-sentence">${i+1}. <b>${s.t}</b> <span class="tr-text">(${s.tr})</span></div>`).join('');
    document.getElementById('preview-content').innerHTML = content || "No content yet.";
    document.getElementById('preview-modal').style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
}

function openActivityMenu() {
    editingAssignmentId = null;
    window.editingSavedSentencesMap = null;
  
    const studentPanel = document.getElementById('student-selector-panel');
    if (studentPanel) studentPanel.classList.add('hidden');
    const arrow = document.getElementById('student-dropdown-arrow');
    if (arrow) arrow.innerText = '▾';

    // Reset classroom course and student selections from scratch
    const courseSelect = document.getElementById('gc-course-select');
    if (courseSelect) courseSelect.innerHTML = '<option value="">-- Choose Course --</option>';
    classroomStudents = [];
    selectedClassroomStudentIds = [];
    studentSelectorCourseId = null;
    
    const summary = document.getElementById('student-selection-summary');
    const list = document.getElementById('student-list');
    if (summary) summary.innerText = "Select a class";
    if (list) list.innerHTML = '';
    
    const assignFields = document.getElementById('classroom-assign-fields');
    if (assignFields) assignFields.style.display = 'none';

    const btn = document.getElementById('gc-publish-btn');
    if (btn) btn.innerText = "📢 Publish Assignment Now";
       
    document.getElementById('gc-due-date').value = "";
    document.getElementById('gc-schedule-date').value = "";

    const currentLang = meta.lang || document.getElementById('meta-lang')?.value || "Target Language";
    
    const listItems = [
        {id:'study', label:'Sentence Table (Reference)'}, 
        {id:'match', label:'Match up'}, 
        {id:'nospaces', label:'No Spaces'}, 
        {id:'jumbled', label:'Unjumble'}, 
        {id:'gap-en', label:'Gap Fill (English)'}, 
        {id:'gap-t', label:`Gap Fill (${currentLang})`}, 
        {id:'vowels', label:'Missing Vowels'}, 
        {id:'cons', label:'Missing Consonants'}, 
        {id:'faulty', label:'Faulty Translation'}, 
        {id:'trans-en', label:'Translate (English)'}, 
        {id:'trans-target', label:`Translate (${currentLang})`}
    ];

    document.getElementById('activity-list').innerHTML = listItems.map(a => `
        <div class="activity-row" style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" value="${a.id}" id="chk-${a.id}" onchange="renderPerActivitySentenceBoxes()">
            <label for="chk-${a.id}" style="cursor:pointer; font-weight:500; font-size: 13px;">${a.label}</label>
        </div>
    `).join('');
    
    renderPerActivitySentenceBoxes();
    document.getElementById('activity-menu').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';
}

function applyTransformations(text, rulesText) {
    if (!text || !rulesText) return text;
    const lines = rulesText.split('\n');

    for (let line of lines) {
        const rawLine = line.replace(/[\r\n]/g, '');
        if (!rawLine.trim() || !rawLine.includes('=')) continue;

        const eqIdx = rawLine.indexOf('=');
        let find = rawLine.substring(0, eqIdx);
        let replace = rawLine.substring(eqIdx + 1);

        // If formatted as "find = replace" with surrounding spaces, strip 1 formatting space from each side
        if (find.endsWith(' ') && replace.startsWith(' ')) {
            find = find.slice(0, -1).trim();
            replace = replace.slice(1);
        } else {
            find = find.trim();
        }

        if (find) {
            const escapeReg = s => s.replace(/[-[\]{}()*+?^$|#\s\\.]/g, '\\$&');

            // 1. Split / Discontinuous rule: word1+word3=replacement
            if (find.includes('+')) {
                const subParts = find.split('+').map(s => s.trim());
                if (subParts.length === 2 && subParts[0] && subParts[1]) {
                    const [w1, w3] = subParts;
                    let p1 = escapeReg(w1);
                    let p3 = escapeReg(w3);

                    if (/^[\w\u00C0-\u024F]/.test(w1)) p1 = '(?<![a-zA-Z0-9\u00C0-\u024F])' + p1;
                    if (/[\w\u00C0-\u024F]$/.test(w1)) p1 = p1 + '(?![a-zA-Z0-9\u00C0-\u024F])';

                    if (/^[\w\u00C0-\u024F]/.test(w3)) p3 = '(?<![a-zA-Z0-9\u00C0-\u024F])' + p3;
                    if (/[\w\u00C0-\u024F]$/.test(w3)) p3 = p3 + '(?![a-zA-Z0-9\u00C0-\u024F])';

                    const regex = new RegExp(`${p1}\\s+(.+?)\\s+${p3}`, 'gi');
                    text = text.replace(regex, `${replace} $1`);
                }
            } 
            // 2. Standard replace / delete rule
            else {
                let pattern = escapeReg(find);

                if (/^[\w\u00C0-\u024F]/.test(find)) {
                    pattern = '(?<![a-zA-Z0-9\u00C0-\u024F])' + pattern;
                }
                if (/[\w\u00C0-\u024F]$/.test(find)) {
                    pattern = pattern + '(?![a-zA-Z0-9\u00C0-\u024F])';
                }

                const regex = new RegExp(pattern, 'gi');
                text = text.replace(regex, replace);
            }
        }
    }
    return text.replace(/\s+/g, ' ').trim();
}

function getAssembledSentences() {
    let allSentences = [];
    
    for (let r = 0; r < grid.length; r++) {
        if (!grid[r][0].hidden) {
            let cell = grid[r][0];
            let rSpan = cell.rS || 1;
            for (let subR = r; subR < r + rSpan; subR++) {
                let paths = findPaths(r, 0, subR);
                paths.forEach(p => { p.originRow = subR; });
                allSentences = allSentences.concat(paths);
            }
        }
    }

    const rules = document.getElementById('transformations-input')?.value || transformationsText || "";

    const unique = [];
    const seen = new Set();
    allSentences.forEach(s => {
        if (shouldExcludeSentence(s.t, rules) || shouldExcludeSentence(s.tr, rules)) {
            return;
        }

        s.t = applyTransformations(s.t, rules);
        s.tr = applyTransformations(s.tr, rules);

        // Strip leading spaces before punctuation and apostrophes
        s.t = cleanSentenceSpacing(s.t);
        s.tr = cleanSentenceSpacing(s.tr);

        const text = s.t.trim();
        if (text && !seen.has(text)) {
            unique.push(s);
            seen.add(text);
        }
    });
    return unique;
}
// Checks for exclusion rules using '*' (e.g., word1 * word2)
function shouldExcludeSentence(text, rulesText) {
    if (!text || !rulesText) return false;
    const lines = rulesText.split('\n');
    
    for (let line of lines) {
        line = line.trim();
        if (!line || line.includes('=')) continue;

        // Lines with '*' (and no '=') are treated as exclusion rules
        if (line.includes('*')) {
            const tokens = line.split('*').map(t => t.trim()).filter(Boolean);
            if (tokens.length >= 2) {
                const escapeReg = s => s.replace(/[-[\]{}()*+?^$|#\s\\]/g, '\\$&');
                // Matches token 1 followed anywhere later by token 2
                const pattern = tokens.map(escapeReg).join('.*?');
                if (new RegExp(pattern, 'i').test(text)) return true;
            }
        }
    }
    return false;
}
/* =========================
   PATH VALIDATION ENGINE
========================= */
function isPathValid(partsMeta) {
    if (!partsMeta || partsMeta.length === 0) return true;

    // Filter out bridge cells when checking disabled route keys
    const contentParts = partsMeta.filter(p => !p.isBridge);
    const routeKey = contentParts.map(p => `${p.r + 1}.${p.c + 1}`).join('+');
    if (disabledRoutes && disabledRoutes.includes(routeKey)) {
        return false;
    }

    // Check Excluded Combos
    if (excludedCombos && excludedCombos.length > 0) {
        for (let combo of excludedCombos) {
            const cells = combo.cells || combo;
            if (Array.isArray(cells) && cells.length >= 2) {
                const allPresent = cells.every(c => partsMeta.some(p => p.r === c.r && p.c === c.c));
                if (allPresent) return false;
            }
        }
    }

    // Legacy Excluded Pairs
    if (excludedPairs && excludedPairs.length > 0) {
        for (let pair of excludedPairs) {
            const hasA = partsMeta.some(p => p.r === pair.a.r && p.c === pair.a.c);
            const hasB = partsMeta.some(p => p.r === pair.b.r && p.c === pair.b.c);
            if (hasA && hasB) return false;
        }
    }

    // Check Required Combos
    if (requiredCombos && requiredCombos.length > 0) {
        for (let combo of requiredCombos) {
            const cellA = combo.cellA || combo.a;
            const cellB = combo.cellB || combo.b;
            if (cellA && cellB) {
                const hasA = partsMeta.some(p => p.r === cellA.r && p.c === cellA.c);
                const hasB = partsMeta.some(p => p.r === cellB.r && p.c === cellB.c);
                if (hasA && !hasB) return false;
            }
        }
    }

    return true;
}
/* =========================================================
   PATH ENGINE WITH TALL CELLS & BRIDGE/EMPTY COLUMN TRAVERSAL
   ========================================================= */
function cleanSentenceSpacing(str) {
    if (!str) return "";
    return str
        .replace(/\s+([.,!?:;])/g, '$1')                // Removes space before punctuation ("père ." -> "père.")
        .replace(/([a-zA-ZÀ-ÿ\u00C0-\u024F]')\s+/g, '$1')  // Removes space after apostrophes ("d' un" -> "d'un")
        .replace(/\s+/g, ' ')                          // Collapses multiple spaces
        .trim();
}
function findPaths(r, c, activeRow = null) {
    let cell = getCellAt(r, c);
    if (!cell) return [];

    let currentActiveRow = (activeRow !== null) ? activeRow : r;

    const getCellRowSpan = (row, col, cObj) => {
        if (cObj && (cObj.rS || cObj.rowSpan)) return cObj.rS || cObj.rowSpan;
        let span = 1;
        for (let testR = row + 1; testR < grid.length; testR++) {
            if (grid[testR] && grid[testR][col] && grid[testR][col].hidden) span++;
            else break;
        }
        return span;
    };

    const getCellColSpan = (row, col, cObj) => {
        if (cObj && (cObj.cS || cObj.colSpan)) return cObj.cS || cObj.colSpan;
        let span = 1;
        if (grid[row]) {
            for (let testC = col + 1; testC < grid[row].length; testC++) {
                if (grid[row][testC] && grid[row][testC].hidden) span++;
                else break;
            }
        }
        return span;
    };

    const getRootRow = (row, col) => {
        for (let testR = row; testR >= 0; testR--) {
            if (grid[testR] && grid[testR][col] && !grid[testR][col].hidden) {
                return testR;
            }
        }
        return row;
    };

    let cellRowSpan = getCellRowSpan(r, c, cell);
    let cellColSpan = getCellColSpan(r, c, cell);
    let nextCol = c + cellColSpan;

    const isCellEmpty = (cObj) => {
        if (!cObj || !cObj.items || cObj.items.length === 0) return true;
        return cObj.items.every(it => !it.t || it.t.trim() === "");
    };

    const isBridgeCell = (cObj) => {
        if (!cObj) return false;
        if (cObj.compact || cObj.isBridge || cObj.type === 'bridge') return true;
        if (cObj.items && cObj.items.some(it => it.t && it.t.trim().toLowerCase() === 'bridge')) return true;
        if (isCellEmpty(cObj)) return true;
        return false;
    };

    const isCurrBridge = isBridgeCell(cell);

    let currentOptions = isCurrBridge ? [] : (cell.items || [])
        .filter(it => it.t && it.t.trim() !== "" && it.t.trim().toLowerCase() !== "bridge")
        .map(it => ({
            t: it.t.trim(),
            tr: it.tr ? it.tr.trim() : "",
            parts: [{ t: it.t, tr: it.tr || "", r: r, c: c }],
            details: [{ tWord: it.t, eWord: it.tr || "", r: r, c: c }]
        }));

    if (nextCol >= grid[0].length) {
        return currentOptions.filter(path => isPathValid(path.parts));
    }

    let combinedSubPaths = [];
    let visitedTargetRoots = new Set();

    for (let rowOffset = 0; rowOffset < cellRowSpan; rowOffset++) {
        let evalRow = r + rowOffset;
        if (evalRow >= grid.length) break;

        let targetRawCell = grid[evalRow] ? grid[evalRow][nextCol] : null;
        let targetCell = targetRawCell ? getCellAt(evalRow, nextCol) : null;

        if (!targetCell) continue;

        let targetRootRow = getRootRow(evalRow, nextCol);
        let targetKey = `${targetRootRow}_${nextCol}`;

        if (visitedTargetRoots.has(targetKey)) continue;
        visitedTargetRoots.add(targetKey);

        if (isBridgeCell(targetCell)) {
            let subPaths = findPaths(targetRootRow, nextCol, evalRow);
            combinedSubPaths = combinedSubPaths.concat(subPaths);
        } else if (!isCellEmpty(targetCell)) {
            combinedSubPaths = combinedSubPaths.concat(
                findPaths(targetRootRow, nextCol, evalRow)
            );
        }
    }

    if (isCurrBridge) {
        return combinedSubPaths.map(sp => ({
            t: sp.t,
            tr: sp.tr,
            parts: [{ r: r, c: c, isBridge: true }, ...sp.parts],
            details: sp.details || []
        }));
    }

    if (currentOptions.length === 0) return combinedSubPaths.filter(p => isPathValid(p.parts));
    if (combinedSubPaths.length === 0) return currentOptions.filter(p => isPathValid(p.parts));

    let finalPaths = [];
    currentOptions.forEach(curr => {
        combinedSubPaths.forEach(sub => {
            const combinedParts = [...curr.parts, ...sub.parts];
            const combinedDetails = [...(curr.details || []), ...(sub.details || [])];
            
            if (isPathValid(combinedParts)) {
                finalPaths.push({
                    t: cleanSentenceSpacing(curr.t + " " + sub.t),
                    tr: cleanSentenceSpacing(curr.tr + " " + sub.tr),
                    parts: combinedParts,
                    details: combinedDetails
                });
            }
        });
    });

    return finalPaths;
}
/* =========================
   ROUTES & CELL COMBOS MODAL LOGIC
========================= */
function openRoutesModal() {
    comboPickerMode = null;
    currentComboSelection = [];
    document.getElementById('combo-picker-status').style.display = 'none';

    const transInput = document.getElementById('transformations-input');
    if (transInput) {
        transInput.value = transformationsText || "";
    }

    renderRoutesPreviewGrid();
    switchRoutesTab('routes');
    
    document.getElementById('routes-modal').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';
}
function switchRoutesTab(tab) {
    const btnRoutes = document.getElementById('tab-btn-routes');
    const btnCombos = document.getElementById('tab-btn-combos');
    const btnTransforms = document.getElementById('tab-btn-transforms');
    const contentRoutes = document.getElementById('tab-content-routes');
    const contentCombos = document.getElementById('tab-content-combos');
    const contentTransforms = document.getElementById('tab-content-transforms');

    [btnRoutes, btnCombos, btnTransforms].forEach(b => {
        if (b) { b.style.background = '#e2e8f0'; b.style.color = '#475569'; }
    });
    [contentRoutes, contentCombos, contentTransforms].forEach(c => {
        if (c) c.style.display = 'none';
    });

    if (tab === 'routes') {
        if (btnRoutes) { btnRoutes.style.background = '#8b5cf6'; btnRoutes.style.color = 'white'; }
        if (contentRoutes) contentRoutes.style.display = 'flex';
        renderRoutesList();
    } else if (tab === 'combos') {
        if (btnCombos) { btnCombos.style.background = '#8b5cf6'; btnCombos.style.color = 'white'; }
        if (contentCombos) contentCombos.style.display = 'flex';
        renderCombosLists();
    } else if (tab === 'transforms') {
        if (btnTransforms) { btnTransforms.style.background = '#8b5cf6'; btnTransforms.style.color = 'white'; }
        if (contentTransforms) contentTransforms.style.display = 'flex';
    }
}

/* =========================================================
   ROUTES PREVIEW GRID RENDERER
   CSS Grid Spanning + Full Vocab Display + Bridge Identification
   ========================================================= */
function renderRoutesPreviewGrid() {
    const container = document.getElementById('routes-mini-grid');
    if (!container) return;
    container.innerHTML = '';

    const cols = grid[0].length;
    const rows = grid.length;

    // Helper: Check if cell has no text content
    const isCellEmpty = (cell) => {
        if (!cell || !cell.items || cell.items.length === 0) return true;
        return cell.items.every(it => !it.t || it.t.trim() === "");
    };

    // Helper: Check if column is a 100% bridge/empty column
    const isColumnBridge = (colIdx) => {
        if (colIdx >= cols) return false;
        for (let rIdx = 0; rIdx < rows; rIdx++) {
            const cell = getCellAt(rIdx, colIdx);
            if (!isCellEmpty(cell)) return false;
        }
        return true;
    };

    // Build dynamic column tracks:
    // Pure bridge columns shrink to minimal width (minmax(42px, max-content))
    // Columns with text shrink to match the content in that column (minmax(max-content, 1fr))
    const colTrackSizes = [];
    for (let cIdx = 0; cIdx < cols; cIdx++) {
        if (isColumnBridge(cIdx)) {
            colTrackSizes.push('minmax(42px, max-content)');
        } else {
            colTrackSizes.push('minmax(max-content, 1fr)');
        }
    }

    container.style.display = 'grid';
    container.style.gridTemplateColumns = colTrackSizes.join(' ');
    container.style.gridTemplateRows = `repeat(${rows}, auto)`;
    container.style.gap = '6px';

    for (let r = 0; r < rows; r++) {
        for (let cIdx = 0; cIdx < cols; cIdx++) {
            const cell = grid[r][cIdx];
            if (cell.hidden) continue;

            const rSpan = cell.rS || 1;
            const cSpan = cell.cS || 1;
            const emptyCell = isCellEmpty(cell);
            const fullColBridge = isColumnBridge(cIdx);

            const validItems = (cell.items || []).filter(it => it.t && it.t.trim() !== "");
            
            let textContent = '';
            if (validItems.length > 0) {
                textContent = validItems.map(it => `
                    <div style="font-weight:600; color:#1e293b; padding:2px 0; border-bottom:1px solid #f1f5f9;">
                        ${it.t.trim()} ${it.tr ? `<span style="color:#2563eb; font-weight:normal; font-style:italic;">(${it.tr.trim()})</span>` : ''}
                    </div>
                `).join('');
            } else if (emptyCell || fullColBridge) {
                textContent = '<div style="color:#15803d; font-weight:bold; font-size:10px; text-align:center; padding:4px 0;">🌉</div>';
            }

            const cellEl = document.createElement('div');
            cellEl.className = 'mini-preview-cell';
            if (emptyCell || fullColBridge) {
                cellEl.classList.add('bridge-cell');
            }
            cellEl.id = `mini-cell-${r}-${cIdx}`;
            
            cellEl.style.gridRow = `${r + 1} / span ${rSpan}`;
            cellEl.style.gridColumn = `${cIdx + 1} / span ${cSpan}`;

            cellEl.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                    <span class="cell-coord-badge">${r + 1}.${cIdx + 1}${rSpan > 1 || cSpan > 1 ? ` (${rSpan}x${cSpan})` : ''}</span>
                </div>
                <div style="font-size:11px; line-height:1.3; width:100%;">
                    ${textContent}
                </div>
            `;

            cellEl.onclick = () => {
                if (typeof comboPickerMode !== 'undefined' && comboPickerMode) {
                    toggleComboCellSelection(r, cIdx);
                }
            };

            container.appendChild(cellEl);
        }
    }
}
function highlightRouteCells(parts, highlight) {
    document.querySelectorAll('.mini-preview-cell').forEach(el => el.classList.remove('highlighted-route'));
    if (!highlight || !parts) return;

    parts.forEach(p => {
        const el = document.getElementById(`mini-cell-${p.r}-${p.c}`);
        if (el) el.classList.add('highlighted-route');
    });
}

function getAllRawRoutes() {
    const backupDisabled = [...disabledRoutes];
    disabledRoutes = [];
    const allPaths = getAssembledSentences();
    disabledRoutes = backupDisabled;

    const routesMap = new Map();
    allPaths.forEach(p => {
        const contentParts = p.parts.filter(pt => !pt.isBridge);
        const key = contentParts.map(pt => `${pt.r + 1}.${pt.c + 1}`).join('+');
        const label = contentParts.map(pt => `${pt.r + 1}.${pt.c + 1}`).join(' + ');
        if (!routesMap.has(key)) {
            routesMap.set(key, { key, label, parts: p.parts, sampleText: p.t });
        }
    });

    return Array.from(routesMap.values());
}

function renderRoutesList() {
    const container = document.getElementById('routes-list-container');
    const routes = getAllRawRoutes();

    if (routes.length === 0) {
        container.innerHTML = '<div style="color:#64748b; font-style:italic;">No valid routes generated yet. Fill cells in the Sentence Builder table.</div>';
        return;
    }

    container.innerHTML = routes.map((r, idx) => {
        const isChecked = !disabledRoutes.includes(r.key);
        return `
            <div class="route-item" 
                onmouseenter="highlightRouteCells([${r.parts.map(p => `{r:${p.r},c:${p.c}}`).join(',')}], true)"
                onmouseleave="highlightRouteCells(null, false)"
                style="display:flex; align-items:center; justify-content:space-between; padding:6px 10px; border-bottom:1px solid #f1f5f9; font-size:13px;">
                <div>
                    <input type="checkbox" id="chk-route-${idx}" ${isChecked ? 'checked' : ''} onchange="toggleRouteDisabled('${r.key}', this.checked)">
                    <label for="chk-route-${idx}" style="cursor:pointer; font-weight:600; margin-left:6px; color:${isChecked ? '#10b981' : '#ef4444'};">
                        ${idx + 1}) ${r.label}
                    </label>
                    <span style="color:#64748b; margin-left:10px; font-style:italic;">(${r.sampleText})</span>
                </div>
            </div>
        `;
    }).join('');
}

function toggleRouteDisabled(key, isViable) {
    if (isViable) {
        disabledRoutes = disabledRoutes.filter(k => k !== key);
    } else {
        if (!disabledRoutes.includes(key)) disabledRoutes.push(key);
    }
    renderRoutesList();
}

function selectAllRoutes(enableAll) {
    if (enableAll) {
        disabledRoutes = [];
    } else {
        disabledRoutes = getAllRawRoutes().map(r => r.key);
    }
    renderRoutesList();
}

function renderCombosLists() {
    const exList = document.getElementById('excluded-combos-list');
    const reqList = document.getElementById('required-combos-list');

    // Render Excluded Combos
    if (!excludedCombos || excludedCombos.length === 0) {
        exList.innerHTML = '<div style="color:#64748b; font-size:12px; font-style:italic;">No excluded combinations defined.</div>';
    } else {
        exList.innerHTML = excludedCombos.map((c, i) => {
            const cells = c.cells || c;
            const text = cells.map(pt => `${pt.r + 1}.${pt.c + 1}`).join(' + ');
            const partsJson = JSON.stringify(cells.map(pt => ({ r: pt.r, c: pt.c })));
            
            return `
                <div class="combo-item"
                    onmouseenter='highlightRouteCells(${partsJson}, true)'
                    onmouseleave='highlightRouteCells(null, false)'
                    style="display:flex; justify-content:space-between; align-items:center; background:white; padding:6px 10px; border-radius:4px; border:1px solid #fca5a5; margin-bottom:4px; font-size:12px; cursor:pointer; transition:background 0.15s ease;">
                    <span><b style="color:#dc2626;">Excluded:</b> ${text}</span>
                    <button onclick="event.stopPropagation(); deleteCombo('excluded', ${i}); highlightRouteCells(null, false);" style="border:none; background:transparent; cursor:pointer; color:#ef4444; font-weight:bold; padding:2px 6px;">✕</button>
                </div>
            `;
        }).join('');
    }

    // Render Required Combos
    if (!requiredCombos || requiredCombos.length === 0) {
        reqList.innerHTML = '<div style="color:#64748b; font-size:12px; font-style:italic;">No required combinations defined.</div>';
    } else {
        reqList.innerHTML = requiredCombos.map((c, i) => {
            const labelA = `${c.cellA.r + 1}.${c.cellA.c + 1}`;
            const labelB = `${c.cellB.r + 1}.${c.cellB.c + 1}`;
            const partsJson = JSON.stringify([{ r: c.cellA.r, c: c.cellA.c }, { r: c.cellB.r, c: c.cellB.c }]);
            
            return `
                <div class="combo-item"
                    onmouseenter='highlightRouteCells(${partsJson}, true)'
                    onmouseleave='highlightRouteCells(null, false)'
                    style="display:flex; justify-content:space-between; align-items:center; background:white; padding:6px 10px; border-radius:4px; border:1px solid #86efac; margin-bottom:4px; font-size:12px; cursor:pointer; transition:background 0.15s ease;">
                    <span><b style="color:#16a34a;">Required:</b> Cell ${labelA} ➔ Cell ${labelB}</span>
                    <button onclick="event.stopPropagation(); deleteCombo('required', ${i}); highlightRouteCells(null, false);" style="border:none; background:transparent; cursor:pointer; color:#ef4444; font-weight:bold; padding:2px 6px;">✕</button>
                </div>
            `;
        }).join('');
    }
}

function startComboPicker(mode) {
    comboPickerMode = mode;
    currentComboSelection = [];
    document.querySelectorAll('.mini-preview-cell').forEach(el => el.classList.remove('picker-selected'));

    const statusBanner = document.getElementById('combo-picker-status');
    const prompt = document.getElementById('combo-picker-prompt');
    statusBanner.style.display = 'block';

    if (mode === 'excluded') {
        prompt.innerText = "🚫 Click 2 or more cells in the preview table to EXCLUDE their combination:";
    } else {
        prompt.innerText = "⚠️ Click Cell 1 (if used), then click Cell 2 (must be used in route):";
    }
}

function toggleComboCellSelection(r, c) {
    const idx = currentComboSelection.findIndex(p => p.r === r && p.c === c);
    const cellEl = document.getElementById(`mini-cell-${r}-${c}`);

    if (idx > -1) {
        currentComboSelection.splice(idx, 1);
        if (cellEl) cellEl.classList.remove('picker-selected');
    } else {
        if (comboPickerMode === 'required' && currentComboSelection.length >= 2) {
            alert("Required combinations require exactly 2 cells (Cell 1 ➔ Cell 2).");
            return;
        }
        currentComboSelection.push({ r, c });
        if (cellEl) cellEl.classList.add('picker-selected');
    }
}

function saveCurrentCombo() {
    if (currentComboSelection.length < 2) {
        alert("Please select at least 2 cells to form a combination.");
        return;
    }

    if (comboPickerMode === 'excluded') {
        excludedCombos.push({ cells: [...currentComboSelection] });
    } else if (comboPickerMode === 'required') {
        requiredCombos.push({ cellA: currentComboSelection[0], cellB: currentComboSelection[1] });
    }

    cancelComboPicker();
    renderCombosLists();
}

function cancelComboPicker() {
    comboPickerMode = null;
    currentComboSelection = [];
    document.getElementById('combo-picker-status').style.display = 'none';
    document.querySelectorAll('.mini-preview-cell').forEach(el => el.classList.remove('picker-selected'));
}

function deleteCombo(type, index) {
    if (type === 'excluded') {
        excludedCombos.splice(index, 1);
    } else {
        requiredCombos.splice(index, 1);
    }
    // Clear legacy pair outlines when combo list is modified
    if (!excludedCombos || excludedCombos.length === 0) {
        excludedPairs = [];
    }
    renderCombosLists();
}

function saveRoutesAndCombos() {
    // Sync legacy pair list with active excluded combos
    if (!excludedCombos || excludedCombos.length === 0) {
        excludedPairs = [];
    }
    const transInput = document.getElementById('transformations-input');
    if (transInput) {
        transformationsText = transInput.value;
    }
    saveToCloud(true);
    closeModals();
    render();
}
function getCellAt(r, c) {
    if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return null;
    let cell = grid[r][c];
    if (!cell.hidden) return cell;

    for (let i = r; i >= 0; i--) {
        for (let j = c; j >= 0; j--) {
            let root = grid[i][j];
            if (root && !root.hidden && (i + (root.rS || 1) > r) && (j + (root.cS || 1) > c)) {
                return root;
            }
        }
    }
    return cell;
}

/* =========================
   CELL-SPECIFIC FAULTY TRANSLATION DISTRACTOR LOGIC
========================= */
function isEligibleForFaulty(sentence) {
    if (!sentence || !sentence.parts || sentence.parts.length === 0) return false;
    return sentence.parts.some(p => {
        const cell = getCellAt(p.r, p.c);
        if (!cell || !cell.items) return false;
        const validTrs = cell.items.filter(it => it.tr && it.tr.trim() !== "");
        return validTrs.length > 1;
    });
}

function generateFaultySentenceObj(sentence) {
    if (!sentence || !sentence.parts || sentence.parts.length === 0) return null;

    const rules = document.getElementById('transformations-input')?.value || transformationsText || "";

    // Identify parts in the sentence route that come from cells with multiple alternative options
    const eligiblePartIndices = [];
    sentence.parts.forEach((p, idx) => {
        if (p.isBridge) return;
        const cell = getCellAt(p.r, p.c);
        if (!cell || !cell.items) return;
        const validItems = cell.items.filter(it => (it.t && it.t.trim()) || (it.tr && it.tr.trim()));
        if (validItems.length > 1) {
            eligiblePartIndices.push(idx);
        }
    });

    if (eligiblePartIndices.length === 0) return null;

    // Pick a random eligible cell position in the path
    const chosenIdx = eligiblePartIndices[Math.floor(Math.random() * eligiblePartIndices.length)];
    const chosenPart = sentence.parts[chosenIdx];
    const cell = getCellAt(chosenPart.r, chosenPart.c);

    const origTr = (chosenPart.tr || "").trim().toLowerCase();
    const origT = (chosenPart.t || "").trim().toLowerCase();

    // Pick an alternative distractor item from that cell
    const alternatives = (cell.items || []).filter(it => {
        const tr = (it.tr || "").trim().toLowerCase();
        const t = (it.t || "").trim().toLowerCase();
        return (tr && tr !== origTr) || (t && t !== origT);
    });

    if (alternatives.length === 0) return null;
    const faultyItem = alternatives[Math.floor(Math.random() * alternatives.length)];

    // Rebuild the route by swapping the target cell item with the alternative distractor item
    const faultyParts = sentence.parts.map((p, idx) => {
        if (idx === chosenIdx) {
            return {
                ...p,
                t: faultyItem.t || p.t,
                tr: faultyItem.tr || ""
            };
        }
        return p;
    });

    // Re-assemble the raw English path before transformations
    const rawFaultyTr = faultyParts
        .filter(p => !p.isBridge && p.tr && p.tr.trim() !== "")
        .map(p => p.tr.trim())
        .join(" ");

    // Run the raw faulty English path through the exact same transformation rules pipeline
    let faultyTr = applyTransformations(rawFaultyTr, rules);
    faultyTr = cleanSentenceSpacing(faultyTr);

    // Fallback: If transformations produced identical text or an empty string, append distractor in brackets
    if (!faultyTr || faultyTr.toLowerCase() === (sentence.tr || "").toLowerCase()) {
        const distractorText = (faultyItem.tr || faultyItem.t || "").trim();
        faultyTr = `${sentence.tr} (${distractorText})`;
    }

    return { faultyTr: faultyTr };
}

function getOrGenerateFaultyTr(sentence) {
    if (!sentence) return "";
    if (sentence.faultyTr && sentence.faultyTr.trim() !== "") {
        return sentence.faultyTr.trim();
    }
    const faultyObj = generateFaultySentenceObj(sentence);
    if (faultyObj && faultyObj.faultyTr) {
        return faultyObj.faultyTr;
    }
    return sentence.tr || "";
}

/* =========================
   PER-EXERCISE COLLAPSIBLE SENTENCE BOXES
========================= */
    /* =========================
   EXERCISE REFRESH HELPERS
========================= */
function getCurrentSentencesMapFromDOM() {
    const map = {};
    const container = document.getElementById('per-activity-sentences-container');
    if (!container) return map;

    const cards = container.querySelectorAll('.act-card-body');
    cards.forEach(bodyEl => {
        const actId = bodyEl.getAttribute('data-activity-id');
        if (!actId) return;

        const sents = [];
        const rows = bodyEl.querySelectorAll('.act-sentence-row');
        rows.forEach(row => {
            const tInput = row.querySelector('.edit-t');
            const trInput = row.querySelector('.edit-tr');
            const faultyTrInput = row.querySelector('.edit-faulty-tr');
            if (tInput) {
                const t = tInput.value.trim();
                const tr = trInput ? trInput.value.trim() : "";
                const faultyTr = faultyTrInput ? faultyTrInput.value.trim() : "";
                if (t || tr) {
                    const itemObj = { t, tr };
                    if (actId === 'faulty' && faultyTr) {
                        itemObj.faultyTr = faultyTr;
                    }
                    sents.push(itemObj);
                }
            }
        });
        map[actId] = sents;
    });
    return map;
}

function refreshActivitySentences(actId, e) {
    if (e) e.stopPropagation();

    const currentMap = getCurrentSentencesMapFromDOM();

    const isStudy = (actId === 'study');
    const countSelectId = isStudy ? 'table-sentence-count' : 'sentence-count';
    const limit = parseInt(document.getElementById(countSelectId)?.value || 10, 10);
    const allSentences = getAssembledSentences();

    let availablePool = [...allSentences];
    if (actId === 'faulty') {
        availablePool = availablePool.filter(isEligibleForFaulty);
    }

    currentMap[actId] = getBalancedSelection(availablePool, limit);

    window.editingSavedSentencesMap = currentMap;
    renderPerActivitySentenceBoxes();

    const body = document.getElementById(`act-body-${actId}`);
    const arrow = document.getElementById(`arrow-${actId}`);
    if (body) {
        body.style.display = 'block';
        if (arrow) arrow.innerText = '▼';
    }
}
function renderPerActivitySentenceBoxes(overrideSentencesMap = null) {
    const container = document.getElementById('per-activity-sentences-container');
    const checkedBoxes = Array.from(document.querySelectorAll('#activity-list input:checked'));

    if (checkedBoxes.length === 0) {
        container.innerHTML = '<div style="color:#64748b; font-style:italic; padding:10px;">Select at least one activity above to customize its sentences.</div>';
        return;
    }

    if (overrideSentencesMap) {
        window.editingSavedSentencesMap = overrideSentencesMap;
    }

    const savedMap = window.editingSavedSentencesMap || null;
    const defaultExerciseLimit = parseInt(document.getElementById('sentence-count')?.value || 10, 10);
    const tableLimit = parseInt(document.getElementById('table-sentence-count')?.value || 10, 10);
    const allSentences = getAssembledSentences();

    let html = '';
    const usedSentenceTexts = new Set();

    checkedBoxes.forEach((cb) => {
        const actId = cb.value;
        const actLabel = document.querySelector(`label[for="${cb.id}"]`)?.innerText || actId;
        const isStudy = (actId === 'study');
        const limit = isStudy ? tableLimit : defaultExerciseLimit;

        let actSents = [];

        if (savedMap && savedMap[actId] && savedMap[actId].length > 0) {
            actSents = savedMap[actId];
        } else {
            let availablePool = [...allSentences];
            if (actId === 'faulty') {
                availablePool = availablePool.filter(isEligibleForFaulty);
            }

            let unusedPool = availablePool.filter(s => !usedSentenceTexts.has(s.t.trim()));

            if (unusedPool.length >= limit) {
                actSents = getBalancedSelection(unusedPool, limit);
            } else {
                actSents = getBalancedSelection(unusedPool, unusedPool.length);
                const remainingNeeded = limit - actSents.length;
                const fallbackPool = availablePool.filter(s => !actSents.some(already => already.t.trim() === s.t.trim()));
                actSents = actSents.concat(getBalancedSelection(fallbackPool, remainingNeeded));
            }
        }

        if (!isStudy) {
            actSents.forEach(s => { if (s && s.t) usedSentenceTexts.add(s.t.trim()); });
        }
        const usedGapWords = new Set();

        if (actId === 'faulty' && actSents.length === 0) {
            html += `
                <div class="act-sentence-card" id="act-card-${actId}">
                    <div class="act-card-header" style="background:#fee2e2;">
                        <span>⚠️ ${actLabel} (0 Eligible Sentences)</span>
                    </div>
                    <div class="act-card-body" style="display:block; color:#b91c1c;">
                        None of your grid cells contain alternative translations. Add multiple target/translation rows into grid cells to enable Faulty Translation options.
                    </div>
                </div>`;
            return;
        }

        html += `
            <div class="act-sentence-card" id="act-card-${actId}">
                <div class="act-card-header" onclick="toggleActivityCollapse('${actId}')">
                    <span style="display:flex; align-items:center; gap:10px;">
                        ✏️ ${actLabel} (${actSents.length} Sentences)
                        <button type="button" 
                            style="padding: 2px 8px; font-size: 12px; margin: 0; background: white; border: 1px solid #cbd5e1; border-radius: 4px; cursor: pointer; font-weight:600; color:#334155;" 
                            onclick="refreshActivitySentences('${actId}', event)" 
                            title="Refresh sentences for this activity">
                            🔄 Refresh
                        </button>
                    </span>
                    <span id="arrow-${actId}" style="font-size:14px; font-weight:bold;">▶</span>
                </div>
                <div id="act-body-${actId}" class="act-card-body" data-activity-id="${actId}" style="display:none;">
                    ${actSents.map((s, idx) => {
                        if (actId === 'faulty') {
                            // ✅ CORRECT (returns the string safely):
const faultyVal = getOrGenerateFaultyTr(s);
                            return `
                                <div class="act-sentence-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
                                    <span style="font-size:12px; font-weight:bold; color:#64748b; width:20px;">${idx + 1}.</span>
                                    <input type="text" class="edit-t" value="${(s.t||'').replace(/"/g, '&quot;')}" placeholder="Correct Target" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px; font-weight:600;">
                                    <input type="text" class="edit-faulty-tr" value="${faultyVal.replace(/"/g, '&quot;')}" placeholder="Faulty English Sentence" style="flex:1; padding:5px; border:1px solid #fca5a5; background:#fef2f2; color:#b91c1c; border-radius:4px; font-weight:600;">
                                    <input type="text" class="edit-tr" value="${(s.tr||'').replace(/"/g, '&quot;')}" placeholder="Correct English Translation (Markscheme)" style="flex:1; padding:5px; border:1px solid #a7f3d0; background:#f0fdf4; color:#065f46; border-radius:4px; font-weight:600;">
                                </div>`;
                        } else if (actId === 'gap-en' || actId === 'gap-t') {
                            const isTarget = (actId === 'gap-t');
                            const fullSentence = isTarget ? (s.t||'') : (s.tr||'');
                            const markedSentence = extractGapWord(fullSentence).fullMatch ? fullSentence : addAsteriskToGapWord(fullSentence, usedGapWords);

                            return `
                                <div class="act-sentence-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
                                    <span style="font-size:12px; font-weight:bold; color:#64748b; width:20px;">${idx + 1}.</span>
                                    ${isTarget 
                                        ? `<input type="text" class="edit-t" value="${markedSentence.replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold;" placeholder="Target (with *gap*)">
                                           <input type="text" class="edit-tr" value="${(s.tr||'').replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="English Prompt">`
                                        : `<input type="text" class="edit-t" value="${(s.t||'').replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="Target Prompt">
                                           <input type="text" class="edit-tr" value="${markedSentence.replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold;" placeholder="English (with *gap*)">`
                                    }
                                </div>`;
                        } else {
                            return `
                                <div class="act-sentence-row" style="display:flex; gap:8px; margin-bottom:6px; align-items:center;">
                                    <span style="font-size:12px; font-weight:bold; color:#64748b; width:20px;">${idx + 1}.</span>
                                    <input type="text" class="edit-t" value="${(s.t||'').replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="Target Sentence">
                                    <input type="text" class="edit-tr" value="${(s.tr||'').replace(/"/g, '&quot;')}" style="flex:1; padding:5px; border:1px solid #cbd5e1; border-radius:4px;" placeholder="English Translation">
                                </div>`;
                        }
                    }).join('')}
                </div>
            </div>`;
    });

    container.innerHTML = html;
}

function addAsteriskToGapWord(sentenceStr, usedGapWords) {
    if (!sentenceStr || extractGapWord(sentenceStr).fullMatch) return sentenceStr;

    const tokens = sentenceStr.split(' ');
    const candidates = [];

    tokens.forEach((tok, idx) => {
        const clean = tok.replace(/[.,!?;:'"«»()]/g, '').trim();
        if (clean.length >= 2 && !usedGapWords.has(clean.toLowerCase())) {
            candidates.push({ idx, clean, cleanLower: clean.toLowerCase(), orig: tok });
        }
    });

    let chosen = candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
    if (!chosen) {
        tokens.forEach((tok, idx) => {
            const clean = tok.replace(/[.,!?;:'"«»()]/g, '').trim();
            if (clean.length >= 2) chosen = { idx, clean, cleanLower: clean.toLowerCase(), orig: tok };
        });
    }

    if (chosen) {
        usedGapWords.add(chosen.cleanLower);
        tokens[chosen.idx] = chosen.orig.replace(chosen.clean, `*${chosen.clean}*`);
    }

    return tokens.join(' ');
}

function toggleActivityCollapse(actId) {
    const body = document.getElementById(`act-body-${actId}`);
    const arrow = document.getElementById(`arrow-${actId}`);
    if (!body) return;

    if (body.style.display === 'none') {
        body.style.display = 'block';
        if (arrow) arrow.innerText = '▼';
    } else {
        body.style.display = 'none';
        if (arrow) arrow.innerText = '▶';
    }
}

/* =========================
   WORKSHEET GENERATOR
========================= */
function generateWorksheet() {
    var activityOrder = ['study', 'match', 'nospaces', 'jumbled', 'gap-en', 'gap-t', 'vowels', 'cons', 'faulty', 'trans-en', 'trans-target'];
    
    var docTitle = document.getElementById('builder-title')?.value || "Sentence Builder";
    var docLang = meta.lang || document.getElementById('meta-lang')?.value || "Target Language";
    var docYear = meta.year || document.getElementById('meta-year')?.value || "Year 9";

    var activityInstructions = {
        'match': 'Match each ' + docLang + ' sentence (1–10) with its correct English translation (A–J).',
        'nospaces': 'Rewrite the sentences adding correct spaces between the words.',
        'jumbled': 'Reorder the words to form correct ' + docLang + ' sentences.',
        'gap-en': 'Fill in the missing English words in the translations.',
        'gap-t': 'Fill in the missing ' + docLang + ' words in each sentence.',
        'vowels': 'Fill in the missing vowels to complete the sentences.',
        'cons': 'Fill in the missing consonants to complete the sentences.',
        'faulty': 'Find and correct the mistake in each English translation.',
        'trans-en': 'Translate the following ' + docLang + ' sentences into English.',
        'trans-target': 'Translate the following English sentences into ' + docLang + '.'
    };

    var selected = activityOrder.filter(function(id) {
        var el = document.getElementById('chk-' + id);
        return el && el.checked;
    });
    
    if (selected.length === 0) return alert("Select at least one activity!");

    var allSentences = getAssembledSentences();
    if (allSentences.length === 0) return alert("No sentences found!");

    var contentHtml = 
        '<div class="header-block">' +
            '<div class="doc-main-title">' + docTitle.toUpperCase() + ' <span class="doc-sub-info">' + docLang + ' | ' + docYear + '</span></div>' +
            '<table class="student-info-table">' +
                '<tr>' +
                    '<td><b>Name:</b> ___________________________</td>' +
                    '<td><b>Class:</b> ____________</td>' +
                    '<td><b>Date:</b> ____________</td>' +
                '</tr>' +
            '</table>' +
        '</div>';

    var answerKeyHtml = "<br clear='all' style='page-break-before:always' /><div class='answer-key-section'><table class='exercise-title-table'><tr><td><div class='ex-title'>Answer Key</div></td></tr></table>";
    var exerciseCounter = 1;

    selected.forEach(function(type) {
        var labelEl = document.querySelector('label[for="chk-' + type + '"]');
        var rawLabel = labelEl ? labelEl.innerText : type;
        var cleanLabel = rawLabel.replace(/\bTL\b/g, docLang).replace(/Target Language/gi, docLang);

        var isStudy = (type === 'study');
        var boxTitle = isStudy ? "Sentence Table" : ("Exercise " + exerciseCounter + ": " + cleanLabel);
        if (!isStudy) exerciseCounter++;

        var textInstruction = isStudy ? "" : (activityInstructions[type] || "");
        var instructionMarkup = textInstruction ? ('<div class="ex-instruction">' + textInstruction + '</div>') : '';

        var activityHtml = 
            '<div class="activity-container">' +
                '<table class="exercise-title-table">' +
                    '<tr>' +
                        '<td>' +
                            '<div class="ex-title">' + boxTitle + '</div>' +
                            instructionMarkup +
                        '</td>' +
                    '</tr>' +
                '</table>';

        var currentSents = [];
        if (isStudy) {
            var tableCountDropdown = document.getElementById('table-sentence-count');
            var tableLimit = tableCountDropdown ? parseInt(tableCountDropdown.value, 10) : 10;
            currentSents = getBalancedSelection(allSentences, tableLimit);
        } else {
            var bodyEl = document.getElementById('act-body-' + type);
            if (bodyEl) {
                var rows = bodyEl.querySelectorAll('.act-sentence-row');
                var targets = rows.length > 0 ? rows : bodyEl.children;
                Array.from(targets).forEach(function(row) {
                    var tInput = row.querySelector('.edit-t');
                    var trInput = row.querySelector('.edit-tr');
                    var faultyTrInput = row.querySelector('.edit-faulty-tr');
                    if (tInput) {
                        var t = tInput.value.trim();
                        var tr = trInput ? trInput.value.trim() : "";
                        var faultyTr = faultyTrInput ? faultyTrInput.value.trim() : "";
                        if (t || tr) {
                            var itemObj = { t: t, tr: tr };
                            if (type === 'faulty' && faultyTr) {
                                itemObj.faultyTr = faultyTr;
                            }
                            currentSents.push(itemObj);
                        }
                    }
                });
            }
            if (currentSents.length === 0) {
                var countDropdown = document.getElementById('sentence-count');
                var chosenLimit = countDropdown ? parseInt(countDropdown.value, 10) : 10;
                currentSents = getBalancedSelection(allSentences, chosenLimit);
            }
        }

        var activityAnswersHtml = "";
        if (!isStudy) {
            activityAnswersHtml += '<div class="ak-group"><h3>' + boxTitle + '</h3><ol class="answer-list">';
        }

        var usedGapWords = new Set();

        if (type === 'study') {
            activityHtml += '<table class="sentence-grid-table"><tr><th>' + docLang + '</th><th>English Translation</th></tr>';
            currentSents.forEach(function(s) {
                activityHtml += '<tr><td style="padding:1pt 5pt; mso-para-margin:0pt;"><b>' + s.t + '</b></td><td class="blue" style="padding:1pt 5pt; mso-para-margin:0pt;">' + s.tr + '</td></tr>';
            });
            activityHtml += '</table>';
        } else if (type === 'match') {
            var shuf = shuffleArray(currentSents);
            activityHtml += '<table class="match-table">';
            currentSents.forEach(function(s, i) {
                activityHtml += '<tr>' +
                    '<td style="width:45%; padding: 3pt 0;"><b>' + (i+1) + '.</b> ' + s.t + '</td>' +
                    '<td style="width:10%; text-align:center; padding: 3pt 0;">[ &nbsp; ]</td>' +
                    '<td style="width:45%; padding: 3pt 0;"><b>' + String.fromCharCode(65+i) + '.</b> ' + shuf[i].tr + '</td>' +
                '</tr>';
                
                var matchIndex = shuf.indexOf(s);
                var correctLetter = String.fromCharCode(65 + (matchIndex >= 0 ? matchIndex : 0));
                activityAnswersHtml += '<li>' + correctLetter + '</li>';
            });
            activityHtml += '</table>';
        } else {
            var needsWritingLine = ['nospaces', 'jumbled', 'faulty', 'trans-en', 'trans-target'].includes(type);

            currentSents.forEach(function(s, i) {
                var out = s.t, hint = '<span class="blue">(' + s.tr + ')</span>';
                var answerText = s.t; 
                
                if (type === 'vowels' || type === 'cons') {
                    var pattern = (type === 'vowels') ? /[aeiouàéèíóúü]/gi : /[bcdfghjklmnpqrstvwxyz]/gi;
                    out = s.t.split(' ').map(function(word) { return word.replace(pattern, ' __ '); }).join('&nbsp;&nbsp;');
                }
                else if (type === 'nospaces') {
                    out = s.t.replace(/\s+/g, '').toLowerCase();
                }
                else if (type === 'jumbled') {
                    out = shuffleArray(s.t.split(' ')).join(' / ');
                }
                else if (type === 'gap-t') { 
                    var rawTarget = s.t;
                    if (!extractGapWord(rawTarget).fullMatch) {
                        rawTarget = addAsteriskToGapWord(rawTarget, usedGapWords);
                    }
                    var gapRes = extractGapWord(rawTarget);
                    if (gapRes.fullMatch) {
                        out = rawTarget.replace(gapRes.fullMatch, '___________');
                    } else {
                        var words = rawTarget.split(' ');
                        var targetIdx = Math.floor(words.length / 2);
                        words[targetIdx] = '___________';
                        out = words.join(' ');
                    }
                    answerText = rawTarget.replace(/\*/g, '');
                }
                else if (type === 'gap-en') { 
                    out = s.t; 
                    var rawEnglish = s.tr;
                    if (!extractGapWord(rawEnglish).fullMatch) {
                        rawEnglish = addAsteriskToGapWord(rawEnglish, usedGapWords);
                    }
                    var gapResEn = extractGapWord(rawEnglish);
                    var maskedTr = rawEnglish;
                    if (gapResEn.fullMatch) {
                        maskedTr = rawEnglish.replace(gapResEn.fullMatch, '___________');
                    } else {
                        var wordsEn = rawEnglish.split(' ');
                        var targetIdxEn = Math.floor(wordsEn.length / 2);
                        wordsEn[targetIdxEn] = '___________';
                        maskedTr = wordsEn.join(' ');
                    }
                    hint = '<span class="blue">(' + maskedTr + ')</span>'; 
                    answerText = rawEnglish.replace(/\*/g, ''); 
                }
                else if (type === 'trans-en') { 
                    out = s.t; 
                    hint = ""; 
                    answerText = s.tr; 
                }
                else if (type === 'trans-target') { 
                    out = '<span class="blue">' + s.tr + '</span>'; 
                    hint = ""; 
                }
                else if (type === 'faulty') {
                    var faultyEnglish = s.faultyTr || s.tr; 
                    activityHtml += 
                        '<div class="exercise-item-wrapper">' +
                            '<p class="exercise-item"><b>' + (i+1) + '.</b> ' + s.t + ' = <span class="blue">' + faultyEnglish + '</span></p>' +
                            '<p class="writing-line">&nbsp;</p>' +
                        '</div>';
                    activityAnswersHtml += '<li>' + s.t + ' = <span class="blue">' + s.tr + '</span></li>';
                    return;
                }
                
                activityHtml += 
                    '<div class="exercise-item-wrapper">' +
                        '<p class="exercise-item"><b>' + (i+1) + '.</b> ' + out + ' ' + hint + '</p>' +
                        (needsWritingLine ? '<p class="writing-line">&nbsp;</p>' : '') +
                    '</div>';
                activityAnswersHtml += '<li>' + answerText + '</li>';
            });
        }
        activityHtml += '</div>';
        contentHtml += activityHtml;

        if (!isStudy) {
            activityAnswersHtml += '</ol></div>';
            answerKeyHtml += activityAnswersHtml;
        }
    });

    answerKeyHtml += '</div>'; 
    contentHtml += answerKeyHtml; 

    var fullDoc = 
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<!--[if gte mso 9]>' +
        '<xml>' +
         '<w:WordDocument>' +
          '<w:View>Print</w:View>' +
          '<w:Zoom>100</w:Zoom>' +
         '</w:WordDocument>' +
        '</xml>' +
        '<![endif]-->' +
        '<style>' +
            '@page { size: A4 portrait; margin: 2cm; } ' +
            'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12pt; color: #1e293b; line-height: 1.35; } ' +
            'p { margin: 0; padding: 0; } ' +

            '.header-block { margin-bottom: 16pt; } ' +
            '.doc-main-title { font-size: 16pt; font-weight: bold; text-transform: uppercase; color: #0f172a; margin-bottom: 8pt; } ' +
            '.doc-sub-info { font-size: 11pt; font-weight: normal; text-transform: none; color: #64748b; margin-left: 10px; } ' +
            '.student-info-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-top: 6pt; background-color: #fafafa; } ' +
            '.student-info-table td { border: 1px solid #cbd5e1; padding: 5pt 10pt; font-size: 10pt; font-weight: normal; color: #334155; } ' +

            '.exercise-title-table { width: 100%; border-collapse: collapse; margin-top: 14pt; margin-bottom: 10pt; } ' +
            '.exercise-title-table td { background-color: #f8fafc; border-left: 4px solid #8b5cf6; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 6pt 10pt; mso-para-margin: 0pt !important; } ' +
            '.ex-title { font-size: 12pt; font-weight: bold; color: #1e293b; margin: 0; padding: 0; mso-para-margin: 0pt !important; } ' +
            '.ex-instruction { font-size: 10pt; font-style: italic; color: #64748b; margin-top: 3pt; padding: 0; mso-para-margin: 0pt !important; } ' +

            '.sentence-grid-table { width: 100%; border-collapse: collapse; margin-top: 2pt; margin-bottom: 8pt; } ' +
            '.sentence-grid-table th { border: 1px solid #cbd5e1; padding: 2pt 5pt !important; font-size: 10pt !important; background-color: #f1f5f9; text-align: left; font-weight: bold; mso-para-margin: 0pt !important; mso-space-above: 0pt !important; mso-space-below: 0pt !important; } ' +
            '.sentence-grid-table td { border: 1px solid #cbd5e1; padding: 1pt 5pt !important; font-size: 10pt !important; line-height: 1.1 !important; mso-para-margin: 0pt !important; mso-space-above: 0pt !important; mso-space-below: 0pt !important; } ' +

            '.activity-container { page-break-inside: avoid; margin-bottom: 16pt; } ' +
            '.exercise-item-wrapper { margin-bottom: 14pt; page-break-inside: avoid; } ' +
            '.exercise-item { font-size: 12pt; margin: 0; padding: 0; color: #0f172a; line-height: 1.35; mso-para-margin: 0pt; } ' +
            
            '.writing-line { border-bottom: 1pt solid #94a3b8; font-size: 1pt; line-height: 1pt; margin-top: 16pt !important; margin-bottom: 4pt !important; mso-para-margin-top: 16pt !important; mso-para-margin-bottom: 4pt !important; } ' +

            '.match-table { width: 100%; border-collapse: collapse; margin-bottom: 10pt; font-size: 12pt; } ' +
            '.match-table td { font-size: 12pt; border-bottom: 0.5pt solid #f1f5f9; } ' +

            '.answer-key-section { font-size: 10pt; } ' +
            '.ak-group { margin-bottom: 10pt; } ' +
            '.ak-group h3 { font-size: 10pt; font-weight: bold; margin-bottom: 3pt; margin-top: 6pt; color: #334155; } ' +
            '.answer-list { margin: 0; padding-left: 20px; font-size: 10pt; line-height: 1.25; } ' +
            '.answer-list li { font-size: 10pt; margin-bottom: 2pt; } ' +

            '.blue { color: #2980b9; font-style: italic; } ' +
        '</style>' +
        '</head>' +
        '<body>' + contentHtml + '</body>' +
        '</html>';
    
    saveAs(new Blob(['\ufeff', fullDoc], { type: 'application/msword' }), docTitle + '_Worksheet.doc');
    closeModals();
}
/* =========================
   GOOGLE CLASSROOM ASSIGNMENT PUBLISHING & EDITING
========================= */
async function openClassroomPublishSection() {
    const assignFields = document.getElementById('classroom-assign-fields');
    assignFields.style.display = 'block';
    
    if (assignFields.parentElement) {
        assignFields.parentElement.scrollTo({ top: assignFields.parentElement.scrollHeight, behavior: 'smooth' });
    }

    try {
        let isLoaded = await ensureGapiClassroomLoaded();
        if (!isLoaded) {
            alert("Google Classroom API could not be loaded.");
            return;
        }

        const select = document.getElementById('gc-course-select');
        select.innerHTML = '<option value="">Loading courses...</option>';

        let res;
        try {
            res = await gapi.client.classroom.courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] });
        } catch (authErr) {
            localStorage.removeItem('oauth_token');
            localStorage.removeItem('oauth_token_expiry');
            await ensureClassroomToken(true);
            res = await gapi.client.classroom.courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] });
        }

        const courses = res.result.courses || [];

        if (courses.length === 0) {
            select.innerHTML = '<option value="">No active Google Classroom courses found.</option>';
            return;
        }

        // Populate dropdown starting clean at "-- Choose Course --" without auto-selecting
        select.innerHTML = '<option value="">-- Choose Course --</option>' + 
            courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        select.value = "";

    } catch (err) {
        console.error("Error opening classroom publish section:", err);
        alert("Failed to load Google Classroom courses.");
    }
}

async function loadCourseTopics(courseId) {
    if (!courseId) return;
    try {
        await ensureGapiClassroomLoaded();
        const res = await gapi.client.classroom.courses.topics.list({ courseId: courseId });
        const topics = res.result.topic || [];
        const select = document.getElementById('gc-topic-select');
        select.innerHTML = '<option value="">-- No Topic --</option>' + 
            topics.map(t => `<option value="${t.topicId}">${t.name}</option>`).join('');
    } catch (e) {
        console.warn("Topic error:", e);
    }
}

async function handleClassroomCourseChange(courseId) {
    if (courseId && !courseId.startsWith("Loading")) {
        await loadCourseTopics(courseId);
        await loadClassroomStudents(courseId);
    } else {
        classroomStudents = [];
        selectedClassroomStudentIds = [];
        studentSelectorCourseId = null;
        const summary = document.getElementById('student-selection-summary');
        const list = document.getElementById('student-list');
        if (summary) summary.innerText = "Select a class";
        if (list) list.innerHTML = '';
    }
}
async function publishTaskToClassroom() {
    const courseSelect = document.getElementById('gc-course-select');
    const courseId = courseSelect.value;
    const courseName = courseSelect.options[courseSelect.selectedIndex]?.text || '';

    if (!courseId) return alert("Select a Google Classroom course.");

    const selectedActivities = Array.from(document.querySelectorAll('#activity-list input:checked')).map(c => c.value);
    if (selectedActivities.length === 0) return alert("Select at least one activity!");

    const tableLimit = parseInt(document.getElementById('table-sentence-count').value, 10);
    const allSentences = getAssembledSentences();

    const structuredSentencesPerActivity = {};
    let totalSentencesCount = 0;

    selectedActivities.forEach(actId => {
        const bodyEl = document.getElementById(`act-body-${actId}`);
        const sents = [];
        if (bodyEl) {
            const rows = bodyEl.querySelectorAll('.act-sentence-row');
            const targets = rows.length > 0 ? rows : bodyEl.children;
            Array.from(targets).forEach(row => {
                const tInput = row.querySelector('.edit-t');
                const trInput = row.querySelector('.edit-tr');
                const faultyTrInput = row.querySelector('.edit-faulty-tr');
                if (tInput) {
                    const t = tInput.value.trim();
                    const tr = trInput ? trInput.value.trim() : "";
                    const faultyTr = faultyTrInput ? faultyTrInput.value.trim() : "";
                    if (t || tr) {
                        const itemObj = { t, tr: tr };
                        if (actId === 'faulty' && faultyTr) {
                            itemObj.faultyTr = faultyTr;
                        }
                        sents.push(itemObj);
                    }
                }
            });
        }

        if (sents.length > 0) {
            structuredSentencesPerActivity[actId] = sents;
            if (actId !== 'study') {
                totalSentencesCount += sents.length;
            }
        } else {
            if (actId === 'study') {
                structuredSentencesPerActivity['study'] = getBalancedSelection(allSentences, tableLimit);
            } else {
                const exerciseLimit = parseInt(document.getElementById('sentence-count').value, 10);
                structuredSentencesPerActivity[actId] = getBalancedSelection(allSentences, exerciseLimit);
                totalSentencesCount += structuredSentencesPerActivity[actId].length;
            }
        }
    });

    const title = document.getElementById('builder-title').value || "Sentence Practice";
    const maxPoints = totalSentencesCount * 1;
    const dueDateVal = document.getElementById('gc-due-date').value;
    const scheduleDateVal = document.getElementById('gc-schedule-date').value;
    const topicId = document.getElementById('gc-topic-select').value;

    let gcDueDate = null, gcDueTime = null;
    if (dueDateVal) {
        const dateObj = new Date(dueDateVal);
        gcDueDate = { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1, day: dateObj.getDate() };
        gcDueTime = { hours: dateObj.getHours(), minutes: dateObj.getMinutes(), seconds: 0, nanos: 0 };
    }

    let gcScheduledTime = null;
    if (scheduleDateVal) {
        gcScheduledTime = new Date(scheduleDateVal).toISOString();
    }

    await ensureGapiClassroomLoaded();

    // 🔽 INSERT STUDENT SELECTION VALIDATION & LOGIC HERE 🔽
    if (!studentSelectorCourseId || studentSelectorCourseId !== courseId) {
        await loadClassroomStudents(courseId);
    }

    const selectedStudentIds = [...selectedClassroomStudentIds];
    if (selectedStudentIds.length === 0) {
        alert("Please select at least one student before posting the assignment.");
        return;
    }

    const allStudentIds = classroomStudents.map(student => student.userId);
    const assigningToEntireClass = allStudentIds.length > 0 && selectedStudentIds.length === allStudentIds.length && selectedStudentIds.every(id => allStudentIds.includes(id));
    // 🔼 END OF INSERTION 🔼

    if (editingAssignmentId) {
        try {
            const assignDoc = await db.collection("assignments").doc(editingAssignmentId).get();
            const existingData = assignDoc.data();

            const updatePayload = {
                title: title,
                selectedActivities: selectedActivities,
                sentencesPerActivity: structuredSentencesPerActivity,
                maxPoints: maxPoints > 0 ? maxPoints : 10,
                dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null,
                scheduleDate: scheduleDateVal ? new Date(scheduleDateVal).toISOString() : null,
                topicId: topicId || null,
                assignedStudentIds: selectedStudentIds,
                updatedAt: firebase.firestore.FieldValue.serverTimestamp()
            };

            await db.collection("assignments").doc(editingAssignmentId).update(updatePayload);

            if (existingData && existingData.gClassroomAssignmentId && existingData.courseId) {
                const cwPatch = { title: `🧩 ${title}`, maxPoints: maxPoints > 0 ? maxPoints : 10 };
                const updateMasks = ["title", "maxPoints"];

                if (gcDueDate && gcDueTime) {
                    cwPatch.dueDate = gcDueDate;
                    cwPatch.dueTime = gcDueTime;
                    updateMasks.push("dueDate", "dueTime");
                }

                if (gcScheduledTime) {
                    cwPatch.scheduledTime = gcScheduledTime;
                    updateMasks.push("scheduledTime");
                }

                if (topicId) {
                    cwPatch.topicId = topicId;
                    updateMasks.push("topicId");
                }

                await gapi.client.classroom.courses.courseWork.patch({
                    courseId: existingData.courseId,
                    id: existingData.gClassroomAssignmentId,
                    updateMask: updateMasks.join(","),
                    resource: cwPatch
                });
            }

            alert("✅ Assignment updated and synced with Google Classroom!");
            editingAssignmentId = null;
            closeModals();
            renderStudentSubmissionsTable();
            return;
        } catch (e) {
            alert("Error updating assignment: " + e.message);
            return;
        }
    }

    const assignmentRef = db.collection("assignments").doc();
    const assignmentId = assignmentRef.id;
    const studentUrl = `${window.location.origin}${window.location.pathname}?assignmentId=${assignmentId}`;

    const cwPayload = {
        title: `🧩 ${title}`,
        description: `Complete the interactive sentence practice online.`,
        workType: 'ASSIGNMENT',
        assigneeMode: assigningToEntireClass ? 'ALL_STUDENTS' : 'INDIVIDUAL_STUDENTS',
        maxPoints: maxPoints > 0 ? maxPoints : 10,
        materials: [{ link: { url: studentUrl, title: "Interactive Sentence Task" } }]
    };

    if (!assigningToEntireClass) {
        cwPayload.individualStudentsOptions = { studentIds: selectedStudentIds };
    }

    if (gcDueDate && gcDueTime) {
        cwPayload.dueDate = gcDueDate;
        cwPayload.dueTime = gcDueTime;
    }

    if (topicId) cwPayload.topicId = topicId;

    if (gcScheduledTime) {
        cwPayload.scheduledTime = gcScheduledTime;
        cwPayload.state = 'DRAFT';
    } else {
        cwPayload.state = 'PUBLISHED';
    }

    const res = await gapi.client.classroom.courses.courseWork.create({ courseId: courseId, resource: cwPayload });

    if (!gcScheduledTime) {
        await gapi.client.classroom.courses.courseWork.patch({
            courseId: courseId, id: res.result.id, updateMask: "state", resource: { state: 'PUBLISHED' }
        });
    }

    await assignmentRef.set({
        id: assignmentId,
        gClassroomAssignmentId: res.result.id,
        courseId: courseId,
        courseName: courseName,
        title: title,
        lang: document.getElementById('meta-lang').value || meta.lang || "French",
        selectedActivities: selectedActivities,
        sentencesPerActivity: structuredSentencesPerActivity,
        maxPoints: maxPoints > 0 ? maxPoints : 10,
        assignedStudentIds: selectedStudentIds,
        dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null,
        scheduleDate: scheduleDateVal ? new Date(scheduleDateVal).toISOString() : null,
        topicId: topicId || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(gcScheduledTime ? "📅 Assignment scheduled for publication on Google Classroom!" : "🎉 Assignment successfully posted to Google Classroom!");
    closeModals();
}

/* =========================
   STUDENT PORTAL & MARKSHEET REVIEW
========================= */
function getCleanActivityTitle(type, lang) {
    const map = {
        'study': 'Sentence Reference Table',
        'match': 'Match Up',
        'nospaces': 'No Spaces',
        'jumbled': 'Unjumble Sentences',
        'gap-en': 'Gap Fill (English)',
        'gap-t': `Gap Fill (${lang})`,
        'vowels': 'Missing Vowels',
        'cons': 'Missing Consonants',
        'faulty': 'Faulty Translation',
        'trans-en': 'Translate to English',
        'trans-target': `Translate to ${lang}`
    };
    return map[type] || type.toUpperCase();
}

function getActivityInstruction(type, lang) {
    const map = {
        'study': 'Review the sentence patterns below before completing the exercises.',
        'match': `Click a ${lang} phrase then click its matching English translation.`,
        'nospaces': 'Click where you want to insert spaces to recreate the correct sentence.',
        'jumbled': 'Click the word chunks in order to form the sentence.',
        'gap-en': 'Fill in the missing English word.',
        'gap-t': `Fill in the missing ${lang} word.`,
        'vowels': 'Fill in the missing vowels.',
        'cons': 'Fill in the missing consonants.',
        'faulty': 'Type the corrected English sentence.',
        'trans-en': `Translate the ${lang} sentence into English.`,
        'trans-target': `Translate the English sentence into ${lang}.`
    };
    return map[type] || 'Complete the exercise below.';
}

async function loadStudentTask(assignmentId) {
    window.isTeacherPreview = false;
    const previewBanner = document.getElementById('teacher-preview-banner');
    if (previewBanner) previewBanner.style.display = 'none';
    try {
        const doc = await db.collection("assignments").doc(assignmentId).get();
        if (!doc.exists) {
            alert("Assignment not found in database.");
            return;
        }

        currentStudentAssignment = doc.data();
        currentStudentAssignment.id = assignmentId;
        
        const taskTitleEl = document.getElementById('student-task-title');
        if (taskTitleEl) taskTitleEl.innerText = currentStudentAssignment.title || "Interactive Practice";

        const selectedActivities = currentStudentAssignment.selectedActivities || [];
        studentExerciseTypes = selectedActivities.filter(a => a !== 'study');
        studentCurrentExIndex = 0;
        studentAnswersState = {};

        const perActSentences = currentStudentAssignment.sentencesPerActivity || {};
        const hasStudySelected = selectedActivities.includes('study');

        if (hasStudySelected && perActSentences['study'] && perActSentences['study'].length > 0) {
            const refBanner = document.getElementById('student-reference-banner');
            if (refBanner) refBanner.style.display = 'block';
            
            let refHtml = '<table style="width:100%; border-collapse:collapse;"><thead><tr><th>Target Language</th><th>English Translation</th></tr></thead><tbody>';
            perActSentences['study'].forEach(s => {
                refHtml += `<tr><td><b>${s.t}</b></td><td>${s.tr}</td></tr>`;
            });
            refHtml += '</tbody></table>';
            
            const refBody = document.getElementById('ref-table-body');
            if (refBody) refBody.innerHTML = refHtml;
        } else {
            const refBanner = document.getElementById('student-reference-banner');
            if (refBanner) refBanner.style.display = 'none';
        }

        if (currentUser && currentUser.email) {
            try {
                const subSnap = await db.collection("submissions")
                    .where("assignmentId", "==", assignmentId)
                    .where("studentEmail", "==", currentUser.email.toLowerCase())
                    .get();

                if (!subSnap.empty) {
                    const studentSub = subSnap.docs[0].data();
                    if (studentSub.isReviewed) {
                        renderStudentMarksheetReview(studentSub);
                    } else {
                        renderStudentPendingReviewCard(studentSub);
                    }
                    return;
                }
            } catch (subErr) {
                console.warn("Could not query previous submissions, displaying activity instead:", subErr);
            }
        }

        const msCard = document.getElementById('student-marksheet-card');
        const pendingCard = document.getElementById('student-pending-review-card');
        const exCard = document.getElementById('student-active-exercise-card');
        const navActions = document.getElementById('student-nav-actions');

        if (msCard) msCard.style.display = 'none';
        if (pendingCard) pendingCard.style.display = 'none';
        if (exCard) exCard.style.display = 'block';
        if (navActions) navActions.style.display = 'flex';

        renderCurrentStudentExercise();

    } catch (err) {
        console.error("Critical Error Loading Task:", err);
        alert("Error loading assignment task: " + err.message);
    }
}

function renderStudentPendingReviewCard(sub) {
    document.getElementById('student-active-exercise-card').style.display = 'none';
    document.getElementById('student-nav-actions').style.display = 'none';
    document.getElementById('virtual-keyboard-bar').style.display = 'none';
    document.getElementById('student-marksheet-card').style.display = 'none';

    const pendingCard = document.getElementById('student-pending-review-card');
    pendingCard.style.display = 'block';
}

function renderStudentMarksheetReview(sub) {
    document.getElementById('student-active-exercise-card').style.display = 'none';
    document.getElementById('student-nav-actions').style.display = 'none';
    document.getElementById('virtual-keyboard-bar').style.display = 'none';
    document.getElementById('student-pending-review-card').style.display = 'none';

    const marksheetCard = document.getElementById('student-marksheet-card');
    marksheetCard.style.display = 'block';

    const header = document.getElementById('marksheet-summary-header');
    header.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
            <div>
                <strong style="font-size:16px; color:#0f172a;">Your Overall Result:</strong><br>
                <span style="font-size:22px; font-weight:bold; color:#10b981;">
                    ${sub.overallGrade !== undefined ? sub.overallGrade : sub.totalEarned} / ${sub.totalPossible} (${sub.percentage}%)
                </span>
            </div>
            ${sub.teacherComment ? `<div style="background:#fff; padding:8px 12px; border-radius:6px; border:1px solid #cbd5e1; max-width:300px;"><b>Teacher Comment:</b><br><i>"${sub.teacherComment}"</i></div>` : ''}
        </div>
    `;

    const content = document.getElementById('marksheet-report-content');
    let html = '';

    const report = sub.detailedReport || [];
    if (report.length === 0) {
        html = '<p style="color:#64748b;">No itemized answer details available for this submission.</p>';
    } else {
        report.forEach((act, actIdx) => {
            html += `
                <div style="border:1px solid #cbd5e1; border-radius:8px; margin-bottom:15px; overflow:hidden; background:white;">
                    <div style="background:#f1f5f9; padding:10px 15px; font-weight:bold; color:#0f172a; border-bottom:1px solid #e2e8f0;">
                        Exercise ${actIdx + 1}: ${act.activityTitle}
                    </div>
                    <div style="padding:12px;">
                        ${(act.responses || []).map((r, i) => `
                            <div style="padding:8px 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center;">
                                <div style="flex:1;">
                                    <div><b>${i + 1}. Prompt:</b> ${r.prompt}</div>
                                    <div style="color:${r.points >= 1 ? '#10b981' : (r.points > 0 ? '#d97706' : '#ef4444')}; margin-top:2px;">
                                        <b>Your Answer:</b> ${r.studentAnswer}
                                    </div>
                                    ${r.points < 1 ? `<div style="color:#2563eb; font-weight:bold; font-size:13px; margin-top:3px;"><b>Correct Answer:</b> ${r.correctAnswer}</div>` : ''}
                                </div>
                                <div style="font-weight:bold; color:${r.points >= 1 ? '#10b981' : (r.points > 0 ? '#d97706' : '#ef4444')}; padding-left:10px;">
                                    ${r.points !== undefined ? r.points : (r.isCorrect ? 1 : 0)} / 1 pt
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        });
    }

    content.innerHTML = html;
}

function toggleReferenceTable() {
    const body = document.getElementById('ref-table-body');
    const icon = document.getElementById('ref-toggle-icon');
    if (body.style.display === 'none') {
        body.style.display = 'block';
        icon.innerText = '▲ Hide';
    } else {
        body.style.display = 'none';
        icon.innerText = '▼ Show';
    }
}

// State flag for teacher preview mode
window.isTeacherPreview = false;

/* =========================
   EXERCISE COMPLETION VALIDATOR
========================= */
function isCurrentExerciseCompleted() {
    if (studentExerciseTypes.length === 0) return true;
    const actType = studentExerciseTypes[studentCurrentExIndex];
    const area = document.getElementById('exercise-interactive-area');
    if (!area) return false;

    const sents = (currentStudentAssignment && currentStudentAssignment.sentencesPerActivity) 
        ? (currentStudentAssignment.sentencesPerActivity[actType] || []) 
        : [];
    if (sents.length === 0) return true;

    if (actType === 'match') {
        const matched = area.querySelectorAll('.match-t-tile.correct-match').length;
        return matched >= sents.length;
    } 
    else if (actType === 'jumbled') {
        const remainingInBank = area.querySelectorAll('.jumble-word-bank .jumble-word-tile').length;
        return remainingInBank === 0;
    } 
    else if (actType === 'nospaces') {
        const unrevealed = area.querySelectorAll('.space-inner:not(.revealed-space)').length;
        return unrevealed === 0;
    } 
    else if (actType === 'vowels') {
        const boxes = Array.from(area.querySelectorAll('.vowel-input'));
        if (boxes.length === 0) return true;
        return boxes.every(b => b.value.trim().length > 0);
    } 
    else if (actType === 'cons') {
        const boxes = Array.from(area.querySelectorAll('.cons-input'));
        if (boxes.length === 0) return true;
        return boxes.every(b => b.value.trim().length > 0);
    } 
    else if (actType === 'gap-en' || actType === 'gap-t') {
        const gapInputs = Array.from(area.querySelectorAll('.gap-inline-input'));
        if (gapInputs.length === 0) return true;
        return gapInputs.every(i => i.value.trim().length > 0);
    } 
    else if (['faulty', 'trans-en', 'trans-target'].includes(actType)) {
        const inputs = Array.from(area.querySelectorAll('.full-typing-input'));
        if (inputs.length === 0) return true;
        return inputs.every(i => i.value.trim().length > 0);
    }

    return true;
}

function checkExerciseCompletion() {
    const nextBtn = document.getElementById('student-next-ex-btn');
    const submitBtn = document.getElementById('student-submit-btn');
    if (!nextBtn || !submitBtn) return;

    const isLastEx = (studentCurrentExIndex === studentExerciseTypes.length - 1);

    // Teachers can navigate freely in preview mode
    if (window.isTeacherPreview) {
        if (isLastEx) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
            submitBtn.style.display = 'none';
        }
        return;
    }

    // Student mode: only show Next / Submit when completed
    const isComplete = isCurrentExerciseCompleted();

    if (isLastEx) {
        nextBtn.style.display = 'none';
        submitBtn.style.display = isComplete ? 'inline-block' : 'none';
    } else {
        submitBtn.style.display = 'none';
        nextBtn.style.display = isComplete ? 'inline-block' : 'none';
    }
}

/* =========================
   UPDATED STUDENT EXERCISE RENDERER
========================= */
function renderCurrentStudentExercise() {
    const container = document.getElementById('student-active-exercise-card');
    if (studentExerciseTypes.length === 0) {
        container.innerHTML = '<p>No exercises in this assignment.</p>';
        return;
    }

    const actType = studentExerciseTypes[studentCurrentExIndex];
    const docLang = currentStudentAssignment.lang || "French";
    const actTitle = getCleanActivityTitle(actType, docLang);
    const actInstruction = getActivityInstruction(actType, docLang);

    setupVirtualKeyboard(docLang, actType);

    const sents = currentStudentAssignment.sentencesPerActivity[actType] || [];

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
            <h3 style="margin:0; font-size:17px; color:#0f172a;">Exercise ${studentCurrentExIndex + 1} of ${studentExerciseTypes.length}: ${actTitle}</h3>
            <span style="background:#e2e8f0; padding:3px 8px; border-radius:12px; font-size:12px; font-weight:bold; color:#475569;">
                ${sents.length} Items
            </span>
        </div>
        <p style="color:#64748b; font-style:italic; font-size:13px; margin-top:0; margin-bottom:14px;">${actInstruction}</p>
        <div id="exercise-interactive-area"></div>
    `;

    container.innerHTML = html;

    const area = document.getElementById('exercise-interactive-area');

    if (actType === 'match') {
        let matchState = { selectedTarget: null, selectedEng: null, matchedCount: 0 };

        let shuffledEng = shuffleArray(sents.map((s, idx) => ({ tr: s.tr, id: idx })));
        let shuffledTarget = shuffleArray(sents.map((s, idx) => ({ t: s.t, id: idx })));

        let mHtml = `
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px; margin-top:10px;">
                <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                    <h4 style="margin-top:0; margin-bottom:12px; font-size:15px; color:#1e293b; text-align:center; border-bottom:2px solid #3b82f6; padding-bottom:6px;">Column 1: ${docLang}</h4>
                    <div id="match-target-col" style="display:flex; flex-direction:column; gap:8px;">
                        ${shuffledTarget.map(item => `<div class="interactive-tile match-t-tile" data-id="${item.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; box-sizing:border-box;">${item.t}</div>`).join('')}
                    </div>
                </div>
                <div style="background:#f8fafc; padding:12px; border-radius:8px; border:1px solid #e2e8f0;">
                    <h4 style="margin-top:0; margin-bottom:12px; font-size:15px; color:#1e293b; text-align:center; border-bottom:2px solid #10b981; padding-bottom:6px;">Column 2: English</h4>
                    <div id="match-eng-col" style="display:flex; flex-direction:column; gap:8px;">
                        ${shuffledEng.map(item => `<div class="interactive-tile match-tr-tile" data-id="${item.id}" style="display:block; width:100%; text-align:left; padding:8px 12px; box-sizing:border-box;">${item.tr}</div>`).join('')}
                    </div>
                </div>
            </div>
            <div id="match-feedback" style="margin-top:10px; font-weight:bold; min-height:20px; text-align:center;"></div>
        `;
        area.innerHTML = mHtml;

        area.querySelectorAll('.match-t-tile').forEach(tile => {
            tile.onclick = function() {
                if (this.classList.contains('correct-match')) return;
                area.querySelectorAll('.match-t-tile').forEach(t => t.classList.remove('selected'));
                this.classList.add('selected');
                matchState.selectedTarget = this;
                checkMatchPair(matchState, sents);
            };
        });

        area.querySelectorAll('.match-tr-tile').forEach(tile => {
            tile.onclick = function() {
                if (this.classList.contains('correct-match')) return;
                area.querySelectorAll('.match-tr-tile').forEach(t => t.classList.remove('selected'));
                this.classList.add('selected');
                matchState.selectedEng = this;
                checkMatchPair(matchState, sents);
            };
        });
    }
    else if (actType === 'jumbled') {
        let jHtml = '';
        sents.forEach((s, idx) => {
            const words = shuffleArray(s.t.split(' '));
            jHtml += `
                <div class="student-item-block" data-idx="${idx}" style="background:#f8fafc; padding:8px 12px; border-radius:8px; border:1px solid #e2e8f0; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:6px;">
                        <span style="font-weight:bold; color:#1e293b; font-size:14px;">${idx + 1}. ${s.tr}</span>
                    </div>
                    <div style="display:flex; gap:10px; align-items:center; flex-wrap:wrap;">
                        <div class="jumble-answer-slot" style="min-height:36px; min-width:220px; padding:3px 6px; background:white; border:2px dashed #cbd5e1; border-radius:6px; display:flex; align-items:center; flex-wrap:wrap; gap:4px; flex:1;"></div>
                        <div class="jumble-word-bank" style="display:flex; flex-wrap:wrap; gap:4px; align-items:center;">
                            ${words.map(w => `<span class="interactive-tile jumble-word-tile" style="padding:4px 8px; font-size:14px; margin:2px;">${w}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `;
        });
        area.innerHTML = jHtml;

        area.querySelectorAll('.student-item-block').forEach(block => {
            const slot = block.querySelector('.jumble-answer-slot');
            const bank = block.querySelector('.jumble-word-bank');

            block.addEventListener('click', (e) => {
                if (e.target.classList.contains('jumble-word-tile')) {
                    if (e.target.parentElement === bank) {
                        slot.appendChild(e.target);
                    } else {
                        bank.appendChild(e.target);
                    }
                    checkExerciseCompletion();
                }
            });
        });
    }
    else if (actType === 'nospaces') {
        let nsHtml = '';
        const punctuation = ['.', ',', ';', ':', '!', '?', "'"];

        sents.forEach((s, itemIdx) => {
            let sentenceChars = s.t.split('');
            let spaceCount = 0;
            let formattedSentence = sentenceChars.map((char, charIdx, arr) => {
                if (char === ' ') {
                    const prevChar = arr[charIdx - 1];
                    const nextChar = arr[charIdx + 1];
                    if (punctuation.includes(prevChar) || punctuation.includes(nextChar)) {
                        return `<span class='letter-span' data-index='${charIdx}'>&nbsp;</span>`;
                    } else {
                        spaceCount++;
                        return `<span class='space-span' onclick='check_nospace_click(event, this, ${itemIdx})'><span class='space-inner' style='display:none'>&nbsp;</span></span>`;
                    }
                } else {
                    return `<span class='letter-span' data-index='${charIdx}' onclick='check_nospace_click(event, this, ${itemIdx})'>${char}</span>`;
                }
            }).join('');

            nsHtml += `
                <div class="student-item-block" data-idx="${itemIdx}" data-wrong-clicks="0">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <p style="margin:0; font-weight:bold; color:#1e293b; font-size:13px;">${itemIdx + 1}. ${s.tr}</p>
                        <span class="space-counter-badge" style="font-size:12px; font-weight:bold; color:#2563eb;">(${spaceCount} space${spaceCount === 1 ? '' : 's'} remaining)</span>
                    </div>
                    <div class="no-spaces-interactive-line">
                        ${formattedSentence}
                    </div>
                </div>
            `;
        });
        area.innerHTML = nsHtml;
    }
    else if (actType === 'vowels') {
        let vHtml = '';
        sents.forEach((s, idx) => {
            let rowHtml = `<div class="student-item-block" data-idx="${idx}" style="margin-bottom:10px;">
                <p style="margin:0 0 4px 0; font-weight:bold; font-size:14px;">${idx + 1}. ${s.tr}</p>
                <div style="font-size:18px; line-height:2;">`;

            const words = s.t.split(' ');
            words.forEach((word, wIdx) => {
                for (let i = 0; i < word.length; i++) {
                    const char = word[i];
                    if (VOWELS_REGEX.test(char)) {
                        rowHtml += `<input type="text" class="letter-box vowel-input" maxlength="1" data-correct="${char.toLowerCase()}" data-item="${idx}">`;
                    } else {
                        rowHtml += `<span style="font-weight:600;">${char}</span>`;
                    }
                }
                if (wIdx < words.length - 1) {
                    rowHtml += `<span style="display:inline-block; width: 18px;"></span>`;
                }
            });

            rowHtml += `</div></div>`;
            vHtml += rowHtml;
        });
        area.innerHTML = vHtml;

        setupAutoAdvanceInputs(area, '.vowel-input');
    }
    else if (actType === 'cons') {
        let cHtml = '';
        sents.forEach((s, idx) => {
            let rowHtml = `<div class="student-item-block" data-idx="${idx}" style="margin-bottom:10px;">
                <p style="margin:0 0 4px 0; font-weight:bold; font-size:14px;">${idx + 1}. ${s.tr}</p>
                <div style="font-size:18px; line-height:2;">`;

            const words = s.t.split(' ');
            words.forEach((word, wIdx) => {
                for (let i = 0; i < word.length; i++) {
                    const char = word[i];
                    if (CONSONANTS_REGEX.test(char)) {
                        rowHtml += `<input type="text" class="letter-box cons-input" maxlength="1" data-correct="${char.toLowerCase()}" data-item="${idx}">`;
                    } else {
                        rowHtml += `<span style="font-weight:600;">${char}</span>`;
                    }
                }
                if (wIdx < words.length - 1) {
                    rowHtml += `<span style="display:inline-block; width: 18px;"></span>`;
                }
            });

            rowHtml += `</div></div>`;
            cHtml += rowHtml;
        });
        area.innerHTML = cHtml;

        setupAutoAdvanceInputs(area, '.cons-input');
    }
    else if (actType === 'gap-en' || actType === 'gap-t') {
        let gHtml = '';
        const usedGapWords = new Set();

        sents.forEach((s, idx) => {
            const isTarget = (actType === 'gap-t');
            let fullSentence = isTarget ? s.t : s.tr;
            const promptLabel = isTarget ? s.tr : s.t;

            let { fullMatch, cleanGap } = extractGapWord(fullSentence);

            if (!cleanGap || usedGapWords.has(cleanGap.toLowerCase())) {
                const cleanSentence = fullSentence.replace(/\*/g, '');
                const reMarked = addAsteriskToGapWord(cleanSentence, usedGapWords);
                const res = extractGapWord(reMarked);
                fullMatch = res.fullMatch;
                cleanGap = res.cleanGap;
                if (fullMatch) fullSentence = reMarked;
            }

            if (cleanGap) {
                usedGapWords.add(cleanGap.toLowerCase());
            }

            let displaySentence = fullSentence;
            if (fullMatch && cleanGap) {
                const inputHtml = `<input type="text" class="gap-inline-input" data-correct="${cleanGap.replace(/"/g, '&quot;')}" style="padding:3px 6px; border:1px solid #cbd5e1; border-radius:4px; font-weight:bold; width:120px; margin:0 3px;">`;
                displaySentence = displaySentence.replace(fullMatch, inputHtml);
            }

            gHtml += `
                <div class="student-item-block" data-idx="${idx}" style="margin-bottom:10px; font-size:14px;">
                    <p style="margin:0 0 4px 0;"><b>${idx + 1}.</b> Prompt: <b>${promptLabel}</b></p>
                    <div style="padding:6px 10px; background:#f8fafc; border-radius:6px; border:1px solid #e2e8f0;">
                        ${displaySentence}
                    </div>
                </div>`;
        });
        area.innerHTML = gHtml;

        area.querySelectorAll('.gap-inline-input').forEach(input => {
            input.addEventListener('input', () => {
                checkExerciseCompletion();
            });
        });
    }
    else {
        let tHtml = '';
        sents.forEach((s, idx) => {
            let promptText = '';
            let answerRef = '';

            if (actType === 'faulty') {
                const faultyText = s.faultyTr || getOrGenerateFaultyTr(s);
                promptText = `<b>${s.t}</b><br><span style="color:#b91c1c; font-weight:600; font-size:13px;">Faulty English sentence to correct: "${faultyText}"</span>`;
                answerRef = s.tr;
            } else if (actType === 'trans-en') {
                promptText = `Translate into English: <b>${s.t}</b>`;
                answerRef = s.tr;
            } else if (actType === 'trans-target') {
                promptText = `Translate into ${docLang}: <b>${s.tr}</b>`;
                answerRef = s.t;
            }

            tHtml += `
                <div class="student-item-block" data-idx="${idx}" data-correct="${(answerRef||'').replace(/"/g, '&quot;')}" style="margin-bottom:10px;">
                    <label style="display:block; margin-bottom:4px; font-size:14px;"><b>${idx + 1}.</b> ${promptText}</label>
                    <input type="text" class="full-typing-input" placeholder="Type correct translation..." style="width:100%; padding:6px 10px; border:1px solid #cbd5e1; border-radius:4px; box-sizing:border-box;">
                </div>
            `;
        });
        area.innerHTML = tHtml;

        area.querySelectorAll('.full-typing-input').forEach(input => {
            input.addEventListener('input', () => {
                checkExerciseCompletion();
            });
        });
    }

    document.getElementById('student-prev-ex-btn').style.display = (studentCurrentExIndex > 0) ? 'inline-block' : 'none';
    checkExerciseCompletion();
}
/* =========================
   UPDATED EVENT HELPERS
========================= */
function check_nospace_click(e, element, itemIdx) {
    if (e) e.stopPropagation();
    const block = element.closest('.student-item-block');
    if (!block) return;

    let isCorrectClick = false;

    const checkAdjacent = (sibling) => {
        if (sibling && sibling.classList.contains('space-span')) {
            const spaceInner = sibling.querySelector('.space-inner');
            if (spaceInner && (spaceInner.style.display === 'none' || spaceInner.style.visibility === 'hidden') && !spaceInner.classList.contains('revealed-space')) {
                spaceInner.style.display = 'inline';
                spaceInner.style.visibility = 'visible';
                spaceInner.classList.add('revealed-space');
                isCorrectClick = true;
            }
        }
    };

    checkAdjacent(element.previousElementSibling);
    checkAdjacent(element.nextElementSibling);
    if (element.classList.contains('space-span')) {
        checkAdjacent(element);
    }

    if (!isCorrectClick) {
        if (!element.classList.contains('space-span')) {
            block.dataset.wrongClicks = parseInt(block.dataset.wrongClicks || "0", 10) + 1;
            element.style.color = '#ef4444';
            setTimeout(() => { element.style.color = ''; }, 400);
        } else {
            const inner = element.querySelector('.space-inner');
            if (inner && (inner.style.display === 'none' || !inner.classList.contains('revealed-space'))) {
                block.dataset.wrongClicks = parseInt(block.dataset.wrongClicks || "0", 10) + 1;
                element.style.color = '#ef4444';
                setTimeout(() => { element.style.color = ''; }, 400);
            }
        }
    }

    updateNoSpaceCounter(block);
    checkExerciseCompletion();
}
function updateNoSpaceCounter(block) {
    if (!block) return;
    const totalSpaces = block.querySelectorAll('.space-span').length;
    const revealedSpaces = block.querySelectorAll('.space-inner.revealed-space').length;
    const remaining = totalSpaces - revealedSpaces;
    const counterEl = block.querySelector('.space-counter-badge');
    if (counterEl) {
        if (remaining === 0) {
            counterEl.style.color = '#10b981';
            counterEl.innerText = `(0 spaces remaining ✓)`;
        } else {
            counterEl.style.color = '#2563eb';
            counterEl.innerText = `(${remaining} space${remaining === 1 ? '' : 's'} remaining)`;
        }
    }
}


function checkMatchPair(state, sents) {
    if (state.selectedTarget && state.selectedEng) {
        const idT = state.selectedTarget.dataset.id;
        const idTr = state.selectedEng.dataset.id;
        const feedback = document.getElementById('match-feedback');

        const targetEl = state.selectedTarget;
        const engEl = state.selectedEng;

        if (idT === idTr) {
            feedback.style.color = '#10b981';
            feedback.innerText = 'Correct Pair! 🎉';
            targetEl.classList.add('correct-match');
            engEl.classList.add('correct-match');
            state.matchedCount++;

            setTimeout(() => {
                targetEl.style.opacity = '0.3';
                engEl.style.opacity = '0.3';
            }, 400);
        } else {
            feedback.style.color = '#ef4444';
            feedback.innerText = 'Incorrect pair. Try again!';
            targetEl.classList.add('wrong-match');
            engEl.classList.add('wrong-match');
            setTimeout(() => {
                targetEl?.classList.remove('wrong-match', 'selected');
                engEl?.classList.remove('wrong-match', 'selected');
            }, 800);
        }

        targetEl.classList.remove('selected');
        engEl.classList.remove('selected');
        state.selectedTarget = null;
        state.selectedEng = null;

        checkExerciseCompletion();
    }
}

function setupAutoAdvanceInputs(area, selector) {
    const inputs = Array.from(area.querySelectorAll(selector));
    inputs.forEach((input, idx) => {
        input.oninput = function() {
            const correctChar = this.dataset.correct;
            const val = this.value.toLowerCase();

            if (val === correctChar) {
                this.classList.add('correct-input');
                this.classList.remove('wrong-input');
                if (idx < inputs.length - 1) inputs[idx + 1].focus();
            } else if (val.length > 0) {
                this.classList.add('wrong-input');
                this.classList.remove('correct-input');
            } else {
                this.classList.remove('correct-input', 'wrong-input');
            }
            checkExerciseCompletion();
        };

        input.onkeydown = function(e) {
            if (e.key === 'Backspace' && this.value === '' && idx > 0) {
                inputs[idx - 1].focus();
            }
        };
    });
}

/* =========================
   WORD-LEVEL SIMILARITY CHECK (50% THRESHOLD)
========================= */
function evaluateTextSimilarity(studentAns, correctAns) {
    const normAns = normalizeString(studentAns);
    const normCorrect = normalizeString(correctAns);

    if (!normAns || !normCorrect) return { points: 0, isCorrect: false };
    if (normAns === normCorrect) return { points: 1, isCorrect: true };

    const ansWords = normAns.split(' ').filter(Boolean);
    const correctWords = normCorrect.split(' ').filter(Boolean);

    if (ansWords.length === 0 || correctWords.length === 0) {
        return { points: 0, isCorrect: false };
    }

    let matchedCount = 0;
    const tempCorrect = [...correctWords];

    ansWords.forEach(w => {
        const idx = tempCorrect.indexOf(w);
        if (idx !== -1) {
            matchedCount++;
            tempCorrect.splice(idx, 1);
        }
    });

    // Calculate ratio against the longer word count
    const ratio = matchedCount / Math.max(ansWords.length, correctWords.length);

    // Requires at least 50% word match for 0.5 points
    if (ratio >= 0.50) {
        return { points: 0.5, isCorrect: false };
    }

    return { points: 0, isCorrect: false };
}

function saveStudentCurrentExerciseResponses() {
    const actType = studentExerciseTypes[studentCurrentExIndex];
    const sents = currentStudentAssignment.sentencesPerActivity[actType] || [];
    const responses = [];

    const area = document.getElementById('exercise-interactive-area');

    if (actType === 'match') {
        sents.forEach((s, idx) => {
            const tile = area.querySelector(`.match-t-tile[data-id="${idx}"]`);
            const isDone = tile && tile.classList.contains('correct-match');
            responses.push({
                prompt: s.t,
                studentAnswer: isDone ? s.tr : '(Unmatched)',
                correctAnswer: s.tr,
                isCorrect: isDone,
                points: isDone ? 1 : 0
            });
        });
    } else if (actType === 'jumbled') {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const slot = block.querySelector('.jumble-answer-slot');
            const studentText = Array.from(slot.querySelectorAll('.jumble-word-tile')).map(t => t.innerText).join(' ').trim();
            const isCorrect = normalizeString(studentText) === normalizeString(s.t);

            responses.push({
                prompt: s.tr,
                studentAnswer: studentText || '(Empty)',
                correctAnswer: s.t,
                isCorrect: isCorrect,
                points: isCorrect ? 1 : 0
            });
        });
    } else if (actType === 'nospaces') {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const unrevealed = block.querySelectorAll('.space-inner:not(.revealed-space)');
            const wrongClicks = parseInt(block.dataset.wrongClicks || "0", 10);
            
            const isFullyCorrect = (unrevealed.length === 0) && (wrongClicks === 0);
            const isDoneWithMistakes = (unrevealed.length === 0) && (wrongClicks > 0);

            let points = 0;
            if (isFullyCorrect) points = 1;
            else if (isDoneWithMistakes) points = 0.5;

            responses.push({
                prompt: s.tr,
                studentAnswer: (unrevealed.length === 0) ? s.t : `(Incomplete - ${unrevealed.length} gaps left)`,
                correctAnswer: s.t,
                isCorrect: isFullyCorrect,
                points: points
            });
        });
    } else if (actType === 'vowels' || actType === 'cons') {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const boxes = Array.from(block.querySelectorAll('.letter-box'));
            const allCorrect = boxes.every(b => b.classList.contains('correct-input'));

            responses.push({
                prompt: s.tr,
                studentAnswer: allCorrect ? s.t : '(Incomplete/Incorrect letters)',
                correctAnswer: s.t,
                isCorrect: allCorrect,
                points: allCorrect ? 1 : 0
            });
        });
    } else if (actType === 'gap-en' || actType === 'gap-t') {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const input = block.querySelector('.gap-inline-input');
            const ans = input ? input.value.trim() : '';
            const correct = input ? input.dataset.correct : '';
            const normAns = normalizeString(ans);
            const normCorrect = normalizeString(correct);

            const isCorrect = normAns.length > 0 && normCorrect.length > 0 && (normAns === normCorrect);

            responses.push({
                prompt: s.t,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No gap answer set)',
                isCorrect: isCorrect,
                points: isCorrect ? 1 : 0
            });
        });
    } else if (actType === 'faulty') {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const input = block.querySelector('.full-typing-input');
            const ans = input ? input.value.trim() : '';
            const correct = (s.tr || block.dataset.correct || '').trim();

            const evalResult = evaluateTextSimilarity(ans, correct);

            responses.push({
                prompt: `Correct English for: "${s.t}" (Faulty was: "${s.faultyTr || getOrGenerateFaultyTr(s)}")`,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No markscheme translation set)',
                isCorrect: evalResult.points === 1,
                points: evalResult.points
            });
        });
    } else {
        area.querySelectorAll('.student-item-block').forEach((block, idx) => {
            const s = sents[idx];
            const input = block.querySelector('.full-typing-input');
            const ans = input ? input.value.trim() : '';
            const correct = (block.dataset.correct || s.tr || s.t || '').trim();

            const evalResult = evaluateTextSimilarity(ans, correct);

            responses.push({
                prompt: s.t || s.tr,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No markscheme translation set)',
                isCorrect: evalResult.points === 1,
                points: evalResult.points
            });
        });
    }

    studentAnswersState[actType] = responses;
}
function nextStudentExercise() {
    saveStudentCurrentExerciseResponses();
    if (studentCurrentExIndex < studentExerciseTypes.length - 1) {
        studentCurrentExIndex++;
        renderCurrentStudentExercise();
    }
}

function prevStudentExercise() {
    saveStudentCurrentExerciseResponses();
    if (studentCurrentExIndex > 0) {
        studentCurrentExIndex--;
        renderCurrentStudentExercise();
    }
}

function normalizeString(str) {
    return (str || "").toString().toLowerCase().trim().replace(/[.,!?;:'"«»()]/g, '').replace(/\s+/g, ' ');
}

async function submitStudentWork() {
    if (!currentUser || !currentUser.email) return alert("Please sign in with your school Google account first.");

    saveStudentCurrentExerciseResponses();

    let earned = 0;
    let possible = 0;
    const detailedReport = [];

    studentExerciseTypes.forEach(actType => {
        const responses = studentAnswersState[actType] || [];
        responses.forEach(r => {
            earned += r.points;
            possible += 1;
        });

        detailedReport.push({
            activityType: actType,
            activityTitle: getCleanActivityTitle(actType, currentStudentAssignment.lang || "French"),
            responses: responses
        });
    });

    const pct = possible > 0 ? Math.round((earned / possible) * 100) : 0;

    const subData = {
        assignmentId: currentStudentAssignment.id || "",
        courseId: currentStudentAssignment.courseId || "",
        studentName: currentUser.displayName || 'Student',
        studentEmail: currentUser.email.toLowerCase(),
        totalEarned: earned,
        totalPossible: possible,
        overallGrade: earned,
        percentage: pct,
        detailedReport: detailedReport,
        isReviewed: false,
        submittedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
        await db.collection("submissions").add(subData);
        alert("🎉 Activity Submitted Successfully!\nYour work has been submitted to your teacher for review.");
        renderStudentPendingReviewCard(subData);
    } catch (err) {
        console.error("Submission failed:", err);
        alert("❌ Failed to save submission to database: " + err.message + "\nPlease check your Firestore database rules.");
    }
}
   async function previewActiveAssignmentAsStudent() {
    window.isTeacherPreview = true;
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const doc = await db.collection("assignments").doc(assignmentId).get();
    if (!doc.exists) return alert("Assignment not found.");

    currentStudentAssignment = doc.data();
    currentStudentAssignment.id = assignmentId;

    showPage('student-portal-page');

    const previewBanner = document.getElementById('teacher-preview-banner');
    if (previewBanner) previewBanner.style.display = 'flex';

    document.getElementById('student-login-box').style.display = 'none';
    const authTextEl = document.getElementById('student-auth-instruction-text');
    if (authTextEl) authTextEl.style.display = 'none';

    document.getElementById('student-profile-badge').style.display = 'inline-block';
    document.getElementById('student-display-name').innerText = (currentUser?.displayName || 'Teacher') + ' (Teacher Preview)';
    document.getElementById('student-display-email').innerText = `(${currentUser?.email || ''})`;

    const selectedActivities = currentStudentAssignment.selectedActivities || [];
    studentExerciseTypes = selectedActivities.filter(a => a !== 'study');
    studentCurrentExIndex = 0;
    studentAnswersState = {};

    const perActSentences = currentStudentAssignment.sentencesPerActivity || {};
    const hasStudySelected = selectedActivities.includes('study');

    if (hasStudySelected && perActSentences['study'] && perActSentences['study'].length > 0) {
        const refBanner = document.getElementById('student-reference-banner');
        if (refBanner) refBanner.style.display = 'block';
        let refHtml = '<table style="width:100%; border-collapse:collapse;"><thead><tr><th>Target Language</th><th>English Translation</th></tr></thead><tbody>';
        perActSentences['study'].forEach(s => { refHtml += `<tr><td><b>${s.t}</b></td><td>${s.tr}</td></tr>`; });
        refHtml += '</tbody></table>';
        const refBody = document.getElementById('ref-table-body');
        if (refBody) refBody.innerHTML = refHtml;
    } else {
        document.getElementById('student-reference-banner').style.display = 'none';
    }

    document.getElementById('student-marksheet-card').style.display = 'none';
    document.getElementById('student-pending-review-card').style.display = 'none';
    document.getElementById('student-active-exercise-card').style.display = 'block';
    document.getElementById('student-nav-actions').style.display = 'flex';

    renderCurrentStudentExercise();
}
function exitTeacherPreview() {
    window.isTeacherPreview = false;
    const previewBanner = document.getElementById('teacher-preview-banner');
    if (previewBanner) previewBanner.style.display = 'none';

    showPage('submissions-page');
    renderStudentSubmissionsTable();
}
async function duplicateCurrentAssignmentToClass() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const doc = await db.collection("assignments").doc(assignmentId).get();
    if (!doc.exists) return alert("Assignment not found.");

    const assign = doc.data();
    
    // Set editingAssignmentId to null so publishing creates a NEW assignment in the target course
    editingAssignmentId = null;

    const currentLang = assign.lang || meta.lang || "Target Language";
    
    const list = [
        {id:'study', label:'Sentence Table (Reference)'}, 
        {id:'match', label:'Match up'}, 
        {id:'nospaces', label:'No Spaces'}, 
        {id:'jumbled', label:'Unjumble'}, 
        {id:'gap-en', label:'Gap Fill (English)'}, 
        {id:'gap-t', label:`Gap Fill (${currentLang})`}, 
        {id:'vowels', label:'Missing Vowels'}, 
        {id:'cons', label:'Missing Consonants'}, 
        {id:'faulty', label:'Faulty Translation'}, 
        {id:'trans-en', label:'Translate (English)'}, 
        {id:'trans-target', label:`Translate (${currentLang})`}
    ];

    document.getElementById('activity-list').innerHTML = list.map(a => `
        <div class="activity-row">
            <input type="checkbox" value="${a.id}" id="chk-${a.id}" onchange="renderPerActivitySentenceBoxes()">
            <label for="chk-${a.id}" style="cursor:pointer; font-weight:500;">${a.label}</label>
        </div>
    `).join('');

    document.getElementById('builder-title').value = assign.title || '';
    
    const selActs = assign.selectedActivities || [];
    document.querySelectorAll('#activity-list input').forEach(cb => {
        cb.checked = selActs.includes(cb.value);
    });

    let detectedCount = 10;
    if (assign.sentencesPerActivity) {
        for (let actKey in assign.sentencesPerActivity) {
            if (actKey !== 'study' && assign.sentencesPerActivity[actKey].length > 0) {
                detectedCount = assign.sentencesPerActivity[actKey].length;
                break;
            }
        }
    }
    const sentCountSelect = document.getElementById('sentence-count');
    if (sentCountSelect) sentCountSelect.value = String(detectedCount);

    renderPerActivitySentenceBoxes(assign.sentencesPerActivity || null);

    document.getElementById('activity-menu').style.display = 'flex'; // CHANGED FROM 'block'
    document.getElementById('overlay').style.display = 'block';

    await openClassroomPublishSection();
    // Reset dates for new duplicate assignment
    document.getElementById('gc-due-date').value = '';
    document.getElementById('gc-schedule-date').value = '';

    const gcBtn = document.getElementById('gc-publish-btn');
    if (gcBtn) gcBtn.innerText = "📋 Duplicate & Publish to Selected Class";
}

async function downloadActiveAssignmentWorksheet() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const doc = await db.collection("assignments").doc(assignmentId).get();
    if (!doc.exists) return alert("Assignment not found.");

    const assign = doc.data();
    const docTitle = assign.title || "Sentence Builder";
    const docLang = assign.lang || "Target Language";
    const docYear = assign.year || "Year 9";
    const perAct = assign.sentencesPerActivity || {};
    const selectedActs = assign.selectedActivities || Object.keys(perAct);

    if (selectedActs.length === 0) return alert("No activities found in assignment.");

    const activityInstructions = {
        'match': 'Match each ' + docLang + ' sentence (1–10) with its correct English translation (A–J).',
        'nospaces': 'Rewrite the sentences adding correct spaces between the words.',
        'jumbled': 'Reorder the words to form correct ' + docLang + ' sentences.',
        'gap-en': 'Fill in the missing English words in the translations.',
        'gap-t': 'Fill in the missing ' + docLang + ' words in each sentence.',
        'vowels': 'Fill in the missing vowels to complete the sentences.',
        'cons': 'Fill in the missing consonants to complete the sentences.',
        'faulty': 'Find and correct the mistake in each English translation.',
        'trans-en': 'Translate the following ' + docLang + ' sentences into English.',
        'trans-target': 'Translate the following English sentences into ' + docLang + '.'
    };

    let contentHtml = 
        '<div class="header-block">' +
            '<div class="doc-main-title">' + docTitle.toUpperCase() + ' <span class="doc-sub-info">' + docLang + ' | ' + docYear + '</span></div>' +
            '<table class="student-info-table">' +
                '<tr>' +
                    '<td><b>Name:</b> ___________________________</td>' +
                    '<td><b>Class:</b> ____________</td>' +
                    '<td><b>Date:</b> ____________</td>' +
                '</tr>' +
            '</table>' +
        '</div>';

    let answerKeyHtml = "<br clear='all' style='page-break-before:always' /><div class='answer-key-section'><table class='exercise-title-table'><tr><td><div class='ex-title'>Answer Key</div></td></tr></table>";
    let exerciseCounter = 1;

    selectedActs.forEach((type) => {
        const isStudy = (type === 'study');
        const boxTitle = isStudy ? "Sentence Table" : ("Exercise " + exerciseCounter + ": " + getCleanActivityTitle(type, docLang));
        if (!isStudy) exerciseCounter++;

        const textInstruction = isStudy ? "" : (activityInstructions[type] || "");
        const instructionMarkup = textInstruction ? ('<div class="ex-instruction">' + textInstruction + '</div>') : '';

        let activityHtml = 
            '<div class="activity-container">' +
                '<table class="exercise-title-table">' +
                    '<tr>' +
                        '<td>' +
                            '<div class="ex-title">' + boxTitle + '</div>' +
                            instructionMarkup +
                        '</td>' +
                    '</tr>' +
                '</table>';

        const currentSents = perAct[type] || [];
        let activityAnswersHtml = "";
        if (!isStudy) activityAnswersHtml += '<div class="ak-group"><h3>' + boxTitle + '</h3><ol class="answer-list">';

        const usedGapWords = new Set();

        if (type === 'study') {
            activityHtml += '<table class="sentence-grid-table"><tr><th>' + docLang + '</th><th>English Translation</th></tr>';
            currentSents.forEach(s => { 
                activityHtml += '<tr><td style="padding:1pt 5pt; mso-para-margin:0pt;"><b>' + s.t + '</b></td><td class="blue" style="padding:1pt 5pt; mso-para-margin:0pt;">' + s.tr + '</td></tr>'; 
            });
            activityHtml += '</table>';
        } else if (type === 'match') {
            const shuf = shuffleArray(currentSents);
            activityHtml += '<table class="match-table">';
            currentSents.forEach((s, i) => {
                activityHtml += '<tr>' +
                    '<td style="width:45%; padding: 3pt 0;"><b>' + (i+1) + '.</b> ' + s.t + '</td>' +
                    '<td style="width:10%; text-align:center; padding: 3pt 0;">[ &nbsp; ]</td>' +
                    '<td style="width:45%; padding: 3pt 0;"><b>' + String.fromCharCode(65+i) + '.</b> ' + shuf[i].tr + '</td>' +
                '</tr>';
                const matchIndex = shuf.indexOf(s);
                const correctLetter = String.fromCharCode(65 + (matchIndex >= 0 ? matchIndex : 0));
                activityAnswersHtml += '<li>' + correctLetter + '</li>';
            });
            activityHtml += '</table>';
        } else {
            const needsWritingLine = ['nospaces', 'jumbled', 'faulty', 'trans-en', 'trans-target'].includes(type);

            currentSents.forEach((s, i) => {
                let out = s.t, hint = '<span class="blue">(' + s.tr + ')</span>';
                let answerText = s.t;

                if (type === 'vowels' || type === 'cons') {
                    const pattern = (type === 'vowels') ? /[aeiouàéèíóúü]/gi : /[bcdfghjklmnpqrstvwxyz]/gi;
                    out = s.t.split(' ').map(word => word.replace(pattern, ' __ ')).join('&nbsp;&nbsp;');
                } else if (type === 'nospaces') {
                    out = s.t.replace(/\s+/g, '').toLowerCase();
                } else if (type === 'jumbled') {
                    out = shuffleArray(s.t.split(' ')).join(' / ');
                } else if (type === 'gap-t') {
                    let rawTarget = s.t;
                    if (!extractGapWord(rawTarget).fullMatch) {
                        rawTarget = addAsteriskToGapWord(rawTarget, usedGapWords);
                    }
                    const gapRes = extractGapWord(rawTarget);
                    if (gapRes.fullMatch) {
                        out = rawTarget.replace(gapRes.fullMatch, '___________');
                    } else {
                        const words = rawTarget.split(' ');
                        const targetIdx = Math.floor(words.length / 2);
                        words[targetIdx] = '___________';
                        out = words.join(' ');
                    }
                    answerText = rawTarget.replace(/\*/g, '');
                } else if (type === 'gap-en') {
                    out = s.t;
                    let rawEnglish = s.tr;
                    if (!extractGapWord(rawEnglish).fullMatch) {
                        rawEnglish = addAsteriskToGapWord(rawEnglish, usedGapWords);
                    }
                    const gapResEn = extractGapWord(rawEnglish);
                    let maskedTr = rawEnglish;
                    if (gapResEn.fullMatch) {
                        maskedTr = rawEnglish.replace(gapResEn.fullMatch, '___________');
                    } else {
                        const wordsEn = rawEnglish.split(' ');
                        const targetIdxEn = Math.floor(wordsEn.length / 2);
                        wordsEn[targetIdxEn] = '___________';
                        maskedTr = wordsEn.join(' ');
                    }
                    hint = '<span class="blue">(' + maskedTr + ')</span>';
                    answerText = rawEnglish.replace(/\*/g, '');
                } else if (type === 'trans-en') {
                    out = s.t; hint = ""; answerText = s.tr;
                } else if (type === 'trans-target') {
                    out = '<span class="blue">' + s.tr + '</span>'; hint = "";
                } else if (type === 'faulty') {
                    out = s.t + ' = <span class="blue">' + (s.faultyTr || s.tr) + '</span>';
                    answerText = s.tr;
                    activityHtml += 
                        '<div class="exercise-item-wrapper">' +
                            '<p class="exercise-item"><b>' + (i+1) + '.</b> ' + out + '</p>' +
                            (needsWritingLine ? '<p class="writing-line">&nbsp;</p>' : '') +
                        '</div>';
                    activityAnswersHtml += '<li>' + s.t + ' = <span class="blue">' + s.tr + '</span></li>';
                    return;
                }

                activityHtml += 
                    '<div class="exercise-item-wrapper">' +
                        '<p class="exercise-item"><b>' + (i+1) + '.</b> ' + out + ' ' + hint + '</p>' +
                        (needsWritingLine ? '<p class="writing-line">&nbsp;</p>' : '') +
                    '</div>';
                activityAnswersHtml += '<li>' + answerText + '</li>';
            });
        }

        activityHtml += '</div>';
        contentHtml += activityHtml;
        if (!isStudy) { activityAnswersHtml += '</ol></div>'; answerKeyHtml += activityAnswersHtml; }
    });

    answerKeyHtml += '</div>';
    contentHtml += answerKeyHtml;

    const fullDoc = 
        '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
        '<head>' +
        '<meta charset="utf-8">' +
        '<!--[if gte mso 9]>' +
        '<xml>' +
         '<w:WordDocument>' +
          '<w:View>Print</w:View>' +
          '<w:Zoom>100</w:Zoom>' +
         '</w:WordDocument>' +
        '</xml>' +
        '<![endif]-->' +
        '<style>' +
            '@page { size: A4 portrait; margin: 2cm; } ' +
            'body { font-family: "Segoe UI", Arial, sans-serif; font-size: 12pt; color: #1e293b; line-height: 1.35; } ' +
            'p { margin: 0; padding: 0; } ' +

            '.header-block { margin-bottom: 16pt; } ' +
            '.doc-main-title { font-size: 16pt; font-weight: bold; text-transform: uppercase; color: #0f172a; margin-bottom: 8pt; } ' +
            '.doc-sub-info { font-size: 11pt; font-weight: normal; text-transform: none; color: #64748b; margin-left: 10px; } ' +
            '.student-info-table { width: 100%; border-collapse: collapse; border: 1px solid #cbd5e1; margin-top: 6pt; background-color: #fafafa; } ' +
            '.student-info-table td { border: 1px solid #cbd5e1; padding: 5pt 10pt; font-size: 10pt; font-weight: normal; color: #334155; } ' +

            '.exercise-title-table { width: 100%; border-collapse: collapse; margin-top: 14pt; margin-bottom: 10pt; } ' +
            '.exercise-title-table td { background-color: #f8fafc; border-left: 4px solid #8b5cf6; border-top: 1px solid #e2e8f0; border-right: 1px solid #e2e8f0; border-bottom: 1px solid #e2e8f0; padding: 6pt 10pt; mso-para-margin: 0pt !important; } ' +
            '.ex-title { font-size: 12pt; font-weight: bold; color: #1e293b; margin: 0; padding: 0; mso-para-margin: 0pt !important; } ' +
            '.ex-instruction { font-size: 10pt; font-style: italic; color: #64748b; margin-top: 3pt; padding: 0; mso-para-margin: 0pt !important; } ' +

            '.sentence-grid-table { width: 100%; border-collapse: collapse; margin-top: 2pt; margin-bottom: 8pt; } ' +
            '.sentence-grid-table th { border: 1px solid #cbd5e1; padding: 2pt 5pt !important; font-size: 10pt !important; background-color: #f1f5f9; text-align: left; font-weight: bold; mso-para-margin: 0pt !important; mso-space-above: 0pt !important; mso-space-below: 0pt !important; } ' +
            '.sentence-grid-table td { border: 1px solid #cbd5e1; padding: 1pt 5pt !important; font-size: 10pt !important; line-height: 1.1 !important; mso-para-margin: 0pt !important; mso-space-above: 0pt !important; mso-space-below: 0pt !important; } ' +

            '.activity-container { page-break-inside: avoid; margin-bottom: 16pt; } ' +
            '.exercise-item-wrapper { margin-bottom: 14pt; page-break-inside: avoid; } ' +
            '.exercise-item { font-size: 12pt; margin: 0; padding: 0; color: #0f172a; line-height: 1.35; mso-para-margin: 0pt; } ' +

            '.writing-line { border-bottom: 1pt solid #94a3b8; font-size: 1pt; line-height: 1pt; margin-top: 16pt !important; margin-bottom: 4pt !important; mso-para-margin-top: 16pt !important; mso-para-margin-bottom: 4pt !important; } ' +

            '.match-table { width: 100%; border-collapse: collapse; margin-bottom: 10pt; font-size: 12pt; } ' +
            '.match-table td { font-size: 12pt; border-bottom: 0.5pt solid #f1f5f9; } ' +

            '.answer-key-section { font-size: 10pt; } ' +
            '.ak-group { margin-bottom: 10pt; } ' +
            '.ak-group h3 { font-size: 10pt; font-weight: bold; margin-bottom: 3pt; margin-top: 6pt; color: #334155; } ' +
            '.answer-list { margin: 0; padding-left: 20px; font-size: 10pt; line-height: 1.25; } ' +
            '.answer-list li { font-size: 10pt; margin-bottom: 2pt; } ' +

            '.blue { color: #2980b9; font-style: italic; } ' +
        '</style>' +
        '</head>' +
        '<body>' + contentHtml + '</body>' +
        '</html>';

    saveAs(new Blob(['\ufeff', fullDoc], { type: 'application/msword' }), docTitle + '_Worksheet.doc');
}
/* =========================
   TEACHER SUBMISSIONS DASHBOARD & EDITING
========================= */
async function loadTeacherSubmissions() {
    const courseSelect = document.getElementById('sub-filter-course');
    const assignSelect = document.getElementById('sub-filter-assignment');
    const tbody = document.getElementById('submissions-table-body');
    const infoBanner = document.getElementById('active-assignment-info');

    if (infoBanner) infoBanner.style.display = 'none';
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Select a course and assignment to view grades.</td></tr>`;

    if (courseSelect) {
        courseSelect.innerHTML = '<option value="">Loading courses...</option>';
        courseSelect.value = "";
    }
    if (assignSelect) {
        assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>';
        assignSelect.value = "";
    }

    try {
        const loaded = await ensureGapiClassroomLoaded();
        if (!loaded) {
            if (courseSelect) courseSelect.innerHTML = '<option value="">Failed to connect to Classroom</option>';
            return;
        }

        const res = await gapi.client.classroom.courses.list({ teacherId: 'me', courseStates: 'ACTIVE' });
        const courses = res.result.courses || [];

        if (courses.length === 0) {
            if (courseSelect) courseSelect.innerHTML = '<option value="">No active Google Classroom courses</option>';
            return;
        }

        if (courseSelect) {
            courseSelect.innerHTML = '<option value="">-- Choose Classroom Course --</option>' +
                courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
            courseSelect.value = "";
        }

    } catch (e) {
        if (courseSelect) courseSelect.innerHTML = `<option value="">Error loading courses: ${e.message}</option>`;
    }
}

async function loadCourseAssignments(courseId) {
    const assignSelect = document.getElementById('sub-filter-assignment');
    const infoBanner = document.getElementById('active-assignment-info');
    const tbody = document.getElementById('submissions-table-body');

    if (infoBanner) infoBanner.style.display = 'none';
    if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Select an assignment to view grades.</td></tr>`;

    if (!courseId) {
        if (assignSelect) {
            assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>';
            assignSelect.value = "";
        }
        return;
    }

    if (assignSelect) {
        assignSelect.innerHTML = '<option value="">Loading tasks...</option>';
    }

    try {
        // Query courseId field (matches Firestore assignments schema)
        let snap = await db.collection("assignments")
            .where("courseId", "==", courseId)
            .get();

        if (snap.empty) {
            // Fallback check for classroomCourseId if legacy assignments exist
            snap = await db.collection("assignments")
                .where("classroomCourseId", "==", courseId)
                .get();
        }

        if (snap.empty) {
            if (assignSelect) {
                assignSelect.innerHTML = '<option value="">No assignments found for this course</option>';
                assignSelect.value = "";
            }
            return;
        }

        // Convert Firestore docs to an array
        const docsData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        // Sort descending by creation date (latest set date at the top)
        docsData.sort((a, b) => {
            const getTimestamp = (item) => {
                const d = item.createdAt || item.updatedAt;
                if (!d) return 0;
                if (typeof d.toMillis === 'function') return d.toMillis();
                if (typeof d.toDate === 'function') return d.toDate().getTime();
                if (d instanceof Date) return d.getTime();
                if (typeof d === 'number') return d;
                if (typeof d === 'string') return new Date(d).getTime() || 0;
                return 0;
            };
            return getTimestamp(b) - getTimestamp(a);
        });

        if (assignSelect) {
            assignSelect.innerHTML = '<option value="">-- Choose Assignment --</option>' +
                docsData.map(doc => `<option value="${doc.id}">${doc.title || 'Untitled Assignment'}</option>`).join('');
            assignSelect.value = "";
        }

    } catch (e) {
        if (assignSelect) assignSelect.innerHTML = `<option value="">Error loading tasks: ${e.message}</option>`;
    }
}
async function renderStudentSubmissionsTable() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    const tbody = document.getElementById('submissions-table-body');
    const infoBanner = document.getElementById('active-assignment-info');

    if (!assignmentId) {
        if (infoBanner) infoBanner.style.display = 'none';
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b;">Select an assignment to view grades.</td></tr>`;
        return;
    }

    const assignDoc = await db.collection("assignments").doc(assignmentId).get();
    if (assignDoc.exists) {
        const assign = assignDoc.data();
        if (infoBanner) {
            infoBanner.style.display = 'flex';
            document.getElementById('active-task-title').innerText = assign.title || "Untitled Assignment";
            
            let metaText = `Language: ${assign.lang || 'N/A'} | Max Score: ${assign.maxPoints || 10}`;
            if (assign.dueDate) {
                metaText += ` | Due: ${new Date(assign.dueDate).toLocaleString([], {dateStyle:'short', timeStyle:'short'})}`;
            }
            if (assign.scheduleDate) {
                metaText += ` | Scheduled: ${new Date(assign.scheduleDate).toLocaleString([], {dateStyle:'short', timeStyle:'short'})}`;
            }
            document.getElementById('active-task-metadata').innerText = metaText;
        }
    }

    db.collection("submissions").where("assignmentId", "==", assignmentId).onSnapshot(snap => {
        tbody.innerHTML = '';
        
        const subCount = snap.size;
        const counterBadge = document.getElementById('submission-counter-badge');
        if (counterBadge) counterBadge.innerText = `📥 ${subCount} Submitted`;

        if (snap.empty) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:#64748b; padding:20px;">No student submissions found for this task yet.</td></tr>`;
            return;
        }

        snap.forEach(doc => {
            const sub = doc.data();
            const subId = doc.id;

            tbody.innerHTML += `
                <tr>
                    <td><b>${sub.studentName}</b></td>
                    <td>${sub.studentEmail}</td>
                    <td>${sub.submittedAt ? sub.submittedAt.toDate().toLocaleString() : 'Just now'}</td>
                    <td>
                        ${sub.totalEarned} / ${sub.totalPossible} (${sub.percentage}%)<br>
                        <button onclick="inspectStudentAnswers('${subId}')" class="btn-info" style="font-size:11px; padding:3px 8px; margin-top:4px;">🔍 Edit Marks & Answers</button>
                    </td>
                    <td>
                        <input type="number" id="grade-${subId}" value="${sub.overallGrade !== undefined ? sub.overallGrade : sub.totalEarned}" style="width:50px; padding:4px;"> 
                        / <input type="number" id="possible-${subId}" value="${sub.totalPossible}" style="width:50px; padding:4px;">
                    </td>
                    <td><input type="text" id="comment-${subId}" value="${sub.teacherComment || ''}" style="width:100%; padding:4px;"></td>
                    <td>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button onclick="saveAndSyncGrade('${subId}')" class="btn-purple" style="font-size:12px;">🚀 Sync</button>
                            <button onclick="deleteStudentSubmission('${subId}')" class="btn-danger" style="font-size:12px;">🗑️ Delete</button>
                        </div>
                    </td>
                </tr>
            `;
        });
    });
}

async function deleteStudentSubmission(subId) {
    if (!confirm("Are you sure you want to delete this student's submission? This action cannot be undone.")) return;

    try {
        await db.collection("submissions").doc(subId).delete();
        alert("Student submission deleted successfully!");
        renderStudentSubmissionsTable();
    } catch (e) {
        console.error("Error deleting submission:", e);
        alert("Error deleting submission: " + e.message);
    }
}
async function editCurrentAssignment() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const doc = await db.collection("assignments").doc(assignmentId).get();
    if (!doc.exists) return alert("Assignment not found.");

    const assign = doc.data();
    editingAssignmentId = assignmentId;

    const currentLang = assign.lang || meta.lang || "Target Language";
    
    const list = [
        {id:'study', label:'Sentence Table (Reference)'}, 
        {id:'match', label:'Match up'}, 
        {id:'nospaces', label:'No Spaces'}, 
        {id:'jumbled', label:'Unjumble'}, 
        {id:'gap-en', label:'Gap Fill (English)'}, 
        {id:'gap-t', label:`Gap Fill (${currentLang})`}, 
        {id:'vowels', label:'Missing Vowels'}, 
        {id:'cons', label:'Missing Consonants'}, 
        {id:'faulty', label:'Faulty Translation'}, 
        {id:'trans-en', label:'Translate (English)'}, 
        {id:'trans-target', label:`Translate (${currentLang})`}
    ];

    document.getElementById('activity-list').innerHTML = list.map(a => `
        <div class="activity-row">
            <input type="checkbox" value="${a.id}" id="chk-${a.id}" onchange="renderPerActivitySentenceBoxes()">
            <label for="chk-${a.id}" style="cursor:pointer; font-weight:500;">${a.label}</label>
        </div>
    `).join('');

    document.getElementById('builder-title').value = assign.title || '';
    
    const selActs = assign.selectedActivities || [];
    document.querySelectorAll('#activity-list input').forEach(cb => {
        cb.checked = selActs.includes(cb.value);
    });

    let detectedCount = 10;
    if (assign.sentencesPerActivity) {
        for (let actKey in assign.sentencesPerActivity) {
            if (actKey !== 'study' && assign.sentencesPerActivity[actKey].length > 0) {
                detectedCount = assign.sentencesPerActivity[actKey].length;
                break;
            }
        }
    }
    const sentCountSelect = document.getElementById('sentence-count');
    if (sentCountSelect) sentCountSelect.value = String(detectedCount);

    renderPerActivitySentenceBoxes(assign.sentencesPerActivity || null);

    document.getElementById('activity-menu').style.display = 'flex'; // CHANGED FROM 'block'
    document.getElementById('overlay').style.display = 'block';

    await openClassroomPublishSection();

    if (assign.courseId) {
        // Ensure this matches your HTML element ID ('course-select' or 'gc-course-select')
        const courseSelectElem = document.getElementById('course-select') || document.getElementById('gc-course-select');
        if (courseSelectElem) {
            courseSelectElem.value = assign.courseId;
        }
        
        await loadCourseTopics(assign.courseId);
        await loadClassroomStudents(assign.courseId); // Load the students for this course when editing!
        
        if (assign.topicId) {
            const topicSelectElem = document.getElementById('gc-topic-select');
            if (topicSelectElem) topicSelectElem.value = assign.topicId;
        }
    }

    if (assign.dueDate) {
        const d = new Date(assign.dueDate);
        const pad = (n) => String(n).padStart(2, '0');
        document.getElementById('gc-due-date').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
        document.getElementById('gc-due-date').value = '';
    }

    if (assign.scheduleDate) {
        const d = new Date(assign.scheduleDate);
        const pad = (n) => String(n).padStart(2, '0');
        document.getElementById('gc-schedule-date').value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } else {
        document.getElementById('gc-schedule-date').value = '';
    }

    const gcBtn = document.getElementById('gc-publish-btn');
    if (gcBtn) gcBtn.innerText = "🔄 Update Assignment & Sync Classroom";
}

// 📌 GLOBAL EVENT LISTENER (Moved outside of editCurrentAssignment)
document.addEventListener('DOMContentLoaded', () => {
    const courseSelect = document.getElementById('course-select') || document.getElementById('gc-course-select');
    if (courseSelect) {
        courseSelect.onchange = async (e) => {
            const courseId = e.target.value;
            if (courseId && !courseId.startsWith("Loading")) {
                await loadClassroomStudents(courseId);
                if (typeof loadGoogleClassroomTopics === 'function') {
                    await loadGoogleClassroomTopics(courseId);
                } else if (typeof loadCourseTopics === 'function') {
                    await loadCourseTopics(courseId);
                }
            } else {
                classroomStudents = [];
                selectedClassroomStudentIds = [];
                studentSelectorCourseId = null;
                const summary = document.getElementById('student-selection-summary');
                const list = document.getElementById('student-list');
                if (summary) summary.innerText = "Select a class";
                if (list) list.innerHTML = '';
            }
        };
    }
});

async function deleteCurrentAssignment() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");
    if (!confirm("Are you sure you want to delete this assignment?")) return;

    if (!auth.currentUser) return alert("Please sign in first.");

    try {
        const doc = await db.collection("assignments").doc(assignmentId).get();
        if (doc.exists) {
            const assign = doc.data();
            if (assign.courseId && assign.gClassroomAssignmentId) {
                try {
                    await ensureGapiClassroomLoaded();
                    await gapi.client.classroom.courses.courseWork.delete({
                        courseId: assign.courseId,
                        id: assign.gClassroomAssignmentId
                    });
                } catch (gcErr) {
                    console.warn("Could not delete from Google Classroom API:", gcErr);
                }
            }
        }

        // Firestore document deletion
        await db.collection("assignments").doc(assignmentId).delete();
        alert("Assignment deleted successfully!");
        
        document.getElementById('active-assignment-info').style.display = 'none';
        const courseId = document.getElementById('sub-filter-course').value;
        loadCourseAssignments(courseId);
    } catch (e) {
        alert("Error deleting assignment: " + e.message);
    }
}

async function syncAllClassroomGrades() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const snap = await db.collection("submissions").where("assignmentId", "==", assignmentId).get();
    if (snap.empty) return alert("No student submissions found to sync.");

    let synced = 0;
    let errors = 0;

    for (let doc of snap.docs) {
        try {
            await saveAndSyncGrade(doc.id);
            synced++;
        } catch (e) {
            errors++;
            console.error(`Failed to sync submission ${doc.id}:`, e);
        }
    }
    
    alert(`Sync finished! ${synced} grade(s) synced successfully${errors > 0 ? `, ${errors} failed` : ''}.`);
}

async function inspectStudentAnswers(subId) {
    const doc = await db.collection("submissions").doc(subId).get();
    if (!doc.exists) return;

    const sub = doc.data();
    const modalContent = document.getElementById('answers-modal-content');
    
    let html = `
        <div style="background:#f8fafc; padding:12px; border-radius:8px; margin-bottom:15px; border:1px solid #e2e8f0;">
            <b>Student:</b> ${sub.studentName} (${sub.studentEmail})<br>
            <b>Auto Score:</b> ${sub.totalEarned} / ${sub.totalPossible} (${sub.percentage}%)
        </div>
    `;

    const report = sub.detailedReport || [];
    if (report.length === 0) {
        html += '<p style="color:#64748b; font-style:italic;">No itemized answer report available for this submission.</p>';
    } else {
        report.forEach((act, actIdx) => {
            html += `
                <div style="border:1px solid #cbd5e1; border-radius:8px; margin-bottom:15px; overflow:hidden;">
                    <div style="background:#e2e8f0; padding:10px 15px; font-weight:bold; color:#0f172a;">
                        Exercise ${actIdx + 1}: ${act.activityTitle}
                    </div>
                    <div style="padding:12px;">
                        ${(act.responses || []).map((r, i) => {
                            const currentScore = r.points !== undefined ? r.points : (r.isCorrect ? 1 : 0);
                            return `
                                <div style="padding:8px 0; border-bottom:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                                    <div style="flex:1;">
                                        <div><b>${i + 1}. Prompt:</b> ${r.prompt}</div>
                                        <div style="color:${currentScore >= 1 ? '#10b981' : (currentScore > 0 ? '#d97706' : '#ef4444')}; margin-top:2px;">
                                            <b>Student Answer:</b> ${r.studentAnswer}
                                        </div>
                                        ${currentScore < 1 ? `<div style="color:#2563eb; font-weight:bold; font-size:12px; margin-top:3px;"><b>Correct Answer:</b> ${r.correctAnswer}</div>` : ''}
                                    </div>
                                    <div style="display:flex; align-items:center; gap:4px; font-weight:bold; background:#f8fafc; padding:4px 8px; border-radius:6px; border:1px solid #cbd5e1;">
                                        <input type="number" step="0.5" min="0" max="1" 
                                            class="item-score-input" 
                                            data-act-idx="${actIdx}" 
                                            data-resp-idx="${i}" 
                                            value="${currentScore}" 
                                            style="width:50px; padding:4px; text-align:center; border:1px solid #94a3b8; border-radius:4px; font-weight:bold;">
                                        <span>/ 1 pt</span>
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            `;
        });

        html += `
            <button onclick="saveItemizedMarks('${subId}')" class="btn-purple" style="width:100%; height:42px; font-size:15px; margin-top:10px;">
                💾 Save Sentence Marks & Recalculate Total
            </button>
        `;
    }

    modalContent.innerHTML = html;
    document.getElementById('answers-modal').style.display = 'block';
    document.getElementById('overlay').style.display = 'block';
}

async function saveItemizedMarks(subId) {
    const doc = await db.collection("submissions").doc(subId).get();
    if (!doc.exists) return;

    const sub = doc.data();
    const detailedReport = sub.detailedReport || [];

    const inputs = document.querySelectorAll('.item-score-input');
    let newEarnedTotal = 0;

    inputs.forEach(input => {
        const actIdx = parseInt(input.dataset.actIdx, 10);
        const respIdx = parseInt(input.dataset.respIdx, 10);
        const scoreVal = parseFloat(input.value) || 0;

        if (detailedReport[actIdx] && detailedReport[actIdx].responses[respIdx]) {
            detailedReport[actIdx].responses[respIdx].points = scoreVal;
            detailedReport[actIdx].responses[respIdx].isCorrect = (scoreVal >= 1);
            newEarnedTotal += scoreVal;
        }
    });

    const totalPossible = sub.totalPossible || 10;
    const pct = totalPossible > 0 ? Math.round((newEarnedTotal / totalPossible) * 100) : 0;

    try {
        await db.collection("submissions").doc(subId).update({
            detailedReport: detailedReport,
            totalEarned: newEarnedTotal,
            overallGrade: newEarnedTotal,
            percentage: pct,
            isReviewed: true
        });

        alert(`✅ Sentence marks saved successfully!\nUpdated Total Score: ${newEarnedTotal} / ${totalPossible} (${pct}%)`);
        closeModals();
        renderStudentSubmissionsTable();
    } catch (e) {
        console.error("Error saving sentence marks:", e);
        alert("Error saving sentence marks: " + e.message);
    }
}

async function saveAndSyncGrade(subId) {
    const gradeInput = document.getElementById(`grade-${subId}`);
    const possibleInput = document.getElementById(`possible-${subId}`);
    const commentInput = document.getElementById(`comment-${subId}`);

    if (!gradeInput || !possibleInput) return alert("Grade inputs not found.");

    const gradeVal = parseFloat(gradeInput.value) || 0;
    const possibleVal = parseFloat(possibleInput.value) || 1;
    const commentVal = commentInput ? commentInput.value.trim() : "";

    const pct = possibleVal > 0 ? Math.round((gradeVal / possibleVal) * 100) : 0;

    try {
        await db.collection("submissions").doc(subId).update({
            overallGrade: gradeVal,
            totalPossible: possibleVal,
            percentage: pct,
            teacherComment: commentVal,
            isReviewed: true // Releases reviewed mark & feedback to student portal
        });

        const subDoc = await db.collection("submissions").doc(subId).get();
        if (!subDoc.exists) return alert("Submission not found in database.");
        const sub = subDoc.data();

        const assignDoc = await db.collection("assignments").doc(sub.assignmentId).get();
        if (!assignDoc.exists) {
            alert("Grade saved locally! (Assignment record not found).");
            return;
        }
        const assign = assignDoc.data();

        if (!assign.courseId || !assign.gClassroomAssignmentId) {
            alert("Grade saved locally! (Not linked to Google Classroom).");
            return;
        }

        const isLoaded = await ensureGapiClassroomLoaded();
        if (!isLoaded) {
            alert("Grade saved locally! Could not connect to Google Classroom API.");
            return;
        }

        let studentUserId = null;
        try {
            const rosterRes = await gapi.client.classroom.courses.students.list({
                courseId: assign.courseId
            });
            const students = rosterRes.result.students || [];
            const found = students.find(st => st.profile && st.profile.emailAddress && st.profile.emailAddress.toLowerCase() === sub.studentEmail.toLowerCase());
            if (found) {
                studentUserId = found.userId;
            }
        } catch (rErr) {
            console.warn("Could not fetch course roster:", rErr);
        }

        if (!studentUserId) {
            studentUserId = sub.studentEmail;
        }

        const listRes = await gapi.client.classroom.courses.courseWork.studentSubmissions.list({
            courseId: assign.courseId,
            courseWorkId: assign.gClassroomAssignmentId,
            userId: studentUserId
        });

        const gcSubs = listRes.result.studentSubmissions || [];
        if (gcSubs.length === 0) {
            alert("Grade saved locally! Student submission not found in Google Classroom.");
            return;
        }

        const studentGcSubId = gcSubs[0].id;

        await gapi.client.classroom.courses.courseWork.studentSubmissions.patch({
            courseId: assign.courseId,
            courseWorkId: assign.gClassroomAssignmentId,
            id: studentGcSubId,
            updateMask: "draftGrade,assignedGrade",
            resource: { draftGrade: gradeVal, assignedGrade: gradeVal }
        });

        if (commentVal) {
            try {
                const commentUrl = `https://classroom.googleapis.com/v1/courses/${assign.courseId}/courseWork/${assign.gClassroomAssignmentId}/studentSubmissions/${studentGcSubId}/comments`;
                await fetch(commentUrl, {
                    method: 'POST',
                    headers: { 
                        'Authorization': `Bearer ${localStorage.getItem('oauth_token')}`, 
                        'Content-Type': 'application/json' 
                    },
                    body: JSON.stringify({ commentText: commentVal })
                });
            } catch (cErr) {
                console.warn("Could not post private comment:", cErr);
            }
        }

        alert(`✅ Grade (${gradeVal}/${possibleVal}) synced to Google Classroom for ${sub.studentName}!`);
    } catch (err) {
        console.error("Sync Error:", err);
        alert("Error syncing to Google Classroom: " + (err.message || "Unknown error"));
    }
}

function addIcon(p, t, pos, l, a) { 
    const b = document.createElement('div'); 
    b.className = `action-btn ${t}`; 
    b.innerText = l; 
    
    const posStyles = {
        'left': 'left:-15px; top:50%; transform:translateY(-50%);',
        'right': 'right:-15px; top:50%; transform:translateY(-50%);',
        'top-center': 'top:-15px; left:50%; transform:translateX(-50%);',
        'top-edge': 'top:-15px; left:20px;',
        'bottom-edge': 'bottom:-15px; left:20px;',
        'left-edge': 'left:-15px; top:20px;'
    };
    
    b.style.cssText = posStyles[pos]; 
    b.onclick = (e) => { e.stopPropagation(); a(); }; 
    p.appendChild(b); 
}

function normalizePair(a, b) {
    const first = (a.r < b.r || (a.r === b.r && a.c <= b.c)) ? a : b;
    const second = first === a ? b : a;

    return {
        a: { r: first.r, c: first.c },
        b: { r: second.r, c: second.c }
    };
}

function samePair(p1, p2) {
    return (
        p1.a.r === p2.a.r &&
        p1.a.c === p2.a.c &&
        p1.b.r === p2.b.r &&
        p1.b.c === p2.b.c
    );
}

function handleExcludeClick(r, cIdx) {
    const clickedCell = { r, c: cIdx };

    const alreadySelectedIdx = excludeSelection.findIndex(p => p.r === r && p.c === cIdx);
    if (alreadySelectedIdx > -1) {
        excludeSelection.splice(alreadySelectedIdx, 1);
        render(false);
        return;
    }

    excludeSelection.push(clickedCell);

    if (excludeSelection.length === 2) {
        toggleExcludedPair(excludeSelection[0], excludeSelection[1]);
    } else {
        render(false);
    }
}

function toggleExcludedPair(cellA, cellB) {
    const normalized = normalizePair(cellA, cellB);

    const existingIndex = excludedPairs.findIndex(pair =>
        samePair(pair, normalized)
    );

    if (existingIndex >= 0) {
        excludedPairs.splice(existingIndex, 1);
    } else {
        excludedPairs.push(normalized);
    }

    excludeSelection = [];
    pushHistory();
    render();
    saveToCloud(true);
}

function isExcludedCombination(partsMeta) {
    return excludedPairs.some(pair => {
        const hasA = partsMeta.some(p => p.r === pair.a.r && p.c === pair.a.c);
        const hasB = partsMeta.some(p => p.r === pair.b.r && p.c === pair.b.c);
        return hasA && hasB;
    });
}
/* =========================================================
   INTERACTIVE CLASS DISPLAY ENGINE
   ========================================================= */
let currentClassDisplayIndex = 0;
let isAnswerRevealed = false;
let classDisplaySentences = []; // Holds the randomized sentence list

function openInteractiveClassDisplay() {
    const sentences = getAssembledSentences();
    if (!sentences || sentences.length === 0) {
        alert("Please add vocabulary and structure to your grid before opening the display.");
        return;
    }
    
    document.body.style.overflow = 'hidden';
    classDisplaySentences = shuffleArray(sentences);
    currentClassDisplayIndex = 0;
    isAnswerRevealed = false;

    // Reset dropdown selection back to the top activity on re-open
    const gameSelect = document.getElementById('class-display-game-select');
    if (gameSelect) {
        gameSelect.selectedIndex = 0;
    }

    document.getElementById('class-display-modal').style.display = 'flex';
    playClassDisplayGame();
}
    function handleClassDisplayActivityChange() {
    isAnswerRevealed = false;
    
    // Automatically advance to a new sentence when switching activities
    if (classDisplaySentences && classDisplaySentences.length > 0) {
        currentClassDisplayIndex++;
        if (currentClassDisplayIndex >= classDisplaySentences.length) {
            classDisplaySentences = shuffleArray(classDisplaySentences);
            currentClassDisplayIndex = 0;
        }
    }
    
    playClassDisplayGame();
}
// Clean brackets from English sentences
function cleanEnglishText(text) {
    if (!text) return '';
    return text.replace(/[\(\)]/g, '').trim();
}

// Format missing characters with distinct single underlines and wide word spacing
function formatMissingChars(text, type) {
    const vowels = 'aeiouáéíóúàèìòùâêîôûäëïöüAEIOUÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜ';
    const words = text.split(' ');
    
    return words.map(word => {
        const charSpans = word.split('').map(ch => {
            const isLetter = /[a-zA-ZáéíóúàèìòùâêîôûäëïöüÁÉÍÓÚÀÈÌÒÙÂÊÎÔÛÄËÏÖÜ]/.test(ch);
            if (!isLetter) return `<span style="margin:0 2px;">${ch}</span>`;
            
            const isVowel = vowels.includes(ch);
            const shouldHide = (type === 'vowels' && isVowel) || (type === 'consonants' && !isVowel);
            
            if (shouldHide) {
                return `<span class="cd-blank-char">&nbsp;</span>`;
            } else {
                return `<span style="margin:0 2px;">${ch}</span>`;
            }
        }).join('');
        
        return `<span class="cd-word-wrapper">${charSpans}</span>`;
    }).join('');
}
function removeVowelsCD(str) {
    if (!str) return str;
    return str.replace(/[aeiouàéèíóúüÄÖÜäöü]/gi, '<span style="border-bottom:3px solid #334155; display:inline-block; width:0.5em; margin:0 2px;">_</span>');
}

function removeConsonantsCD(str) {
    if (!str) return str;
    return str.replace(/[bcdfghjklmnpqrstvwxyzßçñ]/gi, '<span style="border-bottom:3px solid #334155; display:inline-block; width:0.5em; margin:0 2px;">_</span>');
}

function shuffleWordsCD(str) {
    if (!str) return str;
    const words = str.trim().split(/\s+/);
    for (let i = words.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [words[i], words[j]] = [words[j], words[i]];
    }
    return words.join(' ');
}

function playClassDisplayGame() {
    const mode = document.getElementById('class-display-game-select').value;
    
    if (!classDisplaySentences || classDisplaySentences.length === 0) {
        const raw = getAssembledSentences();
        if (!raw || raw.length === 0) return;
        classDisplaySentences = shuffleArray(raw);
    }
    
    const container = document.getElementById('class-display-content');

    if (mode === 'match-up') {
        playClassDisplayMatchUp(classDisplaySentences);
        return;
    }
    if (mode === 'sentence-grid') {
        playClassDisplayGrid(classDisplaySentences);
        return;
    }

    const item = classDisplaySentences[currentClassDisplayIndex % classDisplaySentences.length];
    const targetText = item.t || item.target || '';
    const englishText = cleanEnglishText(item.tr || item.en || item.english || '');

    let questionHTML = '';
    let answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">${targetText}</div>`;

    if (mode === 'random-target') {
        questionHTML = `<div class="cd-question-text">${targetText}</div>`;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">${englishText}</div>`;
    } 
    else if (mode === 'random-en') {
        questionHTML = `<div class="cd-question-text">${englishText}</div>`;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">${targetText}</div>`;
    } 
    else if (mode === 'no-vowels') {
        const hiddenText = formatMissingChars(targetText, 'vowels');
        questionHTML = `<div class="cd-question-text">${hiddenText}</div>
                        <div class="cd-sub-text">${englishText}</div>`;
    } 
    else if (mode === 'no-consonants') {
        const hiddenText = formatMissingChars(targetText, 'consonants');
        questionHTML = `<div class="cd-question-text">${hiddenText}</div>
                        <div class="cd-sub-text">${englishText}</div>`;
    } 
   else if (mode === 'no-spaces') {
        const noSpaceText = targetText.replace(/\s+/g, '');
        questionHTML = `<div class="cd-question-text" style="letter-spacing: 2px; word-break: break-all; overflow-wrap: anywhere;">${noSpaceText}</div>`;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">
                        ${targetText}
                        ${englishText ? `<div style="font-size: 3.2rem; font-weight: 600; margin-top: 10px;">${englishText}</div>` : ''}
                      </div>`;
    }
    else if (mode === 'unjumble') {
        const words = shuffleArray(targetText.split(' '));
        questionHTML = `<div class="cd-question-text">${words.join(' &nbsp;•&nbsp; ')}</div>`;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">
                        ${targetText}
                        ${englishText ? `<div style="font-size: 3.2rem; font-weight: 600; margin-top: 10px;">${englishText}</div>` : ''}
                      </div>`;
    }

    container.innerHTML = `
        <div style="width: 98%; max-width: 98%; margin: 25px auto 0 auto; min-height: 220px; display:flex; flex-direction:column; justify-content:flex-start; align-items:center;">
            ${questionHTML}
            ${answerHTML}
        </div>
        <div style="margin-top: 40px; display: flex; gap: 20px;">
            <button onclick="nextClassDisplaySentence()" class="btn-purple" style="font-size: 20px; padding: 12px 28px;">🔄 Shuffle</button>
            <button id="cd-reveal-btn" onclick="toggleClassDisplayAnswer(this)" class="btn-info" style="font-size: 20px; padding: 12px 28px;">${isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal'}</button>
        </div>
    `;
}

function toggleClassDisplayAnswer(btn) {
    const answerBox = document.getElementById('cd-answer-box');
    if (answerBox) {
        isAnswerRevealed = !isAnswerRevealed;
        answerBox.style.display = isAnswerRevealed ? 'block' : 'none';

        const revealBtn = btn || document.getElementById('cd-reveal-btn');
        if (revealBtn) {
            revealBtn.innerHTML = isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal';
        }
    }
}

function nextClassDisplaySentence() {
    if (!classDisplaySentences || classDisplaySentences.length === 0) {
        classDisplaySentences = shuffleArray(getAssembledSentences());
    }
    
    currentClassDisplayIndex++;
    
    if (currentClassDisplayIndex >= classDisplaySentences.length) {
        classDisplaySentences = shuffleArray(classDisplaySentences);
        currentClassDisplayIndex = 0;
    }
    
    isAnswerRevealed = false;
    playClassDisplayGame();
}
function playClassDisplayMatchUp(allSentences) {
    const NUM_PAIRS = 5;
    const NUM_DISTRACTORS = 3;
    const totalNeeded = NUM_PAIRS + NUM_DISTRACTORS;

    if (allSentences.length < totalNeeded) {
        document.getElementById('class-display-content').innerHTML = `
            <div style="text-align:center; padding: 40px;">
                <h2 style="color:#ef4444;">Need at least ${totalNeeded} sentences for Match Up!</h2>
                <p style="color:#64748b;">Your builder currently has ${allSentences.length} sentences.</p>
            </div>`;
        return;
    }

    // Determine font size across ALL sentences so it NEVER changes on Shuffle
    const maxLen = Math.max(...allSentences.map(s => Math.max((s.t || '').length, (s.tr || '').length)));

    let fontSizeRem = 2.35;
    let lineHeight = 1.25;

    if (maxLen > 70) {
        fontSizeRem = 1.5;
        lineHeight = 1.18;
    } else if (maxLen > 50) {
        fontSizeRem = 1.85;
        lineHeight = 1.22;
    } else if (maxLen > 35) {
        fontSizeRem = 2.1;
        lineHeight = 1.24;
    }

    const fontSize = `${fontSizeRem}rem`;

    const shuffled = shuffleArray(allSentences);
    const gamePairs = shuffled.slice(0, NUM_PAIRS);
    const distractors = shuffled.slice(NUM_PAIRS, totalNeeded).map(d => d.tr);

    const leftSide = gamePairs.map(p => p.t);
    let rightSide = shuffleArray(gamePairs.map(p => p.tr).concat(distractors));

    let leftHTML = leftSide.map((sent, i) => {
        const rightIndex = rightSide.indexOf(gamePairs[i].tr);
        const correctLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : '';
        return `
            <li style="font-size: ${fontSize}; line-height: ${lineHeight}; display: flex; align-items: baseline; padding: 2px 0;">
                <span class="match-ans-letter" style="color: #10b981; font-weight: bold; width: 40px; min-width: 40px; display: inline-block;">${isAnswerRevealed ? correctLetter : ''}</span>
                <span style="font-weight: bold; margin-right: 10px;">${i + 1}.</span>
                <span>${sent}</span>
            </li>
        `;
    }).join('');

    let rightHTML = rightSide.map((sent, i) => {
        const isDistractor = distractors.includes(sent);
        const styleColor = (isAnswerRevealed && isDistractor) ? 'color: #ef4444; opacity: 0.7;' : '';
        return `
            <li style="font-size: ${fontSize}; line-height: ${lineHeight}; display: flex; align-items: baseline; padding: 2px 0; ${styleColor}" data-text="${sent.replace(/"/g, '&quot;')}">
                <span style="font-weight: bold; margin-right: 10px; color: #8b5cf6;">${String.fromCharCode(65 + i)}.</span>
                <span>${sent}</span>
            </li>
        `;
    }).join('');

    document.getElementById('class-display-content').innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%; box-sizing: border-box;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%; text-align: left; flex: 1; min-height: 0;">
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 20px; border-radius: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
                    <h3 style="margin-top: 0; margin-bottom: 8px; color: #1e293b; border-bottom: 2px solid #8b5cf6; padding-bottom: 6px; font-size: 1.3rem; flex-shrink: 0;">Target Language</h3>
                    <ul style="list-style: none; padding: 0; margin: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-evenly;">${leftHTML}</ul>
                </div>
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 20px; border-radius: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box;">
                    <h3 style="margin-top: 0; margin-bottom: 8px; color: #1e293b; border-bottom: 2px solid #10b981; padding-bottom: 6px; font-size: 1.3rem; flex-shrink: 0;">English Translations</h3>
                    <ul id="cd-match-right-list" style="list-style: none; padding: 0; margin: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-evenly;">${rightHTML}</ul>
                </div>
            </div>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 14px; flex-shrink: 0;">
                <button onclick="isAnswerRevealed = false; playClassDisplayGame();" class="btn-purple" style="font-size: 19px; padding: 10px 26px; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold;">🔄 Shuffle</button>
                <button id="cd-reveal-match-btn" class="btn-info" style="font-size: 19px; padding: 10px 26px; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold;">${isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal'}</button>
            </div>
        </div>
    `;

    document.getElementById('cd-reveal-match-btn').onclick = function() {
        isAnswerRevealed = !isAnswerRevealed;
        gamePairs.forEach((pair, idx) => {
            const rightIndex = rightSide.indexOf(pair.tr);
            const correctLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : '';
            const letterSpans = document.querySelectorAll('.match-ans-letter');
            if (letterSpans[idx]) {
                letterSpans[idx].innerText = isAnswerRevealed ? correctLetter : '';
            }
        });

        document.querySelectorAll('#cd-match-right-list li').forEach(li => {
            const txt = li.getAttribute('data-text');
            if (distractors.includes(txt)) {
                li.style.color = isAnswerRevealed ? '#ef4444' : '';
                li.style.opacity = isAnswerRevealed ? '0.7' : '1';
            }
        });
        this.innerHTML = isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal';
    };
}
function playClassDisplayGrid(allSentences) {
    const NUM_CELLS = 12;
    if (allSentences.length < NUM_CELLS) {
        document.getElementById('class-display-content').innerHTML = `
            <div style="text-align:center; padding: 40px;">
                <h2 style="color:#ef4444;">Need at least ${NUM_CELLS} sentences for Sentence Grid!</h2>
                <p style="color:#64748b;">Your builder currently has ${allSentences.length} sentences.</p>
            </div>`;
        return;
    }

    const shuffled = shuffleArray(allSentences).slice(0, NUM_CELLS);
    let targetQuestions = shuffleArray(shuffled.slice(0, 6));
    let englishQuestions = shuffleArray(shuffled.slice(6, 12));

    let gridHTML = '';
    let cellCounter = 0;

    for (let r = 0; r < 4; r++) {
        for (let c = 0; c < 3; c++) {
            let question, answer, isTargetCol;
            if (r % 2 === 0) {
                const pair = targetQuestions.pop();
                question = pair.t;
                answer = pair.tr;
                isTargetCol = true;
            } else {
                const pair = englishQuestions.pop();
                question = pair.tr;
                answer = pair.t;
                isTargetCol = false;
            }

            gridHTML += `
                <div class="cd-grid-cell" style="border: 1px solid #cbd5e1; border-radius: 8px; padding: 10px; background: ${isTargetCol ? '#eff6ff' : '#ffffff'}; position: relative; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center;">
                    <span style="position: absolute; top: 8px; left: 10px; font-size: 1.2rem; font-weight: 700; color: #64748b;">${cellCounter + 1}</span>
                    <div class="cd-q-text" style="font-size: 2.2em; font-weight: bold; color: #1e293b;">${question}</div>
                    <div class="cd-a-text" style="display: none; font-size: 2.2em; font-weight: bold; color: #16a34a; margin-top: 4px;">${answer}</div>
                </div>
            `;
            cellCounter++;
        }
    }

    document.getElementById('class-display-content').innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%; box-sizing: border-box;">
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(4, 1fr); gap: 12px; width: 100%; flex: 1; min-height: 0;">
                ${gridHTML}
            </div>
            <div style="display: flex; justify-content: center; gap: 20px; margin-top: 14px; flex-shrink: 0;">
                <button onclick="playClassDisplayGame()" class="btn-purple" style="font-size: 19px; padding: 10px 26px; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold;">🔄 Shuffle</button>
                <button id="cd-reveal-grid-btn" class="btn-info" style="font-size: 19px; padding: 10px 26px; height: 48px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: bold;">🔍 Reveal</button>
            </div>
        </div>
    `;

    document.getElementById('cd-reveal-grid-btn').onclick = function() {
        const isHiding = this.innerText.includes('Hide');
        document.querySelectorAll('.cd-grid-cell').forEach(cell => {
            const q = cell.querySelector('.cd-q-text');
            const a = cell.querySelector('.cd-a-text');
            if (q && a) {
                q.style.display = isHiding ? 'block' : 'none';
                a.style.display = isHiding ? 'none' : 'block';
            }
        });
        this.innerText = isHiding ? '🔍 Reveal' : '🙈 Hide';
    };
}
function toggleMode(mode) { currentMode = (currentMode === mode) ? null : mode; render(false); }
function insertRow(i) { grid.splice(i, 0, Array.from({length: grid[0].length}, () => c())); currentMode = null; render(); saveToCloud(true); }
function insertCol(i) { grid.forEach(r => r.splice(i, 0, c())); currentMode = null; render(); saveToCloud(true); }
function deleteCol(cIdx) {
    if (!grid || !grid.length) return;
    const cols = Math.max(...grid.map(r => r.length), 1);
    if (cols <= 1) {
        alert("Cannot delete the last remaining column.");
        return;
    }

    // Safely unmerge all spans before splicing columns to prevent matrix corruption
    grid.forEach(row => {
        row.forEach(cell => {
            if (cell) {
                cell.rS = 1;
                cell.cS = 1;
                cell.hidden = false;
            }
        });
    });

    // Remove column from every row
    grid.forEach(row => {
        if (cIdx < row.length) {
            row.splice(cIdx, 1);
        }
    });

    render(true);
}

function deleteRow(rIdx) {
    if (!grid || grid.length <= 1) {
        alert("Cannot delete the last remaining row.");
        return;
    }

    // Safely unmerge all spans before splicing rows
    grid.forEach(row => {
        row.forEach(cell => {
            if (cell) {
                cell.rS = 1;
                cell.cS = 1;
                cell.hidden = false;
            }
        });
    });

    grid.splice(rIdx, 1);
    render(true);
}

function splitCell(r, c) {
    if (!grid[r] || !grid[r][c]) return;
    const cell = grid[r][c];

    const rS = cell.rS || 1;
    const cS = cell.cS || 1;

    // Reset spans for all cells inside this area
    for (let i = r; i < r + rS; i++) {
        for (let j = c; j < c + cS; j++) {
            if (grid[i] && grid[i][j]) {
                grid[i][j].hidden = false;
                grid[i][j].rS = 1;
                grid[i][j].cS = 1;
            }
        }
    }

    render(true);
}

setInterval(() => {
    const isEditor = document.getElementById('editor-page').classList.contains('active-page');
    const hasTitle = document.getElementById('builder-title').value.trim() !== "";

    if (currentUser && isEditor && hasTitle) {
        saveToCloud(true); 
    }
}, 60000);
