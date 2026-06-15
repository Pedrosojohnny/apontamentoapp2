/**
 * production.js — Production floor logic and admin rendering.
 *
 * Covers the full barcode-scan lifecycle:
 *   scan → validate → start unit → pause/resume → finish → persist
 *
 * Also owns the admin panel rendering (scan history table, edit modal,
 * and Excel export) because those all operate on the same `scans` data.
 *
 * Depends on: state.js, timer.js, db.js (window.db), scanner.js (window.scanner)
 */

// ─── Production Screen Init ───────────────────────────────────────────────────

async function initProductionMode() {
    // totalPlanned must come from IndexedDB — BAUER_DATA only holds demo entries
    const order = await window.db.getMasterOrder(state.activeOM);
    state.totalPlanned  = order ? order.quantidade : 0;
    state.history       = [];
    state.currentSerial = null;
    state.realizedCount = 0;

    resetTimer();

    document.getElementById('prod-operator-name').textContent = state.activeOperator.nome;
    document.getElementById('prod-om-id').textContent         = state.activeOM;
    document.getElementById('prod-operation-name').textContent =
        state.activeOperation.replace(/-/g, ' ').toUpperCase();

    inputs.currentSerial.textContent = 'AGUARDANDO BIP...';
    updateProgressUI();
    renderHistory();

    const canScan = await window.scanner.init();
    if (canScan) {
        const btnSwitch = document.getElementById('btn-switch-camera');
        if (btnSwitch) {
            btnSwitch.style.display = window.scanner.cameras.length > 1 ? 'block' : 'none';
        }
        window.scanner.start('reader', handleBarcodeScan);
    }

    // Switch-camera is production-specific; replace the handler each time
    // the screen re-initialises so it always points at the live callback.
    const btnSwitch = document.getElementById('btn-switch-camera');
    if (btnSwitch) {
        btnSwitch.onclick = () =>
            window.scanner.switch('reader', handleBarcodeScan);
    }
}

// ─── Barcode Handling ─────────────────────────────────────────────────────────

async function handleBarcodeScan(rawCode) {
    const code = sanitizeCode(rawCode);

    // A different serial was scanned while one is active.
    // Auto-finish the current piece so the operator does not need to
    // manually tap "Finalizar Peça" before moving to the next unit.
    if (state.currentSerial && state.currentSerial !== code) {
        await finishUnit();
        setTimeout(() => handleBarcodeScan(code), 500);
        return;
    }

    // Same serial scanned again — second scan acts as the finish trigger
    if (state.currentSerial === code) {
        await finishUnit();
        return;
    }

    // ── Pre-start validations ──────────────────────────────────────────────

    const qtyCheck = await window.db.checkQuantityLimit(state.activeOM, state.activeOperation);
    if (!qtyCheck.valid) {
        showValidationError(qtyCheck.error);
        return;
    }

    const masterOrder = await window.db.getMasterOrder(state.activeOM);
    if (masterOrder) {
        const seqCheck = await window.db.validateSequence(
            state.activeOM, code, state.activeOperation, masterOrder.itemCode
        );
        if (!seqCheck.valid) {
            // Pass the serial only for duplicate errors so the operator can
            // force-finish an in-progress unit from a previous shift.
            showValidationError(seqCheck.error, seqCheck.type === 'duplicate' ? code : null);
            return;
        }
    }

    startUnit(code);
}

function startUnit(code) {
    resetTimer();
    state.currentSerial = code;
    state.unitStartTime = new Date().toISOString();
    inputs.currentSerial.textContent = code;
    startTimer();
    if (buttons.finishUnit) buttons.finishUnit.disabled = false;
}

async function finishUnit() {
    if (!state.currentSerial) return;

    const now = new Date().toISOString();

    const record = {
        om:           state.activeOM,
        operadorId:   state.activeOperator.codigo,
        operadorNome: state.activeOperator.nome,
        operacao:     state.activeOperation,
        serial:       state.currentSerial,
        tempo:        state.elapsedSeconds,
        tempoPausa:   state.pauseSeconds,
        motivoPausa:  state.currentPauseReason || 'N/A',
        startTime:    state.unitStartTime,
        endTime:      now,
        // `timestamp` kept as a fallback for older records that predated `endTime`
        timestamp:    now
    };

    try {
        await window.db.saveScan(record);
    } catch (e) {
        console.error('Erro ao salvar apontamento:', e);
    }

    state.history.unshift(record);
    state.realizedCount++;

    renderHistory();
    updateProgressUI();

    // Persists the scan moment so the journey timer can be restored on next login
    localStorage.setItem(`lastBip_${state.activeOperator.codigo}`, now);

    state.currentSerial = null;
    state.unitStartTime = null;
    stopTimer();

    if (buttons.finishUnit) buttons.finishUnit.disabled = true;

    inputs.currentSerial.textContent = 'REGISTRADO!';
    setTimeout(() => {
        // Only revert if no new scan arrived during the 1.5 s window
        if (!state.currentSerial) inputs.currentSerial.textContent = 'AGUARDANDO BIP...';
    }, 1500);
}

