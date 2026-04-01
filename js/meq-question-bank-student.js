(function () {
  const client = window.ktrainSupabase;
  const rootId = 'meqQbStudentRoot';

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s == null ? '' : String(s);
    return div.innerHTML;
  }

  function escapeAttr(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;');
  }

  async function load() {
    const root = document.getElementById(rootId);
    if (!client || !root) return;

    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const login = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      const target = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
      window.location.href = login + '?redirect=' + encodeURIComponent(target);
      return;
    }

    const [qRes, sRes] = await Promise.all([
      client.from('meq_questions').select('*').eq('is_published', true).order('sort_order', { ascending: true }),
      client.from('meq_question_submissions').select('question_id, response_text').eq('user_id', user.id)
    ]);

    if (qRes.error) {
      root.innerHTML = '<p class="course-admin-error">' + escapeHtml(qRes.error.message) + '</p>';
      return;
    }

    const byQ = {};
    (sRes.data || []).forEach((s) => { byQ[s.question_id] = s.response_text; });

    const qs = qRes.data || [];
    if (!qs.length) {
      root.innerHTML = '<p class="qb-student-empty">No practice questions are available yet.</p>';
      return;
    }

    root.innerHTML = qs.map((q, i) => `
      <article class="qb-student-card" data-id="${escapeAttr(q.id)}">
        <h3 class="qb-student-num">Question ${i + 1}</h3>
        <div class="qb-student-stem">${escapeHtml(q.stem).replace(/\n/g, '<br />')}</div>
        <label class="qb-admin-label">Your response</label>
        <textarea class="qb-admin-textarea qb-response" rows="6" placeholder="Write your answer here…">${escapeHtml(byQ[q.id] || '')}</textarea>
        <button type="button" class="btn btn-small js-qb-save-response">Save response</button>
        <details class="qb-model-details">
          <summary>Model answer</summary>
          <div class="qb-model-body">${q.model_answer ? escapeHtml(q.model_answer).replace(/\n/g, '<br />') : '<em>Not provided.</em>'}</div>
        </details>
      </article>
    `).join('');
  }

  document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById(rootId);
    if (!root) return;

    root.addEventListener('click', async (e) => {
      const btn = e.target.closest('.js-qb-save-response');
      if (!btn || !root.contains(btn) || !client) return;
      const { data: { user } } = await client.auth.getUser();
      if (!user) return;
      const card = btn.closest('.qb-student-card');
      const qid = card?.getAttribute('data-id');
      const text = card?.querySelector('.qb-response')?.value ?? '';
      if (!qid) return;
      btn.disabled = true;
      const { error } = await client.from('meq_question_submissions').upsert({
        user_id: user.id,
        question_id: qid,
        response_text: text || null
      }, { onConflict: 'user_id,question_id' });
      btn.disabled = false;
      if (error) {
        alert(error.message);
        return;
      }
      const prev = btn.textContent;
      btn.textContent = 'Saved';
      setTimeout(() => { btn.textContent = prev; }, 1500);
    });

    load().catch(console.error);
  });
})();
