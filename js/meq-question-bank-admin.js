(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    document.getElementById('qbQuestionList') && (document.getElementById('qbQuestionList').innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>');
    return;
  }

  const COURSE_ID = 'meq-12';

  const els = {
    filterTag: document.getElementById('qbFilterTag'),
    questionList: document.getElementById('qbQuestionList'),

    questionPrompt: document.getElementById('qbQuestionPrompt'),
    newTagText: document.getElementById('qbNewTagText'),
    addTagBtn: document.getElementById('qbAddTagBtn'),
    selectedTags: document.getElementById('qbSelectedTags'),

    saveError: document.getElementById('qbSaveError'),
    successNote: document.getElementById('qbSuccessNote'),

    saveBtn: document.getElementById('qbSaveQuestionBtn'),
    cancelBtn: document.getElementById('qbCancelEditBtn')
  };

  let currentUser = null;
  let isAdmin = false;

  let tags = []; // [{id, tag_text}]
  let tagsById = {};
  let questions = []; // [{id, prompt_text, ...}]
  let questionTagIdsByQuestionId = {}; // { [questionId]: [tagId, ...] }

  let selectedFilterTagId = 'all';

  let editingQuestionId = null;
  let selectedTagIds = [];

  function setError(msg) {
    if (!els.saveError) return;
    els.saveError.textContent = msg;
    els.saveError.style.display = msg ? 'block' : 'none';
  }

  function setSuccess(msg) {
    if (!els.successNote) return;
    els.successNote.textContent = msg;
    els.successNote.style.display = msg ? 'block' : 'none';
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
  }

  function promptSnippet(text) {
    const t = String(text ?? '').trim();
    return t.length > 200 ? t.slice(0, 200) + '…' : t;
  }

  function formatTagChip(tagId) {
    const tag = tagsById[tagId];
    if (!tag) return '';
    return `<button type="button" class="qb-chip" data-tag-id="${tag.id}" title="Click to remove">#${escapeHtml(tag.tag_text)} ×</button>`;
  }

  function renderSelectedTags() {
    if (!els.selectedTags) return;
    els.selectedTags.innerHTML = '';
    if (!selectedTagIds.length) {
      els.selectedTags.innerHTML = '<div class="qb-helper" style="margin-top: 0.25rem;">No tags selected.</div>';
      return;
    }
    els.selectedTags.innerHTML = selectedTagIds.map(formatTagChip).join('');
    els.selectedTags.querySelectorAll('[data-tag-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tagId = btn.getAttribute('data-tag-id');
        selectedTagIds = selectedTagIds.filter(id => id !== tagId);
        renderSelectedTags();
      });
    });
  }

  function toggleSelectedTag(tagId) {
    if (selectedTagIds.includes(tagId)) {
      selectedTagIds = selectedTagIds.filter(id => id !== tagId);
    } else {
      selectedTagIds.push(tagId);
    }
  }

  function renderQuestionList() {
    if (!els.questionList) return;
    const filtered = questions.filter(q => {
      if (selectedFilterTagId === 'all') return true;
      const qTags = questionTagIdsByQuestionId[q.id] || [];
      return qTags.includes(selectedFilterTagId);
    });

    els.questionList.innerHTML = filtered.length
      ? filtered.map(q => {
          const qTags = questionTagIdsByQuestionId[q.id] || [];
          const tagChips = qTags
            .map(tid => {
              const t = tagsById[tid];
              return `<span class="qb-chip">#${escapeHtml(t?.tag_text || 'tag')}</span>`;
            })
            .join('');

          const studentLink = `meq-question-bank-student.html?question_id=${encodeURIComponent(q.id)}`;

          return `
            <div class="qb-question-item" data-question-id="${q.id}">
              <div class="qb-question-top">
                <div class="qb-question-snippet">
                  <strong>Question</strong>
                  <p>${escapeHtml(promptSnippet(q.prompt_text))}</p>
                  <div class="qb-chip-row">${tagChips || ''}</div>
                </div>
                <div class="qb-edit-row" style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end;">
                  <button type="button" class="qb-btn" data-action="edit">Edit</button>
                  <button type="button" class="qb-btn" data-action="copy" data-link="${studentLink}">Copy link</button>
                </div>
              </div>
            </div>
          `;
        }).join('')
      : '<p style="color: var(--ink-light);">No questions match this filter.</p>';

    els.questionList.querySelectorAll('[data-question-id]').forEach(item => {
      const qid = item.getAttribute('data-question-id');
      item.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          startEdit(qid);
        });
      });
      item.querySelectorAll('[data-action="copy"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const rel = btn.getAttribute('data-link');
          const abs = new URL(rel, window.location.origin).toString();
          try {
            await navigator.clipboard.writeText(abs);
            setSuccess('Link copied to clipboard.');
          } catch (e) {
            // fallback
            window.prompt('Copy this link:', abs);
          }
        });
      });
    });
  }

  async function requireAdmin() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      window.location.href = 'login.html?redirect=' + encodeURIComponent('meq-question-bank-admin.html');
      return null;
    }

    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      document.body.innerHTML = '<p>Access denied. Admin only.</p><a href="dashboard.html">Back</a>';
      return null;
    }

    currentUser = user;
    isAdmin = true;
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

  async function loadQuestionsAndTags() {
    const { data: qRows, error: qErr } = await client
      .from('meq_questions')
      .select('id, prompt_text, updated_at')
      .order('updated_at', { ascending: false });

    if (qErr) throw qErr;
    questions = (qRows || []).filter(q => q.course_id === COURSE_ID);

    const questionIds = questions.map(q => q.id);
    questionTagIdsByQuestionId = {};
    questions.forEach(q => { questionTagIdsByQuestionId[q.id] = []; });

    if (!questionIds.length) return;

    // Pull mapping for these questions
    const { data: mapRows, error: mErr } = await client
      .from('meq_question_tags')
      .select('question_id, tag_id, question_tags(tag_text)')
      .in('question_id', questionIds);

    if (mErr) throw mErr;

    // Map tag_id -> tag_text via tagsById (we also keep it just in case)
    (mapRows || []).forEach(r => {
      if (!questionTagIdsByQuestionId[r.question_id]) questionTagIdsByQuestionId[r.question_id] = [];
      if (!questionTagIdsByQuestionId[r.question_id].includes(r.tag_id)) {
        questionTagIdsByQuestionId[r.question_id].push(r.tag_id);
      }
    });
  }

  async function loadFilterDropdown() {
    if (!els.filterTag) return;
    els.filterTag.innerHTML = `<option value="all">All tags</option>`;
    tags.forEach(t => {
      const opt = document.createElement('option');
      opt.value = t.id;
      opt.textContent = t.tag_text;
      els.filterTag.appendChild(opt);
    });
  }

  function resetForm() {
    editingQuestionId = null;
    selectedTagIds = [];
    els.questionPrompt.value = '';
    renderSelectedTags();
    els.saveBtn.textContent = 'Add question';
    els.cancelBtn.style.display = 'none';
    setError('');
    setSuccess('');
  }

  function startEdit(questionId) {
    const q = questions.find(x => x.id === questionId);
    if (!q) return;
    editingQuestionId = questionId;
    selectedTagIds = (questionTagIdsByQuestionId[questionId] || []).slice();
    els.questionPrompt.value = q.prompt_text || '';
    renderSelectedTags();
    els.saveBtn.textContent = 'Save changes';
    els.cancelBtn.style.display = 'inline-block';
    setError('');
    setSuccess('');
  }

  async function ensureTagExists(tagText) {
    const clean = String(tagText || '').trim();
    if (!clean) throw new Error('Tag is required.');

    // Try to find by case-insensitive match
    const { data: matches, error } = await client
      .from('question_tags')
      .select('id, tag_text')
      .eq('course_id', COURSE_ID)
      .ilike('tag_text', clean)
      .limit(5);

    if (error) throw error;
    if (matches && matches.length) return matches[0].id;

    // Create a new tag (unique index handles duplicates via lower(tag_text))
    const { data: inserted, error: insErr } = await client
      .from('question_tags')
      .insert({ course_id: COURSE_ID, tag_text: clean, created_by: currentUser?.id })
      .select('id')
      .single();

    if (insErr) {
      // In case it raced (or casing differs), reload tags and try again.
      await loadTags();
      const { data: exact } = await client
        .from('question_tags')
        .select('id')
        .eq('course_id', COURSE_ID)
        .ilike('tag_text', clean)
        .limit(1);
      if (exact?.[0]?.id) return exact[0].id;
      throw insErr;
    }

    return inserted?.id;
  }

  function validateQuestionForm() {
    const prompt = String(els.questionPrompt.value || '').trim();
    if (!prompt) return 'Please enter question text.';
    if (prompt.length < 20) return 'Question text looks too short (min ~20 chars).';
    if (!selectedTagIds.length) return 'Please select at least one filter tag.';
    return null;
  }

  async function saveQuestion() {
    setError('');
    setSuccess('');

    const err = validateQuestionForm();
    if (err) {
      setError(err);
      return;
    }

    const promptText = String(els.questionPrompt.value || '').trim();

    if (editingQuestionId) {
      // Update question
      const { error: upErr } = await client
        .from('meq_questions')
        .update({ prompt_text: promptText })
        .eq('id', editingQuestionId);
      if (upErr) throw upErr;

      // Replace tags
      await client.from('meq_question_tags').delete().eq('question_id', editingQuestionId);
      const toInsert = selectedTagIds.map(tagId => ({ question_id: editingQuestionId, tag_id: tagId }));
      if (toInsert.length) {
        const { error: insErr } = await client.from('meq_question_tags').insert(toInsert);
        if (insErr) throw insErr;
      }

      setSuccess('Question updated.');
    } else {
      // Create question
      const { data: qIns, error: qInsErr } = await client
        .from('meq_questions')
        .insert({ course_id: COURSE_ID, prompt_text: promptText, created_by: currentUser?.id })
        .select('id')
        .single();
      if (qInsErr) throw qInsErr;

      const newQuestionId = qIns?.id;

      const toInsert = selectedTagIds.map(tagId => ({ question_id: newQuestionId, tag_id: tagId }));
      if (toInsert.length) {
        const { error: insErr } = await client.from('meq_question_tags').insert(toInsert);
        if (insErr) throw insErr;
      }

      setSuccess('Question added to the bank.');
    }

    resetForm();
    await loadTags();
    await loadQuestionsAndTags();
    await loadFilterDropdown();
    renderQuestionList();
  }

  async function addTagFromInput() {
    const text = els.newTagText.value;
    if (!text || !String(text).trim()) {
      setError('Enter a tag first.');
      return;
    }

    try {
      const tagId = await ensureTagExists(text);
      if (!selectedTagIds.includes(tagId)) selectedTagIds.push(tagId);
      els.newTagText.value = '';
      await loadTags();
      renderSelectedTags();
      setError('');
      setSuccess('Tag ready. Added to selected tags.');
    } catch (e) {
      setError(e?.message || 'Failed to add tag.');
    }
  }

  function bindEvents() {
    els.addTagBtn?.addEventListener('click', addTagFromInput);
    els.saveBtn?.addEventListener('click', () => saveQuestion().catch(e => setError(e?.message || 'Save failed.')));
    els.cancelBtn?.addEventListener('click', () => resetForm());
    els.filterTag?.addEventListener('change', () => {
      selectedFilterTagId = els.filterTag.value;
      renderQuestionList();
    });
  }

  async function init() {
    bindEvents();

    await requireAdmin();
    await loadTags();
    await loadQuestionsAndTags();
    await loadFilterDropdown();
    renderSelectedTags();
    renderQuestionList();
  }

  document.addEventListener('DOMContentLoaded', () => {
    init().catch(e => {
      setError(e?.message || 'Failed to load question bank.');
      console.error(e);
    });
  });
})();

