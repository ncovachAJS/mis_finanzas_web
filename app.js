/* ═══════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════════ */
(function initTheme() {
  const saved = localStorage.getItem('finanzas_theme');
  if (saved && saved !== 'system') document.documentElement.setAttribute('data-theme', saved);
})();

/* ═══════════════════════════════════════════════════════════
   CONFIG & CONSTANTS
════════════════════════════════════════════════════════════════ */
const BASE = (window.API_URL || 'http://localhost:3000').replace(/\/$/, '');

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun',
  'Jul','Ago','Sep','Oct','Nov','Dic'];

const EXPENSE_TYPES = {
  FIXED:      { label:'Gasto fijo',    icon:'🏠', color:'#6366F1' },
  VARIABLE:   { label:'Variable',      icon:'🛒', color:'#22C55E' },
  DEBT:       { label:'Deuda',         icon:'💳', color:'#EF4444' },
  DONATION:   { label:'Donación',      icon:'🎁', color:'#EC4899' },
  INVESTMENT: { label:'Inversión',     icon:'📈', color:'#3B82F6' },
  SAVINGS:    { label:'Ahorro',        icon:'🏦', color:'#10B981' },
  OTHER:      { label:'Otro',          icon:'📦', color:'#6B7280' },
};

/* ═══════════════════════════════════════════════════════════
   STATE
════════════════════════════════════════════════════════════════ */
const state = {
  token: localStorage.getItem('finanzas_token') || null,
  user:  JSON.parse(localStorage.getItem('finanzas_user') || 'null'),
  month: new Date().getMonth() + 1,
  year:  new Date().getFullYear(),
  dashYear: new Date().getFullYear(),
  accounts:  [],
  expenses:  [],
  incomes:   [],
  categories: [],
  savingsGoals: [],
  historyItems: [],
  historyTotal: 0,
  gastosFilter:   'all',
  ingresosFilter: 'all',
  editingExpenseId:  null,
  editingIncomeId:   null,
  editingAccountId:  null,
  editingGoalId:     null,
  editingCategoryId: null,
  addSavingsGoalId:  null,
  pendingDeleteFn:   null,
};

/* ═══════════════════════════════════════════════════════════
   UTILITIES
════════════════════════════════════════════════════════════════ */
const fmt = new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR', minimumFractionDigits:2 });
function fmtEur(n) { return fmt.format(n ?? 0); }

/* Cache helpers — show stale data instantly, refresh in background */
function saveCache(key, data) {
  try { localStorage.setItem('cc_' + key, JSON.stringify({ ts: Date.now(), data })); } catch(e) {}
}
function loadCache(key, maxMs = 8 * 60 * 1000) {
  try {
    const raw = localStorage.getItem('cc_' + key);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    return (Date.now() - ts < maxMs) ? data : null;
  } catch(e) { return null; }
}

function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast on' + (type ? ' ' + type : '');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.className = 'toast', 2800);
}

async function api(method, path, body) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
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

let _modalZ = 999;
function openModal(id) {
  const el = document.getElementById(id);
  _modalZ += 10;
  el.style.zIndex = _modalZ;
  el.classList.add('on');
  _enableSwipeToClose(el);
}
function closeModal(id) {
  const el = document.getElementById(id);
  el.classList.remove('on');
  el.style.zIndex = '';
  _modalZ = Math.max(999, _modalZ - 10);
}

function _enableSwipeToClose(modalEl) {
  const box = modalEl.querySelector('.modal-box');
  if (!box || box.dataset.swipe) return;
  box.dataset.swipe = '1';
  let startY = 0, dy = 0, active = false;

  box.addEventListener('touchstart', e => {
    if (box.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dy = 0; active = true;
    box.style.transition = 'none';
  }, { passive: true });

  box.addEventListener('touchmove', e => {
    if (!active) return;
    dy = e.touches[0].clientY - startY;
    if (dy < 0) { active = false; box.style.transform = ''; return; }
    box.style.transform = `translateY(${dy}px)`;
    modalEl.style.background = `rgba(0,0,0,${Math.max(0, 0.55 - dy / 600)})`;
  }, { passive: true });

  const end = () => {
    if (!active) return;
    active = false;
    box.style.transition = 'transform .25s ease';
    if (dy > 110) {
      box.style.transform = 'translateY(110%)';
      modalEl.style.transition = 'background .25s';
      modalEl.style.background = 'rgba(0,0,0,0)';
      setTimeout(() => {
        closeModal(modalEl.id);
        box.style.cssText = '';
        modalEl.style.cssText = '';
      }, 250);
    } else {
      box.style.transform = '';
      modalEl.style.background = '';
      setTimeout(() => { box.style.transition = ''; }, 250);
    }
  };
  box.addEventListener('touchend',   end, { passive: true });
  box.addEventListener('touchcancel', end, { passive: true });
}

function esc(s) {
  return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function recLabel(r) {
  return { MONTHLY:'Mensual', BIMONTHLY:'Bimestral', QUARTERLY:'Trimestral',
           SEMIANNUAL:'Semestral', ANNUAL:'Anual', NONE:'' }[r] ?? r;
}

function typePill(expenseType) {
  if (!expenseType || expenseType === 'OTHER') return '';
  const t = EXPENSE_TYPES[expenseType];
  if (!t) return '';
  return `<span class="type-tag" style="color:${t.color};border-color:${t.color};background:${t.color}18">${t.icon} ${t.label}</span>`;
}

function ldg() {
  return '<div class="ldg"><span class="ldg-dot"></span><span class="ldg-dot"></span><span class="ldg-dot"></span></div>';
}

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
    clearUserCache();
    state.token = data.token ?? data.access_token;
    state.user  = data.user;
    localStorage.setItem('finanzas_token', state.token);
    localStorage.setItem('finanzas_user', JSON.stringify(state.user));
    startApp();
  } catch(e) {
    errEl.textContent = e.message || 'Credenciales incorrectas';
    errEl.classList.add('on');
  } finally { btn.disabled = false; btn.textContent = 'Entrar'; }
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
    clearUserCache();
    state.token = data.token ?? data.access_token;
    state.user  = data.user;
    localStorage.setItem('finanzas_token', state.token);
    localStorage.setItem('finanzas_user', JSON.stringify(state.user));
    startApp();
  } catch(e) {
    errEl.textContent = e.message || 'Error al registrarse';
    errEl.classList.add('on');
  } finally { btn.disabled = false; btn.textContent = 'Crear cuenta'; }
}

function clearUserCache() {
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('cc_'));
    keys.forEach(k => localStorage.removeItem(k));
  } catch(e) {}
}

function doLogout() {
  clearUserCache();
  state.token = null; state.user = null;
  localStorage.removeItem('finanzas_token');
  localStorage.removeItem('finanzas_user');
  closeModal('profile-modal');
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

/* ═══════════════════════════════════════════════════════════
   APP START
════════════════════════════════════════════════════════════════ */
async function startApp() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';
  document.getElementById('hdr-user').textContent = state.user?.name?.split(' ')[0] ?? '';
  updateAvatarUI(state.user?.avatar || null);

  const hdr = document.getElementById('hdr');
  if (hdr) {
    const setHdrH = () => {
      const h = hdr.offsetHeight;
      if (h > 0) document.documentElement.style.setProperty('--hdr-h', h + 'px');
    };
    requestAnimationFrame(() => {
      setHdrH();
      if (typeof ResizeObserver !== 'undefined') new ResizeObserver(setHdrH).observe(hdr);
      else setTimeout(setHdrH, 300);
    });
  }

  updateMonthLabels();
  populateMonthSelects();
  populateHistoryFilters();

  // Fire all in parallel — backend cold-start hits once, not 5 times
  Promise.all([loadAccounts(), loadCategories(), loadDashboard(), loadGastos(), loadIngresos()]);
}

/* ═══════════════════════════════════════════════════════════
   TABS
════════════════════════════════════════════════════════════════ */
let activeTab = 'dashboard';

function showTab(tab) {
  document.querySelectorAll('.bnav-item').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById('tab-' + tab).classList.add('on');
  document.getElementById('view-' + tab).classList.add('on');
  activeTab = tab;
  if (tab === 'historial' && state.historyItems.length === 0) loadHistory();
}

function showDashTab(which) {
  document.querySelectorAll('.dash-stab').forEach(b => b.classList.remove('on'));
  document.getElementById('dstab-' + which).classList.add('on');
  document.getElementById('dash-mensual').style.display = which === 'mensual' ? '' : 'none';
  document.getElementById('dash-anual').style.display   = which === 'anual'   ? '' : 'none';
  if (which === 'anual') loadAnnualDashboard();
}

