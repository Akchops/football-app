/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />

// Stamped in at build time so a running app can say which build it is.
declare const __BUILD_ID__: string;
/** VITE_ACADEMY === 'true' at build time; see src/lib/features.ts. */
declare const __ACADEMY__: boolean;
