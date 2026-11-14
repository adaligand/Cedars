/* =========================
   STUDENT PORTAL & MARKSHEET REVIEW
========================= */
function getCleanActivityTitle(type, lang) {
    const map = {
        'study': 'Sentence Table (Reference)',
        'match': 'Match Up',
        'nospaces': 'No Spaces',
        'jumbled': 'Unjumble Sentences',
        'gap-en': 'Gap Fill (English)',
        'gap-t': `Gap Fill (${lang || 'Target Language'})`,
        'vowels': 'Missing Vowels',
        'cons': 'Missing Consonants',
        'faulty': 'Faulty Translation',
        'trans-en': 'Translate to English',
        'trans-target': `Translate to ${lang || 'Target Language'}`,
        'listen-trad': '🎧 Gapped Translation',
        'listen-dictation': '🎧 Dictation',
        'delayed-dictation': '🎧 Delayed Dictation',
        'delayed-copying': 'Delayed Copying'
    };
    return map[type] || type;
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
        'trans-target': `Translate the English sentence into ${lang}.`,
        'listen-trad': 'Listen to the audio and fill in the missing English word.',
        'listen-dictation': `Listen to the audio and fill in the missing ${lang} word.`,
        'delayed-dictation': `Listen to the audio,memorise it and fill in the missing ${lang} word.`,
        'delayed-copying': `Memorise the ${lang} sentence before it disappears, then fill in the missing word.`
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
        studentSubItemIndex = 0;
        studentAnswersState = {};
        window.studentCompletedExercises = {};

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
            const studentEmail = currentUser.email.toLowerCase();

            // 1. Check if final submission already exists
            try {
                const subSnap = await db.collection("submissions")
                    .where("assignmentId", "==", assignmentId)
                    .where("studentEmail", "==", studentEmail)
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
                console.warn("Could not query previous submissions:", subErr);
            }

            // 2. Fetch saved draft progress (Firestore + Local Storage fallback)
            try {
                const draftId = `${assignmentId}_${studentEmail}`;
                let draftData = null;

                try {
                    const draftDoc = await db.collection("drafts").doc(draftId).get();
                    if (draftDoc.exists) {
                        draftData = draftDoc.data();
                    }
                } catch (fsErr) {
                    console.warn("Could not fetch draft from Firestore:", fsErr);
                }

                const localDraftRaw = localStorage.getItem(`student_draft_${draftId}`);
                if (localDraftRaw) {
                    try {
                        const localDraft = JSON.parse(localDraftRaw);
                        if (!draftData || (localDraft.updatedAt || 0) > (draftData.updatedAt || 0)) {
                            draftData = localDraft;
                        }
                    } catch (pErr) {}
                }

                if (draftData) {
                    studentAnswersState = draftData.studentAnswersState || {};
                    const restoredCompleted = draftData.studentCompletedExercises || {};
                    window.studentCompletedExercises = {};

                    studentExerciseTypes.forEach(act => {
                        const sents = perActSentences[act] || [];
                        const resps = studentAnswersState[act] || [];
                        const allItemsValid = sents.length > 0 && resps.length >= sents.length && sents.every((_, idx) => {
                            const r = resps[idx];
                            if (!r || !r.studentAnswer) return false;
                            const ans = r.studentAnswer.trim();
                            if (ans === '' || ans === '(Empty)' || ans.startsWith('(Incomplete') || ans === '(Unmatched)') return false;
                            if ((act === 'nospaces' || act === 'jumbled') && !r.isDone) return false;
                            if ((act === 'vowels' || act === 'cons') && (!Array.isArray(r.letterValues) || r.letterValues.length === 0 || r.letterValues.some(v => !v.trim()))) return false;
                            return true;
                        });

                        if (restoredCompleted[act] && allItemsValid) {
                            window.studentCompletedExercises[act] = true;
                        }
                    });

                    // Resume on the first uncompleted exercise
                    const firstUncompletedIdx = studentExerciseTypes.findIndex(act => !window.studentCompletedExercises[act]);
                    if (firstUncompletedIdx !== -1) {
                        studentCurrentExIndex = firstUncompletedIdx;
                    } else if (studentExerciseTypes.length > 0) {
                        studentCurrentExIndex = studentExerciseTypes.length - 1;
                    }

                    // Restore exact sentence/question index within that exercise
                    const activeAct = studentExerciseTypes[studentCurrentExIndex];
                    const activeSents = perActSentences[activeAct] || [];
                    if (
                        draftData.currentExIndex === studentCurrentExIndex &&
                        typeof draftData.currentSubItemIndex === 'number' &&
                        draftData.currentSubItemIndex >= 0 &&
                        draftData.currentSubItemIndex < activeSents.length
                    ) {
                        studentSubItemIndex = draftData.currentSubItemIndex;
                    }
                }
            } catch (draftErr) {
                console.warn("Could not load draft progress:", draftErr);
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

    let totalEarned = 0;
    let totalPossible = 0;

    if (sub && typeof sub.totalEarned === 'number' && typeof sub.totalPossible === 'number') {
        totalEarned = sub.totalEarned;
        totalPossible = sub.totalPossible;
    } else if (sub && sub.detailedReport && Array.isArray(sub.detailedReport)) {
        sub.detailedReport.forEach(act => {
            (act.responses || []).forEach(r => {
                totalEarned += (r.points !== undefined ? r.points : (r.isCorrect ? 1 : 0));
                totalPossible += 1;
            });
        });
    }

    let scoreHtml = '';
    if (totalPossible > 0) {
        const pct = (typeof sub.percentage === 'number')
            ? sub.percentage
            : Math.round((totalEarned / totalPossible) * 100);

        scoreHtml = `
            <div style="background:white; padding:15px; border-radius:8px; border:1px solid #bfdbfe; margin-bottom:15px; text-align:center;">
                <span style="font-size:13px; font-weight:bold; color:#475569; text-transform:uppercase; letter-spacing:0.5px;">Provisional Score</span>
                <div style="font-size:28px; font-weight:bold; color:#2563eb; margin-top:4px;">
                    ${totalEarned} / ${totalPossible} (${pct}%)
                </div>
            </div>
        `;
    }

    pendingCard.innerHTML = `
        <div style="background:#eff6ff; padding:24px; border-radius:10px; border:1px solid #bfdbfe; text-align:center;">
            <h3 style="margin:0 0 14px 0; color:#1e40af; font-size:20px;">✅ Assignment Submitted Successfully!</h3>
            ${scoreHtml}
            <div style="background:#f8fafc; padding:14px 18px; border-radius:8px; border:1px solid #cbd5e1; color:#1e3a8a; font-size:14px; line-height:1.5;">
                ⏳ Your score above includes automatic marking for all exercises, and your work is currently <b>pending teacher review</b>.<br>
                Please return to this assignment page once your teacher has reviewed your work in Google Classroom to view your confirmed final score and corrections.
            </div>
        </div>
    `;
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
                                        ${r.mistakes !== undefined ? `
                                            <span style="display:inline-block; margin-left:8px; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:bold; background:${r.mistakes === 0 ? '#d1fae5' : '#fef3c7'}; color:${r.mistakes === 0 ? '#065f46' : '#92400e'};">
                                                ${r.mistakes === 0 ? '✓' : `⚠️ ${r.mistakes} Mistake(s)`}
                                            </span>
                                        ` : ''}
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

    saveStudentCurrentExerciseResponses();

    const responses = studentAnswersState[actType] || [];
    if (responses.length < sents.length) return false;

    for (let i = 0; i < sents.length; i++) {
        const resp = responses[i];
        if (!resp || !resp.studentAnswer) return false;
        const ans = resp.studentAnswer.trim();
        if (ans === '' || ans === '(Empty)' || ans.startsWith('(Incomplete') || ans === '(Unmatched)') {
            return false;
        }
        if ((actType === 'nospaces' || actType === 'jumbled') && !resp.isDone) {
            return false;
        }
        if ((actType === 'vowels' || actType === 'cons') &&
            (!Array.isArray(resp.letterValues) || resp.letterValues.length === 0 || resp.letterValues.some(v => !v.trim()))) {
            return false;
        }
    }

    return true;
}

function checkExerciseCompletion() {
    const navActions = document.getElementById('student-nav-actions');
    const submitExBtn = document.getElementById('student-submit-ex-btn');
    const nextBtn = document.getElementById('student-next-ex-btn');
    const prevExBtn = document.getElementById('student-prev-ex-btn');
    const submitBtn = document.getElementById('student-submit-btn');
    if (!nextBtn || !submitBtn || !submitExBtn) return;

    // Always default Final Submit to hidden
    submitBtn.style.display = 'none';

    const actType = studentExerciseTypes[studentCurrentExIndex];
    const isLastEx = (studentCurrentExIndex === studentExerciseTypes.length - 1);
    const isFirstEx = (studentCurrentExIndex === 0);

    // Teacher Preview Mode
    if (window.isTeacherPreview) {
        submitExBtn.style.display = 'none';
        if (prevExBtn) prevExBtn.style.display = isFirstEx ? 'none' : 'inline-block';
        if (isLastEx) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
        }
        if (navActions) navActions.style.display = 'flex';
        return;
    }

    // Student Mode
    if (prevExBtn) prevExBtn.style.display = 'none';
    const isOneByOne = (actType !== 'match');
    const isCompletedInFull = isCurrentExerciseCompleted();
    let isSubmitted = !!(window.studentCompletedExercises && window.studentCompletedExercises[actType]);

    // Prevent stale completion flags from unlocking navigation if sentences are incomplete
    if (isSubmitted && !isCompletedInFull) {
        window.studentCompletedExercises[actType] = false;
        isSubmitted = false;
    }

    if (isSubmitted && isCompletedInFull) {
        submitExBtn.style.display = 'none';
        if (isLastEx) {
            nextBtn.style.display = 'none';
            submitBtn.style.display = 'inline-block';
        } else {
            nextBtn.style.display = 'inline-block';
        }
        if (navActions) navActions.style.display = 'flex';
    } else {
        nextBtn.style.display = 'none';
        submitBtn.style.display = 'none';

        if (isOneByOne) {
            submitExBtn.style.display = 'none';
            if (navActions) navActions.style.display = 'none';
        } else {
            submitExBtn.style.display = isCompletedInFull ? 'inline-block' : 'none';
            if (navActions) navActions.style.display = isCompletedInFull ? 'flex' : 'none';
        }
    }
}

