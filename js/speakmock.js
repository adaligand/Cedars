document.addEventListener('DOMContentLoaded', () => {
    const THEMES = { 
        1: "1 - Personal world", 
        2: "2 - Lifestyle", 
        3: "3 - Neighbourhood", 
        4: "4 - Media & Tech", 
        5: "5 - Study & future", 
        6: "6 - Travel and Tourism" 
    };

    const generateTableBtn = document.getElementById('generate-table-btn');
    const editConfigBtn = document.getElementById('edit-config-btn');
    const autoAllocateBtn = document.getElementById('auto-allocate-btn');
    const clearDataBtn = document.getElementById('clear-data-btn');
    const exportExcelBtn = document.getElementById('export-excel-btn'); 
    const saveToFileBtn = document.getElementById('save-to-file-btn'); 
    const loadFromFileInput = document.getElementById('load-from-file-input'); 
    const studentNamesInput = document.getElementById('student-names-input');
    const shuffleChoicesBtn = document.getElementById('shuffle-choices-btn');
    const saveToFileBtnBottom = document.getElementById('save-to-file-btn-bottom');
    const exportExcelBtnBottom = document.getElementById('export-excel-btn-bottom');
    
    const initialSetupWrapper = document.getElementById('initial-setup-wrapper');
    const allocationSection = document.getElementById('allocation-section');
    const allocationTableBody = document.querySelector('#allocation-table tbody');
    const allocationError = document.getElementById('allocation-error');

    // Tab key handling for textarea
    studentNamesInput.addEventListener('keydown', function(e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + "\t" + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 1;
        }
    });

    const getThemeFromPhoto = (photoNum) => Math.floor((parseInt(photoNum) - 1) / 3) + 1;
    const getThemeFromRa = (raNum) => parseInt(raNum);
    const getThemeFromRp = (rpNum) => parseInt(rpNum);

    function initializeStudiedThemes() {
        const grid = document.getElementById('studied-themes-grid');
        grid.innerHTML = Object.entries(THEMES).map(([num, name]) => 
            `<label><input type="checkbox" class="studied-theme-checkbox" id="studied-theme-${num}" value="${num}">${name}</label>`
        ).join('');
    }
    
    function buildStateObject() {
        const state = { students: [], rpLocked: allocationSection.style.display === 'block', studiedThemes: [], excludedCards: {} };
        for (let i = 1; i <= 6; i++) {
            if (document.getElementById(`studied-theme-${i}`).checked) {
                state.studiedThemes.push(i.toString());
            }
        }
        
        state.excludedCards.ra = { f: document.getElementById('exclude-ra-f-input').value, h: document.getElementById('exclude-ra-h-input').value };
        state.excludedCards.rp = { f: document.getElementById('exclude-rp-f-input').value, h: document.getElementById('exclude-rp-h-input').value };
        state.excludedCards.pt = { f: document.getElementById('exclude-pt-f-input').value, h: document.getElementById('exclude-pt-h-input').value };

        if (allocationTableBody.innerHTML) {
            allocationTableBody.querySelectorAll('tr').forEach(row => {
                state.students.push({
                    examNumber: row.cells[0].textContent,
                    tier: row.cells[1].textContent,
                    name: row.cells[2].textContent,
                    choice1: row.cells[3].dataset.themeId, 
                    choice2: row.cells[4].dataset.themeId,
                    selected: row.querySelector('.selected-theme').value, 
                    ra: row.querySelector('.ra-result').innerHTML, 
                    rp: row.querySelector('.rp-result').innerHTML, 
                    pt: row.querySelector('.photo-result').innerHTML
                });
            });
        }
        return state;
    }

    function populatePageFromState(state) {
        if (!state) return;
        allocationTableBody.innerHTML = '';
        studentNamesInput.value = '';
        allocationSection.style.display = 'none';
        initialSetupWrapper.style.display = 'grid';
        
        generateTableBtn.style.display = 'inline-block';
        editConfigBtn.style.display = 'none';

        if (state.studiedThemes && state.studiedThemes.length > 0) {
            for (let i = 1; i <= 6; i++) document.getElementById(`studied-theme-${i}`).checked = false;
            state.studiedThemes.forEach(themeNum => {
                const checkbox = document.getElementById(`studied-theme-${themeNum}`);
                if (checkbox) checkbox.checked = true;
            });
        }
        
        if (state.excludedCards) {
            document.getElementById('exclude-ra-f-input').value = state.excludedCards.ra?.f || '';
            document.getElementById('exclude-ra-h-input').value = state.excludedCards.ra?.h || '';
            document.getElementById('exclude-rp-f-input').value = state.excludedCards.rp?.f || '';
            document.getElementById('exclude-rp-h-input').value = state.excludedCards.rp?.h || '';
            document.getElementById('exclude-pt-f-input').value = state.excludedCards.pt?.f || '';
            document.getElementById('exclude-pt-h-input').value = state.excludedCards.pt?.h || '';
        }

        document.querySelectorAll('#studied-themes-grid input, #exclude-cards-section input').forEach(el => el.disabled = state.rpLocked);

        if (state.students && state.students.length > 0) {
            allocationTableBody.innerHTML = state.students.map(s => {
                const choice1 = s.choice1 || '';
                const choice2 = s.choice2 || '';
                return `<tr>
                    <td class="exam-number" contenteditable="true">${s.examNumber}</td>
                    <td class="tier" contenteditable="true">${s.tier}</td>
                    <td class="student-name" contenteditable="true">${s.name}</td>
                    <td class="theme-choice-1" data-theme-id="${choice1}">${THEMES[choice1] || ''}</td>
                    <td class="theme-choice-2" data-theme-id="${choice2}">${THEMES[choice2] || ''}</td>
                    <td><select class="selected-theme" disabled><option value="">-</option></select></td>
                    <td class="result ra-result"></td>
                    <td class="result rp-result"></td>
                    <td class="result photo-result"></td>
                </tr>`;
            }).join('');

            allocationTableBody.querySelectorAll('tr').forEach((row, index) => {
                const s = state.students[index];
                if (s) {
                    const selectedThemeDropdown = row.querySelector('.selected-theme');
                    updateSelectedThemeForRow(row);
                    selectedThemeDropdown.value = s.selected;
                    colorCodeSelectedTheme(selectedThemeDropdown);
                    row.querySelector('.ra-result').innerHTML = s.ra;
                    row.querySelector('.rp-result').innerHTML = s.rp;
                    row.querySelector('.photo-result').innerHTML = s.pt;
                }
            });

            initialSetupWrapper.style.display = 'none';
            allocationSection.style.display = 'block';
            generateTableBtn.style.display = 'none';
            editConfigBtn.style.display = 'inline-block';
            addTableEventListeners();
        }
    }

    function exportToExcel() {
        const themeColors = {'theme-color-1':'#aed6f1','theme-color-2':'#a2d9ab','theme-color-3':'#f7dc6f','theme-color-4':'#d2b4de','theme-color-5':'#f1948a','theme-color-6':'#dfdfdf'};
        const table = document.getElementById('allocation-table');
        const tableClone = table.cloneNode(true);
        const originalRows = table.querySelectorAll('tbody tr');

        tableClone.querySelectorAll('tbody tr').forEach((clonedRow, index) => {
            const originalRow = originalRows[index];
            if (!originalRow) return;
            originalRow.querySelectorAll('select').forEach(select => {
                const cellIndex = select.parentElement.cellIndex;
                const clonedCell = clonedRow.cells[cellIndex];
                const selectedValue = select.value;
                clonedCell.textContent = (selectedValue && THEMES[selectedValue]) ? THEMES[selectedValue] : '';
                if (select.classList.contains('selected-theme') && selectedValue) {
                    clonedCell.style.backgroundColor = themeColors[`theme-color-${selectedValue}`];
                }
            });
            originalRow.querySelectorAll('.result').forEach(resultCell => {
                const cellIndex = resultCell.cellIndex;
                const clonedCell = clonedRow.cells[cellIndex];
                const span = resultCell.querySelector('span');
                if (span) {
                    clonedCell.textContent = span.textContent;
                    for (const className of span.classList) {
                        if (className.startsWith('theme-color-')) {
                            clonedCell.style.backgroundColor = themeColors[className];
                            break;
                        }
                    }
                } else {
                    clonedCell.textContent = '';
                }
            });
        });
        let tableHTML = `<html><head><meta charset='UTF-8'><style>table,th,td{border:.5pt solid black;border-collapse:collapse;padding:6px;font-family:Calibri,sans-serif;}th{background-color:#005a9c;color:white;font-weight:bold;}</style></head><body><table>${tableClone.innerHTML}</table></body></html>`;
        const dataUri = 'data:application/vnd.ms-excel;base64,' + window.btoa(unescape(encodeURIComponent(tableHTML)));
        const link = document.createElement("a");
        link.href = dataUri;
        link.download = "speaking_exam_allocations.xls";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function saveAllocationToFile() {
        const state = buildStateObject();
        const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `gcse_allocation_${new Date().toISOString().slice(0,10)}.json`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        const confirmMsg = document.getElementById('save-confirm-msg');
        confirmMsg.style.display = 'inline';
        setTimeout(() => { confirmMsg.style.display = 'none'; }, 2000);
    }

    function loadAllocationFromFile(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const state = JSON.parse(e.target.result);
                populatePageFromState(state);
            } catch (error) {
                alert("Error: Could not load the file.");
            }
            event.target.value = '';
        };
        reader.readAsText(file);
    }

    generateTableBtn.addEventListener('click', () => {
        const studiedThemes = [];
        for (let i = 1; i <= 6; i++) {
            if (document.getElementById(`studied-theme-${i}`).checked) studiedThemes.push(i.toString());
        }
        if (studiedThemes.length < 2) {
            allocationError.textContent = 'Please select at least two "Studied Themes" in Step 1.';
            allocationError.style.display = 'block';
            return;
        }
        allocationError.style.display = 'none';

        const oldData = {};
        allocationTableBody.querySelectorAll('tr').forEach((row, index) => {
            const examNumber = row.cells[0].textContent.trim();
            const name = row.cells[2].textContent.trim();
            const compositeKey = `${examNumber}_${name}_${index}`;
            
            oldData[compositeKey] = { 
                examNumber: examNumber,
                tier: row.cells[1].textContent.trim(),
                name: name,
                choice1: row.cells[3].dataset.themeId, 
                choice2: row.cells[4].dataset.themeId,
                selected: row.querySelector('.selected-theme').value, 
                ra: row.querySelector('.ra-result').innerHTML, 
                rp: row.querySelector('.rp-result').innerHTML, 
                pt: row.querySelector('.photo-result').innerHTML 
            };
        });

        if (Object.keys(oldData).length === 0 && window._cachedTableState) {
            Object.assign(oldData, window._cachedTableState);
        }

        const studentDataFromInput = studentNamesInput.value.trim().split('\n').map(line => {
            const parts = line.split('\t');
            let examNumber = (parts[0] || '').trim();
            let tier = (parts[1] || '').trim().toUpperCase();
            let name = parts.slice(2).join(' ').trim();
            
            return { examNumber, tier, name };
        }).filter(s => s.name && s.examNumber && s.tier);

        if (studentDataFromInput.length === 0) return;

        document.querySelectorAll('#studied-themes-grid input, #exclude-cards-section input').forEach(el => el.disabled = true);

        const themePairs = [];
        for (let i = 0; i < studiedThemes.length; i++) {
            for (let j = i + 1; j < studiedThemes.length; j++) themePairs.push([studiedThemes[i], studiedThemes[j]]);
        }
        for (let i = themePairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [themePairs[i], themePairs[j]] = [themePairs[j], themePairs[i]];
        }
        
        allocationTableBody.innerHTML = studentDataFromInput.map((s, index) => {
            let saved = oldData[`${s.examNumber}_${s.name}_${index}`];
            if (!saved) {
                const fallbackKey = Object.keys(oldData).find(k => oldData[k].name === s.name);
                if (fallbackKey) saved = oldData[fallbackKey];
            }

            let c1, c2;
            if (saved && saved.choice1 && saved.choice2 && studiedThemes.includes(saved.choice1) && studiedThemes.includes(saved.choice2)) {
                c1 = saved.choice1;
                c2 = saved.choice2;
            } else {
                const randomOffset = Math.floor(Math.random() * themePairs.length);
                const pair = themePairs[(index + randomOffset) % themePairs.length];
                [c1, c2] = Math.random() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
            }

            return `<tr>
                <td class="exam-number" contenteditable="true">${s.examNumber}</td>
                <td class="tier" contenteditable="true">${s.tier}</td>
                <td class="student-name" contenteditable="true">${s.name}</td>
                <td class="theme-choice-1" data-theme-id="${c1}">${THEMES[c1] || ''}</td>
                <td class="theme-choice-2" data-theme-id="${c2}">${THEMES[c2] || ''}</td>
                <td><select class="selected-theme" disabled><option value="">-</option></select></td>
                <td class="result ra-result"></td>
                <td class="result rp-result"></td>
                <td class="result photo-result"></td>
            </tr>`;
        }).join('');
        
        allocationTableBody.querySelectorAll('tr').forEach((row, index) => {
            const examNum = row.cells[0].textContent.trim();
            const name = row.cells[2].textContent.trim();
            
            let saved = oldData[`${examNum}_${name}_${index}`];
            if (!saved) {
                const fallbackKey = Object.keys(oldData).find(k => oldData[k].name === name);
                if (fallbackKey) saved = oldData[fallbackKey];
            }
            
            updateSelectedThemeForRow(row);
            
            if (saved) {
                const sel = row.querySelector('.selected-theme');
                if(saved.selected && (saved.selected === row.cells[3].dataset.themeId || saved.selected === row.cells[4].dataset.themeId)) {
                    sel.value = saved.selected;
                }
                colorCodeSelectedTheme(sel);

                const currentTier = row.cells[1].textContent.trim().toUpperCase();
                if (currentTier === saved.tier.toUpperCase() && sel.value === saved.selected && sel.value !== "") {
                    row.querySelector('.ra-result').innerHTML = saved.ra; 
                    row.querySelector('.rp-result').innerHTML = saved.rp; 
                    row.querySelector('.photo-result').innerHTML = saved.pt;
                }
            }
        });

        window._cachedTableState = null;

        initialSetupWrapper.style.display = 'none';
        allocationSection.style.display = 'block';
        generateTableBtn.style.display = 'none';
        editConfigBtn.style.display = 'inline-block';
        addTableEventListeners();
    });

    editConfigBtn.addEventListener('click', () => {
        document.querySelectorAll('#studied-themes-grid input, #exclude-cards-section input').forEach(el => el.disabled = false);
        
        window._cachedTableState = {};
        allocationTableBody.querySelectorAll('tr').forEach((row, index) => {
            const examNumber = row.cells[0].textContent.trim();
            const name = row.cells[2].textContent.trim();
            const compositeKey = `${examNumber}_${name}_${index}`;
            
            window._cachedTableState[compositeKey] = {
                choice1: row.cells[3].dataset.themeId, 
                choice2: row.cells[4].dataset.themeId,
                selected: row.querySelector('.selected-theme').value, 
                ra: row.querySelector('.ra-result').innerHTML, 
                rp: row.querySelector('.rp-result').innerHTML, 
                pt: row.querySelector('.photo-result').innerHTML 
            };
        });

        studentNamesInput.value = Array.from(allocationTableBody.querySelectorAll('tr')).map(row => 
            `${row.cells[0].textContent.trim()}\t${row.cells[1].textContent.trim()}\t${row.cells[2].textContent.trim()}`
        ).join('\n');
        
        allocationSection.style.display = 'none';
        initialSetupWrapper.style.display = 'grid';
        generateTableBtn.style.display = 'inline-block';
        editConfigBtn.style.display = 'none';
    });

    function colorCodeSelectedTheme(el) {
        const cell = el.parentElement;
        for (let i = 1; i <= 6; i++) cell.classList.remove(`theme-color-${i}`);
        if (el.value) cell.classList.add(`theme-color-${el.value}`);
    }
    
    function updateSelectedThemeForRow(row) {
        const [v1, v2] = [row.cells[3].dataset.themeId, row.cells[4].dataset.themeId];
        const sel = row.querySelector('.selected-theme');
        sel.disabled = true; 
        sel.innerHTML = '<option value="">-</option>';
        if (v1 && v2 && v1 !== v2) {
            sel.innerHTML = `<option value="">Select...</option><option value="${v1}">${THEMES[v1]}</option><option value="${v2}">${THEMES[v2]}</option>`;
            sel.disabled = false;
        }
        colorCodeSelectedTheme(sel);
    }

    function addTableEventListeners() {
        allocationTableBody.querySelectorAll('tr').forEach(row => {
            row.querySelector('.selected-theme').addEventListener('change', (e) => {
                colorCodeSelectedTheme(e.target);
                row.querySelectorAll('.result').forEach(c => c.innerHTML = '');
            });
            const tierCell = row.cells[1];
            let initVal = '';
            tierCell.addEventListener('focus', () => initVal = tierCell.textContent.trim().toUpperCase());
            tierCell.addEventListener('blur', () => {
                if (initVal && initVal !== tierCell.textContent.trim().toUpperCase()) row.querySelectorAll('.result').forEach(c => c.innerHTML = '');
            });
        });
    }

    function applyCardColor(cell, cardText, tier) {
        cell.innerHTML = '';
        if (!cardText) return;
        const cardNum = parseInt(cardText.match(/\d+/)[0]);
        let themeNum = cardText.startsWith('PT') ? getThemeFromPhoto(cardNum) : (cardText.startsWith('RA') ? getThemeFromRa(cardNum) : getThemeFromRp(cardNum));
        if (themeNum > 0) cell.innerHTML = `<span class="theme-color-${themeNum}">${cardText} (${tier})</span>`;
    }

    autoAllocateBtn.addEventListener('click', () => {
        allocationTableBody.querySelectorAll('tr .result').forEach(cell => cell.innerHTML = '');
        allocationError.style.display = 'none';

        const excluded = {
            ra: { f: document.getElementById('exclude-ra-f-input').value.split(',').map(n => n.trim()).filter(Boolean), h: document.getElementById('exclude-ra-h-input').value.split(',').map(n => n.trim()).filter(Boolean) },
            rp: { f: document.getElementById('exclude-rp-f-input').value.split(',').map(n => n.trim()).filter(Boolean), h: document.getElementById('exclude-rp-h-input').value.split(',').map(n => n.trim()).filter(Boolean) },
            pt: { f: document.getElementById('exclude-pt-f-input').value.split(',').map(n => n.trim()).filter(Boolean), h: document.getElementById('exclude-pt-h-input').value.split(',').map(n => n.trim()).filter(Boolean) }
        };

        const counters = { H: { photo: {}, ra: {}, rp: {} }, F: { photo: {}, ra: {}, rp: {} } };
        ['H', 'F'].forEach(t => { for(let i=1; i<=6; i++) { counters[t].photo[i] = 0; counters[t].ra[i] = 0; counters[t].rp[i] = 0; } });

        let allocationsMade = 0;
        allocationTableBody.querySelectorAll('tr').forEach(row => {
            const selectedTheme = parseInt(row.querySelector('.selected-theme').value);
            if (!selectedTheme) return;

            const tier = row.cells[1].textContent.trim().toUpperCase();
            if (tier !== 'H' && tier !== 'F') return;

            const tierCounters = counters[tier];
            const validPhotos = [1, 2, 3].map(x => (selectedTheme - 1) * 3 + x).filter(c => !excluded.pt[tier.toLowerCase()].includes(c.toString()));
            
            const photoCard = validPhotos[tierCounters.photo[selectedTheme]++ % validPhotos.length];
            let assignedRa, assignedRp;
            let validRa = Object.keys(tierCounters.ra).filter(r => getThemeFromRa(r) !== selectedTheme && !excluded.ra[tier.toLowerCase()].includes(r)).sort((a,b) => tierCounters.ra[a] - tierCounters.ra[b]);
            let validRp = Object.keys(tierCounters.rp).filter(r => getThemeFromRp(r) !== selectedTheme && !excluded.rp[tier.toLowerCase()].includes(r)).sort((a,b) => tierCounters.rp[a] - tierCounters.rp[b]);
            
            for (const ra of validRa) {
                for (const rp of validRp) { 
                    if (getThemeFromRa(ra) !== getThemeFromRp(rp)) { assignedRa = ra; assignedRp = rp; break; }
                }
                if (assignedRa) break;
            }

            if (assignedRa && assignedRp) {
                tierCounters.ra[assignedRa]++; tierCounters.rp[assignedRp]++;
                applyCardColor(row.querySelector('.ra-result'), `RA${assignedRa}`, tier);
                applyCardColor(row.querySelector('.rp-result'), `RP${assignedRp}`, tier);
                applyCardColor(row.querySelector('.photo-result'), `PT${photoCard}`, tier);
                allocationsMade++;
            }
        });
    });
    
    shuffleChoicesBtn.addEventListener('click', () => {
        const studiedThemes = Array.from(document.querySelectorAll('.studied-theme-checkbox:checked')).map(cb => cb.value);
        if (studiedThemes.length < 2) return;

        const themePairs = [];
        for (let i = 0; i < studiedThemes.length; i++) {
            for (let j = i + 1; j < studiedThemes.length; j++) themePairs.push([studiedThemes[i], studiedThemes[j]]);
        }
        for (let i = themePairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [themePairs[i], themePairs[j]] = [themePairs[j], themePairs[i]];
        }

        allocationTableBody.querySelectorAll('tr').forEach((row, index) => {
            const hasRa = row.querySelector('.ra-result').innerHTML.trim() !== '';
            const hasRp = row.querySelector('.rp-result').innerHTML.trim() !== '';
            const hasPt = row.querySelector('.photo-result').innerHTML.trim() !== '';

            if (hasRa || hasRp || hasPt) {
                return;
            }

            const sel = row.querySelector('.selected-theme');
            const prev = sel.value;
            
            const pairIndex = (index + Math.floor(Math.random() * themePairs.length)) % themePairs.length;
            const pair = themePairs[pairIndex];
            const [c1, c2] = Math.random() < 0.5 ? [pair[0], pair[1]] : [pair[1], pair[0]];
            
            row.cells[3].dataset.themeId = c1; row.cells[3].textContent = THEMES[c1];
            row.cells[4].dataset.themeId = c2; row.cells[4].textContent = THEMES[c2];
            updateSelectedThemeForRow(row);
            
            if (prev && (prev === c1 || prev === c2)) {
                sel.value = prev;
            } else { 
                sel.value = ''; 
                row.querySelectorAll('.result').forEach(c => c.innerHTML = ''); 
            }
            colorCodeSelectedTheme(sel);
        });
    });

    exportExcelBtn.addEventListener('click', exportToExcel);
    saveToFileBtn.addEventListener('click', saveAllocationToFile);
    loadFromFileInput.addEventListener('change', loadAllocationFromFile);
    clearDataBtn.addEventListener('click', () => { if (confirm("Clear the page?")) window.location.reload(); });
    saveToFileBtnBottom.addEventListener('click', saveAllocationToFile);
    exportExcelBtnBottom.addEventListener('click', exportToExcel);

    initializeStudiedThemes();
});