// ─── Pause Flow ───────────────────────────────────────────────────────────────

function togglePause() {
    if (!state.currentSerial) return;
    if (!state.isPaused) {
        // Ask for a reason before pausing — the reason is stored with the record
        document.getElementById('pause-reason-modal').style.display = 'flex';
    } else {
        resumeWork();
    }
}

function startPause(reason) {
    state.isPaused          = true;
    state.currentPauseReason = reason;

    document.getElementById('pause-reason-modal').style.display  = 'none';
    document.getElementById('active-pause-reason').textContent   = `MOTIVO: ${reason.toUpperCase()}`;
    document.getElementById('active-pause-overlay').style.display = 'flex';

    const btn = document.getElementById('btn-pause');
    if (btn) {
        btn.textContent = '▶️';
        btn.classList.add('paused');
    }
}

function resumeWork() {
    state.isPaused = false;
    document.getElementById('active-pause-overlay').style.display = 'none';

    const btn = document.getElementById('btn-pause');
    if (btn) {
        btn.textContent = '⏸';
        btn.classList.remove('paused');
    }
}

// ─── Validation Feedback ──────────────────────────────────────────────────────

/**
 * Shows the blocking validation overlay.
 *
 * @param {string}      message - Human-readable reason for the block.
 * @param {string|null} serial  - When set, reveals the "Finalizar Operação"
 *   button so the operator can force-complete a duplicate unit from a prior shift.
 */
function showValidationError(message, serial = null) {
    document.getElementById('validation-error-msg').textContent = message;
    document.getElementById('validation-error-overlay').style.display = 'flex';

    if (serial) {
        buttons.forceFinish.style.display  = 'block';
        buttons.forceFinish.dataset.serial = serial;
    } else {
        buttons.forceFinish.style.display  = 'none';
        buttons.forceFinish.dataset.serial = '';
    }

    // Red body flash gives immediate tactile-like feedback on touchscreen tablets
    document.body.classList.add('error-flash');
    setTimeout(() => document.body.classList.remove('error-flash'), 500);
}

// ─── Production UI ────────────────────────────────────────────────────────────

function updateProgressUI() {
    inputs.progressText.textContent = `${state.realizedCount} / ${state.totalPlanned}`;
    const pct = state.totalPlanned > 0
        ? (state.realizedCount / state.totalPlanned) * 100
        : 0;
    inputs.progressBar.style.width = `${pct}%`;
}

