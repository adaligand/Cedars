/* =========================================================
   INTERACTIVE CLASS DISPLAY ENGINE 
   ========================================================= */
let currentClassDisplayIndex = 0;
let isAnswerRevealed = false;
let classDisplaySentences = []; // Holds the randomized sentence list
// Live games timer reference & sentence processing helpers
let cdTimer = null;
let currentCDGapText = null;
let cdGridTimerInterval = null;
let cdGridRemainingSeconds = 300;
let cdGridIsRunning = false;

function clearCDTimer() {
    if (cdTimer) {
        clearInterval(cdTimer);
        clearTimeout(cdTimer);
        cdTimer = null;
    }
}

function clearGridTimer() {
    if (cdGridTimerInterval) {
        clearInterval(cdGridTimerInterval);
        cdGridTimerInterval = null;
    }
    cdGridIsRunning = false;
}

function restoreDefaultGridTimer() {
    clearGridTimer();
    const minsEl = document.getElementById('cd-grid-mins');
    const secsEl = document.getElementById('cd-grid-secs');
    if (minsEl) minsEl.value = '5';
    if (secsEl) secsEl.value = '0';
    cdGridRemainingSeconds = 300;
    renderGridTimerDisplay();
}

function playGridTimerEndSound() {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        if (ctx.state === 'suspended') ctx.resume();

        // Low-pass filter removes harsh high frequencies while keeping full mid-range body
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, ctx.currentTime);
        filter.Q.setValueAtTime(0.7, ctx.currentTime);

        // Soft-limiter preserves the high volume without clipping or buzz
        const shaper = ctx.createWaveShaper();
        const curve = new Float32Array(44100);
        for (let i = 0; i < 44100; i++) {
            const x = (i * 2) / 44100 - 1;
            curve[i] = Math.tanh(2.2 * x) / Math.tanh(2.2);
        }
        shaper.curve = curve;
        shaper.oversample = '2x';

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

        filter.connect(shaper);
        shaper.connect(masterGain);
        masterGain.connect(ctx.destination);

        // Warm, lower G-major chime (G4 - B4 - D5 - G5) instead of shrill C6-C7
        const notes = [392.00, 493.88, 587.33, 783.99];
        notes.forEach((freq, idx) => {
            const startTime = ctx.currentTime + idx * 0.24;
            const duration = idx === notes.length - 1 ? 1.15 : 0.50;

            [
                { type: 'sine', mult: 1, gain: 0.90 },
                { type: 'triangle', mult: 1, gain: 0.55 },
                { type: 'sine', mult: 2, gain: 0.20 }
            ].forEach(({ type, mult, gain: peakGain }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();

                osc.type = type;
                osc.frequency.setValueAtTime(freq * mult, startTime);

                // Smooth bell/marimba strike and resonant decay
                gain.gain.setValueAtTime(0.001, startTime);
                gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
                gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

                osc.connect(gain);
                gain.connect(filter);

                osc.start(startTime);
                osc.stop(startTime + duration + 0.03);
            });
        });

        setTimeout(() => {
            if (ctx.state !== 'closed') ctx.close().catch(() => {});
        }, 2300);
    } catch (e) {
        console.warn("Audio alert blocked or unavailable:", e);
    }
}

function getGridConfiguredSeconds() {
    const minsEl = document.getElementById('cd-grid-mins');
    const secsEl = document.getElementById('cd-grid-secs');
    const mins = Math.max(0, Math.min(59, parseInt(minsEl?.value, 10) || 0));
    const secs = Math.max(0, Math.min(59, parseInt(secsEl?.value, 10) || 0));
    const total = mins * 60 + secs;
    return total > 0 ? total : 300;
}

function renderGridTimerDisplay() {
    const displayEl = document.getElementById('cd-grid-timer-display');
    const startBtn = document.getElementById('cd-grid-timer-start-btn');

    const mins = Math.floor(Math.max(0, cdGridRemainingSeconds) / 60);
    const secs = Math.max(0, cdGridRemainingSeconds) % 60;
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (displayEl) {
        displayEl.textContent = formatted;
        if (cdGridRemainingSeconds === 0) {
            displayEl.style.color = '#dc2626';
        } else if (cdGridRemainingSeconds <= 10 && cdGridIsRunning) {
            displayEl.style.color = '#ea580c';
        } else {
            displayEl.style.color = '#0f172a';
        }
    }

    if (startBtn) {
        startBtn.textContent = cdGridIsRunning ? '⏸ Pause' : '▶ Start';
    }
}

