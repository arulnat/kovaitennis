// src/components/RubberRow.jsx
//
// One rubber's result — who played, who won, and the set score — shared
// by every place that shows a completed tie's rubber-by-rubber
// breakdown (public Results page, Standings' and Team Profile's
// expandable match history), so all three look identical.

const RUBBER_LABELS = { singles: 'Singles', doubles1: 'Doubles 1', doubles2: 'Doubles 2' };

/**
 * @param {'singles'|'doubles1'|'doubles2'} type
 * @param {object} rubber - a row from `rubbers`
 * @param {Object<string,string>} nameOf - player_id -> name
 * @param {'home'|'away'} [mySide] - which DB side to list first (defaults to home);
 *   pass 'away' when rendering from the away team's own point of view.
 */
export default function RubberRow({ type, rubber: r, nameOf, mySide = 'home' }) {
  const homeNames = [r.home_player1_id, r.home_player2_id].filter(Boolean).map((id) => nameOf[id]).filter(Boolean);
  const awayNames = [r.away_player1_id, r.away_player2_id].filter(Boolean).map((id) => nameOf[id]).filter(Boolean);
  const sets = [1, 2, 3].map((n) => ({ home: r[`set${n}_home`], away: r[`set${n}_away`] })).filter((s) => s.home != null);
  const homeWon = r.winner_side === 'home';

  // A walkover has no players on either side and no real score played —
  // only the winning side gets its (automatic clean-shutout) number
  // shown; the losing side is left blank rather than a "—" placeholder,
  // since there's nothing to report for a side that never showed up.
  const Side = ({ won, names, side }) => (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span className={`text-sm truncate ${won ? 'font-bold text-teal-900' : 'text-gray-600'}`}>
        {won && <span className="inline-block w-4 text-teal-700">✓</span>}
        {names.join(' / ') || (r.is_walkover ? '' : '—')}
      </span>
      <div className="flex items-center gap-3 shrink-0">
        {(!r.is_walkover || won) && sets.map((s, i) => (
          <span key={i} className="w-6 text-center text-sm font-semibold">{side === 'home' ? s.home : s.away}</span>
        ))}
      </div>
    </div>
  );

  const homeRow = <Side key="home" won={homeWon} names={homeNames} side="home" />;
  const awayRow = <Side key="away" won={!homeWon} names={awayNames} side="away" />;

  return (
    <div className="px-4 py-2 bg-white">
      <p className="text-[10px] font-bold uppercase tracking-wide text-teal-700 mb-1">
        {RUBBER_LABELS[type]}
        {r.is_walkover && <span className="text-red-600 ml-2">Walkover</span>}
      </p>
      {mySide === 'away' ? <>{awayRow}{homeRow}</> : <>{homeRow}{awayRow}</>}
    </div>
  );
}
