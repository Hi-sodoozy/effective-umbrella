-- Run in Supabase SQL Editor if you already applied an older KTraion schema
-- without admins updating student profiles (e.g. exam_date).

drop policy if exists "Admins can update other profiles" on public.profiles;
create policy "Admins can update other profiles"
on public.profiles for update
using (public.is_admin() and auth.uid() <> id)
with check (public.is_admin());
