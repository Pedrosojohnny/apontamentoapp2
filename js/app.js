/**
 * app.js — Application entry point.
 *
 * Responsibilities:
 *   - Bootstrap (DB init, first screen)
 *   - Wire up all DOM event listeners
 *   - Screen navigation (showScreen)
 *   - Login and setup screen logic
 *
 * Production floor logic lives in production.js.
 * Timer helpers live in timer.js.
 * Shared state and DOM cache live in state.js.
 *
 * Depends on: state.js, timer.js, production.js, db.js, auth.js, scanner.js, import.js
 */

// ─── Bootstrap ────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.db.init();
    } catch (e) {
        console.error('Erro ao inicializar banco de dados:', e);
    }
    setupEventListeners();
    showScreen('login');
});

// ─── Event Listeners ──────────────────────────────────────────────────────────

function setupEventListeners() {
    _bindNumpad();
    _bindLoginScreen();
    _bindSetupScreen();
    _bindFileUploads();
    _bindAdminPanel();
    _bindProductionButtons();
    _bindPauseModals();
    _bindEditModal();
}

// ── Numpad ────────────────────────────────────────────────────────────────────

function _bindNumpad() {
    document.querySelectorAll('.num-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            inputs.operatorId.value += btn.textContent;
            inputs.operatorId.focus();
        });
    });
}

// ── Login Screen ──────────────────────────────────────────────────────────────

function _bindLoginScreen() {
    buttons.login.addEventListener('click', handleLogin);
    inputs.operatorId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
}

// ── Setup Screen ──────────────────────────────────────────────────────────────

function _bindSetupScreen() {
    buttons.backLogin.addEventListener('click', () => {
        state.activeOperator = null;
        inputs.operatorId.value = '';
        showScreen('login');
        setTimeout(() => inputs.operatorId.focus(), 100);
    });

    inputs.omId.addEventListener('input', validateSetup);
    inputs.omId.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            validateSetup();
            if (!buttons.start.disabled) buttons.start.click();
        }
    });

    inputs.operation.addEventListener('change', validateSetup);

    buttons.start.addEventListener('click', () => {
        state.activeOM        = inputs.omId.value.trim();
        state.activeOperation = inputs.operation.value;
        showScreen('production');
    });
}

// ── File Uploads (barcode image testing) ──────────────────────────────────────

function _bindFileUploads() {
    const setupFileInput = document.getElementById('setup-file-input');
    const prodFileInput  = document.getElementById('prod-file-input');

    // Login screen doesn't have a static file input in the HTML, so create one
    const loginFileInput  = document.createElement('input');
    loginFileInput.type   = 'file';
    loginFileInput.accept = 'image/*';
    loginFileInput.style.display = 'none';
    document.body.appendChild(loginFileInput);

    document.getElementById('btn-upload-login').addEventListener('click', () => loginFileInput.click());
    document.getElementById('btn-upload-om').addEventListener('click',    () => setupFileInput.click());
    document.getElementById('btn-upload-test').addEventListener('click',  () => prodFileInput.click());

    loginFileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        await window.scanner.scanFile(e.target.files[0], (code) => {
            inputs.operatorId.value = code;
            handleLogin();
        });
        e.target.value = '';
    });

    setupFileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        await window.scanner.scanFile(e.target.files[0], (code) => {
            inputs.omId.value = sanitizeCode(code);
            validateSetup();
        });
        e.target.value = '';
    });

    prodFileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        await window.scanner.scanFile(e.target.files[0], handleBarcodeScan);
        e.target.value = '';
    });
}

// ── Admin Panel ───────────────────────────────────────────────────────────────

