-- Temporary diagnostic — will be dropped in the next migration once the
-- contact_messages/password_reset_requests insert issue is understood.
create or replace function public.debug_whoami() returns text
language sql stable as $$ select current_user::text; $$;
grant execute on function public.debug_whoami() to anon, authenticated;
