/* ====== Storage keys (MUST match Admin/Manager) ====== */
const HK_KEYS = {
  TASKS: 'hk_tasks_v1',          // stored as { tasks: [...] } (but we also accept legacy array)
  TASK_PING: 'hk_tasks_pulse_v1',
  RES: 'hms_resources_local_v1', // { resources: [...] }
  RES_PING: 'resources-updated'
};

/* ====== Helpers ====== */
const $ = (s,p=document)=>p.querySelector(s);
const $$ = (s,p=document)=>[...p.querySelectorAll(s)];
const safeParse = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today10 = () => new Date().toISOString().slice(0,10);
function log(...a){ console.log('[dept-common]', ...a); }

/* Canonicalize a department label */
function normDept(v) {
  const k = String(v || '').toLowerCase().trim().replace(/\s+/g,' ');
  const map = {
    'floor cleaning': 'Floor Cleaning',
    'room cleaning': 'Room Cleaning',
    'public area': 'Public Area',
    'laundry': 'Laundry',
    'food service': 'Food Service',
    'maintenance': 'Maintenance',
    'gardener': 'Gardener',
    'storekeeping': 'Storekeeping',
    'night shift': 'Night Shift'
  };
  return map[k] || (v || '');
}

/* Determine the department of either a task or a resource */
function deptOf(obj) {
  if (!obj) return '';
  if (obj.dept) return normDept(obj.dept);
  const guess = normDept(obj.type || obj.category || '');
  return guess;
}

function typeLabelOf(t){ return t?.category || t?.type || '-'; }

/* Read storage blobs (accept legacy array or object) */
function readAllTasks() {
  const raw = safeParse(localStorage.getItem(HK_KEYS.TASKS) || 'null', null);
  if (!raw) return [];
  if (Array.isArray(raw)) return raw; // legacy
  if (Array.isArray(raw.tasks)) return raw.tasks;
  return [];
}
function writeAllTasks(list){
  localStorage.setItem(HK_KEYS.TASKS, JSON.stringify({ tasks: list || [] }));
  localStorage.setItem(HK_KEYS.TASK_PING, String(Date.now()));
  try { window.dispatchEvent(new Event(HK_KEYS.TASK_PING)); } catch {}
}

function readAllResources() {
  const blob = safeParse(localStorage.getItem(HK_KEYS.RES) || '{}', {});
  const list = Array.isArray(blob.resources) ? blob.resources : [];
  return list;
}
function writeAllResources(list){
  localStorage.setItem(HK_KEYS.RES, JSON.stringify({ resources: list || [] }));
  localStorage.setItem(HK_KEYS.RES_PING, String(Date.now()));
  try { window.dispatchEvent(new Event(HK_KEYS.RES_PING)); } catch {}
}

/* Task actions */
function completeTaskById(id) {
  const all = readAllTasks();
  const t = all.find(x => String(x.id) === String(id));
  if (!t) return false;
  if (t.status !== 'Completed') {
    t.status = 'Completed';
    t.doneOn = today10();
    writeAllTasks(all);
  }
  return true;
}
function deleteTaskById(id) {
  const all = readAllTasks().filter(x => String(x.id) !== String(id));
  writeAllTasks(all);
}

/* Pills */
function pill(status) {
  const s = String(status || 'Pending');
  const cls = s === 'Completed' ? 'pill done' : s === 'In Progress' ? 'pill wait' : 'pill over';
  return `<span class="${cls}">${esc(s)}</span>`;
}

/* ====== Seed button (only shows if no data for this dept) ====== */
function maybeAddSeedButton(dept) {
  if ($('#seedBtn')) return;
  const host = $('#tasksEmpty')?.parentElement?.parentElement; // card
  if (!host) return;
  const btn = document.createElement('button');
  btn.id = 'seedBtn';
  btn.textContent = 'Inject Demo Data';
  btn.className = 'search';
  btn.style.cssText = 'margin-top:10px; cursor:pointer; border:1px solid rgba(255,255,255,.18)';
  btn.addEventListener('click', () => {
    const tasks = readAllTasks();
    const resources = readAllResources();
    const tMax = tasks.length ? Math.max(...tasks.map(t=>+t.id||0)) : 0;
    const rMax = resources.length ? Math.max(...resources.map(r=>+r.id||0)) : 0;

    tasks.push(
      { id: tMax+1, title:`${dept} — Demo Task`, assignee:'Alice Johnson', dept, category:'Routine', type:'Routine', room:'Lobby', status:'Pending', createdOn:new Date().toISOString() }
    );
    writeAllTasks(tasks);

    resources.push(
      { id: rMax+1, item:'Floor Mop', assignee:'Alice Johnson', dept, quantity:2, unit:'pcs', neededOn:today10(), notes:'—', status:'Requested', createdOn:new Date().toISOString() }
    );
    writeAllResources(resources);
  });
  host.appendChild(btn);
}

