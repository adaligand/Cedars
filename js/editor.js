/* =========================
   GRID CORE
========================= */
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
    if (!container) return;
    
    if (!grid || !grid.length || !grid[0]) {
        container.innerHTML = '';
        return;
    }
    
    // 1. Preserve the floating fullscreen toolbar if present
    const existingToolbar = document.getElementById('fullscreen-toolbar');

    // 2. Locate or create the inner grid wrapper without wiping the toolbar
    let gridWrapper = container.querySelector('.fullscreen-grid-wrapper');
    if (!gridWrapper) {
        container.innerHTML = '';
        if (existingToolbar) container.appendChild(existingToolbar);
        gridWrapper = document.createElement('div');
        gridWrapper.className = 'fullscreen-grid-wrapper';
        container.appendChild(gridWrapper);
    } else {
        gridWrapper.innerHTML = '';
    }

    const cols = Math.max(...grid.map(r => r.length), 1);
    const rows = grid.length;

    gridWrapper.style.setProperty('--grid-cols', cols);
    gridWrapper.style.setProperty('--grid-rows', rows);
    gridWrapper.style.display = 'grid';

    const colTrackSizes = [];
    for (let cIdx = 0; cIdx < cols; cIdx++) {
        const isBridgeCol = grid.every(row => {
            const cell = row[cIdx];
            return !cell || cell.hidden || cell.compact || !cell.items || cell.items.every(it => !it.t || !it.t.trim());
        });
        colTrackSizes.push(isBridgeCol ? 'max-content' : 'max-content');
    }

    gridWrapper.style.display = 'grid';
    gridWrapper.style.gridTemplateColumns = colTrackSizes.join(' ');
    gridWrapper.style.gap = '2px';
    gridWrapper.style.width = 'max-content';

    const pairColors = ['#e74c3c', '#9b59b6', '#3498db', '#e67e22', '#2ecc71', '#f1c40f'];

    const firstVisibleColInRow = new Array(rows).fill(-1);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (grid[r]?.[c] && !grid[r][c].hidden) {
                firstVisibleColInRow[r] = c;
                break;
            }
        }
    }

    const firstVisibleRowInCol = new Array(cols).fill(-1);
    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            if (grid[r]?.[c] && !grid[r][c].hidden) {
                firstVisibleRowInCol[c] = r;
                break;
            }
        }
        if (firstVisibleRowInCol[c] === -1) firstVisibleRowInCol[c] = 0;
    }

    const escapeAttr = (str) => (str || '').replace(/"/g, '&quot;');

    grid.forEach((row, r) => {
        row.forEach((cell, cIdx) => {
            if (!cell || cell.hidden) return;

            const cellDiv = document.createElement('div');
            cellDiv.className = 'cell';

            if (cell.compact) cellDiv.classList.add('is-compact');

            // Column split visual indicators
            const numCols = (cell.split === 3) ? 3 : ((cell.split === 2 || cell.split === true) ? 2 : 1);
            if (numCols === 2) cellDiv.classList.add('is-split');
            if (numCols === 3) cellDiv.classList.add('is-split-3');

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
                    <input type="text" class="target-input tl-speakable" placeholder="Target" 
                        data-pos="${r}-${cIdx}-${i}-t"
                        onclick="if(document.getElementById('grid-container').classList.contains('fullscreen-mode')) { if(this.value) speakTL(this.value); this.blur(); }"
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
                <div class="vocab-list ${numCols === 3 ? 'split-3' : (numCols === 2 ? 'split' : '')}">${listHTML}</div>
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

            gridWrapper.appendChild(cellDiv);
            cellDiv.querySelectorAll('input').forEach(syncSize);
        });
    });

    if (typeof updateFsStyles === 'function' && container.classList.contains('fullscreen-mode')) {
        updateFsStyles();
    }
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
    let s = grid[r][c].split;
    if (s === 3) {
        grid[r][c].split = false; // Back to 1 column
    } else if (s === 2 || s === true) {
        grid[r][c].split = 3;     // Move to 3 columns
    } else {
        grid[r][c].split = 2;     // Move to 2 columns
    }
    render();
    if (typeof saveToCloud === 'function') saveToCloud(true);
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

// Canvas text measurement helper for exact pixel widths
let textMeasureCanvas = null;
function getTextWidth(text, font) {
    if (!textMeasureCanvas) textMeasureCanvas = document.createElement('canvas');
    const context = textMeasureCanvas.getContext('2d');
    context.font = font || '16px Arial';
    return context.measureText(text).width;
}

function syncSize(el) { 
    if (el.value === "") {
        el.style.width = el.classList.contains('target-input') ? "65px" : "55px"; 
    } else {
        el.style.width = '0px'; 
        el.style.width = (el.scrollWidth + 1) + 'px'; 
    } 
}

function toggleAllActivities(master) {
    document.querySelectorAll('#activity-list input').forEach(cb => cb.checked = master.checked);
    renderPerActivitySentenceBoxes();
}

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
    document.body.style.overflow = '';
    document.querySelectorAll('.modal').forEach(m => m.style.display='none'); 
    document.getElementById('overlay').style.display='none'; 
    activeAssignmentGrid = null;
    activeAssignmentBuilderId = null;
    activeAssignmentDisabledRoutes = null;
    activeAssignmentExcludedCombos = null;
    activeAssignmentRequiredCombos = null;
    activeAssignmentExcludedPairs = null;
    activeAssignmentTransformationsText = null;
    clearCDTimer();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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

function exportPDF() {
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
                const splitCols = cell.split === 3 ? 3 : (cell.split ? 2 : 1);
                (cell.items || []).forEach(it => {
                    let len = (it.t || "").length + ((it.tr || "").length > 18 ? 3 : 0);
                    if (splitCols > 1) len *= (1 / splitCols) * 1.35;
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

                const splitCols = cell.split === 3 ? 3 : (cell.split ? 2 : 1);
                const effW = splitCols > 1 ? (cellW / splitCols) - (splitCols === 3 ? 3 : 4) : cellW - 6;

                const colHeights = new Array(splitCols).fill(cellPaddingV);
                (cell.items || []).forEach((it, idx) => {
                    const colIdx = idx % splitCols;
                    const stack = shouldStackText(it.t, it.tr, effW);
                    let h = stack ? (splitText(it.t, effW).length * lineSpacing) + (it.tr ? splitText(`(${it.tr})`, effW - 2).length * (lineSpacing - 0.3) : 0) : lineSpacing;
                    h += itemGap;
                    colHeights[colIdx] += h;
                });

                const contentH = Math.max(...colHeights);
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

                const splitCols = cell.split === 3 ? 3 : (cell.split ? 2 : 1);
                const effW = splitCols > 1 ? (cellW / splitCols) - (splitCols === 3 ? 3 : 4) : cellW - 6;
                const subColW = cellW / splitCols;

                const colHeights = new Array(splitCols).fill(0);
                (cell.items || []).forEach((it, idx) => {
                    const colIdx = idx % splitCols;
                    const stack = shouldStackText(it.t, it.tr, effW);
                    let h = stack ? (splitText(it.t, effW).length * lineSpacing) + (it.tr ? splitText(`(${it.tr})`, effW - 2).length * (lineSpacing - 0.3) : 0) : lineSpacing;
                    h += itemGap;
                    colHeights[colIdx] += h;
                });

                const maxColH = Math.max(...colHeights);
                const startY = currentY + ((cellH - maxColH) / 2) + 3;
                const colY = new Array(splitCols).fill(startY);

                (cell.items || []).forEach((item, idx) => {
                    const colIdx = idx % splitCols;
                    const itemX = currentX + (colIdx * subColW) + (splitCols > 1 ? 2 : 3);
                    let curY = colY[colIdx];
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
                    colY[colIdx] = curY + itemGap;
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
   ROBUST VECTOR & BOUNDING-BOX DOCX IMPORT ENGINE
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
                lang: nav.lang || meta.lang || "French",
                year: nav.year || meta.year || "Year 9",
                topic: nav.topic || meta.topic || "Imported",
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
/* ==========================================
   1. FULLSCREEN TOGGLE FUNCTIONALITY
   ========================================== */
function toggleFullscreenBuilder() {
    const gridContainer = document.getElementById('grid-container');
    if (!document.fullscreenElement) {
        if (gridContainer.requestFullscreen) {
            gridContainer.requestFullscreen();
        } else if (gridContainer.webkitRequestFullscreen) {
            gridContainer.webkitRequestFullscreen();
        } else if (gridContainer.msRequestFullscreen) {
            gridContainer.msRequestFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        }
    }
}

function handleFullscreenChange() {
    const gridContainer = document.getElementById('grid-container');
    const btn = document.getElementById('btn-fullscreen-builder');

    if (!gridContainer) return;

    // Only activate presentation mode when OUR grid is fullscreen
    const isFullscreen = document.fullscreenElement === gridContainer;

    if (isFullscreen) {
        gridContainer.classList.add('fullscreen-mode');

        if (btn) {
            btn.innerHTML = '❌ Exit Fullscreen';
        }

        // Create fullscreen controls if they do not exist
        if (!document.getElementById('fullscreen-toolbar')) {
            const toolbar = document.createElement('div');
            toolbar.id = 'fullscreen-toolbar';
            toolbar.className = 'fullscreen-controls-bar no-export';

            toolbar.innerHTML = `
                <div class="fs-control-group" style="display:flex; align-items:center; gap:6px;">
                   <button id="fs-font-minus" class="fs-control-btn">A-</button>
                    <span id="fs-font-label">187%</span>
                    <button id="fs-font-plus" class="fs-control-btn">A+</button>
                </div>
                <button id="fs-close-btn" class="fs-control-btn" style="margin-left:10px; color:#ef4444 !important;">
                    ✕
                </button>
            `;

            gridContainer.appendChild(toolbar);

            document.getElementById('fs-close-btn').onclick = toggleFullscreenBuilder;
        }

        // Make all vocabulary inputs read-only
        gridContainer.querySelectorAll('input').forEach(input => {
            input.readOnly = true;
            if (input.classList.contains('tl-speakable')) {
                input.style.pointerEvents = 'auto';
            } else {
                input.style.pointerEvents = 'none';
            }
        });

        initFullscreenToolbar();
        updateFsStyles();

    } else {
        // Restore normal editing mode
        gridContainer.classList.remove('fullscreen-mode');

        if (btn) {
            btn.innerHTML = '🖥️ Fullscreen';
        }

        // Restore editable inputs
        gridContainer.querySelectorAll('input').forEach(input => {
            input.readOnly = false;
            input.style.pointerEvents = '';
        });

        // Remove fullscreen toolbar
        const toolbar = document.getElementById('fullscreen-toolbar');
        if (toolbar) {
            toolbar.remove();
        }

        // Recalculate input widths and restore standard grid dimensions
        render(false);
    }
}

/* ==========================================
   TARGET LANGUAGE TEXT-TO-SPEECH (TTS)
   ========================================== */
function speakTL(text, onEndCallback = null) {
    if (!text || !('speechSynthesis' in window)) {
        if (onEndCallback) onEndCallback();
        return;
    }
    
    // Stop any currently playing audio
    window.speechSynthesis.cancel();
    window.speechSynthesis.resume();
    
    // Clean text (remove brackets or punctuation markers if present)
    const cleanText = text.replace(/[\(\)\[\]\{\}]/g, '').trim();
    if (!cleanText) {
        if (onEndCallback) onEndCallback();
        return;
    }

    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Detect active language from meta-lang dropdown, meta state, nav state, or assignment state
    const langSelect = document.getElementById('meta-lang');
    const selectedLang = (
        (langSelect && langSelect.value) || 
        (typeof meta !== 'undefined' && meta.lang) || 
        (typeof nav !== 'undefined' && nav.lang) || 
        (typeof currentStudentAssignment !== 'undefined' && currentStudentAssignment && currentStudentAssignment.lang) || 
        'french'
    ).toLowerCase();

    let langCode = 'fr-FR';
    if (selectedLang.includes('es') || selectedLang.includes('spanish')) langCode = 'es-ES';
    else if (selectedLang.includes('de') || selectedLang.includes('german')) langCode = 'de-DE';
    else if (selectedLang.includes('it') || selectedLang.includes('italian')) langCode = 'it-IT';
    else if (selectedLang.includes('fr') || selectedLang.includes('french')) langCode = 'fr-FR';
    else if (selectedLang.includes('eal') || selectedLang.includes('en') || selectedLang.includes('english')) langCode = 'en-GB';

    utterance.lang = langCode;
    utterance.rate = 0.95; // Slightly slower for clear classroom pronunciation
    utterance.pitch = 1.0;

    if (onEndCallback) {
        let called = false;
        const finishHandler = () => {
            if (!called) {
                called = true;
                onEndCallback();
            }
        };
        utterance.onend = finishHandler;
        utterance.onerror = finishHandler;

        // Fallback safety timer if browser fails to fire onend event
        const fallbackMs = Math.max(3000, cleanText.length * 120);
        setTimeout(finishHandler, fallbackMs);
    }

    window.speechSynthesis.speak(utterance);
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

function toggleMode(mode) { currentMode = (currentMode === mode) ? null : mode; render(false); }
function insertRow(i) {
    if (!grid || !grid.length) return;
    sanitizeGrid();
    const numCols = Math.max(...grid.map(r => r.length), 1);

    // Expand any vertical merge whose span crosses insertion index i
    grid.forEach((row, r) => {
        row.forEach(cell => {
            if (cell && !cell.hidden) {
                const rS = cell.rS || 1;
                if (r < i && i < r + rS) {
                    cell.rS = rS + 1;
                }
            }
        });
    });

    if (Array.isArray(excludedPairs)) {
        excludedPairs.forEach(pair => {
            if (pair.a.r >= i) pair.a.r += 1;
            if (pair.b.r >= i) pair.b.r += 1;
        });
    }

    grid.splice(i, 0, Array.from({ length: numCols }, () => c()));
    currentMode = null;
    render();
    saveToCloud(true);
}

function insertCol(i) {
    if (!grid || !grid.length) return;
    sanitizeGrid();

    // Expand any horizontal merge whose span crosses insertion index i
    grid.forEach(row => {
        row.forEach((cell, cIdx) => {
            if (cell && !cell.hidden) {
                const cS = cell.cS || 1;
                if (cIdx < i && i < cIdx + cS) {
                    cell.cS = cS + 1;
                }
            }
        });
    });

    if (Array.isArray(excludedPairs)) {
        excludedPairs.forEach(pair => {
            if (pair.a.c >= i) pair.a.c += 1;
            if (pair.b.c >= i) pair.b.c += 1;
        });
    }

    grid.forEach(r => r.splice(i, 0, c()));
    currentMode = null;
    render();
    saveToCloud(true);
}

function deleteCol(cIdx) {
    if (!grid || !grid.length) return;
    const cols = Math.max(...grid.map(r => r.length), 1);
    if (cols <= 1) {
        alert("Cannot delete the last remaining column.");
        return;
    }

    sanitizeGrid();

    // Preserve horizontal merges: shrink or shift root cell to cIdx + 1
    grid.forEach((row, r) => {
        row.forEach((cell, cPos) => {
            if (!cell || cell.hidden) return;
            const rS = cell.rS || 1;
            const cS = cell.cS || 1;

            if (cPos === cIdx && cS > 1) {
                const nextCell = grid[r][cPos + 1];
                if (nextCell) {
                    nextCell.items = JSON.parse(JSON.stringify(cell.items || [{ t: "", tr: "" }]));
                    nextCell.color = cell.color || "#ffffff";
                    nextCell.split = cell.split || false;
                    nextCell.compact = !!cell.compact;
                    nextCell.rS = rS;
                    nextCell.cS = cS - 1;
                    nextCell.hidden = false;
                }
            } else if (cPos < cIdx && cIdx < cPos + cS) {
                cell.cS = cS - 1;
            }
        });
    });

    grid.forEach(row => {
        if (cIdx < row.length) {
            row.splice(cIdx, 1);
        }
    });

    if (Array.isArray(excludedPairs)) {
        excludedPairs = excludedPairs
            .filter(pair => pair.a.c !== cIdx && pair.b.c !== cIdx)
            .map(pair => ({
                a: { r: pair.a.r, c: pair.a.c > cIdx ? pair.a.c - 1 : pair.a.c },
                b: { r: pair.b.r, c: pair.b.c > cIdx ? pair.b.c - 1 : pair.b.c }
            }));
    }

    currentMode = null;
    render(true);
    saveToCloud(true);
}

function deleteRow(rIdx) {
    if (!grid || grid.length <= 1) {
        alert("Cannot delete the last remaining row.");
        return;
    }

    sanitizeGrid();

    // Preserve vertical merges: shrink or shift root cell to rIdx + 1
    grid.forEach((row, r) => {
        row.forEach((cell, cPos) => {
            if (!cell || cell.hidden) return;
            const rS = cell.rS || 1;
            const cS = cell.cS || 1;

            if (r === rIdx && rS > 1) {
                const nextCell = grid[r + 1]?.[cPos];
                if (nextCell) {
                    nextCell.items = JSON.parse(JSON.stringify(cell.items || [{ t: "", tr: "" }]));
                    nextCell.color = cell.color || "#ffffff";
                    nextCell.split = cell.split || false;
                    nextCell.compact = !!cell.compact;
                    nextCell.rS = rS - 1;
                    nextCell.cS = cS;
                    nextCell.hidden = false;
                }
            } else if (r < rIdx && rIdx < r + rS) {
                cell.rS = rS - 1;
            }
        });
    });

    grid.splice(rIdx, 1);

    if (Array.isArray(excludedPairs)) {
        excludedPairs = excludedPairs
            .filter(pair => pair.a.r !== rIdx && pair.b.r !== rIdx)
            .map(pair => ({
                a: { r: pair.a.r > rIdx ? pair.a.r - 1 : pair.a.r, c: pair.a.c },
                b: { r: pair.b.r > rIdx ? pair.b.r - 1 : pair.b.r, c: pair.b.c }
            }));
    }

    currentMode = null;
    render(true);
    saveToCloud(true);
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

/* ==========================================
   FULLSCREEN CHANGE EVENT REGISTRATION
   ========================================== */
document.addEventListener(
    'fullscreenchange',
    handleFullscreenChange
);
