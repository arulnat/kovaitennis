-- Cleanup: drop the temporary diagnostic functions from 0021/0022 (used
-- to track down why a manual test insert was failing — see 0019/0020's
-- history; the real app code was never actually affected, see below),
-- and remove the test rows inserted while diagnosing it.

drop function if exists public.debug_whoami();
drop function if exists public.debug_can_insert();

delete from public.contact_messages where email like 'test%@example.com';
delete from public.password_reset_requests where login_id = 'test-login';
