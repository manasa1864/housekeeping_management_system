# ------------------------------------------------------------
# app.py — Complete standalone FastAPI backend for
#          Housekeeping Management System
# ------------------------------------------------------------
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import List, Dict, Optional
from pydantic import BaseModel
from datetime import date

# ------------------------------------------------------------
# FastAPI setup
# ------------------------------------------------------------
app = FastAPI(title="Housekeeping Management System API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (adjust for production)
    allow_methods=["*"],
    allow_headers=["*"],
)

# ------------------------------------------------------------
# Data Models
# ------------------------------------------------------------
class Staff(BaseModel):
    id: int
    name: str
    role: str
    type: str
    status: str
    assigned: int = 0


class Room(BaseModel):
    id: int
    status: str


class Task(BaseModel):
    id: int
    title: str
    assignee: str
    room: Optional[int] = None
    status: str
    doneOn: Optional[str] = None


# ------------------------------------------------------------
# In-Memory "Database"
# ------------------------------------------------------------
STAFF: List[Dict] = [
    {"id": 1, "name": "Alice Johnson", "role": "Housekeeper", "type": "Room Cleaning", "status": "Active", "assigned": 5},
    {"id": 2, "name": "Bob Smith", "role": "Housekeeper", "type": "Floor Cleaning", "status": "Active", "assigned": 3},
    {"id": 3, "name": "Charlie Brown", "role": "Housekeeper", "type": "Public Area", "status": "Active", "assigned": 2},
    {"id": 4, "name": "Diana Miller", "role": "Maintenance", "type": "Maintenance", "status": "Active", "assigned": 1},
    {"id": 5, "name": "Eve Davis", "role": "Housekeeper", "type": "Laundry", "status": "Inactive", "assigned": 0},
    {"id": 6, "name": "Grace Taylor", "role": "Supervisor", "type": "Food Service", "status": "Active", "assigned": 4},
]

ROOMS: Dict[int, Dict] = {
    101: {"id": 101, "status": "Vacant"},
    102: {"id": 102, "status": "Occupied"},
    103: {"id": 103, "status": "Needs"},
    104: {"id": 104, "status": "Vacant"},
    105: {"id": 105, "status": "Needs"},
    201: {"id": 201, "status": "Occupied"},
    202: {"id": 202, "status": "Vacant"},
}

TASKS: List[Dict] = [
    {"id": 1, "title": "Room 101 – Standard Clean", "assignee": "Alice Johnson", "room": 101, "status": "Pending"},
    {"id": 2, "title": "Lobby – Floor Polish", "assignee": "Bob Smith", "room": None, "status": "In Progress"},
    {"id": 3, "title": "Room 201 – Deep Clean", "assignee": "Charlie Brown", "room": 201, "status": "Completed", "doneOn": "2025-10-11"},
    {"id": 4, "title": "Laundry – Batch 3", "assignee": "Eve Davis", "room": None, "status": "Completed", "doneOn": "2025-10-10"},
    {"id": 5, "title": "Restaurant – Setup", "assignee": "Grace Taylor", "room": None, "status": "Completed", "doneOn": "2025-10-09"},
]

ACTIVITY: List[Dict] = []


# ------------------------------------------------------------
# Utility functions
# ------------------------------------------------------------
def snapshot_state():
    """Return a unified snapshot of all app data."""
    return {
        "staff": STAFF,
        "rooms": list(ROOMS.values()),
        "tasks": TASKS,
        "activity": ACTIVITY[-50:],
    }


# ------------------------------------------------------------
# API Routes
# ------------------------------------------------------------

@app.get("/")
def root():
    return {"message": "Housekeeping Management System API is running"}


@app.get("/state")
def get_state():
    """Get all data (staff, rooms, tasks)."""
    return snapshot_state()


# ---------------- STAFF ROUTES ----------------
@app.post("/staff")
def add_staff(payload: dict):
    """Add a new staff member."""
    name = payload.get("name", "").strip()
    if not name:
        raise HTTPException(400, "Name cannot be empty.")

    if any(s["name"].lower() == name.lower() for s in STAFF):
        raise HTTPException(409, "Staff already exists.")

    new_id = max([s["id"] for s in STAFF], default=0) + 1
    new_staff = {
        "id": new_id,
        "name": name,
        "role": payload.get("role", "Housekeeper"),
        "type": payload.get("type", "Room Cleaning"),
        "status": payload.get("status", "Active"),
        "assigned": payload.get("assigned", 0),
    }

    STAFF.append(new_staff)
    ACTIVITY.append({"event": f"Added staff {name}", "date": str(date.today())})
    return snapshot_state()


@app.patch("/staff/{staff_id}")
def update_staff(staff_id: int, payload: dict):
    """Edit an existing staff member."""
    for s in STAFF:
        if s["id"] == staff_id:
            s.update({
                "name": payload.get("name", s["name"]),
                "role": payload.get("role", s["role"]),
                "type": payload.get("type", s["type"]),
                "status": payload.get("status", s["status"]),
                "assigned": payload.get("assigned", s["assigned"]),
            })
            ACTIVITY.append({"event": f"Updated staff {s['name']}", "date": str(date.today())})
            return snapshot_state()
    raise HTTPException(404, "Staff not found")


@app.delete("/staff/{staff_id}")
def delete_staff(staff_id: int):
    """Remove a staff member."""
    global STAFF
    for s in STAFF:
        if s["id"] == staff_id:
            STAFF = [x for x in STAFF if x["id"] != staff_id]
            ACTIVITY.append({"event": f"Removed staff {s['name']}", "date": str(date.today())})
            return snapshot_state()
    raise HTTPException(404, "Staff not found")


# ---------------- ROOM ROUTES ----------------
@app.patch("/room/{room_id}")
def update_room(room_id: int, payload: dict):
    """Update a room's status."""
    if room_id not in ROOMS:
        raise HTTPException(404, "Room not found")

    new_status = payload.get("status")
    if new_status not in ["Vacant", "Occupied", "Needs"]:
        raise HTTPException(400, "Invalid room status")

    ROOMS[room_id]["status"] = new_status
    ACTIVITY.append({"event": f"Room {room_id} set to {new_status}", "date": str(date.today())})
    return snapshot_state()


# ---------------- TASK ROUTES ----------------
@app.post("/task")
def add_task(payload: dict):
    """Create a new task."""
    title = payload.get("title", "").strip()
    if not title:
        raise HTTPException(400, "Task title required.")
    assignee = payload.get("assignee", "")
    room = payload.get("room", None)
    new_id = max([t["id"] for t in TASKS], default=0) + 1

    new_task = {
        "id": new_id,
        "title": title,
        "assignee": assignee,
        "room": room,
        "status": "Pending",
        "doneOn": None,
    }
    TASKS.append(new_task)
    ACTIVITY.append({"event": f"Created task '{title}'", "date": str(date.today())})
    return snapshot_state()


@app.patch("/task/{task_id}")
def complete_task(task_id: int):
    """Mark a task as completed."""
    for t in TASKS:
        if t["id"] == task_id:
            t["status"] = "Completed"
            t["doneOn"] = str(date.today())
            ACTIVITY.append({"event": f"Completed task {t['title']}", "date": str(date.today())})
            return snapshot_state()
    raise HTTPException(404, "Task not found")
