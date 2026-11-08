// Firebase Configuration & Initialization
const firebaseConfig = {
    apiKey: "AIzaSyDnfndrVR5reVNxLc7pGwxp6910_0L5P98",
    authDomain: "speakaton-6b95a.firebaseapp.com",
    projectId: "speakaton-6b95a",
    storageBucket: "speakaton-6b95a.appspot.com",
    messagingSenderId: "162949632188",
    appId: "1:162949632188:web:eb981bcf305b346d99c0b9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Google OAuth & Classroom Scope Constants
const CLIENT_ID = '162949632188-fifdjjtug2mqu5uc80r2fdrqfacvkkrg.apps.googleusercontent.com';
const SCOPES = 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.students https://www.googleapis.com/auth/classroom.profile.emails https://www.googleapis.com/auth/classroom.rosters.readonly https://www.googleapis.com/auth/classroom.topics https://www.googleapis.com/auth/userinfo.email';

// Global Application State Variables
let tokenClient = null;
let gapiLoaded = false;
let currentTemplateId = null;     
let currentAssignmentId = null;   
let activeEditorMode = "template"; 

let allCourses = [];
let allSubmissions = [];
let allAssignments = [];

let readAloudDataStructure = {};
let rolePlayDataStructure = {};

let selRaLang = null, selRaYear = null, selRaTopic = null, selRaTier = 'all';
let selRpLang = null, selRpYear = null, selRpTopic = null, selRpTier = 'all';

let classroomStudents = [];
let selectedClassroomStudentIds = [];
let studentSelectorCourseId = null;

// =========================================
// AUTHENTICATION & TOKEN MANAGERS
// =========================================

function getErrorMessage(e) {
    if (!e) return "Unknown error occurred.";
    if (typeof e === 'string') return e;
    if (e.result && e.result.error && e.result.error.message) {
        return e.result.error.message;
    }
    if (e.message) return e.message;
    try {
        return JSON.stringify(e);
    } catch (err) {
        return String(e);
    }
}

function saveTokenToLocalStorage(token, expiresInSeconds) {
    const seconds = parseInt(expiresInSeconds) || 3600;
    const expiryTime = Date.now() + (seconds * 1000);
    localStorage.setItem('oauth_token', token);
    localStorage.setItem('oauth_token_expiry', expiryTime);
}

function getValidAccessToken() {
    const savedToken = localStorage.getItem('oauth_token');
    const tokenExpiry = localStorage.getItem('oauth_token_expiry');
    if (savedToken && tokenExpiry && Date.now() < parseInt(tokenExpiry) - 60000) {
        return savedToken;
    }
    return null;
}

function ensureClassroomToken() {
    return new Promise((resolve, reject) => {
        const token = getValidAccessToken();
        if (token) {
            if (typeof gapi !== 'undefined' && gapi.client) {
                gapi.client.setToken({ access_token: token });
            }
            resolve(token);
            return;
        }

        if (!tokenClient) gisInit();

        if (!tokenClient) {
            reject(new Error("Google Authorization client not initialized. Please click 'Sign In with Google Classroom'."));
            return;
        }

        const oldCallback = tokenClient.callback;
        tokenClient.callback = (tokenResponse) => {
            tokenClient.callback = oldCallback;
            if (tokenResponse.error) {
                reject(new Error("Google Classroom authorization was cancelled or failed: " + getErrorMessage(tokenResponse.error)));
                return;
            }
            if (tokenResponse.access_token) {
                saveTokenToLocalStorage(tokenResponse.access_token, tokenResponse.expires_in);
                if (typeof gapi !== 'undefined' && gapi.client) {
                    gapi.client.setToken({ access_token: tokenResponse.access_token });
                }
                resolve(tokenResponse.access_token);
            } else {
                reject(new Error("Failed to obtain Google Classroom access token."));
            }
        };

        try {
            tokenClient.requestAccessToken({ prompt: '' });
        } catch (err) {
            tokenClient.callback = oldCallback;
            reject(err);
        }
    });
}

function gisInit() {
    try {
        if (typeof google !== 'undefined' && google.accounts && google.accounts.oauth2) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse.error) {
                        if (tokenResponse.error === 'immediate_failed' || tokenResponse.error === 'consent_required') {
                            return;
                        }
                        alert("Google Auth Error: " + getErrorMessage(tokenResponse.error));
                        return;
                    }
                    
                    if (tokenResponse.access_token) {
                        saveTokenToLocalStorage(tokenResponse.access_token, tokenResponse.expires_in);
                        if (typeof gapi !== 'undefined' && gapi.client) {
                            gapi.client.setToken({ access_token: tokenResponse.access_token });
                        }
                        verifyUserAndProceed(tokenResponse.access_token);
                    }
                },
            });

            if (gapiLoaded) {
                checkAuthAndLoad();
            }
        }
    } catch (e) {
        console.error("Error initializing GIS client:", e);
    }
}

function verifyUserAndProceed(token) {
    fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${token}` }
    })
    .then(res => res.json())
    .then(userInfo => {
        if (userInfo && userInfo.email) {
            const email = userInfo.email.toLowerCase();
            
            if (/^\d/.test(email)) {
                alert("Access Denied. Student accounts are not authorized to access the teacher dashboard.");
                clearTokenAndLogOut();
                return;
            }
            
            if (!email.endsWith("@cedarsupper.co.uk")) {
                alert("Access Denied. Only @cedarsupper.co.uk professional accounts are authorized.");
                clearTokenAndLogOut();
                return;
            }
            
            handleLoginSuccess(token, email);
        } else {
            alert("Security Error: Could not verify your email identity.");
            clearTokenAndLogOut();
        }
    })
    .catch(err => {
        alert("Authentication failed during identity validation checks.");
        clearTokenAndLogOut();
    });
}

function clearTokenAndLogOut() {
    localStorage.removeItem('oauth_token');
    localStorage.removeItem('oauth_token_expiry');
    localStorage.removeItem('teacherEmail');
    localStorage.removeItem('teacherSessionExpiresAt');
    forceLogout();
}

function checkAuthAndLoad() {
    const savedTeacherEmail = localStorage.getItem('teacherEmail');
    const sessionExpiresAt = localStorage.getItem('teacherSessionExpiresAt');

    if (savedTeacherEmail && sessionExpiresAt && Date.now() < parseInt(sessionExpiresAt)) {
        document.getElementById('login-card').classList.add('hidden');
        document.getElementById('auth-header').classList.remove('hidden');
        showSection('main-menu-section'); 
        document.getElementById('user-info').innerText = `Logged in: ${savedTeacherEmail}`;

        loadCourses();
        listenToTemplateCollection();
        syncLiveAssignments();
        syncSubmissions();
        cleanOldRecycleBinItems();
        return;
    }

    document.getElementById('login-card').classList.remove('hidden');
    document.getElementById('auth-header').classList.add('hidden');
}

function gapiStart() {
    gapi.client.init({}).then(() => {
        gapi.client.load('classroom', 'v1').then(() => {
            gapiLoaded = true;
            if (tokenClient) {
                checkAuthAndLoad();
            }
        });
    });
}

function handleLoginSuccess(accessToken, verifiedEmail) {
    const setTeacherState = (email) => {
        const expire24h = Date.now() + (24 * 60 * 60 * 1000);
        localStorage.setItem('teacherEmail', email);
        localStorage.setItem('teacherSessionExpiresAt', expire24h.toString());

        document.getElementById('login-card').classList.add('hidden');
        document.getElementById('auth-header').classList.remove('hidden');
        
        showSection('main-menu-section'); 
        document.getElementById('user-info').innerText = `Logged in: ${email}`;
        
        loadCourses();
        listenToTemplateCollection();
        syncLiveAssignments();
        syncSubmissions();
        cleanOldRecycleBinItems(); 
    };

    if (verifiedEmail) {
        setTeacherState(verifiedEmail);
        return;
    }

    fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`)
        .then(res => {
            if (!res.ok) throw new Error("Unauthorized");
            return res.json();
        })
        .then(data => {
            if (data.email) {
                const email = data.email.toLowerCase();
                if (!email.endsWith("@cedarsupper.co.uk")) {
                    alert("Access Denied. Only @cedarsupper.co.uk professional teacher accounts are authorized.");
                    clearTokenAndLogOut();
                    return;
                }
                setTeacherState(email);
            }
        }).catch(() => {
            const savedTeacherEmail = localStorage.getItem('teacherEmail');
            if (savedTeacherEmail) {
                setTeacherState(savedTeacherEmail);
            }
        });
}

function forceLogout() {
    localStorage.removeItem('oauth_token');
    localStorage.removeItem('oauth_token_expiry');
    localStorage.removeItem('teacherEmail');
    localStorage.removeItem('teacherSessionExpiresAt');
    window.location.reload();
}

// =========================================
// EVENT LISTENERS & APP INITIALIZATION
// =========================================

window.onload = () => {
    gapi.load('client', () => {
        gapiStart();
    });

    document.getElementById('auth-btn').onclick = () => {
        if (typeof google === 'undefined') {
            alert("Google services could not be loaded. Please check connection.");
            return;
        }
        if (!tokenClient) gisInit();
        if (tokenClient) {
            try { tokenClient.requestAccessToken({ prompt: 'select_account' }); } catch (err) { alert(getErrorMessage(err)); }
        }
    };

    document.getElementById('logout-btn').onclick = forceLogout;

    document.getElementById('activity-type-input').onchange = (e) => {
        toggleFormVisibility(e.target.value);
        adjustPublishFrameAlignment(e.target.value);
    };

    document.getElementById('language-input').onchange = () => {
        if (typeof updateEditorTopicDropdown === 'function') updateEditorTopicDropdown();
    };
    document.getElementById('year-input').onchange = () => {
        if (typeof updateEditorTopicDropdown === 'function') updateEditorTopicDropdown();
    };

    document.getElementById('topic-select').onchange = (e) => {
        const topicInput = document.getElementById('topic-input');
        if (e.target.value === '__NEW__') {
            topicInput.classList.remove('hidden');
            topicInput.value = '';
        } else {
            topicInput.classList.add('hidden');
            topicInput.value = e.target.value;
        }
    };

    document.getElementById('course-select').onchange = async (e) => {
        const courseId = e.target.value;

        if (courseId && !courseId.startsWith("Loading")) {
            await loadClassroomStudents(courseId);
            await loadGoogleClassroomTopics(courseId);
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

    document.getElementById('gc-topic-select').onchange = (e) => {
        const gcTopicInput = document.getElementById('gc-topic-input');
        if (e.target.value === '__NEW__') {
            gcTopicInput.classList.remove('hidden');
            gcTopicInput.value = '';
        } else {
            gcTopicInput.classList.add('hidden');
            gcTopicInput.value = '';
        }
    };

    const bindClick = (id, fn) => { 
        const el = document.getElementById(id); 
        if(el) el.onclick = fn; 
    };

    bindClick('header-home-btn', () => showSection('main-menu-section'));
    bindClick('header-ra-bank-btn', () => showSection('read-aloud-bank-section'));
    bindClick('header-rp-bank-btn', () => showSection('role-play-bank-section'));
    bindClick('header-submissions-btn', () => showSection('submissions-section'));
    bindClick('header-new-btn', openNewTemplateEditor);
    bindClick('header-bin-btn', () => { showSection('bin-section'); loadRecycleBin(); });

    bindClick('menu-new-task', openNewTemplateEditor);
    bindClick('menu-submissions', () => showSection('submissions-section'));
    bindClick('menu-ra-bank', () => showSection('read-aloud-bank-section'));
    bindClick('menu-rp-bank', () => showSection('role-play-bank-section'));
    bindClick('menu-bin', () => { showSection('bin-section'); loadRecycleBin(); });

    bindClick('cancel-editor-btn', () => showSection('main-menu-section'));
    bindClick('save-btn', saveEditorChanges);
    bindClick('sync-all-classroom-grades-btn', triggerClassroomTaskSync);
    bindClick('edit-assigned-task-btn', editAssignedTaskHandler);
    bindClick('delete-assigned-task-btn', deleteAssignedTaskHandler);
    bindClick('assign-btn', assignButtonHandler);
};

// =========================================
// DASHBOARD & NAVIGATION UI CONTROL
// =========================================

function showSection(sectionId) {
    document.getElementById('main-menu-section').classList.add('hidden');
    document.getElementById('read-aloud-bank-section').classList.add('hidden');
    document.getElementById('role-play-bank-section').classList.add('hidden');
    document.getElementById('submissions-section').classList.add('hidden');
    document.getElementById('bin-section').classList.add('hidden');
    document.getElementById('editor-section').classList.add('hidden');
    document.getElementById(sectionId).classList.remove('hidden');

    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    if (sectionId === 'read-aloud-bank-section') {
        document.getElementById('header-ra-bank-btn').classList.add('active');
        selRaLang = null; selRaYear = null; selRaTopic = null; selRaTier = 'all';
        renderReadAloudFilters();
    }
    if (sectionId === 'role-play-bank-section') {
        document.getElementById('header-rp-bank-btn').classList.add('active');
        selRpLang = null; selRpYear = null; selRpTopic = null; selRpTier = 'all';
        renderRolePlayFilters();
    }
    if (sectionId === 'submissions-section') document.getElementById('header-submissions-btn').classList.add('active');
    if (sectionId === 'bin-section') document.getElementById('header-bin-btn').classList.add('active');

    if (sectionId === 'main-menu-section') {
        document.getElementById('header-nav-container').classList.add('hidden');
    } else {
        document.getElementById('header-nav-container').classList.remove('hidden');
    }
}

function getLanguageName(code) {
    switch(code) {
        case 'fr': return 'French';
        case 'de': return 'German';
        case 'es': return 'Spanish';
        default: return 'French';
    }
}

function getLanguageFlag(code) {
    let twemojiId = '';
    switch(code) {
        case 'fr': twemojiId = '1f1eb-1f1f7'; break;
        case 'de': twemojiId = '1f1e9-1f1ea'; break;
        case 'es': twemojiId = '1f1ea-1f1f8'; break;
        default: twemojiId = '1f3f3';
    }
    return `<img src="https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${twemojiId}.svg" class="btn-flag" alt="">`;
}

function toggleFormVisibility(type) {
    if (type === 'role_play') {
        document.getElementById('read-aloud-inputs-container').classList.add('hidden');
        document.getElementById('role-play-inputs-container').classList.remove('hidden');
        document.getElementById('rp-scenario-container').classList.remove('hidden');
    } else {
        document.getElementById('read-aloud-inputs-container').classList.remove('hidden');
        document.getElementById('role-play-inputs-container').classList.add('hidden');
        document.getElementById('rp-scenario-container').classList.add('hidden');
    }
}

function adjustPublishFrameAlignment(activityType) {
    const assignSection = document.getElementById('assign-section');
    if (!assignSection) return;

    if (activityType === 'role_play') {
        assignSection.style.marginTop = "51px"; 
    } else {
        assignSection.style.marginTop = "23px"; 
    }
}

// =========================================
// DATA COLLECTION LISTENERS & BANKS
// =========================================

function populateYearDropdown() {
    const yearInput = document.getElementById('year-input');
    const baseYears = new Set(["Year 9", "GCSE"]);
    
    Object.keys(readAloudDataStructure).forEach(lang => {
        Object.keys(readAloudDataStructure[lang]).forEach(yr => baseYears.add(yr));
    });
    
    Object.keys(rolePlayDataStructure).forEach(lang => {
        Object.keys(rolePlayDataStructure[lang]).forEach(yr => baseYears.add(yr));
    });
    
    const cacheYear = yearInput.value;
    yearInput.innerHTML = '';
    Array.from(baseYears).sort((a,b) => a.localeCompare(b, undefined, {numeric: true})).forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr; opt.textContent = yr;
        yearInput.appendChild(opt);
    });
    if (cacheYear) yearInput.value = cacheYear;
}

