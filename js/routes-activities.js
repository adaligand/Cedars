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
    window.duplicatingAssignmentLang = null;

    // Bind current editor state to assignment options modal
    activeAssignmentBuilderId = currentDocId || null;
    activeAssignmentGrid = JSON.parse(JSON.stringify(grid));
    activeAssignmentDisabledRoutes = Array.isArray(disabledRoutes) ? [...disabledRoutes] : [];
    activeAssignmentExcludedCombos = JSON.parse(JSON.stringify(excludedCombos || []));
    activeAssignmentRequiredCombos = JSON.parse(JSON.stringify(requiredCombos || []));
    activeAssignmentExcludedPairs = JSON.parse(JSON.stringify(excludedPairs || []));
    activeAssignmentTransformationsText = document.getElementById('transformations-input')?.value || transformationsText || "";

    const btn = document.getElementById('gc-publish-btn');
    if (btn) btn.innerText = "📢 Publish Assignment Now";
    
    document.getElementById('gc-due-date').value = "";
    document.getElementById('gc-schedule-date').value = "";

    const currentLang = meta.lang || document.getElementById('meta-lang')?.value || "Target Language";
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
        {id:'trans-target', label:`Translate (${currentLang})`},
        {id:'listen-trad', label:'🎧 Listen / Translate'},
        {id:'listen-dictation', label:'🎧 Listening Dictation'},
        {id:'delayed-dictation', label:'🎧 Delayed Dictation'},
        {id:'delayed-copying', label:'Delayed Copying'}
    ];

    document.getElementById('activity-list').innerHTML = list.map(a => `
        <div class="activity-row" style="padding: 6px 8px; border-bottom: 1px solid #f1f5f9; display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" value="${a.id}" id="chk-${a.id}" onchange="renderPerActivitySentenceBoxes()">
            <label for="chk-${a.id}" style="cursor:pointer; font-weight:500; font-size: 13px;">${a.label}</label>
        </div>
    `).join('');
    
    renderPerActivitySentenceBoxes();
    document.getElementById('activity-menu').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';
}

