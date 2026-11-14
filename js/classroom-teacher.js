/* =========================
   TEACHER PREVIEW & ASSIGNMENT ACTIONS
========================= */
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
    editingAssignmentId = null;

    await setupAssignmentBuilderContext(assign);

    const clonedSentencesMap = assign.sentencesPerActivity ? JSON.parse(JSON.stringify(assign.sentencesPerActivity)) : null;
    window.duplicatingAssignmentLang = assign.lang || null;

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
        {id:'trans-target', label:`Translate (${currentLang})`},
        {id:'listen-trad', label:'🎧 Listen / Translate'},
        {id:'listen-dictation', label:'🎧 Listening Dictation'},
        {id:'delayed-dictation', label:'🎧 Delayed Dictation'},
        {id:'delayed-copying', label:'Delayed Copying'}
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
    if (clonedSentencesMap) {
        for (let actKey in clonedSentencesMap) {
            if (actKey !== 'study' && clonedSentencesMap[actKey].length > 0) {
                detectedCount = clonedSentencesMap[actKey].length;
                break;
            }
        }
    }
    const sentCountSelect = document.getElementById('sentence-count');
    if (sentCountSelect) sentCountSelect.value = String(detectedCount);

    if (clonedSentencesMap && clonedSentencesMap['study']) {
        const tableCountSelect = document.getElementById('table-sentence-count');
        if (tableCountSelect) tableCountSelect.value = String(clonedSentencesMap['study'].length);
    }

    renderPerActivitySentenceBoxes(clonedSentencesMap);

    document.getElementById('activity-menu').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';

    await openClassroomPublishSection();
    
    document.getElementById('gc-due-date').value = '';
    document.getElementById('gc-schedule-date').value = '';

    const gcBtn = document.getElementById('gc-publish-btn');
    if (gcBtn) gcBtn.innerText = "📋 Duplicate & Publish";
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

    await setupAssignmentBuilderContext(assign);

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
        {id:'trans-target', label:`Translate (${currentLang})`},
        {id:'listen-trad', label:'🎧 Listen / Translate'},
        {id:'listen-dictation', label:'🎧 Listening Dictation'},
        {id:'delayed-dictation', label:'🎧 Delayed Dictation'},
        {id:'delayed-copying', label:'Delayed Copying'}
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

    document.getElementById('activity-menu').style.display = 'flex';
    document.getElementById('overlay').style.display = 'block';

    await openClassroomPublishSection();

    if (assign.courseId) {
        document.getElementById('gc-course-select').value = assign.courseId;
        await loadCourseTopics(assign.courseId);
        if (assign.topicId) {
            document.getElementById('gc-topic-select').value = assign.topicId;
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

async function deleteCurrentAssignment() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");
    if (!confirm("Are you sure you want to delete this assignment and all linked student submissions and drafts?")) return;

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

        // 1. Query all submissions and drafts linked to this assignment
        const [submissionsSnap, draftsSnap] = await Promise.all([
            db.collection("submissions").where("assignmentId", "==", assignmentId).get(),
            db.collection("drafts").where("assignmentId", "==", assignmentId).get()
        ]);

        // 2. Collect all document references (assignment + submissions + drafts)
        const refsToDelete = [
            db.collection("assignments").doc(assignmentId),
            ...submissionsSnap.docs.map(d => d.ref),
            ...draftsSnap.docs.map(d => d.ref)
        ];

        // 3. Delete in batches (Firestore caps batches at 500 operations)
        for (let i = 0; i < refsToDelete.length; i += 450) {
            const batch = db.batch();
            refsToDelete.slice(i, i + 450).forEach(ref => batch.delete(ref));
            await batch.commit();
        }

        alert("Assignment, submissions, and drafts deleted successfully!");

        document.getElementById('active-assignment-info').style.display = 'none';
        const courseId = document.getElementById('sub-filter-course').value;
        loadCourseAssignments(courseId);
    } catch (e) {
        console.error("Error deleting assignment:", e);
        alert("Error deleting assignment: " + e.message);
    }
}