function _bindAdminPanel() {
    const passwordModal      = document.getElementById('password-modal');
    const adminPasswordInput = document.getElementById('admin-password');
    const passwordError      = document.getElementById('password-error');

    // Open password modal
    document.getElementById('btn-goto-admin').addEventListener('click', () => {
        adminPasswordInput.value    = '';
        passwordError.style.display = 'none';
        passwordModal.style.display = 'flex';
        setTimeout(() => adminPasswordInput.focus(), 100);
    });

    document.getElementById('btn-cancel-password').addEventListener('click', () => {
        passwordModal.style.display = 'none';
    });

    const handleAdminAuth = () => {
        if (adminPasswordInput.value === ADMIN_PASSWORD) {
            passwordModal.style.display = 'none';
            showScreen('admin');
            renderAdminScans();
        } else {
            passwordError.style.display = 'block';
            adminPasswordInput.value    = '';
            adminPasswordInput.focus();
        }
    };

    document.getElementById('btn-confirm-password').addEventListener('click', handleAdminAuth);
    adminPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleAdminAuth();
    });

    document.getElementById('btn-admin-back').addEventListener('click', () => showScreen('login'));

    // Master data sync
    const syncModal       = document.getElementById('sync-modal');
    const syncStatus      = document.getElementById('sync-status');
    const masterFileInput = document.getElementById('master-file-input');

    document.getElementById('btn-open-sync-admin').addEventListener('click', () => {
        syncStatus.textContent  = '';
        syncModal.style.display = 'flex';
    });

    document.getElementById('btn-close-sync').addEventListener('click', () => {
        syncModal.style.display = 'none';
    });

    document.getElementById('btn-select-master-file').addEventListener('click', () => masterFileInput.click());

    masterFileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        syncStatus.textContent = '⌛ Processando...';
        syncStatus.style.color = 'var(--accent-primary)';
        try {
            const result = await window.importer.importFromExcel(e.target.files[0]);
            syncStatus.textContent = `✅ Sucesso! ${result.ordersCount} OMs e ${result.routingsCount} roteiros carregados.`;
            syncStatus.style.color = 'var(--success)';
        } catch (err) {
            syncStatus.textContent = '❌ Erro ao importar. Verifique o formato da planilha.';
            syncStatus.style.color = 'var(--error)';
            console.error('Erro na importação:', err);
        }
        e.target.value = '';
    });

    // Export
    document.getElementById('btn-export-admin').addEventListener('click', async () => {
        const scans = await window.db.getScans();
        if (scans.length === 0) {
            alert('Nenhum dado para exportar.');
            return;
        }
        exportToExcel(scans);
    });

    // Clear database
    document.getElementById('btn-clear-db').addEventListener('click', async () => {
        const confirmed = confirm(
            'ATENÇÃO: Isso apagará todos os apontamentos salvos neste tablet.\n' +
            'Esta ação não pode ser desfeita. Deseja continuar?'
        );
        if (!confirmed) return;
        await window.db.clearScans();
        renderAdminScans();
        alert('Banco de dados de apontamentos limpo com sucesso.');
    });
}

// ── Production Buttons ────────────────────────────────────────────────────────

function _bindProductionButtons() {
    buttons.pause.addEventListener('click', (e) => {
        e.preventDefault();
        togglePause();
    });

    buttons.finishUnit.addEventListener('click', (e) => {
        e.preventDefault();
        finishUnit();
    });

    // When a duplicate scan is detected, the operator can force-complete a unit
    // that was started in a previous shift and never finished.
    buttons.forceFinish.addEventListener('click', () => {
        const code = buttons.forceFinish.dataset.serial;
        if (!code) return;
        document.getElementById('validation-error-overlay').style.display = 'none';
        startUnit(code);
    });

    document.getElementById('validation-error-overlay')
        .querySelector('.btn-primary')
        .addEventListener('click', () => {
            document.getElementById('validation-error-overlay').style.display = 'none';
        });
}

// ── Pause Modals ──────────────────────────────────────────────────────────────

function _bindPauseModals() {
    document.querySelectorAll('.pause-reason-btn').forEach(btn => {
        btn.addEventListener('click', () => startPause(btn.dataset.reason));
    });

    document.getElementById('btn-cancel-pause').addEventListener('click', () => {
        document.getElementById('pause-reason-modal').style.display = 'none';
    });

    document.getElementById('btn-resume-work').addEventListener('click', resumeWork);
}

// ── Edit Modal ────────────────────────────────────────────────────────────────

