/**
 * state.js — Shared application state, DOM cache, and global constants.
 *
 * All modules read from and write to `state` directly. Keeping it in a single
 * object makes the data flow explicit and avoids scattered module-level
 * variables that are hard to trace.
 *
 * DOM elements are cached here at parse time (scripts load at end of <body>,
 * so the elements already exist) to avoid repeated querySelector calls.
 */

// ─── Constants ────────────────────────────────────────────────────────────────

/** Admin password — stored client-side because there is no backend auth layer. */
const ADMIN_PASSWORD = 'PCP2000';

/**
 * Sessions older than this are treated as a new work day.
 * Prevents a stale localStorage timestamp from inflating the journey timer
 * if the operator logs in the next morning without a fresh reload.
 */
const SESSION_TIMEOUT_SECONDS = 4 * 60 * 60; // 4 hours

// ─── App State ────────────────────────────────────────────────────────────────

const state = {
    // Session
    activeOperator:    null,
    activeOM:          null,
    activeOperation:   null,

    // Current unit being tracked
    currentSerial:     null,
    unitStartTime:     null,

    // Timer (shared interval drives both elapsed and pause counters)
    timerInterval:     null,
    elapsedSeconds:    0,
    pauseSeconds:      0,
    isPaused:          false,
    currentPauseReason: null,

    // OM progress for the current session
    realizedCount:     0,
    totalPlanned:      0,

    // In-memory history for the current production screen session.
    // Persisted separately in IndexedDB via db.saveScan().
    history:           []
};

// ─── DOM Cache ────────────────────────────────────────────────────────────────

const screens = {
    login:      document.getElementById('screen-login'),
    setup:      document.getElementById('screen-setup'),
    production: document.getElementById('screen-production'),
    admin:      document.getElementById('screen-admin')
};

const inputs = {
    operatorId:       document.getElementById('operator-id'),
    omId:             document.getElementById('om-id'),
    operation:        document.getElementById('operation-select'),
    currentSerial:    document.getElementById('current-serial'),
    unitTimer:        document.getElementById('unit-timer'),
    progressText:     document.getElementById('prod-progress-text'),
    progressBar:      document.getElementById('prod-progress-bar'),
    historyContainer: document.getElementById('production-history')
};

const buttons = {
    login:      document.getElementById('btn-login'),
    start:      document.getElementById('btn-start-production'),
    backLogin:  document.getElementById('btn-back-login'),
    finishUnit: document.getElementById('btn-finish-unit'),
    pause:      document.getElementById('btn-pause'),
    forceFinish: document.getElementById('btn-force-finish')
};

// ─── Utilities ────────────────────────────────────────────────────────────────

/**
 * Strips leading zeros from a barcode/ID value.
 *
 * Scanners often emit zero-padded serials (e.g. "00123") while the master data
 * stores them without padding ("123"). Normalising on both ends ensures lookups
 * match regardless of how the value was entered.
 */
const sanitizeCode = (code) => {
    if (!code) return '';
    return code.toString().trim().replace(/^0+/, '') || '0';
};
