/**
 * Ensures user is logged in and has profiles.role = 'admin'.
 * Call initAdminGuard({ redirectLogin, redirectDenied }) from a small inline script on admin pages.
 */
(function () {
  window.ktrainAdminGuard = {
    async init(options) {
      const client = window.ktrainSupabase;
      const redirectLogin = options?.redirectLogin || (typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.admin() : 'admin/');
      const redirectDenied = options?.redirectDenied || (typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.dashboard() : 'dashboard/');
      const loginBase = typeof window.ktrainPaths !== 'undefined' ? window.ktrainPaths.login() : 'login/';

      if (!client) {
        const el = document.getElementById('adminGuardRoot');
        if (el) el.innerHTML = '<p>Configure Supabase in js/supabase-config.js</p>';
        return false;
      }

      const { data: { user } } = await client.auth.getUser();
      if (!user) {
        const target = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
        window.location.href = loginBase + '?redirect=' + encodeURIComponent(target);
        return false;
      }

      const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
      if (profile?.role !== 'admin') {
        document.body.innerHTML = '<p>Access denied. Admin only.</p><a href="' + redirectDenied + '">Back to dashboard</a>';
        return false;
      }

      const el = document.getElementById('adminGuardRoot');
      if (el) el.hidden = false;
      return true;
    }
  };
})();
