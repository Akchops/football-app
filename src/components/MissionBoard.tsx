import { useMemo } from 'react';
import { useStore } from '../store/AppStore';
import type { PositionGroup } from '../types';
import { currentMissions, rankFor, starTotals, type MissionContext } from '../lib/missions';
import { Section } from './ui';

export function useMissionContext(group: PositionGroup, now: Date): MissionContext {
  const { matches, training, settings } = useStore();
  return useMemo(
    () => ({ matches, training, group, weekStartsOn: settings.weekStartsOn, now }),
    [matches, training, group, settings.weekStartsOn, now],
  );
}

/**
 * Stars, rank and the missions on the go. The point is to make training and
 * logging results feel like they're going somewhere.
 */
export function MissionBoard({ group, now }: { group: PositionGroup; now: Date }) {
  const ctx = useMissionContext(group, now);
  const stars = useMemo(() => starTotals(ctx), [ctx]);
  const missions = useMemo(() => currentMissions(ctx), [ctx]);
  const rank = rankFor(stars.total);

  const toNext = rank.next === null ? 0 : rank.next - stars.total;
  const spanFrom = rank.from;
  const spanTo = rank.next ?? rank.from + 1;
  const rankPct = rank.next === null ? 100 : Math.round(((stars.total - spanFrom) / (spanTo - spanFrom)) * 100);

  const weekly = missions.filter((m) => m.period === 'week');
  const monthly = missions.filter((m) => m.period === 'month');
  const doneThisWeek = weekly.filter((m) => m.complete).length;

  const list = (title: string, items: typeof missions, sub: string) => (
    <div className="mission-group">
      <div className="mission-group-head">
        <h3>{title}</h3>
        <span className="muted small">{sub}</span>
      </div>
      {items.map((mission) => {
        const pct = Math.round((mission.current / mission.target) * 100);
        return (
          <div key={mission.id} className={mission.complete ? 'mission done' : 'mission'}>
            <div className="mission-top">
              <span className="mission-label">
                {mission.complete && <span className="mission-tick" aria-hidden="true">✓</span>}
                {mission.label}
              </span>
              <span className="mission-reward">
                {'★'.repeat(mission.stars)}
              </span>
            </div>
            <div className="mission-track">
              <div className="mission-fill" style={{ width: `${pct}%` }} />
            </div>
            <div className="mission-foot">
              <span>{mission.detail}</span>
              <span className="mission-progress">
                {mission.current} / {mission.target}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <Section title="Missions">
      <div className="rank-card">
        <div className="rank-top">
          <div className="star-total">
            <span className="star-icon" aria-hidden="true">★</span>
            <span className="star-count">{stars.total}</span>
            <span className="star-word">stars</span>
          </div>
          <div className="rank-name">
            <strong>{rank.name}</strong>
            <span>
              {rank.next === null
                ? 'Top rank reached'
                : `${toNext} more star${toNext === 1 ? '' : 's'} to ${rank.nextName}`}
            </span>
          </div>
        </div>

        <div className="rank-track">
          <div className="rank-fill" style={{ width: `${rankPct}%` }} />
        </div>

        <div className="star-split">
          <span>
            <strong>{stars.milestone}</strong> from milestones
          </span>
          <span>
            <strong>{stars.mission}</strong> from missions
          </span>
        </div>
      </div>

      {list('This week', weekly, `${doneThisWeek} of ${weekly.length} done`)}
      {list('This month', monthly, `${monthly.filter((m) => m.complete).length} of ${monthly.length} done`)}
    </Section>
  );
}

/** Compact star count for the home screen header. */
export function StarBadge({ group, now }: { group: PositionGroup; now: Date }) {
  const ctx = useMissionContext(group, now);
  const stars = useMemo(() => starTotals(ctx), [ctx]);
  const rank = rankFor(stars.total);
  return (
    <span className="star-badge" title={`${rank.name} — ${stars.total} stars`}>
      <span aria-hidden="true">★</span>
      {stars.total}
    </span>
  );
}