function renderHistory() {
    const container = inputs.historyContainer;

    if (state.history.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 2rem;">
            Nenhum item produzido ainda.
        </div>`;
        return;
    }

    container.innerHTML = state.history.map(item => {
        const mins = Math.floor(item.tempo / 60);
        const secs = item.tempo % 60;
        return `
            <div class="glass" style="padding: 0.75rem 1rem; background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 700; font-size: 0.85rem; color: var(--accent-primary);">${item.serial}</div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">${new Date(item.endTime).toLocaleTimeString()}</div>
                </div>
                <div style="font-family: monospace; font-weight: 700;">${mins}:${secs.toString().padStart(2, '0')}</div>
            </div>
        `;
    }).join('');
}

// ─── Admin Panel ──────────────────────────────────────────────────────────────

async function renderAdminScans() {
    const container = document.getElementById('admin-scans-list');
    const scans     = await window.db.getScans();

    if (scans.length === 0) {
        container.innerHTML = `<div style="color: var(--text-muted); text-align: center; padding: 2rem;">
            Nenhum apontamento no banco de dados.
        </div>`;
        return;
    }

    // Spread before reversing to avoid mutating the IndexedDB result array
    container.innerHTML = `
        <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem; text-align: left;">
            <thead>
                <tr style="border-bottom: 1px solid var(--border); color: var(--accent-primary);">
                    <th style="padding: 0.5rem;">Data/Hora</th>
                    <th style="padding: 0.5rem;">OM</th>
                    <th style="padding: 0.5rem;">Operador</th>
                    <th style="padding: 0.5rem;">Operação</th>
                    <th style="padding: 0.5rem;">Serial</th>
                    <th style="padding: 0.5rem;">Produção</th>
                    <th style="padding: 0.5rem;">Pausa</th>
                    <th style="padding: 0.5rem;">Ações</th>
                </tr>
            </thead>
            <tbody>
                ${[...scans].reverse().map(s => `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.02);">
                        <td style="padding: 0.5rem;">${new Date(s.endTime || s.timestamp).toLocaleString()}</td>
                        <td style="padding: 0.5rem;">${s.om}</td>
                        <td style="padding: 0.5rem;">${s.operadorNome}</td>
                        <td style="padding: 0.5rem;">${s.operacao}</td>
                        <td style="padding: 0.5rem;">${s.serial}</td>
                        <td style="padding: 0.5rem; font-family: monospace;">${formatTime(s.tempo || 0)}</td>
                        <td style="padding: 0.5rem; font-family: monospace; color: var(--warning);">${formatTime(s.tempoPausa || 0)}</td>
                        <td style="padding: 0.5rem;">
                            <button class="btn btn-icon" onclick="openEditModal(${s.id})"
                                style="width: 30px; height: 30px; font-size: 0.8rem;" title="Editar">✏️</button>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

// Exposed globally so the inline onclick in renderAdminScans can reach it
window.openEditModal = openEditModal;

async function openEditModal(id) {
    const scans  = await window.db.getScans();
    const record = scans.find(s => s.id === id);
    if (!record) return;

    document.getElementById('edit-record-id').value   = id;
    document.getElementById('edit-om').textContent    = record.om;
    document.getElementById('edit-serial').textContent = record.serial;

    const endTime = record.endTime || record.timestamp;
    // Reconstruct startTime for records created before the field was introduced
    const startTime = record.startTime ||
        new Date(new Date(endTime).getTime() - record.tempo * 1000).toISOString();

    document.getElementById('edit-start-time').value    = startTime.slice(0, 16);
    document.getElementById('edit-end-time').value      = endTime.slice(0, 16);
    document.getElementById('edit-pause-minutes').value = Math.floor((record.tempoPausa || 0) / 60);
    document.getElementById('edit-pause-reason').value  = record.motivoPausa || 'N/A';

    calculateEditTime();
    document.getElementById('edit-modal').style.display = 'flex';
}

function calculateEditTime() {
    const start     = new Date(document.getElementById('edit-start-time').value);
    const end       = new Date(document.getElementById('edit-end-time').value);
    const pauseMins = parseInt(document.getElementById('edit-pause-minutes').value) || 0;

    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;

    const totalDiffSeconds = Math.floor((end - start) / 1000);
    const pauseSeconds     = pauseMins * 60;
    const workingSeconds   = Math.max(0, totalDiffSeconds - pauseSeconds);

    document.getElementById('edit-calculated-time').textContent = formatTime(workingSeconds);
    return { workingSeconds, pauseSeconds, start, end };
}

async function saveEdit() {
    const id     = document.getElementById('edit-record-id').value;
    const result = calculateEditTime();
    if (!result) return; // Guard: dates were invalid when the button was clicked

    const { workingSeconds, pauseSeconds, start, end } = result;
    const motivoPausa = document.getElementById('edit-pause-reason').value;

    if (workingSeconds < 0) {
        alert('O tempo de produção não pode ser negativo. Verifique as datas e a pausa.');
        return;
    }

    const scans     = await window.db.getScans();
    const oldRecord = scans.find(s => s.id === parseInt(id));

    await window.db.updateScan(id, {
        ...oldRecord,
        startTime:  start.toISOString(),
        endTime:    end.toISOString(),
        tempo:      workingSeconds,
        tempoPausa: pauseSeconds,
        motivoPausa
    });

    document.getElementById('edit-modal').style.display = 'none';
    renderAdminScans();
}

// ─── Excel Export ─────────────────────────────────────────────────────────────

function exportToExcel(scans) {
    const data = scans.map(s => {
        const start = s.startTime ? new Date(s.startTime) : null;
        const end   = new Date(s.endTime || s.timestamp);
        return {
            'Data':           end.toLocaleDateString(),
            'OM':             s.om,
            'ID Operador':    s.operadorId,
            'Operador':       s.operadorNome,
            'Operação':       s.operacao,
            'Serial':         s.serial,
            'Horário Início': start ? start.toLocaleTimeString() : '---',
            'Horário Fim':    end.toLocaleTimeString(),
            // SheetJS represents time as a fraction of a 24-hour day
            'Tempo Produção': (s.tempo      || 0) / 86400,
            'Tempo Pausa':    (s.tempoPausa || 0) / 86400,
            'Motivo Pausa':   s.motivoPausa || '---'
        };
    });

    const ws    = XLSX.utils.json_to_sheet(data);
    const range = XLSX.utils.decode_range(ws['!ref']);

    // Apply [hh]:mm:ss duration format to the two time columns (indices 8 and 9)
    for (let R = range.s.r + 1; R <= range.e.r; R++) {
        const cellI = XLSX.utils.encode_cell({ r: R, c: 8 });
        const cellJ = XLSX.utils.encode_cell({ r: R, c: 9 });
        if (ws[cellI]) ws[cellI].z = 'HH:mm:ss';
        if (ws[cellJ]) ws[cellJ].z = 'HH:mm:ss';
    }

    ws['!cols'] = [
        { wch: 12 }, { wch: 10 }, { wch: 12 }, { wch: 25 },
        { wch: 20 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
        { wch: 15 }, { wch: 15 }, { wch: 20 }
    ];

    const wb      = XLSX.utils.book_new();
    const dateStr = new Date().toLocaleDateString().replace(/\//g, '-');
    XLSX.utils.book_append_sheet(wb, ws, 'Apontamentos');
    XLSX.writeFile(wb, `Relatorio_Producao_BAUER_${dateStr}.xlsx`);
}