function updateEditorTopicDropdown() {
    const currentLang = document.getElementById('language-input').value;
    const currentYear = document.getElementById('year-input').value;
    const topicSelect = document.getElementById('topic-select');
    const discoveredTopics = new Set();
    
    if (readAloudDataStructure[currentLang] && readAloudDataStructure[currentLang][currentYear]) {
        Object.keys(readAloudDataStructure[currentLang][currentYear]).forEach(tp => discoveredTopics.add(tp));
    }
    if (rolePlayDataStructure[currentLang] && rolePlayDataStructure[currentLang][currentYear]) {
        Object.keys(rolePlayDataStructure[currentLang][currentYear]).forEach(tp => discoveredTopics.add(tp));
    }
    
    const cacheTopicSel = topicSelect.value;
    topicSelect.innerHTML = '<option value="__NEW__">➕ Create new topic</option>';
    Array.from(discoveredTopics).sort().forEach(tp => {
        const opt = document.createElement('option');
        opt.value = tp; opt.textContent = tp;
        topicSelect.appendChild(opt);
    });
    
    if (Array.from(topicSelect.options).some(o => o.value === cacheTopicSel)) {
        topicSelect.value = cacheTopicSel;
    } else {
        topicSelect.value = '__NEW__';
        document.getElementById('topic-input').classList.remove('hidden');
    }
}

function listenToTemplateCollection() {
    db.collection("passages").orderBy("yearGroup").onSnapshot((snapshot) => {
        readAloudDataStructure = {};
        rolePlayDataStructure = {};

        snapshot.forEach((doc) => {
            const task = doc.data();
            task.id = doc.id;
            const lang = task.language || "fr"; 
            const year = task.yearGroup || "General";
            const topic = task.topic || "Default Topic";

            if (task.activityType === "role_play") {
                if (!rolePlayDataStructure[lang]) rolePlayDataStructure[lang] = {};
                if (!rolePlayDataStructure[lang][year]) rolePlayDataStructure[lang][year] = {};
                if (!rolePlayDataStructure[lang][year][topic]) rolePlayDataStructure[lang][year][topic] = [];
                rolePlayDataStructure[lang][year][topic].push(task);
            } else {
                if (!readAloudDataStructure[lang]) readAloudDataStructure[lang] = {};
                if (!readAloudDataStructure[lang][year]) readAloudDataStructure[lang][year] = {};
                if (!readAloudDataStructure[lang][year][topic]) readAloudDataStructure[lang][year][topic] = [];
                readAloudDataStructure[lang][year][topic].push(task);
            }
        });

        populateYearDropdown();
        updateEditorTopicDropdown();
        renderReadAloudFilters();
        renderRolePlayFilters();
    });
}