async function syncAllClassroomGrades() {
    const assignmentId = document.getElementById('sub-filter-assignment').value;
    if (!assignmentId) return alert("Select an assignment first.");

    const syncBtn = document.getElementById('sync-all-classroom-grades-btn');
    const originalBtnText = syncBtn ? syncBtn.innerHTML : '🔄 Sync Grades to Classroom';

    try {
        if (syncBtn) {
            syncBtn.disabled = true;
            syncBtn.innerHTML = '⏳ Syncing all grades...';
        }

        const snap = await db.collection("submissions").where("assignmentId", "==", assignmentId).get();
        if (snap.empty) return alert("No student submissions found to sync.");

        // Pre-fetch assignment details and Classroom roster once for the whole class
        const assignDoc = await db.collection("assignments").doc(assignmentId).get();
        const assign = assignDoc.exists ? assignDoc.data() : null;

        let rosterStudents = null;
        if (assign && assign.courseId && assign.gClassroomAssignmentId) {
            const isLoaded = await ensureGapiClassroomLoaded();
            if (isLoaded) {
                try {
                    const rosterRes = await gapi.client.classroom.courses.students.list({
                        courseId: assign.courseId
                    });
                    rosterStudents = rosterRes.result.students || [];
                } catch (rErr) {
                    console.warn("Could not fetch course roster:", rErr);
                }
            }
        }

        let synced = 0;
        let errors = 0;
        const errorNotes = [];

        for (let doc of snap.docs) {
            const result = await saveAndSyncGrade(doc.id, {
                silent: true,
                preloadedAssign: assign,
                preloadedRoster: rosterStudents
            });

            if (result && result.success) {
                synced++;
            } else {
                errors++;
                if (result && result.message) {
                    errorNotes.push(`• ${result.message}`);
                }
                console.error(`Failed to sync submission ${doc.id}:`, result?.message);
            }
        }

        let summaryMsg = `✅ Sync finished! ${synced} grade(s) synced successfully.`;
        if (errors > 0) {
            summaryMsg += `\n⚠️ ${errors} failed/skipped:\n${errorNotes.join('\n')}`;
        }
        alert(summaryMsg);

    } catch (err) {
        console.error("Whole-class sync error:", err);
        alert("Error syncing class grades: " + (err.message || "Unknown error"));
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = originalBtnText;
        }
    }
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
                                            ${r.mistakes !== undefined ? `
                                                <span style="display:inline-block; margin-left:8px; font-size:11px; padding:2px 6px; border-radius:4px; font-weight:bold; background:${r.mistakes === 0 ? '#d1fae5' : '#fef3c7'}; color:${r.mistakes === 0 ? '#065f46' : '#92400e'};">
                                                    ${r.mistakes === 0 ? '✓' : `⚠️ ${r.mistakes} Mistake(s)`}
                                                </span>
                                            ` : ''}
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

async function saveAndSyncGrade(subId, options = {}) {
    const { silent = false, preloadedAssign = null, preloadedRoster = null } = options;

    const gradeInput = document.getElementById(`grade-${subId}`);
    const possibleInput = document.getElementById(`possible-${subId}`);
    const commentInput = document.getElementById(`comment-${subId}`);

    if (!gradeInput || !possibleInput) {
        if (!silent) alert("Grade inputs not found.");
        return { success: false, message: "Grade inputs not found" };
    }

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
        if (!subDoc.exists) {
            if (!silent) alert("Submission not found in database.");
            return { success: false, message: "Submission not found in database" };
        }
        const sub = subDoc.data();
        const studentLabel = sub.studentName || sub.studentEmail || subId;

        let assign = preloadedAssign;
        if (!assign) {
            const assignDoc = await db.collection("assignments").doc(sub.assignmentId).get();
            if (!assignDoc.exists) {
                if (!silent) alert("Grade saved locally! (Assignment record not found).");
                return { success: false, message: `${studentLabel}: Assignment record not found` };
            }
            assign = assignDoc.data();
        }

        if (!assign.courseId || !assign.gClassroomAssignmentId) {
            if (!silent) alert("Grade saved locally! (Not linked to Google Classroom).");
            return { success: false, message: `${studentLabel}: Not linked to Google Classroom` };
        }

        const isLoaded = await ensureGapiClassroomLoaded();
        if (!isLoaded) {
            if (!silent) alert("Grade saved locally! Could not connect to Google Classroom API.");
            return { success: false, message: `${studentLabel}: Could not connect to Google Classroom API` };
        }

        let studentUserId = null;
        let students = preloadedRoster;
        if (!students) {
            try {
                const rosterRes = await gapi.client.classroom.courses.students.list({
                    courseId: assign.courseId
                });
                students = rosterRes.result.students || [];
            } catch (rErr) {
                console.warn("Could not fetch course roster:", rErr);
                students = [];
            }
        }

        const found = students.find(st => st.profile && st.profile.emailAddress && st.profile.emailAddress.toLowerCase() === sub.studentEmail.toLowerCase());
        if (found) {
            studentUserId = found.userId;
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
            if (!silent) alert("Grade saved locally! Student submission not found in Google Classroom.");
            return { success: false, message: `${studentLabel}: Not found in Google Classroom` };
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

        if (!silent) {
            alert(`✅ Grade (${gradeVal}/${possibleVal}) synced to Google Classroom for ${sub.studentName}!`);
        }
        return { success: true };

    } catch (err) {
        console.error("Sync Error:", err);
        if (!silent) {
            alert("Error syncing to Google Classroom: " + (err.message || "Unknown error"));
        }
        return { success: false, message: `${subId}: ${err.message || "Unknown error"}` };
    }
}
