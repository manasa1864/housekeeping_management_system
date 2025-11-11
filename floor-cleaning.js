/****************************************************
 floor-cleaning.js — Department roster + task checklist
 - Mirrors room-cleaning.js pattern for Floor Cleaning
 - Admin↔Staff task sync (localStorage + events)
 - Uses TaskWire if available; else safe fallback
 - ✅ No floating task box on other pages (renders only if host exists)
****************************************************/

(function () {
  /* ========== CONFIG / CONSTANTS ========== */
  const TYPE_LOWER = 'floor cleaning';
  const TYPE_LABEL = 'Floor Cleaning';
  const API_ROOT = new URLSearchParams(location.search).get("api") ||
                   `${location.protocol}//${location.hostname}:8000`;

  /* ========== TASK BUS (TaskWire or fallback) ========== */
  const TASKS_KEY = 'hms_tasks_local_v1';
  const UPDATE_KEY = 'tasks-updated';

  const TaskBus = (function () {
    if (window.TaskWire) {
      return {
        readAll: () => (window.TaskWire.readAll() || []),
        writeAll: (t) => window.TaskWire.writeAll(t),
        markCompleted: (id) => window.TaskWire.markCompleted(id),
        onAnyUpdate: (cb) => window.TaskWire.onAnyUpdate(cb),
      };
    }
    // Fallback with localStorage
    function _readAll() {
      try {
        const obj = JSON.parse(localStorage.getItem(TASKS_KEY) || '{}');
        return Array.isArray(obj.tasks) ? obj.tasks : [];
      } catch { return []; }
    }
    function _writeAll(tasks) {
      localStorage.setItem(TASKS_KEY, JSON.stringify({ tasks }));
      localStorage.setItem(UPDATE_KEY, Date.now().toString());
      window.dispatchEvent(new Event(UPDATE_KEY));
    }
    function _markCompleted(id) {
      const tasks = _readAll();
      const t = tasks.find(x => String(x.id) === String(id));
      if (!t || t.status === 'Completed') return false;
      t.status = 'Completed';
      t.doneOn = new Date().toISOString().slice(0, 10);
      _writeAll(tasks);
      return true;
    }
    function _onAnyUpdate(cb) {
      window.addEventListener('storage', (e) => {
        if (e.key === UPDATE_KEY || e.key === TASKS_KEY) cb();
      });
      window.addEventListener(UPDATE_KEY, cb);
    }
    return { readAll: _readAll, writeAll: _writeAll, markCompleted: _markCompleted, onAnyUpdate: _onAnyUpdate };
  })();

  /* ========== DOM HELPERS ========== */
  const qs  = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));
  const toast = (msg) => {
    const t = qs('#floor-toast') || qs('#toast') || qs('#room-toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 1500);
  };
  const escapeHtml = (str) =>
    String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  /* ========== STATE ========== */
  let staffList = [];
  let allTasks  = []; // for live counts

  /* ========== STAFF NORMALIZATION ========== */
  function normalizeStaff(list = []) {
    return (list || []).map(s => {
      if (typeof s === 'string') {
        return {
          id: (crypto?.randomUUID?.() || ('s_' + Math.random().toString(36).slice(2))),
          name: s,
          role: 'Floor Attendant',
          type: TYPE_LABEL,
          status: 'Active',
          assigned: 0
        };
      }
      return {
        id: s.id || (crypto?.randomUUID?.() || ('s_' + Math.random().toString(36).slice(2))),
        name: s.name || '',
        role: (s.role || '').toString(),
        type: (s.type || '').toString(),
        status: s.status || 'Active',
        assigned: (s.assigned === 0 || s.assigned) ? Number(s.assigned) : 0
      };
    });
  }

  function localMock() {
    // Sample roster (adjust if needed)
    return normalizeStaff([
      { name: 'Anil Kumar',    role: 'Mopping',       type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Shreya Patel',  role: 'Buffing',       type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Rahul Mehta',   role: 'Vacuuming',     type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Divya Sharma',  role: 'Spot Cleaning', type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Karan Singh',   role: 'Polishing',     type: TYPE_LABEL, status: 'Inactive', assigned: 0 },
    ]);
  }

  const log = (...args) => { try { console.log('[floor-cleaning]', ...args); } catch {} };

  /* ========== FETCH STAFF FROM API ========== */
  async function fetchState() {
    try {
      const res = await fetch(API_ROOT + '/state');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const all = normalizeStaff(data.staff || []);
      // Match by type or role containing "floor cleaning"
      staffList = all.filter(s => ((s.type || s.role || '').toLowerCase()).includes(TYPE_LOWER));
      log('fetched state - all length', all.length, 'filtered length', staffList.length);
      renderTable();
      if (window && window.STAFF_PAGE) window.STAFF_PAGE.type = TYPE_LABEL;
    } catch (err) {
      console.error('fetchState error', err);
      toast('Could not load staff from API — using local mock for testing.');
      staffList = localMock();
      renderTable();
    }
  }

  /* ========== RENDER: STAFF TABLE (adds live task counts) ========== */
  function renderTable() {
    const tbody = qs('#tbody');
    if (!tbody) {
      log('tbody not found in DOM (#tbody). If your page has no roster table, this is fine.');
      return;
    }
    const search = qs('#search');
    const statusFilter = qs('#statusFilter');

    const q = (search && search.value || '').toLowerCase();
    const sf = statusFilter && statusFilter.value;

    // live pending-by-assignee from tasks
    const pendingByPerson = {};
    (allTasks || []).forEach(t => {
      if (String(t.type || '').toLowerCase() !== TYPE_LOWER) return;
      if (t.status === 'Completed') return;
      const who = String(t.assignee || '').trim().toLowerCase();
      if (!who) return;
      pendingByPerson[who] = (pendingByPerson[who] || 0) + 1;
    });

    const rows = (staffList || [])
      .filter(s => (!sf || s.status === sf) &&
                   (!q || (s.name || '').toLowerCase().includes(q)));

    tbody.innerHTML = '';

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="5" style="text-align:center;padding:24px;color:#9aa;opacity:0.9">
        No team members found for <strong>${escapeHtml(TYPE_LABEL)}</strong>.
        <div style="margin-top:8px;font-size:13px;color:#7b8a98">Try adding a member or check the API (DevTools → Network → /state).</div>
      </td>`;
      tbody.appendChild(tr);
      return;
    }

    rows.forEach(s => {
      const baseAssigned = Number(s.assigned || 0);
      const live = pendingByPerson[String(s.name || '').toLowerCase()] || 0;
      const displayAssigned = baseAssigned + live;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${escapeHtml(s.name)}</td>
        <td>${escapeHtml(s.role || s.type || '')}</td>
        <td><span class="pill ${s.status==='Active' ? 'done' : 'over'}">${escapeHtml(s.status)}</span></td>
        <td>${displayAssigned}</td>
        <td>
          <button class="btn small edit" data-id="${s.id}">Edit</button>
          <button class="btn small ${s.status==='Active'?'deactivate':'activate'}" data-id="${s.id}">
            ${s.status==='Active'?'Deactivate':'Activate'}
          </button>
          <button class="btn small danger remove" data-id="${s.id}">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  /* ========== MODAL / CRUD (works if modal exists; safe if not) ========== */
  const modal       = qs('#floor-modal') || qs('#modal') || qs('#room-modal');
  const modalTitle  = qs('#floor-modalTitle') || qs('#modalTitle') || qs('#room-modalTitle');
  const mName       = qs('#floor-mName') || qs('#mName') || qs('#room-mName');
  const mType       = qs('#floor-mType') || qs('#mType') || qs('#room-mType');
  const mStatus     = qs('#floor-mStatus') || qs('#mStatus') || qs('#room-mStatus');
  const mAssigned   = qs('#floor-mAssigned') || qs('#mAssigned') || qs('#room-mAssigned');

  let editingId = null;

  function openAdd() {
    editingId = null;
    if (modalTitle) modalTitle.textContent = 'Add Member';
    if (mName)     mName.value = '';
    if (mType)     mType.value = TYPE_LABEL;
    if (mStatus)   mStatus.value = 'Active';
    if (mAssigned) mAssigned.value = 0;
    if (modal)     modal.style.display = 'block';
  }
  function openEdit(st) {
    editingId = st.id;
    if (modalTitle) modalTitle.textContent = 'Edit Member';
    if (mName)     mName.value = st.name || '';
    if (mType)     mType.value = st.type || st.role || TYPE_LABEL;
    if (mStatus)   mStatus.value = st.status || 'Active';
    if (mAssigned) mAssigned.value = st.assigned || 0;
    if (modal)     modal.style.display = 'block';
  }
  function closeModal() { if (modal) modal.style.display = 'none'; editingId = null; }

  async function save() {
    const name = (mName && (mName.value || '') || '').trim();
    if (!name) { toast('Please enter a name'); return; }
    const payload = {
      name,
      role: mType ? mType.value : TYPE_LABEL,
      type: mType ? mType.value : TYPE_LABEL,
      status: mStatus ? mStatus.value : 'Active',
      assigned: Number(mAssigned ? mAssigned.value : 0)
    };
    try {
      if (editingId) {
        const res = await fetch(API_ROOT + '/staff/' + editingId, {
          method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        toast('Updated');
      } else {
        const res = await fetch(API_ROOT + '/staff', {
          method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error(await res.text());
        toast('Added');
      }
      closeModal();
      await fetchState();
    } catch (err) {
      console.error('save error', err);
      toast('Save failed (check console)');
    }
  }

  async function removeMember(id) {
    if (!confirm('Remove staff member?')) return;
    try {
      const res = await fetch(API_ROOT + '/staff/' + id, { method: 'DELETE' });
      if (!res.ok) throw new Error(await res.text());
      toast('Removed');
      await fetchState();
    } catch (err) {
      console.error('remove error', err);
      toast('Remove failed');
    }
  }

  async function toggleStatus(id, makeActive) {
    try {
      const payload = {
        name: 'ignored',
        type: TYPE_LABEL,
        role: 'Floor Attendant',
        status: makeActive ? 'Active' : 'Inactive',
        assigned: 0
      };
      const res = await fetch(API_ROOT + '/staff/' + id, {
        method: 'PATCH', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error(await res.text());
      toast(makeActive ? 'Activated' : 'Deactivated');
      await fetchState();
    } catch (err) {
      console.error('toggleStatus error', err);
      toast('Status change failed');
    }
  }

  /* ========== TASK LIST (Floor Cleaning only) ========== */
  function renderDeptTasks() {
    // Only render if a known container exists on the department page.
    const container =
      document.getElementById('taskPanel')       ||
      document.getElementById('taskList')        ||
      document.getElementById('floorTasks')      ||
      document.getElementById('floor-cleaningTasks') ||
      null;

    // 🚫 If no host present (e.g., on Admin/Manager pages), do nothing.
    if (!container) return;

    // Filter tasks for this department
    const visible = (allTasks || [])
      .slice().reverse()
      .filter(t => String(t.type || '').trim().toLowerCase() === TYPE_LOWER);

    const wrap = document.createElement('div');
    wrap.style.display = 'flex';
    wrap.style.flexDirection = 'column';
    wrap.style.gap = '8px';

    if (!visible.length) {
      wrap.innerHTML = `<div class="muted">No ${escapeHtml(TYPE_LABEL)} tasks yet.</div>`;
    } else {
      visible.forEach(t => {
        const pillClass =
          t.status === 'Completed' ? 'pill done' :
          t.status === 'In Progress' ? 'pill wait' : 'pill over';

        const div = document.createElement('div');
        div.className = 'task-item';
        div.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px;border:1px solid #eee;border-radius:8px';

        div.innerHTML = `
          <div style="max-width:70%">
            <div style="font-weight:600">${escapeHtml(t.title || t.name || ('Task #' + (t.id || '?')))}</div>
            <div style="font-size:12px;opacity:.8">
              Assignee: ${escapeHtml(t.assignee || '-')} • Area: ${escapeHtml(t.area || t.section || t.floor || t.room || '-')}
            </div>
            <div style="font-size:12px;color:#6b7a8c;margin-top:6px">
              Created: ${escapeHtml((t.createdOn || '').slice(0,10))}${t.doneOn ? ' • Done: ' + escapeHtml(t.doneOn) : ''}
            </div>
          </div>
          <div style="text-align:right;min-width:150px">
            <span class="${pillClass}">${escapeHtml(t.status || 'Pending')}</span>
            ${t.status !== 'Completed'
              ? `<button class="btn" data-complete="${escapeHtml(t.id)}" style="margin-left:8px">Complete</button>`
              : ''
            }
          </div>
        `;
        wrap.appendChild(div);
      });
    }

    container.innerHTML = '';
    container.appendChild(wrap);
  }

  /* ========== EVENT WIRING ========== */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Modal controls
    if (btn.id === 'btnAdd' || btn.id === 'floor-openModal') return openAdd();
    if (btn.id === 'floor-closeModal' || btn.id === 'closeModal' || btn.id === 'room-closeModal') return closeModal();
    if (btn.id === 'floor-cancelModal' || btn.id === 'cancelModal' || btn.id === 'room-cancelModal') return closeModal();
    if (btn.id === 'floor-saveModal' || btn.id === 'saveModal' || btn.id === 'room-saveModal') return save();

    // Row actions
    if (btn.classList.contains('edit')) {
      const id = btn.dataset.id;
      const st = staffList.find(x => String(x.id) === String(id));
      if (st) openEdit(st);
      return;
    }
    if (btn.classList.contains('remove')) {
      return removeMember(btn.dataset.id);
    }
    if (btn.classList.contains('activate')) {
      return toggleStatus(btn.dataset.id, true);
    }
    if (btn.classList.contains('deactivate')) {
      return toggleStatus(btn.dataset.id, false);
    }

    // Task completion
    const completeId = btn.getAttribute('data-complete');
    if (completeId) {
      const ok = TaskBus.markCompleted(completeId);
      if (ok) {
        toast('✅ Task completed');
        allTasks = TaskBus.readAll();
        renderDeptTasks();
        renderTable();
      } else {
        toast('Already completed or not found');
      }
    }
  });

  // Search / filter re-render for table (if present)
  qs('#search')?.addEventListener('input', renderTable);
  qs('#statusFilter')?.addEventListener('change', renderTable);

  // Cross-tab + same-tab task updates
  TaskBus.onAnyUpdate(() => {
    allTasks = TaskBus.readAll();
    renderDeptTasks();
    renderTable();
  });

  /* ========== INIT ========== */
  document.addEventListener('DOMContentLoaded', () => {
    window.STAFF_PAGE = window.STAFF_PAGE || { type: TYPE_LABEL, staffName: '' };
    allTasks = TaskBus.readAll();      // pre-load tasks
    fetchState();                      // loads roster (if table exists)
    renderDeptTasks();                 // render tasks only if host exists
  });

})();
/****************************************************
 floor-cleaning.js — sync admin + manager tasks
****************************************************/
(function () {
  const TYPE_LOWER = 'floor cleaning';
  const TYPE_LABEL = 'Floor Cleaning';

  const TASKS_KEY = 'hk_tasks_v1';
  const UPDATE_KEY = 'hk_tasks_pulse_v1';

  function readAdminTasks() {
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      const obj = raw ? JSON.parse(raw) : {};
      return Array.isArray(obj.tasks) ? obj.tasks : [];
    } catch { return []; }
  }

  window.__getDeptTasks = () => readAdminTasks();

})();
