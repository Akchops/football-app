/**
 * The Academy release - competition tables, academies and everything that comes
 * with them - was built in the open and switched on all at once. The deploy
 * sets VITE_ACADEMY to 'true' (.github/workflows/deploy.yml); a repository
 * variable VITE_ACADEMY=false turns it off again, and a build without it leaves
 * all of it out. The academy parts also need accounts, so they show only once
 * the Supabase project is set up.
 */
export const ACADEMY: boolean = __ACADEMY__;
