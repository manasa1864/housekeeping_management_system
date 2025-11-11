/****************************************************
 🧹 STAFF PAGE SCRIPT — HMS
 - Reads tasks from the same storage as admin.js
 - Lets staff mark tasks Completed
 - Renders staff roster + live task list
 - Broadcasts updates so Admin tab refreshes charts
****************************************************/

/* ========= Storage keys (match admin.js) ========= */
const TASKS_KEY = 'hms_tasks_local_v1';
const STAFF_KEY = 'hms_staff_local_v1';
const UPDATE_KEY = 'tasks-updated'; // storage event channel used by admin.js

/* ========= Small DOM helpers ========= */
const $ = (s, p = document) => p.querySelector(s);
const $$ = (s, p = document) => Array.from(p.querySelectorAll(s));

function toast(msg) {
  const t = $('#toast');
  if (!t) return alert(msg);
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._hide);
  t._hide = setTimeout(() => t.classList.remove('show'), 1600);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

/* ========= Safe storage read/write ========= */
function readTasks() {
  try {
    const raw = localStorage.getItem(TASKS_KEY) || '{}';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed.tasks) ? parsed.tasks : (parsed.tasks ? [parsed.tasks] : []);
  } catch { return []; }
}
function writeTasks(tasks) {
  try {
    localStorage.setItem(TASKS_KEY, JSON.stringify({ tasks: tasks || [] }));
    localStorage.setItem(UPDATE_KEY, Date.now().toString());
    window.dispatchEvent(new Event(UPDATE_KEY)); // same-tab update
  } catch (e) { console.error('writeTasks error', e); }
}

function readStaff() {
  try {
    const raw = localStorage.getItem(STAFF_KEY) || '[]';
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.staff || []);
  } catch { return []; }
}
function writeStaff(staffList) {
  try {
    localStorage.setItem(STAFF_KEY, JSON.stringify(staffList || []));
  } catch (e) { console.error('writeStaff error', e); }
}

/* ========= State ========= */
const state = {
  staff: [],
  tasks: [],
  filteredStaff: []
};

