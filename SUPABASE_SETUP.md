# Education with Dr Katelyn Tadd – Supabase setup

Use this guide to set up your Supabase project so Education auth, user dashboard, and admin portal work.

## 1. Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in.
2. **New project** → choose org, name (e.g. `ktrain`), database password, region.
3. Wait for the project to be ready.

## 2. Get your API keys

1. In the Supabase dashboard: **Project Settings** (gear) → **API**.
2. Copy:
   - **Project URL** (e.g. `https://xxxx.supabase.co`)
   - **anon public** key (under "Project API keys").
3. In this project, open **`js/supabase-config.js`** and set:
   - `SUPABASE_URL` = your Project URL
   - `SUPABASE_ANON_KEY` = your anon key

## 3. Create the database schema

In Supabase: **SQL Editor** → **New query**.

Recommended: run the single file `supabase-schema.sql` (copy/paste its contents) so you get all tables + RLS + placeholders in one go.

If you have already run an earlier version, it’s safe to run again (the SQL is written to be idempotent where possible).

### 3.1 Profiles (extends auth users)

```sql
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  phone text,
  college_id text,
  role text not null default 'user' check (role in ('user', 'admin')),
  exam_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Allow auth users to read/update their own profile
alter table public.profiles enable row level security;

create policy "Users can read own profile"
  on public.profiles for select using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update using (auth.uid() = id);

-- Service role / admin will insert on signup; allow insert for own id
create policy "Users can insert own profile"
  on public.profiles for insert with check (auth.uid() = id);
```

### 3.2 Enrollments (user ↔ course)

```sql
create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  course_id text not null,
  start_date date not null default current_date,
  created_at timestamptz default now(),
  unique(user_id, course_id)
);

alter table public.enrollments enable row level security;

create policy "Users can read own enrollments"
  on public.enrollments for select using (auth.uid() = user_id);

-- Only backend/admin should create enrollments; for now allow authenticated insert for self
create policy "Users can insert own enrollment"
  on public.enrollments for insert with check (auth.uid() = user_id);
```

### 3.3 Course weeks (structure for MEQ 12-week course)

```sql
create table if not exists public.course_weeks (
  id uuid primary key default gen_random_uuid(),
  course_id text not null,
  week_number int not null,
  title text,
  unique(course_id, week_number)
);

alter table public.course_weeks enable row level security;

create policy "Anyone can read course_weeks"
  on public.course_weeks for select using (true);

-- Insert the 12 weeks for MEQ (run once)
insert into public.course_weeks (course_id, week_number, title)
select 'meq-12', n, 'Week ' || n from generate_series(1, 12) n
on conflict (course_id, week_number) do nothing;
```

### 3.4 Week content (admin-managed links/items per week)

```sql
create table if not exists public.week_content (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.course_weeks(id) on delete cascade,
  type text default 'link',
  title text not null,
  url text,
  content text,
  sort_order int not null default 0
);

alter table public.week_content enable row level security;

create policy "Anyone can read week_content"
  on public.week_content for select using (true);

-- Week 1 placeholder content (Overview, Technique, Question Bank) – run after course_weeks exist
insert into public.week_content (week_id, title, sort_order)
select cw.id, t.title, t.ord
from public.course_weeks cw,
     (values ('Overview', 1), ('Technique', 2), ('Question Bank', 3)) as t(title, ord)
where cw.course_id = 'meq-12' and cw.week_number = 1;
```

### 3.5 Todo templates (per week, shown in sidebar)

```sql
create table if not exists public.todo_templates (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.course_weeks(id) on delete cascade,
  label text not null,
  sort_order int not null default 0
);

alter table public.todo_templates enable row level security;

create policy "Anyone can read todo_templates"
  on public.todo_templates for select using (true);

-- Example todos for week 1 – run after course_weeks exist
insert into public.todo_templates (week_id, label, sort_order)
select cw.id, t.label, t.ord
from public.course_weeks cw,
     (values ('Review Overview', 1), ('Practice Technique', 2), ('Complete Question Bank tasks', 3)) as t(label, ord)
where cw.course_id = 'meq-12' and cw.week_number = 1;
```

### 3.6 User todo completions (tick state)

```sql
create table if not exists public.user_todo_completions (
  user_id uuid not null references auth.users(id) on delete cascade,
  todo_template_id uuid not null references public.todo_templates(id) on delete cascade,
  completed_at timestamptz default now(),
  primary key (user_id, todo_template_id)
);

alter table public.user_todo_completions enable row level security;

create policy "Users can manage own completions"
  on public.user_todo_completions for all using (auth.uid() = user_id);
```

### 3.7 Admin: read all profiles and enrollments

Admins need to see all users and enrollments. Easiest is to allow read for users whose `profiles.role = 'admin'`:

```sql
create policy "Admins can read all profiles"
  on public.profiles for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );

create policy "Admins can read all enrollments"
  on public.enrollments for select using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
  );
```

(If you prefer, you can use a separate `admin` table or Supabase custom claims; the above keeps it simple.)

## 4. Auth settings (optional but recommended)

1. **Authentication** → **Providers** → **Email**: enable "Confirm email" if you want verification (otherwise disable for quicker testing).
2. **URL Configuration**: set **Site URL** to your live site (e.g. `https://yoursite.com`). For local dev you can use `http://localhost:5500` or the URL your tool gives you.
3. **Redirect URLs**: add:
   - `http://localhost:5500/**` (or your local URL)
   - `https://yoursite.com/**`

## 5. Create an admin user

1. Sign up a normal user via the Education sign up page.
2. In Supabase: **Table Editor** → **profiles** → find that user’s row → set **role** to `admin`.
3. That user can now open the admin portal and see enrolled users and edit content.

## 6. Enrolling a user in the 12-week course

- **Option A:** In **Table Editor** → **enrollments**, add a row: `user_id` = user’s UUID, `course_id` = `meq-12`, `start_date` = e.g. today (or course start).
- **Option B:** Build a small “Enroll” action in the admin UI that inserts into `enrollments` (same values).

Current week is computed as: `floor((today - start_date) / 7) + 1`, capped between 1 and 12.

## 7. Exam date

Set **exam_date** on **profiles** (e.g. in Table Editor or a future “Profile” page). The dashboard uses it for “X days until your exam”.

---

Summary of what you need to do:

1. Create a Supabase project and copy **Project URL** and **anon** key into **`js/supabase-config.js`**.
2. Run the SQL above in the SQL Editor (full schema including question bank tables + RLS):
   - `profiles`, `enrollments`, `course_weeks`, `week_content`, `todo_templates`, `user_todo_completions`
   - plus MEQ question bank tables: `meq_questions`, `question_tags`, `meq_question_tags`, `meq_question_submissions`
3. Optionally configure Auth (email confirmation, redirect URLs).
4. Set one user’s **profiles.role** to `admin` for the admin portal.
5. Add **enrollments** and **exam_date** for users as needed.

After that, login, signup, dashboard (weeks, to-dos, countdown), and admin (user list, content placeholders, and MEQ question bank) will use Supabase.