function _bindEditModal() {
    document.getElementById('btn-cancel-edit').addEventListener('click', () => {
        document.getElementById('edit-modal').style.display = 'none';
    });

    document.getElementById('edit-start-time').addEventListener('change', calculateEditTime);
    document.getElementById('edit-end-time').addEventListener('change', calculateEditTime);
    document.getElementById('edit-pause-minutes').addEventListener('input', calculateEditTime);
    document.getElementById('btn-save-edit').addEventListener('click', saveEdit);
}

// ─── Screen Navigation ────────────────────────────────────────────────────────

async function showScreen(screenId) {
    // Always stop any active scanner before switching screens to release the
    // camera lock — some browsers throw if you try to open a new instance
    // while the previous one is still running.
    try {
        await window.scanner.stop();
    } catch (e) {
        console.warn('Erro ao parar scanner:', e);
    }

    Object.values(screens).forEach(s => s.classList.remove('active'));
    if (!screens[screenId]) return;
    screens[screenId].classList.add('active');

    try {
        if (screenId === 'login') {
            const canScan = await window.scanner.init();
            if (canScan) {
                window.scanner.start('login-reader', (code) => {
                    inputs.operatorId.value = sanitizeCode(code);
                    handleLogin();
                });
            }
        } else if (screenId === 'setup') {
            // Reset cache so validateSetup always re-fetches from DB on screen entry
            lastValidatedOM = null;
            inputs.operation.innerHTML = '<option value="" disabled selected hidden>Selecione a etapa...</option>';
            inputs.operation.disabled = true;
            buttons.start.disabled = true;
            renderOpenOrders();
            // Re-validate any OM already in the field (e.g. from a previous session)
            if (inputs.omId.value.trim()) validateSetup();
            const canScan = await window.scanner.init();
            if (canScan) {
                window.scanner.start('setup-reader', (code) => {
                    inputs.omId.value = sanitizeCode(code);
                    validateSetup();
                });
            }
        } else if (screenId === 'production') {
            initProductionMode();
        }
    } catch (err) {
        console.error('Erro ao iniciar scanner:', err);
    }
}

// ─── Login ────────────────────────────────────────────────────────────────────