function updateGridTimerFromInputs() {
    if (cdGridTimerInterval) {
        clearInterval(cdGridTimerInterval);
        cdGridTimerInterval = null;
    }
    cdGridIsRunning = false;
    cdGridRemainingSeconds = getGridConfiguredSeconds();
    renderGridTimerDisplay();
}

function resetGridCountdownTimer() {
    if (cdGridTimerInterval) {
        clearInterval(cdGridTimerInterval);
        cdGridTimerInterval = null;
    }
    cdGridIsRunning = false;
    cdGridRemainingSeconds = getGridConfiguredSeconds();
    renderGridTimerDisplay();
}

function toggleGridCountdownTimer() {
    if (cdGridIsRunning) {
        clearInterval(cdGridTimerInterval);
        cdGridTimerInterval = null;
        cdGridIsRunning = false;
        renderGridTimerDisplay();
        return;
    }

    if (cdGridRemainingSeconds <= 0) {
        cdGridRemainingSeconds = getGridConfiguredSeconds();
    }

    cdGridIsRunning = true;
    renderGridTimerDisplay();

    cdGridTimerInterval = setInterval(() => {
        cdGridRemainingSeconds--;
        renderGridTimerDisplay();

        if (cdGridRemainingSeconds <= 0) {
            clearInterval(cdGridTimerInterval);
            cdGridTimerInterval = null;
            cdGridIsRunning = false;
            renderGridTimerDisplay();
            playGridTimerEndSound();
        }
    }, 1000);
}

function removeWordsFromSentence(text) {
    if (!text) return '';

    const words = text.split(' ');

    // Find indices of words with at least 3 letters (ignoring punctuation)
    const eligibleIndices = words
        .map((word, index) => {
            const cleanWord = word.replace(/[^\p{L}\p{N}]/gu, '');
            return cleanWord.length >= 3 ? index : -1;
        })
        .filter(index => index !== -1);

    // Fallback to any non-empty word if no word is >= 3 letters
    const targetPool = eligibleIndices.length > 0
        ? eligibleIndices
        : words.map((w, i) => w.trim().length > 0 ? i : -1).filter(i => i !== -1);

    if (targetPool.length === 0) return text;

    // Randomly pick exactly ONE word index from eligible pool
    const selectedIndex = targetPool[Math.floor(Math.random() * targetPool.length)];

    const blankDisp = isAnswerRevealed ? 'none' : 'inline';
    const ansDisp = isAnswerRevealed ? 'inline' : 'none';

    // Replace selected word with span elements compatible with reveal toggle
    return words.map((word, index) => {
        if (index === selectedIndex) {
            const leadingPunct = word.match(/^[^\p{L}\p{N}]+/u)?.[0] || '';
            const trailingPunct = word.match(/[^\p{L}\p{N}]+$/u)?.[0] || '';
            const coreWord = word.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');
            return `${leadingPunct}<span class="cd-gap-blank" style="display:${blankDisp};">_____</span><span class="cd-gap-ans" style="display:${ansDisp}; color:#16a34a; font-weight:bold;">${coreWord}</span>${trailingPunct}`;
        }
        return word;
    }).join(' ');
}

function openInteractiveClassDisplay() {
    // 1. Display the modal immediately so the UI opens instantly without lag
    const modal = document.getElementById('class-display-modal');
    document.body.style.overflow = 'hidden';

    // Reset dropdown selection back to the top activity on re-open
    const gameSelect = document.getElementById('class-display-game-select');
    if (gameSelect) {
        gameSelect.selectedIndex = 0;
    }

    modal.style.display = 'flex';

    // 2. Defer heavy sentence generation to allow the browser thread to paint the screen
    setTimeout(() => {
        const sentences = getAssembledSentences();
        if (!sentences || sentences.length === 0) {
            closeModals();
            alert("Please add vocabulary and structure to your grid before opening the display.");
            return;
        }

        classDisplaySentences = shuffleArray(sentences);
        currentClassDisplayIndex = 0;
        isAnswerRevealed = false;
        playClassDisplayGame();
    }, 0);
}

