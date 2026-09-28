-- Temporary diagnostic.
create or replace function public.debug_can_insert() returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'current_user', current_user::text,
    'can_insert_contact', has_table_privilege('anon', 'public.contact_messages', 'INSERT'),
    'can_insert_contact_current', has_table_privilege(current_user, 'public.contact_messages', 'INSERT'),
    'rls_enabled', (select relrowsecurity from pg_class where oid = 'public.contact_messages'::regclass),
    'rls_forced', (select relforcerowsecurity from pg_class where oid = 'public.contact_messages'::regclass),
    'policies', (select jsonb_agg(jsonb_build_object('name', polname, 'cmd', polcmd, 'roles', polroles, 'qual', pg_get_expr(polqual, polrelid), 'withcheck', pg_get_expr(polwithcheck, polrelid))) from pg_policy where polrelid = 'public.contact_messages'::regclass)
  );
$$;
grant execute on function public.debug_can_insert() to anon, authenticated;