/* =========================
   SENTENCE ASSEMBLY & TRANSFORMATIONS
========================= */
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

            // 1. Triggered / Conditional rule: trigger$target=replacement
            if (find.includes('$')) {
                const subParts = find.split('$').map(s => s.trim());
                if (subParts.length === 2 && subParts[0] && subParts[1]) {
                    const [w1, w2] = subParts;
                    let p1 = escapeReg(w1);
                    let p2 = escapeReg(w2);

                    if (/^[\w\u00C0-\u024F]/.test(w1)) p1 = '(?<![a-zA-Z0-9\u00C0-\u024F])' + p1;
                    if (/[\w\u00C0-\u024F]$/.test(w1)) p1 = p1 + '(?![a-zA-Z0-9\u00C0-\u024F])';

                    if (/^[\w\u00C0-\u024F]/.test(w2)) p2 = '(?<![a-zA-Z0-9\u00C0-\u024F])' + p2;
                    if (/[\w\u00C0-\u024F]$/.test(w2)) p2 = p2 + '(?![a-zA-Z0-9\u00C0-\u024F])';

                    const regex = new RegExp(`(${p1}.*?)${p2}`, 'gi');
                    let prev, guard = 0;
                    do {
                        prev = text;
                        text = text.replace(regex, (match, prefix) => prefix + replace);
                    } while (text !== prev && ++guard < 20);
                }
            }
            // 2. Split / Discontinuous rule: word1+word3=replacement
            else if (find.includes('+')) {
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
            // 3. Standard replace / delete rule
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

function getAssembledSentences(customGridContext = null) {
    let ctx = customGridContext;
    if (!ctx && activeAssignmentGrid) {
        ctx = {
            grid: activeAssignmentGrid,
            disabledRoutes: activeAssignmentDisabledRoutes || [],
            excludedCombos: activeAssignmentExcludedCombos || [],
            requiredCombos: activeAssignmentRequiredCombos || [],
            excludedPairs: activeAssignmentExcludedPairs || [],
            transformationsText: activeAssignmentTransformationsText || ""
        };
    }

    let targetGrid = (ctx && ctx.grid) ? ctx.grid : grid;
    let targetRules = (ctx && ctx.transformationsText !== undefined)
        ? ctx.transformationsText
        : (activeAssignmentTransformationsText !== null ? activeAssignmentTransformationsText : (document.getElementById('transformations-input')?.value || transformationsText || ""));

    let allSentences = [];
    for (let r = 0; r < targetGrid.length; r++) {
        if (!targetGrid[r][0].hidden) {
            let cell = targetGrid[r][0];
            let rSpan = cell.rS || 1;
            for (let subR = r; subR < r + rSpan; subR++) {
                let paths = findPaths(r, 0, subR, ctx);
                paths.forEach(p => { p.originRow = subR; });
                allSentences = allSentences.concat(paths);
            }
        }
    }

    const unique = [];
    const seen = new Set();
    allSentences.forEach(s => {
        if (shouldExcludeSentence(s.t, targetRules) || shouldExcludeSentence(s.tr, targetRules)) return;

        s.t = cleanSentenceSpacing(applyTransformations(s.t, targetRules));
        s.tr = cleanSentenceSpacing(applyTransformations(s.tr, targetRules));

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
function isPathValid(partsMeta, ctx = null) {
    if (!partsMeta || partsMeta.length === 0) return true;

    const dRoutes = (ctx && ctx.disabledRoutes !== undefined) ? ctx.disabledRoutes : (activeAssignmentDisabledRoutes !== null ? activeAssignmentDisabledRoutes : disabledRoutes);
    const exCombos = (ctx && ctx.excludedCombos !== undefined) ? ctx.excludedCombos : (activeAssignmentExcludedCombos !== null ? activeAssignmentExcludedCombos : excludedCombos);
    const exPairs = (ctx && ctx.excludedPairs !== undefined) ? ctx.excludedPairs : (activeAssignmentExcludedPairs !== null ? activeAssignmentExcludedPairs : excludedPairs);
    const reqCombos = (ctx && ctx.requiredCombos !== undefined) ? ctx.requiredCombos : (activeAssignmentRequiredCombos !== null ? activeAssignmentRequiredCombos : requiredCombos);

    const contentParts = partsMeta.filter(p => !p.isBridge);
    const routeKey = contentParts.map(p => `${p.r + 1}.${p.c + 1}`).join('+');
    if (dRoutes && dRoutes.includes(routeKey)) return false;

    if (exCombos && exCombos.length > 0) {
        for (let combo of exCombos) {
            const cells = combo.cells || combo;
            if (Array.isArray(cells) && cells.length >= 2) {
                if (cells.every(c => partsMeta.some(p => p.r === c.r && p.c === c.c))) return false;
            }
        }
    }

    if (exPairs && exPairs.length > 0) {
        for (let pair of exPairs) {
            if (partsMeta.some(p => p.r === pair.a.r && p.c === pair.a.c) && partsMeta.some(p => p.r === pair.b.r && p.c === pair.b.c)) return false;
        }
    }

    if (reqCombos && reqCombos.length > 0) {
        for (let combo of reqCombos) {
            const cellA = combo.cellA || combo.a;
            const cellB = combo.cellB || combo.b;
            if (cellA && cellB) {
                if (partsMeta.some(p => p.r === cellA.r && p.c === cellA.c) && !partsMeta.some(p => p.r === cellB.r && p.c === cellB.c)) return false;
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
        .replace(/\s+([.,!?:;])/g, '$1')                    // Removes space before punctuation ("père ." -> "père.")
        .replace(/([a-zA-ZÀ-ÿ\u00C0-\u024F]')\s+/g, '$1')   // Removes space after apostrophes ("d' un" -> "d'un")
        .replace(/\s+/g, ' ')                               // Collapses multiple spaces
        .trim();
}

function findPaths(r, c, activeRow = null, customCtx = null) {
    const targetGrid = (customCtx && customCtx.grid) ? customCtx.grid : (activeAssignmentGrid || grid);
    let cell = getCellAt(r, c, targetGrid);
    if (!cell) return [];

    let cellRowSpan = (cell.rS || cell.rowSpan || 1);
    let cellColSpan = (cell.cS || cell.colSpan || 1);
    let nextCol = c + cellColSpan;

    const isCellEmpty = (cObj) => !cObj || !cObj.items || cObj.items.length === 0 || cObj.items.every(it => !it.t || it.t.trim() === "");
    const isBridgeCell = (cObj) => cObj && (cObj.compact || cObj.isBridge || isCellEmpty(cObj));

    const isCurrBridge = isBridgeCell(cell);
    let currentOptions = isCurrBridge ? [] : (cell.items || [])
        .filter(it => it.t && it.t.trim() !== "" && it.t.trim().toLowerCase() !== "bridge")
        .map(it => ({
            t: it.t.trim(),
            tr: it.tr ? it.tr.trim() : "",
            parts: [{ t: it.t, tr: it.tr || "", r: r, c: c }],
            details: [{ tWord: it.t, eWord: it.tr || "", r: r, c: c }]
        }));

    if (nextCol >= targetGrid[0].length) {
        return currentOptions.filter(path => isPathValid(path.parts, customCtx));
    }

    let combinedSubPaths = [];
    let visitedTargetRoots = new Set();

    for (let rowOffset = 0; rowOffset < cellRowSpan; rowOffset++) {
        let evalRow = r + rowOffset;
        if (evalRow >= targetGrid.length) break;

        let targetCell = getCellAt(evalRow, nextCol, targetGrid);
        if (!targetCell) continue;

        let targetRootRow = evalRow;
        for (let testR = evalRow; testR >= 0; testR--) {
            if (targetGrid[testR] && targetGrid[testR][nextCol] && !targetGrid[testR][nextCol].hidden) {
                targetRootRow = testR;
                break;
            }
        }

        let targetKey = `${targetRootRow}_${nextCol}`;
        if (visitedTargetRoots.has(targetKey)) continue;
        visitedTargetRoots.add(targetKey);

        combinedSubPaths = combinedSubPaths.concat(findPaths(targetRootRow, nextCol, evalRow, customCtx));
    }

    if (isCurrBridge) {
        return combinedSubPaths.map(sp => ({
            t: sp.t, tr: sp.tr,
            parts: [{ r: r, c: c, isBridge: true }, ...sp.parts],
            details: sp.details || []
        }));
    }

    if (currentOptions.length === 0) return combinedSubPaths.filter(p => isPathValid(p.parts, customCtx));
    if (combinedSubPaths.length === 0) return currentOptions.filter(p => isPathValid(p.parts, customCtx));

    let finalPaths = [];
    currentOptions.forEach(curr => {
        combinedSubPaths.forEach(sub => {
            const combinedParts = [...curr.parts, ...sub.parts];
            if (isPathValid(combinedParts, customCtx)) {
                finalPaths.push({
                    t: cleanSentenceSpacing(curr.t + " " + sub.t),
                    tr: cleanSentenceSpacing(curr.tr + " " + sub.tr),
                    parts: combinedParts,
                    details: [...(curr.details || []), ...(sub.details || [])]
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

function getCellAt(r, c, customGrid = null) {
    const targetGrid = customGrid || activeAssignmentGrid || grid;
    if (!targetGrid || r < 0 || r >= targetGrid.length || !targetGrid[0] || c < 0 || c >= targetGrid[0].length) return null;
    let cell = targetGrid[r][c];
    if (!cell) return null;
    if (!cell.hidden) return cell;

    for (let i = r; i >= 0; i--) {
        for (let j = c; j >= 0; j--) {
            let root = targetGrid[i] ? targetGrid[i][j] : null;
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
    const targetGrid = activeAssignmentGrid || grid;
    return sentence.parts.some(p => {
        const cell = getCellAt(p.r, p.c, targetGrid);
        if (!cell || !cell.items) return false;
        return cell.items.filter(it => it.tr && it.tr.trim() !== "").length > 1;
    });
}

function generateFaultySentenceObj(sentence) {
    if (!sentence || !sentence.parts || sentence.parts.length === 0) return null;
    const targetGrid = activeAssignmentGrid || grid;
    const rules = activeAssignmentTransformationsText !== null ? activeAssignmentTransformationsText : (document.getElementById('transformations-input')?.value || transformationsText || "");

    const eligiblePartIndices = [];
    sentence.parts.forEach((p, idx) => {
        if (p.isBridge) return;
        const cell = getCellAt(p.r, p.c, targetGrid);
        if (cell && cell.items && cell.items.filter(it => (it.t && it.t.trim()) || (it.tr && it.tr.trim())).length > 1) {
            eligiblePartIndices.push(idx);
        }
    });

    if (eligiblePartIndices.length === 0) return null;
    const chosenIdx = eligiblePartIndices[Math.floor(Math.random() * eligiblePartIndices.length)];
    const chosenPart = sentence.parts[chosenIdx];
    const cell = getCellAt(chosenPart.r, chosenPart.c, targetGrid);

    const origTr = (chosenPart.tr || "").trim().toLowerCase();
    const origT = (chosenPart.t || "").trim().toLowerCase();
    const alternatives = (cell.items || []).filter(it => {
        const tr = (it.tr || "").trim().toLowerCase();
        const t = (it.t || "").trim().toLowerCase();
        return (tr && tr !== origTr) || (t && t !== origT);
    });

    if (alternatives.length === 0) return null;
    const faultyItem = alternatives[Math.floor(Math.random() * alternatives.length)];

    const faultyParts = sentence.parts.map((p, idx) => idx === chosenIdx ? { ...p, t: faultyItem.t || p.t, tr: faultyItem.tr || "" } : p);
    const rawFaultyTr = faultyParts.filter(p => !p.isBridge && p.tr && p.tr.trim() !== "").map(p => p.tr.trim()).join(" ");

    let faultyTr = cleanSentenceSpacing(applyTransformations(rawFaultyTr, rules));
    if (!faultyTr || faultyTr.toLowerCase() === (sentence.tr || "").toLowerCase()) {
        faultyTr = `${sentence.tr} (${(faultyItem.tr || faultyItem.t || "").trim()})`;
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

    // Filter out digital-only listening & delayed activities from print
    var selected = activityOrder.filter(function(id) {
        var el = document.getElementById('chk-' + id);
        return el && el.checked && !['listen-trad', 'listen-dictation', 'delayed-dictation', 'delayed-copying'].includes(id);
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
    
    // Smooth scroll only the right panel container
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
            console.warn("Classroom API rejected current token, requesting account selection...", authErr);
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

        select.innerHTML = '<option value="">-- Choose Course --</option>' + 
            courses.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    } catch (err) {
        console.error("Classroom Error:", err);
        alert("Classroom Connection Error: " + (err.message || "Failed to load Google Classroom courses."));
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
        } else if (window.editingSavedSentencesMap && window.editingSavedSentencesMap[actId] && window.editingSavedSentencesMap[actId].length > 0) {
            // Preserve exact duplicated sentences without re-shuffling from grid
            structuredSentencesPerActivity[actId] = window.editingSavedSentencesMap[actId];
            if (actId !== 'study') {
                totalSentencesCount += window.editingSavedSentencesMap[actId].length;
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

    // Builder binding & snapshot payload
    const targetBuilderId = activeAssignmentBuilderId || currentDocId || null;
    const builderSnapshot = {
        grid: JSON.stringify(activeAssignmentGrid || grid),
        disabledRoutes: activeAssignmentDisabledRoutes || disabledRoutes || [],
        excludedCombos: activeAssignmentExcludedCombos || excludedCombos || [],
        requiredCombos: activeAssignmentRequiredCombos || requiredCombos || [],
        excludedPairs: activeAssignmentExcludedPairs || excludedPairs || [],
        transformationsText: activeAssignmentTransformationsText || transformationsText || ""
    };

    await ensureGapiClassroomLoaded();

    if (editingAssignmentId) {
        try {
            const assignDoc = await db.collection("assignments").doc(editingAssignmentId).get();
            const existingData = assignDoc.data();

            const updatePayload = {
                title: title,
                builderId: targetBuilderId,
                builderSnapshot: builderSnapshot,
                selectedActivities: selectedActivities,
                sentencesPerActivity: structuredSentencesPerActivity,
                maxPoints: maxPoints > 0 ? maxPoints : 10,
                dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null,
                scheduleDate: scheduleDateVal ? new Date(scheduleDateVal).toISOString() : null,
                topicId: topicId || null,
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
        description: `Use the link below to complete the interactive tasks. Make sure to log in using your school Google account`,
        workType: 'ASSIGNMENT',
        maxPoints: maxPoints > 0 ? maxPoints : 10,
        materials: [{ link: { url: studentUrl, title: "Interactive Sentence Task" } }]
    };

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
        builderId: targetBuilderId,
        builderSnapshot: builderSnapshot,
        gClassroomAssignmentId: res.result.id,
        courseId: courseId,
        courseName: courseName,
        title: title,
        lang: window.duplicatingAssignmentLang || document.getElementById('meta-lang').value || meta.lang || "French",
        selectedActivities: selectedActivities,
        sentencesPerActivity: structuredSentencesPerActivity,
        maxPoints: maxPoints > 0 ? maxPoints : 10,
        dueDate: dueDateVal ? new Date(dueDateVal).toISOString() : null,
        scheduleDate: scheduleDateVal ? new Date(scheduleDateVal).toISOString() : null,
        topicId: topicId || null,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    alert(gcScheduledTime ? "📅 Assignment scheduled for publication on Google Classroom!" : "🎉 Assignment successfully posted to Google Classroom!");
    closeModals();
}
