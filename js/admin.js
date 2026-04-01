(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    document.getElementById('adminUsers') && (document.getElementById('adminUsers').innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>');
    return;
  }

  async function load() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const adminUrl = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.admin() : 'admin/';
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      window.location.href = loginBase + '?redirect=' + encodeURIComponent(adminUrl);
      return;
    }

    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
    if (profile?.role !== 'admin') {
      const dash = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.dashboard() : 'dashboard/';
      document.body.innerHTML = '<p>Access denied. Admin only.</p><a href="' + dash + '">Back to dashboard</a>';
      return;
    }

    const [usersRes, enrollRes, contentRes] = await Promise.all([
      client.from('profiles').select('id, full_name, email, phone, college_id, role, exam_date').order('full_name'),
      client.from('enrollments').select('user_id, course_id, start_date'),
      client.from('week_content').select('*, course_weeks(week_number)').order('week_id').order('sort_order')
    ]);

    const enrollments = (enrollRes.data || []).filter(e => e.course_id === 'meq-12');
    const enrolledIds = new Set(enrollments.map(e => e.user_id));
    const users = (usersRes.data || []).filter(p => p.role !== 'admin').map(p => ({
      ...p,
      enrolled: enrolledIds.has(p.id),
      start_date: enrollments.find(e => e.user_id === p.id)?.start_date
    }));

    const byWeek = {};
    (contentRes.data || []).forEach(c => {
      const w = c.course_weeks?.week_number ?? c.week_id;
      if (!byWeek[w]) byWeek[w] = [];
      byWeek[w].push(c);
    });

    const usersEl = document.getElementById('adminUsers');
    if (usersEl) {
      usersEl.innerHTML = `
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>College ID</th><th>Exam date</th><th>Enrolled</th><th>Start date</th></tr></thead>
          <tbody>
            ${users.map(u => `
              <tr>
                <td>${escapeHtml(u.full_name || '—')}</td>
                <td>${escapeHtml(u.email || '—')}</td>
                <td>${escapeHtml(u.phone || '—')}</td>
                <td>${escapeHtml(u.college_id || '—')}</td>
                <td class="admin-exam-cell">
                  <input type="date" class="admin-exam-input" data-user-id="${escapeHtml(u.id)}" value="${u.exam_date ? escapeHtml(String(u.exam_date).slice(0, 10)) : ''}" />
                  <button type="button" class="btn btn-secondary btn-small js-save-exam" data-user-id="${escapeHtml(u.id)}">Save</button>
                </td>
                <td>${u.enrolled ? 'Yes' : 'No'}</td>
                <td>${u.start_date ? u.start_date : '—'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;

      usersEl.addEventListener('click', async (e) => {
        const btn = e.target.closest('.js-save-exam');
        if (!btn || !usersEl.contains(btn)) return;
        const row = btn.closest('tr');
        const input = row && row.querySelector('.admin-exam-input');
        const exam_date = input && input.value ? input.value : null;
        const prev = btn.textContent;
        btn.disabled = true;
        const { error } = await client.from('profiles').update({ exam_date }).eq('id', id);
        btn.disabled = false;
        if (error) {
          alert(error.message);
          return;
        }
        btn.textContent = 'Saved';
        setTimeout(() => { btn.textContent = prev; }, 2000);
      });
    }

    const contentEl = document.getElementById('adminContent');
    if (contentEl) {
      let html = '';
      for (let w = 1; w <= 12; w++) {
        const items = (byWeek[w] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        html += `
          <div class="admin-week">
            <h3>Week ${w}</h3>
            <div class="admin-week-content">
              ${items.length ? items.map(c => `
                <div class="admin-content-item">
                  <span class="admin-content-title">${escapeHtml(c.title)}</span>
                  <span class="admin-content-meta">${c.url ? 'Link' : 'Content'}</span>
                  <button type="button" class="btn btn-small">Edit</button>
                </div>
              `).join('') : '<p class="admin-placeholder">No content yet. Add via Supabase or edit here later.</p>'}
              <button type="button" class="btn btn-secondary btn-small">+ Add item</button>
            </div>
          </div>
        `;
      }
      contentEl.innerHTML = html;
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
