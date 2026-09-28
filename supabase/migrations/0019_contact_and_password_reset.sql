-- =====================================================================
-- Contact Us messages, and a Forgot Password request queue
-- =====================================================================
-- Team logins use a synthetic "<login_id>@teams.internal" address (see
-- LoginPage.jsx) — there's no real email to send a reset link to, so
-- "forgot password" can't be Supabase Auth's built-in email flow for a
-- team account. Instead it's a request queue: a team submits their
-- login_id, an admin sees it on the Team Logins page and resets the
-- password directly (reset-team-password Edge Function), same as any
-- other admin action here needing the service_role key.
--
-- Contact Us has the same shape for the same reason — no email service
-- is wired up, so a submitted message is just a row an admin reads
-- in-app rather than an email that goes nowhere.
--
-- Both are public INSERT (the whole point is a signed-out visitor can
-- submit one) and admin-only SELECT/UPDATE — nobody should be able to
-- read back other people's contact details or reset requests.
-- =====================================================================

create table if not exists public.contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  subject text,
  details text not null,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.contact_messages enable row level security;

drop policy if exists contact_messages_insert_all on public.contact_messages;
create policy contact_messages_insert_all on public.contact_messages for insert with check (true);

drop policy if exists contact_messages_admin_read_write on public.contact_messages;
create policy contact_messages_admin_read_write on public.contact_messages for select using (public.is_admin());
drop policy if exists contact_messages_admin_update on public.contact_messages;
create policy contact_messages_admin_update on public.contact_messages for update using (public.is_admin()) with check (public.is_admin());
drop policy if exists contact_messages_admin_delete on public.contact_messages;
create policy contact_messages_admin_delete on public.contact_messages for delete using (public.is_admin());

create table if not exists public.password_reset_requests (
  id uuid primary key default gen_random_uuid(),
  login_id text not null,
  team_id uuid references public.teams(id) on delete set null,
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.password_reset_requests enable row level security;

drop policy if exists password_reset_requests_insert_all on public.password_reset_requests;
create policy password_reset_requests_insert_all on public.password_reset_requests for insert with check (true);

drop policy if exists password_reset_requests_admin_read on public.password_reset_requests;
create policy password_reset_requests_admin_read on public.password_reset_requests for select using (public.is_admin());
drop policy if exists password_reset_requests_admin_update on public.password_reset_requests;
create policy password_reset_requests_admin_update on public.password_reset_requests for update using (public.is_admin()) with check (public.is_admin());