function lockCurrentExerciseUI() {
    const area = document.getElementById('exercise-interactive-area');
    if (!area) return;

    area.querySelectorAll('input, button, .interactive-tile, .space-span, .letter-span, .jumble-word-tile').forEach(el => {
        el.disabled = true;
        el.style.pointerEvents = 'none';
        el.style.opacity = '0.75';
    });
}

async function submitCurrentExercise() {
    const actType = studentExerciseTypes[studentCurrentExIndex];
    if (!isCurrentExerciseCompleted()) return;

    const innerSubmitBtn = document.getElementById('one-by-one-submit-btn');
    if (innerSubmitBtn) innerSubmitBtn.disabled = true;

    saveStudentCurrentExerciseResponses();
    window.studentCompletedExercises[actType] = true;
    await saveDraftProgress({ immediate: true });
    lockCurrentExerciseUI();

    if (innerSubmitBtn) innerSubmitBtn.style.display = 'none';

    checkExerciseCompletion();
}

/* =========================
   CLEAN SAVED ANSWER HELPER
========================= */
function getCleanSavedStudentAnswer(actType, itemIdx) {
    const resp = studentAnswersState[actType]?.[itemIdx];
    if (!resp || !resp.studentAnswer) return '';
    const ans = resp.studentAnswer.trim();
    if (ans === '(Empty)' || ans.startsWith('(Incomplete') || ans === '(Unmatched)') {
        return '';
    }
    return ans;
}

/* =========================
   1-BY-1 ITEM COMPLETION CHECKER
========================= */
function checkOneByOneItemCompletion() {
    const submitBtn = document.getElementById('one-by-one-submit-btn');
    if (!submitBtn) return;

    const actType = studentExerciseTypes[studentCurrentExIndex];
    const isExSubmitted = !!(window.studentCompletedExercises && window.studentCompletedExercises[actType]);

    // Hide the inner Submit Exercise button once the exercise has been submitted
    if (isExSubmitted || window.isTeacherPreview) {
        submitBtn.style.display = 'none';
        return;
    }

    const area = document.getElementById('exercise-interactive-area');
    if (!area) return;

    let isItemComplete = false;

    if (actType === 'jumbled') {
        const bank = area.querySelector('.jumble-word-bank');
        isItemComplete = bank && bank.children.length === 0;
    } else if (actType === 'nospaces') {
        const block = area.querySelector('.student-item-block');
        if (block) {
            const unrevealed = block.querySelectorAll('.space-inner:not(.revealed-space)');
            isItemComplete = unrevealed.length === 0;
        }
    } else if (actType === 'vowels' || actType === 'cons') {
        const boxes = Array.from(area.querySelectorAll('.letter-box'));
        isItemComplete = boxes.length > 0 && boxes.every(b => b.value.trim().length > 0);
    } else if (['listen-trad', 'listen-dictation', 'delayed-dictation', 'delayed-copying', 'gap-en', 'gap-t'].includes(actType)) {
        const inp = area.querySelector('.gap-inline-input');
        isItemComplete = inp && inp.value.trim().length > 0;
    } else {
        const inp = area.querySelector('.full-typing-input');
        isItemComplete = inp && inp.value.trim().length > 0;
    }

    submitBtn.style.display = isItemComplete ? 'inline-block' : 'none';
}

/* =========================================================
   STUDENT GAP-FILL GENERATOR FOR ONE-BY-ONE ACTIVITIES
   ========================================================= */
