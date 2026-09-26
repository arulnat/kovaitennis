-- =====================================================================
-- Retire any leftover is_test=true season
-- =====================================================================
-- Test Season as a concept was already retired (see 242cae6): SeasonsPage
-- only ever creates real seasons (is_test: false) now, and there's no
-- admin UI to create a test one. But a season created before that
-- retirement can still be sitting around with is_test=true, which
-- silently hides it (and makes public pages like Standings/Fixtures
-- Calendar/Team Profile show "no season") from anyone who isn't logged
-- in as admin -- divisions/teams themselves have no such check and stay
-- visible regardless, so the data looks present while the season that
-- owns it doesn't. Flips every remaining test season to real; the
-- user's actual test workflow going forward is a real season, tested,
-- then removed with Purge Data (seasons.purge_locked).
-- =====================================================================

update public.seasons set is_test = false where is_test = true;
