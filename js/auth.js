(function () {
  if (typeof supabase === 'undefined') return;

  const client = window.ktrainSupabase || supabase.createClient(
    window.SUPABASE_URL || '',
    window.SUPABASE_ANON_KEY || ''
  );

  window.ktrainAuth = {
    client,

    async getSession() {
      const { data: { session } } = await client.auth.getSession();
      return session;
    },

    async getProfile(userId) {
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
      if (error) return null;
      return data;
    },

    async signUp({ email, password, full_name, phone, college_id }) {
      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: {
          data: { full_name, phone, college_id }
        }
      });
      if (error) throw error;

      if (data.user) {
        // Create or update the user profile row used by the dashboard.
        await client.from('profiles').upsert(
          {
            id: data.user.id,
            full_name: full_name || data.user.user_metadata?.full_name,
            email: data.user.email,
            phone: phone || data.user.user_metadata?.phone,
            college_id: college_id || data.user.user_metadata?.college_id,
            role: 'user'
          },
          { onConflict: 'id' }
        );
      }

      return data;
    },

    async signIn(email, password) {
      const { data, error } = await client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      return data;
    },

    async signOut() {
      await client.auth.signOut();
    },

    onAuthStateChange(callback) {
      return client.auth.onAuthStateChange(callback);
    }
  };
})();