function makeStudentGapHTML(text, itemIdx, actType, savedVal = '') {
    if (!text) return { html: '', cleanGap: '' };

    const preMarked = extractGapWord(text);
    let fullMatch = preMarked.fullMatch;
    let cleanGap = preMarked.cleanGap;

    if (!cleanGap) {
        const words = text.split(' ');
        const eligibleIndices = words
            .map((w, idx) => {
                const clean = w.replace(/[^\p{L}\p{N}]/gu, '');
                return clean.length >= 3 ? idx : -1;
            })
            .filter(idx => idx !== -1);

        const targetPool = eligibleIndices.length > 0
            ? eligibleIndices
            : words.map((w, i) => w.trim().length > 0 ? i : -1).filter(i => i !== -1);

        if (targetPool.length === 0) {
            return { html: text, cleanGap: text };
        }

        const selectedIndex = targetPool[itemIdx % targetPool.length];
        const selectedWord = words[selectedIndex];

        const leadingPunct = selectedWord.match(/^[^\p{L}\p{N}]+/u)?.[0] || '';
        const trailingPunct = selectedWord.match(/[^\p{L}\p{N}]+$/u)?.[0] || '';
        cleanGap = selectedWord.replace(/^[^\p{L}\p{N}]+/u, '').replace(/[^\p{L}\p{N}]+$/u, '');

        const inputHTML = `${leadingPunct}<input type="text" class="gap-inline-input" data-correct="${cleanGap.replace(/"/g, '&quot;')}" value="${(savedVal || '').replace(/"/g, '&quot;')}" style="padding:4px 10px; border:2px solid #8b5cf6; border-radius:6px; font-weight:bold; font-size:20px; width:150px; text-align:center; outline:none; font-family:inherit; color:#1e293b; background:#fefce8; box-shadow:0 2px 4px rgba(0,0,0,0.05);" placeholder="Type word...">${trailingPunct}`;

        words[selectedIndex] = inputHTML;
        return { html: words.join(' '), cleanGap: cleanGap };
    } else {
        const inputHTML = `<input type="text" class="gap-inline-input" data-correct="${cleanGap.replace(/"/g, '&quot;')}" value="${(savedVal || '').replace(/"/g, '&quot;')}" style="padding:4px 10px; border:2px solid #8b5cf6; border-radius:6px; font-weight:bold; font-size:20px; width:150px; text-align:center; outline:none; font-family:inherit; color:#1e293b; background:#fefce8; box-shadow:0 2px 4px rgba(0,0,0,0.05);" placeholder="Type word...">`;
        return { html: text.replace(fullMatch, inputHTML), cleanGap: cleanGap };
    }
}

// Helper to update One-by-One submit button visibility based on input text
function updateOneByOneSubmitVisibility() {
    checkOneByOneItemCompletion();
}

