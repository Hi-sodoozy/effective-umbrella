(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    alert('Configure Supabase in js/supabase-config.js');
    return;
  }

  const COURSE_ID = 'meq-12';
  const WORD_LIMIT = 2000;

  const els = {
    questionList: document.getElementById('qbStudentQuestionList'),
    title: document.getElementById('studentQuestionTitle'),
    prompt: document.getElementById('studentQuestionPrompt'),

    modeRadios: Array.from(document.querySelectorAll('input[name="qbMode"]')),
    countdownControls: document.getElementById('qbCountDownControls'),
    countdownMinutes: document.getElementById('qbCountdownMinutes'),
    countdownSeconds: document.getElementById('qbCountdownSeconds'),

    display: document.getElementById('qbStopwatchDisplay'),
    meta: document.getElementById('qbStopwatchMeta'),

    startBtn: document.getElementById('qbStopwatchStartBtn'),
    pauseBtn: document.getElementById('qbStopwatchPauseBtn'),

    response: document.getElementById('qbStudentResponse'),
    wordCount: document.getElementById('qbWordCount'),
    saveError: document.getElementById('qbStudentSaveError'),
    saveBtn: document.getElementById('qbStudentSaveBtn')
  };

  let currentUser = null;

  let tags = [];
  let tagsById = {};
  let questions = [];
  let questionTagIdsByQuestionId = {};

  // { [questionId]: submissionRow }
  let submissionsByQuestionId = {};

  let selectedQuestionId = null;

  let mode = 'count_up';
  let isRunning = false;
  let intervalId = null;

  let elapsedSeconds = 0;
  let countdownStartSeconds = 0;

  let tickStartTimestamp = 0;
  let baseElapsedSeconds = 0;

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
  }

  function getQueryParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function countWords(text) {
    const clean = String(text || '').trim();
    if (!clean) return 0;
    return clean.split(/\s+/).filter(Boolean).length;
  }

  function formatClock(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    const pad = (n) => String(n).padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(sec)}`;
    return `${pad(m)}:${pad(sec)}`;
  }

  function setError(msg) {
    if (!els.saveError) return;
    els.saveError.textContent = msg || '';
    els.saveError.style.display = msg ? 'block' : 'none';
  }

  function readCountdownSecondsFromInputs() {
    const mins = Math.max(0, Number(els.countdownMinutes?.value || 0));
    const secs = Math.max(0, Number(els.countdownSeconds?.value || 0));
    return mins * 60 + secs;
  }

  function syncModeUI(nextMode) {
    mode = nextMode;
    els.modeRadios.forEach(r => {
      r.checked = r.value === nextMode;
    });
    if (nextMode === 'count_down') {
      els.countdownControls.style.display = 'block';
    } else {
      els.countdownControls.style.display = 'none';
    }
  }

  function updateWordCount() {
    const wc = countWords(els.response?.value);
    if (els.wordCount) els.wordCount.textContent = `${wc} / ${WORD_LIMIT} words`;
  }

  function stopStopwatch() {
    isRunning = false;
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    els.startBtn && (els.startBtn.disabled = false);
    els.pauseBtn && (els.pauseBtn.disabled = true);
    renderStopwatchDisplay();
  }

  function renderStopwatchDisplay() {
    if (!els.display) return;
    if (mode === 'count_up') {
      els.display.textContent = formatClock(elapsedSeconds);
      if (els.meta) els.meta.textContent = isRunning ? 'Running…' : 'Paused';
    } else {
      const remaining = countdownStartSeconds - elapsedSeconds;
      els.display.textContent = formatClock(remaining);
      if (els.meta) {
        els.meta.textContent = remaining <= 0
          ? 'Done'
          : isRunning ? 'Running…' : 'Paused';
      }
    }
  }

  function tick() {
    const now = Date.now();
    const deltaSeconds = Math.floor((now - tickStartTimestamp) / 1000);
    elapsedSeconds = baseElapsedSeconds + deltaSeconds;

    if (mode === 'count_down') {
      const remaining = countdownStartSeconds - elapsedSeconds;
      if (remaining <= 0) {
        elapsedSeconds = countdownStartSeconds;
        stopStopwatch();
        return;
      }
    }

    renderStopwatchDisplay();
  }

  function startStopwatch() {
    setError('');
    if (isRunning) return;
    // If user chose count_down and countdownStartSeconds is missing, read from inputs.
    if (mode === 'count_down' && !countdownStartSeconds) {
      countdownStartSeconds = readCountdownSecondsFromInputs();
      if (!countdownStartSeconds) countdownStartSeconds = 60;
    }

    isRunning = true;
    tickStartTimestamp = Date.now();
    baseElapsedSeconds = elapsedSeconds;
    els.startBtn && (els.startBtn.disabled = true);
    els.pauseBtn && (els.pauseBtn.disabled = false);
    intervalId = setInterval(tick, 250);
  }

  function pauseStopwatch() {
    if (!isRunning) return;
    tick(); // compute latest elapsedSeconds
    stopStopwatch();
  }

  function applySubmissionToEditor(sub) {
    const subMode = sub?.mode || 'count_up';
    const subElapsed = Number(sub?.elapsed_seconds || 0);
    const subCountdownStart = sub?.countdown_start_seconds != null ? Number(sub.countdown_start_seconds) : 0;

    syncModeUI(subMode);
    elapsedSeconds = subElapsed;

    countdownStartSeconds = subMode === 'count_down'
      ? (subCountdownStart || readCountdownSecondsFromInputs())
      : (subCountdownStart || readCountdownSecondsFromInputs());

    // Sync countdown inputs so the UI matches the saved state.
    if (els.countdownMinutes && els.countdownSeconds) {
      const mins = Math.floor(countdownStartSeconds / 60);
      const secs = countdownStartSeconds % 60;
      els.countdownMinutes.value = String(mins);
      els.countdownSeconds.value = String(secs);
    }

    if (els.response) els.response.value = sub?.response_text || '';
    updateWordCount();
    stopStopwatch();
  }

  async function requireLogin() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent('meq-question-bank-student.html');
      return null;
    }
    currentUser = user;
    return user;
  }

  async function loadTags() {
    const { data, error } = await client
      .from('question_tags')
      .select('id, tag_text')
      .eq('course_id', COURSE_ID)
      .order('tag_text');
    if (error) throw error;
    tags = data || [];
    tagsById = {};
    tags.forEach(t => { tagsById[t.id] = t; });
  }

  async function loadQuestionsAndMappings() {
    const { data: qRows, error: qErr } = await client
      .from('meq_questions')
      .select('id, course_id, prompt_text, updated_at')
      .eq('course_id', COURSE_ID)
      .order('updated_at', { ascending: false });
    if (qErr) throw qErr;

    questions = qRows || [];
    questionTagIdsByQuestionId = {};
    questions.forEach(q => { questionTagIdsByQuestionId[q.id] = []; });

    const questionIds = questions.map(q => q.id);
    if (!questionIds.length) return;

    const { data: mapRows, error: mErr } = await client
      .from('meq_question_tags')
      .select('question_id, tag_id')
      .in('question_id', questionIds);
    if (mErr) throw mErr;

    (mapRows || []).forEach(r => {
      if (!questionTagIdsByQuestionId[r.question_id]) questionTagIdsByQuestionId[r.question_id] = [];
      if (!questionTagIdsByQuestionId[r.question_id].includes(r.tag_id)) {
        questionTagIdsByQuestionId[r.question_id].push(r.tag_id);
      }
    });
  }

  async function loadSubmissions() {
    if (!currentUser) return;
    const { data, error } = await client
      .from('meq_question_submissions')
      .select('question_id, response_text, mode, elapsed_seconds, countdown_start_seconds')
      .eq('user_id', currentUser.id);
    if (error) throw error;

    submissionsByQuestionId = {};
    (data || []).forEach(sub => {
      submissionsByQuestionId[sub.question_id] = sub;
    });
  }

  function renderQuestionList() {
    if (!els.questionList) return;

    const selected = selectedQuestionId;
    els.questionList.innerHTML = questions.length
      ? questions.map(q => {
          const qTags = questionTagIdsByQuestionId[q.id] || [];
          const saved = !!submissionsByQuestionId[q.id];
          const isSelected = selected && q.id === selected;

          const tagChips = qTags.slice(0, 5).map(tagId => {
            const t = tagsById[tagId];
            return `<span class="qb-chip">#${escapeHtml(t?.tag_text || 'tag')}</span>`;
          }).join('');

          return `
            <div class="qb-question-item ${saved ? 'qb-question-item--saved' : ''}" data-question-id="${q.id}" style="${isSelected ? 'border-color: rgba(224,122,95,0.65);' : ''}">
              <div class="qb-question-snippet">
                <strong>${saved ? 'Saved' : 'New'}</strong>
                <p>${escapeHtml(q.prompt_text ? promptSnippet(q.prompt_text) : '')}</p>
                <div class="qb-chip-row">${tagChips}</div>
              </div>
            </div>
          `;
        }).join('')
      : '<p style="color: var(--ink-light);">No questions yet.</p>';

    function promptSnippet(text) {
      const t = String(text ?? '').trim();
      return t.length > 200 ? t.slice(0, 200) + '…' : t;
    }

    els.questionList.querySelectorAll('[data-question-id]').forEach(item => {
      const qid = item.getAttribute('data-question-id');
      item.addEventListener('click', () => {
        selectQuestion(qid).catch(() => {});
      });
    });
  }

  async function selectQuestion(questionId) {
    selectedQuestionId = questionId;
    const q = questions.find(x => x.id === questionId);
    if (!q) return;

    els.title && (els.title.textContent = 'Question');
    els.prompt && (els.prompt.textContent = String(q.prompt_text || ''));

    const sub = submissionsByQuestionId[questionId] || null;
    applySubmissionToEditor(sub);
    renderStopwatchDisplay();
    renderQuestionList();
    setError('');
  }

  async function saveResponse() {
    setError('');
    setSuccess('');

    if (!selectedQuestionId) {
      setError('Select a question first.');
      return;
    }

    const responseText = String(els.response?.value || '').trim();
    const wc = countWords(responseText);
    updateWordCount();

    if (wc > WORD_LIMIT) {
      setError(`Your response is ${wc} words. Please keep it under ${WORD_LIMIT}.`);
      return;
    }

    const selectedMode = mode;

    const payload = {
      user_id: currentUser.id,
      question_id: selectedQuestionId,
      response_text: responseText,
      mode: selectedMode,
      elapsed_seconds: elapsedSeconds
    };

    if (selectedMode === 'count_down') {
      payload.countdown_start_seconds = countdownStartSeconds;
    } else {
      payload.countdown_start_seconds = null;
    }

    const { error } = await client
      .from('meq_question_submissions')
      .upsert(payload, { onConflict: 'user_id,question_id' });

    if (error) {
      setError(error.message || 'Save failed.');
      return;
    }

    // Update local cache so the question greys out.
    submissionsByQuestionId[selectedQuestionId] = {
      question_id: selectedQuestionId,
      response_text: responseText,
      mode: selectedMode,
      elapsed_seconds: elapsedSeconds,
      countdown_start_seconds: payload.countdown_start_seconds
    };

    renderQuestionList();
    // Keep the stopwatch state visible; user can continue later.
  }

  function setSuccess(msg) {
    // Student page doesn’t have a dedicated success element right now; keep silent.
    if (!msg) return;
  }

  function bindEvents() {
    els.startBtn?.addEventListener('click', startStopwatch);
    els.pauseBtn?.addEventListener('click', pauseStopwatch);

    els.modeRadios.forEach(radio => {
      radio.addEventListener('change', () => {
        // Stop before switching to keep it predictable.
        stopStopwatch();
        const nextMode = radio.value;
        if (nextMode !== mode) {
          syncModeUI(nextMode);
          // Reset timer state when switching modes
          elapsedSeconds = 0;
          countdownStartSeconds = readCountdownSecondsFromInputs();
          renderStopwatchDisplay();
        }
      });
    });

    els.countdownMinutes?.addEventListener('change', () => {
      if (!isRunning && mode === 'count_down') {
        countdownStartSeconds = readCountdownSecondsFromInputs();
        elapsedSeconds = 0;
        renderStopwatchDisplay();
      }
    });
    els.countdownSeconds?.addEventListener('change', () => {
      if (!isRunning && mode === 'count_down') {
        countdownStartSeconds = readCountdownSecondsFromInputs();
        elapsedSeconds = 0;
        renderStopwatchDisplay();
      }
    });

    els.response?.addEventListener('input', () => updateWordCount());
    els.saveBtn?.addEventListener('click', () => saveResponse().catch(e => setError(e?.message || 'Save failed.')));
  }

  async function init() {
    bindEvents();
    await requireLogin();

    await loadTags();
    await loadQuestionsAndMappings();
    await loadSubmissions();

    const fromUrl = getQueryParam('question_id');
    if (fromUrl && questions.find(q => q.id === fromUrl)) {
      selectedQuestionId = fromUrl;
    } else if (questions.length) {
      selectedQuestionId = questions[0].id;
    }

    renderQuestionList();
    if (selectedQuestionId) {
      await selectQuestion(selectedQuestionId);
    }
    stopStopwatch();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(e => {
      setError(e?.message || 'Failed to load question bank.');
      console.error(e);
    });
  });
})();

