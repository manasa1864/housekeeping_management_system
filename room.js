// room.js — Manage rooms + broadcast occupancy to Admin pie chart
(function () {
  const qs = (s, p = document) => p.querySelector(s);
  const $toast = qs('#toast');
  const toast = (m) => {
    if (!$toast) return alert(m);
    $toast.textContent = m;
    $toast.classList.add('show');
    clearTimeout($toast._t);
    $toast._t = setTimeout(() => $toast.classList.remove('show'), 1400);
  };

  // Storage keys (shared across pages)
  const ROOMS_KEY = 'hms_rooms_local_v1';          // { rooms: [{id, number, status, occupant|null}] }
  const ROOMS_AGG_KEY = 'hms_rooms_occupancy_v1';  // { occupied, vacant, needs }
  const ROOMS_UPDATED_PULSE = 'rooms-updated';     // storage event pulse

  let rooms = [];

  function loadRooms() {
    try {
      rooms = JSON.parse(localStorage.getItem(ROOMS_KEY) || '{"rooms":[]}').rooms || [];
    } catch {
      rooms = [];
    }
  }

  function saveRooms() {
    localStorage.setItem(ROOMS_KEY, JSON.stringify({ rooms }));
    // also compute & store occupancy aggregate for the Admin chart
    const agg = aggregate();
    localStorage.setItem(ROOMS_AGG_KEY, JSON.stringify(agg));
    // ping listeners (admin.html will listen and refresh its chart)
    localStorage.setItem(ROOMS_UPDATED_PULSE, String(Date.now()));
  }

  function aggregate(list = rooms) {
    const out = { occupied: 0, vacant: 0, needs: 0 };
    (list || []).forEach(r => {
      const s = String(r.status || '').toLowerCase();
      if (s === 'occupied') out.occupied++;
      else if (s === 'vacant') out.vacant++;
      else out.needs++;
    });
    return out;
  }

  // UI wiring
  const roomNumber = qs('#roomNumber');
  const roomStatus = qs('#roomStatus');
  const roomOccupant = qs('#roomOccupant');
  const occupantWrap = qs('#occupantWrap');
  const tbody = qs('#roomsTbody');
  const search = qs('#search');

  function syncOccupantVisibility() {
    const show = (roomStatus.value === 'Occupied');
    occupantWrap.style.display = show ? 'block' : 'none';
  }

  function resetForm() {
    roomNumber.value = '';
    roomStatus.value = 'Occupied';
    roomOccupant.value = '';
    syncOccupantVisibility();
  }

  function upsertRoom() {
    const number = (roomNumber.value || '').trim();
    const status = roomStatus.value;
    const occupant = (roomOccupant.value || '').trim();

    if (!number) { toast('Enter a room number'); roomNumber.focus(); return; }
    if (status === 'Occupied' && !occupant) { toast('Occupant name required'); roomOccupant.focus(); return; }

    // If room number exists, update; else add new
    const i = rooms.findIndex(r => String(r.number) === String(number));
    if (i >= 0) {
      rooms[i] = { ...rooms[i], status, occupant: status === 'Occupied' ? occupant : null };
      toast('Room updated');
    } else {
      const id = 'r_' + Math.random().toString(36).slice(2);
      rooms.push({ id, number, status, occupant: status === 'Occupied' ? occupant : null });
      toast('Room added');
    }

    saveRooms();
    renderTable();
    resetForm();
  }

  function deleteRoom(id) {
    const r = rooms.find(x => x.id === id);
    if (!r) return;
    if (!confirm(`Delete Room ${r.number}?`)) return;
    rooms = rooms.filter(x => x.id !== id);
    saveRooms();
    renderTable();
    toast('Deleted');
  }

  function pill(status) {
    const s = (status || '').toLowerCase();
    if (s === 'occupied') return '<span class="pill ok">Occupied</span>';
    if (s === 'vacant') return '<span class="pill bad">Vacant</span>';
    return '<span class="pill warn">Needs</span>';
  }

  function renderTable() {
    const q = (search.value || '').toLowerCase();
    const list = rooms
      .slice()
      .sort((a, b) => String(a.number).localeCompare(String(b.number)))
      .filter(r => {
        if (!q) return true;
        const hay = `${r.number} ${r.occupant || ''} ${r.status}`.toLowerCase();
        return hay.includes(q);
      });

    tbody.innerHTML = '';
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#9fb0c7;padding:14px">No rooms yet</td></tr>`;
      return;
    }

    list.forEach((r, idx) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${idx + 1}</td>
        <td>${String(r.number)}</td>
        <td>${pill(r.status)}</td>
        <td>${r.status === 'Occupied' ? (r.occupant || '-') : '-'}</td>
        <td style="display:flex; gap:6px">
          <button class="btn ghost" data-edit="${r.id}">Edit</button>
          <button class="btn danger" data-del="${r.id}">Delete</button>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Edit flow: load room into form
  function editRoom(id) {
    const r = rooms.find(x => x.id === id);
    if (!r) return;
    roomNumber.value = r.number;
    roomStatus.value = r.status;
    roomOccupant.value = r.occupant || '';
    syncOccupantVisibility();
    roomNumber.focus();
  }

  // Events
  document.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.id === 'btnSave') return upsertRoom();
    if (b.id === 'btnReset') return resetForm();
    if (b.id === 'btnClearAll') {
      if (!confirm('Clear ALL rooms?')) return;
      rooms = [];
      saveRooms();
      renderTable();
      toast('Cleared');
      return;
    }
    if (b.dataset.del) return deleteRoom(b.dataset.del);
    if (b.dataset.edit) return editRoom(b.dataset.edit);
  });

  roomStatus.addEventListener('change', syncOccupantVisibility);
  search.addEventListener('input', renderTable);

  // Init
  document.addEventListener('DOMContentLoaded', () => {
    loadRooms();
    syncOccupantVisibility();
    renderTable();
    // Ensure aggregates are fresh (helps Admin chart on first load)
    saveRooms();
  });
})();