function renderCurrentStudentExercise() {
    clearStudentOneByOneTimers();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const container = document.getElementById('student-active-exercise-card');
    if (studentExerciseTypes.length === 0) {
        container.innerHTML = '<p>No exercises in this assignment.</p>';
        return;
    }

    const actType = studentExerciseTypes[studentCurrentExIndex];
    const docLang = (currentStudentAssignment && currentStudentAssignment.lang) || "French";
    const actTitle = getCleanActivityTitle(actType, docLang);
    const actInstruction = getActivityInstruction(actType, docLang);

    setupVirtualKeyboard(docLang, actType);

    const sents = (currentStudentAssignment && currentStudentAssignment.sentencesPerActivity) 
        ? (currentStudentAssignment.sentencesPerActivity[actType] || []) 
        : [];
    
    const isOneByOne = (actType !== 'match');

    let html = `
        <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1.5px solid #e2e8f0; padding-bottom:8px; margin-bottom:12px;">
            <h3 style="margin:0; font-size:17px; color:#0f172a;">Exercise ${studentCurrentExIndex + 1} of ${studentExerciseTypes.length}: ${actTitle}</h3>
            <span style="background:#e2e8f0; padding:3px 8px; border-radius:12px; font-weight:bold; color:#475569;">
                ${sents.length} Items
            </span>
        </div>
        <p style="color:#64748b; font-style:italic; font-size:13px; margin-top:0; margin-bottom:14px;">${actInstruction}</p>
        <div id="exercise-interactive-area"></div>
    `;

    container.innerHTML = html;
    const area = document.getElementById('exercise-interactive-area');

    // --- MATCH UP ACTIVITY (FULL TABLE MODE) ---
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
    // --- SINGLE-ITEM (1-BY-1) MODE FOR ALL OTHER ACTIVITIES ---
    else if (isOneByOne) {
        if (studentSubItemIndex >= sents.length) studentSubItemIndex = 0;
        const currentSent = sents[studentSubItemIndex] || { t: '', tr: '' };
        const targetText = currentSent.t || '';
        const englishText = cleanEnglishText(currentSent.tr || '');
        const safeTarget = targetText.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        const savedVal = getCleanSavedStudentAnswer(actType, studentSubItemIndex);

        let cardContentHTML = '';

        if (actType === 'listen-trad') {
            const gapObj = makeStudentGapHTML(englishText, studentSubItemIndex, 'listen-trad', savedVal);
            cardContentHTML = `
                <div style="text-align:center; padding:20px 0;">
                    <button type="button" onclick="speakTL('${safeTarget}')" class="btn-purple" style="font-size:18px; padding:12px 28px; margin-bottom:25px; cursor:pointer;">🔊 Listen Audio</button>
                    <div style="font-size:26px; font-weight:bold; color:#1e293b; margin-bottom:20px; line-height:1.5;">${gapObj.html}</div>
                </div>`;
            setTimeout(() => speakTL(targetText), 200);
        } 
        else if (actType === 'listen-dictation') {
            const gapObj = makeStudentGapHTML(targetText, studentSubItemIndex, 'listen-dictation', savedVal);
            cardContentHTML = `
                <div style="text-align:center; padding:20px 0;">
                    <button type="button" onclick="speakTL('${safeTarget}')" class="btn-purple" style="font-size:18px; padding:12px 28px; margin-bottom:25px; cursor:pointer;">🔊 Listen Audio</button>
                    <div style="font-size:26px; font-weight:bold; color:#1e293b; margin-bottom:20px; line-height:1.5;">${gapObj.html}</div>
                </div>`;
            setTimeout(() => speakTL(targetText), 200);
        } 
        else if (actType === 'delayed-dictation') {
            cardContentHTML = `<div id="dd-student-stage"></div>`;
        }
        else if (actType === 'delayed-copying') {
            cardContentHTML = `<div id="dc-student-stage"></div>`;
        }
        else if (actType === 'jumbled') {
            let bankWords = shuffleArray(targetText.split(' '));
            let slotWords = [];
            if (savedVal) {
                slotWords = savedVal.split(' ');
                const remaining = [...bankWords];
                slotWords.forEach(sw => {
                    const idx = remaining.indexOf(sw);
                    if (idx !== -1) remaining.splice(idx, 1);
                });
                bankWords = remaining;
            }
            cardContentHTML = `
                <div class="student-item-block" data-idx="${studentSubItemIndex}" style="text-align:center; padding:10px 0;">
                    <p style="margin:0 0 18px 0; font-weight:bold; color:#0f172a; font-size:24px;">${englishText}</p>
                    <div style="display:flex; flex-direction:column; gap:16px; align-items:center;">
                        <div class="jumble-answer-slot">
                            ${slotWords.map(w => `<span class="interactive-tile jumble-word-tile">${w}</span>`).join('')}
                        </div>
                        <div class="jumble-word-bank" style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center; align-items:center;">
                            ${bankWords.map(w => `<span class="interactive-tile jumble-word-tile">${w}</span>`).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        else if (actType === 'nospaces') {
            const punctuation = ['.', ',', ';', ':', '!', '?', "'"];
            let sentenceChars = targetText.split('');
            let spaceCount = 0;
            let spaceIndexCounter = 0;

            const savedResp = studentAnswersState[actType]?.[studentSubItemIndex];
            const savedRevealed = savedResp?.revealedIndices || [];
            const isExSubmitted = !!(window.studentCompletedExercises && window.studentCompletedExercises[actType]);

            let formattedSentence = sentenceChars.map((char, charIdx, arr) => {
                if (char === ' ') {
                    const prevChar = arr[charIdx - 1];
                    const nextChar = arr[charIdx + 1];
                    if (punctuation.includes(prevChar) || punctuation.includes(nextChar)) {
                        return `<span class='letter-span' data-index='${charIdx}'>&nbsp;</span>`;
                    } else {
                        const currentSpaceIdx = spaceIndexCounter++;
                        spaceCount++;
                        const isRevealed = (savedResp && savedResp.isDone) || isExSubmitted || savedRevealed.includes(currentSpaceIdx);
                        const displayStyle = isRevealed ? 'display:inline; visibility:visible;' : 'display:none;';
                        const revealedClass = isRevealed ? ' revealed-space' : '';
                        return `<span class='space-span' data-space-idx='${currentSpaceIdx}' onclick='check_nospace_click(event, this, ${studentSubItemIndex})'><span class='space-inner${revealedClass}' style='${displayStyle}'>&nbsp;</span></span>`;
                    }
                } else {
                    return `<span class='letter-span' data-index='${charIdx}' onclick='check_nospace_click(event, this, ${studentSubItemIndex})'>${char}</span>`;
                }
            }).join('');

            cardContentHTML = `
                <div class="student-item-block" data-idx="${studentSubItemIndex}" data-wrong-clicks="${savedResp?.mistakes || 0}" style="text-align:center; padding:10px 0;">
                    <div style="display:flex; justify-content:center; align-items:center; gap:15px; margin-bottom:16px;">
                        <p style="margin:0; font-weight:bold; color:#0f172a; font-size:24px;">${englishText}</p>
                        <span class="space-counter-badge" style="font-size:15px; font-weight:bold; color:#2563eb;">(${spaceCount} space${spaceCount === 1 ? '' : 's'} remaining)</span>
                    </div>
                    <div class="no-spaces-interactive-line">
                        ${formattedSentence}
                    </div>
                </div>
            `;
        }
        else if (actType === 'vowels' || actType === 'cons') {
            const isVowels = (actType === 'vowels');
            const regex = isVowels ? VOWELS_REGEX : CONSONANTS_REGEX;
            const savedResp = studentAnswersState[actType]?.[studentSubItemIndex];
            const savedLetters = savedResp?.letterValues || [];
            let boxIdx = 0;
            const words = targetText.split(' ');
            let lettersHTML = '';

            words.forEach((word, wIdx) => {
                for (let i = 0; i < word.length; i++) {
                    const char = word[i];
                    if (regex.test(char)) {
                        const prevChar = savedLetters[boxIdx] || '';
                        const statusClass = prevChar
                            ? (prevChar.toLowerCase() === char.toLowerCase() ? ' correct-input' : ' wrong-input')
                            : '';
                        lettersHTML += `<input type="text" class="letter-box ${isVowels ? 'vowel-input' : 'cons-input'}${statusClass}" maxlength="1" value="${prevChar.replace(/"/g, '&quot;')}" data-correct="${char.toLowerCase()}" data-item="${studentSubItemIndex}">`;
                        boxIdx++;
                    } else {
                        lettersHTML += `<span style="font-weight:600;">${char}</span>`;
                    }
                }
                if (wIdx < words.length - 1) {
                    lettersHTML += `<span style="display:inline-block; width: 18px;"></span>`;
                }
            });

            cardContentHTML = `
                <div class="student-item-block" data-idx="${studentSubItemIndex}" style="text-align:center; padding:10px 0;">
                    <p style="margin:0 0 18px 0; font-weight:bold; color:#0f172a; font-size:24px;">${englishText}</p>
                    <div style="font-size:26px; line-height:2.2; justify-content:center; display:flex; flex-wrap:wrap; align-items:center;">
                        ${lettersHTML}
                    </div>
                </div>
            `;
        }
        else if (actType === 'gap-en' || actType === 'gap-t') {
            const isTarget = (actType === 'gap-t');
            let fullSentence = isTarget ? targetText : englishText;
            const promptLabel = isTarget ? englishText : targetText;
            let { fullMatch, cleanGap } = extractGapWord(fullSentence);

            let displaySentence = fullSentence;
            if (fullMatch && cleanGap) {
                const inputHtml = `<input type="text" class="gap-inline-input" data-correct="${cleanGap.replace(/"/g, '&quot;')}" value="${savedVal !== '(Empty)' ? savedVal : ''}" style="padding:4px 8px; border:2px solid #cbd5e1; border-radius:6px; font-weight:bold; font-size:22px; width:160px; margin:0 4px; text-align:center;">`;
                displaySentence = displaySentence.replace(fullMatch, inputHtml);
            }

            cardContentHTML = `
                <div class="student-item-block" data-idx="${studentSubItemIndex}" style="text-align:center; padding:10px 0;">
                    <p style="margin:0 0 16px 0; font-weight:bold; color:#64748b; font-size:18px;">Prompt: ${promptLabel}</p>
                    <div style="font-size:26px; font-weight:bold; color:#0f172a; line-height:1.6;">
                        ${displaySentence}
                    </div>
                </div>
            `;
        }
        else { // faulty, trans-en, trans-target
            let promptText = '';
            let answerRef = '';

            if (actType === 'faulty') {
                const faultyText = currentSent.faultyTr || getOrGenerateFaultyTr(currentSent);
                promptText = `<span style="font-size:24px; font-weight:bold; color:#0f172a;">${targetText}</span><br><span style="color:#b91c1c; font-weight:600; font-size:16px;">Faulty English: "${faultyText}"</span>`;
                answerRef = englishText;
            } else if (actType === 'trans-en') {
                promptText = `<span style="font-size:24px; font-weight:bold; color:#0f172a;">${targetText}</span>`;
                answerRef = englishText;
            } else if (actType === 'trans-target') {
                promptText = `<span style="font-size:24px; font-weight:bold; color:#0f172a;">${englishText}</span>`;
                answerRef = targetText;
            }

            cardContentHTML = `
                <div class="student-item-block" data-idx="${studentSubItemIndex}" data-correct="${answerRef.replace(/"/g, '&quot;')}" style="text-align:center; padding:10px 0;">
                    <div style="margin-bottom:20px;">${promptText}</div>
                    <input type="text" class="full-typing-input" value="${savedVal !== '(Empty)' ? savedVal : ''}" placeholder="Type answer here..." style="width:80%; max-width:500px; padding:10px 14px; border:2px solid #cbd5e1; border-radius:8px; font-size:20px; text-align:center; box-sizing:border-box;">
                </div>
            `;
        }

        // --- RENDER 1-BY-1 ITEM CONTROLS BAR ---
        let controlsHTML = '';
        if (window.isTeacherPreview) {
            const isFirstItem = (studentSubItemIndex <= 0);
            const isLastPreviewItem = (studentSubItemIndex >= sents.length - 1);
            controlsHTML = `
                <div id="one-by-one-controls" style="display:flex; justify-content:center; align-items:center; margin-top:20px; padding-top:15px; border-top:1px solid #e2e8f0; gap:16px;">
                    <button type="button" onclick="navigateOneByOneItem(-1)" class="btn-purple" ${isFirstItem ? 'disabled' : ''} style="padding:6px 16px; font-size:18px; font-weight:bold; margin:0; ${isFirstItem ? 'opacity:0.4; cursor:not-allowed;' : ''}" title="Previous Sentence">&lt;</button>
                    <span style="font-weight:bold; color:#475569; font-size:15px; min-width:130px; text-align:center;">
                        Sentence ${studentSubItemIndex + 1} of ${sents.length}
                    </span>
                    <button type="button" onclick="navigateOneByOneItem(1)" class="btn-purple" ${isLastPreviewItem ? 'disabled' : ''} style="padding:6px 16px; font-size:18px; font-weight:bold; margin:0; ${isLastPreviewItem ? 'opacity:0.4; cursor:not-allowed;' : ''}" title="Next Sentence">&gt;</button>
                </div>
            `;
        } else {
            const isLastItem = (studentSubItemIndex >= sents.length - 1);
            const submitBtnText = isLastItem ? '💾 Submit Exercise' : 'Next Sentence ➡️';
            const submitBtnBg = isLastItem ? '#10b981' : '#2563eb';
            const submitBtnAction = isLastItem ? 'submitCurrentExercise()' : 'navigateOneByOneItem(1)';

            controlsHTML = `
                <div id="one-by-one-controls" style="display:flex; justify-content:space-between; align-items:center; margin-top:20px; padding-top:15px; border-top:1px solid #e2e8f0; gap:10px;">
                    <span style="font-weight:bold; color:#64748b; font-size:14px;">
                        Sentence ${studentSubItemIndex + 1} of ${sents.length}
                    </span>
                    <button type="button" id="one-by-one-submit-btn" onclick="${submitBtnAction}" class="btn-purple" style="display:none; padding:8px 20px; font-size:15px; background:${submitBtnBg}; margin:0;">
                        ${submitBtnText}
                    </button>
                </div>
            `;
        }

        area.innerHTML = cardContentHTML + controlsHTML;

        // --- POST-RENDER EVENT BINDINGS ---
        const isAlreadySubmitted = !!(window.studentCompletedExercises && window.studentCompletedExercises[actType]);

        if (actType === 'delayed-dictation' || actType === 'delayed-copying') {
            if (isAlreadySubmitted && !window.isTeacherPreview) {
                const stageId = actType === 'delayed-dictation' ? 'dd-student-stage' : 'dc-student-stage';
                const gapObj = makeStudentGapHTML(targetText, studentSubItemIndex, actType, savedVal);
                const stageEl = document.getElementById(stageId);
                if (stageEl) {
                    stageEl.innerHTML = `<div style="font-size:22px; font-weight:bold; color:#1e293b; padding:15px 0;">${gapObj.html}</div>`;
                }
            } else if (actType === 'delayed-dictation') {
                runStudentDelayedDictation(targetText, studentSubItemIndex);
            } else {
                runStudentDelayedCopying(targetText, studentSubItemIndex);
            }
        }
        else if (actType === 'nospaces') {
            const block = area.querySelector('.student-item-block');
            updateNoSpaceCounter(block);
        }
        else if (actType === 'vowels' || actType === 'cons') {
            setupAutoAdvanceInputs(area, actType === 'vowels' ? '.vowel-input' : '.cons-input');
        }
        else if (actType === 'jumbled') {
            const bank = area.querySelector('.jumble-word-bank');
            const slot = area.querySelector('.jumble-answer-slot');
            if (bank && slot) {
                area.querySelectorAll('.jumble-word-tile').forEach(tile => {
                    tile.onclick = function() {
                        if (this.parentElement === bank) {
                            slot.appendChild(this);
                        } else {
                            bank.appendChild(this);
                        }
                        saveStudentCurrentExerciseResponses();
                        checkOneByOneItemCompletion();
                    };
                });
            }
        }

        area.querySelectorAll('.full-typing-input, .gap-inline-input').forEach(inp => {
            inp.oninput = function() {
                saveStudentCurrentExerciseResponses();
                checkOneByOneItemCompletion();
            };
            inp.onkeydown = function(e) {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const submitBtn = document.getElementById('one-by-one-submit-btn');
                    if (submitBtn && submitBtn.style.display !== 'none') {
                        submitBtn.click();
                    }
                }
            };
        });

        checkOneByOneItemCompletion();

        // Automatically place cursor in the input box for typing & letter-box questions
        const isExLocked = !!(window.studentCompletedExercises && window.studentCompletedExercises[actType]);
        if (!isExLocked) {
            setTimeout(() => {
                const typingInput = area.querySelector('.full-typing-input, .gap-inline-input');
                if (typingInput) {
                    typingInput.focus();
                    const len = typingInput.value.length;
                    if (typeof typingInput.setSelectionRange === 'function') {
                        typingInput.setSelectionRange(len, len);
                    }
                    activeInputForVK = typingInput;
                    return;
                }
                const letterBoxes = Array.from(area.querySelectorAll('.letter-box'));
                if (letterBoxes.length > 0) {
                    const targetBox = letterBoxes.find(b => !b.value) || letterBoxes[0];
                    targetBox.focus();
                    activeInputForVK = targetBox;
                }
            }, 20);
        } else if (!window.isTeacherPreview) {
            lockCurrentExerciseUI();
        }
    }

    // Always synchronize bottom navigation buttons whenever an exercise renders
    checkExerciseCompletion();
}