function handleClassDisplayActivityChange() {
    clearCDTimer();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    isAnswerRevealed = false;

    if (classDisplaySentences && classDisplaySentences.length > 0) {
        currentClassDisplayIndex++;
        if (currentClassDisplayIndex >= classDisplaySentences.length) {
            classDisplaySentences = shuffleArray(classDisplaySentences);
            currentClassDisplayIndex = 0;
        }
    }

    playClassDisplayGame();
}

// Clean empty brackets from English sentences while preserving annotations like (pl)
function cleanEnglishText(text) {
    if (!text) return '';
    return text.replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim();
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
                const blankDisp = isAnswerRevealed ? 'none' : 'inline-block';
                const ansDisp = isAnswerRevealed ? 'inline' : 'none';
                return `<span class="cd-blank-wrap" style="display:inline-block; margin:0 1px;"><span class="cd-blank-char" style="display:${blankDisp};">&nbsp;</span><span class="cd-blank-ans" style="display:${ansDisp}; color:#16a34a; font-weight:bold;">${ch}</span></span>`;
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

function handleCDReattempt(targetText) {
    const mode = document.getElementById('class-display-game-select').value;
    if (mode === 'delayed-dictation') {
        startDelayedDictation(targetText, true);
    } else if (mode === 'delayed-copying') {
        startDelayedCopyingSequence(targetText, true);
    }
}

function playClassDisplayGame() {
   clearCDTimer();
    const mode = document.getElementById('class-display-game-select').value;
    const gridTimerBar = document.getElementById('cd-grid-timer-bar');

    if (mode !== 'sentence-grid') {
        restoreDefaultGridTimer();
        if (gridTimerBar) gridTimerBar.style.display = 'none';
    } else {
        if (gridTimerBar) gridTimerBar.style.display = 'flex';
        renderGridTimerDisplay();
    }

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
    const safeTarget = targetText.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    let questionHTML = '';
    let answerHTML = '';

    // 1. Standard Modes
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
        questionHTML = `<div class="cd-question-text">${hiddenText}</div><div class="cd-sub-text">${englishText}</div>`;
    } 
    else if (mode === 'no-consonants') {
        const hiddenText = formatMissingChars(targetText, 'consonants');
        questionHTML = `<div class="cd-question-text">${hiddenText}</div><div class="cd-sub-text">${englishText}</div>`;
    } 
    else if (mode === 'no-spaces') {
        const noSpaceText = targetText.replace(/\s+/g, '');
        const spaceCount = (targetText.match(/ /g) || []).length;
        questionHTML = `
            <div style="font-size: 2.2rem; font-weight: bold; color: #8b5cf6; margin-bottom: 15px;">Spaces missing: ${spaceCount}</div>
            <div class="cd-question-text" style="letter-spacing: 2px; word-break: break-all; overflow-wrap: anywhere;">${noSpaceText}</div>
        `;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">${targetText}<div style="font-size: 3.2rem; font-weight: 600; margin-top: 10px; color: #16a34a;">${englishText}</div></div>`;
    }
    else if (mode === 'unjumble') {
        const words = shuffleArray(targetText.split(' '));
        questionHTML = `<div class="cd-question-text">${words.join(' &nbsp;•&nbsp; ')}</div>`;
        answerHTML = `<div id="cd-answer-box" class="cd-answer-text" style="display: ${isAnswerRevealed ? 'block' : 'none'};">${targetText}<div style="font-size: 3.2rem; font-weight: 600; margin-top: 10px; color: #16a34a;">${englishText}</div></div>`;
    }
    // 2. Listen / Trad
    else if (mode === 'listen-trad') {
        const gapEnglish = removeWordsFromSentence(englishText);
        questionHTML = `
            <button onclick="speakTL('${safeTarget}')" class="btn-purple" style="font-size: 24px; padding: 12px 32px; margin-bottom: 25px;">🔊 Listen</button>
            <div class="cd-question-text">${gapEnglish}</div>
        `;
    }

    // 3. Listening / Dictation
    else if (mode === 'listen-dictation') {
        const gapTarget = removeWordsFromSentence(targetText);
        questionHTML = `
            <button onclick="speakTL('${safeTarget}')" class="btn-purple" style="font-size: 24px; padding: 12px 32px; margin-bottom: 25px;">🔊 Listen</button>
            <div class="cd-question-text">${gapTarget}</div>
        `;
    }

    // 4. Delayed Dictation
    else if (mode === 'delayed-dictation') {
        questionHTML = `
            <div id="cd-delayed-stage" style="width: 100%; text-align: center;">
                <button id="cd-start-dd-btn" onclick="startDelayedDictation('${safeTarget}')" class="btn-purple" style="font-size: 24px; padding: 14px 36px; margin-bottom: 20px;">🔊 Listen</button>
                <div id="cd-status-msg" class="cd-question-text" style="color: #64748b;">🎧 Listen and memorise</div>
            </div>
        `;
    }

    // 5. Delayed Copying
    else if (mode === 'delayed-copying') {
        questionHTML = `
            <div id="cd-delayed-copy-stage" style="width: 100%; text-align: center;">
                <div id="cd-copy-timer-badge" style="font-size: 2rem; font-weight: bold; color: #8b5cf6; margin-bottom: 15px;">⏳ Sentence disappearing in: <span id="cd-copy-sec">7</span>s</div>
                <div id="cd-copy-text" class="cd-question-text">${targetText}</div>
            </div>
        `;
    }

    container.innerHTML = `
        <div style="width: 98%; max-width: 98%; margin: 25px auto 0 auto; min-height: 220px; display:flex; flex-direction:column; justify-content:flex-start; align-items:center;">
            ${questionHTML}
            ${answerHTML}
        </div>
        <div style="margin-top: 40px; display: flex; gap: 20px; justify-content: center; align-items: center;">
            <button onclick="nextClassDisplaySentence()" class="btn-purple" style="font-size: 20px; padding: 12px 28px;">🔄 Shuffle</button>
            <button id="cd-reveal-btn" onclick="toggleClassDisplayAnswer(this)" class="btn-info" style="font-size: 20px; padding: 12px 28px;">${isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal'}</button>
            <button id="cd-reattempt-btn" onclick="handleCDReattempt('${safeTarget}')" class="btn-outline" style="font-size: 20px; padding: 12px 28px; display: none;">🔁 Reattempt</button>
        </div>
    `;

    if (mode === 'delayed-copying') {
        startDelayedCopyingSequence(targetText);
    }
}

