/******** CONFIG *********/
const API = new URLSearchParams(location.search).get("api")
  || `${location.protocol}//${location.hostname}:8000`;

const staffTypes = ["Room Cleaning","Floor Cleaning","Public Area","Laundry","Food Service","Maintenance"];

const state = {
  role: "admin",
  me: { name: "Alice Green", team: ["Alice Johnson","Bob Smith","Charlie Brown"] },
  staff: [], rooms: [], tasks: [], activity: []
};

const qs = (s, p = document) => p.querySelector(s);
const qsa = (s, p = document) => [...p.querySelectorAll(s)];
const pad = n => n < 10 ? `0${n}` : `${n}`;
const keyFor = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const isAdmin = () => state.role === "admin";
const toast = msg => {
  const t = qs("#toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1500);
};

/******** DATA *********/
async function fetchJSON(url, opts = {}) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function normalizeStaff(list = []) {
  return list.map(s => typeof s === "string"
    ? { id: crypto.randomUUID(), name: s, role: "Housekeeper", type: "Room Cleaning", status: "Active", assigned: 0 }
    : { id: s.id || crypto.randomUUID(), name: s.name || "", role: s.role || "Housekeeper", type: s.type || "Room Cleaning", status: s.status || "Active", assigned: Number.isFinite(s.assigned) ? s.assigned : 0 });
}

async function loadFromApi() {
  const s = await fetchJSON(`${API}/state`);
  state.staff = normalizeStaff(s.staff || []);
  state.rooms = s.rooms || [];
  state.tasks = s.tasks || [];
  state.activity = s.activity || [];
}

function loadMock() {
  state.staff = normalizeStaff([
    { name: "Alice Johnson", role: "Housekeeper", type: "Room Cleaning", status: "Active", assigned: 5 },
    "Bob Smith",
    { name: "Charlie Brown", role: "Housekeeper", type: "Public Area", status: "Active", assigned: 3 },
    { name: "Diana Miller", role: "Maintenance", type: "Maintenance", status: "Active", assigned: 1 },
    { name: "Eve Davis", role: "Housekeeper", type: "Laundry", status: "Inactive", assigned: 0 },
    { name: "Grace Taylor", role: "Supervisor", type: "Food Service", status: "Active", assigned: 4 }
  ]);

  const today = new Date();
  state.rooms = [
    { id: 101, status: "Vacant" }, { id: 102, status: "Occupied" }, { id: 103, status: "Needs" },
    { id: 104, status: "Vacant" }, { id: 105, status: "Needs" }, { id: 201, status: "Occupied" },
    { id: 202, status: "Vacant" }, { id: 203, status: "Occupied" }
  ];

  state.tasks = [
    { id: 1, title: "Room 101 – Standard Clean", assignee: "Alice Johnson", room: 101, status: "Pending" },
    { id: 2, title: "Lobby – Floor Polish", assignee: "Bob Smith", room: null, status: "In Progress" },
    { id: 3, title: "Room 201 – Deep Clean", assignee: "Charlie Brown", room: 201, status: "Completed", doneOn: keyFor(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)) },
    { id: 4, title: "Laundry – Batch 3", assignee: "Eve Davis", room: null, status: "Completed", doneOn: keyFor(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 3)) },
    { id: 5, title: "Restaurant – Setup", assignee: "Grace Taylor", room: null, status: "Completed", doneOn: keyFor(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2)) }
  ];
}

async function refresh() {
  try {
    await loadFromApi();
    toast("Live API data loaded");
  } catch (e) {
    loadMock();
    toast("Using mock data (API unreachable)");
  }
  applyRole();
  renderAll();
}

/******** ROLE *********/
function applyRole() {
  qsa('[data-role="admin-only"]').forEach(el => el.style.display = isAdmin() ? "" : "none");
  ["roomsSection", "reportsSection", "settingsSection"].forEach(id => {
    const el = qs("#" + id); if (el) el.style.display = isAdmin() ? "" : "none";
  });
  qsa("[data-admin]").forEach(el => el.style.display = isAdmin() ? "" : "none");
  qs("#roleBadge").textContent = `Logged in as ${isAdmin() ? "Admin" : "Manager"}`;
  qs("#pageTitle").textContent = isAdmin() ? "Admin Dashboard" : "Manager Dashboard";
}

/******** DERIVED *********/
function visibleStaff() { return isAdmin() ? state.staff : state.staff.filter(s => state.me.team.includes(s.name)); }
function visibleTasks() { return isAdmin() ? state.tasks : state.tasks.filter(t => !t.assignee || state.me.team.includes(t.assignee)); }

