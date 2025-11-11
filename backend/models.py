# models.py
from sqlalchemy import Column, Integer, String, Date, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from database import Base
import enum

class RoomStatusEnum(str, enum.Enum):
    Vacant = "Vacant"
    Occupied = "Occupied"
    Needs = "Needs"

class TaskStatusEnum(str, enum.Enum):
    Pending = "Pending"
    InProgress = "In Progress"
    Completed = "Completed"

class Staff(Base):
    __tablename__ = "staff"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), unique=True, nullable=False)
    role = Column(String(100), default="Housekeeper")
    type = Column(String(100), default="Room Cleaning")
    status = Column(String(20), default="Active")
    assigned = Column(Integer, default=0)

    tasks = relationship("Task", back_populates="assignee_rel", foreign_keys="Task.assignee_id", cascade="all,delete-orphan")

class Room(Base):
    __tablename__ = "rooms"
    id = Column(Integer, primary_key=True, index=True)
    status = Column(Enum(RoomStatusEnum), nullable=False)

    tasks = relationship("Task", back_populates="room_rel", foreign_keys="Task.room_id", cascade="all,delete-orphan")

class Task(Base):
    __tablename__ = "tasks"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(300), nullable=False)
    assignee_id = Column(Integer, ForeignKey("staff.id"), nullable=True)
    assignee_name = Column(String(200), nullable=True)  # denormalized convenience
    room_id = Column(Integer, ForeignKey("rooms.id"), nullable=True)
    status = Column(Enum(TaskStatusEnum), default=TaskStatusEnum.Pending)
    due = Column(Date, nullable=True)
    done_on = Column(Date, nullable=True)
    manager = Column(String(200), nullable=True)

    assignee_rel = relationship("Staff", back_populates="tasks", foreign_keys=[assignee_id])
    room_rel = relationship("Room", back_populates="tasks", foreign_keys=[room_id])

class Activity(Base):
    __tablename__ = "activity"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(Text, nullable=False)
    when = Column(String(64), nullable=False)
    status = Column(String(10), nullable=False, default="wait")