/* ═══════════════════════════════════════════════════════════
   NAVIGATION
════════════════════════════════════════════════════════════════ */
function updateMonthLabels() {
  const label = `${MONTHS[state.month - 1]} ${state.year}`;
  ['month-label','gastos-month-label','ingresos-month-label'].forEach(id => {
    const el = document.getElementById(id); if (el) el.textContent = label;
  });
}

function populateMonthSelects() {
  ['e-month','i-month'].forEach(id => {
    const sel = document.getElementById(id); if (!sel) return;
    sel.innerHTML = MONTHS.map((m,i) =>
      `<option value="${i+1}" ${i+1===state.month?'selected':''}>${m}</option>`).join('');
  });
  ['e-year','i-year'].forEach(id => {
    const el = document.getElementById(id); if (el) el.value = state.year;
  });
}

async function changeMonth(delta) {
  let m = state.month + delta, y = state.year;
  if (m > 12) { m = 1; y++; }
  if (m < 1)  { m = 12; y--; }
  state.month = m; state.year = y;
  updateMonthLabels();
  await Promise.all([loadGastos(), loadIngresos()]);
  loadDashboard();
  // Auto-propagate if the month is completely empty
  if (state.expenses.length === 0 && state.incomes.length === 0) {
    try {
      const [resE, resI] = await Promise.all([
        api('POST', '/expenses/propagate', { month: state.month, year: state.year }),
        api('POST', '/incomes/propagate',  { month: state.month, year: state.year }),
      ]);
      const n = (Array.isArray(resE) ? resE.length : 0) + (Array.isArray(resI) ? resI.length : 0);
      if (n > 0) {
        showToast(`${n} recurrentes propagados`, 'success');
        await fixCuotasAfterPropagation(state.month, state.year);
        await Promise.all([loadGastos(), loadIngresos()]);
        loadDashboard();
      }
    } catch(e) { /* silencioso si falla */ }
  }
}

