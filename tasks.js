// tasks.js — admin task assignment page (no "Public Area" type)
document.addEventListener('DOMContentLoaded', () => {
  const API_ROOT = new URLSearchParams(location.search).get("api") || `${location.protocol}//${location.hostname}:8000`;
  const qs = (s, p = document) => p.querySelector(s);
  const qsa = (s, p = document) => [...p.querySelectorAll(s)];
  const toast = (msg) => { const t = qs('#toast'); if(!t) return; t.textContent = msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1500); };

  // staff types (PUBLIC AREA removed)
  const staffTypes = [
    "Room Cleaning",
    "Floor Cleaning",
    "Laundry",
    "Maintenance",
    "Food Service",
    "Gardener",
    "Night Shift Attendant",
    "Storekeeping"
  ];

  // DOM refs
  const btnAdd = qs('#btnAddTask');
  const taskModal = qs('#taskModal');
  const closeModal = qs('#closeTaskModal');
  const cancelTask = qs('#cancelTask');
  const saveTask = qs('#saveTask');
  const modalTitle = qs('#taskModalTitle');
  const taskTitle = qs('#taskTitle');
  const taskAssignee = qs('#taskAssignee');
  const taskType = qs('#taskType');            // modal type select
  const taskRoom = qs('#taskRoom');
  const taskStatus = qs('#taskStatus');
  const taskNotes = qs('#taskNotes');

  const taskTbody = qs('#taskTbody');
  const taskFilter = qs('#taskFilter');
  const assigneeFilter = qs('#assigneeFilter');
  const typeFilter = qs('#typeFilter');        // type filter
  const taskSearch = qs('#taskSearch');

  // local state
  let state = { staff: [], tasks: [] };
  let editingId = null;
  const LS_KEY = 'hms_tasks_local_v1';

  // local fallback helpers
  function loadLocalFallback() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks)) {
          state.tasks = parsed.tasks;
          console.info('[tasks.js] loaded tasks from localStorage fallback', state.tasks.length);
        }
      }
    } catch (e) { console.warn('[tasks.js] local fallback parse failed', e); }
  }
  function saveLocalFallback() {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ tasks: state.tasks }));
      console.info('[tasks.js] saved tasks to localStorage (fallback)');
    } catch (e) { console.warn('[tasks.js] failed to save fallback', e); }
  }

  // fetch staff/tasks from API, else fallback to local
  async function fetchState() {
    try {
      const r = await fetch(API_ROOT + '/state');
      if (!r.ok) throw new Error('no /state');
      const json = await r.json();
      state.staff = (json.staff || []).map(s => ({ id: s.id, name: s.name, type: s.type || s.role || 'Housekeeping' }));
      state.tasks = (json.tasks || []);
      console.info('[tasks.js] fetched /state from API', state.staff.length, 'staff,', state.tasks.length, 'tasks');
    } catch (err) {
      console.warn('[tasks.js] fetch /state failed — falling back', err);
      // try individual endpoints
      try {
        const [tRes, sRes] = await Promise.allSettled([fetch(API_ROOT + '/tasks'), fetch(API_ROOT + '/staff')]);
        if (tRes.status === 'fulfilled' && tRes.value.ok) state.tasks = await tRes.value.json();
        if (sRes.status === 'fulfilled' && sRes.value.ok) state.staff = await sRes.value.json();
      } catch (e) { console.warn('[tasks.js] individual endpoint fetch failed', e); }
      loadLocalFallback();
    }
    populateAssigneeAndTypeSelects();
    renderTasks();
  }

  function populateAssigneeAndTypeSelects() {
    // assignee select (modal and filter)
    taskAssignee.innerHTML = '<option value="">(Unassigned)</option>';
    assigneeFilter.innerHTML = '<option value="">All</option>';
    state.staff.forEach(s => {
      const name = s.name || s.id || 'Unknown';
      const opt = document.createElement('option'); opt.value = name; opt.textContent = name; taskAssignee.appendChild(opt);
      const opt2 = opt.cloneNode(true); assigneeFilter.appendChild(opt2);
    });

    // type select (modal) and type filter
    taskType.innerHTML = '<option value="">(Select type)</option>';
    typeFilter.innerHTML = '<option value="">All Types</option>';
    // combine staffTypes with any additional types present in staff records
    const typesSet = new Set(staffTypes.concat((state.staff||[]).map(s => s.type).filter(Boolean)));
    Array.from(typesSet).forEach(t => {
      const o1 = document.createElement('option'); o1.value = t; o1.textContent = t; taskType.appendChild(o1);
      const o2 = document.createElement('option'); o2.value = t; o2.textContent = t; typeFilter.appendChild(o2);
    });
  }

  function renderTasks() {
    if(!taskTbody) return;
    taskTbody.innerHTML = '';
    const search = (taskSearch && taskSearch.value || '').toLowerCase();
    const status = taskFilter.value;
    const assignee = assigneeFilter.value;
    const typeSel = typeFilter.value;

    const rows = (state.tasks || []).filter(t => {
      if (status && t.status !== status) return false;
      if (assignee && String(t.assignee || '') !== String(assignee)) return false;
      if (typeSel && String(t.type || '') !== String(typeSel)) return false;
      if (search) {
        const hay = `${t.title||''} ${t.assignee||''} ${t.room||''} ${t.notes||''} ${t.type||''}`.toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
    });

    if (rows.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="7" style="text-align:center;padding:18px;color:#9aa">No tasks found.</td>`;
      taskTbody.appendChild(tr);
      return;
    }

    rows.forEach((t, idx) => {
      const tr = document.createElement('tr');
      const statusClass = t.status === 'Completed' ? 'done' : t.status === 'In Progress' ? 'wait' : 'over';
      tr.innerHTML = `
        <td>${idx+1}</td>
        <td style="max-width:360px">${escapeHtml(t.title||'')}</td>
        <td>${escapeHtml(t.assignee||'-')}</td>
        <td>${escapeHtml(t.room||'-')}</td>
        <td>${escapeHtml(t.type||'-')}</td>
        <td><span class="pill ${statusClass}">${escapeHtml(t.status||'Pending')}</span></td>
        <td>
          <button class="btn small edit" data-id="${t.id}">Edit</button>
          <button class="btn small ${t.status==='Completed'?'':'primary'}" data-complete="${t.id}">${t.status==='Completed'?'Completed':'Mark Done'}</button>
          <button class="btn small danger remove" data-id="${t.id}">Delete</button>
        </td>
      `;
      taskTbody.appendChild(tr);
    });
  }

  function escapeHtml(str){ return String(str||'').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function openNew() {
    editingId = null;
    modalTitle.textContent = 'New Task';
    taskTitle.value = '';
    taskAssignee.value = '';
    taskType.value = '';
    taskRoom.value = '';
    taskStatus.value = 'Pending';
    taskNotes.value = '';
    showModal(true);
  }

  function openEdit(t) {
    if(!t) return;
    editingId = t.id;
    modalTitle.textContent = 'Edit Task';
    taskTitle.value = t.title || '';
    taskAssignee.value = t.assignee || '';
    taskType.value = t.type || '';
    taskRoom.value = t.room || '';
    taskStatus.value = t.status || 'Pending';
    taskNotes.value = t.notes || '';
    showModal(true);
  }

  function showModal(show) {
    if (!taskModal) return;
    taskModal.style.display = show ? 'block' : 'none';
    if (show) setTimeout(()=>taskTitle.focus(), 80);
  }

  // save (POST/PATCH fallback to local)
  async function save() {
    const titleVal = (taskTitle.value || '').trim();
    if (!titleVal) { toast('Enter a title'); taskTitle.focus(); return; }

    const payload = {
      title: titleVal,
      assignee: taskAssignee.value || null,
      type: taskType.value || null,         // include type
      room: taskRoom.value || null,
      status: taskStatus.value || 'Pending',
      notes: taskNotes.value || ''
    };

    try {
      if (editingId) {
        const res = await fetch(API_ROOT + '/tasks/' + editingId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('patch failed');
        toast('Task updated (server)');
      } else {
        const res = await fetch(API_ROOT + '/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('post failed');
        toast('Task created (server)');
      }

      await fetchState();
      broadcastTasksUpdated();
    } catch (err) {
      console.warn('[tasks.js] API save failed — falling back to local update', err);
      if (editingId) {
        const idx = state.tasks.findIndex(x => String(x.id) === String(editingId));
        if (idx >= 0) state.tasks[idx] = { ...state.tasks[idx], ...payload, id: editingId };
      } else {
        const id = 'local-' + Date.now() + '-' + Math.floor(Math.random()*1000);
        state.tasks.push({ id, ...payload, createdAt: new Date().toISOString() });
      }
      saveLocalFallback();
      renderTasks();
      broadcastTasksUpdated();
      toast('Task saved (local)');
    } finally {
      showModal(false);
    }
  }

  async function deleteTask(id) {
    if(!confirm('Delete task?')) return;
    try {
      const res = await fetch(API_ROOT + '/tasks/' + id, { method:'DELETE' });
      if (!res.ok) throw new Error('delete failed');
      toast('Deleted (server)');
      await fetchState();
      broadcastTasksUpdated();
    } catch (err) {
      state.tasks = (state.tasks || []).filter(t => String(t.id) !== String(id));
      saveLocalFallback();
      renderTasks();
      broadcastTasksUpdated();
      toast('Deleted (local)');
      console.warn('[tasks.js] delete fallback used', err);
    }
  }

  async function markComplete(id) {
    const now = new Date();
    const nowKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    try {
      const res = await fetch(API_ROOT + '/tasks/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Completed', doneOn: nowKey })
      });
      if (!res.ok) throw new Error('patch failed');
      toast('Marked completed (server)');
      await fetchState();
      broadcastTasksUpdated();
    } catch (err) {
      const t = state.tasks.find(x => String(x.id) === String(id));
      if (t) { t.status = 'Completed'; t.doneOn = nowKey; saveLocalFallback(); renderTasks(); broadcastTasksUpdated(); toast('Marked completed (local)'); }
      console.warn('[tasks.js] markComplete fallback used', err);
    }
  }

  function broadcastTasksUpdated() {
    try {
      localStorage.setItem('tasks-updated', String(Date.now()));
      console.info('[tasks.js] broadcast tasks-updated');
    } catch (e) { console.warn('[tasks.js] localStorage broadcast failed', e); }
  }

  // delegated click
  document.body.addEventListener('click', (ev) => {
    const b = ev.target.closest('button');
    if (!b) return;
    if (b.id === 'btnAddTask') return openNew();
    if (b.id === 'closeTaskModal' || b.id === 'cancelTask') { showModal(false); editingId = null; return; }
    if (b.id === 'saveTask') return save();

    if (b.classList.contains('edit')) {
      const id = b.dataset.id; const t = (state.tasks||[]).find(x => String(x.id) === String(id)); if (t) openEdit(t);
    } else if (b.classList.contains('remove')) {
      deleteTask(b.dataset.id);
    } else if (b.dataset.complete) {
      markComplete(b.dataset.complete);
    }
  });

  // filters & search
  taskFilter && taskFilter.addEventListener('change', renderTasks);
  assigneeFilter && assigneeFilter.addEventListener('change', renderTasks);
  typeFilter && typeFilter.addEventListener('change', renderTasks);
  taskSearch && taskSearch.addEventListener('input', renderTasks);

  // listen for broadcast from other tabs
  window.addEventListener('storage', (ev) => {
    if (ev.key === 'tasks-updated') {
      console.info('[tasks.js] storage event tasks-updated received, reloading state');
      fetchState();
    }
  });

  // initial populate for type select from staffTypes (so modal isn't empty before fetch)
  (function initTypeSelect() {
    taskType.innerHTML = '<option value="">(Select type)</option>';
    typeFilter.innerHTML = '<option value="">All Types</option>';
    staffTypes.forEach(t => {
      const o1 = document.createElement('option'); o1.value = t; o1.textContent = t; taskType.appendChild(o1);
      const o2 = document.createElement('option'); o2.value = t; o2.textContent = t; typeFilter.appendChild(o2);
    });
  })();

  // start
  fetchState().catch(e => { console.warn('[tasks.js] initial fetchState error', e); loadLocalFallback(); renderTasks(); });
});
/* tasks.js — central task editor/list */
(function(){
  function el(s){ return document.querySelector(s); }
  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  function renderAllTasks(){
    const list = el("#taskList") || el("#tasksPanel");
    if(!list) return;
    const tasks = TaskSync.getAllTasks();
    list.innerHTML = "";
    if(tasks.length === 0) { list.innerHTML = `<div class="muted">No tasks</div>`; return; }
    tasks.forEach(t => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div>
          <div style="font-weight:700">${escapeHtml(t.title)}</div>
          <div style="font-size:13px;color:#6b7a8c">${escapeHtml(t.type||'-')} • ${escapeHtml(t.assignee||'-')}</div>
        </div>
        <div style="text-align:right;min-width:140px">
          <span class="pill ${t.status==='Completed'?'done':t.status==='In Progress'?'wait':'over'}">${escapeHtml(t.status)}</span>
          ${t.status!=='Completed'?`<button class="btn small mark-done" data-id="${escapeHtml(t.id)}">Complete</button>`:""}
          <button class="btn small" data-delete="${escapeHtml(t.id)}">Delete</button>
        </div>
      `;
      list.appendChild(div);
    });
  }

  document.body.addEventListener("click", (e) => {
    const b = e.target.closest("button");
    if(!b) return;
    if(b.classList.contains("mark-done")){
      TaskSync.markTaskCompleted(b.dataset.id);
      renderAllTasks();
    } else if(b.dataset.delete){
      if(confirm("Delete task?")) {
        TaskSync.removeTask(b.dataset.delete);
        renderAllTasks();
      }
    }
  });

  window.addEventListener("storage", (e) => {
    if(e.key === "tasks-updated" || e.key === "hms_tasks_local_v1") renderAllTasks();
  });

  document.addEventListener("DOMContentLoaded", renderAllTasks);
})();
