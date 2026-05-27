/**
 * timer.js — Unit production timer.
 *
 * A single setInterval drives two accumulators simultaneously:
 *   - elapsedSeconds: net working time for the current unit
 *   - pauseSeconds:   total pause time for the current unit
 *
 * `state.isPaused` determines which counter increments each tick.
 * This avoids running two separate intervals and keeps the counters in sync.
 *
 * Depends on: state.js (state, inputs)
 */

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Returns a zero-padded HH:mm:ss string from a raw second count. */
function formatTime(totalSeconds) {
    const hrs  = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
    const mins = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
    const secs = (totalSeconds % 60).toString().padStart(2, '0');
    return `${hrs}:${mins}:${secs}`;
}

// ─── Timer Controls ───────────────────────────────────────────────────────────

function startTimer() {
    stopTimer();
    state.isPaused = false;

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) btnPause.textContent = '⏸';

    state.timerInterval = setInterval(() => {
        if (state.isPaused) {
            state.pauseSeconds++;
        } else {
            state.elapsedSeconds++;
        }
        updateTimerUI();
    }, 1000);
}

function stopTimer() {
    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function resetTimer() {
    stopTimer();
    state.elapsedSeconds = 0;
    state.pauseSeconds   = 0;
    state.isPaused       = false;

    const btnPause = document.getElementById('btn-pause');
    if (btnPause) {
        btnPause.textContent = '⏸';
        btnPause.classList.remove('paused');
    }

    updateTimerUI();
}

// ─── UI Sync ──────────────────────────────────────────────────────────────────

function updateTimerUI() {
    inputs.unitTimer.textContent = formatTime(state.elapsedSeconds);

    // The pause overlay has its own counter display
    if (state.isPaused) {
        const pauseEl = document.getElementById('active-pause-timer');
        if (pauseEl) pauseEl.textContent = formatTime(state.pauseSeconds);
    }
}
