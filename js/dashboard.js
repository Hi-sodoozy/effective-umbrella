(function () {
  const client = window.ktrainSupabase;
  if (!client) {
    renderWithFallback();
    return;
  }

  const COURSE_ID = 'meq-12';
  const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

  let profile = null;
  let enrollment = null;
  let weekContent = [];
  let todoTemplates = [];
  let completions = {};

  function getCurrentWeek() {
    if (!enrollment?.start_date) return 1;
    const start = new Date(enrollment.start_date).getTime();
    const now = Date.now();
    const weeks = Math.floor((now - start) / MS_PER_WEEK) + 1;
    return Math.max(1, Math.min(12, weeks));
  }

  function daysUntilExam() {
    const examDate = profile?.exam_date;
    if (!examDate) return null;
    const exam = new Date(examDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    exam.setHours(0, 0, 0, 0);
    const diff = Math.ceil((exam - today) / (1000 * 60 * 60 * 24));
    return diff;
  }

  async function load() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';
      const back = window.location.pathname + window.location.search;
      window.location.href = loginBase + '?redirect=' + encodeURIComponent(back);
      return;
    }

    const [profileRes, enrollRes, contentRes, todoRes, compRes] = await Promise.all([
      client.from('profiles').select('*').eq('id', user.id).single(),
      client.from('enrollments').select('*').eq('user_id', user.id).eq('course_id', COURSE_ID).maybeSingle(),
      client.from('week_content').select('*, course_weeks(week_number)').order('week_id').order('sort_order'),
      client.from('todo_templates').select('*, course_weeks(week_number)').order('week_id').order('sort_order'),
      client.from('user_todo_completions').select('todo_template_id').eq('user_id', user.id)
    ]);

    profile = profileRes.data || null;
    enrollment = enrollRes.data || null;
    weekContent = contentRes.data || [];
    todoTemplates = todoRes.data || [];
    (compRes.data || []).forEach(r => { completions[r.todo_template_id] = true; });

    render();
  }

  function render() {
    const currentWeek = getCurrentWeek();
    const days = daysUntilExam();
    const userName = profile?.full_name || 'there';

    const countdownEl = document.getElementById('examCountdown');
    if (countdownEl) {
      if (days !== null) countdownEl.textContent = days > 0 ? `${days} days until your exam` : days === 0 ? 'Exam is today' : 'Exam date has passed';
      else countdownEl.textContent = 'Set your exam date in your profile';
    }

    const nameEl = document.getElementById('dashboardUserName');
    if (nameEl) nameEl.textContent = userName;

    const byWeek = {};
    weekContent.forEach(c => {
      const weekNum = c.course_weeks?.week_number ?? c.week_id;
      if (!byWeek[weekNum]) byWeek[weekNum] = [];
      byWeek[weekNum].push(c);
    });

    const weeksContainer = document.getElementById('courseWeeks');
    if (weeksContainer) {
      weeksContainer.innerHTML = '';
      for (let w = 1; w <= 12; w++) {
        const unlocked = w <= currentWeek;
        const isCurrent = w === currentWeek;
        const content = (byWeek[w] || []).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        const weekEl = document.createElement('div');
        weekEl.className = 'course-week' + (isCurrent ? ' course-week--current' : '') + (!unlocked ? ' course-week--locked' : '');
        weekEl.innerHTML = `
          <button type="button" class="course-week-header" ${!unlocked ? 'disabled' : ''} aria-expanded="${isCurrent}">
            <span class="course-week-title">Week ${w}</span>
            ${!unlocked ? '<span class="course-week-badge">Locked</span>' : ''}
          </button>
          <div class="course-week-body" style="display: ${isCurrent ? 'block' : 'none'}">
            ${unlocked ? content.map(c => `
              <div class="week-content-item">
                <a href="${c.url || '#'}" class="week-content-link">${c.title}</a>
              </div>
            `).join('') : ''}
          </div>
        `;
        const header = weekEl.querySelector('.course-week-header');
        const body = weekEl.querySelector('.course-week-body');
        if (header && unlocked) {
          header.addEventListener('click', () => {
            const open = body.style.display === 'block';
            body.style.display = open ? 'none' : 'block';
            header.setAttribute('aria-expanded', !open);
          });
        }
        weeksContainer.appendChild(weekEl);
      }
    }

    const todosContainer = document.getElementById('sidebarTodos');
    if (todosContainer) {
      const todosForWeeks = todoTemplates.filter(t => (t.course_weeks?.week_number ?? 0) <= currentWeek);
      todosContainer.innerHTML = todosForWeeks.length
        ? todosForWeeks.map(t => {
            const id = t.id;
            const done = !!completions[id];
            return `
              <label class="sidebar-todo-item ${done ? 'sidebar-todo-item--done' : ''}">
                <input type="checkbox" class="sidebar-todo-check" data-todo-id="${id}" ${done ? 'checked' : ''} />
                <span class="sidebar-todo-tick"></span>
                <span class="sidebar-todo-label">${escapeHtml(t.label)}</span>
              </label>
            `;
          }).join('')
        : '<p class="sidebar-todo-empty">No to-dos for this week yet.</p>';
      todosContainer.querySelectorAll('.sidebar-todo-check').forEach(cb => {
        cb.addEventListener('change', () => toggleTodo(cb.dataset.todoId, cb.checked));
      });
    }
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  async function toggleTodo(todoId, completed) {
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    const id = todoId;
    if (completed) {
      await client.from('user_todo_completions').upsert({ user_id: user.id, todo_template_id: id, completed_at: new Date().toISOString() }, { onConflict: 'user_id,todo_template_id' });
      completions[id] = true;
    } else {
      await client.from('user_todo_completions').delete().eq('user_id', user.id).eq('todo_template_id', id);
      delete completions[id];
    }
    render();
  }

  function renderWithFallback() {
    document.getElementById('examCountdown') && (document.getElementById('examCountdown').textContent = 'Configure Supabase to set exam date');
    document.getElementById('dashboardUserName') && (document.getElementById('dashboardUserName').textContent = 'there');
    const weeksContainer = document.getElementById('courseWeeks');
    if (weeksContainer) {
      weeksContainer.innerHTML = '';
      for (let w = 1; w <= 12; w++) {
        const isCurrent = w === 1;
        const content = w === 1 ? [{ title: 'Overview' }, { title: 'Technique' }, { title: 'Question Bank' }] : [];
        const weekEl = document.createElement('div');
        weekEl.className = 'course-week' + (isCurrent ? ' course-week--current' : '');
        weekEl.innerHTML = `
          <button type="button" class="course-week-header" aria-expanded="${isCurrent}">
            <span class="course-week-title">Week ${w}</span>
          </button>
          <div class="course-week-body" style="display: ${isCurrent ? 'block' : 'none'}">
            ${content.map(c => `<div class="week-content-item"><a href="#" class="week-content-link">${c.title}</a></div>`).join('')}
          </div>
        `;
        const header = weekEl.querySelector('.course-week-header');
        const body = weekEl.querySelector('.course-week-body');
        header?.addEventListener('click', () => {
          const open = body.style.display === 'block';
          body.style.display = open ? 'none' : 'block';
          header.setAttribute('aria-expanded', !open);
        });
        weeksContainer.appendChild(weekEl);
      }
    }
    const todosContainer = document.getElementById('sidebarTodos');
    if (todosContainer) {
      todosContainer.innerHTML = `
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Review Overview</span></label>
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Practice Technique</span></label>
        <label class="sidebar-todo-item"><input type="checkbox" class="sidebar-todo-check" /><span class="sidebar-todo-tick"></span><span class="sidebar-todo-label">Complete Question Bank tasks</span></label>
      `;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => load().catch(e => { console.error(e); renderWithFallback(); }));
  } else {
    load().catch(e => { console.error(e); renderWithFallback(); });
  }
})();