function navigateOneByOneItem(direction) {
    if (!window.isTeacherPreview && direction < 0) return;
    clearStudentOneByOneTimers();

    // Save student answer for the current item before moving
    saveStudentCurrentExerciseResponses();

    const actType = studentExerciseTypes[studentCurrentExIndex];
    const sents = currentStudentAssignment.sentencesPerActivity[actType] || [];

    studentSubItemIndex += direction;
    if (studentSubItemIndex < 0) studentSubItemIndex = 0;
    if (studentSubItemIndex >= sents.length) studentSubItemIndex = sents.length - 1;

    saveDraftProgress({ immediate: false });
    renderCurrentStudentExercise();
}

function runStudentDelayedDictation(targetText, itemIdx) {
    const existingInp = document.querySelector('#dd-student-stage .gap-inline-input');
    const preservedVal = existingInp ? existingInp.value : '';

    clearStudentOneByOneTimers();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const stageEl = document.getElementById('dd-student-stage');
    if (!stageEl) return;

    const actType = 'delayed-dictation';
    const savedVal = preservedVal || (
        (studentAnswersState[actType]?.[itemIdx]?.studentAnswer !== '(Empty)')
            ? (studentAnswersState[actType]?.[itemIdx]?.studentAnswer || '')
            : ''
    );
    const safeTarget = targetText.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    stageEl.innerHTML = `
        <div style="text-align:center; padding:15px 0;">
            <div id="dd-status-text" style="font-size:22px; font-weight:bold; color:#8b5cf6; margin-bottom:15px;">
                🎧 Listening to audio...
            </div>
        </div>
    `;

    // Stage 1: Play TTS Audio
    speakTL(targetText, () => {
        // Stage 2: 3-Second Memory Delay
        let count = 3;
        const statusText = document.getElementById('dd-status-text');
        if (statusText) statusText.innerHTML = `🧠 Memorise! <span style="font-size:28px; color:#d97706;">${count}</span>s`;

        const timer = setInterval(() => {
            count--;
            if (count > 0) {
                if (statusText) statusText.innerHTML = `🧠 Memorise! <span style="font-size:28px; color:#d97706;">${count}</span>s`;
            } else {
                clearStudentOneByOneTimers();
                // Stage 3: Display TL sentence with missing word input box (re-attempt hidden for 15s)
                const gapObj = makeStudentGapHTML(targetText, itemIdx, 'delayed-dictation', savedVal);
                if (statusText) {
                    statusText.style.color = '#1e293b';
                    statusText.innerHTML = `
                        <div style="margin-bottom:15px;">${gapObj.html}</div>
                        <button type="button" id="dd-reattempt-btn" onclick="runStudentDelayedDictation('${safeTarget}', ${itemIdx})" class="btn-outline" style="display:none; font-size:13px; margin-top:10px;">🔁 Try Again</button>
                    `;
                }

                const revealTimer = setTimeout(() => {
                    const reBtn = document.getElementById('dd-reattempt-btn');
                    if (reBtn) reBtn.style.display = 'inline-block';
                }, 15000);
                studentOneByOneTimers.push(revealTimer);

                const inp = statusText ? statusText.querySelector('.gap-inline-input') : null;
                if (inp) {
                    setTimeout(() => {
                        inp.focus();
                        activeInputForVK = inp;
                    }, 20);
                    updateOneByOneSubmitVisibility(inp);
                    inp.addEventListener('input', () => {
                        saveStudentCurrentExerciseResponses();
                        checkExerciseCompletion();
                        updateOneByOneSubmitVisibility(inp);
                    });
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            if (!inp.value.trim()) return;
                            const sents = currentStudentAssignment.sentencesPerActivity[actType] || [];
                            const isLast = (itemIdx === sents.length - 1);
                            if (!isLast) {
                                navigateOneByOneItem(1);
                            } else {
                                submitCurrentExercise();
                            }
                        }
                    });
                }

                if (window.studentCompletedExercises && window.studentCompletedExercises[actType] && !window.isTeacherPreview) {
                    lockCurrentExerciseUI();
                }
            }
        }, 1000);
        studentOneByOneTimers.push(timer);
    });
}