/* ========= Render: Staff Table ========= */
function renderStaffTable() {
  const tbody = $('#tbody');
  if (!tbody) return;
  const list = state.filteredStaff.length ? state.filteredStaff : state.staff;
  tbody.innerHTML = '';

  if (!list.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#667788">No staff yet</td></tr>`;
    return;
  }

  const tasks = state.tasks;
  list.forEach(s => {
    const name = s.name || '-';
    // live assigned count: prefer s.assigned, but also add open tasks addressed to the staff member
    const liveAssigned = tasks.filter(t =>
      (t.assignee || '').toLowerCase() === String(name).toLowerCase()
      && t.status !== 'Completed'
    ).length;
    const displayAssigned = Number(s.assigned || 0) + liveAssigned;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${escapeHtml(name)}</td>
      <td>${escapeHtml(s.type || '-')}</td>
      <td>${escapeHtml(s.status || 'Active')}</td>
      <td>${displayAssigned}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ========= Render: Task List (right on this page) ========= */
function makeStatusPill(status) {
  const cls =
    status === 'Completed' ? 'pill done' :
    status === 'In Progress' ? 'pill wait' : 'pill over';
  return `<span class="${cls}">${escapeHtml(status || 'Pending')}</span>`;
}

function renderTasksSection() {
  const wrap = $('#taskList');
  if (!wrap) return;
  const tasks = state.tasks.slice().reverse(); // newest first
  wrap.innerHTML = '';

  if (!tasks.length) {
    wrap.innerHTML = `<div class="muted">No tasks yet. Tasks created in the Admin page will appear here instantly.</div>`;
    return;
  }

  tasks.forEach(t => {
    const item = document.createElement('div');
    item.className = 'item';
    item.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #eee;border-radius:8px;margin:8px 0';

    item.innerHTML = `
      <div style="max-width:70%">
        <div style="font-weight:600">${escapeHtml(t.title || 'Untitled task')}</div>
        <div style="font-size:12px;opacity:.8">
          Assignee: ${escapeHtml(t.assignee || '-')}
          • Type: ${escapeHtml(t.type || '-')}
          • Room: ${escapeHtml(t.room || '-')}
        </div>
        <div style="font-size:12px;color:#6b7a8c;margin-top:6px">
          Created: ${escapeHtml((t.createdOn || '').slice(0,10))}
          ${t.doneOn ? ' • Done: ' + escapeHtml(t.doneOn) : ''}
        </div>
      </div>
      <div style="min-width:170px;text-align:right">
        ${makeStatusPill(t.status || 'Pending')}
        ${t.status !== 'Completed'
          ? `<button class="btn" data-complete="${escapeHtml(t.id)}" style="margin-left:8px">Complete</button>`
          : ''
        }
      </div>
    `;
    wrap.appendChild(item);
  });
}

/* ========= Actions ========= */
function markTaskCompleted(id) {
  const tasks = readTasks();
  const t = tasks.find(x => String(x.id) === String(id));
  if (!t) return false;
  if (t.status === 'Completed') return false;
  t.status = 'Completed';
  t.doneOn = new Date().toISOString().slice(0,10);
  writeTasks(tasks);
  return true;
}

function addStaffFromModal() {
  const name = $('#mName')?.value.trim();
  const type = $('#mType')?.value.trim();
  const status = $('#mStatus')?.value.trim();
  const assigned = Number($('#mAssigned')?.value || 0);

  if (!name) return toast('Enter full name');

  const staff = readStaff();
  staff.push({ id: Date.now(), name, type, status, assigned });
  writeStaff(staff);

  state.staff = staff;
  state.filteredStaff = [];
  renderStaffTable();
  toast('Staff added');

  closeModal();
}

/* ========= Modal + Nav + Search wiring ========= */
function openModal() { $('#modal').style.display = 'flex'; $('#modalTitle').textContent = 'Add Staff'; }
function closeModal() { $('#modal').style.display = 'none'; }

function bindUI() {
  // Sidebar select -> navigate to staff type pages
  $('#staffTypeNav')?.addEventListener('change', (e) => {
    const href = e.target.value;
    if (href && href.endsWith('.html')) location.href = href;
  });

  // Open/close save modal
  $('#openAddStaff')?.addEventListener('click', openModal);
  $('#closeModal')?.addEventListener('click', closeModal);
  $('#cancelModal')?.addEventListener('click', closeModal);
  $('#saveModal')?.addEventListener('click', addStaffFromModal);

  // Search staff
  $('#searchInput')?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      state.filteredStaff = [];
      renderStaffTable();
      return;
    }
    state.filteredStaff = state.staff.filter(s =>
      String(s.name || '').toLowerCase().includes(q) ||
      String(s.type || '').toLowerCase().includes(q) ||
      String(s.status || '').toLowerCase().includes(q)
    );
    renderStaffTable();
  });

  // Task completion (event delegation)
  document.body.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button');
    if (!btn) return;

    const completeId = btn.getAttribute('data-complete');
    if (completeId) {
      const ok = markTaskCompleted(completeId);
      if (ok) {
        // refresh local state & UI
        state.tasks = readTasks();
        renderTasksSection();
        toast('✅ Task completed');
      } else {
        toast('Already completed or not found');
      }
    }
  });

  // Storage sync from other tabs (Admin)
  window.addEventListener('storage', (e) => {
    if (e.key === UPDATE_KEY || e.key === TASKS_KEY || e.key === 'tasks-updated') {
      state.tasks = readTasks();
      renderTasksSection();
      // Staff table may depend on live counts
      renderStaffTable();
    }
    if (e.key === STAFF_KEY) {
      state.staff = readStaff();
      renderStaffTable();
    }
  });

  // Same-tab custom event (when we writeTasks)
  window.addEventListener(UPDATE_KEY, () => {
    state.tasks = readTasks();
    renderTasksSection();
    renderStaffTable();
  });
}

/* ========= Init ========= */
document.addEventListener('DOMContentLoaded', () => {
  // initial loads
  state.staff = readStaff();
  state.tasks = readTasks();

  bindUI();
  renderStaffTable();
  renderTasksSection();
});
