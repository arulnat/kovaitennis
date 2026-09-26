-- =====================================================================
-- Singles set-1 tiebreak points (distinct from the 10-pt super-tiebreak)
-- =====================================================================
-- Singles is decided by one set, recorded as "7-6" when it goes to the
-- standard 6-6 breaker (Req 5.3) -- set1_home/set1_away only ever hold
-- the game score (7 and 6), never the breaker's own point score. These
-- columns hold that separately (e.g. 7-3) when the set actually ended
-- 7-6, and stay null otherwise.
-- =====================================================================

alter table public.rubbers add column if not exists set1_tiebreak_home integer;
alter table public.rubbers add column if not exists set1_tiebreak_away integer;

comment on column public.rubbers.set1_tiebreak_home is
  'The 6-6 breaker''s own point score (home side) when set1 finished 7-6 -- distinct from set1_home, which stays 7 (games), not the breaker points. Null unless set1 was a 7-6/6-7 finish.';
comment on column public.rubbers.set1_tiebreak_away is
  'Away-side counterpart to set1_tiebreak_home.';
