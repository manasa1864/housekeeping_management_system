# app_db.py — FastAPI app backed by SQLite/SQLAlchemy
from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
from sqlalchemy.orm import Session

from database import get_db
from models import RoomStatusEnum
import crud

app = FastAPI(title="Housekeeping Management System API (DB)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----- Pydantic payloads -----
class StaffIn(BaseModel):
    name: str
    role: Optional[str] = "Housekeeper"
    type: Optional[str] = "Room Cleaning"
    status: Optional[str] = "Active"
    assigned: Optional[int] = 0

class RoomUpdate(BaseModel):
    status: RoomStatusEnum

class TaskIn(BaseModel):
    title: str
    assignee: Optional[str] = None
    room: Optional[int] = None

# ----- Routes -----
@app.get("/")
def root():
    return {"message": "Housekeeping Management System API (DB) is running"}

@app.get("/state")
def get_state(db: Session = Depends(get_db)):
    return crud.snapshot_state(db)

# Staff
@app.post("/staff")
def add_staff(payload: StaffIn, db: Session = Depends(get_db)):
    try:
        crud.add_staff(db, name=payload.name.strip(), role=payload.role, type_=payload.type, status=payload.status, assigned=payload.assigned)
        return crud.snapshot_state(db)
    except ValueError as e:
        raise HTTPException(409, str(e))

@app.patch("/staff/{staff_id}")
def edit_staff(staff_id: int, payload: StaffIn, db: Session = Depends(get_db)):
    try:
        crud.update_staff(db, staff_id, name=payload.name, role=payload.role, type=payload.type, status=payload.status, assigned=payload.assigned)
        return crud.snapshot_state(db)
    except LookupError as e:
        raise HTTPException(404, str(e))

@app.delete("/staff/{staff_id}")
def remove_staff(staff_id: int, db: Session = Depends(get_db)):
    try:
        crud.delete_staff(db, staff_id)
        return crud.snapshot_state(db)
    except LookupError as e:
        raise HTTPException(404, str(e))

# Room
@app.patch("/room/{room_id}")
def update_room(room_id: int, payload: RoomUpdate, db: Session = Depends(get_db)):
    crud.set_room_status(db, room_id, payload.status)
    return crud.snapshot_state(db)

# Tasks
@app.post("/task")
def add_task(payload: TaskIn, db: Session = Depends(get_db)):
    if not payload.title.strip():
        raise HTTPException(400, "Task title required.")
    crud.create_task(db, title=payload.title.strip(), assignee_name=payload.assignee, room_id=payload.room)
    return crud.snapshot_state(db)

@app.patch("/task/{task_id}")
def done_task(task_id: int, db: Session = Depends(get_db)):
    try:
        crud.complete_task(db, task_id)
        return crud.snapshot_state(db)
    except LookupError as e:
        raise HTTPException(404, str(e))
