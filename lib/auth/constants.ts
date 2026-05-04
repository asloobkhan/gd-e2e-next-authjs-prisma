// Absolute lifetime of a session — refresh-equivalent. Hit this and the
// session is gone regardless of activity.
export const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Idle timeout — if the session goes longer than this without any
// authenticated request, it's wiped on next access.
export const IDLE_TIMEOUT_MS = 60 * 60 * 1000; // 1 hour

// Throttle for sliding-window updates: don't bump lastActivityAt more
// than once per this interval. Cuts UPDATE traffic on the sessions
// table from "every request" to "at most once per minute per session".
export const ACTIVITY_THROTTLE_MS = 60 * 1000; // 1 minute
