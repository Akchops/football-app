// Demo academy for capturing the academy screens without a backend. Everyone and everything here is
// fictional. Injected before the app loads; the academy module's academyApi() returns this object.
(() => {
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pick = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const stamp = '2026-11-01T10:00:00.000Z';
  const ME = 'u-sam';

  const crest = 'data:image/svg+xml;base64,' + btoa(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">
<rect width="120" height="120" rx="26" fill="#0f2a4a"/>
<path d="M60 18 L94 30 V60 C94 82 79 96 60 104 C41 96 26 82 26 60 V30 Z" fill="#163d6b" stroke="#f2c14e" stroke-width="5"/>
<text x="60" y="76" font-family="Arial Black, Arial" font-weight="900" font-size="40" text-anchor="middle" fill="#f2c14e">K</text>
</svg>`);

  const academy = {
    id: 'acad-kb', name: 'Kingsbridge Football Academy', town: 'Bristol', country: 'England', contactEmail: 'office@example.com',
    ageGroups: ['U12', 'U13', 'U14', 'U15', 'U16'], logo: crest, joinCode: 'KB7Q2X', verification: 'verified',
    verificationNote: '', verifiedAt: '2026-09-14T10:00:00.000Z', role: 'owner',
  };

  const people = [
    ['Alex Carter', 'GK'], ['Jayden Okafor', 'CB'], ['Leo Martins', 'CB'], ['Sami Haddad', 'LB'], ['Theo Walsh', 'RB'],
    ['Noah Bennett', 'CDM'], ['Arjun Mehta', 'CM'], ['Kai Robinson', 'CAM'], ['Mateo Silva', 'LW'], ['Riley Evans', 'RW'],
    ['Zane Ahmed', 'ST'], ['Oscar Nowak', 'ST'], ['Ethan Clarke', 'GK'], ['Finn Doyle', 'CM'], ['Isaac Boateng', 'RW'], ['Luca Rossi', 'CB'],
  ];
  const status = (i) => (i < 12 ? 'linked' : i < 14 ? 'roster' : i === 14 ? 'invited' : 'requested');
  const players = people.map(([name, position], i) => ({
    id: `ap-${i}`, playerId: status(i) === 'roster' ? null : `pl-${i}`, name, position, ageGroup: 'U14', status: status(i),
    createdAt: stamp, consentAt: status(i) === 'linked' ? stamp : null,
  }));
  const squads = [
    { id: 'sq-elite', name: 'U14 Elite', ageGroup: 'U14', coachIds: [ME, 'u-jo'], memberIds: players.slice(0, 12).map((p) => p.id) },
    { id: 'sq-dev', name: 'U14 Development', ageGroup: 'U14', coachIds: ['u-jo'], memberIds: players.slice(10, 16).map((p) => p.id) },
    { id: 'sq-cup', name: 'Dubai Cup squad', ageGroup: 'U14', coachIds: [ME], memberIds: players.slice(0, 10).map((p) => p.id) },
  ];
  const staff = [
    { userId: ME, username: 'sam_hughes', role: 'owner', isMe: true },
    { userId: 'u-dmitri', username: 'dmitri_k', role: 'manager', isMe: false },
    { userId: 'u-jo', username: 'coach_jo', role: 'coach', isMe: false },
    { userId: 'u-kim', username: 'office_kim', role: 'admin', isMe: false },
  ];
  const pendingStaff = [{ id: 'ps-1', username: 'coach_lee', role: 'coach', invitedBy: 'sam_hughes' }];

  // The team's season: the same fixtures for everyone in the squad.
  const OPP = ['Oakfield Rangers', 'Hillcrest', 'Vale FC', 'Barton Athletic', 'Dockside Rovers', 'Northside Rangers', 'Old Boys', 'Riverside FC', 'Eastfield Town', 'Kingsway United'];
  const fixtures = OPP.map((opponent, k) => {
    const d = new Date(2026, 8, 6 + k * 7);
    const gf = [3, 1, 2, 0, 4, 2, 1, 3, 2, 1][k];
    const ga = [1, 1, 0, 2, 0, 2, 0, 1, 1, 3][k];
    return { opponent, date: d.toISOString().slice(0, 10), gf, ga, venue: k % 2 ? 'away' : 'home' };
  });
  const groupOf = (pos) => (pos === 'GK' ? 'goalkeeper' : ['RB', 'CB', 'LB'].includes(pos) ? 'defender' : ['CDM', 'CM', 'CAM'].includes(pos) ? 'midfielder' : 'forward');
  const league = (i) => ({
    id: `comp-${i}`, name: 'Northern Junior League', type: 'league', season: '2026', ageGroup: 'U14', color: '#38bdf8', notes: '',
    archived: false, placing: '', startDate: '', teamId: `team-${i}`, location: '', matchLength: 70, pointsWin: 3, pointsDraw: 1,
    createdAt: stamp, updatedAt: stamp, deletedAt: null,
  });
  const recordFor = (i) => {
    const [name, position] = people[i];
    const group = groupOf(position);
    const matches = fixtures.map((f, k) => {
      const m = {};
      if (group === 'goalkeeper') Object.assign(m, { saves: pick(2, 7), conceded: f.ga, claims: pick(0, 3) });
      if (group === 'defender') Object.assign(m, { tackles: pick(2, 7), interceptions: pick(1, 5), clearances: pick(2, 8), blocks: pick(0, 2) });
      if (group === 'midfielder') Object.assign(m, { chancesCreated: pick(1, 5), goals: rnd() < 0.25 ? 1 : 0, assists: rnd() < 0.3 ? 1 : 0, tackles: pick(1, 5) });
      if (group === 'forward') Object.assign(m, { goals: rnd() < 0.55 ? pick(1, 2) : 0, assists: rnd() < 0.3 ? 1 : 0, shots: pick(2, 6), shotsOnTarget: pick(1, 4) });
      return {
        id: `m-${i}-${k}`, competitionId: `comp-${i}`, teamId: `team-${i}`, opponent: f.opponent, date: f.date, time: '10:30', venue: f.venue,
        location: '', durationMinutes: 70, status: 'played', notes: '', stage: null, stageDetail: '', remindAfter: null,
        createdAt: stamp, updatedAt: stamp, deletedAt: null,
        result: {
          goalsFor: f.gf, goalsAgainst: f.ga, penaltiesFor: null, penaltiesAgainst: null, didPlay: true, minutes: pick(50, 70), position,
          positionGroup: group, rating: pick(6, 9), motm: rnd() < 0.12, yellowCards: 0, redCards: 0, metrics: m,
        },
      };
    });
    return {
      playerId: `pl-${i}`,
      profile: {
        updatedAt: stamp, name: name.split(' ')[0], photo: '', dateOfBirth: '2012-05-01', ageGroup: 'U14', ageGroupYear: 2026,
        position, positionGroup: group, onboardedAt: stamp,
      },
      matches,
      competitions: [league(i)],
    };
  };
  const records = Object.fromEntries(players.filter((p) => p.status === 'linked').map((p, idx) => [p.playerId, recordFor(Number(p.id.slice(3)))]));

  const competitions = [
    { id: 'ac-league', academyId: academy.id, squadId: 'sq-elite', name: 'Northern Junior League', type: 'league', season: '2026', teamName: 'Kingsbridge U14', pointsWin: 3, pointsDraw: 1 },
    { id: 'ac-cup', academyId: academy.id, squadId: 'sq-cup', name: 'Dubai Cup', type: 'tournament', season: '2026', teamName: 'Kingsbridge', pointsWin: 3, pointsDraw: 1 },
  ];
  const r = (home, hg, ag, away, k) => ({
    id: `res-${k}`, competitionId: 'ac-league', home, away, homeGoals: hg, awayGoals: ag, date: fixtures[k % 10].date,
    stage: null, stageDetail: '', createdAt: stamp, updatedAt: stamp, deletedAt: null,
  });
  const K = 'Kingsbridge U14';
  const results = [
    r(K, 3, 1, 'Oakfield Rangers', 0), r('Hillcrest', 1, 1, K, 1), r(K, 2, 0, 'Vale FC', 2), r('Barton Athletic', 2, 0, K, 3),
    r(K, 4, 0, 'Dockside Rovers', 4), r('Oakfield Rangers', 2, 2, 'Hillcrest', 0), r('Vale FC', 1, 0, 'Barton Athletic', 1),
    r('Dockside Rovers', 0, 3, 'Oakfield Rangers', 2), r('Hillcrest', 2, 1, 'Vale FC', 3), r('Barton Athletic', 1, 1, 'Dockside Rovers', 4),
    r('Oakfield Rangers', 1, 0, 'Barton Athletic', 5), r('Vale FC', 2, 2, 'Dockside Rovers', 6),
  ];
  const selections = [
    { id: 'sel-1', squadId: 'sq-elite', name: 'Saturday v Oakfield', playerIds: ['ap-0', 'ap-4', 'ap-1', 'ap-2', 'ap-3', 'ap-5', 'ap-6', 'ap-7', 'ap-9', 'ap-8', 'ap-10'],
      notes: 'Meet 9:45, red kit.', updatedAt: stamp },
  ];

  const ok = async () => {};
  window.__MOCK_ACADEMY_API = {
    username: async () => 'sam_hughes',
    usernameAvailable: async () => true,
    claimUsername: async (n) => n,
    staffAcademies: async () => (window.__MOCK_MODE === 'family' ? [] : [academy]),
    createAcademy: async () => academy.id, updateAcademy: ok, deleteAcademy: ok, newJoinCode: async () => academy.joinCode,
    staffInvitesForMe: async () => [], answerStaffInvite: ok,
    staff: async () => staff, pendingStaff: async () => pendingStaff, inviteStaff: ok, cancelStaffInvite: ok, setStaffRole: ok, removeStaff: ok, transferOwnership: ok,
    squads: async () => squads, createSquad: async () => 'sq-new', updateSquad: ok, deleteSquad: ok, setSquadCoach: ok, setSquadMember: ok,
    players: async () => players, addRosterPlayer: async () => 'ap-new', updatePlayer: ok, removePlayer: ok, invitePlayer: async () => 'ap-new', answerJoinRequest: ok,
    competitions: async () => competitions, saveCompetition: async () => 'ac-new', deleteCompetition: ok,
    results: async (id) => (id === 'ac-league' ? results : []), addResult: async () => 'res-new', updateResult: ok, deleteResult: ok,
    playerRecords: async (ids) => ids.map((id) => records[id]).filter(Boolean),
    selections: async () => selections, saveSelection: async () => 'sel-new', deleteSelection: ok,
    documents: async () => [], documentData: async () => '', uploadDocument: async () => 'doc', removeDocument: ok, submitForReview: ok,
    isAppAdmin: async () => false, requireVerification: async () => false, setRequireVerification: ok, academiesForReview: async () => [], reviewAcademy: ok,
    playerInvitesForMe: async () => (window.__MOCK_MODE === 'family'
      ? [{ id: 'pi-1', academyId: academy.id, academyName: academy.name, town: academy.town, verification: 'verified', invitedBy: 'sam_hughes' }] : []),
    answerPlayerInvite: ok, joinByCode: async () => 'jr-1', joinRequests: async () => [],
    memberships: async () => (window.__MOCK_MODE === 'family-linked'
      ? [{ linkId: 'l-1', academyId: academy.id, academyName: academy.name, verification: 'verified', town: academy.town, logo: crest,
        squads: [{ id: 'sq-elite', name: 'U14 Elite', mates: ['Jayden', 'Leo', 'Sami', 'Theo', 'Noah'] }] }] : []),
    leaveAcademy: ok,
  };
})();
