/* staff-roster.js — unified roster renderer for all staff pages
   Storage: localStorage['hms_staff_local_v1'] = [ {id,name,role,type,status,assigned} ]
*/
(function(){
  const KEYS = { STAFF:'hms_staff_local_v1' };
  const $  = (s,p=document)=>p.querySelector(s);

  const TYPE_LIST = [
    'Room Cleaning','Floor Cleaning','Public Area','Laundry',
    'Food Service','Maintenance','Gardener','Storekeeping','Night Shift'
  ];

  function readStaff(){
    try{
      const arr = JSON.parse(localStorage.getItem(KEYS.STAFF)||'[]');
      return Array.isArray(arr) ? arr.map(s=>({
        id: s.id || ('id_'+Math.random().toString(36).slice(2)),
        name: s.name || '',
        role: s.role || 'Housekeeper',
        type: s.type || 'Room Cleaning',
        status: s.status || 'Active',
        assigned: Number.isFinite(s.assigned) ? s.assigned : 0
      })) : [];
    }catch{ return []; }
  }

  function pill(status){
    const s = String(status||'Active');
    const cls = s==='Active' ? 'ok' : 'bad';
    return `<span class="pill ${cls}">${s}</span>`;
  }

  function fillTypeDropdown(sel){
    if(!sel) return;
    sel.innerHTML = `<option value="">All Types</option>` + TYPE_LIST.map(t=>`<option>${t}</option>`).join('');
  }

  function setTitle(dept){
    const h = $('#pageTitle'); if(h) h.textContent = `${dept} — Staff Roster`;
    const d = document.querySelector('title'); if(d) d.textContent = `${dept} — Staff Roster`;
  }

  function render(dept){
    const tbody = $('#rosterBody');
    const empty = $('#emptyRow');
    const qName = ($('#searchName')?.value||'').trim().toLowerCase();
    const fType = $('#filterType')?.value || '';
    const fStatus = $('#filterStatus')?.value || '';

    let list = readStaff();

    // default: restrict to this department unless user switches type
    if(!fType) list = list.filter(s=>s.type===dept);
    else       list = list.filter(s=>s.type===fType);

    if(qName)   list = list.filter(s => s.name.toLowerCase().includes(qName));
    if(fStatus) list = list.filter(s => s.status===fStatus);

    tbody.innerHTML = '';
    if(!list.length){ if(empty) empty.style.display='block'; return; }
    if(empty) empty.style.display='none';

    list.forEach((s, i)=>{
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td class="n">${i+1}</td>
        <td>${s.name}</td>
        <td>${s.role}</td>
        <td>${s.type}</td>
        <td>${pill(s.status)}</td>
        <td>${s.assigned||0}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function wire(dept){
    $('#searchName')?.addEventListener('input', ()=>render(dept));
    $('#filterType')?.addEventListener('change', ()=>render(dept));
    $('#filterStatus')?.addEventListener('change', ()=>render(dept));
    window.addEventListener('storage', (e)=>{
      if(e.key==='hms_staff_local_v1'){ render(dept); }
    });
  }

  window.initStaffRoster = function(dept){
    setTitle(dept);
    fillTypeDropdown($('#filterType'));
    render(dept);
    wire(dept);
  };
})();