function changeYear(delta) {
  state.dashYear += delta;
  document.getElementById('year-label').textContent = state.dashYear;
  loadAnnualDashboard();
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD — MENSUAL
════════════════════════════════════════════════════════════════ */
async function loadDashboard() {
  const el = document.getElementById('dash-content');
  const cacheKey = `dash_${state.month}_${state.year}`;
  const cached = loadCache(cacheKey);
  if (cached) renderDashboard(cached); else el.innerHTML = ldg();
  try {
    const data = await api('GET', `/dashboard/month?month=${state.month}&year=${state.year}`);
    if (!data) return;
    saveCache(cacheKey, data);
    renderDashboard(data);
  } catch(e) {
    if (!cached) el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Sin conexión</h3><p>${e.message}</p></div>`;
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

  const budgetAlert = data.budgetAlert ? renderBudgetAlert(data) : '';
  const accountBreakdown = renderAccountBreakdown(data.accountBreakdown);

  document.getElementById('dash-content').innerHTML = `
    ${budgetAlert}
    <div class="balance-hero ${pos ? '' : 'neg'}">
      <div class="balance-hero-label">Ahorro del mes — ${MONTHS[state.month-1]} ${state.year}</div>
      <div class="balance-hero-amount">${pos ? '+' : ''}${fmtEur(available)}</div>
      <div class="balance-hero-sub">${pos ? '¡Vas bien! Ingresos superan a gastos.' : 'Los gastos superan los ingresos este mes.'}</div>
    </div>
    ${hasPending ? `<div class="pending-banner">⚠️ Tienes items pendientes:
      ${pendingI > 0 ? `ingresos por cobrar (${fmtEur(pendingI)})` : ''}
      ${pendingI > 0 && pendingE > 0 ? ' · ' : ''}
      ${pendingE > 0 ? `gastos por pagar (${fmtEur(pendingE)})` : ''}
    </div>` : ''}
    <div class="stats">
      <div class="scard"><div class="snum c-income">${fmtEur(paidI)}</div><div class="slbls">Ingresos cobrados</div></div>
      <div class="scard"><div class="snum c-pending">${fmtEur(pendingI)}</div><div class="slbls">Ingresos pendientes</div></div>
      <div class="scard"><div class="snum c-expense">${fmtEur(paidE)}</div><div class="slbls">Gastos pagados</div></div>
      <div class="scard"><div class="snum c-pending">${fmtEur(pendingE)}</div><div class="slbls">Gastos pendientes</div></div>
    </div>
    ${accountBreakdown}
  `;
}

function renderBudgetAlert(data) {
  const pct = Math.round((data.budgetUsedFraction ?? 0) * 100);
  const over = pct >= 100;
  const color = over ? 'var(--danger)' : 'var(--warning)';
  return `
    <div class="budget-alert ${over ? 'over' : 'warn'}">
      ${over ? '🚨' : '⚠️'} ${over ? 'Has superado' : 'Te acercas a'} tu presupuesto mensual (${pct}% de ${fmtEur(data.monthlyBudget)})
      <div class="budget-bar-wrap">
        <div class="budget-bar-fill" style="width:${Math.min(pct,100)}%;background:${color}"></div>
      </div>
    </div>`;
}

function renderAccountBreakdown(accounts) {
  if (!accounts || accounts.length === 0) return '';
  return `
    <div class="slbl" style="margin-top:8px">Por cuenta</div>
    ${accounts.map(a => {
      const total = a.totalRequired ?? 0, paid = a.totalPaid ?? 0, pending = a.pending ?? 0;
      const pct = total > 0 ? Math.round(paid / total * 100) : 100;
      const done = pending <= 0;
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
    }).join('')}`;
}

/* ═══════════════════════════════════════════════════════════
   DASHBOARD — ANUAL
════════════════════════════════════════════════════════════════ */
async function loadAnnualDashboard() {
  const el = document.getElementById('dash-annual-content');
  el.innerHTML = ldg();
  try {
    const data = await api('GET', `/dashboard/year/${state.dashYear}`);
    if (!data) return;
    renderAnnualDashboard(data);
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderAnnualDashboard(data) {
  const totalInc = data.yearPaidIncomes  ?? 0;
  const totalExp = data.yearPaidExpenses ?? 0;
  const savings  = data.accumulatedSavings ?? 0;
  const pos = savings >= 0;

  const totalForBar = totalInc + totalExp;
  const incPct = totalForBar > 0 ? (totalInc / totalForBar * 100).toFixed(1) : 50;
  const expPct = totalForBar > 0 ? (totalExp / totalForBar * 100).toFixed(1) : 50;

  const barChart   = renderBarChart(data.months);
  const donutChart = renderDonutChart(data.expenseTypeBreakdown?.length ? data.expenseTypeBreakdown : data.categoryBreakdown);

  document.getElementById('dash-annual-content').innerHTML = `
    <div class="annual-hero">
      <div class="annual-hero-label">Ahorro acumulado ${state.dashYear}</div>
      <div class="annual-hero-amount" style="color:${pos ? '#fff' : '#fca5a5'}">${pos ? '+' : ''}${fmtEur(savings)}</div>
      <div class="annual-hero-bar" style="margin-top:12px">
        <div class="annual-hero-bar-inc" style="flex:${incPct}"></div>
        <div class="annual-hero-bar-exp" style="flex:${expPct}"></div>
      </div>
      <div class="annual-hero-meta">
        <span>💰 Cobrado: ${fmtEur(totalInc)}</span>
        <span>💸 Pagado: ${fmtEur(totalExp)}</span>
      </div>
    </div>

    <div class="stats" style="grid-template-columns:repeat(2,1fr)">
      <div class="scard"><div class="snum c-income">${fmtEur(data.yearTotalIncomes)}</div><div class="slbls">Total ingresos</div></div>
      <div class="scard"><div class="snum c-expense">${fmtEur(data.yearTotalExpenses)}</div><div class="slbls">Total gastos</div></div>
    </div>

    <div class="chart-wrap">
      <div class="chart-title">Ingresos vs Gastos</div>
      ${barChart}
      <div class="chart-legend">
        <div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--income)"></div>Ingresos</div>
        <div class="chart-legend-item"><div class="chart-legend-dot" style="background:var(--expense)"></div>Gastos</div>
      </div>
    </div>

    ${donutChart ? `<div class="chart-wrap">
      <div class="chart-title">Distribución de gastos</div>
      ${donutChart}
    </div>` : ''}

    ${renderMonthlySavings(data.months, state.dashYear)}
  `;
}

function renderMonthlySavings(months, year) {
  if (!months || !months.length) return '';
  const now = new Date();
  const currentYear  = now.getFullYear();
  const isCurrentYear = year === currentYear;
  const isFutureYear  = year > currentYear;

  // For a future year all months are projected; for a past year all are real
  const curMonth = isCurrentYear ? now.getMonth() + 1 : (isFutureYear ? 0 : 12);

  const realMonths   = months.filter(m => m.month <= curMonth);
  const futureMonths = months.filter(m => m.month >  curMonth);
  if (!realMonths.length && !isFutureYear) return '';

  // For future months: use total (incomes - expenses) regardless of paid status,
  // because propagated items are pending and savings (paid only) = 0.
  const futureSaving = m => m.totalIncomes - m.totalExpenses;

  // Fallback avg from past months when a future month has no data at all
  const activeMonths = realMonths.filter(m => m.totalIncomes > 0 || m.totalExpenses > 0);
  const avgSaving    = activeMonths.length
    ? activeMonths.reduce((s, m) => s + m.savings, 0) / activeMonths.length
    : 0;

  const realTotal  = realMonths.reduce((s, m) => s + m.savings, 0);
  const projTotal  = futureMonths.reduce((s, m) => {
    const hasDat = m.totalIncomes > 0 || m.totalExpenses > 0;
    return s + (hasDat ? futureSaving(m) : avgSaving);
  }, 0);

  const annualTotal = realTotal + projTotal;
  const totPos = annualTotal >= 0;

  const allSavings = [
    ...realMonths.map(m => Math.abs(m.savings)),
    ...futureMonths.map(m => {
      const hasDat = m.totalIncomes > 0 || m.totalExpenses > 0;
      return Math.abs(hasDat ? futureSaving(m) : avgSaving);
    }),
  ];
  const maxAbs = Math.max(...allSavings, 1);

  const makeRow = (m, isFuture) => {
    const hasDat = m.totalIncomes > 0 || m.totalExpenses > 0;
    const saving = isFuture ? (hasDat ? futureSaving(m) : avgSaving) : m.savings;
    const isEst  = isFuture && !hasDat;   // estimated via avg, no real data
    const pos    = saving >= 0;
    const pct    = Math.min(Math.abs(saving) / maxAbs * 100, 100);
    return `
      <div class="sv-row ${isFuture ? 'sv-future' : ''}">
        <span class="sv-month">${MONTHS_SHORT[m.month - 1]}${isEst ? '<span class="sv-proj-tag">~</span>' : ''}</span>
        <div class="sv-bar-track">
          <div class="sv-bar-fill ${pos ? 'pos' : 'neg'}${isEst ? ' proj' : ''}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="sv-amount ${pos ? 'c-income' : 'c-expense'}" style="${isFuture ? 'opacity:.7' : ''}">${pos ? '+' : ''}${fmtEur(saving)}</span>
      </div>`;
  };

  const rows = [
    ...realMonths.map(m => makeRow(m, false)),
    ...(futureMonths.length ? [
      `<div class="sv-divider"><span>Proyección</span></div>`,
      ...futureMonths.map(m => makeRow(m, true)),
    ] : []),
  ].join('');

  const hasEstMonths = futureMonths.some(m => !(m.totalIncomes > 0 || m.totalExpenses > 0));
  const projNote = hasEstMonths && avgSaving !== 0
    ? `<div style="font-size:11px;color:var(--faint);margin-top:2px">~ Meses sin datos: estimado por promedio</div>`
    : futureMonths.length
    ? `<div style="font-size:11px;color:var(--faint);margin-top:2px">Incluye ingresos y gastos pendientes</div>`
    : '';

  return `
    <div class="chart-wrap">
      <div class="sv-total">
        <div>
          <div class="chart-title" style="margin-bottom:2px">Ahorro anual</div>
          <div style="font-size:12px;color:var(--muted)">Ingresos cobrados − gastos pagados</div>
          ${projNote}
        </div>
        <div>
          <div class="sv-total-amount ${totPos ? 'c-income' : 'c-expense'}">${totPos ? '+' : ''}${fmtEur(annualTotal)}</div>
          ${futureMonths.length ? `<div style="font-size:11px;color:var(--faint);text-align:right">proyectado</div>` : ''}
        </div>
      </div>
      ${rows}
    </div>`;
}

function renderBarChart(months) {
  if (!months || !months.length) return '';
  const maxVal = Math.max(...months.flatMap(m => [m.totalIncomes, m.totalExpenses]), 1);
  const W = 650, H = 100, BW = 18, GAP = 32;
  const totalSlot = BW * 2 + 3 + GAP;

  const bars = months.map((m, i) => {
    const x = i * totalSlot + GAP / 2;
    const iH = Math.max((m.totalIncomes / maxVal) * H, m.totalIncomes > 0 ? 3 : 0);
    const eH = Math.max((m.totalExpenses / maxVal) * H, m.totalExpenses > 0 ? 3 : 0);
    const isCur = m.month === state.month && state.dashYear === state.year;
    return `
      <rect x="${x}" y="${H - iH}" width="${BW}" height="${iH}" rx="3" fill="var(--income)" opacity="${isCur ? 1 : 0.65}"/>
      <rect x="${x + BW + 3}" y="${H - eH}" width="${BW}" height="${eH}" rx="3" fill="var(--expense)" opacity="${isCur ? 1 : 0.65}"/>
      <text x="${x + BW + 1.5}" y="${H + 13}" font-size="9" fill="var(--faint)" text-anchor="middle">${MONTHS_SHORT[i]}</text>
    `;
  }).join('');

  return `<svg viewBox="0 0 ${totalSlot * 12 + GAP} ${H + 18}" style="width:100%;height:auto;overflow:visible">
    <line x1="0" y1="${H}" x2="${totalSlot * 12 + GAP}" y2="${H}" stroke="var(--border)" stroke-width="1"/>
    ${bars}
  </svg>`;
}

function renderDonutChart(breakdown) {
  if (!breakdown || !breakdown.length) return '';
  const total = breakdown.reduce((s, b) => s + b.total, 0);
  if (total === 0) return '';

  const R = 38, CX = 50, CY = 50, SW = 18;
  const circumference = 2 * Math.PI * R;
  let accumulated = 0;
  const segments = breakdown.slice(0, 7).map(b => {
    const frac = b.total / total;
    const dash = frac * circumference;
    const dashOffset = -accumulated;
    accumulated += dash;
    const color = b.color || '#6B7280';
    return `<circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="${color}" stroke-width="${SW}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${dashOffset}" style="transform:rotate(-90deg);transform-origin:${CX}px ${CY}px"/>`;
  }).join('');

  const legend = breakdown.slice(0, 6).map(b => {
    const name = b.label || b.categoryName || b.accountName || b.expenseType || '';
    const pct = Math.round(b.total / total * 100);
    const color = b.color || '#6B7280';
    return `<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
      <span style="width:10px;height:10px;border-radius:50%;background:${color};flex-shrink:0"></span>
      <span style="font-size:11px;color:var(--muted);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(name)}</span>
      <span style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap">${pct}%</span>
    </div>`;
  }).join('');

  return `<div style="display:flex;align-items:center;gap:16px;flex-wrap:wrap">
    <svg viewBox="0 0 100 100" style="width:90px;min-width:90px;flex-shrink:0">
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none" stroke="var(--border)" stroke-width="${SW}"/>
      ${segments}
    </svg>
    <div style="flex:1;min-width:120px">${legend}</div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════
   HISTORIAL
════════════════════════════════════════════════════════════════ */
function populateHistoryFilters() {
  const now = new Date();
  const mSel = document.getElementById('hist-filter-month');
  const ySel = document.getElementById('hist-filter-year');
  if (!mSel || !ySel) return;
  mSel.innerHTML = '<option value="">Todos los meses</option>' +
    MONTHS.map((m,i) => `<option value="${i+1}">${m}</option>`).join('');
  ySel.innerHTML = '<option value="">Todos los años</option>';
  for (let y = now.getFullYear(); y >= 2020; y--)
    ySel.innerHTML += `<option value="${y}">${y}</option>`;
}

async function loadHistory() {
  const el = document.getElementById('historial-content');
  el.innerHTML = ldg();
  const month = document.getElementById('hist-filter-month')?.value || '';
  const year  = document.getElementById('hist-filter-year')?.value  || '';
  let url = '/dashboard/history?limit=100';
  if (month) url += `&month=${month}`;
  if (year)  url += `&year=${year}`;
  try {
    const data = await api('GET', url);
    if (!data) return;
    state.historyItems = data.items ?? [];
    state.historyTotal = data.total ?? 0;
    renderHistory();
  } catch(e) {
    el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function applyHistoryFilter() { loadHistory(); }

function renderHistory() {
  const search = (document.getElementById('hist-search')?.value || '').toLowerCase();
  let items = state.historyItems;
  if (search) items = items.filter(i =>
    i.name.toLowerCase().includes(search) ||
    (i.accountName || '').toLowerCase().includes(search) ||
    (i.categoryName || '').toLowerCase().includes(search)
  );

  if (items.length === 0) {
    document.getElementById('historial-content').innerHTML = `
      <div class="empty"><div class="empty-ico">🕐</div><h3>Sin movimientos</h3><p>No hay registros para este filtro.</p></div>`;
    return;
  }

  // Group by year-month
  const groups = {};
  items.forEach(item => {
    const key = `${item.year}-${String(item.month).padStart(2,'0')}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(item);
  });

  let html = '';
  Object.keys(groups).sort((a,b) => b.localeCompare(a)).forEach(key => {
    const [y, m] = key.split('-');
    const grpTotal = groups[key].reduce((s, i) => s + (i.type === 'income' ? i.amount : -i.amount), 0);
    const pos = grpTotal >= 0;
    html += `<div class="hist-month-hdr">
      <span class="hist-month-name">${MONTHS[parseInt(m)-1]} ${y}</span>
      <span class="hist-month-net ${pos ? 'pos' : 'neg'}">${pos ? '+' : ''}${fmtEur(grpTotal)}</span>
    </div>`;
    html += `<div class="hist-group">`;
    groups[key].forEach(item => {
      const isIncome = item.type === 'income';
      const meta = [
        isIncome ? null : esc(item.accountName || ''),
        item.categoryName ? esc(item.categoryName) : null,
        item.recurrence && item.recurrence !== 'NONE' ? recLabel(item.recurrence) : null,
      ].filter(Boolean).join(' · ');
      const paidLabel = item.isPaid ? (isIncome ? 'Cobrado' : 'Pagado') : 'Pendiente';
      html += `
        <div class="hist-item">
          <div class="hist-ico ${item.type}">${isIncome ? '↑' : '↓'}</div>
          <div class="hist-body">
            <div class="hist-name">${esc(item.name)}</div>
            ${meta ? `<div class="hist-meta">${meta}</div>` : ''}
          </div>
          <div class="hist-right">
            <div class="hist-amount ${item.type}">${isIncome ? '+' : '-'}${fmtEur(item.amount)}</div>
            <span class="hist-status ${item.isPaid ? 's-paid' : 's-pending'}">${paidLabel}</span>
          </div>
        </div>`;
    });
    html += `</div>`;
  });
  document.getElementById('historial-content').innerHTML = html;
}

/* ═══════════════════════════════════════════════════════════
   GASTOS
════════════════════════════════════════════════════════════════ */
async function loadGastos() {
  const el = document.getElementById('gastos-content');
  const cacheKey = `exp_${state.month}_${state.year}`;
  const cached = loadCache(cacheKey);
  if (cached) { state.expenses = cached; renderGastos(); } else el.innerHTML = ldg();
  try {
    const data = await api('GET', `/expenses?month=${state.month}&year=${state.year}`);
    if (data === null) return;
    state.expenses = data ?? [];
    // Eliminar cuotas que superan el total (datos incorrectos de propagaciones previas)
    const overdue = state.expenses.filter(e => e.cuotaNumber && e.totalCuotas && e.cuotaNumber > e.totalCuotas);
    if (overdue.length > 0) {
      await Promise.all(overdue.map(e => api('DELETE', `/expenses/${e.id}`)));
      state.expenses = state.expenses.filter(e => !overdue.some(o => o.id === e.id));
    }
    saveCache(cacheKey, state.expenses);
    renderGastos();
  } catch(e) {
    if (!cached) el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function toggleGastosFilters() {
  const panel = document.getElementById('gf-panel');
  const arrow = document.getElementById('gf-arrow');
  const open  = panel.style.display === 'none';
  panel.style.display = open ? '' : 'none';
  arrow.textContent   = open ? '▴' : '▾';
}

function clearGastosFilters() {
  document.getElementById('gastos-search').value          = '';
  document.getElementById('gastos-filter-cat').value      = '';
  document.getElementById('gastos-filter-type').value     = '';
  document.getElementById('gastos-filter-account').value  = '';
  document.querySelectorAll('#gastos-filter .fbtn').forEach((b,i) => b.classList.toggle('on', i === 0));
  state.gastosFilter = 'all';
  updateGastosFilterBadge();
  renderGastos();
}

function updateGastosFilterBadge() {
  const active = [
    state.gastosFilter !== 'all',
    !!(document.getElementById('gastos-search')?.value),
    !!(document.getElementById('gastos-filter-cat')?.value),
    !!(document.getElementById('gastos-filter-type')?.value),
    !!(document.getElementById('gastos-filter-account')?.value),
  ].filter(Boolean).length;
  const badge = document.getElementById('gf-active-count');
  if (badge) {
    badge.style.display = active > 0 ? '' : 'none';
    badge.textContent   = active;
  }
}

function populateGastosFilterSelects() {
  const catSel = document.getElementById('gastos-filter-cat');
  const accSel = document.getElementById('gastos-filter-account');
  if (catSel && state.categories?.length) {
    catSel.innerHTML = '<option value="">Todas</option>' +
      state.categories.map(c => `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${esc(c.name)}</option>`).join('');
  }
  if (accSel && state.accounts?.length) {
    accSel.innerHTML = '<option value="">Todas</option>' +
      state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  }
}

function renderGastos() {
  const f       = state.gastosFilter;
  const search  = (document.getElementById('gastos-search')?.value || '').toLowerCase();
  const catId   = document.getElementById('gastos-filter-cat')?.value    || '';
  const typeVal = document.getElementById('gastos-filter-type')?.value   || '';
  const accId   = document.getElementById('gastos-filter-account')?.value || '';
  let list      = state.expenses;

  if (f === 'paid')    list = list.filter(e => e.isPaid);
  if (f === 'pending') list = list.filter(e => !e.isPaid);
  if (catId)   list = list.filter(e => String(e.categoryId) === catId);
  if (typeVal) list = list.filter(e => e.expenseType === typeVal);
  if (accId)   list = list.filter(e => String(e.accountId) === accId);
  if (search)  list = list.filter(e =>
    e.name.toLowerCase().includes(search) ||
    (e.notes || '').toLowerCase().includes(search) ||
    (e.categoryName || '').toLowerCase().includes(search) ||
    (e.accountName || '').toLowerCase().includes(search)
  );

  updateGastosFilterBadge();

  const total   = state.expenses.reduce((s,e) => s + e.amount, 0);
  const paid    = state.expenses.filter(e => e.isPaid).reduce((s,e) => s + e.amount, 0);
  const pending = total - paid;

  document.getElementById('gastos-stats').innerHTML = `
    <div class="scard"><div class="snum c-expense">${fmtEur(total)}</div><div class="slbls">Total</div></div>
    <div class="scard"><div class="snum c-income">${fmtEur(paid)}</div><div class="slbls">Pagado</div></div>
    <div class="scard"><div class="snum c-pending">${fmtEur(pending)}</div><div class="slbls">Pendiente</div></div>
  `;
  const gb = state.expenses.filter(e => !e.isPaid).length;
  const gbEl = document.getElementById('gastos-badge');
  gbEl.textContent = gb || '';
  gbEl.dataset.zero = gb === 0 ? '1' : '';

  if (list.length === 0) {
    document.getElementById('gastos-content').innerHTML = `
      <div class="empty"><div class="empty-ico">💸</div><h3>Sin gastos</h3>
      <p>${f === 'all' && !search ? 'Añade tu primer gasto del mes.' : 'No hay gastos con ese filtro.'}</p></div>`;
    return;
  }

  // Group by expense type
  const typeOrder = ['FIXED','DEBT','VARIABLE','SAVINGS','INVESTMENT','DONATION','OTHER',''];
  const groups = {};
  list.forEach(e => {
    const key = e.expenseType || '';
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  let html = '';
  typeOrder.forEach(key => {
    if (!groups[key]) return;
    const grpItems = groups[key];
    const grpTotal = grpItems.reduce((s,e) => s + e.amount, 0);
    const meta = key ? EXPENSE_TYPES[key] : null;
    if (Object.keys(groups).length > 1 || key) {
      html += `<div class="group-hdr">
        <span class="group-hdr-ico">${meta ? meta.icon : '📋'}</span>
        <span class="group-hdr-label">${meta ? meta.label : 'Sin tipo'}</span>
        <span class="group-hdr-total">${fmtEur(grpTotal)}</span>
      </div>`;
    }
    grpItems.forEach(e => { html += renderExpenseCard(e); });
  });

  document.getElementById('gastos-content').innerHTML = html;
}

function renderExpenseCard(e) {
  const cuotaTag = (e.cuotaNumber && e.totalCuotas)
    ? `<span class="cuota-tag">Cuota ${e.cuotaNumber} de ${e.totalCuotas}</span>` : '';
  const catTag = e.categoryName
    ? `<span class="cat-tag">${e.categoryIcon ? e.categoryIcon + ' ' : ''}${esc(e.categoryName)}</span>` : '';
  const tp = typePill(e.expenseType);

  return `
    <div class="rcard" id="gasto-${e.id}">
      <div class="ubar ${e.isPaid ? 'expense-paid' : 'expense-pending'}"></div>
      <div class="rbody">
        <div class="rmeta">
          <div>
            <div class="rcat">${esc(e.accountName || state.accounts.find(a => String(a.id) === String(e.accountId))?.name || 'Sin cuenta')}${e.recurrence && e.recurrence !== 'NONE' ? ' · ' + recLabel(e.recurrence) : ''}</div>
            <div class="rtitle">${esc(e.name)}</div>
            ${(tp || catTag || cuotaTag) ? `<div class="tag-row">${tp}${catTag}${cuotaTag}</div>` : ''}
            ${e.notes ? `<div class="rnotes">${esc(e.notes)}</div>` : ''}
          </div>
          <div class="ramount expense">${fmtEur(e.amount)}</div>
        </div>
        <div class="rfoot">
          <span class="spill ${e.isPaid ? 's-paid' : 's-pending'}">${e.isPaid ? 'Pagado' : 'Pendiente'}</span>
          <div class="ractions">
            <button class="act-btn paid-toggle ${e.isPaid ? 'is-paid' : ''}" onclick="toggleExpensePaid('${e.id}',${e.isPaid})">
              ${e.isPaid ? '↩ Pendiente' : '✓ Pagado'}
            </button>
            <button class="act-btn" onclick="openExpenseModal('${e.id}')">✏️ Editar</button>
            <button class="act-btn del" onclick="askDeleteExpense('${e.id}')">🗑</button>
          </div>
        </div>
      </div>
    </div>`;
}

function setGastosFilter(btn, f) {
  document.querySelectorAll('#gastos-filter .fbtn').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  state.gastosFilter = f;
  updateGastosFilterBadge();
  renderGastos();
}

/* ═══════════════════════════════════════════════════════════
   INGRESOS
════════════════════════════════════════════════════════════════ */
async function loadIngresos() {
  const el = document.getElementById('ingresos-content');
  const cacheKey = `inc_${state.month}_${state.year}`;
  const cached = loadCache(cacheKey);
  if (cached) { state.incomes = cached; renderIngresos(); } else el.innerHTML = ldg();
  try {
    const data = await api('GET', `/incomes?month=${state.month}&year=${state.year}`);
    if (data === null) return;
    state.incomes = data ?? [];
    saveCache(cacheKey, state.incomes);
    renderIngresos();
  } catch(e) {
    if (!cached) el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderIngresos() {
  const f      = state.ingresosFilter;
  const search = (document.getElementById('ingresos-search')?.value || '').toLowerCase();
  let list     = state.incomes;
  if (f === 'paid')    list = list.filter(i => i.isPaid);
  if (f === 'pending') list = list.filter(i => !i.isPaid);
  if (search) list = list.filter(i =>
    i.name.toLowerCase().includes(search) ||
    (i.notes || '').toLowerCase().includes(search)
  );

  const total   = state.incomes.reduce((s,i) => s + i.amount, 0);
  const paid    = state.incomes.filter(i => i.isPaid).reduce((s,i) => s + i.amount, 0);
  const pending = total - paid;

  document.getElementById('ingresos-stats').innerHTML = `
    <div class="scard"><div class="snum c-income">${fmtEur(total)}</div><div class="slbls">Total</div></div>
    <div class="scard"><div class="snum c-income">${fmtEur(paid)}</div><div class="slbls">Cobrado</div></div>
    <div class="scard"><div class="snum c-pending">${fmtEur(pending)}</div><div class="slbls">Pendiente</div></div>
  `;
  const ib = state.incomes.filter(i => !i.isPaid).length;
  const ibEl = document.getElementById('ingresos-badge');
  ibEl.textContent = ib || '';
  ibEl.dataset.zero = ib === 0 ? '1' : '';

  if (list.length === 0) {
    document.getElementById('ingresos-content').innerHTML = `
      <div class="empty"><div class="empty-ico">💰</div><h3>Sin ingresos</h3>
      <p>${f === 'all' && !search ? 'Añade tu primer ingreso del mes.' : 'No hay ingresos con ese filtro.'}</p></div>`;
    return;
  }

  document.getElementById('ingresos-content').innerHTML = list.map(i => `
    <div class="rcard" id="ingreso-${i.id}">
      <div class="ubar ${i.isPaid ? 'paid' : 'pending'}"></div>
      <div class="rbody">
        <div class="rmeta">
          <div>
            <div class="rcat">${(() => { const acName = i.accountName || state.accounts.find(a => String(a.id) === String(i.accountId))?.name || ''; const rec = i.recurrence && i.recurrence !== 'NONE' ? recLabel(i.recurrence) : 'Ingreso'; return acName ? `${acName} · ${rec}` : rec; })()}</div>
            <div class="rtitle">${esc(i.name)}</div>
            ${i.notes ? `<div class="rnotes">${esc(i.notes)}</div>` : ''}
          </div>
          <div class="ramount income">${fmtEur(i.amount)}</div>
        </div>
        <div class="rfoot">
          <span class="spill ${i.isPaid ? 's-paid' : 's-pending'}">${i.isPaid ? 'Cobrado' : 'Pendiente'}</span>
          <div class="ractions">
            <button class="act-btn paid-toggle ${i.isPaid ? 'is-paid' : ''}" onclick="toggleIncomePaid('${i.id}',${i.isPaid})">
              ${i.isPaid ? '↩ Pendiente' : '✓ Cobrado'}
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
  if (el) el.innerHTML = ldg();
  try {
    const data = await api('GET', '/accounts');
    state.accounts = data ?? [];
    renderAccounts();
    populateAccountSelect();
    populateGastosFilterSelects();
  } catch(e) {
    if (el) el.innerHTML = `<div class="empty"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderAccounts() {
  const el = document.getElementById('cuentas-content');
  if (!el) return;
  if (!state.accounts.length) {
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
  const opts = '<option value="">Selecciona una cuenta…</option>' +
    state.accounts.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('');
  const sel = document.getElementById('e-account');
  if (sel) sel.innerHTML = opts;
}

/* ═══════════════════════════════════════════════════════════
   CATEGORÍAS
════════════════════════════════════════════════════════════════ */
async function loadCategories() {
  try {
    const data = await api('GET', '/categories');
    state.categories = data ?? [];
    populateCategorySelect();
    populateGastosFilterSelects();
  } catch(e) { /* non-critical */ }
}

function populateCategorySelect() {
  const sel = document.getElementById('e-category');
  if (!sel) return;
  sel.innerHTML = '<option value="">Sin categoría</option>' +
    state.categories.map(c =>
      `<option value="${c.id}">${c.icon ? c.icon + ' ' : ''}${esc(c.name)}</option>`
    ).join('');
}

function renderCategoriesInProfile() {
  const el = document.getElementById('categories-content');
  if (!el) return;
  if (!state.categories.length) {
    el.innerHTML = `<div class="empty" style="padding:24px"><div class="empty-ico">🏷️</div><h3>Sin categorías</h3><p>Crea tu primera categoría.</p></div>`;
    return;
  }
  el.innerHTML = state.categories.map(c => `
    <div class="cat-card" id="cat-${c.id}">
      <div class="cat-dot" style="background:${c.color ? c.color + '22' : 'var(--surface-2)'}">
        <span>${c.icon || '🏷️'}</span>
      </div>
      <div class="cat-info"><div class="cat-name">${esc(c.name)}</div></div>
      <div class="cat-actions">
        <button class="btn-s" style="padding:4px 9px;font-size:12px" onclick="openCategoryModal('${c.id}')">✏️</button>
        <button class="btn-danger" style="padding:4px 9px;font-size:12px" onclick="askDeleteCategory('${c.id}')">🗑</button>
      </div>
    </div>`).join('');
}

function openCategoryModal(id) {
  state.editingCategoryId = id ?? null;
  const isEdit = !!id;
  document.getElementById('category-modal-title').textContent = isEdit ? 'Editar categoría' : 'Nueva categoría';
  document.getElementById('cat-name').value  = '';
  document.getElementById('cat-icon').value  = '';
  document.getElementById('cat-color').value = '#1e4a58';
  document.getElementById('cat-color-picker').value = '#1e4a58';
  document.getElementById('cat-name-err').classList.remove('on');
  if (isEdit) {
    const c = state.categories.find(x => x.id === id);
    if (c) {
      document.getElementById('cat-name').value  = c.name;
      document.getElementById('cat-icon').value  = c.icon || '';
      const color = c.color || '#1e4a58';
      document.getElementById('cat-color').value = color;
      document.getElementById('cat-color-picker').value = color;
    }
  }
  openModal('category-modal');
}

async function saveCategory() {
  const name  = document.getElementById('cat-name').value.trim();
  const icon  = document.getElementById('cat-icon').value.trim() || undefined;
  const color = document.getElementById('cat-color').value.trim() || undefined;
  if (!name) { document.getElementById('cat-name-err').classList.add('on'); return; }
  document.getElementById('cat-name-err').classList.remove('on');
  const payload = { name, icon, color };
  const btn = document.getElementById('cat-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingCategoryId) {
      await api('PATCH', `/categories/${state.editingCategoryId}`, payload);
      showToast('Categoría actualizada', 'success');
    } else {
      await api('POST', '/categories', payload);
      showToast('Categoría creada', 'success');
    }
    closeModal('category-modal');
    await loadCategories();
    renderCategoriesInProfile();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}

function askDeleteCategory(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar esta categoría?';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/categories/${id}`);
    showToast('Categoría eliminada');
    await loadCategories();
    renderCategoriesInProfile();
  };
  openModal('confirm-modal');
}

/* ═══════════════════════════════════════════════════════════
   OBJETIVOS DE AHORRO
════════════════════════════════════════════════════════════════ */
async function loadSavingsGoals() {
  const el = document.getElementById('goals-content');
  if (!el) return;
  el.innerHTML = ldg();
  try {
    const data = await api('GET', '/savings-goals');
    state.savingsGoals = data ?? [];
    renderSavingsGoals();
  } catch(e) {
    el.innerHTML = `<div class="empty" style="padding:24px"><div class="empty-ico">⚠️</div><h3>Error</h3><p>${e.message}</p></div>`;
  }
}

function renderSavingsGoals() {
  const el = document.getElementById('goals-content');
  if (!el) return;
  if (!state.savingsGoals.length) {
    el.innerHTML = `<div class="empty" style="padding:24px"><div class="empty-ico">🎯</div><h3>Sin objetivos</h3><p>Crea tu primer objetivo de ahorro.</p></div>`;
    return;
  }
  el.innerHTML = state.savingsGoals.map(g => {
    const pct = g.targetAmount > 0 ? Math.min(Math.round((g.savedAmount / g.targetAmount) * 100), 100) : 0;
    const done = pct >= 100;
    const remaining = Math.max(g.targetAmount - g.savedAmount, 0);
    const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString('es-ES') : null;
    return `
      <div class="goal-card" id="goal-${g.id}">
        <div class="goal-header">
          <span class="goal-emoji">${g.emoji || '🎯'}</span>
          <span class="goal-name">${esc(g.name)}</span>
          <span class="goal-pct">${pct}%</span>
        </div>
        <div class="goal-amounts">
          <span>Ahorrado: ${fmtEur(g.savedAmount)}</span>
          <span>Objetivo: ${fmtEur(g.targetAmount)}</span>
        </div>
        <div class="goal-bar-wrap">
          <div class="goal-bar-fill ${done ? 'done' : ''}" style="width:${pct}%"></div>
        </div>
        ${!done ? `<div style="font-size:12px;color:var(--muted);margin-bottom:8px">Faltan ${fmtEur(remaining)}</div>` : '<div style="font-size:12px;color:var(--success);margin-bottom:8px">✓ ¡Objetivo alcanzado!</div>'}
        ${deadline ? `<div class="goal-deadline">📅 Fecha límite: ${deadline}</div>` : ''}
        <div class="goal-actions" style="margin-top:10px">
          <button class="btn-s" style="padding:4px 10px;font-size:12px" onclick="openAddSavingsModal('${g.id}','${esc(g.name)}')">+ Añadir</button>
          <button class="btn-s" style="padding:4px 10px;font-size:12px" onclick="openGoalModal('${g.id}')">✏️ Editar</button>
          <button class="btn-danger" style="padding:4px 10px;font-size:12px" onclick="askDeleteGoal('${g.id}')">🗑</button>
        </div>
      </div>`;
  }).join('');
}

function openGoalModal(id) {
  state.editingGoalId = id ?? null;
  const isEdit = !!id;
  document.getElementById('goal-modal-title').textContent = isEdit ? 'Editar objetivo' : 'Nuevo objetivo';
  ['g-name','g-emoji','g-target','g-saved','g-deadline'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('g-target-err').classList.remove('on');
  if (isEdit) {
    const g = state.savingsGoals.find(x => x.id === id);
    if (g) {
      document.getElementById('g-name').value    = g.name;
      document.getElementById('g-emoji').value   = g.emoji || '';
      document.getElementById('g-target').value  = g.targetAmount;
      document.getElementById('g-saved').value   = g.savedAmount || '';
      document.getElementById('g-deadline').value = g.deadline ? g.deadline.split('T')[0] : '';
    }
  }
  openModal('goal-modal');
}

async function saveGoal() {
  const name   = document.getElementById('g-name').value.trim();
  const target = parseFloat(document.getElementById('g-target').value);
  if (!name) { document.getElementById('g-name-err').classList.add('on'); return; }
  document.getElementById('g-name-err').classList.remove('on');
  if (isNaN(target) || target < 1) { document.getElementById('g-target-err').classList.add('on'); return; }
  document.getElementById('g-target-err').classList.remove('on');
  const saved    = parseFloat(document.getElementById('g-saved').value) || 0;
  const deadline = document.getElementById('g-deadline').value || undefined;
  const emoji    = document.getElementById('g-emoji').value.trim() || undefined;
  const payload  = { name, targetAmount: target, savedAmount: saved, deadline, emoji };
  const btn = document.getElementById('g-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingGoalId) {
      await api('PATCH', `/savings-goals/${state.editingGoalId}`, payload);
      showToast('Objetivo actualizado', 'success');
    } else {
      await api('POST', '/savings-goals', payload);
      showToast('Objetivo creado', 'success');
    }
    closeModal('goal-modal');
    await loadSavingsGoals();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}

function openAddSavingsModal(goalId, goalName) {
  state.addSavingsGoalId = goalId;
  document.getElementById('add-savings-title').textContent = `Añadir a: ${goalName}`;
  document.getElementById('as-amount').value = '';
  openModal('add-savings-modal');
}

async function saveAddSavings() {
  const amount = parseFloat(document.getElementById('as-amount').value);
  if (isNaN(amount) || amount <= 0) { showToast('Introduce un importe válido', 'error'); return; }
  const goal = state.savingsGoals.find(g => g.id === state.addSavingsGoalId);
  if (!goal) return;
  const btn = document.getElementById('as-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    await api('PATCH', `/savings-goals/${state.addSavingsGoalId}`, {
      savedAmount: (goal.savedAmount || 0) + amount,
    });
    showToast('Ahorro añadido', 'success');
    closeModal('add-savings-modal');
    await loadSavingsGoals();
  } catch(e) {
    showToast(e.message || 'Error', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Añadir'; }
}

function askDeleteGoal(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar este objetivo de ahorro?';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/savings-goals/${id}`);
    showToast('Objetivo eliminado');
    await loadSavingsGoals();
  };
  openModal('confirm-modal');
}

/* ═══════════════════════════════════════════════════════════
   THEME
════════════════════════════════════════════════════════════════ */
function setTheme(value) {
  if (value === 'system') {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('finanzas_theme');
  } else {
    document.documentElement.setAttribute('data-theme', value);
    localStorage.setItem('finanzas_theme', value);
  }
  updateThemeSelector();
}

function updateThemeSelector() {
  const saved = localStorage.getItem('finanzas_theme');
  const active = saved || 'system';
  ['light','system','dark'].forEach(v => {
    document.getElementById('theme-opt-' + v)?.classList.toggle('on', active === v);
  });
}

/* ═══════════════════════════════════════════════════════════
   PERFIL
════════════════════════════════════════════════════════════════ */
function openProfileModal() {
  const u = state.user;
  if (u) {
    document.getElementById('p-name').value  = u.name || '';
    document.getElementById('p-email').value = u.email || '';
    document.getElementById('p-budget').value = u.monthlyBudget || '';
  }
  document.getElementById('p-cur-pass').value = '';
  document.getElementById('p-new-pass').value = '';
  document.getElementById('p-pass-err').classList.remove('on');
  updateThemeSelector();
  updateAvatarUI(state.user?.avatar || null);
  showProfileTab('cuenta');
  openModal('profile-modal');
  loadSavingsGoals();
  renderCategoriesInProfile();
}

function showProfileTab(which) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.ptab-content').forEach(c => c.style.display = 'none');
  document.getElementById('ptab-' + which).classList.add('on');
  document.getElementById('pc-' + which).style.display = '';
}

function resizeImageToBase64(file, size = 200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      const s = Math.min(img.width, img.height);
      const ox = (img.width  - s) / 2;
      const oy = (img.height - s) / 2;
      ctx.drawImage(img, ox, oy, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = reject;
    img.src = url;
  });
}

function updateAvatarUI(src) {
  const btn = document.getElementById('btn-profile');
  if (!btn) return;
  if (src) {
    btn.innerHTML = `<img src="${src}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block">`;
  } else {
    btn.textContent = '👤';
  }
  const prev = document.getElementById('p-avatar-img');
  if (prev) { prev.src = src || ''; prev.style.display = src ? 'block' : 'none'; }
  const ico  = document.getElementById('p-avatar-ico');
  if (ico)  ico.style.display = src ? 'none' : 'block';
}

async function onAvatarChange(input) {
  const file = input.files?.[0];
  if (!file) return;
  try {
    const base64 = await resizeImageToBase64(file);
    const data = await api('PATCH', '/auth/profile', { avatar: base64 });
    if (data) {
      state.user = { ...state.user, avatar: data.avatar };
      localStorage.setItem('finanzas_user', JSON.stringify(state.user));
      updateAvatarUI(data.avatar);
      showToast('Foto actualizada', 'success');
    }
  } catch(e) { showToast('Error al subir imagen', 'error'); }
}

async function saveProfile() {
  const name   = document.getElementById('p-name').value.trim();
  const budget = parseFloat(document.getElementById('p-budget').value);
  const payload = {};
  if (name) payload.name = name;
  payload.monthlyBudget = isNaN(budget) || budget <= 0 ? null : budget;
  const btn = document.getElementById('p-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    const data = await api('PATCH', '/auth/profile', payload);
    if (data) {
      state.user = { ...state.user, name: data.name ?? state.user.name, monthlyBudget: data.monthlyBudget };
      localStorage.setItem('finanzas_user', JSON.stringify(state.user));
      document.getElementById('hdr-user').textContent = state.user.name?.split(' ')[0] ?? '';
    }
    showToast('Perfil actualizado', 'success');
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Guardar datos'; }
}

async function savePassword() {
  const cur = document.getElementById('p-cur-pass').value;
  const nw  = document.getElementById('p-new-pass').value;
  const errEl = document.getElementById('p-pass-err');
  errEl.classList.remove('on');
  if (!cur || !nw) { errEl.textContent = 'Rellena ambos campos'; errEl.classList.add('on'); return; }
  if (nw.length < 6) { errEl.textContent = 'La nueva contraseña debe tener al menos 6 caracteres'; errEl.classList.add('on'); return; }
  const btn = document.getElementById('p-pass-btn');
  btn.disabled = true; btn.textContent = 'Cambiando…';
  try {
    await api('PATCH', '/auth/profile', { currentPassword: cur, newPassword: nw });
    document.getElementById('p-cur-pass').value = '';
    document.getElementById('p-new-pass').value = '';
    showToast('Contraseña cambiada', 'success');
  } catch(e) {
    errEl.textContent = e.message || 'Error al cambiar contraseña';
    errEl.classList.add('on');
  } finally { btn.disabled = false; btn.textContent = 'Cambiar contraseña'; }
}

/* ═══════════════════════════════════════════════════════════
   MODAL GASTO
════════════════════════════════════════════════════════════════ */
function openExpenseModal(id) {
  state.editingExpenseId = id ?? null;
  const isEdit = !!id;
  document.getElementById('expense-modal-title').textContent = isEdit ? 'Editar gasto' : 'Nuevo gasto';
  ['e-name','e-amount','e-notes'].forEach(f => document.getElementById(f).value = '');
  document.getElementById('e-type').value       = '';
  document.getElementById('e-category').value   = '';
  document.getElementById('e-recurrence').value = 'NONE';
  document.getElementById('e-account').value    = '';
  document.getElementById('e-month').value      = state.month;
  document.getElementById('e-year').value       = state.year;
  document.getElementById('e-cuota-num').value   = '';
  document.getElementById('e-cuota-total').value = '';
  document.getElementById('e-cuota-row').style.display = 'none';
  document.getElementById('e-paid-toggle').classList.remove('on');
  document.getElementById('e-propagate-toggle').classList.remove('on');
  document.getElementById('e-propagate-row').style.display = isEdit ? '' : 'none';
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
      document.getElementById('e-type').value       = exp.expenseType ?? '';
      document.getElementById('e-category').value   = exp.categoryId ?? '';
      if (exp.cuotaNumber) document.getElementById('e-cuota-num').value   = exp.cuotaNumber;
      if (exp.totalCuotas) document.getElementById('e-cuota-total').value = exp.totalCuotas;
      if (exp.expenseType === 'DEBT') document.getElementById('e-cuota-row').style.display = '';
      if (exp.isPaid) document.getElementById('e-paid-toggle').classList.add('on');
    }
  }
  openModal('expense-modal');
}

function onExpenseTypeChange() {
  const type = document.getElementById('e-type').value;
  document.getElementById('e-cuota-row').style.display = type === 'DEBT' ? '' : 'none';
}

async function saveExpense() {
  let valid = true;
  const name      = document.getElementById('e-name').value.trim();
  const amount    = parseFloat(document.getElementById('e-amount').value);
  const accountId = document.getElementById('e-account').value;
  if (!name)    { document.getElementById('e-name-err').classList.add('on');    valid = false; }
  else            document.getElementById('e-name-err').classList.remove('on');
  if (isNaN(amount) || amount < 0) { document.getElementById('e-amount-err').classList.add('on'); valid = false; }
  else            document.getElementById('e-amount-err').classList.remove('on');
  if (!accountId) { document.getElementById('e-account-err').classList.add('on'); valid = false; }
  else            document.getElementById('e-account-err').classList.remove('on');
  if (!valid) return;

  const expType     = document.getElementById('e-type').value || undefined;
  const categoryId  = document.getElementById('e-category').value || undefined;
  const cuotaNum    = parseInt(document.getElementById('e-cuota-num').value)   || undefined;
  const cuotaTotal  = parseInt(document.getElementById('e-cuota-total').value) || undefined;

  const isNew = !state.editingExpenseId;
  const payload = {
    name, amount,
    ...(isNew && {
      accountId,
      month: parseInt(document.getElementById('e-month').value),
      year:  parseInt(document.getElementById('e-year').value),
    }),
    recurrence: document.getElementById('e-recurrence').value,
    isPaid:     document.getElementById('e-paid-toggle').classList.contains('on'),
    notes:      document.getElementById('e-notes').value.trim() || undefined,
    expenseType: expType,
    categoryId,
    cuotaNumber: cuotaNum,
    totalCuotas: cuotaTotal,
  };

  const btn = document.getElementById('e-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingExpenseId) {
      await api('PUT', `/expenses/${state.editingExpenseId}`, payload);
      if (document.getElementById('e-propagate-toggle').classList.contains('on')) {
        const n = await propagateEditToFuture('expenses', name, payload, state.month, state.year);
        showToast(`Gasto actualizado${n > 0 ? ` y propagado a ${n} mes${n > 1 ? 'es' : ''}` : ''}`, 'success');
      } else {
        showToast('Gasto actualizado', 'success');
      }
    } else {
      await api('POST', '/expenses', payload);
      showToast('Gasto añadido', 'success');
    }
    closeModal('expense-modal');
    await loadGastos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
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

async function propagateEditToFuture(endpoint, name, putPayload, fromMonth, fromYear) {
  let updated = 0;
  const cachePrefix = endpoint === 'expenses' ? 'exp' : 'inc';
  let cuotaNum   = putPayload.cuotaNumber ?? null;
  const cuotaTotal = putPayload.totalCuotas ?? null;

  for (let m = fromMonth + 1; m <= 12; m++) {
    if (cuotaNum != null) cuotaNum++;

    try {
      const items = await api('GET', `/${endpoint}?month=${m}&year=${fromYear}`);
      if (!Array.isArray(items)) continue;
      const match = items.find(i => i.name.toLowerCase() === name.toLowerCase());

      if (cuotaNum != null && cuotaTotal != null && cuotaNum > cuotaTotal) {
        // Cuotas agotadas — eliminar si existe en este mes
        if (match) {
          await api('DELETE', `/${endpoint}/${match.id}`);
          try { localStorage.removeItem(`cc_${cachePrefix}_${m}_${fromYear}`); } catch(e) {}
          try { localStorage.removeItem(`cc_dash_${m}_${fromYear}`); } catch(e) {}
        }
        continue; // seguir buscando meses con posibles copias sobrantes
      }

      if (match) {
        const monthPayload = { ...putPayload };
        if (cuotaNum != null) monthPayload.cuotaNumber = cuotaNum;
        await api('PUT', `/${endpoint}/${match.id}`, monthPayload);
        try { localStorage.removeItem(`cc_${cachePrefix}_${m}_${fromYear}`); } catch(e) {}
        try { localStorage.removeItem(`cc_dash_${m}_${fromYear}`); } catch(e) {}
        updated++;
      }
    } catch(e) { /* silencioso */ }
  }
  if (activeTab === 'dashboard') loadAnnualDashboard();
  return updated;
}

// Corrige cuotas tras auto-propagación del backend (que copia el número sin incrementar)
async function fixCuotasAfterPropagation(month, year) {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear  = month === 1 ? year - 1 : year;
  try {
    const [current, previous] = await Promise.all([
      api('GET', `/expenses?month=${month}&year=${year}`),
      api('GET', `/expenses?month=${prevMonth}&year=${prevYear}`),
    ]);
    if (!current || !previous) return;
    const cuotaItems = current.filter(e => e.cuotaNumber && e.totalCuotas);
    for (const item of cuotaItems) {
      const prev = previous.find(p =>
        p.name.toLowerCase() === item.name.toLowerCase() && p.cuotaNumber
      );
      if (!prev) continue;
      const newCuota = prev.cuotaNumber + 1;
      if (newCuota > item.totalCuotas) {
        await api('DELETE', `/expenses/${item.id}`);
      } else if (newCuota !== item.cuotaNumber) {
        await api('PUT', `/expenses/${item.id}`, { cuotaNumber: newCuota });
      }
    }
  } catch(e) { /* silencioso */ }
}

async function propagateExpenses() {
  try {
    const res = await api('POST', '/expenses/propagate', { month: state.month, year: state.year });
    const n = Array.isArray(res) ? res.length : 0;
    if (n > 0) await fixCuotasAfterPropagation(state.month, state.year);
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
  document.getElementById('i-propagate-toggle').classList.remove('on');
  document.getElementById('i-propagate-row').style.display = isEdit ? '' : 'none';
  ['i-name-err','i-amount-err'].forEach(e => document.getElementById(e).classList.remove('on'));
  const accSel = document.getElementById('i-account');
  accSel.innerHTML = '<option value="">Sin cuenta</option>' +
    state.accounts.map(a => `<option value="${a.id}">${a.name}</option>`).join('');
  if (isEdit) {
    const inc = state.incomes.find(i => i.id === id);
    if (inc) {
      document.getElementById('i-name').value       = inc.name;
      document.getElementById('i-amount').value     = inc.amount;
      document.getElementById('i-notes').value      = inc.notes ?? '';
      document.getElementById('i-month').value      = inc.month;
      document.getElementById('i-year').value       = inc.year;
      document.getElementById('i-recurrence').value = inc.recurrence ?? 'NONE';
      accSel.value = inc.accountId ?? '';
      if (inc.isPaid) document.getElementById('i-paid-toggle').classList.add('on');
    }
  }
  openModal('income-modal');
}

async function saveIncome() {
  let valid = true;
  const name   = document.getElementById('i-name').value.trim();
  const amount = parseFloat(document.getElementById('i-amount').value);
  if (!name)                        { document.getElementById('i-name-err').classList.add('on');   valid = false; }
  else                                document.getElementById('i-name-err').classList.remove('on');
  if (isNaN(amount) || amount < 0)  { document.getElementById('i-amount-err').classList.add('on'); valid = false; }
  else                                document.getElementById('i-amount-err').classList.remove('on');
  if (!valid) return;

  const isNew = !state.editingIncomeId;
  const accountId = document.getElementById('i-account').value || null;
  const payload = {
    name, amount,
    ...(isNew && {
      month: parseInt(document.getElementById('i-month').value),
      year:  parseInt(document.getElementById('i-year').value),
    }),
    ...(accountId ? { accountId } : {}),
    recurrence: document.getElementById('i-recurrence').value,
    isPaid:     document.getElementById('i-paid-toggle').classList.contains('on'),
    notes:      document.getElementById('i-notes').value.trim() || undefined,
  };

  const btn = document.getElementById('i-save-btn');
  btn.disabled = true; btn.textContent = 'Guardando…';
  try {
    if (state.editingIncomeId) {
      await api('PUT', `/incomes/${state.editingIncomeId}`, payload);
      if (document.getElementById('i-propagate-toggle').classList.contains('on')) {
        const n = await propagateEditToFuture('incomes', name, payload, state.month, state.year);
        showToast(`Ingreso actualizado${n > 0 ? ` y propagado a ${n} mes${n > 1 ? 'es' : ''}` : ''}`, 'success');
      } else {
        showToast('Ingreso actualizado', 'success');
      }
    } else {
      await api('POST', '/incomes', payload);
      showToast('Ingreso añadido', 'success');
    }
    closeModal('income-modal');
    await loadIngresos();
    if (activeTab === 'dashboard') loadDashboard();
  } catch(e) {
    showToast(e.message || 'Error al guardar', 'error');
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
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
  document.getElementById('account-modal-title').textContent = id ? 'Editar cuenta' : 'Nueva cuenta';
  document.getElementById('a-name').value   = '';
  document.getElementById('a-budget').value = '';
  document.getElementById('a-name-err').classList.remove('on');
  if (id) {
    const acc = state.accounts.find(a => a.id === id);
    if (acc) { document.getElementById('a-name').value = acc.name; document.getElementById('a-budget').value = acc.budget ?? ''; }
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
  } finally { btn.disabled = false; btn.textContent = 'Guardar'; }
}

function askDeleteAccount(id) {
  document.getElementById('confirm-msg').textContent = '¿Eliminar esta cuenta? Los gastos asociados pueden quedar sin cuenta asignada.';
  state.pendingDeleteFn = async () => {
    await api('DELETE', `/accounts/${id}`);
    showToast('Cuenta eliminada');
    await loadAccounts(); await loadGastos();
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
  } finally { btn.disabled = false; btn.textContent = 'Eliminar'; state.pendingDeleteFn = null; }
}

/* ═══════════════════════════════════════════════════════════
   TOGGLE PAID
════════════════════════════════════════════════════════════════ */
function togglePaid(prefix) {
  document.getElementById(prefix + '-paid-toggle').classList.toggle('on');
}

/* ═══════════════════════════════════════════════════════════
   COLOR PICKER SYNC
════════════════════════════════════════════════════════════════ */
document.getElementById('cat-color-picker').addEventListener('input', e => {
  document.getElementById('cat-color').value = e.target.value;
});
document.getElementById('cat-color').addEventListener('input', e => {
  const v = e.target.value;
  if (/^#[0-9a-fA-F]{6}$/.test(v)) document.getElementById('cat-color-picker').value = v;
});

/* ═══════════════════════════════════════════════════════════
   CLOSE MODAL ON BACKDROP CLICK
════════════════════════════════════════════════════════════════ */
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