function renderReadAloudFilters() {
    const langRow = document.getElementById('ra-lang-row');
    langRow.innerHTML = '';
    
    const languages = Object.keys(readAloudDataStructure).sort();
    if(languages.length === 0) {
        langRow.innerHTML = '<p style="color:#7f8c8d; font-size:13px;">No Read Aloud scripts discovered in database store.</p>';
        return;
    }

    languages.forEach(lang => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRaLang === lang ? 'lang-active' : ''}`;
        btn.innerHTML = `${getLanguageFlag(lang)} <span>${getLanguageName(lang)}</span>`;
        btn.onclick = () => {
            selRaLang = lang; selRaYear = null; selRaTopic = null; selRaTier = 'all';
            renderReadAloudFilters();
        };
        langRow.appendChild(btn);
    });

    const yearBlock = document.getElementById('ra-year-block');
    const topicBlock = document.getElementById('ra-topic-block');
    const tierBlock = document.getElementById('ra-tier-block');
    const tasksBlock = document.getElementById('ra-tasks-block');

    if (!selRaLang) {
        yearBlock.classList.add('hidden'); topicBlock.classList.add('hidden'); if(tierBlock) tierBlock.classList.add('hidden'); tasksBlock.classList.add('hidden');
        return;
    }

    yearBlock.classList.remove('hidden');
    const yearRow = document.getElementById('ra-year-row');
    yearRow.innerHTML = '';
    
    const years = Object.keys(readAloudDataStructure[selRaLang] || {}).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    years.forEach(year => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRaYear === year ? 'year-active' : ''}`;
        btn.innerHTML = `🏫 ${year}`;
        btn.onclick = () => {
            selRaYear = year; selRaTopic = null; selRaTier = 'all';
            renderReadAloudFilters();
        };
        yearRow.appendChild(btn);
    });

    if (!selRaYear) {
        topicBlock.classList.add('hidden'); if(tierBlock) tierBlock.classList.add('hidden'); tasksBlock.classList.add('hidden');
        return;
    }

    topicBlock.classList.remove('hidden');
    const topicRow = document.getElementById('ra-topic-row');
    topicRow.innerHTML = '';

    const topics = Object.keys(readAloudDataStructure[selRaLang][selRaYear] || {}).sort();
    topics.forEach(topic => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRaTopic === topic ? 'topic-active' : ''}`;
        btn.innerHTML = `📁 ${topic}`;
        btn.onclick = () => {
            selRaTopic = topic; selRaTier = 'all';
            renderReadAloudFilters();
        };
        topicRow.appendChild(btn);
    });

    if (!selRaTopic) {
        if(tierBlock) tierBlock.classList.add('hidden');
        tasksBlock.classList.add('hidden');
        return;
    }

    if (selRaYear === 'GCSE') {
        if (tierBlock) {
            tierBlock.classList.remove('hidden');
            const tierRow = document.getElementById('ra-tier-row');
            tierRow.innerHTML = '';

            const tiers = [
                { id: 'all', label: 'All Tiers' },
                { id: 'foundation', label: 'Foundation' },
                { id: 'higher', label: 'Higher' }
            ];

            tiers.forEach(tierObj => {
                const btn = document.createElement('button');
                btn.className = `pill-btn ${selRaTier === tierObj.id ? 'tier-active' : ''}`;
                btn.innerHTML = tierObj.label;
                btn.onclick = () => {
                    selRaTier = tierObj.id;
                    renderReadAloudFilters();
                };
                tierRow.appendChild(btn);
            });
        }
    } else {
        if (tierBlock) tierBlock.classList.add('hidden');
        selRaTier = 'all';
    }

    tasksBlock.classList.remove('hidden');
    const tasksGrid = document.getElementById('ra-tasks-grid');
    tasksGrid.innerHTML = '';

    let matchedTasks = readAloudDataStructure[selRaLang][selRaYear][selRaTopic] || [];
    if (selRaYear === 'GCSE' && selRaTier !== 'all') {
        matchedTasks = matchedTasks.filter(task => (task.tier || '').toLowerCase() === selRaTier.toLowerCase());
    }

    matchedTasks.sort((a,b) => a.title.localeCompare(b.title)).forEach(task => {
        const card = document.createElement('div');
        card.className = 'bank-task-card';
        const tierLetter = (task.tier === 'higher') ? 'H' : 'F'; 

        const matchingAssigns = allAssignments.filter(assign => 
            assign.title === task.title && 
            assign.activityType === (task.activityType || 'read_aloud') && 
            assign.language === (task.language || 'fr') && 
            assign.tier === (task.tier || 'foundation') && 
            assign.yearGroup === task.yearGroup && 
            assign.topic === task.topic
        );

        const assignedClasses = matchingAssigns.map(assign => {
            const course = allCourses.find(c => c.id === assign.courseId);
            return (course && course.name) ? course.name : (assign.courseName || assign.courseCode || "Assigned Class");
        });

        let classHtml = '';
        if (assignedClasses.length > 0) {
            classHtml = assignedClasses.map(clsName => 
                `<span style="background: #fffbe6; border: 1px solid #ffe58f; padding: 2px 5px; border-radius: 4px; font-size: 11px; color: #d46b08; font-weight: 600; display: inline-block; white-space: nowrap;">📋 ${clsName}</span>`
            ).join('');
        }

        card.innerHTML = `
            <div class="bank-task-info">
                <div class="bank-task-title"><span class="badge tier">${tierLetter}</span> ${task.title}</div>
                <div class="bank-task-classes-container">${classHtml}</div>
            </div>
            <div class="task-actions" style="margin-top: 2px;">
                <button class="task-action-btn" data-tooltip="Edit" title="Edit" onclick="loadTemplateIntoEditor('${task.id}')">📝</button>
                <button class="task-action-btn" data-tooltip="Duplicate" title="Duplicate" onclick="duplicateTemplate('${task.id}', event)">📋</button>
                <button class="task-action-btn" data-tooltip="Delete" title="Delete" onclick="moveToBin('${task.id}', event)">🗑️</button>
            </div>
        `;
        tasksGrid.appendChild(card);
    });
}

function renderRolePlayFilters() {
    const langRow = document.getElementById('rp-lang-row');
    langRow.innerHTML = '';
    
    const languages = Object.keys(rolePlayDataStructure).sort();
    if(languages.length === 0) {
        langRow.innerHTML = '<p style="color:#7f8c8d; font-size:13px;">No conversational role plays discovered in database store.</p>';
        return;
    }

    languages.forEach(lang => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRpLang === lang ? 'lang-active' : ''}`;
        btn.innerHTML = `${getLanguageFlag(lang)} <span>${getLanguageName(lang)}</span>`;
        btn.onclick = () => {
            selRpLang = lang; selRpYear = null; selRpTopic = null; selRpTier = 'all';
            renderRolePlayFilters();
        };
        langRow.appendChild(btn);
    });

    const yearBlock = document.getElementById('rp-year-block');
    const topicBlock = document.getElementById('rp-topic-block');
    const tierBlock = document.getElementById('rp-tier-block');
    const tasksBlock = document.getElementById('rp-tasks-block');

    if (!selRpLang) {
        yearBlock.classList.add('hidden'); topicBlock.classList.add('hidden'); if(tierBlock) tierBlock.classList.add('hidden'); tasksBlock.classList.add('hidden');
        return;
    }

    yearBlock.classList.remove('hidden');
    const yearRow = document.getElementById('rp-year-row');
    yearRow.innerHTML = '';
    
    const years = Object.keys(rolePlayDataStructure[selRpLang] || {}).sort((a,b) => a.localeCompare(b, undefined, {numeric:true}));
    years.forEach(year => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRpYear === year ? 'year-active' : ''}`;
        btn.innerHTML = `🏫 ${year}`;
        btn.onclick = () => {
            selRpYear = year; selRpTopic = null; selRpTier = 'all';
            renderRolePlayFilters();
        };
        yearRow.appendChild(btn);
    });

    if (!selRpYear) {
        topicBlock.classList.add('hidden'); if(tierBlock) tierBlock.classList.add('hidden'); tasksBlock.classList.add('hidden');
        return;
    }

    topicBlock.classList.remove('hidden');
    const topicRow = document.getElementById('rp-topic-row');
    topicRow.innerHTML = '';

    const topics = Object.keys(rolePlayDataStructure[selRpLang][selRpYear] || {}).sort();
    topics.forEach(topic => {
        const btn = document.createElement('button');
        btn.className = `pill-btn ${selRpTopic === topic ? 'topic-active' : ''}`;
        btn.innerHTML = `📁 ${topic}`;
        btn.onclick = () => {
            selRpTopic = topic; selRpTier = 'all';
            renderRolePlayFilters();
        };
        topicRow.appendChild(btn);
    });

    if (!selRpTopic) {
        if(tierBlock) tierBlock.classList.add('hidden');
        tasksBlock.classList.add('hidden');
        return;
    }

    if (selRpYear === 'GCSE') {
        if (tierBlock) {
            tierBlock.classList.remove('hidden');
            const tierRow = document.getElementById('rp-tier-row');
            tierRow.innerHTML = '';

            const tiers = [
                { id: 'all', label: 'All Tiers' },
                { id: 'foundation', label: 'Foundation' },
                { id: 'higher', label: 'Higher' }
            ];

            tiers.forEach(tierObj => {
                const btn = document.createElement('button');
                btn.className = `pill-btn ${selRpTier === tierObj.id ? 'tier-active' : ''}`;
                btn.innerHTML = tierObj.label;
                btn.onclick = () => {
                    selRpTier = tierObj.id;
                    renderRolePlayFilters();
                };
                tierRow.appendChild(btn);
            });
        }
    } else {
        if (tierBlock) tierBlock.classList.add('hidden');
        selRpTier = 'all';
    }

    tasksBlock.classList.remove('hidden');
    const tasksGrid = document.getElementById('rp-tasks-grid');
    tasksGrid.innerHTML = '';

    let matchedTasks = rolePlayDataStructure[selRpLang][selRpYear][selRpTopic] || [];
    if (selRpYear === 'GCSE' && selRpTier !== 'all') {
        matchedTasks = matchedTasks.filter(task => (task.tier || '').toLowerCase() === selRpTier.toLowerCase());
    }

    matchedTasks.sort((a,b) => a.title.localeCompare(b.title)).forEach(task => {
        const card = document.createElement('div');
        card.className = 'bank-task-card';
        const tierLetter = (task.tier === 'higher') ? 'H' : 'F'; 

        const matchingAssigns = allAssignments.filter(assign => 
            assign.title === task.title && 
            assign.activityType === (task.activityType || 'role_play') && 
            assign.language === (task.language || 'fr') && 
            assign.tier === (task.tier || 'foundation') && 
            assign.yearGroup === task.yearGroup && 
            assign.topic === task.topic
        );

        const assignedClasses = matchingAssigns.map(assign => {
            const course = allCourses.find(c => c.id === assign.courseId);
            return (course && course.name) ? course.name : (assign.courseName || assign.courseCode || "Assigned Class");
        });

        let classHtml = '';
        if (assignedClasses.length > 0) {
            classHtml = assignedClasses.map(clsName => 
                `<span style="background: #fffbe6; border: 1px solid #ffe58f; padding: 2px 5px; border-radius: 4px; font-size: 11px; color: #d46b08; font-weight: 600; display: inline-block; white-space: nowrap;">📋 ${clsName}</span>`
            ).join('');
        }

        card.innerHTML = `
            <div class="bank-task-info">
                <div class="bank-task-title"><span class="badge tier">${tierLetter}</span>${task.title}</div>
                <div class="bank-task-classes-container">${classHtml}</div>
            </div>
            <div class="task-actions" style="margin-top: 2px;">
                <button class="task-action-btn" data-tooltip="Edit" title="Edit" onclick="loadTemplateIntoEditor('${task.id}')">📝</button>
                <button class="task-action-btn" data-tooltip="Duplicate" title="Duplicate" onclick="duplicateTemplate('${task.id}', event)">📋</button>
                <button class="task-action-btn" data-tooltip="Delete" title="Delete" onclick="moveToBin('${task.id}', event)">🗑️</button>
            </div>
        `;
        tasksGrid.appendChild(card);
    });
}

function syncLiveAssignments() {
    db.collection("assignments").onSnapshot((snapshot) => {
        allAssignments = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            allAssignments.push(data);
        });
        updateClassroomDropdownFilters();
        if (typeof renderReadAloudFilters === 'function' && selRaLang) renderReadAloudFilters();
        if (typeof renderRolePlayFilters === 'function' && selRpLang) renderRolePlayFilters();
    });
}

function syncSubmissions() {
    db.collection("submissions").onSnapshot((snapshot) => {
        allSubmissions = [];
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            allSubmissions.push(data);
        });
        renderDynamicMetrics();
    }, (error) => {
        console.error("Firestore submissions listener failed:", error);
    });
}

// =========================================
// GOOGLE CLASSROOM API INTEGRATION & COURSES
// =========================================

async function loadCourses() {
    try {
        await ensureClassroomToken();
        const response = await gapi.client.classroom.courses.list({ 
            teacherId: 'me',
            courseStates: ['ACTIVE'],
            pageSize: 30 
        });
        
        allCourses = response.result.courses || [];
        const filterCourse = document.getElementById('filter-course');
        filterCourse.innerHTML = '<option value="">-- Choose a Course --</option>';
        
        const sortedCourses = [...allCourses].sort((a, b) => a.name.localeCompare(b.name));
        sortedCourses.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course.id;
            opt.textContent = course.name;
            filterCourse.appendChild(opt);
        });

        const select = document.getElementById('course-select');
        select.innerHTML = '';
        sortedCourses.forEach(course => {
            const opt = document.createElement('option');
            opt.value = course.id;
            opt.textContent = course.name;
            select.appendChild(opt);
        });

        if (sortedCourses.length > 0) {
            select.value = sortedCourses[0].id;
            loadClassroomStudents(sortedCourses[0].id);
            loadGoogleClassroomTopics(sortedCourses[0].id);
        }
        if (typeof renderReadAloudFilters === 'function' && selRaLang) renderReadAloudFilters();
        if (typeof renderRolePlayFilters === 'function' && selRpLang) renderRolePlayFilters();
    } catch (e) {
        console.warn("Could not load Google Classroom courses automatically:", e);
    }
}

async function loadGoogleClassroomTopics(courseId) {
    const gcTopicSelect = document.getElementById('gc-topic-select');
    const gcTopicInput = document.getElementById('gc-topic-input');
    
    gcTopicSelect.innerHTML = '<option value="">Loading topics...</option>';
    gcTopicInput.classList.add('hidden');
    gcTopicInput.value = '';

    try {
        await ensureClassroomToken();
        const response = await gapi.client.classroom.courses.topics.list({ courseId: courseId });
        const topics = response.result.topic || [];
        
        gcTopicSelect.innerHTML = '<option value="">-- No Topic --</option><option value="__NEW__">➕ Create new topic</option>';
        topics.forEach(t => {
            const opt = document.createElement('option');
            opt.value = t.topicId;
            opt.textContent = t.name;
            gcTopicSelect.appendChild(opt);
        });
    } catch (err) {
        gcTopicSelect.innerHTML = '<option value="">-- No Topic (Failed to fetch) --</option><option value="__NEW__">➕ Create new topic</option>';
    }
}

async function triggerClassroomTaskSync() {
    const filterCourse = document.getElementById('filter-course');
    const filterTask = document.getElementById('filter-task');
    const selectedCourseId = filterCourse.value;
    const selectedAssignmentId = filterTask.value; 
    const syncBtn = document.getElementById('sync-all-classroom-grades-btn');

    if (!selectedCourseId || !selectedAssignmentId) {
        alert("Please select both a Course and an Assignment to synchronize.");
        return;
    }

    try {
        await ensureClassroomToken();
    } catch (err) {
        alert("Google Classroom authentication is required to sync grades: " + getErrorMessage(err));
        return;
    }

    const activeAssignment = allAssignments.find(a => a.id === selectedAssignmentId);
    if (!activeAssignment || !activeAssignment.gClassroomAssignmentId) {
        alert("No linked Google Classroom assignment found for this database task.");
        return;
    }
    const courseWorkId = activeAssignment.gClassroomAssignmentId;
    const isRolePlay = (activeAssignment.activityType === 'role_play');
    const maxPointsPossible = isRolePlay ? 10 : 12;

    syncBtn.disabled = true;
    const originalText = syncBtn.innerText;
    syncBtn.innerText = "⏳ Syncing Course...";

    try {
        const classSubmissionsResponse = await gapi.client.classroom.courses.courseWork.studentSubmissions.list({
            courseId: selectedCourseId,
            courseWorkId: courseWorkId
        });

        const classroomSubmissions = classSubmissionsResponse.result.studentSubmissions || [];
        const localSubsForTask = allSubmissions.filter(sub => sub.assignmentId === selectedAssignmentId && sub.courseId === selectedCourseId);

        let syncSuccessCount = 0;
        let unsubmittedCount = 0;

        for (let classroomSub of classroomSubmissions) {
            try {
                const profileRes = await gapi.client.classroom.courses.students.get({
                    courseId: selectedCourseId,
                    userId: classroomSub.userId
                });
                
                const studentEmail = profileRes.result.profile.emailAddress.toLowerCase();
                const matchedLocalSub = localSubsForTask.find(s => s.studentEmail.toLowerCase() === studentEmail);

                if (!matchedLocalSub) {
                    unsubmittedCount++;
                    continue;
                }

                let gradeToSubmit = 0;

                if (matchedLocalSub.overallGrade !== undefined) {
                    gradeToSubmit = matchedLocalSub.overallGrade;
                    syncSuccessCount++;
                } else if (matchedLocalSub.score !== undefined) {
                    gradeToSubmit = Math.round((matchedLocalSub.score / 100) * maxPointsPossible);
                    syncSuccessCount++;
                } else {
                    unsubmittedCount++;
                    continue;
                }

                await gapi.client.classroom.courses.courseWork.studentSubmissions.patch({
                    courseId: selectedCourseId,
                    courseWorkId: courseWorkId,
                    id: classroomSub.id,
                    updateMask: "draftGrade,assignedGrade",
                    resource: { draftGrade: gradeToSubmit, assignedGrade: gradeToSubmit }
                });

            } catch (subError) {
                console.warn(`Could not update grade for Student ID ${classroomSub.userId}:`, subError);
            }
        }

        alert(`🎉 Gradebook sync complete!\nSuccessfully sent grades (out of ${maxPointsPossible}) for ${syncSuccessCount} students.\nSkipped ${unsubmittedCount} unsubmitted student(s).`);

    } catch (error) {
        alert(`Gradebook sync failed: ` + getErrorMessage(error));
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerText = originalText;
    }
}

function updateClassroomDropdownFilters() {
    const filterCourse = document.getElementById('filter-course');
    const filterTask = document.getElementById('filter-task');
    const selectedCourseId = filterCourse.value;
    filterTask.innerHTML = '';

    if (!selectedCourseId) {
        filterTask.innerHTML = '<option value="">-- Select a Class first --</option>';
        filterTask.disabled = true;
        document.getElementById('active-assignment-info').classList.add('hidden');
        return;
    }

    const classSpecificAssignments = allAssignments.filter(a => a.courseId === selectedCourseId);
    
    if (classSpecificAssignments.length === 0) {
        filterTask.innerHTML = '<option value="">No Assignments in this Class</option>';
        filterTask.disabled = true;
        document.getElementById('active-assignment-info').classList.add('hidden');
        return;
    }

    filterTask.disabled = false;
    filterTask.innerHTML = '<option value="">-- Choose an Assignment --</option>';

    const sortedAssigns = classSpecificAssignments.sort((a, b) => {
        const getMillis = (obj) => {
            if (!obj || !obj.timestamp) return 0;
            if (obj.timestamp.seconds) return obj.timestamp.seconds * 1000;
            if (typeof obj.timestamp.toDate === 'function') return obj.timestamp.toDate().getTime();
            const d = new Date(obj.timestamp);
            return isNaN(d.getTime()) ? 0 : d.getTime();
        };
        return getMillis(b) - getMillis(a);
    });

    sortedAssigns.forEach(assign => {
        const opt = document.createElement('option');
        opt.value = assign.id;
        const tierLabel = (assign.tier === 'higher') ? 'Ⓗ ' : 'Ⓕ ';
        const prefix = (assign.activityType === 'role_play') ? '🎭 ' : '📖 ';
        opt.textContent = tierLabel + prefix + assign.title;
        filterTask.appendChild(opt);
    });
}

// Setup change event listeners on filtering select elements
document.addEventListener('DOMContentLoaded', () => {
    const filterCourse = document.getElementById('filter-course');
    const filterTask = document.getElementById('filter-task');

    if (filterCourse) {
        filterCourse.onchange = () => {
            updateClassroomDropdownFilters();
            renderDynamicMetrics();
        };
    }
    if (filterTask) {
        filterTask.onchange = renderDynamicMetrics;
    }
});

// =========================================
// STUDENT SELECTOR & WORKSPACE CONTROLS
// =========================================

function updateStudentSelectionSummary() {
    const summary = document.getElementById('student-selection-summary');

    if (!summary) return;

    const total = classroomStudents.length;
    const selected = selectedClassroomStudentIds.length;

    if (total === 0) {
        summary.innerText = "No students";
        return;
    }

    if (selected === total) {
        summary.innerText = "All students";
    } else {
        summary.innerText = `${selected} of ${total} selected`;
    }
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

        const name = profile.name && profile.name.fullName
            ? profile.name.fullName
            : profile.emailAddress || 'Unnamed student';

        const row = document.createElement('label');
        row.style.cssText = `
            display: flex; align-items: center; gap: 10px; padding: 9px 12px;
            cursor: pointer; border-bottom: 1px solid #f1f5f9; font-size: 13px; color: #2c3e50;
        `;

        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = selectedClassroomStudentIds.includes(studentId);

        if (activeEditorMode === "assignment") {
            checkbox.disabled = true;
            checkbox.style.cursor = 'not-allowed';
        }

        checkbox.style.cssText = `
            width: 16px; height: 16px; margin: 0; flex: 0 0 auto;
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

        const nameElement = document.createElement('div');
        nameElement.style.cssText = `font-weight: 600; line-height: 1.3;`;
        nameElement.innerText = name;

        row.appendChild(checkbox);
        row.appendChild(nameElement);
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

        if (summary) summary.innerText = "Select a class";
        if (list) list.innerHTML = '';
        return;
    }

    studentSelectorCourseId = courseId;
    if (summary) summary.innerText = "Loading...";

    if (list) {
        list.innerHTML = `
            <div style="padding: 15px; text-align: center; color: #7f8c8d; font-size: 13px;">
                Loading students...
            </div>
        `;
    }

    try {
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
            const nameA = a.profile && a.profile.name && a.profile.name.fullName
                ? a.profile.name.fullName
                : (a.profile && a.profile.emailAddress) || '';

            const nameB = b.profile && b.profile.name && b.profile.name.fullName
                ? b.profile.name.fullName
                : (b.profile && b.profile.emailAddress) || '';

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
            list.innerHTML = `
                <div style="padding: 15px; color: #c0392b; font-size: 13px;">
                    Unable to load students from Google Classroom.
                    Please check the Classroom permissions and try again.
                </div>
            `;
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
    if (panel) panel.classList.toggle('hidden');
}

