/****************************************************
 laundry.js — Department roster + task checklist
 - Mirrors gardener.js pattern
 - Admin↔Manager merge for department task view
 - Preserves roster/modal/search logic
****************************************************/
(function () {
  /* ========== CONFIG / CONSTANTS ========== */
  const TYPE_LOWER = 'laundry';
  const TYPE_LABEL = 'Laundry';
  const API_ROOT = new URLSearchParams(location.search).get("api") ||
                   `${location.protocol}//${location.hostname}:8000`;

  // Admin store (Dashboard)
  const ADMIN_TASKS_KEY  = 'hk_tasks_v1';
  const ADMIN_PING_KEY   = 'hk_tasks_pulse_v1';

  // Manager store (Manager page)
  const MGR_TASKS_KEY    = 'hms_tasks_local_v1';
  const MGR_PING_KEY     = 'tasks-updated';

  /* ========== DOM HELPERS ========== */
  const qs  = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => Array.from(p.querySelectorAll(s));
  const toast = (msg) => {
    const t = qs('#laundry-toast') || qs('#toast') || qs('#room-toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 1500);
  };
  const escapeHtml = (str) =>
    String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));

  const log = (...args) => { try { console.log('[laundry]', ...args); } catch {} };

  /* ========== STATE ========== */
  let staffList = [];
  let allTasks  = []; // merged tasks used for live counts

  /* ========== READERS: Admin + Manager tasks ========== */
  function safeParse(json, fb){ try{ return JSON.parse(json) ?? fb; } catch { return fb; } }
  function readAdminTasks() {
    const blob = safeParse(localStorage.getItem(ADMIN_TASKS_KEY) || '{}', {});
    return Array.isArray(blob.tasks) ? blob.tasks : [];
  }
  function readManagerTasks() {
    const blob = safeParse(localStorage.getItem(MGR_TASKS_KEY) || '{}', {});
    return Array.isArray(blob.tasks) ? blob.tasks : [];
  }
  function mergeAdminAndManager() {
    // Simple concat; if someday IDs collide, prefer the latest createdOn
    const a = readAdminTasks();
    const b = readManagerTasks();
    // Normalize minimal shape
    return [...a, ...b].map(t => ({
      id: t.id,
      title: t.title || '',
      assignee: t.assignee || '',
      dept: t.dept || t.department || '',
      category: t.category || t.type || '',
      type: t.type || t.category || '',
      room: t.room || t.area || '',
      status: t.status || 'Pending',
      createdOn: t.createdOn || '',
      doneOn: t.doneOn || ''
    }));
  }

  // Expose MERGED list for dept-common.js
  window.__getDeptTasks = () => mergeAdminAndManager();

  /* ========== STAFF NORMALIZATION ========== */
  function normalizeStaff(list = []) {
    return (list || []).map(s => {
      if (typeof s === 'string') {
        return {
          id: (crypto?.randomUUID?.() || ('s_' + Math.random().toString(36).slice(2))),
          name: s,
          role: 'Laundry Attendant',
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
    // Sample names (safe fallback if API is unavailable)
    return normalizeStaff([
      { name: 'Rohit Verma',   role: 'Washer',         type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Nisha Gupta',   role: 'Dryer Operator', type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Farhan Ali',    role: 'Pressing',       type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Kavya Rao',     role: 'Folding',        type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Louis D’Souza', role: 'Sorting',        type: TYPE_LABEL, status: 'Inactive', assigned: 0 },
    ]);
  }

  /* ========== FETCH STAFF FROM API ========== */
  async function fetchState() {
    try {
      const res = await fetch(API_ROOT + '/state');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const all = normalizeStaff(data.staff || []);
      // Match by type or role containing "laundry"
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

    // live pending-by-assignee from MERGED tasks
    const pendingByPerson = {};
    (allTasks || []).forEach(t => {
      // Count tasks that belong to this dept
      const dept = (t.dept || '').toLowerCase();
      if (dept !== TYPE_LOWER) return;
      if ((t.status || 'Pending') === 'Completed') return;
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
        <div style="margin-top:8px;font-size:13px;color:#7b8a8c">Try adding a member or check the API (DevTools → Network → /state).</div>
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
  const modal       = qs('#laundry-modal') || qs('#modal') || qs('#room-modal');
  const modalTitle  = qs('#laundry-modalTitle') || qs('#modalTitle') || qs('#room-modalTitle');
  const mName       = qs('#laundry-mName') || qs('#mName') || qs('#room-mName');
  const mType       = qs('#laundry-mType') || qs('#mType') || qs('#room-mType');
  const mStatus     = qs('#laundry-mStatus') || qs('#mStatus') || qs('#room-mStatus');
  const mAssigned   = qs('#laundry-mAssigned') || qs('#mAssigned') || qs('#room-mAssigned');

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
        role: 'Laundry Attendant',
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

  /* ========== EVENT WIRING ========== */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Modal controls
    if (btn.id === 'btnAdd' || btn.id === 'laundry-openModal') return openAdd();
    if (btn.id === 'laundry-closeModal' || btn.id === 'closeModal' || btn.id === 'room-closeModal') return closeModal();
    if (btn.id === 'laundry-cancelModal' || btn.id === 'cancelModal' || btn.id === 'room-cancelModal') return closeModal();
    if (btn.id === 'laundry-saveModal' || btn.id === 'saveModal' || btn.id === 'room-saveModal') return save();

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
  });

  // Search / filter re-render for table (if present)
  qs('#search')?.addEventListener('input', renderTable);
  qs('#statusFilter')?.addEventListener('change', renderTable);

  // Cross-tab + same-tab task updates → refresh merged tasks and roster counts
  function refreshTasksAndRoster() {
    allTasks = mergeAdminAndManager();
    renderTable();
  }
  window.addEventListener('storage', (e) => {
    if ([ADMIN_TASKS_KEY, ADMIN_PING_KEY, MGR_TASKS_KEY, MGR_PING_KEY].includes(e.key)) {
      refreshTasksAndRoster();
    }
  });
  // Also listen for explicit pulses if other scripts dispatch events
  window.addEventListener(ADMIN_PING_KEY, refreshTasksAndRoster);
  window.addEventListener(MGR_PING_KEY,   refreshTasksAndRoster);

  /* ========== INIT ========== */
  document.addEventListener('DOMContentLoaded', () => {
    window.STAFF_PAGE = window.STAFF_PAGE || { type: TYPE_LABEL, staffName: '' };
    refreshTasksAndRoster();  // merged Admin + Manager tasks for live counts
    fetchState();             // loads roster (if table exists)
    // NOTE: Task rendering for the department page is handled by dept-common.js
    //       using window.__getDeptTasks() which we set to the MERGED list.
  });

})();