function startDelayedDictation(targetText, isReattempt = false) {
    clearCDTimer();
    const statusMsg = document.getElementById('cd-status-msg');
    const startBtn = document.getElementById('cd-start-dd-btn');
    const reattemptBtn = document.getElementById('cd-reattempt-btn');

    // Generate gap text only on the first attempt
    if (!isReattempt || !currentCDGapText) {
        currentCDGapText = removeWordsFromSentence(targetText);
    }

    if (startBtn) startBtn.style.display = 'none';
    if (reattemptBtn) reattemptBtn.style.display = 'none';
    if (statusMsg) {
        statusMsg.style.color = '#8b5cf6';
        statusMsg.innerHTML = '🎧 Listen carefully...';
    }

    speakTL(targetText, () => {
        let count = 3;
        if (statusMsg) {
            statusMsg.style.color = '#8b5cf6';
            statusMsg.innerHTML = `🧠 Memorise! <b>${count}</b>s`;
        }

        cdTimer = setInterval(() => {
            count--;
            if (count > 0) {
                if (statusMsg) statusMsg.innerHTML = `🧠 Memorise! <b>${count}</b>s`;
            } else {
                clearCDTimer();
                if (statusMsg) {
                    statusMsg.style.color = '#000000';
                    statusMsg.innerHTML = currentCDGapText;
                }
                if (reattemptBtn) reattemptBtn.style.display = 'inline-block';
            }
        }, 1000);
    });
}

