# crud.py
from datetime import date
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete
from models import Staff, Room, Task, Activity, RoomStatusEnum, TaskStatusEnum

# ----- Helpers: snapshots -----
def snapshot_state(db: Session) -> dict:
    staff = db.execute(select(Staff)).scalars().all()
    rooms = db.execute(select(Room)).scalars().all()
    tasks = db.execute(select(Task)).scalars().all()
    activity = db.execute(select(Activity).order_by(Activity.id.desc()).limit(50)).scalars().all()
    # Serialize
    def s_staff(s: Staff): return {"id": s.id, "name": s.name, "role": s.role, "type": s.type, "status": s.status, "assigned": s.assigned}
    def s_room(r: Room): return {"id": r.id, "status": r.status.value}
    def s_task(t: Task): return {"id": t.id, "title": t.title, "assignee": t.assignee_name, "room": t.room_id, "status": t.status.value, "doneOn": t.done_on.isoformat() if t.done_on else None}
    def s_activity(a: Activity): return {"id": a.id, "event": a.title, "date": a.when, "status": a.status}
    return {
        "staff": [s_staff(s) for s in staff],
        "rooms": [s_room(r) for r in rooms],
        "tasks": [s_task(t) for t in tasks],
        "activity": [s_activity(a) for a in activity][::-1]
    }

# ----- Staff -----
def add_staff(db: Session, name: str, role="Housekeeper", type_="Room Cleaning", status="Active", assigned=0):
    # Check duplicate
    exists = db.execute(select(Staff).where(Staff.name.ilike(name))).scalar_one_or_none()
    if exists:
        raise ValueError("Staff already exists.")
    s = Staff(name=name, role=role, type=type_, status=status, assigned=assigned)
    db.add(s)
    db.flush()  # so s.id is populated
    db.add(Activity(title=f"Added staff {name}", when=str(date.today()), status="ok"))
    db.commit()
    db.refresh(s)
    return s

def update_staff(db: Session, staff_id: int, **fields):
    s = db.get(Staff, staff_id)
    if not s:
        raise LookupError("Staff not found.")
    for k, v in fields.items():
        if v is not None and hasattr(s, k):
            setattr(s, k, v)
    db.add(Activity(title=f"Updated staff {s.name}", when=str(date.today()), status="ok"))
    db.commit()
    db.refresh(s)
    return s

def delete_staff(db: Session, staff_id: int):
    s = db.get(Staff, staff_id)
    if not s:
        raise LookupError("Staff not found.")
    db.delete(s)
    db.add(Activity(title=f"Removed staff {s.name}", when=str(date.today()), status="ok"))
    db.commit()

# ----- Rooms -----
def set_room_status(db: Session, room_id: int, status: RoomStatusEnum):
    r = db.get(Room, room_id)
    if not r:
        r = Room(id=room_id, status=status)
        db.add(r)
    else:
        r.status = status
    db.add(Activity(title=f"Room {room_id} set to {status.value}", when=str(date.today()), status="ok"))
    db.commit()
    db.refresh(r)
    return r

# ----- Tasks -----
def create_task(db: Session, title: str, assignee_name: Optional[str] = None, room_id: Optional[int] = None):
    # Optional: link to staff if name exists
    assignee_id = None
    if assignee_name:
        st = db.execute(select(Staff).where(Staff.name == assignee_name)).scalar_one_or_none()
        if st:
            assignee_id = st.id
    t = Task(title=title, assignee_id=assignee_id, assignee_name=assignee_name, room_id=room_id, status=TaskStatusEnum.Pending)
    db.add(t)
    db.flush()
    db.add(Activity(title=f"Created task '{title}'", when=str(date.today()), status="ok"))
    db.commit()
    db.refresh(t)
    return t

def complete_task(db: Session, task_id: int):
    t = db.get(Task, task_id)
    if not t:
        raise LookupError("Task not found.")
    t.status = TaskStatusEnum.Completed
    t.done_on = date.today()
    db.add(Activity(title=f"Completed task {t.title}", when=str(date.today()), status="ok"))
    db.commit()
    db.refresh(t)
    return t
