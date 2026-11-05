import { Bone, Skeleton, SkeletonCards, SkeletonRows, SkeletonSection, lineWidth } from '../ui';

/**
 * The academy's screens in outline while their lists come from the server -
 * the same sections, rows and tables, so nothing jumps when they arrive.
 */

/** Squads (coloured tiles with a head count), then everyone on the books. */
export function PlayersSkeleton() {
  return (
    <Skeleton label="Loading players…">
      <SkeletonSection title={80}>
        <SkeletonRows rows={2} trail="count" />
      </SkeletonSection>
      <SkeletonSection title={96}>
        <SkeletonRows rows={5} lead="circle" trail="chip" />
      </SkeletonSection>
    </Skeleton>
  );
}

/** The academy's leagues and tournaments. */
export function CompetitionsSkeleton() {
  return (
    <Skeleton label="Loading competitions…">
      <SkeletonSection title={124}>
        <SkeletonRows rows={3} />
      </SkeletonSection>
    </Skeleton>
  );
}

/** People on the staff: a face, a username, a role. */
export function StaffSkeleton() {
  return (
    <Skeleton label="Loading the staff…">
      <SkeletonRows rows={3} lead="circle" sub={false} trail="chip" />
    </Skeleton>
  );
}

/** The leaderboard: its filters, then ranked players with their number. */
export function LeaderboardSkeleton() {
  return (
    <Skeleton label="Loading players' stats…">
      <div className="stats-filters">
        <Bone w="100%" h={44} r={12} />
        <Bone w="100%" h={44} r={12} />
        <Bone w="100%" h={44} r={12} />
      </div>
      <Bone w="100%" h={32} r={9} />
      <div className="sk-chips">
        {[58, 92, 78, 104, 70].map((w, i) => (
          <Bone key={i} w={w} h={34} r={17} />
        ))}
      </div>
      <SkeletonSection title={100}>
        <TableRowsSkeleton rows={5} rank />
      </SkeletonSection>
    </Skeleton>
  );
}

/** A competition's table, before its results are in. */
export function StandingsSkeleton() {
  return (
    <Skeleton label="Loading the table…">
      <SkeletonSection title={64}>
        <TableRowsSkeleton rows={6} />
      </SkeletonSection>
    </Skeleton>
  );
}

/** Rows of a table: position, a name, and the numbers at the end. */
function TableRowsSkeleton({ rows, rank = false }: { rows: number; rank?: boolean }) {
  return (
    <div className="sk-table">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="sk-table-row">
          {rank && <Bone w={18} h={18} r={5} />}
          <Bone w={14} h={12} />
          <span className="sk-lines">
            <Bone w={lineWidth(i)} h={13} />
            {rank && <Bone w={lineWidth(i + 3, 24)} h={10} />}
          </span>
          {rank ? (
            <Bone w={34} h={22} r={6} />
          ) : (
            <>
              <Bone w={16} h={12} />
              <Bone w={16} h={12} />
              <Bone w={22} h={14} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

/** Cards in a stack - competitions for a family, academies to review, team picks, documents. */
export function CardsSkeleton({ label, count = 3 }: { label: string; count?: number }) {
  return (
    <Skeleton label={label}>
      <SkeletonCards count={count} />
    </Skeleton>
  );
}

/** The "Getting started" list, until it's known which steps are done. */
export function ChecklistSkeleton() {
  return (
    <Skeleton label="Checking what's set up…">
      <SkeletonSection title={118}>
        <div className="sk-checklist">
          {[0, 1, 2].map((i) => (
            <div key={i} className="sk-check">
              <Bone w={22} h={22} circle />
              <Bone w={lineWidth(i + 1)} h={13} />
            </div>
          ))}
        </div>
      </SkeletonSection>
    </Skeleton>
  );
}