function kpis() {
  return {
    staffCount: visibleStaff().length,
    roomsCount: state.rooms.length,
    pending: visibleTasks().filter(t => t.status !== "Completed").length,
    completed: visibleTasks().filter(t => t.status === "Completed").length
  };
}

function computeTrend(year) {
  const m = Array(12).fill(0);
  visibleTasks().forEach(t => {
    if (t.status === "Completed" && t.doneOn && t.doneOn.startsWith(String(year))) {
      const mi = parseInt(t.doneOn.slice(5, 7), 10) - 1;
      if (!Number.isNaN(mi) && mi >= 0 && mi < 12) m[mi]++;
    }
  });
  return m;
}

function staffPerformanceCounts() {
  const map = new Map();
  visibleTasks().forEach(t => {
    if (t.status === "Completed") {
      const who = t.assignee || "(Unassigned)";
      map.set(who, (map.get(who) || 0) + 1);
    }
  });
  return { labels: [...map.keys()], values: [...map.values()] };
}

/******** RENDER *********/
function setText(id, v) { const el = qs("#" + id); if (el) el.textContent = v; }

function renderAll() {
  const k = kpis();
  setText("totalStaff", k.staffCount);
  setText("totalRooms", k.roomsCount);
  setText("pendingTasks", k.pending);
  setText("completedTasks", k.completed);

  renderStaffTable();
  renderRooms();
  renderTasks();

  drawTaskTrendChart();
  drawStaffBarChart();
  drawRoomOccupancyChart();
}

