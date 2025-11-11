/* task-sync.js — canonical shared task/storage layer */
window.TypeNormalizer = (() => {
  const map = {
    'room cleaning':'Room Cleaning','room-cleaning':'Room Cleaning',
    'floor cleaning':'Floor Cleaning','floor-cleaning':'Floor Cleaning',
    'laundry':'Laundry','maintenance':'Maintenance',
    'food service':'Food Service','food-service':'Food Service',
    'gardener':'Gardener','night shift attendant':'Night Shift Attendant',
    'night-shift attendant':'Night Shift Attendant','storekeeping':'Storekeeping',
    'night shift':'Night Shift'
  };
  return { normalize: s => map[String(s||'').toLowerCase().trim()] || String(s||'').trim() };
})();

window.TaskSync = (() => {
  const STORAGE_KEY = 'hms_tasks_local_v1';
  const UPDATE_KEY  = 'tasks-updated';

  function readAll() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}').tasks || []; }
    catch { return []; }
  }
  function writeAll(tasks) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tasks }));
    localStorage.setItem(UPDATE_KEY, String(Date.now()));
    // same-tab notify
    window.dispatchEvent(new Event(UPDATE_KEY));
  }

  return {
    STORAGE_KEY, UPDATE_KEY,
    getAllTasks: () => readAll().map(t => ({...t, type: TypeNormalizer.normalize(t.type)})),
    addTask: (task) => {
      const tasks = readAll();
      const max = tasks.length ? Math.max(...tasks.map(t => +t.id || 0)) : 0;
      const newTask = {
        id: max + 1,
        title: String(task.title||'').trim(),
        assignee: String(task.assignee||'').trim() || null,
        type: TypeNormalizer.normalize(task.type || ''),
        room: task.room || null,
        status: task.status || 'Pending',
        createdOn: new Date().toISOString()
      };
      tasks.push(newTask);
      writeAll(tasks);
      return newTask;
    },
    markTaskCompleted: (id) => {
      const tasks = readAll();
      const t = tasks.find(x => String(x.id) === String(id));
      if (t && t.status !== 'Completed') {
        t.status = 'Completed';
        t.doneOn = new Date().toISOString().slice(0,10);
        writeAll(tasks);
        return true;
      }
      return false;
    },
    removeTask: (id) => {
      const tasks = readAll().filter(t => String(t.id) !== String(id));
      writeAll(tasks);
    }
  };
})();