function runStudentDelayedCopying(targetText, itemIdx) {
    const existingInp = document.querySelector('#dc-student-stage .gap-inline-input');
    const preservedVal = existingInp ? existingInp.value : '';

    clearStudentOneByOneTimers();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();

    const stageEl = document.getElementById('dc-student-stage');
    if (!stageEl) return;

    const actType = 'delayed-copying';
    const savedVal = preservedVal || (
        (studentAnswersState[actType]?.[itemIdx]?.studentAnswer !== '(Empty)')
            ? (studentAnswersState[actType]?.[itemIdx]?.studentAnswer || '')
            : ''
    );
    const safeTarget = targetText.replace(/'/g, "\\'").replace(/"/g, '&quot;');

    // Stage 1: Display TL Sentence for 7 seconds
    let phase1Count = 7;
    stageEl.innerHTML = `
        <div style="text-align:center; padding:15px 0;">
            <div id="dc-timer-badge" style="font-size:16px; font-weight:bold; color:#8b5cf6; margin-bottom:12px; background:#f3e8ff; display:inline-block; padding:6px 16px; border-radius:20px;">
                ⏳ Disappearing in: <span id="dc-sec" style="font-size:20px;">${phase1Count}</span>s
            </div>
            <div id="dc-display-text" style="font-size:24px; font-weight:bold; color:#1e293b; margin-top:10px;">
                ${targetText}
            </div>
        </div>
    `;

    const timer1 = setInterval(() => {
        phase1Count--;
        const secSpan = document.getElementById('dc-sec');
        if (phase1Count > 0) {
            if (secSpan) secSpan.innerText = phase1Count;
        } else {
            clearStudentOneByOneTimers();

            // Stage 2: 3-Second Memory Delay
            let phase2Count = 3;
            const container = document.getElementById('dc-student-stage');
            if (container) {
                container.innerHTML = `
                    <div style="text-align:center; padding:15px 0;">
                        <div id="dc-status-text" style="font-size:24px; font-weight:bold; color:#8b5cf6;">
                            🧠 Memorise! <span style="font-size:28px; color:#d97706;">${phase2Count}</span>s
                        </div>
                    </div>
                `;
            }

            const timer2 = setInterval(() => {
                phase2Count--;
                const statusText = document.getElementById('dc-status-text');
                if (phase2Count > 0) {
                    if (statusText) statusText.innerHTML = `🧠 Memorise! <span style="font-size:28px; color:#d97706;">${phase2Count}</span>s`;
                } else {
                    clearStudentOneByOneTimers();
                    // Stage 3: Display TL sentence with missing word input box (re-attempt hidden for 15s)
                    const gapObj = makeStudentGapHTML(targetText, itemIdx, 'delayed-copying', savedVal);
                    if (container) {
                        container.innerHTML = `
                            <div style="text-align:center; padding:15px 0;">
                                <div style="font-size:22px; font-weight:bold; color:#1e293b; margin-bottom:15px;">${gapObj.html}</div>
                                <button type="button" id="dc-reattempt-btn" onclick="runStudentDelayedCopying('${safeTarget}', ${itemIdx})" class="btn-outline" style="display:none; font-size:13px; margin-top:10px;">🔁 Try Again</button>
                            </div>
                        `;
                    }

                    const revealTimer = setTimeout(() => {
                        const reBtn = document.getElementById('dc-reattempt-btn');
                        if (reBtn) reBtn.style.display = 'inline-block';
                    }, 15000);
                    studentOneByOneTimers.push(revealTimer);

                    const inp = container ? container.querySelector('.gap-inline-input') : null;
                    if (inp) {
                        setTimeout(() => {
                            inp.focus();
                            activeInputForVK = inp;
                        }, 20);
                        updateOneByOneSubmitVisibility(inp);
                        inp.addEventListener('input', () => {
                            saveStudentCurrentExerciseResponses();
                            checkExerciseCompletion();
                            updateOneByOneSubmitVisibility(inp);
                        });
                        inp.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (!inp.value.trim()) return;
                                const sents = currentStudentAssignment.sentencesPerActivity[actType] || [];
                                const isLast = (itemIdx === sents.length - 1);
                                if (!isLast) {
                                    navigateOneByOneItem(1);
                                } else {
                                    submitCurrentExercise();
                                }
                            }
                        });
                    }
                }
            }, 1000);
            studentOneByOneTimers.push(timer2);
        }
    }, 1000);
    studentOneByOneTimers.push(timer1);
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
            if (spaceInner && (spaceInner.style.display === 'none' || spaceInner.style.visibility === 'hidden' || !spaceInner.classList.contains('revealed-space'))) {
                spaceInner.style.display = 'inline';
                spaceInner.style.visibility = 'visible';
                spaceInner.classList.add('revealed-space');
                isCorrectClick = true;
            }
        }
    };

    if (element.classList.contains('space-span')) {
        checkAdjacent(element);
    } else {
        checkAdjacent(element.previousElementSibling);
        checkAdjacent(element.nextElementSibling);
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
    saveStudentCurrentExerciseResponses();
    checkOneByOneItemCompletion();
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
            
            targetEl.dataset.wrongAttempts = parseInt(targetEl.dataset.wrongAttempts || "0", 10) + 1;
            engEl.dataset.wrongAttempts = parseInt(engEl.dataset.wrongAttempts || "0", 10) + 1;

            setTimeout(() => {
                targetEl?.classList.remove('wrong-match', 'selected');
                engEl?.classList.remove('wrong-match', 'selected');
            }, 800);
        }

        targetEl.classList.remove('selected');
        engEl.classList.remove('selected');
        state.selectedTarget = null;
        state.selectedEng = null;

        saveStudentCurrentExerciseResponses();
        checkExerciseCompletion();
    }
}

