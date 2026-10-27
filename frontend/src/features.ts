/**
 * Feature flags, set at build time in frontend/.env.local, e.g. VITE_FEATURE_COMPARE=true.
 * FEATURE_COMPARE: the Compare models page (a placeholder until both detectors can be
 * compared on the same clips). Off by default.
 */
export const FEATURE_COMPARE = import.meta.env.VITE_FEATURE_COMPARE === 'true'