/* ====== Main renderer ====== */
function renderDeptPage(dept){
  const DEPT = normDept(dept);
  log('Init department:', DEPT);

  /* ---- TASKS ---- */
  const fS = $('#filterStatus'), fA = $('#filterAssignee'), fT = $('#filterType'), fQ = $('#filterSearch');
  const body = $('#tasksTbody'), empty = $('#tasksEmpty');

  function fillTaskFiltersOnce(all){
    if (fA && fA.children.length <= 1) {
      [...new Set(all.filter(t => deptOf(t) === DEPT).map(t => t.assignee).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b))
        .forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; fA.appendChild(o); });
    }
    if (fT && fT.children.length <= 1) {
      [...new Set(all.filter(t => deptOf(t) === DEPT).map(typeLabelOf).filter(Boolean))]
        .sort((a,b)=>a.localeCompare(b))
        .forEach(n => { const o=document.createElement('option'); o.value=o.textContent=n; fT.appendChild(o); });
    }
  }

  function applyTasks(){
    // If a department script exposes a merged reader, use it. Else local.
    const all = typeof window.__getDeptTasks === 'function' ? window.__getDeptTasks() : readAllTasks();
    fillTaskFiltersOnce(all);
    let list = all.filter(t => deptOf(t) === DEPT);

    const qs = (fQ?.value || '').toLowerCase().trim();
    const fs = fS?.value || 'All';
    const fa = fA?.value || 'All';
    const ft = fT?.value || 'All Types';

    if (fs !== 'All') list = list.filter(t => (t.status || 'Pending') === fs);
    if (fa !== 'All') list = list.filter(t => (t.assignee || '') === fa);
    if (ft !== 'All Types') list = list.filter(t => typeLabelOf(t) === ft);
    if (qs) list = list.filter(t => (`${t.title||''} ${t.assignee||''} ${t.room||''} ${typeLabelOf(t)}`).toLowerCase().includes(qs));

    body.innerHTML = '';
    if (!list.length) {
      empty.style.display = 'block';
      maybeAddSeedButton(DEPT);
    } else {
      empty.style.display = 'none';
    }

    list.forEach((t, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width:48px;color:#9bb0c9">${i+1}</td>
        <td>${esc(t.title)}</td>
        <td>${esc(t.assignee||'-')}</td>
        <td>${esc(t.room||'-')}</td>
        <td>${esc(typeLabelOf(t))}</td>
        <td>${pill(t.status||'Pending')}</td>
        <td style="width:220px">
          ${t.status!=='Completed'
            ? `<button class="btn" data-complete="${esc(t.id)}">Complete</button>`
            : `<button class="btn ghost" disabled>Completed</button>`}
          <button class="btn ghost" data-delete="${esc(t.id)}">Delete</button>
        </td>`;
      body.appendChild(tr);
    });
  }

  /* ---- RESOURCES ---- */
  const rBody = $('#resTbody'), rEmpty = $('#resEmpty');
  const rStatus = $('#resFilterStatus'), rSearch = $('#resFilterSearch');

  function applyResources(){
    let list = readAllResources().filter(r => deptOf(r) === DEPT);
    const st = (rStatus?.value || 'All');
    const q = (rSearch?.value || '').toLowerCase().trim();

    if (st !== 'All') list = list.filter(r => (r.status || 'Requested') === st);
    if (q) list = list.filter(r => `${r.item||''} ${r.assignee||''} ${r.dept||''}`.toLowerCase().includes(q));

    rBody.innerHTML = '';
    if (!list.length) {
      rEmpty.style.display = 'block';
    } else {
      rEmpty.style.display = 'none';
    }

    list.slice().reverse().forEach((r, i) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td style="width:48px;color:#9bb0c9">${i+1}</td>
        <td>${esc(r.item)}</td>
        <td>${esc(r.assignee||'-')}</td>
        <td>${esc(r.quantity ?? 0)} ${esc(r.unit||'')}</td>
        <td>${esc(r.neededOn||'-')}</td>
        <td>${esc(r.status||'Requested')}</td>`;
      rBody.appendChild(tr);
    });
  }

  /* ---- Events ---- */
  document.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.complete) { if (completeTaskById(b.dataset.complete)) applyTasks(); }
    if (b.dataset.delete) { if (confirm('Delete this task?')) { deleteTaskById(b.dataset.delete); applyTasks(); } }
  });
  [fS,fA,fT,fQ].forEach(el => el && el.addEventListener('input', applyTasks));
  [rStatus,rSearch].forEach(el => el && el.addEventListener('input', applyResources));

  // Cross-tab and same-tab pulses
  window.addEventListener('storage', e => {
    if (e.key === HK_KEYS.TASKS || e.key === HK_KEYS.TASK_PING) applyTasks();
    if (e.key === HK_KEYS.RES || e.key === HK_KEYS.RES_PING) applyResources();
  });
  window.addEventListener(HK_KEYS.TASK_PING, applyTasks);
  window.addEventListener(HK_KEYS.RES_PING, applyResources);

  // Set title
  const H = $('#deptTitle'); if (H) H.textContent = `${DEPT} — Tasks & Resources`;

  // Initial render
  applyTasks();
  applyResources();

  // Debug
  log('After init — tasks for dept:', DEPT, readAllTasks().filter(t=>deptOf(t)===DEPT).length);
  log('After init — resources for dept:', DEPT, readAllResources().filter(r=>deptOf(r)===DEPT).length);
}

/* public init */
window.initDeptPage = function(dept){ renderDeptPage(dept); };
