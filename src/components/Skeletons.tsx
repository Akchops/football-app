import { coachReady } from '../lib/ai';
import { Bone, Skeleton, SkeletonCards, SkeletonRows, Waiting } from './ui';
import { ShieldIcon } from './icons';

/**
 * Screens in outline, for the parts of the app that download only when first
 * opened (the Coach, the academy area). They live in the main bundle so
 * they're on the phone already when the real screen isn't yet.
 */

/** The Coach while its code downloads: the note, the coach's hello, the suggestions - or the "switch it on" card. */
export function CoachSkeleton() {
  if (!coachReady()) {
    return (
      <div className="screen">
        <div className="screen-head">
          <h1>Coach</h1>
        </div>
        <Skeleton label="Opening the coach…" className="sk-coach-off">
          <Bone w={64} h={64} circle className="sk-center" />
          <Bone w={210} h={22} className="sk-center" />
          <div className="sk-lines sk-center-lines">
            <Bone w="88%" h={13} />
            <Bone w="94%" h={13} />
            <Bone w="80%" h={13} />
            <Bone w="62%" h={13} />
          </div>
          <Bone w={136} h={50} r={14} className="sk-center" />
        </Skeleton>
      </div>
    );
  }
  return (
    <div className="screen coach-screen">
      <div className="screen-head">
        <h1>Coach</h1>
      </div>
      <Skeleton label="Opening the coach…" className="sk-thread">
        <div className="sk-lines sk-center-lines sk-note">
          <Bone w="86%" h={10} />
          <Bone w="72%" h={10} />
        </div>
        <div className="sk-bubble-row">
          <Bone w={28} h={28} circle />
          <div className="sk-bubble">
            <Bone w="94%" h={13} />
            <Bone w="86%" h={13} />
            <Bone w="90%" h={13} />
            <Bone w="38%" h={13} />
          </div>
        </div>
        <div className="sk-chips">
          <Bone w={152} h={38} r={19} />
          <Bone w={200} h={38} r={19} />
        </div>
      </Skeleton>
    </div>
  );
}

/** The academy home in outline: its badge and numbers, its sections, its join code. */
export function AcademyHomeSkeleton({ label = 'Opening the academy…' }: { label?: string }) {
  return (
    <div className="screen">
      <Skeleton label={label}>
        <div className="ac-hero sk-hero">
          <div className="ac-hero-top">
            <Bone w={60} h={60} r={16} />
            <div className="sk-lines">
              <Bone w="78%" h={22} />
              <Bone w="48%" h={13} />
              <Bone w="62%" h={13} />
            </div>
          </div>
          <div className="ac-hero-stats">
            {[0, 1, 2].map((i) => (
              <span key={i} className="ac-hero-stat sk-stat">
                <Bone w={34} h={30} r={8} />
                <Bone w={52} h={9} />
              </span>
            ))}
          </div>
        </div>
        <SkeletonRows rows={3} sub={false} trail="count" />
        <SkeletonCards count={1} />
      </Skeleton>
    </div>
  );
}

/**
 * The academy area while its code downloads. With an academy already saved on
 * this phone it opens straight onto its home, so that's the outline; on a
 * phone that hasn't opened one yet there's no telling what comes first
 * (signing in, a username, an invite), so it just says it's opening.
 */
export function AcademyShellSkeleton() {
  let known = false;
  try {
    known = Boolean(localStorage.getItem('matchday.academy.v1'));
  } catch {
    // Private mode: nothing saved, so nothing to outline.
  }
  return (
    <div className={known ? 'app academy-app with-nav' : 'app academy-app'}>
      <header className="topbar">
        <div className="topbar-titles">
          {known ? (
            <div className="sk-switch" aria-hidden="true">
              <Bone w={32} h={32} r={9} />
              <span className="sk-lines">
                <Bone w={130} h={14} />
                <Bone w={92} h={10} />
              </span>
            </div>
          ) : (
            <div className="brand">
              <span className="brand-mark">
                <ShieldIcon />
              </span>
              <span>Matchday Academy</span>
            </div>
          )}
        </div>
      </header>
      <main className="content">
        {known ? (
          <AcademyHomeSkeleton />
        ) : (
          <div className="screen">
            <Waiting text="Opening the academy…" />
          </div>
        )}
      </main>
      {known && <TabbarSkeleton />}
    </div>
  );
}

/** The floating tab bar with its tabs still to come. */
export function TabbarSkeleton() {
  const tab = (key: number) => (
    <span key={key} className="tab sk-tab">
      <Bone w={24} h={24} circle />
      <Bone w={40} h={8} />
    </span>
  );
  return (
    <nav className="tabbar sk-tabbar" aria-hidden="true">
      {tab(0)}
      {tab(1)}
      <span className="add-slot">
        <Bone w={58} h={58} circle className="sk-add" />
      </span>
      {tab(2)}
      {tab(3)}
    </nav>
  );
}
