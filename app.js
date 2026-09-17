/* ═══════════════════════════════════════════════════════════
   CONFIG & STATE
════════════════════════════════════════════════════════════════ */
const BASE = (window.API_URL || 'http://localhost:3000').replace(/\/$/, '');

const state = {
  token: localStorage.getItem('finanzas_token') || null,
  user:  JSON.parse(localStorage.getItem('finanzas_user') || 'null'),
  month: new Date().getMonth() + 1,
  year:  new Date().getFullYear(),
  accounts: [],
  expenses: [],
  incomes:  [],
  gastosFilter: 'all',
  ingresosFilter: 'all',
  // edición en curso
  editingExpenseId: null,
  editingIncomeId:  null,
  editingAccountId: null,
  pendingDeleteFn:  null,
};

const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
];

/* ═══════════════════════════════════════════════════════════
   UTILIDADES
════════════════════════════════════════════════════════════════ */
const fmt = new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR', minimumFractionDigits:2 });

function fmtEur(n) { return fmt.format(n ?? 0); }

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast on' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 2800);
}

async function api(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (state.token) opts.headers['Authorization'] = 'Bearer ' + state.token;
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(BASE + path, opts);
  if (res.status === 401) { doLogout(); return null; }
  const text = await res.text();
  if (!text) return null;
  const data = JSON.parse(text);
  if (!res.ok) throw new Error(data?.message || 'Error ' + res.status);
  return data;
}

function openModal(id) { document.getElementById(id).classList.add('on'); }
function closeModal(id) { document.getElementById(id).classList.remove('on'); }

/* ═══════════════════════════════════════════════════════════
   AUTH
════════════════════════════════════════════════════════════════ */
function showAuthTab(which) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('on'));
  const idx = which === 'login' ? 0 : 1;
  document.querySelectorAll('.auth-tab')[idx].classList.add('on');
  document.getElementById('auth-' + which).classList.add('on');
}

async function doLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl    = document.getElementById('login-err');
  errEl.classList.remove('on');

  if (!email || !password) { errEl.textContent = 'Rellena email y contraseña'; errEl.classList.add('on'); return; }

  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try {
    const data = await api('POST', '/auth/login', { email, password });
    if (!data) return;
    state.token = data.access_token;
    state.user  = data.user;
    localStorage.setItem('finanzas_token', state.token);
    localStorage.setItem('finanzas_user', JSON.stringify(state.user));
    startApp();
  } catch(e) {
    errEl.textContent = e.message || 'Credenciales incorrectas';
    errEl.classList.add('on');
  } finally {
    btn.disabled = false; btn.textContent = 'Entrar';
  }
}

async function doRegister() {
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  const errEl    = document.getElementById('register-err');
  errEl.classList.remove('on');

  if (!name || !email || !password) { errEl.textContent = 'Rellena todos los campos'; errEl.classList.add('on'); return; }
  if (password.length < 6) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres'; errEl.classList.add('on'); return; }

  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.textContent = 'Creando cuenta…';
  try {
    const data = await api('POST', '/auth/register', { name, email, password });
    if (!data) return;
    state.token = data.access_token;
    state.user  = data.user;
    localStorage.setItem('finanzas_token', state.token);
    localStorage.setItem('finanzas_user', JSON.stringify(state.user));
    startApp();
  } catch(e) {
    errEl.textContent = e.message || 'Error al registrarse';
    errEl.classList.add('on');
  } finally {
    btn.disabled = false; btn.textContent = 'Crear cuenta';
  }
}

function doLogout() {
  state.token = null;
  state.user  = null;
  localStorage.removeItem('finanzas_token');
  localStorage.removeItem('finanzas_user');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════
   INICIO DE APP
════════════════════════════════════════════════════════════════ */
async function startApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  const name = state.user?.name?.split(' ')[0] ?? '';
  document.getElementById('hdr-user').textContent = name;

  // Ajustar alto header
  requestAnimationFrame(() => {
    const h = document.getElementById('hdr')?.offsetHeight;
    if (h) document.documentElement.style.setProperty('--hdr-h', h + 'px');
  });

  updateMonthLabels();
  populateMonthSelects();

  await loadAccounts();
  loadDashboard();
  loadGastos();
  loadIngresos();
}