// Handler for Delayed Copying: 7s display -> 3s memory countdown -> 1 word removed
function startDelayedCopyingSequence(targetText, isReattempt = false) {
    clearCDTimer();

    const badge = document.getElementById('cd-copy-timer-badge');
    const textEl = document.getElementById('cd-copy-text');
    const reattemptBtn = document.getElementById('cd-reattempt-btn');

    // Generate gap text only on the first attempt
    if (!isReattempt || !currentCDGapText) {
        currentCDGapText = removeWordsFromSentence(targetText);
    }

    if (reattemptBtn) reattemptBtn.style.display = 'none';
    if (badge) {
        badge.style.display = 'block';
        badge.style.color = '#8b5cf6';
        badge.innerHTML = `⏳ Sentence disappearing in: <span id="cd-copy-sec">7</span>s`;
    }
    if (textEl) {
        textEl.style.display = 'block';
        textEl.style.color = '#000000';
        textEl.innerHTML = targetText;
    }

    let phase1Count = 7;
    cdTimer = setInterval(() => {
        phase1Count--;
        const secSpan = document.getElementById('cd-copy-sec');
        if (phase1Count > 0) {
            if (secSpan) secSpan.innerText = phase1Count;
        } else {
            clearCDTimer();
            let phase2Count = 3;
            if (badge) badge.style.display = 'none';
            if (textEl) {
                textEl.style.display = 'block';
                textEl.style.color = '#8b5cf6';
                textEl.innerHTML = `🧠 Memorise! <b>${phase2Count}</b>s`;
            }

            cdTimer = setInterval(() => {
                phase2Count--;
                if (phase2Count > 0) {
                    if (textEl) textEl.innerHTML = `🧠 Memorise! <b>${phase2Count}</b>s`;
                } else {
                    clearCDTimer();
                    if (badge) badge.style.display = 'none';
                    if (textEl) {
                        textEl.style.color = '#000000';
                        textEl.innerHTML = currentCDGapText;
                        textEl.style.display = 'block';
                    }
                    if (reattemptBtn) reattemptBtn.style.display = 'inline-block';
                }
            }, 1000);
        }
    }, 1000);
}

function toggleClassDisplayAnswer(btn) {
    isAnswerRevealed = !isAnswerRevealed;

    const answerBox = document.getElementById('cd-answer-box');
    if (answerBox) {
        answerBox.style.display = isAnswerRevealed ? 'block' : 'none';
    }

    // Toggle in-place gap words
    document.querySelectorAll('.cd-gap-blank').forEach(el => el.style.display = isAnswerRevealed ? 'none' : 'inline');
    document.querySelectorAll('.cd-gap-ans').forEach(el => el.style.display = isAnswerRevealed ? 'inline' : 'none');

    // Toggle in-place missing characters
    document.querySelectorAll('.cd-blank-char').forEach(el => el.style.display = isAnswerRevealed ? 'none' : 'inline-block');
    document.querySelectorAll('.cd-blank-ans').forEach(el => el.style.display = isAnswerRevealed ? 'inline' : 'none');

    const revealBtn = btn || document.getElementById('cd-reveal-btn');
    if (revealBtn) {
        revealBtn.innerHTML = isAnswerRevealed ? '🙈 Hide' : '🔍 Reveal';
    }
}