function initialiseClassroomStudentSelector() {
    const allStudentsButton = document.getElementById('all-students-btn');
    const selectAllButton = document.getElementById('select-all-students-btn');

    if (allStudentsButton) allStudentsButton.onclick = openStudentSelector;
    if (selectAllButton) selectAllButton.onclick = selectAllClassroomStudents;
}

initialiseClassroomStudentSelector();

// =========================================
// SUBMISSION MARKING & GRADING UTILITIES
// =========================================

function updateRubricFeedbackText(submissionId, activeTier) {
    const rubricVal = parseInt(document.getElementById(`rubric-${submissionId}`).value, 10) || 0;
    const unseen1Val = parseInt(document.getElementById(`unseen1-${submissionId}`).value, 10) || 0;
    const unseen2Val = parseInt(document.getElementById(`unseen2-${submissionId}`).value, 10) || 0;

    const feedbackDiv = document.getElementById(`rubric-descriptor-${submissionId}`);
    const commentInput = document.getElementById(`feedback-${submissionId}`);

    const descriptors = {
        foundation: {
            "0": "No response or nothing of merit matching the speaking markscheme.",
            "1": "Pronunciation is limited in clarity; lapses in SSCs often cause the message to break down.",
            "2": "Pronunciation is limited in clarity; lapses in SSCs often cause the message to break down.",
            "3": "Pronunciation is occasionally clear and comprehensible; lapses in SSCs sometimes cause the message to break down.",
            "4": "Pronunciation is occasionally clear and comprehensible; lapses in SSCs sometimes cause the message to break down.",
            "5": "Pronunciation is sometimes clear and comprehensible; lapses in SSCs occasionally makes the message unclear/difficult to understand immediately.",
            "6": "Pronunciation is sometimes clear and comprehensible; lapses in SSCs occasionally makes the message unclear/difficult to understand immediately.",
            "7": "Pronunciation is generally clear and comprehensible; lapses in SSCs have little or no impact on the message.",
            "8": "Pronunciation is generally clear and comprehensible; lapses in SSCs have little or no impact on the message."
        },
        higher: {
            "0": "No response or nothing of merit matching the speaking markscheme.",
            "1": "Pronunciation is sometimes clear and comprehensible; lapses in SSCs occasionally makes the message unclear/difficult to understand immediately.",
            "2": "Pronunciation is sometimes clear and comprehensible; lapses in SSCs occasionally makes the message unclear/difficult to understand immediately.",
            "3": "Pronunciation is generally clear and comprehensible; lapses in SSCs have little or no impact on the message.",
            "4": "Pronunciation is generally clear and comprehensible; lapses in SSCs have little or no impact on the message.",
            "5": "Pronunciation is clear and comprehensible, lapses in SSCs have minimal impact on the message.",
            "6": "Pronunciation is clear and comprehensible, lapses in SSCs have minimal impact on the message.",
            "7": "Pronunciation is consistently clear and comprehensible, any lapses in SSCs have no impact on the message.",
            "8": "Pronunciation is consistently clear and comprehensible, any lapses in SSCs have no impact on the message."
        }
    };

    const unseen1Descriptors = {
        "0": "Unrewardable communication.",
        "1": "Response partially communicated with some ambiguity.",
        "2": "Response fully communicated."
    };

    const unseen2Descriptors = {
        "0": "Unrewardable communication.",
        "1": "Response partially communicated with some ambiguity.",
        "2": "Response fully communicated."
    };

    const tierKey = (activeTier === 'higher') ? 'higher' : 'foundation';
    const readAloudFeedback = descriptors[tierKey][rubricVal.toString()] || "";
    const q1Feedback = unseen1Descriptors[unseen1Val.toString()] || "";
    const q2Feedback = unseen2Descriptors[unseen2Val.toString()] || "";

    if (feedbackDiv) feedbackDiv.innerText = readAloudFeedback;

    const filterTask = document.getElementById('filter-task');
    const subObj = allSubmissions.find(s => s.id === submissionId);
    const activeAssignment = allAssignments.find(a => a.id === (subObj ? subObj.assignmentId : filterTask.value));

    let sentenceLines = "";
    let originalSentences = [];
    if (activeAssignment && activeAssignment.text) {
        originalSentences = activeAssignment.text.match(/[^.!?]+[.!?]*/g) || [activeAssignment.text];
    }
    
    originalSentences.forEach((sText, idx) => {
        sentenceLines += `• Sentence ${idx + 1}: "${sText.trim()}"\n`;
    });

    const q1Title = activeAssignment ? (activeAssignment.unseenQ1Title || "Unseen Question 1") : "Unseen Question 1";
    const q2Title = activeAssignment ? (activeAssignment.unseenQ2Title || "Unseen Question 2") : "Unseen Question 2";

    const structuredDefault = 
        `★ General Feedback ★\n` +
        `${readAloudFeedback}\n\n` +
        `★ Sentence Breakdown ★\n` +
        `${sentenceLines}\n` +
        `★ Unseen Questions ★\n` +
        `• Unseen Q1 (${q1Title}): ${unseen1Val}/2 Marks - ${q1Feedback}\n` +
        `• Unseen Q2 (${q2Title}): ${unseen2Val}/2 Marks - ${q2Feedback}`;

    if (commentInput) {
        if (commentInput.dataset.userEdited !== "true" || !commentInput.value.includes('★ Sentence Breakdown ★')) {
            commentInput.value = structuredDefault;
        } else {
            let currentVal = commentInput.value;
            const u1Regex = /(•?\s*Unseen Q1\b[^\n]*)/i;
            const newU1Line = `• Unseen Q1 (${q1Title}): ${unseen1Val}/2 Marks - ${q1Feedback}`;
            if (u1Regex.test(currentVal)) {
                currentVal = currentVal.replace(u1Regex, newU1Line);
            }

            const u2Regex = /(•?\s*Unseen Q2\b[^\n]*)/i;
            const newU2Line = `• Unseen Q2 (${q2Title}): ${unseen2Val}/2 Marks - ${q2Feedback}`;
            if (u2Regex.test(currentVal)) {
                currentVal = currentVal.replace(u2Regex, newU2Line);
            }
            commentInput.value = currentVal;
        }
    }

    recalculateTotals(submissionId);
}

function updateRolePlayLiveTotals(submissionId) {
    let totalScore = 0;
    let breakdownComments = "★ Role Play Feedback ★\n----------------------------------------\n";
    
    let promptLines = [];
    for (let i = 1; i <= 5; i++) {
        const markElem = document.getElementById(`rp-mark-${i}-${submissionId}`);
        const val = markElem ? (parseInt(markElem.value, 10) || 0) : 0;
        totalScore += val;
        
        let desc = "No rewardable communication.";
        if (val === 1) desc = "Partially completed with syntax ambiguity.";
        if (val === 2) desc = "Fully statement communicated smoothly.";
        
        const line = `• Statement Prompt ${i}: ${val}/2 Marks - ${desc}`;
        promptLines.push({ index: i, line });
        breakdownComments += `${line}\n`;
    }
    
    breakdownComments += `----------------------------------------\nOverall Score: ${totalScore} / 10`;
    
    const gradeView = document.getElementById(`total-grade-view-${submissionId}`);
    const pctView = document.getElementById(`total-pct-view-${submissionId}`);
    if (gradeView) gradeView.innerText = `${totalScore} / 10`;
    if (pctView) pctView.innerText = `${Math.round((totalScore / 10) * 100)}%`;

    const feedbackElem = document.getElementById(`feedback-${submissionId}`);
    if (feedbackElem) {
        if (feedbackElem.dataset.userEdited !== "true") {
            feedbackElem.value = breakdownComments;
        } else if (feedbackElem.value.includes('★ Role Play Feedback ★')) {
            let currentVal = feedbackElem.value;
            promptLines.forEach(item => {
                const regex = new RegExp(`•?\\s*Statement Prompt ${item.index}\\b[^\\n]*`, 'i');
                if (regex.test(currentVal)) {
                    currentVal = currentVal.replace(regex, item.line);
                }
            });
            const scoreRegex = /Overall Score:\s*\d+\s*\/\s*10/i;
            if (scoreRegex.test(currentVal)) {
                currentVal = currentVal.replace(scoreRegex, `Overall Score: ${totalScore} / 10`);
            }
            feedbackElem.value = currentVal;
        }
    }
}

function recalculateTotals(submissionId) {
    const rubricVal = parseInt(document.getElementById(`rubric-${submissionId}`).value, 10) || 0;
    const u1Val = parseInt(document.getElementById(`unseen1-${submissionId}`).value, 10) || 0;
    const u2Val = parseInt(document.getElementById(`unseen2-${submissionId}`).value, 10) || 0;

    const totalGrade = rubricVal + u1Val + u2Val;
    const finalPercentage = Math.round((totalGrade / 12) * 100);

    document.getElementById(`total-grade-view-${submissionId}`).innerText = `${totalGrade} / 12`;
    document.getElementById(`total-pct-view-${submissionId}`).innerText = `${finalPercentage}%`;
}

async function saveLiveGrades(submissionId, isRolePlay) {
    let updatePayload = {};
    const commentInput = document.getElementById(`feedback-${submissionId}`);
    const commentVal = commentInput ? commentInput.value.trim() : "";

    if (isRolePlay) {
        let totalGrade = 0;
        let rpMarksArray = [];
        for (let i = 1; i <= 5; i++) {
            const val = parseInt(document.getElementById(`rp-mark-${i}-${submissionId}`).value, 10) || 0;
            rpMarksArray.push(val);
            totalGrade += val;
        }
        updatePayload = {
            rolePlayMarks: rpMarksArray,
            teacherComment: commentVal,
            overallGrade: totalGrade,
            percentage: Math.round((totalGrade / 10) * 100)
        };
    } else {
        const rubricVal = parseInt(document.getElementById(`rubric-${submissionId}`).value, 10) || 0;
        const u1Val = parseInt(document.getElementById(`unseen1-${submissionId}`).value, 10) || 0;
        const u2Val = parseInt(document.getElementById(`unseen2-${submissionId}`).value, 10) || 0;
        
        const sscScoreInput = document.getElementById(`ssc-score-${submissionId}`);
        const manualSscScore = sscScoreInput ? (parseInt(sscScoreInput.value, 10) || 0) : 0;

        const overallGrade = rubricVal + u1Val + u2Val;

        updatePayload = {
            score: manualSscScore,
            rubricGrade: rubricVal,
            unseen1Grade: u1Val,
            unseen2Grade: u2Val,
            teacherComment: commentVal,
            overallGrade: overallGrade,
            percentage: Math.round((overallGrade / 12) * 100)
        };
    }

    try {
        await db.collection("submissions").doc(submissionId).update(updatePayload);
        if (commentInput && commentVal) commentInput.dataset.userEdited = "true";
        alert("✅ Grade & custom feedback saved locally! Click 'Sync Grade & Post Comment' to send to Google Classroom.");
    } catch(e) {
        alert("Error updating database grade: " + getErrorMessage(e));
    }
}

async function postPrivateCommentToClassroom(courseId, courseWorkId, studentSubmissionId, commentText, accessToken) {
    const url = `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${studentSubmissionId}/comments`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ commentText: commentText })
        });
        return response.ok;
    } catch (error) {
        return false;
    }
}

async function syncSingleStudentToClassroom(subId, isRolePlay) {
    const syncBtn = document.getElementById(`sync-btn-${subId}`);
    if (!syncBtn) return;
    
    syncBtn.disabled = true;
    const originalText = syncBtn.innerText;
    syncBtn.innerText = "⏳ Syncing...";

    try {
        let overallGrade = 0;
        let percentage = 0;
        let updatePayload = {};

        const commentInput = document.getElementById(`feedback-${subId}`);
        const commentVal = commentInput ? commentInput.value.trim() : "";

        if (isRolePlay) {
            let rpMarksArray = [];
            for (let i = 1; i <= 5; i++) {
                const val = parseInt(document.getElementById(`rp-mark-${i}-${subId}`).value, 10) || 0;
                rpMarksArray.push(val);
                overallGrade += val;
            }
            percentage = Math.round((overallGrade / 10) * 100);
            updatePayload = { rolePlayMarks: rpMarksArray, teacherComment: commentVal, overallGrade, percentage, syncedToClassroom: true };
        } else {
            const rubricVal = parseInt(document.getElementById(`rubric-${subId}`).value, 10) || 0;
            const u1Val = parseInt(document.getElementById(`unseen1-${subId}`).value, 10) || 0;
            const u2Val = parseInt(document.getElementById(`unseen2-${subId}`).value, 10) || 0;
            
            const sscScoreInput = document.getElementById(`ssc-score-${subId}`);
            const manualSscScore = sscScoreInput ? (parseInt(sscScoreInput.value, 10) || 0) : 0;

            overallGrade = rubricVal + u1Val + u2Val;
            percentage = Math.round((overallGrade / 12) * 100);
            
            updatePayload = { score: manualSscScore, rubricGrade: rubricVal, unseen1Grade: u1Val, unseen2Grade: u2Val, teacherComment: commentVal, overallGrade, percentage, syncedToClassroom: true };
        }

        await db.collection("submissions").doc(subId).update(updatePayload);
        if (commentInput && commentVal) commentInput.dataset.userEdited = "true";

        const subObj = allSubmissions.find(s => s.id === subId);
        if (!subObj) throw new Error("Could not load database metrics locally.");

        const courseId = subObj.courseId;
        const activeAssignment = allAssignments.find(a => a.id === subObj.assignmentId);
        if (!activeAssignment || !activeAssignment.gClassroomAssignmentId) {
            alert("✅ Feedback saved to app database successfully!");
            return;
        }
        const courseWorkId = activeAssignment.gClassroomAssignmentId;

        let accessToken = await ensureClassroomToken();
        if (!accessToken) throw new Error("Teacher credentials missing.");

        const studentEmail = subObj.studentEmail.toLowerCase();
        const classroomSubsResponse = await gapi.client.classroom.courses.courseWork.studentSubmissions.list({ courseId, courseWorkId });
        const classroomSubs = classroomSubsResponse.result.studentSubmissions || [];
        
        let matchedSubmission = null;
        for (let classroomSub of classroomSubs) {
            const profileRes = await gapi.client.classroom.courses.students.get({ courseId, userId: classroomSub.userId });
            if (profileRes.result.profile.emailAddress.toLowerCase() === studentEmail) {
                matchedSubmission = classroomSub;
                break;
            }
        }

        if (!matchedSubmission) throw new Error("Could not resolve student's Classroom submission ID.");

        const studentSubmissionId = matchedSubmission.id;
        const patchUrl = `https://classroom.googleapis.com/v1/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions/${studentSubmissionId}?updateMask=draftGrade,assignedGrade`;
        
        const gradeResponse = await fetch(patchUrl, {
            method: 'PATCH',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ draftGrade: overallGrade, assignedGrade: overallGrade })
        });

        if (!gradeResponse.ok) throw new Error("Failed to patch score in Google Classroom.");

        const structuredComment = isRolePlay ? commentVal : 
           `★ Reading Aloud Assessment Feedback ★\n` +
           `----------------------------------------\n` +
           `• Read Aloud Accuracy: ${document.getElementById(`rubric-${subId}`).value} / 8\n` +
           `• Unseen Question 1: ${document.getElementById(`unseen1-${subId}`).value} / 2\n` +
           `• Unseen Question 2: ${document.getElementById(`unseen2-${subId}`).value} / 2\n` +
           `----------------------------------------\n` +
           `Overall Grade: ${overallGrade} / 12\n\n` +
           `Teacher Feedback:\n${commentVal}`;

        await postPrivateCommentToClassroom(courseId, courseWorkId, studentSubmissionId, structuredComment, accessToken);

        alert(`🎉 Grade & feedback comment synced successfully!`);
        
    } catch (error) {
        alert("Workflow Sync Warning: " + getErrorMessage(error) + "\n(Your custom notes were saved to the student link database successfully).");
    } finally {
        syncBtn.disabled = false;
        syncBtn.innerText = originalText;
    }
}