function setupAutoAdvanceInputs(area, selector) {
    const inputs = Array.from(area.querySelectorAll(selector));
    inputs.forEach((input, idx) => {
        input.oninput = function() {
            const correctChar = this.dataset.correct;
            const val = this.value.toLowerCase();
            const block = this.closest('.student-item-block');

            if (val === correctChar) {
                this.classList.add('correct-input');
                this.classList.remove('wrong-input');
                if (idx < inputs.length - 1) inputs[idx + 1].focus();
            } else if (val.length > 0) {
                this.classList.add('wrong-input');
                this.classList.remove('correct-input');
                if (block) {
                    block.dataset.wrongEntries = parseInt(block.dataset.wrongEntries || "0", 10) + 1;
                }
            } else {
                this.classList.remove('correct-input', 'wrong-input');
            }
            saveStudentCurrentExerciseResponses();
            checkExerciseCompletion();
            checkOneByOneItemCompletion();
        };

        input.onkeydown = function(e) {
            if (e.key === 'Backspace' && this.value === '' && idx > 0) {
                inputs[idx - 1].focus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const submitBtn = document.getElementById('one-by-one-submit-btn');
                if (submitBtn && submitBtn.style.display !== 'none') {
                    submitBtn.click();
                }
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

    const ratio = matchedCount / Math.max(ansWords.length, correctWords.length);

    if (ratio >= 0.50) {
        return { points: 0.5, isCorrect: false };
    }

    return { points: 0, isCorrect: false };
}

function saveStudentCurrentExerciseResponses() {
    const actType = studentExerciseTypes[studentCurrentExIndex];
    const sents = (currentStudentAssignment && currentStudentAssignment.sentencesPerActivity) 
        ? (currentStudentAssignment.sentencesPerActivity[actType] || []) 
        : [];
    if (sents.length === 0) return;

    const area = document.getElementById('exercise-interactive-area');
    if (!area) return;

    if (!studentAnswersState[actType]) {
        studentAnswersState[actType] = [];
    }

    const responses = studentAnswersState[actType];
    while (responses.length < sents.length) {
        responses.push({ prompt: '', studentAnswer: '(Empty)', correctAnswer: '', isCorrect: false, points: 0 });
    }

    // --- MATCH UP ACTIVITY ---
    if (actType === 'match') {
        sents.forEach((s, idx) => {
            const tile = area.querySelector(`.match-t-tile[data-id="${idx}"]`);
            const isDone = tile && tile.classList.contains('correct-match');
            const wrongAttempts = parseInt(tile?.dataset.wrongAttempts || "0", 10);
            
            let points = 0;
            if (isDone) {
                points = (wrongAttempts === 0) ? 1.0 : 0.5;
            }

            responses[idx] = {
                prompt: s.t,
                studentAnswer: isDone ? s.tr : '(Unmatched)',
                correctAnswer: s.tr,
                isCorrect: points === 1.0,
                points: points,
                mistakes: wrongAttempts,
                isDone: isDone
            };
        });
    } 
    // --- JUMBLED ACTIVITY ---
    else if (actType === 'jumbled') {
        const block = area.querySelector('.student-item-block');
        if (block) {
            const slot = block.querySelector('.jumble-answer-slot');
            const bank = block.querySelector('.jumble-word-bank');
            const studentText = slot ? Array.from(slot.querySelectorAll('.jumble-word-tile')).map(t => t.innerText).join(' ').trim() : '';
            const wrongAttempts = parseInt(block.dataset.wrongAttempts || "0", 10);
            const isExactMatch = (normalizeString(studentText) === normalizeString(sents[studentSubItemIndex]?.t || ''));
            const isDone = !!(bank && bank.children.length === 0);

            let points = 0;
            if (isExactMatch) {
                points = (wrongAttempts === 0) ? 1.0 : 0.5;
            }

            responses[studentSubItemIndex] = {
                prompt: sents[studentSubItemIndex]?.tr || '',
                studentAnswer: studentText || '(Empty)',
                correctAnswer: sents[studentSubItemIndex]?.t || '',
                isCorrect: points === 1.0,
                points: points,
                mistakes: wrongAttempts,
                isDone: isDone
            };
        }
    } 
    // --- NO SPACES ACTIVITY ---
    else if (actType === 'nospaces') {
        const block = area.querySelector('.student-item-block');
        const s = sents[studentSubItemIndex];
        if (block && s) {
            const unrevealed = block.querySelectorAll('.space-inner:not(.revealed-space)');
            const revealedSpans = block.querySelectorAll('.space-span');
            const revealedIndices = [];
            revealedSpans.forEach(span => {
                const inner = span.querySelector('.space-inner');
                if (inner && inner.classList.contains('revealed-space')) {
                    const idx = parseInt(span.dataset.spaceIdx, 10);
                    if (!isNaN(idx)) revealedIndices.push(idx);
                }
            });

            const wrongClicks = parseInt(block.dataset.wrongClicks || "0", 10);
            const isDone = (unrevealed.length === 0);

            let points = 0;
            if (isDone) {
                points = (wrongClicks === 0) ? 1.0 : 0.5;
            }

            responses[studentSubItemIndex] = {
                prompt: s.tr,
                studentAnswer: isDone ? s.t : `(Incomplete - ${unrevealed.length} gaps left)`,
                correctAnswer: s.t,
                isCorrect: points === 1.0,
                points: points,
                mistakes: wrongClicks,
                isDone: isDone,
                revealedIndices: revealedIndices
            };
        }
    }
    // --- VOWELS / CONSONANTS ACTIVITY ---
    else if (actType === 'vowels' || actType === 'cons') {
        const block = area.querySelector('.student-item-block');
        const s = sents[studentSubItemIndex];
        if (block && s) {
            const boxes = Array.from(block.querySelectorAll('.letter-box'));
            const letterValues = boxes.map(b => b.value || '');
            const wrongEntries = parseInt(block.dataset.wrongEntries || "0", 10);
            const allCorrect = boxes.length > 0 && boxes.every(b => b.classList.contains('correct-input'));

            let points = 0;
            if (allCorrect) {
                points = (wrongEntries === 0) ? 1.0 : 0.5;
            }

            responses[studentSubItemIndex] = {
                prompt: s.tr,
                studentAnswer: allCorrect ? s.t : (letterValues.some(v => v !== '') ? letterValues.join('') : '(Incomplete/Incorrect letters)'),
                correctAnswer: s.t,
                isCorrect: points === 1.0,
                points: points,
                mistakes: wrongEntries,
                letterValues: letterValues
            };
        }
    } 
    // --- DICTATION / LISTENING ACTIVITIES ---
    else if (['listen-trad', 'listen-dictation', 'delayed-dictation', 'delayed-copying'].includes(actType)) {
        const s = sents[studentSubItemIndex];
        if (s) {
            const isTarget = (actType !== 'listen-trad');
            const fullText = isTarget ? s.t : cleanEnglishText(s.tr);
            const currentInput = area.querySelector('.gap-inline-input');
            
            let ans = currentInput ? currentInput.value.trim() : '';
            let correct = currentInput ? (currentInput.dataset.correct || '') : makeStudentGapHTML(fullText, studentSubItemIndex, actType).cleanGap;

            if (!currentInput && responses[studentSubItemIndex] && responses[studentSubItemIndex].studentAnswer !== '(Empty)') {
                ans = responses[studentSubItemIndex].studentAnswer;
            }

            const isMatch = (normalizeString(ans) === normalizeString(correct));
            const points = isMatch ? 1.0 : 0.0;

            responses[studentSubItemIndex] = {
                prompt: isTarget ? s.tr : s.t,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || fullText,
                isCorrect: points === 1.0,
                points: points
            };
        }
    } 
    // --- GAP FILL ACTIVITIES ---
    else if (actType === 'gap-en' || actType === 'gap-t') {
        const s = sents[studentSubItemIndex];
        if (s) {
            const input = area.querySelector('.gap-inline-input');
            const ans = input ? input.value.trim() : '';
            const correct = input ? input.dataset.correct : '';
            const wrongAttempts = parseInt(input?.dataset.wrongAttempts || "0", 10);
            
            const isMatch = (normalizeString(ans) === normalizeString(correct));
            let points = 0;
            if (isMatch) {
                points = (wrongAttempts === 0) ? 1.0 : 0.5;
            }

            responses[studentSubItemIndex] = {
                prompt: s.t,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No gap set)',
                isCorrect: points === 1.0,
                points: points,
                mistakes: wrongAttempts
            };
        }
    } 
    // --- FAULTY SENTENCE CORRECTION ---
    else if (actType === 'faulty') {
        const s = sents[studentSubItemIndex];
        if (s) {
            const input = area.querySelector('.full-typing-input');
            const ans = input ? input.value.trim() : '';
            const correct = (s.tr || '').trim();

            const evalResult = evaluateTextSimilarity(ans, correct);

            responses[studentSubItemIndex] = {
                prompt: `Correct English for: "${s.t}" (Faulty was: "${s.faultyTr || getOrGenerateFaultyTr(s)}")`,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No markscheme translation set)',
                isCorrect: evalResult.points === 1,
                points: evalResult.points
            };
        }
    } 
    // --- STANDARD TYPING TRANSLATIONS ---
    else {
        const s = sents[studentSubItemIndex];
        if (s) {
            const input = area.querySelector('.full-typing-input');
            const ans = input ? input.value.trim() : '';
            const cardContainer = area.querySelector('[data-correct]');
            const correct = (cardContainer ? cardContainer.dataset.correct : (s.tr || s.t || '')).trim();

            const evalResult = evaluateTextSimilarity(ans, correct);

            responses[studentSubItemIndex] = {
                prompt: s.t || s.tr,
                studentAnswer: ans || '(Empty)',
                correctAnswer: correct || '(No markscheme translation set)',
                isCorrect: evalResult.points === 1,
                points: evalResult.points
            };
        }
    }

    // Save full payload immediately to localStorage and debounce Firestore sync (1.5s)
    saveDraftProgress({ immediate: false });
}

function nextStudentExercise() {
    if (!window.isTeacherPreview) {
        const actType = studentExerciseTypes[studentCurrentExIndex];
        if (!window.studentCompletedExercises || !window.studentCompletedExercises[actType]) {
            return;
        }
    }
    saveStudentCurrentExerciseResponses();
    saveDraftProgress();
    if (studentCurrentExIndex < studentExerciseTypes.length - 1) {
        studentCurrentExIndex++;
        studentSubItemIndex = 0;
        renderCurrentStudentExercise();
    }
}

function prevStudentExercise() {
    saveStudentCurrentExerciseResponses();
    saveDraftProgress();
    if (studentCurrentExIndex > 0) {
        studentCurrentExIndex--;
        studentSubItemIndex = 0;
        renderCurrentStudentExercise();
    }
}

function normalizeString(str) {
    return (str || "").toString().toLowerCase().trim().replace(/[.,!?;:'"«»()]/g, '').replace(/\s+/g, ' ');
}

async function submitStudentWork() {
    if (window.isTeacherPreview) {
        alert("👁️ Teacher Preview complete! Returning to Submissions.");
        exitTeacherPreview();
        return;
    }
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

        // Cancel any queued 1.5s auto-save BEFORE deleting so it doesn't recreate the draft
        cancelPendingDraftSave();

        const draftId = getStudentDraftKey(currentStudentAssignment.id);
        if (draftId) {
            localStorage.removeItem(`student_draft_${draftId}`);
            localStorage.removeItem(`draft_${currentStudentAssignment.id}`);
            await db.collection("drafts").doc(draftId).delete().catch(e => {
                console.warn("Draft cleanup failed:", e);
            });
        }

        window.studentCompletedExercises = {};
        studentAnswersState = {};

        alert("🎉 Activity Submitted Successfully!\nYour work has been submitted to your teacher for review.");
        renderStudentPendingReviewCard(subData);
    } catch (err) {
        console.error("Submission failed:", err);
        alert("❌ Failed to save submission to database: " + err.message + "\nPlease check your Firestore database rules.");
    }
}