function handleLogin() {
    let id = inputs.operatorId.value.trim();
    if (!id) return;

    // Normalize leading zeros that scanners may emit
    if (id.startsWith('0')) {
        id = sanitizeCode(id);
        inputs.operatorId.value = id;
    }

    const operator = window.Auth.login(id);
    if (!operator) {
        document.getElementById('login-error').style.display = 'block';
        return;
    }

    state.activeOperator = operator;
    document.getElementById('welcome-msg').textContent    = `Olá, ${operator.nome}`;
    document.getElementById('login-error').style.display = 'none';

    // Recover journey elapsed time so the operator can see how long they've been
    // on the line even after switching OMs or returning from a short break.
    const lastBip = localStorage.getItem(`lastBip_${operator.codigo}`);
    if (lastBip) {
        const diffSecs = Math.floor((Date.now() - new Date(lastBip).getTime()) / 1000);
        state.elapsedSeconds = diffSecs < SESSION_TIMEOUT_SECONDS ? diffSecs : 0;
    } else {
        state.elapsedSeconds = 0;
    }

    startTimer();
    showScreen('setup');
    setTimeout(() => inputs.omId.focus(), 500);
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

// Tracks the last OM that was successfully looked up to avoid redundant DB calls
// while the operator is still typing the same OM number.
let lastValidatedOM = null;

async function validateSetup() {
    let om = inputs.omId.value.trim();

    if (om.length > 0 && om.startsWith('0')) {
        om = sanitizeCode(om);
        inputs.omId.value = om;
    }

    if (om.length < 1) {
        lastValidatedOM = null;
        const el = document.getElementById('om-details');
        if (el) el.style.display = 'none';
        inputs.operation.disabled = true;
        inputs.operation.innerHTML = '<option value="" disabled selected hidden>Selecione a etapa...</option>';
        buttons.start.disabled = true;
        return;
    }

    // Only re-query the DB when the OM value actually changed
    if (om !== lastValidatedOM) {
        try {
            const order     = await window.db.getMasterOrder(om);
            const detailsEl = document.getElementById('om-details');
            const itemEl    = document.getElementById('detail-item');
            const qtyEl     = document.getElementById('detail-qty');

            if (order) {
                lastValidatedOM = om;
                if (detailsEl) detailsEl.style.display = 'block';
                if (itemEl)    itemEl.textContent       = order.descricao || 'Item Desconhecido';
                if (qtyEl)     qtyEl.textContent        = order.quantidade || '0';

                if (order.itemCode) {
                    const routings = await window.db.getMasterRoutings(order.itemCode.toString().trim());
                    const validOps = (routings || [])
                        .filter(r => {
                            const op = r.operacao.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
                            // TESTE and DISTRIBUICAO steps are handled by other teams and must be hidden
                            return !op.includes('TESTE') && !op.includes('DISTRIBUICAO');
                        })
                        .sort((a, b) => a.sequencia - b.sequencia);

                    inputs.operation.innerHTML =
                        '<option value="" disabled selected hidden>Selecione a etapa...</option>' +
                        validOps.map((r, i) =>
                            `<option value="${r.operacao}">${i + 1}. ${r.operacao}</option>`
                        ).join('');
                    inputs.operation.disabled = validOps.length === 0;

                    // Auto-select when the OM has only a single valid operation
                    if (validOps.length === 1) inputs.operation.value = validOps[0].operacao;
                }
            } else {
                lastValidatedOM = null;
                if (itemEl)    itemEl.textContent       = 'OM não encontrada na base de dados.';
                if (detailsEl) detailsEl.style.display  = 'none';
                inputs.operation.innerHTML = '<option value="" disabled selected hidden>---</option>';
                inputs.operation.disabled = true;
            }
        } catch (e) {
            console.error('Erro ao validar OM:', e);
        }
    }

    buttons.start.disabled = !(lastValidatedOM && inputs.operation.value);
}

// ─── Open Orders Panel ────────────────────────────────────────────────────────

async function renderOpenOrders() {
    const listContainer = document.getElementById('open-orders-list');
    const openOrders    = [];

    try {
        const allScans = await window.db.getScans();
        const myScans  = allScans.filter(s => s.operadorId === state.activeOperator?.codigo);
        const myOMs    = [...new Set(myScans.map(s => s.om))];

        for (const omId of myOMs) {
            const masterOrder = await window.db.getMasterOrder(omId);
            if (masterOrder) {
                openOrders.push({
                    op:        masterOrder.om,
                    desc:      masterOrder.descricao,
                    total:     masterOrder.quantidade,
                    realizado: myScans.filter(s => s.om === omId).length
                });
            }
        }
    } catch (e) {
        console.error('Erro ao carregar OMs recentes:', e);
    }

    if (openOrders.length === 0) {
        listContainer.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8rem; text-align: center; margin-top: 2rem;">
            Nenhuma ordem ativa.
        </div>`;
        return;
    }

    listContainer.innerHTML = openOrders.map(order => `
        <div class="glass" style="padding: 1rem; background: rgba(255,255,255,0.02); cursor: pointer;"
            onclick="selectOpenOrder('${order.op}')">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                <div style="font-weight: 700; font-size: 0.9rem; color: var(--accent-primary);">OM ${order.op}</div>
                <div style="font-size: 0.85rem; font-weight: 800; color: white;">${order.realizado} / ${order.total}</div>
            </div>
            <div style="font-size: 0.8rem; color: var(--text-secondary);">${order.desc}</div>
            <div style="width: 100%; height: 4px; background: rgba(255,255,255,0.05); border-radius: 2px; margin-top: 0.75rem; overflow: hidden;">
                <div style="width: ${Math.min((order.realizado / order.total) * 100, 100)}%; height: 100%; background: var(--accent-primary);"></div>
            </div>
        </div>
    `).join('');
}

// Global: called by inline onclick in the orders panel template
window.selectOpenOrder = (opId) => {
    inputs.omId.value = opId;
    validateSetup();
};

// ─── Utilities ────────────────────────────────────────────────────────────────

function handleBackspace() {
    inputs.operatorId.value = inputs.operatorId.value.slice(0, -1);
}

// Global: called by inline onclick on the numpad backspace button in index.html
window.handleBackspace = handleBackspace;
