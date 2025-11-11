/****************************************************
 storekeeping.js — Department roster + task checklist
 - Mirrors gardener/laundry pattern
 - Admin + Manager tasks merged for dept-common.js
 - No floating panel; uses dept-common tables
****************************************************/
(function () {
  /* ========== CONFIG / CONSTANTS ========== */
  const TYPE_LOWER = 'storekeeping';
  const TYPE_LABEL = 'Storekeeping';
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
  const escapeHtml = (str) =>
    String(str || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toast = (msg) => {
    const t = qs('#storekeeping-toast') || qs('#toast') || qs('#room-toast');
    if (!t) { alert(msg); return; }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(t._hide);
    t._hide = setTimeout(() => t.classList.remove('show'), 1500);
  };
  const log = (...a)=>{ try{ console.log('[storekeeping]',...a);}catch{} };

  /* ========== STATE ========== */
  let staffList = [];
  let allTasks  = []; // merged admin + manager (for live counts)

  /* ========== READERS (Admin + Manager) ========== */
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
    const a = readAdminTasks();
    const b = readManagerTasks();
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

  // Expose merged list for dept-common.js
  window.__getDeptTasks = () => mergeAdminAndManager();

  /* ========== STAFF NORMALIZATION ========== */
  function normalizeStaff(list = []) {
    return (list || []).map(s => {
      if (typeof s === 'string') {
        return {
          id: (crypto?.randomUUID?.() || ('s_' + Math.random().toString(36).slice(2))),
          name: s,
          role: 'Storekeeper',
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
    // Example fallback staff
    return normalizeStaff([
      { name: 'Sonia Mehta',   role: 'Storekeeper',      type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Ashok Patil',   role: 'Inventory Clerk',  type: TYPE_LABEL, status: 'Active',   assigned: 1 },
      { name: 'Varun B',       role: 'Receiver',         type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Meera Nair',    role: 'Issuer',           type: TYPE_LABEL, status: 'Active',   assigned: 0 },
      { name: 'Francis D',     role: 'Store Assistant',  type: TYPE_LABEL, status: 'Inactive', assigned: 0 },
    ]);
  }

  /* ========== FETCH STAFF FROM API ========== */
  async function fetchState() {
    try {
      const res = await fetch(API_ROOT + '/state');
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const data = await res.json();
      const all = normalizeStaff(data.staff || []);
      // Match by type or role containing "storekeeping"
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

  /* ========== RENDER: STAFF TABLE (live counts from merged tasks) ========== */
  function renderTable() {
    const tbody = qs('#tbody');
    if (!tbody) {
      log('No #tbody on this page (roster table optional).');
      return;
    }
    const search = qs('#search');
    const statusFilter = qs('#statusFilter');

    const q = (search && search.value || '').toLowerCase();
    const sf = statusFilter && statusFilter.value;

    const pendingByPerson = {};
    (allTasks || []).forEach(t => {
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

    if (!rows.length) {
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

  /* ========== MODAL / CRUD (only if modal exists) ========== */
  const modal       = qs('#storekeeping-modal') || qs('#modal') || qs('#room-modal');
  const modalTitle  = qs('#storekeeping-modalTitle') || qs('#modalTitle') || qs('#room-modalTitle');
  const mName       = qs('#storekeeping-mName') || qs('#mName') || qs('#room-mName');
  const mType       = qs('#storekeeping-mType') || qs('#mType') || qs('#room-mType');
  const mStatus     = qs('#storekeeping-mStatus') || qs('#mStatus') || qs('#room-mStatus');
  const mAssigned   = qs('#storekeeping-mAssigned') || qs('#mAssigned') || qs('#room-mAssigned');

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
        role: 'Storekeeper',
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

  /* ========== EVENTS ========== */
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;

    // Modal controls (optional)
    if (btn.id === 'btnAdd' || btn.id === 'storekeeping-openModal') return openAdd();
    if (btn.id === 'storekeeping-closeModal' || btn.id === 'closeModal' || btn.id === 'room-closeModal') return closeModal();
    if (btn.id === 'storekeeping-cancelModal' || btn.id === 'cancelModal' || btn.id === 'room-cancelModal') return closeModal();
    if (btn.id === 'storekeeping-saveModal' || btn.id === 'saveModal' || btn.id === 'room-saveModal') return save();

    // Row actions (optional)
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

  // Roster filters re-render (if present)
  qs('#search')?.addEventListener('input', renderTable);
  qs('#statusFilter')?.addEventListener('change', renderTable);

  // Cross-tab updates: refresh merged tasks for live counts
  function refreshTasksAndRoster() {
    allTasks = mergeAdminAndManager();
    renderTable();
  }
  window.addEventListener('storage', (e) => {
    if ([ADMIN_TASKS_KEY, ADMIN_PING_KEY, MGR_TASKS_KEY, MGR_PING_KEY].includes(e.key)) {
      refreshTasksAndRoster();
    }
  });
  window.addEventListener(ADMIN_PING_KEY, refreshTasksAndRoster);
  window.addEventListener(MGR_PING_KEY,   refreshTasksAndRoster);

  /* ========== INIT ========== */
  document.addEventListener('DOMContentLoaded', () => {
    window.STAFF_PAGE = window.STAFF_PAGE || { type: TYPE_LABEL, staffName: '' };
    refreshTasksAndRoster();   // merged Admin + Manager tasks
    fetchState();              // optional API roster
    // Task/Resource UI comes from dept-common.js using __getDeptTasks()
  });

})();
