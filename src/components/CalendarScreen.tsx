import { useMemo, useState } from 'react';
import { useStore } from '../store/AppStore';
import type { Match } from '../types';
import {
  MONTH_NAMES, addMonths, countdown, formatDateLong, kickoffAt, monthGrid, startOfMonth,
  toISODate, todayISO, weekdayLabels,
} from '../lib/date';
import { matchesOnDate, upcomingMatches } from '../lib/stats';
import { MatchCard } from './MatchCard';
import { Avatar } from './Avatar';
import { StarBadge } from './MissionBoard';
import { TRAINING_TYPE_LABEL } from '../types';
import { EmptyState } from './ui';

const MAX_DOTS = 3;

export function CalendarScreen({
  now,
  onOpenMatch,
  onAddMatch,
  onAddTournament,
  onAddTraining,
  onOpenTraining,
  onEnterResult,
}: {
  now: Date;
  onOpenMatch: (match: Match) => void;
  onAddMatch: (dateISO: string) => void;
  onAddTournament: () => void;
  onAddTraining: (dateISO: string) => void;
  onOpenTraining: (id: string) => void;
  onEnterResult: (match: Match) => void;
}) {
  const { matches, settings, colorOf, teams, competitions, updateSettings, profile, training } = useStore();
  const [cursor, setCursor] = useState(() => startOfMonth(now));
  const [selected, setSelected] = useState(() => todayISO(now));

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const grid = useMemo(() => monthGrid(year, month, settings.weekStartsOn), [year, month, settings.weekStartsOn]);

  const byDate = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const m of matches) {
      const list = map.get(m.date) ?? [];
      list.push(m);
      map.set(m.date, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.time.localeCompare(b.time));
    return map;
  }, [matches]);

  const trainingByDate = useMemo(() => {
    const map = new Map<string, number>();
    for (const session of training) map.set(session.date, (map.get(session.date) ?? 0) + 1);
    return map;
  }, [training]);

  const selectedTraining = useMemo(
    () => training.filter((t) => t.date === selected).sort((a, b) => a.time.localeCompare(b.time)),
    [training, selected],
  );

  const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthMatches = matches.filter((m) => m.date.startsWith(monthKey));
  const monthPlayed = monthMatches.filter((m) => m.status === 'played').length;
  const monthUpcoming = monthMatches.filter(
    (m) => m.status === 'scheduled' && kickoffAt(m.date, m.time).getTime() > now.getTime(),
  ).length;

  const selectedMatches = matchesOnDate(matches, selected);
  const next = upcomingMatches(matches, now)[0] ?? null;
  const todayIso = todayISO(now);

  const goToday = () => {
    setCursor(startOfMonth(now));
    setSelected(todayIso);
  };

  return (
    <div className="screen">
      <div className="profile-header">
        <Avatar photo={profile.photo} name={profile.name} size={46} />
        <div className="profile-header-text">
          <strong>{profile.name ? `Hi, ${profile.name}` : 'Matchday'}</strong>
          <span>
            {[profile.position, profile.ageGroup, teams[0]?.name].filter(Boolean).join(' · ') || 'Set up your profile'}
          </span>
        </div>
        <StarBadge group={profile.positionGroup} now={now} />
      </div>

      <div className="cal-head">
        <div>
          <h1 className="cal-title">
            {MONTH_NAMES[month]} <span>{year}</span>
          </h1>
          <p className="cal-sub">
            {monthMatches.length === 0
              ? 'No matches this month'
              : `${monthMatches.length} ${monthMatches.length === 1 ? 'match' : 'matches'} · ${monthPlayed} played · ${monthUpcoming} to come`}
          </p>
        </div>
        <div className="cal-nav">
          <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, -1))} aria-label="Previous month">
            ‹
          </button>
          <button className="ghost-btn" onClick={goToday}>
            Today
          </button>
          <button className="icon-btn" onClick={() => setCursor(addMonths(cursor, 1))} aria-label="Next month">
            ›
          </button>
        </div>
      </div>

      <div className="quick-row">
        <button className="quick-btn" onClick={() => onAddMatch(selected)}>
          + Match
        </button>
        <button className="quick-btn" onClick={onAddTournament}>
          + Tournament
        </button>
        <button className="quick-btn" onClick={() => onAddTraining(selected)}>
          + Training
        </button>
        {(teams.length > 1 || competitions.length > 1) && (
          <button
            className="quick-btn subtle"
            onClick={() =>
              updateSettings({ calendarColorBy: settings.calendarColorBy === 'team' ? 'competition' : 'team' })
            }
            title="Switch what the calendar colours represent"
          >
            🎨 {settings.calendarColorBy === 'team' ? 'Team' : 'Competition'}
          </button>
        )}
      </div>

      <div className="cal-grid" role="grid">
        {weekdayLabels(settings.weekStartsOn).map((d) => (
          <div key={d} className="cal-weekday" role="columnheader">
            {d.slice(0, 1)}
          </div>
        ))}

        {grid.map((day) => {
          const iso = toISODate(day);
          const dayMatches = byDate.get(iso) ?? [];
          const live = dayMatches.filter((m) => m.status !== 'cancelled');
          const trainingCount = trainingByDate.get(iso) ?? 0;
          const outside = day.getMonth() !== month;
          const classes = [
            'cal-day',
            outside ? 'outside' : '',
            iso === todayIso ? 'today' : '',
            iso === selected ? 'selected' : '',
            live.length ? 'has-matches' : '',
            trainingCount && !live.length ? 'has-training' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <button
              key={iso}
              className={classes}
              role="gridcell"
              aria-label={`${formatDateLong(iso)}${live.length ? `, ${live.length} matches` : ''}`}
              onClick={() => setSelected(iso)}
            >
              <span className="cal-daynum">{day.getDate()}</span>
              {live.length > 0 && (
                <span className="cal-dots">
                  {live.slice(0, MAX_DOTS).map((m) => (
                    <span
                      key={m.id}
                      className={`dot${m.status === 'played' ? ' filled' : ''}`}
                      style={{ background: colorOf(m) }}
                    />
                  ))}
                </span>
              )}
              {live.length > 1 && <span className="cal-count">{live.length}</span>}
              {trainingCount > 0 && <span className="cal-training" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      <div className="day-detail">
        <div className="day-head">
          <h2>{formatDateLong(selected)}</h2>
          <button className="ghost-btn" onClick={() => onAddMatch(selected)}>
            + Match
          </button>
        </div>

        {selectedTraining.length > 0 && (
          <div className="list">
            {selectedTraining.map((session) => (
              <button key={session.id} className="training-row" onClick={() => onOpenTraining(session.id)}>
                <span className="training-rail" aria-hidden="true" />
                <span className="training-time">{session.time}</span>
                <span className="training-body">
                  <span className="training-title">{TRAINING_TYPE_LABEL[session.type]}</span>
                  {session.focus && <span className="training-focus">{session.focus}</span>}
                </span>
                <span className="training-meta">{session.durationMinutes}m</span>
              </button>
            ))}
          </div>
        )}

        {selectedMatches.length === 0 && selectedTraining.length === 0 ? (
          <p className="muted small">Nothing scheduled. Tap “+ Match” to add one.</p>
        ) : (
          <div className="list">
            {selectedMatches.map((m) => (
              <MatchCard
                key={m.id}
                match={m}
                now={now}
                onOpen={() => onOpenMatch(m)}
                onEnterResult={() => onEnterResult(m)}
              />
            ))}
          </div>
        )}
      </div>

      {next ? (
        <div className="next-up">
          <div className="next-label">Next up · {countdown(kickoffAt(next.date, next.time), now)}</div>
          <MatchCard match={next} showDate now={now} onOpen={() => onOpenMatch(next)} />
        </div>
      ) : matches.length === 0 ? (
        <EmptyState
          icon="⚽"
          title="No matches yet"
          message="Add your fixtures and they'll show up on the calendar. After kickoff the app will ask you for the result."
          action={
            <button className="primary-btn" onClick={() => onAddMatch(todayIso)}>
              Add your first match
            </button>
          }
        />
      ) : null}
    </div>
  );
}