async function updateSubmissionCounter(selectedCourseId, activeAssignment, submissionCount) {
    const counterBadge = document.getElementById('submission-counter-badge');
    if (!counterBadge) return;

    let assignedCount = (activeAssignment && activeAssignment.assignedStudentIds) ? activeAssignment.assignedStudentIds.length : 0;

    counterBadge.innerText = `📥 ${submissionCount} / ${assignedCount || '?'} Submitted`;

    if (activeAssignment && activeAssignment.gClassroomAssignmentId && typeof gapi !== 'undefined' && gapi.client && gapi.client.classroom) {
        try {
            const res = await gapi.client.classroom.courses.courseWork.studentSubmissions.list({
                courseId: selectedCourseId,
                courseWorkId: activeAssignment.gClassroomAssignmentId
            });
            if (res.result && res.result.studentSubmissions) {
                assignedCount = res.result.studentSubmissions.length;
            }
        } catch (e) {
            console.warn("Could not fetch live GC assigned count:", e);
        }
    }

    if (assignedCount === 0 && classroomStudents.length > 0) {
        assignedCount = classroomStudents.length;
    }

    counterBadge.innerText = `📥 ${submissionCount} / ${assignedCount} Submitted`;
}

function renderDynamicMetrics() {
    const filterCourse = document.getElementById('filter-course');
    const filterTask = document.getElementById('filter-task');
    const selectedCourseId = filterCourse.value;
    const selectedAssignmentId = filterTask.value;
    const tbody = document.getElementById('submissions-table-body');

    if (!selectedCourseId || !selectedAssignmentId) {
        document.getElementById('active-assignment-info').classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #7f8c8d;">Please select both a course and assignment to show grades.</td></tr>`;
        return;
    }

    document.getElementById('active-assignment-info').classList.remove('hidden');
    renderStudentSubmissions(selectedCourseId, selectedAssignmentId, tbody);
}

