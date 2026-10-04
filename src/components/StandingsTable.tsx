import type { TableGroup } from '../lib/standings';

/**
 * A league or group table: position, team, played, won, drawn, lost, goal
 * difference and points, with goals and recent form where there's room.
 */
export function StandingsTable({ group }: { group: TableGroup }) {
  return (
    <table className="standings">
      <thead>
        <tr>
          <th className="pos" scope="col">
            <span className="sr-only">Position</span>
          </th>
          <th className="team" scope="col">
            Team
          </th>
          <th scope="col" title="Played">P</th>
          <th scope="col" title="Won">W</th>
          <th scope="col" title="Drawn">D</th>
          <th scope="col" title="Lost">L</th>
          <th scope="col" className="wide" title="Goals for and against">Goals</th>
          <th scope="col" title="Goal difference">GD</th>
          <th scope="col" className="pts" title="Points">Pts</th>
          <th scope="col" className="wide form-head">Form</th>
        </tr>
      </thead>
      <tbody>
        {group.rows.map((row, i) => (
          <tr key={row.team} className={row.ours ? 'ours' : undefined}>
            <td className="pos">{i + 1}</td>
            <td className="team">{row.team}</td>
            <td>{row.played}</td>
            <td>{row.won}</td>
            <td>{row.drawn}</td>
            <td>{row.lost}</td>
            <td className="wide">
              {row.goalsFor}:{row.goalsAgainst}
            </td>
            <td>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</td>
            <td className="pts">{row.points}</td>
            <td className="wide form">
              {row.form.map((letter, j) => (
                <span key={j} className={`form-dot form-${letter.toLowerCase()}`} title={letter}>
                  {letter}
                </span>
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