function updateMonthLabels() {
  const label = `${MONTHS[state.month - 1]} ${state.year}`;
  ['month-label','gastos-month-label','ingresos-month-label'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = label;
  });
}

function populateMonthSelects() {
  ['e-month','i-month'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = MONTHS.map((m, i) =>
      `<option value="${i+1}" ${i+1===state.month?'selected':''}>${m}</option>`
    ).join('');
  });
  ['e-year','i-year'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = state.year;
  });
}

/* ═══════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════════════ */
let activeTab = 'dashboard';

function showTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById('tab-' + tab).classList.add('on');
  document.getElementById('view-' + tab).classList.add('on');
  activeTab = tab;
}

/* ═══════════════════════════════════════════════════════════
   NAVEGACIÓN DE MES
════════════════════════════════════════════════════════════════ */
function changeMonth(delta) {
  let m = state.month + delta;
  let y = state.year;
  if (m > 12) { m = 1; y++; }
  if (m < 1)  { m = 12; y--; }
  state.month = m;
  state.year  = y;
  updateMonthLabels();
  loadDashboard();
  loadGastos();
  loadIngresos();
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD
════════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  const el = document.getElementById('dash-content');
  el.innerHTML = '<div class="ldg"><span class="ldg-dot"></span><span class="ldg-dot"></span><span class="ldg-dot"></span></div>';
  try {
    const data = await api('GET', `/dashboard/month?month=${state.month}&year=${state.year}`);
    if (!data) return;
    renderDashboard(data);
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Sin conexión</h3><p>${e.message}</p></div>`;
  }
}

function renderDashboard(data) {
  const paidI    = data.paidIncomes    ?? 0;
  const pendingI = data.pendingIncomes ?? 0;
  const paidE    = data.paidExpenses   ?? 0;
  const pendingE = data.pendingExpenses ?? 0;
  const available = data.available     ?? 0;
  const pos = available >= 0;

  const hasPending = pendingI > 0 || pendingE > 0;

  document.getElementById('dash-content').innerHTML = `
    <div class="balance-hero ${pos ? '' : 'neg'}">
      <div class="balance-hero-label">Balance del mes — ${MONTHS[state.month-1]} ${state.year}</div>
      <div class="balance-hero-amount">${pos ? '+' : ''}${fmtEur(available)}</div>
      <div class="balance-hero-sub">${pos ? '¡Vas bien! Ingresos superan a gastos.' : 'Los gastos superan los ingresos este mes.'}</div>
    </div>

    ${hasPending ? `
    <div class="pending-banner">
      ⚠️ Tienes items pendientes:
      ${pendingI > 0 ? `ingresos por cobrar (${fmtEur(pendingI)})` : ''}
      ${pendingI > 0 && pendingE > 0 ? ' · ' : ''}
      ${pendingE > 0 ? `gastos por pagar (${fmtEur(pendingE)})` : ''}
    </div>` : ''}

    <div class="stats">
      <div class="scard">
        <div class="snum c-income">${fmtEur(paidI)}</div>
        <div class="slbls">Ingresos cobrados</div>
      </div>
      <div class="scard">
        <div class="snum c-pending">${fmtEur(pendingI)}</div>
        <div class="slbls">Ingresos pendientes</div>
      </div>
      <div class="scard">
        <div class="snum c-expense">${fmtEur(paidE)}</div>
        <div class="slbls">Gastos pagados</div>
      </div>
      <div class="scard">
        <div class="snum c-pending">${fmtEur(pendingE)}</div>
        <div class="slbls">Gastos pendientes</div>
      </div>
    </div>

    ${renderAccountBreakdown(data.accountBreakdown)}
  `;
}

function renderAccountBreakdown(accounts) {
  if (!accounts || accounts.length === 0) return '';
  return `
    <div class="slbl" style="margin-top:8px">Por cuenta</div>
    ${accounts.map(a => {
      const total   = a.totalRequired ?? 0;
      const paid    = a.totalPaid    ?? 0;
      const pending = a.pending      ?? 0;
      const pct     = total > 0 ? Math.round(paid / total * 100) : 100;
      const done    = pending <= 0;
      return `
        <div class="rcard">
          <div class="ubar ${done ? 'paid' : 'pending'}"></div>
          <div class="rbody">
            <div class="rmeta">
              <span class="rtitle">🏦 ${esc(a.accountName)}</span>
              <span class="ramount expense">${fmtEur(total)}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:6px">
              <div style="flex:1;background:var(--border-l);border-radius:4px;height:6px;overflow:hidden">
                <div style="width:${pct}%;height:100%;background:${done ? 'var(--income)' : 'var(--expense)'};transition:width .3s"></div>
              </div>
              <span style="font-size:12px;color:var(--muted);white-space:nowrap">${done ? '✓ Todo pagado' : `${fmtEur(pending)} pendiente`}</span>
            </div>
          </div>
        </div>`;
    }).join('')}
  `;
}

/* ═══════════════════════════════════════════════════════════
   GASTOS
════════════════════════════════════════════════════════════════ */
async function loadGastos() {
  const el = document.getElementById('gastos-content');
  el.innerHTML = '<div class="ldg"><span class="ldg-dot"></span><span class="ldg-dot"></span><span class="ldg-dot"></span></div>';
  try {
    const data = await api('GET', `/expenses?month=${state.month}&year=${state.year}`);
    state.expenses = data ?? [];
    renderGastos();
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderGastos() {
  const f = state.gastosFilter;
  let list = state.expenses;
  if (f === 'paid')    list = list.filter(e => e.isPaid);
  if (f === 'pending') list = list.filter(e => !e.isPaid);

  const total   = state.expenses.reduce((s,e) => s + e.amount, 0);
  const paid    = state.expenses.filter(e => e.isPaid).reduce((s,e) => s + e.amount, 0);
  const pending = total - paid;

  document.getElementById('gastos-stats').innerHTML = `
    <div class="scard"><div class="snum c-expense">${fmtEur(total)}</div><div class="slbls">Total</div></div>
    <div class="scard"><div class="snum c-income">${fmtEur(paid)}</div><div class="slbls">Pagado</div></div>
    <div class="scard"><div class="snum c-pending">${fmtEur(pending)}</div><div class="slbls">Pendiente</div></div>
  `;

  document.getElementById('gastos-badge').textContent = state.expenses.filter(e => !e.isPaid).length;

  if (list.length === 0) {
    document.getElementById('gastos-content').innerHTML = `
      <div class="empty">
        <div class="empty-ico">💸</div>
        <h3>Sin gastos</h3>
        <p>${f === 'all' ? 'Añade tu primer gasto del mes.' : 'No hay gastos con ese filtro.'}</p>
      </div>`;
    return;
  }

  document.getElementById('gastos-content').innerHTML = list.map(e => `
    <div class="rcard" id="gasto-${e.id}">
      <div class="ubar ${e.isPaid ? 'expense-paid' : 'expense-pending'}"></div>
      <div class="rbody">
        <div class="rmeta">
          <div>
            <div class="rcat">${esc(e.accountName || 'Sin cuenta')} ${e.recurrence !== 'NONE' ? '· ' + recLabel(e.recurrence) : ''}</div>
            <div class="rtitle">${esc(e.name)}</div>
            ${e.notes ? `<div class="rnotes">${esc(e.notes)}</div>` : ''}
          </div>
          <div class="ramount expense">${fmtEur(e.amount)}</div>
        </div>
        <div class="rfoot">
          <span class="spill ${e.isPaid ? 's-paid' : 's-pending'}">${e.isPaid ? '✓ Pagado' : '⏳ Pendiente'}</span>
          <div class="ractions">
            <button class="act-btn paid-toggle ${e.isPaid ? 'is-paid' : ''}" onclick="toggleExpensePaid('${e.id}',${e.isPaid})">
              ${e.isPaid ? '↩ Marcar pendiente' : '✓ Marcar pagado'}
            </button>
            <button class="act-btn" onclick="openExpenseModal('${e.id}')">✏️ Editar</button>
            <button class="act-btn del" onclick="askDeleteExpense('${e.id}')">🗑</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function setGastosFilter(btn, f) {
  document.querySelectorAll('#gastos-filter .fbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  state.gastosFilter = f;
  renderGastos();
}

/* ═══════════════════════════════════════════════════════════
   INGRESOS
════════════════════════════════════════════════════════════════ */
async function loadIngresos() {
  const el = document.getElementById('ingresos-content');
  el.innerHTML = '<div class="ldg"><span class="ldg-dot"></span><span class="ldg-dot"></span><span class="ldg-dot"></span></div>';
  try {
    const data = await api('GET', `/incomes?month=${state.month}&year=${state.year}`);
    state.incomes = data ?? [];
    renderIngresos();
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderIngresos() {
  const f = state.ingresosFilter;
  let list = state.incomes;
  if (f === 'paid')    list = list.filter(i => i.isPaid);
  if (f === 'pending') list = list.filter(i => !i.isPaid);

  const total   = state.incomes.reduce((s,i) => s + i.amount, 0);
  const paid    = state.incomes.filter(i => i.isPaid).reduce((s,i) => s + i.amount, 0);
  const pending = total - paid;

  document.getElementById('ingresos-stats').innerHTML = `
    <div class="scard"><div class="snum c-income">${fmtEur(total)}</div><div class="slbls">Total</div></div>
    <div class="scard"><div class="snum c-income">${fmtEur(paid)}</div><div class="slbls">Cobrado</div></div>
    <div class="scard"><div class="snum c-pending">${fmtEur(pending)}</div><div class="slbls">Pendiente</div></div>
  `;

  document.getElementById('ingresos-badge').textContent = state.incomes.filter(i => !i.isPaid).length;

  if (list.length === 0) {
    document.getElementById('ingresos-content').innerHTML = `
      <div class="empty">
        <div class="empty-ico">💰</div>
        <h3>Sin ingresos</h3>
        <p>${f === 'all' ? 'Añade tu primer ingreso del mes.' : 'No hay ingresos con ese filtro.'}</p>
      </div>`;
    return;
  }

  document.getElementById('ingresos-content').innerHTML = list.map(i => `
    <div class="rcard" id="ingreso-${i.id}">
      <div class="ubar ${i.isPaid ? 'paid' : 'pending'}"></div>
      <div class="rbody">
        <div class="rmeta">
          <div>
            <div class="rcat">${i.recurrence !== 'NONE' ? recLabel(i.recurrence) : 'Ingreso'}</div>
            <div class="rtitle">${esc(i.name)}</div>
            ${i.notes ? `<div class="rnotes">${esc(i.notes)}</div>` : ''}
          </div>
          <div class="ramount income">${fmtEur(i.amount)}</div>
        </div>
        <div class="rfoot">
          <span class="spill ${i.isPaid ? 's-paid' : 's-pending'}">${i.isPaid ? '✓ Cobrado' : '⏳ Pendiente'}</span>
          <div class="ractions">
            <button class="act-btn paid-toggle ${i.isPaid ? 'is-paid' : ''}" onclick="toggleIncomePaid('${i.id}',${i.isPaid})">
              ${i.isPaid ? '↩ Marcar pendiente' : '✓ Marcar cobrado'}
            </button>
            <button class="act-btn" onclick="openIncomeModal('${i.id}')">✏️ Editar</button>
            <button class="act-btn del" onclick="askDeleteIncome('${i.id}')">🗑</button>
          </div>
        </div>
      </div>
    </div>`).join('');
}

function setIngresosFilter(btn, f) {
  document.querySelectorAll('#ingresos-filter .fbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  state.ingresosFilter = f;
  renderIngresos();
}

/* ═══════════════════════════════════════════════════════════
   CUENTAS
════════════════════════════════════════════════════════════════ */
async function loadAccounts() {
  const el = document.getElementById('cuentas-content');
  if (el) el.innerHTML = '<div class="ldg"><span class="ldg-dot"></span><span class="ldg-dot"></span><span class="ldg-dot"></span></div>';
  try {
    const data = await api('GET', '/accounts');
    state.accounts = data ?? [];
    renderAccounts();
    populateAccountSelect();
  } catch(e) {
    if (el) el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderAccounts() {
  const el = document.getElementById('cuentas-content');
  if (!el) return;
  if (state.accounts.length === 0) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">🏦</div><h3>Sin cuentas</h3><p>Añade tu primera cuenta bancaria.</p></div>`;
    return;
  }
  el.innerHTML = state.accounts.map(a => `
    <div class="account-card" id="cuenta-${a.id}">
      <div class="account-ico">🏦</div>
      <div class="account-info">
        <div class="account-name">${esc(a.name)}</div>
        <div class="account-budget">${a.budget ? `Presupuesto: ${fmtEur(a.budget)}` : 'Sin presupuesto definido'}</div>
      </div>
      <div class="account-actions">
        <button class="btn-s" style="padding:5px 10px;font-size:12px" onclick="openAccountModal('${a.id}')">✏️</button>
        <button class="btn-danger" style="padding:5px 10px;font-size:12px" onclick="askDeleteAccount('${a.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function populateAccountSelect() {
  const sel = document.getElementById('e-account');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecciona una cuenta…</option>' +
    state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
}

/* ═══════════════════════════════════════════════════════════
   MODAL GASTO
════════════════════════════════════════════════════════════════ */
function openExpenseModal(id) {
  state.editingExpenseId = id ?? null;
  const isEdit = !!id;
  document.getElementById('expense-modal-title').textContent = isEdit ? 'Editar gasto' : 'Nuevo gasto';

  // Reset
  ['e-name','e-amount','e-notes'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('e-recurrence').value = 'NONE';
  document.getElementById('e-account').value    = '';
  document.getElementById('e-month').value      = state.month;
  document.getElementById('e-year').value       = state.year;
  document.getElementById('e-paid-toggle').classList.remove('on');
  ['e-name-err','e-amount-err','e-account-err'].forEach(e => document.getElementById(e).classList.remove('on'));

  if (isEdit) {
    const exp = state.expenses.find(e => e.id === id);
    if (exp) {
      document.getElementById('e-name').value       = exp.name;
      document.getElementById('e-amount').value     = exp.amount;
      document.getElementById('e-notes').value      = exp.notes ?? '';
      document.getElementById('e-account').value    = exp.accountId;
      document.getElementById('e-month').value      = exp.month;
      document.getElementById('e-year').value       = exp.year;
      document.getElementById('e-recurrence').value = exp.recurrence ?? 'NONE';
      if (exp.isPaid) document.getElementById('e-paid-toggle').classList.add('on');
    }
  }
  openModal('expense-modal');
}

async function saveExpense() {
  let valid = true;
  const name   = document.getElementById('e-name').value.trim();
  const amount = parseFloat(document.getElementById('e-amount').value);
  const accountId = document.getElementById('e-account').value;

  if (!name) { document.getElementById('e-name-err').classList.add('on'); valid = false; }
  else document.getElementById('e-name-err').classList.remove('on');
  if (isNaN(amount) || amount < 0) { document.getElementById('e-amount-err').classList.add('on'); valid = false; }
  else document.getElementById('e-amount-err').classList.remove('on');
  if (!accountId) { document.getElementById('e-account-err').classList.add('on'); valid = false; }
  else document.getElementById('e-account-err').classList.remove('on');
  if (!valid) return;

  const payload = {
    name, amount,
    accountId,
    month:      parseInt(document.getElementById('e-month').value),
    year:       parseInt(document.getElementById('e-year').value),
    recurrence: document.getElementById('e-recurrence').value,
    isPaid:     document.getElementById('e-paid-toggle').classList.contains('on'),
    notes:      document.getElementById('e-notes').value.trim() || undefined,
  };

  const btn = document.getElementById('e-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingExpenseId) {
      await api('PUT', `/expenses/${state.editingExpenseId}`, payload);
      showToast('Gasto actualizado', 'success');
    } else {
      await api('POST', '/expenses', payload);
      showToast('Gasto añadido', 'success');
    }
    closeModal('expense-modal');
    await loadGastos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function toggleExpensePaid(id, currentPaid) {
  try {
    await api('PUT', `/expenses/${id}`, { isPaid: !currentPaid });
    await loadGastos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

function askDeleteExpense(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar este gasto? Esta acción no se puede deshacer.';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/expenses/${id}`);
    showToast('Gasto eliminado');
    await loadGastos();
    if (activeTab === 'dashboard') loadDashboard();
  };
  openModal('confirm-modal');
}

async function propagateExpenses() {
  try {
    const res = await api('POST', '/expenses/propagate', { month: state.month, year: state.year });
    const n = Array.isArray(res) ? res.length : 0;
    showToast(n > 0 ? `${n} gastos propagados` : 'No había recurrentes que propagar', 'success');
    await loadGastos();
  } catch(e) { showToast(e.message || 'Error al propagar', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   MODAL INGRESO
════════════════════════════════════════════════════════════════ */
function openIncomeModal(id) {
  state.editingIncomeId = id ?? null;
  const isEdit = !!id;
  document.getElementById('income-modal-title').textContent = isEdit ? 'Editar ingreso' : 'Nuevo ingreso';

  ['i-name','i-amount','i-notes'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('i-recurrence').value = 'NONE';
  document.getElementById('i-month').value      = state.month;
  document.getElementById('i-year').value       = state.year;
  document.getElementById('i-paid-toggle').classList.remove('on');
  ['i-name-err','i-amount-err'].forEach(e => document.getElementById(e).classList.remove('on'));

  if (isEdit) {
    const inc = state.incomes.find(i => i.id === id);
    if (inc) {
      document.getElementById('i-name').value       = inc.name;
      document.getElementById('i-amount').value     = inc.amount;
      document.getElementById('i-notes').value      = inc.notes ?? '';
      document.getElementById('i-month').value      = inc.month;
      document.getElementById('i-year').value       = inc.year;
      document.getElementById('i-recurrence').value = inc.recurrence ?? 'NONE';
      if (inc.isPaid) document.getElementById('i-paid-toggle').classList.add('on');
    }
  }
  openModal('income-modal');
}

async function saveIncome() {
  let valid = true;
  const name   = document.getElementById('i-name').value.trim();
  const amount = parseFloat(document.getElementById('i-amount').value);

  if (!name) { document.getElementById('i-name-err').classList.add('on'); valid = false; }
  else document.getElementById('i-name-err').classList.remove('on');
  if (isNaN(amount) || amount < 0) { document.getElementById('i-amount-err').classList.add('on'); valid = false; }
  else document.getElementById('i-amount-err').classList.remove('on');
  if (!valid) return;

  const payload = {
    name, amount,
    month:      parseInt(document.getElementById('i-month').value),
    year:       parseInt(document.getElementById('i-year').value),
    recurrence: document.getElementById('i-recurrence').value,
    isPaid:     document.getElementById('i-paid-toggle').classList.contains('on'),
    notes:      document.getElementById('i-notes').value.trim() || undefined,
  };

  const btn = document.getElementById('i-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingIncomeId) {
      await api('PUT', `/incomes/${state.editingIncomeId}`, payload);
      showToast('Ingreso actualizado', 'success');
    } else {
      await api('POST', '/incomes', payload);
      showToast('Ingreso añadido', 'success');
    }
    closeModal('income-modal');
    await loadIngresos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

async function toggleIncomePaid(id, currentPaid) {
  try {
    await api('PUT', `/incomes/${id}`, { isPaid: !currentPaid });
    await loadIngresos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) { showToast(e.message, 'error'); }
}

function askDeleteIncome(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar este ingreso? Esta acción no se puede deshacer.';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/incomes/${id}`);
    showToast('Ingreso eliminado');
    await loadIngresos();
    if (activeTab === 'dashboard') loadDashboard();
  };
  openModal('confirm-modal');
}

async function propagateIncomes() {
  try {
    const res = await api('POST', '/incomes/propagate', { month: state.month, year: state.year });
    const n = Array.isArray(res) ? res.length : 0;
    showToast(n > 0 ? `${n} ingresos propagados` : 'No había recurrentes que propagar', 'success');
    await loadIngresos();
  } catch(e) { showToast(e.message || 'Error al propagar', 'error'); }
}

/* ═══════════════════════════════════════════════════════════
   MODAL CUENTA
════════════════════════════════════════════════════════════════ */
function openAccountModal(id) {
  state.editingAccountId = id ?? null;
  const isEdit = !!id;
  document.getElementById('account-modal-title').textContent = isEdit ? 'Editar cuenta' : 'Nueva cuenta';
  document.getElementById('a-name').value   = '';
  document.getElementById('a-budget').value = '';
  document.getElementById('a-name-err').classList.remove('on');

  if (isEdit) {
    const acc = state.accounts.find(a => a.id === id);
    if (acc) {
      document.getElementById('a-name').value   = acc.name;
      document.getElementById('a-budget').value = acc.budget ?? '';
    }
  }
  openModal('account-modal');
}

async function saveAccount() {
  const name   = document.getElementById('a-name').value.trim();
  const budget = parseFloat(document.getElementById('a-budget').value);

  if (!name) { document.getElementById('a-name-err').classList.add('on'); return; }
  document.getElementById('a-name-err').classList.remove('on');

  const payload = { name, budget: isNaN(budget) || budget <= 0 ? undefined : budget };

  const btn = document.getElementById('a-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingAccountId) {
      await api('PUT', `/accounts/${state.editingAccountId}`, payload);
      showToast('Cuenta actualizada', 'success');
    } else {
      await api('POST', '/accounts', payload);
      showToast('Cuenta añadida', 'success');
    }
    closeModal('account-modal');
    await loadAccounts();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Guardar';
  }
}

function askDeleteAccount(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar esta cuenta? Los gastos asociados pueden quedar sin cuenta asignada.';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/accounts/${id}`);
    showToast('Cuenta eliminada');
    await loadAccounts();
    await loadGastos();
  };
  openModal('confirm-modal');
}

/* ═══════════════════════════════════════════════════════════
   MODAL CONFIRMACIÓN
════════════════════════════════════════════════════════════════ */
async function confirmDelete() {
  if (!state.pendingDeleteFn) return;
  const btn = document.querySelector('#confirm-modal .btn-danger');
  btn.disabled = true; btn.textContent = 'Eliminando…';
  try {
    await state.pendingDeleteFn();
    closeModal('confirm-modal');
  } catch(e) {
    showToast(e.message || 'Error al eliminar', 'error');
  } finally {
    btn.disabled = false; btn.textContent = 'Eliminar';
    state.pendingDeleteFn = null;
  }
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE PAID
════════════════════════════════════════════════════════════════ */
function togglePaid(prefix) {
  document.getElementById(prefix + '-paid-toggle').classList.toggle('on');
}

/* ═══════════════════════════════════════════════════════════
   HELPERS
════════════════════════════════════════════════════════════════ */
function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function recLabel(r) {
  return { MONTHLY:'Mensual', ANNUAL:'Anual', NONE:'' }[r] ?? r;
}

/* Cerrar modal al hacer clic fuera del box */
document.querySelectorAll('.modal').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); });
});

/* Enter en login */
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin();
});

/* ═══════════════════════════════════════════════════════════
   ARRANQUE
════════════════════════════════════════════════════════════════ */
if (state.token) {
  startApp();
} else {
  document.getElementById('auth-screen').style.display = 'flex';
}