function renderStaffTable() {
  const body = qs("#staffTable"); if (!body) return;
  body.innerHTML = "";
  const term = (qs("#staffSearch")?.value || "").toLowerCase();
  const type = qs("#staffTypeFilter")?.value || "";
  visibleStaff()
    .filter(s => (!type || s.type === type) && (!term || s.name.toLowerCase().includes(term)))
    .forEach(s => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input type="checkbox" data-id="${s.id}"></td>
        <td>${s.name}</td>
        <td>${s.role}</td>
        <td>${s.type}</td>
        <td><span class="pill ${s.status === 'Active' ? 'done' : 'over'}">${s.status}</span></td>
        <td>${s.assigned || 0}</td>
        <td>
          <button class="btn" data-edit-id="${s.id}">Edit</button>
          ${isAdmin() ? `<button class="btn" data-remove-id="${s.id}">Remove</button>` : ""}
        </td>`;
      body.appendChild(tr);
    });
}

function renderRooms() {
  const grid = qs("#roomsList"); if (!grid) return;
  grid.innerHTML = "";
  const filter = qs("#roomStatusFilter")?.value || "";
  state.rooms.filter(r => !filter || r.status === filter).forEach(r => {
    const div = document.createElement("div"); div.className = "room-card";
    const tag = r.status === "Vacant" ? "vacant" : r.status === "Occupied" ? "occupied" : "needs";
    div.innerHTML = `
      <div class="room-title">
        <span>Room ${r.id}</span>
        <span class="tag ${tag}">${r.status}</span>
      </div>
      ${isAdmin() ? `
      <div class="actions" style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn" data-room="${r.id}" data-status="Vacant">Mark Vacant</button>
        <button class="btn" data-room="${r.id}" data-status="Occupied">Mark Occupied</button>
        <button class="btn" data-room="${r.id}" data-status="Needs">Mark Needs</button>
      </div>` : ""}`;
    grid.appendChild(div);
  });
}

function renderTasks() {
  const list = qs("#taskList"); if (!list) return;
  list.innerHTML = "";
  visibleTasks().forEach(t => {
    const pill = t.status === "Completed" ? "pill done" : t.status === "In Progress" ? "pill wait" : "pill over";
    const div = document.createElement("div"); div.className = "item";
    div.innerHTML = `
      <div>
        <div style="font-weight:600">${t.title}</div>
        <div style="font-size:12px;opacity:.8">Assignee: ${t.assignee || "-"} • Room: ${t.room || "-"}</div>
      </div>
      <div>
        <span class="${pill}" style="margin-right:8px">${t.status}</span>
        ${t.status !== "Completed" ? `<button class="btn" data-complete="${t.id}">Complete</button>` : ""}
      </div>`;
    list.appendChild(div);
  });
}

/******** CHARTS (Chart.js) *********/
function safeDestroy(inst) {
  try { if (inst && typeof inst.destroy === "function") inst.destroy(); } catch (e) { /* ignore */ }
}

// Task trend line
function drawTaskTrendChart() {
  const canvas = qs("#taskTrendChart");
  if (!canvas) return;
  if (typeof Chart === "undefined") { console.warn("Chart.js not found"); return; }

  const year = (qs("#yearSelect")?.value) || new Date().getFullYear().toString();
  const counts = computeTrend(year);

  const labels = ['J','F','M','A','M','J','J','A','S','O','N','D'];

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (window.taskTrendChartInstance) {
    // update
    window.taskTrendChartInstance.data.labels = labels;
    window.taskTrendChartInstance.data.datasets[0].data = counts;
    window.taskTrendChartInstance.options.plugins.title.text = `Task Completion Trends — ${year}`;
    window.taskTrendChartInstance.update();
    return;
  }

  window.taskTrendChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: `Completed tasks in ${year}`,
        data: counts,
        tension: 0.35,
        borderWidth: 3,
        pointRadius: 4,
        pointHoverRadius: 6,
        borderColor: '#1b78c5',
        backgroundColor: 'rgba(27,120,197,0.08)',
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: `Task Completion Trends — ${year}`,
          color: '#0e1726',
          font: { size: 14 }
        },
        tooltip: { mode: 'index', intersect: false }
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: '#9aa' } },
        y: { beginAtZero: true, ticks: { stepSize: 1, color: '#9aa' }, grid: { color: 'rgba(200,200,200,0.06)' } }
      }
    }
  });
}

// Room occupancy donut
function drawRoomOccupancyChart() {
  const canvas = qs("#roomOccupancyChart");
  if (!canvas) return;
  if (typeof Chart === "undefined") { console.warn("Chart.js not found"); return; }

  const counts = { Vacant: 0, Occupied: 0, Needs: 0 };
  (state.rooms || []).forEach(r => {
    if (r.status === 'Vacant') counts.Vacant++;
    else if (r.status === 'Occupied') counts.Occupied++;
    else counts.Needs++;
  });

  const data = {
    labels: ['Vacant', 'Occupied', 'Needs Cleaning'],
    datasets: [{
      data: [counts.Vacant, counts.Occupied, counts.Needs],
      backgroundColor: ['#2aa06d', '#1b78c5', '#f02929ff'],
      hoverOffset: 6,
    }]
  };

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  if (window.roomOccupancyChartInstance) {
    window.roomOccupancyChartInstance.data = data;
    window.roomOccupancyChartInstance.update();
    return;
  }

  window.roomOccupancyChartInstance = new Chart(ctx, {
    type: 'doughnut',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '65%',
      plugins: {
        legend: { position: 'bottom', labels: { color: '#333' } },
        title: { display: false }
      }
    }
  });
}

// Staff bar chart
function drawStaffBarChart() {
  const canvas = qs("#staffBarChart");
  if (!canvas) return;
  if (typeof Chart === "undefined") { console.warn("Chart.js not found"); return; }

  const { labels, values } = staffPerformanceCounts();
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const data = {
    labels,
    datasets: [{
      label: 'Tasks Completed',
      data: values,
      borderRadius: 6,
      barThickness: 28,
      backgroundColor: '#1b78c5'
    }]
  };

  if (window.staffBarChartInstance) {
    window.staffBarChartInstance.data = data;
    window.staffBarChartInstance.update();
    return;
  }

  window.staffBarChartInstance = new Chart(ctx, {
    type: 'bar',
    data,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#6b7a8c' }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#6b7a8c', precision: 0 } }
      }
    }
  });
}

/******** ACTION FLOWS *********/
function addStaffFlow() {
  const name = prompt("New staff name:");
  if (!name) return;
  const type = prompt(`Staff type (${staffTypes.join(", ")}):`) || "Room Cleaning";
  state.staff.push({ id: crypto.randomUUID(), name, role: "Housekeeper", type, status: "Active", assigned: 0 });
  renderAll(); toast("Staff added");
}

function assignTaskFlow() {
  const who = prompt("Assign to (name):", visibleStaff()[0]?.name || "");
  if (!who) return;
  if (!isAdmin() && !state.me.team.includes(who)) return toast("Managers can assign only to their team");
  const title = prompt("Task title:", "Standard Clean");
  const room = prompt("Room # (optional):", "");
  const id = (Math.max(0, ...state.tasks.map(t => t.id)) + 1) || 1;
  state.tasks.push({ id, title, assignee: who, room: room || null, status: "Pending" });
  renderAll(); toast("Task created");
}

/******** WIRING & EVENTS *********/
function wire() {
  // role select
  qs("#roleSelect")?.addEventListener("change", e => { state.role = e.target.value; applyRole(); renderAll(); });

  // search & filters
  ["staffSearch", "staffTypeFilter", "roomStatusFilter"].forEach(id => {
    const el = qs("#" + id); if (!el) return;
    el.addEventListener("input", () => {
      if (id === "roomStatusFilter") renderRooms();
      else renderStaffTable();
    });
  });

  // year select for trend
  qs("#yearSelect")?.addEventListener("change", () => drawTaskTrendChart());

  qs("#bulkActivate")?.addEventListener("click", () => isAdmin() && bulkUpdateStatus(true));
  qs("#bulkDeactivate")?.addEventListener("click", () => isAdmin() && bulkUpdateStatus(false));
  qs("#selectAll")?.addEventListener("change", e => qsa('#staffTable input[type="checkbox"]').forEach(cb => cb.checked = e.target.checked));

  // quick action buttons
  qs("#qaAddStaff")?.addEventListener("click", addStaffFlow);
  qs("#qaAssignTask")?.addEventListener("click", assignTaskFlow);
  qs("#qaViewReports")?.addEventListener("click", () => { if (isAdmin()) { location.hash = "#reports"; toast("Opening reports…"); } else toast("Managers cannot access Reports"); });

  // delegated click handling
  document.body.addEventListener("click", (ev) => {
    const b = ev.target.closest("button");
    if (!b) return;

    if (b.id === "addStaffBtn") return addStaffFlow();

    if (b.dataset.editId) {
      const s = state.staff.find(x => x.id === b.dataset.editId);
      if (!s) return;
      const newType = prompt("Update Staff Type:", s.type) || s.type;
      s.type = newType;
      renderAll(); toast("Staff updated");
    }

    if (b.dataset.removeId && isAdmin()) {
      state.staff = state.staff.filter(x => x.id !== b.dataset.removeId);
      renderAll(); toast("Staff removed");
    }

    if (b.dataset.room && isAdmin()) {
      const rid = b.dataset.room;
      const r = state.rooms.find(x => x.id == rid);
      if (r) {
        r.status = b.dataset.status;
        renderRooms();
        try { drawRoomOccupancyChart(); } catch (err) { console.warn("Donut redraw failed:", err); }
        toast(`Room ${r.id} → ${r.status}`);
      }
    }

    if (b.dataset.complete) {
  const t = state.tasks.find(x => x.id == b.dataset.complete);
  if (!t) return;

  // ✅ Mark the task as completed
  t.status = "Completed";
  t.doneOn = keyFor(new Date()); // adds YYYY-MM-DD date

  // ✅ Optional: make sure you’re viewing the correct year in the dropdown
  const yearSelect = document.getElementById('yearSelect');
  if (yearSelect) yearSelect.value = new Date().getFullYear().toString();

  // ✅ Re-render UI + charts
  renderAll();

  try {
    // Update existing chart if it already exists
    if (window.taskTrendChartInstance) {
      window.taskTrendChartInstance.update();
    } else {
      drawTaskTrendChart();
    }
  } catch (err) {
    // fallback — destroy & recreate chart safely
    try { window.taskTrendChartInstance?.destroy(); } catch(e) {}
    drawTaskTrendChart();
  }

  toast("Task completed");
}
});


  window.addEventListener("resize", () => {
    try {
      window.taskTrendChartInstance?.resize?.();
      window.staffBarChartInstance?.resize?.();
      window.roomOccupancyChartInstance?.resize?.();
    } catch (e) {}
  });
}

function bulkUpdateStatus(active) {
  const ids = qsa('#staffTable input[type="checkbox"]:checked').map(cb => cb.dataset.id);
  state.staff.forEach(s => { if (ids.includes(s.id)) s.status = active ? "Active" : "Inactive"; });
  renderAll();
  toast(`Updated ${ids.length} staff`);
}

/******** BOOT *********/
document.addEventListener("DOMContentLoaded", async () => {
  wire();
  await refresh();
});

// Load tasks from shared localStorage
function getSharedTasks() {
  try {
    const data = JSON.parse(localStorage.getItem('hms_tasks_local_v1') || '{}');
    return data.tasks || [];
  } catch {
    return [];
  }
}

// For dashboards that display all tasks
function refreshTasksView() {
  const tasks = getSharedTasks();
  renderTasks(tasks);
}

// For staff pages (show only assigned or same type)
function staffVisibleTasks(tasks, staffName, staffType) {
  return tasks.filter(t =>
    (t.assignee && t.assignee === staffName) ||
    (t.type && t.type === staffType)
  );
}

// 🔄 Listen for changes made by Admin in other tabs/pages
window.addEventListener('storage', e => {
  if (e.key === 'tasks-updated') {
    console.log('Detected Admin task update — refreshing…');
    refreshTasksView();
  }
});

// When the page first loads
refreshTasksView();
