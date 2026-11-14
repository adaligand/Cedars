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
            transformationsText: document.getElementById('transformations-input')?.value || transformationsText || "",
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