function renderStudentSubmissions(selectedCourseId, selectedAssignmentId, tbody) {
    const activeAssignment = allAssignments.find(a => a.id === selectedAssignmentId);
    const isRolePlay = activeAssignment && (activeAssignment.activityType === "role_play");
    const maxPoints = isRolePlay ? 10 : 12;

    const theadRow = document.querySelector('#submissions-section table thead tr');
    if (theadRow) {
        if (isRolePlay) {
            theadRow.innerHTML = `
                <th>Student Details</th>
                <th>Completed Date / Time</th>
                <th id="grade-column-header">Overall Grade</th>
                <th>Actions</th>
            `;
        } else {
            theadRow.innerHTML = `
                <th>Student Details</th>
                <th>Submission</th>
                <th>SSC Accuracy (Editable)</th>
                <th id="grade-column-header">Overall Grade</th>
                <th>Actions</th>
            `;
        }
    }

    let originalSentences = [];
    let rolePlayPrompts = [];
    let tierLabel = "Foundation";
    let tierValue = "foundation";

    if (activeAssignment) {
        tierValue = activeAssignment.tier || "foundation";
        tierLabel = tierValue.toUpperCase();
        document.getElementById('active-task-metadata').innerHTML = `<strong>Type:</strong> ${isRolePlay ? 'Role Play' : 'Read Aloud'} | <strong>Tier:</strong> ${tierLabel} | <strong>Max Points:</strong> ${maxPoints}`;
        
        if (isRolePlay) {
            rolePlayPrompts = activeAssignment.rolePlayPrompts || [];
        } else if (activeAssignment.text) {
            originalSentences = activeAssignment.text.match(/[^.!?]+[.!?]*/g) || [activeAssignment.text];
        }
    }

    const filteredSubs = allSubmissions.filter(sub => sub.assignmentId === selectedAssignmentId && sub.courseId === selectedCourseId);
    
    updateSubmissionCounter(selectedCourseId, activeAssignment, filteredSubs.length);

    tbody.innerHTML = '';

    if (filteredSubs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: #7f8c8d;">No student submissions found.</td></tr>`;
        return;
    }

    filteredSubs.forEach(sub => {
        const studentName = sub.studentName || "Unnamed Student";
        const studentEmail = sub.studentEmail || "No Email";
        const displayOverallGrade = sub.overallGrade !== undefined ? `${sub.overallGrade} / ${maxPoints}` : `-- / ${maxPoints}`;

        let submissionDateStr = "Date/Time Unknown";
        const targetDate = sub.submittedAt || sub.timestamp || null;
        if (targetDate) {
            const d = targetDate.toDate ? targetDate.toDate() : new Date(targetDate.seconds ? targetDate.seconds * 1000 : targetDate);
            if (!isNaN(d.getTime())) {
                submissionDateStr = d.toLocaleDateString('en-GB') + ' @ ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
            }
        }

        const headerRow = document.createElement('tr');
        headerRow.className = 'student-header-row';
        headerRow.id = `header-${sub.id}`;
        
        let columnsHtml = `
            <td>
                <div class="student-name-container">
                    <span class="arrow-indicator">▶</span>
                    <div>
                        <strong>${studentName}</strong><br>
                        <small style="color:#7f8c8d;">${studentEmail}</small>
                    </div>
                </div>
            </td>
        `;

        if (isRolePlay) {
            columnsHtml += `
                <td><span style="font-size:13px; color:#475569; font-weight:500;">${submissionDateStr}</span></td>
            `;
        } else {
            const sscScore = sub.score || 0;
            columnsHtml += `
                <td><span style="font-size:13px; color:#475569; font-weight:500;">${submissionDateStr}</span></td>
                <td>
                    <div style="display: flex; align-items: center; gap: 4px;" onclick="event.stopPropagation();">
                        <input type="number" id="ssc-score-${sub.id}" class="ssc-score-input" value="${sscScore}" min="0" max="100">
                        <span style="font-weight: bold; font-size: 13px;">%</span>
                    </div>
                </td>
            `;
        }

        columnsHtml += `
            <td><strong style="color:#2ecc71; font-size:16px;">${displayOverallGrade}</strong></td>
            <td><button class="btn-inline-delete">Delete</button></td>
        `;
        
        headerRow.innerHTML = columnsHtml;

        let leftBlockHtml = "";
        let rightBlockHtml = "";

        const studentSentences = isRolePlay 
            ? (sub.roleplayResponses || sub.rolePlayResponses || [])
            : (sub.sentence || sub.sentences || sub.sentenceScores || []);

        if (isRolePlay) {
            leftBlockHtml += `
                <div style="margin: 0 0 10px 0; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0;">
                    <h4 style="margin: 0; color: #1a365d; font-size: 16px; font-weight: bold; display: flex; align-items: center;">
                        🎭 Role Play
                    </h4>
                </div>
            `;
            
            for (let i = 0; i < 5; i++) {
                const prompt = rolePlayPrompts[i] || { teacher: "", student: "" };
                const turnRecord = studentSentences[i] || {};
                const audioSource = turnRecord.audio || "";

                leftBlockHtml += `
                    <div class="sentence-item" style="background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px 16px; margin-bottom: 4px; box-shadow: 0 1px 2px rgba(0,0,0,0.02);">
                        <div style="display: flex; justify-content: space-between; align-items: center; gap: 20px;">
                            <div style="flex: 1; display: flex; gap: 10px; align-items: flex-start;">
                                <span style="font-size: 14px; font-weight: bold; color: #e67e22; line-height: 1.4;">${i+1}</span>
                                <div style="display: flex; flex-direction: column; gap: 4px;">
                                    <div style="font-size: 14px; color: #2c3e50; line-height: 1.4;">
                                        <span style="color: #7f8c8d;">Teacher:</span> <strong>"${prompt.teacher || '...'}"</strong>
                                    </div>
                                    <div style="font-size: 14px; color: #2c3e50; line-height: 1.4;">
                                        <span style="color: #7f8c8d;">Student:</span> <em>${prompt.student || '...'}</em>
                                    </div>
                                </div>
                            </div>
                            <div style="flex: 0 0 auto; min-width: 240px; text-align: right; display: flex; align-items: center; justify-content: flex-end;">
                                ${audioSource ? 
                                    `<audio controls src="${audioSource}" style="height: 30px; width: 240px;"></audio>` : 
                                    `<span style="color:#e74c3c; font-size:12px; font-style:italic; padding-right:10px;">No recording submitted</span>`
                                }
                            </div>
                        </div>
                    </div>
                `;
            }

            const savedMarks = sub.rolePlayMarks || [0,0,0,0,0];
            
            rightBlockHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0;">
                    <h4 style="margin: 0; color: #2c3e50; font-size: 16px; font-weight: bold; display: flex; align-items: center; gap: 6px;">
                        📝 Role Play Marking
                    </h4>
                    <div id="roleplayTotalScoreContainer-${sub.id}" style="font-size: 14px; font-weight: bold; color: #2b6cb0; background: #ebf8ff; padding: 4px 8px; border-radius: 4px;">
                        Total Score: <span id="total-grade-view-${sub.id}">0 / 10</span> (<span id="total-pct-view-${sub.id}">0%</span>)
                    </div>
                </div>
            `;

            for (let i = 1; i <= 5; i++) {
                const currentMark = savedMarks[i-1] || 0;
                rightBlockHtml += `
                    <div class="matrix-row" style="display: flex; align-items: center; justify-content: flex-start; gap: 12px; margin-bottom: 8px;">
                        <span style="font-size: 13px; color: #2c3e50; min-width: 170px; display: inline-block;">
                            Prompt ${i} mark:
                        </span>
                        <select id="rp-mark-${i}-${sub.id}" class="score-selector rp-live-select-${sub.id}" style="width: auto; padding: 3px; font-size:12px;">
                            <option value="0" ${currentMark === 0 ? 'selected':''}>0 - No rewardable communication</option>
                            <option value="1" ${currentMark === 1 ? 'selected':''}>1 - Response partially communicated, some ambiguity.</option>
                            <option value="2" ${currentMark === 2 ? 'selected':''}>2 - Response fully communicated</option>
                        </select>
                    </div>
                `;
            }

            rightBlockHtml += `
                <label style="font-weight: bold; font-size: 11px; color: #34495e; display: block; margin-top: 10px;">Teacher Feedback / Comments (Editable):</label>
                <textarea id="feedback-${sub.id}" rows="4" style="margin-top: 4px; font-size:12px; width: 100%; box-sizing: border-box;" placeholder="Add details or custom feedback...">${sub.teacherComment || ''}</textarea>
                <div style="display: flex; gap: 6px; margin-top: 10px;">
                    <button id="save-btn-${sub.id}" style="flex:1; background:#2ecc71; color:white; border:none; padding:8px; font-size:11px; cursor:pointer; border-radius:4px;">💾 Save Local</button>
                    <button id="sync-btn-${sub.id}" style="flex:1; background:#9b59b6; color:white; border:none; padding:8px; font-size:11px; cursor:pointer; border-radius:4px;">🚀 Sync Classroom</button>
                </div>
            `;

        } else {
            let sentenceDetailsHtml = studentSentences.map((sent, index) => {
                const sentenceAccuracy = (sent.attempts && sent.attempts.length > 0) ? sent.attempts[sent.attempts.length - 1] : 0;
                const sentenceText = originalSentences[index] || "Passage text not resolved";
                const audioSource = sent.audio || sent.audioUrl || "";
                
                const worstPct = (sent.attempts && sent.attempts.length > 0) ? Math.min(...sent.attempts) : 0;
                const finalPct = sentenceAccuracy;
                const attemptsCount = sent.attempts ? sent.attempts.length : 0;

                let hintWordsArray = [];
                const sentenceHints = sent.hintsUsed || sent.hints;
                
                if (sentenceHints && Array.isArray(sentenceHints)) {
                    sentenceHints.forEach(h => {
                        const cleanHint = h.replace(/^Word:\s*/i, "").trim();
                        if (cleanHint && !hintWordsArray.includes(cleanHint)) {
                            hintWordsArray.push(cleanHint);
                        }
                    });
                } else if (sub && sub.hintsUsed && Array.isArray(sub.hintsUsed)) {
                    const cleanSentenceWords = sentenceText
                        .toLowerCase()
                        .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?¿¡"']/g, " ")
                        .split(/\s+/);

                    sub.hintsUsed.forEach(h => {
                        const cleanHint = h.replace(/^Word:\s*/i, "").trim();
                        if (cleanHint && cleanSentenceWords.includes(cleanHint.toLowerCase())) {
                            if (!hintWordsArray.includes(cleanHint)) {
                                hintWordsArray.push(cleanHint);
                            }
                        }
                    });
                }

                const hintWords = hintWordsArray.length > 0 ? 
                    hintWordsArray.map(h => `<span style="background: #fffbe6; border: 1px solid #ffe58f; padding: 2px 5px; border-radius: 4px; font-size: 11px; color: #d46b08; font-weight: 600; display: inline-block;">${h}</span>`).join(' ') : 
                    '<span style="color: #a0aec0; font-style: italic;">None</span>';

                return `
                    <div class="sentence-item" style="background:#fff; border:1px solid #e2e8f0; padding:10px; border-radius:6px; margin-bottom:8px;">
                        <div style="font-size:12px; background:#f4fbf7; padding:6px 10px; border-left:3px solid #2ecc71; margin-bottom:6px; font-weight: 500;">"${sentenceText}"</div>
                        <div style="font-size:11px; color:#475569; display:flex; flex-wrap:wrap; gap:12px; margin-bottom:6px; background:#f8fafc; padding:6px; border-radius:4px; border:1px solid #e2e8f0;">
                            <div><strong>Attempts:</strong> ${attemptsCount}/5</div>
                            <div><strong>Accuracy:</strong> ${worstPct}% ➔ ${finalPct}%</div>
                            <div style="display:flex; align-items:center; gap:4px;"><strong>💡 Hints:</strong> ${hintWords}</div>
                        </div>
                        ${audioSource ? `<audio controls src="${audioSource}" style="height:22px; width:100%; max-width:220px;"></audio>` : `<span style="color:red; font-size:10px;">No file</span>`}
                    </div>
                `;
            }).join('');

            const unseenQ1Name = activeAssignment.unseenQ1Title || "Unseen Question 1";
            const unseenQ2Name = activeAssignment.unseenQ2Title || "Unseen Question 2";
            const u1Audio = (sub.unseenResponses && sub.unseenResponses[0]) ? (sub.unseenResponses[0].audio || sub.unseenResponses[0].audioUrl) : null;
            const u2Audio = (sub.unseenResponses && sub.unseenResponses[1]) ? (sub.unseenResponses[1].audio || sub.unseenResponses[1].audioUrl) : null;

            leftBlockHtml += `
                <h4 style="margin:0 0 5px 0; font-size:13px; color:#2c3e50;">📖 Read Aloud Tracking</h4>
                ${sentenceDetailsHtml}
                <h4 style="margin:12px 0 5px 0; font-size:13px; color:#2c3e50;">👂 Unseen Question Submissions</h4>
                <div style="display: flex; gap: 10px; margin-top: 5px;">
                    <div style="flex: 1; font-size:12px; padding:8px; background:#f8fafc; border:1px solid #ddd; border-radius:4px;">
                        <strong>Q1: ${unseenQ1Name}</strong><br>
                        ${u1Audio ? `<audio controls src="${u1Audio}" style="height:22px; width:100%; max-width:100%; margin-top:5px;"></audio>`: `<small style="color:#e74c3c; display:block; margin-top:5px;">Unrecorded</small>`}
                    </div>
                    <div style="flex: 1; font-size:12px; padding:8px; background:#f8fafc; border:1px solid #ddd; border-radius:4px;">
                        <strong>Q2: ${unseenQ2Name}</strong><br>
                        ${u2Audio ? `<audio controls src="${u2Audio}" style="height:22px; width:100%; max-width:100%; margin-top:5px;"></audio>`: `<small style="color:#e74c3c; display:block; margin-top:5px;">Unrecorded</small>`}
                    </div>
                </div>
            `;

            const savedRubric = sub.rubricGrade !== undefined ? sub.rubricGrade : 0;
            const savedU1 = sub.unseen1Grade !== undefined ? sub.unseen1Grade : 0;
            const savedU2 = sub.unseen2Grade !== undefined ? sub.unseen2Grade : 0;

            rightBlockHtml += `
                <div class="grading-section" style="margin: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #edf2f7; padding-bottom: 6px; margin-bottom: 12px;">
                        <h4 style="margin:0; font-size:13px; color:#9b59b6;">📝 Read Aloud Marking</h4>
                        <div style="background: #e6f7ff; color: #1890ff; border: 1px solid #91d5ff; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; display: inline-block;">
                            Grade: <span id="total-grade-view-${sub.id}">0/12</span> (<span id="total-pct-view-${sub.id}">0%</span>)
                        </div>
                    </div>
                    
                    <div style="display: flex; gap: 8px; align-items: center; justify-content: flex-start; margin-bottom: 8px;">
                        <span style="font-size:11px; font-weight: bold; color: #34495e;">Accuracy Mark (/8):</span>
                        <select id="rubric-${sub.id}" style="width:auto; font-size:11px; padding:2px; margin:0;">
                            ${[0,1,2,3,4,5,6,7,8].map(v => `<option value="${v}" ${v===savedRubric?'selected':''}>${v} Marks</option>`).join('')}
                        </select>
                    </div>
                    <div class="rubric-descriptor" id="rubric-descriptor-${sub.id}" style="margin-bottom: 12px;">Compiling text...</div>
                    
                    <div style="display: flex; gap: 12px; margin-top: 8px; margin-bottom: 8px;">
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size:11px; font-weight:bold; color: #34495e;">Unseen Q1 (/2):</span>
                            <select id="unseen1-${sub.id}" class="data-unseen-${sub.id}" style="width: 100%; font-size: 11px; padding: 2px; margin: 0;">
                                <option value="0" ${savedU1===0?'selected':''}>0 - Unrewardable</option>
                                <option value="1" ${savedU1===1?'selected':''}>1 - Partial</option>
                                <option value="2" ${savedU1===2?'selected':''}>2 - Fully Communicated</option>
                            </select>
                        </div>
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 4px;">
                            <span style="font-size:11px; font-weight:bold; color: #34495e;">Unseen Q2 (/2):</span>
                            <select id="unseen2-${sub.id}" class="data-unseen-${sub.id}" style="width: 100%; font-size: 11px; padding: 2px; margin: 0;">
                                <option value="0" ${savedU2===0?'selected':''}>0 - Unrewardable</option>
                                <option value="1" ${savedU2===1?'selected':''}>1 - Partial</option>
                                <option value="2" ${savedU2===2?'selected':''}>2 - Fully Communicated</option>
                            </select>
                        </div>
                    </div>
                    
                    <label style="font-weight: bold; font-size: 11px; color: #34495e; display: block; margin-top: 10px;">Teacher Feedback / Comments (Editable):</label>
                    <textarea id="feedback-${sub.id}" rows="4" style="margin-top: 4px; font-size:12px; width: 100%; box-sizing: border-box;" placeholder="Add details or custom feedback...">${sub.teacherComment || ''}</textarea>
                    <div style="display: flex; gap: 6px; margin-top: 12px;">
                        <button id="save-btn-${sub.id}" style="flex:1; background:#2ecc71; color:white; border:none; padding:8px; font-size:11px; cursor:pointer; border-radius:4px;">💾 Save Local</button>
                        <button id="sync-btn-${sub.id}" style="flex:1; background:#9b59b6; color:white; border:none; padding:8px; font-size:11px; cursor:pointer; border-radius:4px;">🚀 Sync Classroom</button>
                    </div>
                </div>
            `;
        }

        const detailsRow = document.createElement('tr');
        detailsRow.className = 'details-row hidden';
        detailsRow.id = `details-${sub.id}`;
        detailsRow.innerHTML = `
            <td colspan="5">
                <div class="details-container" style="display: grid; grid-template-columns: 1.4fr 1fr; gap:15px; padding:10px; align-items: stretch; background:#f8fafc;">
                    <div class="details-block-left" style="background:white; padding:12px; border:1px solid #cbd5e1; border-radius:6px;">${leftBlockHtml}</div>
                    <div class="details-block-right" style="background:white; padding:12px; border:1px solid #cbd5e1; border-radius:6px;">${rightBlockHtml}</div>
                </div>
            </td>
        `;

        tbody.appendChild(headerRow);
        tbody.appendChild(detailsRow);

        const feedbackBox = detailsRow.querySelector(`#feedback-${sub.id}`);
        if (sub.teacherComment && sub.teacherComment.trim().length > 0) {
            if (feedbackBox) {
                feedbackBox.value = sub.teacherComment;
                if (sub.teacherComment.includes('★ Sentence Breakdown ★') || sub.teacherComment.includes('★ Role Play Feedback ★')) {
                    feedbackBox.dataset.userEdited = "true";
                } else {
                    feedbackBox.dataset.userEdited = "false";
                }
            }
        }
        if (feedbackBox) {
            feedbackBox.addEventListener('input', () => {
                feedbackBox.dataset.userEdited = "true";
            });
        }

        if (isRolePlay) {
            detailsRow.querySelectorAll(`.rp-live-select-${sub.id}`).forEach(s => {
                s.addEventListener('change', () => updateRolePlayLiveTotals(sub.id));
            });
            updateRolePlayLiveTotals(sub.id);
        } else {
            detailsRow.querySelector(`#rubric-${sub.id}`).addEventListener('change', () => updateRubricFeedbackText(sub.id, tierValue));
            detailsRow.querySelectorAll(`.data-unseen-${sub.id}`).forEach(s => {
                s.addEventListener('change', () => updateRubricFeedbackText(sub.id, tierValue));
            });
            updateRubricFeedbackText(sub.id, tierValue);
        }

        detailsRow.querySelector(`#save-btn-${sub.id}`).onclick = () => saveLiveGrades(sub.id, isRolePlay);
        detailsRow.querySelector(`#sync-btn-${sub.id}`).onclick = () => syncSingleStudentToClassroom(sub.id, isRolePlay);

        headerRow.onclick = (e) => {
            if (e.target.closest('button') || e.target.closest('select') || e.target.closest('input')) return;
            const active = headerRow.classList.toggle('active');
            detailsRow.classList.toggle('hidden', !active);
            headerRow.querySelector('.arrow-indicator').textContent = active ? '▼' : '▶';
        };

        headerRow.querySelector('.btn-inline-delete').onclick = (e) => {
            e.stopPropagation();
            if (confirm("Delete student submission?")) {
                db.collection("submissions").doc(sub.id).delete().then(() => alert("Removed."));
            }
        };
    });
}

// =========================================
// EDITOR FORM & TEMPLATE GENERATION
// =========================================

function openNewTemplateEditor() {
    activeEditorMode = "template";
    currentTemplateId = null;
    document.getElementById('editor-title').innerText = "Create Template Activity";
    document.getElementById('editor-mode-indicator').innerText = "";
    
    document.getElementById('assign-section-title').innerText = "🏫 Publish to Google Classroom";
    document.getElementById('assign-section-desc').innerText = "Select a class to publish and post this template instantly as an interactive speaking activity.";
    document.getElementById('assign-btn').innerText = "Post Assignment to Classroom";

    const allStudentsBtn = document.getElementById('all-students-btn');
    if (allStudentsBtn) {
        allStudentsBtn.disabled = false;
        allStudentsBtn.style.opacity = '1';
        allStudentsBtn.style.cursor = 'pointer';
        allStudentsBtn.title = '';
    }

    document.getElementById('activity-type-input').value = 'read_aloud';
    document.getElementById('language-input').value = 'fr';
    document.getElementById('tier-input').value = 'foundation';
    
    populateYearDropdown();
    document.getElementById('year-input').value = 'Year 9';
    updateEditorTopicDropdown();
    document.getElementById('topic-select').value = '__NEW__';
    
    const topicInput = document.getElementById('topic-input');
    topicInput.value = '';
    topicInput.classList.remove('hidden');
    document.getElementById('title-input').value = '';
    
    document.getElementById('text-input').value = '';
    document.getElementById('unseen-1-title').value = '';
    document.getElementById('unseen-2-title').value = '';
    document.getElementById('rp-scenario-input').value = '';

    for (let i = 1; i <= 5; i++) {
        document.getElementById(`rp-teacher-${i}`).value = '';
        document.getElementById(`rp-student-${i}`).value = '';
    }

    toggleFormVisibility('read_aloud');
    adjustPublishFrameAlignment('read_aloud');
    showSection('editor-section');
    document.getElementById('assign-section').classList.remove('hidden');
}

async function saveTemplateData() {
    const activityType = document.getElementById('activity-type-input').value;
    const language = document.getElementById('language-input').value;
    const tier = document.getElementById('tier-input').value;
    
    const yearGroup = document.getElementById('year-input').value;
    const topicSelectVal = document.getElementById('topic-select').value;
    let topic = "";
    if (topicSelectVal === '__NEW__') {
        topic = document.getElementById('topic-input').value.trim();
    } else {
        topic = topicSelectVal;
    }
    
    const title = document.getElementById('title-input').value.trim();

    if (!yearGroup || !topic || !title) {
        alert("Please input general core title parameters!");
        return null;
    }

    let payload = { activityType, language, tier, yearGroup, topic, title, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };

    if (activityType === "role_play") {
        let rolePlayPrompts = [];
        for (let i = 1; i <= 5; i++) {
            rolePlayPrompts.push({
                teacher: document.getElementById(`rp-teacher-${i}`).value.trim(),
                student: document.getElementById(`rp-student-${i}`).value.trim()
            });
        }
        payload.rolePlayPrompts = rolePlayPrompts;
        payload.scenario = document.getElementById('rp-scenario-input').value.trim();
    } else {
        payload.text = document.getElementById('text-input').value.trim();
        payload.unseenQ1Title = document.getElementById('unseen-1-title').value.trim();
        payload.unseenQ2Title = document.getElementById('unseen-2-title').value.trim();
        if (!payload.text) { alert("Passage script text context cannot be left clear."); return null; }
    }

    if (currentTemplateId) {
        await db.collection("passages").doc(currentTemplateId).update(payload);
        return currentTemplateId;
    } else {
        const docRef = await db.collection("passages").add(payload);
        currentTemplateId = docRef.id;
        return docRef.id;
    }
}

async function loadTemplateIntoEditor(id) {
    try {
        const doc = await db.collection("passages").doc(id).get();
        if (!doc.exists) return;
        const data = doc.data();

        activeEditorMode = "template";
        currentTemplateId = id;

        const allStudentsBtn = document.getElementById('all-students-btn');
        if (allStudentsBtn) {
            allStudentsBtn.disabled = false;
            allStudentsBtn.style.opacity = '1';
            allStudentsBtn.style.cursor = 'pointer';
            allStudentsBtn.title = '';
        }
        
        document.getElementById('editor-title').innerText = "Edit Master Template";
        document.getElementById('editor-mode-indicator').innerText = "Modifying Global Template Profile Settings";
        document.getElementById('assign-section-title').innerText = "🏫 Publish to Google Classroom";
        document.getElementById('assign-section-desc').innerText = "Select a class to publish and post this template instantly as an interactive speaking activity.";
        document.getElementById('assign-btn').innerText = "Post Assignment to Classroom";

        const actType = data.activityType || 'read_aloud';
        document.getElementById('activity-type-input').value = actType;
        document.getElementById('language-input').value = data.language || 'fr';
        document.getElementById('tier-input').value = data.tier || 'foundation';
        
        populateYearDropdown();
        const yearGroupSelect = document.getElementById('year-input');
        if (data.yearGroup && !Array.from(yearGroupSelect.options).some(o => o.value === data.yearGroup)) {
            const opt = document.createElement('option');
            opt.value = data.yearGroup; opt.textContent = data.yearGroup;
            yearGroupSelect.appendChild(opt);
        }
        yearGroupSelect.value = data.yearGroup || 'Year 9';

        updateEditorTopicDropdown();

        const topicSelect = document.getElementById('topic-select');
        const topicInput = document.getElementById('topic-input');
        if (data.topic && Array.from(topicSelect.options).some(o => o.value === data.topic)) {
            topicSelect.value = data.topic;
            topicInput.classList.add('hidden');
            topicInput.value = data.topic;
        } else {
            if (data.topic) {
                const opt = document.createElement('option');
                opt.value = data.topic; opt.textContent = data.topic;
                topicSelect.appendChild(opt);
                topicSelect.value = data.topic;
                topicInput.classList.add('hidden');
                topicInput.value = data.topic;
            } else {
                topicSelect.value = '__NEW__';
                topicInput.classList.remove('hidden');
                topicInput.value = '';
            }
        }

        document.getElementById('title-input').value = data.title || '';

        if (actType === 'role_play') {
            document.getElementById('rp-scenario-input').value = data.scenario || '';
            const prompts = data.rolePlayPrompts || [];
            for (let i = 1; i <= 5; i++) {
                const p = prompts[i-1] || { teacher: "", student: "" };
                document.getElementById(`rp-teacher-${i}`).value = p.teacher || '';
                document.getElementById(`rp-student-${i}`).value = p.student || '';
            }
        } else {
            document.getElementById('text-input').value = data.text || '';
            document.getElementById('unseen-1-title').value = data.unseenQ1Title || '';
            document.getElementById('unseen-2-title').value = data.unseenQ2Title || '';
        }

        toggleFormVisibility(actType);
        adjustPublishFrameAlignment(actType);
        
        showSection('editor-section');
        document.getElementById('assign-section').classList.remove('hidden');
    } catch(e) {
        alert("Error: " + getErrorMessage(e));
    }
}

async function saveEditorChanges() {
    try {
        if (activeEditorMode === "template") {
            const savedId = await saveTemplateData();
            if (!savedId) return;
            alert("Master template saved!");
        } else if (activeEditorMode === "assignment" && currentAssignmentId) {
            await updateLiveAssignmentInClassroomAndFirestore();
        }
    } catch (e) {
        alert("Error: " + getErrorMessage(e));
    }
}

async function assignButtonHandler() {
    if (activeEditorMode === "assignment") {
        await updateLiveAssignmentInClassroomAndFirestore();
    } else {
        await publishNewAssignmentToClassroom();
    }
}

async function publishNewAssignmentToClassroom() {
    const courseId = document.getElementById('course-select').value;
    const status = document.getElementById('status');
    const dueDateVal = document.getElementById('due-date-input').value;
    const gcTopicSelect = document.getElementById('gc-topic-select');
    const gcTopicInput = document.getElementById('gc-topic-input');
    
    if (!courseId || courseId.startsWith("Loading")) {
        alert("Select standard classroom feed courses first.");
        return;
    }

    try {
        await ensureClassroomToken();
    } catch (err) {
        alert("Google Classroom re-authorization required: " + getErrorMessage(err));
        return;
    }
    
    status.innerText = "Processing workspace publishing profiles...";
    
    try {
        const savedId = await saveTemplateData();
        if (!savedId) { status.innerText = ""; return; }
        
        const templateDoc = await db.collection("passages").doc(currentTemplateId).get();
        if (!templateDoc.exists) return;
        const data = templateDoc.data();
        
        const isRolePlay = (data.activityType === 'role_play');
        const targetPoints = isRolePlay ? 10 : 12;

        const currentDomain = window.location.origin + window.location.pathname.replace(/teacher/i, 'student');

        let finalGCTopicId = null;
        if (gcTopicSelect.value === '__NEW__') {
            const newTopicName = gcTopicInput.value.trim();
            if (!newTopicName) {
                alert("Please provide a name for the new Google Classroom topic.");
                status.innerText = "";
                return;
            }
            status.innerText = "Creating new topic in Google Classroom...";
            const topicResponse = await gapi.client.classroom.courses.topics.create({
                courseId: courseId,
                resource: { name: newTopicName }
            });
            finalGCTopicId = topicResponse.result.topicId;
        } else if (gcTopicSelect.value) {
            finalGCTopicId = gcTopicSelect.value;
        }

        status.innerText = "Publishing assignment...";

        const tempAssignmentDocRef = db.collection("assignments").doc();
        const firestoreAssignmentId = tempAssignmentDocRef.id; 
        const studentUrl = `${currentDomain}?assignmentId=${firestoreAssignmentId}&courseId=${courseId}`;

        let gcDueDate = null, gcDueTime = null;
        if (dueDateVal) {
            const dateObj = new Date(dueDateVal);
            gcDueDate = { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1, day: dateObj.getDate() };
            gcDueTime = { hours: dateObj.getHours(), minutes: dateObj.getMinutes(), seconds: 0, nanos: 0 };
        }

        if (!studentSelectorCourseId || studentSelectorCourseId !== courseId) {
            await loadClassroomStudents(courseId);
        }

        const selectedStudentIds = [...selectedClassroomStudentIds];

        if (selectedStudentIds.length === 0) {
            alert("Please select at least one student before posting the assignment.");
            status.innerText = "";
            return;
        }

        const allStudentIds = classroomStudents.map(student => student.userId);

        const assigningToEntireClass =
            allStudentIds.length > 0 &&
            selectedStudentIds.length === allStudentIds.length &&
            selectedStudentIds.every(id => allStudentIds.includes(id));

        const tierBadge = (data.tier === 'higher') ? 'Ⓗ' : 'Ⓕ';

        const courseWorkResource = {
            title: isRolePlay
                ? `🎭 RP ${tierBadge}: ${data.title}`
                : `📖 RA ${tierBadge}: ${data.title}`,

            description: isRolePlay ?
                `Interactive Conversational Speaking Task Dialog Workspace.\n\nInstructions:\n- Listen carefully to the TTS teacher voice cue prompt lines.\n- Record your corresponding answer response statements sequentially.\n- Total points breakdown: Graded out of 10 marks.` :
                `Practice reading aloud fluently and address unseen audio task variations.\n\nInstructions:\n- Max accuracy metrics generated from passage profile.\n- Complete 2 unseen questions at terminal stages.\n- Total points breakdown: Graded out of 12 marks.`,

            workType: 'ASSIGNMENT',

            assigneeMode: assigningToEntireClass
                ? 'ALL_STUDENTS'
                : 'INDIVIDUAL_STUDENTS',

            state: 'DRAFT',

            maxPoints: targetPoints,

            materials: [{
                link: {
                    url: studentUrl,
                    title: isRolePlay
                        ? "Role Play Conversation Workspace Link"
                        : "Read Aloud Reading Workspace Link"
                }
            }]
        };

        if (!assigningToEntireClass) {
            courseWorkResource.individualStudentsOptions = {
                studentIds: selectedStudentIds
            };
        }
        if (gcDueDate && gcDueTime) {
            courseWorkResource.dueDate = gcDueDate;
            courseWorkResource.dueTime = gcDueTime;
        }

        if (finalGCTopicId) {
            courseWorkResource.topicId = finalGCTopicId;
        }

        const response = await gapi.client.classroom.courses.courseWork.create({ courseId: courseId, resource: courseWorkResource });
        const gClassroomAssignmentId = response.result.id;

        await gapi.client.classroom.courses.courseWork.patch({
            courseId: courseId, id: gClassroomAssignmentId, updateMask: "state", resource: { state: 'PUBLISHED' }
        });

        let baseAssignmentPayload = {
            id: firestoreAssignmentId,             
            gClassroomAssignmentId: gClassroomAssignmentId, 
            courseId: courseId,
            activityType: data.activityType || 'read_aloud',
            title: data.title,
            language: data.language || 'fr',
            tier: data.tier || 'foundation',
            yearGroup: data.yearGroup,
            topic: data.topic,
            assignedStudentIds: selectedStudentIds,
            dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null, 
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (isRolePlay) {
            baseAssignmentPayload.rolePlayPrompts = data.rolePlayPrompts || [];
            baseAssignmentPayload.scenario = data.scenario || '';
        } else {
            baseAssignmentPayload.text = data.text || '';
            baseAssignmentPayload.unseenQ1Title = data.unseenQ1Title || '';
            baseAssignmentPayload.unseenQ2Title = data.unseenQ2Title || '';
        }

        await tempAssignmentDocRef.set(baseAssignmentPayload);

        status.innerText = "Task assigned on Google Classroom.";
        document.getElementById('due-date-input').value = "";
        setTimeout(() => { 
            status.innerText = ""; 
            if (isRolePlay) {
                showSection('role-play-bank-section');
            } else {
                showSection('read-aloud-bank-section');
            }
        }, 2500);
        
    } catch (e) {
        status.innerText = "";
        alert("Classroom connection failed: " + getErrorMessage(e));
    }
}

async function editAssignedTaskHandler() {
    const filterTask = document.getElementById('filter-task');
    const selectedId = filterTask.value;
    const assignment = allAssignments.find(a => a.id === selectedId);
    if (!assignment) return;

    activeEditorMode = "assignment";
    currentAssignmentId = selectedId;

    document.getElementById('editor-title').innerText = "Edit Live Assignment";
    document.getElementById('editor-mode-indicator').innerText = "CAUTION: Changes apply to this specific active class tracking matrix and sync to Google Classroom!";
    
    document.getElementById('assign-section').classList.remove('hidden');
    document.getElementById('assign-section-title').innerText = "🏫 Sync with Google Classroom";
    document.getElementById('assign-section-desc').innerText = "Amend title, topic, or due date. (Student assignees are locked by Google Classroom once published).";
    document.getElementById('assign-btn').innerText = "🔄 Update Assignment & Sync Classroom";

    const allStudentsBtn = document.getElementById('all-students-btn');
    if (allStudentsBtn) {
        allStudentsBtn.disabled = true;
        allStudentsBtn.style.opacity = '0.6';
        allStudentsBtn.style.cursor = 'not-allowed';
        allStudentsBtn.title = 'Student assignees are locked by Google Classroom on published posts.';
    }
    const studentPanel = document.getElementById('student-selector-panel');
    if (studentPanel) studentPanel.classList.add('hidden');

    const actType = assignment.activityType || 'read_aloud';
    document.getElementById('activity-type-input').value = actType;
    document.getElementById('language-input').value = assignment.language || 'fr';
    document.getElementById('tier-input').value = assignment.tier || 'foundation';
    
    populateYearDropdown();
    const yearGroupSelect = document.getElementById('year-input');
    if (assignment.yearGroup && !Array.from(yearGroupSelect.options).some(o => o.value === assignment.yearGroup)) {
        const opt = document.createElement('option');
        opt.value = assignment.yearGroup; opt.textContent = assignment.yearGroup;
        yearGroupSelect.appendChild(opt);
    }
    yearGroupSelect.value = assignment.yearGroup || 'Year 9';

    updateEditorTopicDropdown();

    const tSelect = document.getElementById('topic-select');
    const tInput = document.getElementById('topic-input');
    if (assignment.topic && Array.from(tSelect.options).some(o => o.value === assignment.topic)) {
        tSelect.value = assignment.topic;
        tInput.classList.add('hidden');
        tInput.value = assignment.topic;
    } else {
        if (assignment.topic) {
            const opt = document.createElement('option');
            opt.value = assignment.topic; 
            opt.textContent = assignment.topic;
            tSelect.appendChild(opt);
            tSelect.value = assignment.topic;
            tInput.classList.add('hidden');
            tInput.value = assignment.topic;
        } else {
            tSelect.value = '__NEW__';
            tInput.classList.remove('hidden');
            tInput.value = '';
        }
    }

    document.getElementById('title-input').value = assignment.title || '';

    if (actType === 'role_play') {
        const prompts = assignment.rolePlayPrompts || [];
        for (let i = 1; i <= 5; i++) {
            const p = prompts[i-1] || { teacher: "", student: "" };
            document.getElementById(`rp-teacher-${i}`).value = p.teacher || '';
            document.getElementById(`rp-student-${i}`).value = p.student || '';
        }
    } else {
        document.getElementById('text-input').value = assignment.text || '';
        document.getElementById('unseen-1-title').value = assignment.unseenQ1Title || '';
        document.getElementById('unseen-2-title').value = assignment.unseenQ2Title || '';
    }

    const courseSelect = document.getElementById('course-select');
    if (assignment.courseId) {
        courseSelect.value = assignment.courseId;
    }

    const dueDateInput = document.getElementById('due-date-input');
    if (assignment.dueDate) {
        const d = new Date(assignment.dueDate);
        if (!isNaN(d.getTime())) {
            const pad = (n) => String(n).padStart(2, '0');
            dueDateInput.value = `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
        } else {
            dueDateInput.value = "";
        }
    } else {
        dueDateInput.value = "";
    }

    if (assignment.courseId) {
        await loadGoogleClassroomTopics(assignment.courseId);
        await loadClassroomStudents(assignment.courseId);

        if (assignment.gClassroomAssignmentId) {
            try {
                await ensureClassroomToken();
                const cwRes = await gapi.client.classroom.courses.courseWork.get({
                    courseId: assignment.courseId,
                    id: assignment.gClassroomAssignmentId
                });
                const cw = cwRes.result;
                if (cw) {
                    if (cw.assigneeMode === 'INDIVIDUAL_STUDENTS' && cw.individualStudentsOptions && cw.individualStudentsOptions.studentIds) {
                        selectedClassroomStudentIds = [...cw.individualStudentsOptions.studentIds];
                    } else {
                        selectedClassroomStudentIds = classroomStudents.map(s => s.userId);
                    }
                    
                    if (cw.dueDate) {
                        const pad = (n) => String(n).padStart(2, '0');
                        const yr = cw.dueDate.year;
                        const mo = pad(cw.dueDate.month);
                        const dy = pad(cw.dueDate.day);
                        const hr = cw.dueTime ? pad(cw.dueTime.hours || 0) : "23";
                        const mn = cw.dueTime ? pad(cw.dueTime.minutes || 0) : "59";
                        dueDateInput.value = `${yr}-${mo}-${dy}T${hr}:${mn}`;
                    }

                    renderClassroomStudentList();
                }
            } catch (err) {
                console.warn("Could not fetch courseWork live settings from GC:", err);
                if (assignment.assignedStudentIds) {
                    selectedClassroomStudentIds = [...assignment.assignedStudentIds];
                    renderClassroomStudentList();
                }
            }
        }
    }

    toggleFormVisibility(actType);
    adjustPublishFrameAlignment(actType);
    showSection('editor-section');
}

async function updateLiveAssignmentInClassroomAndFirestore() {
    const courseId = document.getElementById('course-select').value;
    const status = document.getElementById('status');
    const dueDateVal = document.getElementById('due-date-input').value;
    const gcTopicSelect = document.getElementById('gc-topic-select');
    const gcTopicInput = document.getElementById('gc-topic-input');

    if (!currentAssignmentId) {
        alert("No active assignment selected for editing.");
        return;
    }

    try {
        await ensureClassroomToken();
    } catch (err) {
        alert("Google Classroom re-authorization required: " + getErrorMessage(err));
        return;
    }

    const activeAssignment = allAssignments.find(a => a.id === currentAssignmentId);
    if (!activeAssignment) return;

    status.innerText = "Syncing changes with Google Classroom & updating assignment...";

    try {
        const activityType = document.getElementById('activity-type-input').value;
        const language = document.getElementById('language-input').value;
        const tier = document.getElementById('tier-input').value;
        const yearGroup = document.getElementById('year-input').value;
        const topicSelectVal = document.getElementById('topic-select').value;
        let topic = (topicSelectVal === '__NEW__') ? document.getElementById('topic-input').value.trim() : topicSelectVal;
        const title = document.getElementById('title-input').value.trim();

        if (!yearGroup || !topic || !title) {
            alert("Please complete Title, Year Group, and Topic.");
            status.innerText = "";
            return;
        }

        const isRolePlay = (activityType === 'role_play');

        let payload = {
            activityType,
            language,
            tier,
            yearGroup,
            topic,
            title,
            dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (isRolePlay) {
            let rolePlayPrompts = [];
            for (let i = 1; i <= 5; i++) {
                rolePlayPrompts.push({
                    teacher: document.getElementById(`rp-teacher-${i}`).value.trim(),
                    student: document.getElementById(`rp-student-${i}`).value.trim()
                });
            }
            payload.rolePlayPrompts = rolePlayPrompts;
            payload.scenario = document.getElementById('rp-scenario-input').value.trim();
        } else {
            payload.text = document.getElementById('text-input').value.trim();
            payload.unseenQ1Title = document.getElementById('unseen-1-title').value.trim();
            payload.unseenQ2Title = document.getElementById('unseen-2-title').value.trim();
        }

        if (activeAssignment.gClassroomAssignmentId) {
            let finalGCTopicId = null;
            if (gcTopicSelect.value === '__NEW__') {
                const newTopicName = gcTopicInput.value.trim();
                if (newTopicName) {
                    const topicResponse = await gapi.client.classroom.courses.topics.create({
                        courseId: courseId,
                        resource: { name: newTopicName }
                    });
                    finalGCTopicId = topicResponse.result.topicId;
                }
            } else if (gcTopicSelect.value) {
                finalGCTopicId = gcTopicSelect.value;
            }

            const courseWorkPatch = {};
            const updateMasks = [];

            const tierBadge = (tier === 'higher') ? 'Ⓗ' : 'Ⓕ';
            courseWorkPatch.title = isRolePlay 
                ? `🎭 RP ${tierBadge}: ${title}` 
                : `📖 RA ${tierBadge}: ${title}`;
            updateMasks.push("title");

            if (dueDateVal) {
                const dateObj = new Date(dueDateVal);
                courseWorkPatch.dueDate = { year: dateObj.getFullYear(), month: dateObj.getMonth() + 1, day: dateObj.getDate() };
                courseWorkPatch.dueTime = { hours: dateObj.getHours(), minutes: dateObj.getMinutes(), seconds: 0, nanos: 0 };
                updateMasks.push("dueDate", "dueTime");
            }

            if (finalGCTopicId) {
                courseWorkPatch.topicId = finalGCTopicId;
                updateMasks.push("topicId");
            }

            if (updateMasks.length > 0) {
                await gapi.client.classroom.courses.courseWork.patch({
                    courseId: courseId,
                    id: activeAssignment.gClassroomAssignmentId,
                    updateMask: updateMasks.join(","),
                    resource: courseWorkPatch
                });
            }
        }

        await db.collection("assignments").doc(currentAssignmentId).update(payload);

        status.innerText = "Assignment updated & synced with Google Classroom!";
        setTimeout(() => {
            status.innerText = "";
            showSection('submissions-section');
            renderDynamicMetrics();
        }, 1800);

    } catch (e) {
        status.innerText = "";
        alert("Error updating assignment: " + getErrorMessage(e));
    }
}

async function deleteAssignedTaskHandler() {
    const filterTask = document.getElementById('filter-task');
    const selectedId = filterTask.value;
    if (!selectedId || !confirm("Are you sure you want to delete this assignment from BOTH the Dashboard and Google Classroom?")) return;
    
    try {
        await ensureClassroomToken();
        const assignment = allAssignments.find(a => a.id === selectedId);
        
        if (assignment && assignment.courseId && assignment.gClassroomAssignmentId) {
            await gapi.client.classroom.courses.courseWork.delete({
                courseId: assignment.courseId,
                id: assignment.gClassroomAssignmentId
            });
        }

        await db.collection("assignments").doc(selectedId).delete();
        
        filterTask.value = "";
        updateClassroomDropdownFilters();
        renderDynamicMetrics();
        
        alert("Assignment successfully deleted from both systems!");
    } catch (e) { 
        alert("Error during dual deletion process: " + getErrorMessage(e)); 
    }
}

// =========================================
// RECYCLE BIN & TEMPLATE DELETION
// =========================================

async function duplicateTemplate(id, event) {
    event.stopPropagation();
    try {
        const doc = await db.collection("passages").doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            data.title = data.title + " (Copy)";
            await db.collection("passages").add(data);
            alert("Template duplicated successfully!");
        }
    } catch (e) { alert("Error: " + getErrorMessage(e)); }
}

async function moveToBin(id, event) {
    event.stopPropagation();
    if (!confirm("Move template tracking reference profiles to standard trash folders?")) return;
    try {
        const doc = await db.collection("passages").doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            data.deletedAt = firebase.firestore.FieldValue.serverTimestamp();
            data.originalId = id;
            await db.collection("recycle_bin").doc(id).set(data);
            await db.collection("passages").doc(id).delete();
            alert("Template moved to Recycle Bin.");
        }
    } catch (e) { alert("Error: " + getErrorMessage(e)); }
}

async function loadRecycleBin() {
    const binList = document.getElementById('bin-list');
    binList.innerHTML = '<div style="padding:15px; text-align:center;">Loading Recycle Bin...</div>';
    try {
        const snapshot = await db.collection("recycle_bin").get();
        if (snapshot.empty) { 
            binList.innerHTML = '<div style="padding:20px; text-align:center; color:#7f8c8d;">Recycle Bin empty.</div>'; 
            return; 
        }
        
        binList.innerHTML = '';
        let binStructure = {};
        snapshot.forEach(doc => {
            const data = doc.data();
            data.id = doc.id;
            const lang = data.language || 'fr';
            const year = data.yearGroup || 'Year 9';
            
            if (!binStructure[lang]) binStructure[lang] = {};
            if (!binStructure[lang][year]) binStructure[lang][year] = [];
            binStructure[lang][year].push(data);
        });

        for (const lang of Object.keys(binStructure).sort()) {
            const langHeader = document.createElement('div');
            langHeader.style.cssText = "background: #fde8e8; border-left: 5px solid #e74c3c; padding: 12px 20px; font-size: 20px; font-weight: bold; color: #c0392b; border-radius: 4px; margin-top: 25px; margin-bottom: 15px;";
            langHeader.textContent = getLanguageName(lang);
            binList.appendChild(langHeader);

            for (const year of Object.keys(binStructure[lang]).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}))) {
                const yearHeader = document.createElement('div');
                yearHeader.style.cssText = "font-weight: bold; font-size: 14px; color: #e74c3c; margin: 15px 0 10px 5px; display: flex; align-items: center; gap: 6px; text-transform: uppercase;";
                yearHeader.innerHTML = `📅 ${year}`;
                binList.appendChild(yearHeader);

                const gridContainer = document.createElement('div');
                gridContainer.className = 'tasks-display-container';
                gridContainer.style.cssText = "display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 20px;";
                binList.appendChild(gridContainer);

                binStructure[lang][year].sort((a,b) => a.title.localeCompare(b.title)).forEach(data => {
                    const card = document.createElement('div');
                    card.className = 'bank-task-card'; 
                    card.style.cssText = "width: 300px; box-sizing: border-box; background: white; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; display: inline-flex; align-items: center; justify-content: space-between; gap: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.03);";
                    
                    const tierLetter = (data.tier === 'higher') ? 'H' : 'F';
                    const activityIcon = (data.activityType === 'role_play') ? '🎭' : '📖';
                    
                    let deletedDateStr = '';
                    if (data.deletedAt) {
                        const d = data.deletedAt.toDate ? data.deletedAt.toDate() : new Date(data.deletedAt.seconds * 1000);
                        deletedDateStr = d.toLocaleDateString('en-GB');
                    }

                    card.innerHTML = `
                        <div style="min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 2px;">
                            <div style="font-weight: bold; color: #1e293b; font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px;">
                                <span style="font-size: 14px;" title="${data.activityType === 'role_play' ? 'Role Play':'Read Aloud'}">${activityIcon}</span>
                                <span class="badge tier" style="margin: 0; padding: 2px 6px; background: #9b59b6; font-size: 11px;">${tierLetter}</span>
                                <span title="${data.title}">${data.title}</span>
                            </div>
                            <div style="font-size: 12px; color: #7f8c8d; font-weight: 500;">Topic: ${data.topic}</div>
                            ${deletedDateStr ? `<div style="font-size: 11px; color: #94a3b8;">Deleted: ${deletedDateStr}</div>` : ''}
                        </div>
                        <div class="task-actions" style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
                            <button class="task-action-btn" title="Restore template" onclick="restoreTemplate('${data.id}')" style="background: transparent; border: none; cursor: pointer; font-size: 18px; padding: 4px; display: inline-flex; align-items: center; justify-content: center; margin: 0; width: auto;">🔄</button>
                            <button class="task-action-btn" title="Purge Forever" onclick="permanentlyDeleteTemplate('${data.id}')" style="background: transparent; border: none; cursor: pointer; font-size: 18px; padding: 4px; display: inline-flex; align-items: center; justify-content: center; margin: 0; width: auto;">❌</button>
                        </div>
                    `;
                    gridContainer.appendChild(card);
                });
            }
        }
    } catch (e) { 
        binList.innerHTML = `<div style="padding:15px; color:red;">Error loading Recycle Bin elements: ${getErrorMessage(e)}</div>`; 
    }
}

async function restoreTemplate(id) {
    try {
        const doc = await db.collection("recycle_bin").doc(id).get();
        if (doc.exists) {
            const data = doc.data();
            delete data.deletedAt; delete data.originalId;
            await db.collection("passages").doc(id).set(data);
            await db.collection("recycle_bin").doc(id).delete();
            alert("Template restored successfully!");
            loadRecycleBin();
        }
    } catch (e) { alert("Error: " + getErrorMessage(e)); }
}

async function permanentlyDeleteTemplate(id) {
    if (!confirm("Purge tracking database configurations forever?")) return;
    try { 
        await db.collection("recycle_bin").doc(id).delete(); 
        loadRecycleBin(); 
    } catch (e) { alert("Error: " + getErrorMessage(e)); }
}

async function cleanOldRecycleBinItems() {
    const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    try {
        const sn = await db.collection("recycle_bin").where("deletedAt", "<", firebase.firestore.Timestamp.fromDate(thirtyDaysAgo)).get();
        sn.forEach(async doc => { await db.collection("recycle_bin").doc(doc.id).delete(); });
    } catch(e) {}
}