function nextClassDisplaySentence() {
    clearCDTimer();
    currentCDGapText = null; // Reset cached word for next sentence
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
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
    const distractorItems = shuffled.slice(NUM_PAIRS, totalNeeded);

    const leftSide = gamePairs.map(p => p.t);
    const rightSide = shuffleArray([
        ...gamePairs.map((p, pairIdx) => ({ tr: p.tr, t: p.t, isDistractor: false, pairIdx })),
        ...distractorItems.map(d => ({ tr: d.tr, t: d.t, isDistractor: true, pairIdx: -1 }))
    ]);

    const leftHTML = leftSide.map((sent, i) => {
        const rightIndex = rightSide.findIndex(r => !r.isDistractor && r.pairIdx === i);
        const correctLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : '';
        return `
            <li style="font-size: ${fontSize}; line-height: ${lineHeight}; display: flex; align-items: baseline; padding: 2px 0;">
                <span class="match-ans-letter" style="color: #10b981; font-weight: bold; width: 40px; min-width: 40px; display: inline-block;">${isAnswerRevealed ? correctLetter : ''}</span>
                <span style="font-weight: bold; margin-right: 10px;">${i + 1}.</span>
                <span>${sent}</span>
            </li>
        `;
    }).join('');

    const rightHTML = rightSide.map((item, i) => {
        const revealedDistractorStyle = (isAnswerRevealed && item.isDistractor)
            ? 'color: #ef4444; cursor: pointer;'
            : '';
        const titleAttr = (isAnswerRevealed && item.isDistractor)
            ? 'title="Click to show/hide Target Language"'
            : '';
        return `
            <li class="${item.isDistractor ? 'cd-match-distractor' : ''}" data-distractor="${item.isDistractor ? '1' : '0'}" ${titleAttr} style="font-size: ${fontSize}; line-height: ${lineHeight}; display: flex; align-items: baseline; padding: 2px 0; ${revealedDistractorStyle}">
                <span style="font-weight: bold; margin-right: 10px; color: #8b5cf6;">${String.fromCharCode(65 + i)}.</span>
                <div style="display: flex; flex-direction: column;">
                    <span>${item.tr}</span>
                    ${item.isDistractor ? `<span class="cd-distractor-tl" style="display: none; color: #16a34a; font-size: 0.82em; font-weight: 600; margin-top: 2px;">${item.t}</span>` : ''}
                </div>
            </li>
        `;
    }).join('');

    document.getElementById('class-display-content').innerHTML = `
        <div style="display: flex; flex-direction: column; justify-content: space-between; height: 100%; width: 100%; box-sizing: border-box;">
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; width: 100%; text-align: left; flex: 1; min-height: 0;">
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 20px; border-radius: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow-y: auto;">
                    <h3 style="margin-top: 0; margin-bottom: 8px; color: #1e293b; border-bottom: 2px solid #8b5cf6; padding-bottom: 6px; font-size: 1.3rem; flex-shrink: 0;">Target Language</h3>
                    <ul style="list-style: none; padding: 0; margin: 0; flex: 1; display: flex; flex-direction: column; justify-content: space-evenly;">${leftHTML}</ul>
                </div>
                <div style="background: #f8fafc; border: 1px solid #cbd5e1; padding: 14px 20px; border-radius: 12px; display: flex; flex-direction: column; height: 100%; box-sizing: border-box; overflow-y: auto;">
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

    // Allow clicking each red distractor once answers are revealed to toggle its TL below
    document.querySelectorAll('#cd-match-right-list li.cd-match-distractor').forEach(li => {
        li.onclick = function() {
            if (!isAnswerRevealed) return;
            const tlSpan = this.querySelector('.cd-distractor-tl');
            if (tlSpan) {
                tlSpan.style.display = (tlSpan.style.display === 'none') ? 'block' : 'none';
            }
        };
    });

    document.getElementById('cd-reveal-match-btn').onclick = function() {
        isAnswerRevealed = !isAnswerRevealed;
        gamePairs.forEach((pair, idx) => {
            const rightIndex = rightSide.findIndex(r => !r.isDistractor && r.pairIdx === idx);
            const correctLetter = rightIndex >= 0 ? String.fromCharCode(65 + rightIndex) : '';
            const letterSpans = document.querySelectorAll('.match-ans-letter');
            if (letterSpans[idx]) {
                letterSpans[idx].innerText = isAnswerRevealed ? correctLetter : '';
            }
        });

        document.querySelectorAll('#cd-match-right-list li.cd-match-distractor').forEach(li => {
            li.style.color = isAnswerRevealed ? '#ef4444' : '';
            li.style.cursor = isAnswerRevealed ? 'pointer' : 'default';
            li.title = isAnswerRevealed ? 'Click to show/hide Target Language' : '';

            const tlSpan = li.querySelector('.cd-distractor-tl');
            if (tlSpan && !isAnswerRevealed) {
                tlSpan.style.display = 'none';
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
