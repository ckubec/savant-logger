from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, JSON, Text
from .database import Base

class Project(Base):
    __tablename__ = "projects"
    
    id = Column(Integer, primary_key=True)
    name = Column(String, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class LogCapture(Base):
    __tablename__ = "log_captures"
    
    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"))
    timestamp = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)

class Device(Base):
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True)
    device_id = Column(String)
    log_capture_id = Column(Integer, ForeignKey("log_captures.id"))
    network_data = Column(JSON)
    health_data = Column(JSON)
    related_crashes = Column(JSON)  # Store any crash data related to this device
    lighting_history = Column(JSON)  # Store relevant lighting history
    system_stats = Column(JSON)     # Store system stats at time of capture
    wifi_data = Column(JSON)        # Store WiFi related data

class CrashReport(Base):
    __tablename__ = "crash_reports"
    
    id = Column(Integer, primary_key=True)
    log_capture_id = Column(Integer, ForeignKey("log_captures.id"))
    process_name = Column(String)
    timestamp = Column(DateTime)
    crash_data = Column(Text)
    related_device_id = Column(String, nullable=True)  # Link to device if found in crash 