from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tarfile
import json
import os
from datetime import datetime
from pathlib import Path
import shutil
import logging
import uuid
from .database import SessionLocal, init_db
from .models import Project, LogCapture, Device, CrashReport
import re
import sqlite3

# Set up logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Create a base temp directory that persists between requests
BASE_TEMP_DIR = Path("/tmp/savant_logs")
BASE_TEMP_DIR.mkdir(exist_ok=True)

app = FastAPI()

@app.on_event("startup")
async def startup_event():
    # Initialize database tables
    init_db()
    # Clean up any existing temp directories
    if BASE_TEMP_DIR.exists():
        for path in BASE_TEMP_DIR.iterdir():
            if path.is_dir():
                shutil.rmtree(path)

@app.on_event("shutdown")
async def shutdown_event():
    # Clean up temp directory on shutdown
    if BASE_TEMP_DIR.exists():
        shutil.rmtree(BASE_TEMP_DIR)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Add this function to parse crash reports
def parse_crash_report(crash_file_path):
    try:
        with open(crash_file_path, 'r') as f:
            content = f.read()
            
        # Extract basic info
        process_match = re.search(r'Process:\s+(\w+)', content)
        timestamp_match = re.search(r'Date/Time:\s+(.+)', content)
        device_id_match = re.search(r'Device ID: ([A-F0-9]+)', content)
        
        return {
            'process': process_match.group(1) if process_match else 'unknown',
            'timestamp': timestamp_match.group(1) if timestamp_match else None,
            'device_id': device_id_match.group(1) if device_id_match else None,
            'content': content
        }
    except Exception as e:
        logger.error(f"Error parsing crash report {crash_file_path}: {str(e)}")
        return None

# Add this function to parse lighting history
def parse_lighting_history(db_path):
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        # Get recent state changes
        cursor.execute("""
            SELECT device_id, state, timestamp 
            FROM state_changes 
            ORDER BY timestamp DESC 
            LIMIT 1000
        """)
        
        history = {}
        for row in cursor.fetchall():
            device_id, state, timestamp = row
            if device_id not in history:
                history[device_id] = []
            history[device_id].append({
                'state': state,
                'timestamp': timestamp
            })
            
        conn.close()
        return history
    except Exception as e:
        logger.error(f"Error parsing lighting history: {str(e)}")
        return None

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    # Create a unique temp directory for this upload
    temp_dir = BASE_TEMP_DIR / str(uuid.uuid4())
    temp_dir.mkdir(exist_ok=True)
    
    try:
        # Save uploaded file
        file_path = temp_dir / file.filename
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Extract project name and timestamp from filename
        filename_parts = file.filename.replace("_DiagnosticReports.tgz", "").split('_')
        project_name = filename_parts[0]
        timestamp_str = filename_parts[1]
        
        try:
            timestamp = datetime.strptime(timestamp_str, "%Y-%m-%d-%H%M%S")
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid timestamp format in filename: {timestamp_str}"
            )
        
        # Extract the tar file
        with tarfile.open(file_path, "r:gz") as tar:
            # List contents before extraction
            logger.info("Tar file contents:")
            for member in tar.getmembers():
                logger.info(f"  {member.name}")
            tar.extractall(path=temp_dir)
        
        # List extracted directory structure
        logger.info("Extracted directory structure:")
        for path in temp_dir.rglob("*"):
            logger.info(f"  {path.relative_to(temp_dir)}")
        
        db = SessionLocal()
        try:
            # Create or get project
            project = db.query(Project).filter_by(name=project_name).first()
            if not project:
                project = Project(name=project_name)
                db.add(project)
                db.flush()
            
            # Create log capture
            log_capture = LogCapture(
                project_id=project.id,
                timestamp=timestamp
            )
            db.add(log_capture)
            db.flush()
            
            # Find the logcapture directory
            possible_paths = list(temp_dir.rglob("logcapture-*"))
            if not possible_paths:
                raise HTTPException(
                    status_code=400,
                    detail="Could not find logcapture directory in uploaded file"
                )
            
            logcapture_dir = possible_paths[0]
            logger.info(f"Found logcapture directory: {logcapture_dir}")
            
            network_devices_dir = logcapture_dir / "lighting" / "NetworkDevice"
            system_health_dir = logcapture_dir / "lighting" / "SystemHealth"
            
            logger.info(f"Looking for devices in: {network_devices_dir}")
            
            if not network_devices_dir.exists():
                raise HTTPException(
                    status_code=400,
                    detail=f"NetworkDevice directory not found at {network_devices_dir}"
                )
            
            device_count = 0
            crash_reports = []
            for device_file in network_devices_dir.glob("*"):
                device_id = device_file.name
                logger.info(f"Processing device: {device_id}")
                
                try:
                    with open(device_file) as f:
                        network_data = json.load(f)
                    logger.info(f"Loaded network data for device: {device_id}")
                    
                    health_file = system_health_dir / device_id
                    health_data = None
                    if health_file.exists():
                        with open(health_file) as f:
                            health_data = json.load(f)
                        logger.info(f"Loaded health data for device: {device_id}")
                    else:
                        logger.warning(f"No health data found for device: {device_id}")
                    
                    # Process crash reports
                    crash_data = parse_crash_report(device_file)
                    if crash_data:
                        crash_report = CrashReport(
                            log_capture_id=log_capture.id,
                            process_name=crash_data['process'],
                            timestamp=datetime.strptime(crash_data['timestamp'], "%Y-%m-%d %H:%M:%S") if crash_data['timestamp'] else None,
                            crash_data=crash_data['content'],
                            related_device_id=crash_data['device_id']
                        )
                        db.add(crash_report)
                        crash_reports.append(crash_data)
                    
                    # Process lighting history
                    lighting_history = None
                    lighting_db = logcapture_dir / "lighting" / "lightingHistory.sqlite"
                    if lighting_db.exists():
                        lighting_history = parse_lighting_history(lighting_db)
                    
                    # Process WiFi data
                    wifi_data = None
                    wifi_file = logcapture_dir / "lighting" / "wifilist.out"
                    if wifi_file.exists():
                        with open(wifi_file) as f:
                            wifi_data = f.read()
                    
                    # Process system stats
                    system_stats = None
                    stats_file = logcapture_dir / "lighting" / "systemstats"
                    if stats_file.exists():
                        with open(stats_file) as f:
                            system_stats = f.read()
                    
                    # Add additional data
                    related_crashes = [cr for cr in crash_reports if cr['device_id'] == device_id]
                    device_history = lighting_history.get(device_id) if lighting_history else None
                    
                    device = Device(
                        device_id=device_id,
                        log_capture_id=log_capture.id,
                        network_data=network_data,
                        health_data=health_data,
                        related_crashes=related_crashes if related_crashes else None,
                        lighting_history=device_history,
                        system_stats=system_stats,
                        wifi_data=wifi_data
                    )
                    db.add(device)
                    device_count += 1
                    
                except Exception as e:
                    logger.error(f"Error processing device {device_id}: {str(e)}")
                    raise HTTPException(
                        status_code=500,
                        detail=f"Error processing device {device_id}: {str(e)}"
                    )
            
            db.commit()
            logger.info(f"Successfully processed {device_count} devices")
            
            return {
                "message": "File processed successfully",
                "devices_processed": device_count,
                "project_name": project_name,
                "timestamp": timestamp.isoformat()
            }
            
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"Upload error: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Error processing upload: {str(e)}"
        )
    finally:
        # Clean up temp directory
        if temp_dir.exists():
            shutil.rmtree(temp_dir)

@app.get("/projects")
async def get_projects():
    db = SessionLocal()
    try:
        projects = db.query(Project).all()
        return projects
    finally:
        db.close()

@app.get("/project/{project_id}/devices")
async def get_project_devices(project_id: int, capture_id: int = None):
    db = SessionLocal()
    try:
        # Get the requested capture
        if capture_id:
            current_capture = db.query(LogCapture).filter_by(id=capture_id).first()
        else:
            current_capture = db.query(LogCapture)\
                .filter_by(project_id=project_id)\
                .order_by(LogCapture.timestamp.desc())\
                .first()
        
        if not current_capture:
            return []

        # Get the previous capture
        previous_capture = db.query(LogCapture)\
            .filter(LogCapture.project_id == project_id,
                   LogCapture.timestamp < current_capture.timestamp)\
            .order_by(LogCapture.timestamp.desc())\
            .first()

        # Get current devices
        current_devices = db.query(Device)\
            .filter(Device.log_capture_id == current_capture.id)\
            .all()

        # Get previous devices if they exist
        previous_devices = {}
        if previous_capture:
            prev_devices = db.query(Device)\
                .filter(Device.log_capture_id == previous_capture.id)\
                .all()
            previous_devices = {d.device_id: d for d in prev_devices}

        # Prepare response with diff information
        result = []
        for device in current_devices:
            device_data = {
                "id": device.id,
                "device_id": device.device_id,
                "current": {
                    "network_data": device.network_data,
                    "health_data": device.health_data,
                    "capture_timestamp": current_capture.timestamp
                },
                "previous": None
            }
            
            # Add previous state if it exists
            if device.device_id in previous_devices:
                prev_device = previous_devices[device.device_id]
                device_data["previous"] = {
                    "network_data": prev_device.network_data,
                    "health_data": prev_device.health_data,
                    "capture_timestamp": previous_capture.timestamp
                }
            
            result.append(device_data)

        # Sort by state - prioritize non-"found" states
        result.sort(key=lambda x: (
            x["current"]["network_data"].get("state", "") == "found",
            x["current"]["network_data"].get("state", "")
        ))

        return result
    finally:
        db.close()

@app.get("/project/{project_id}/stats")
async def get_project_stats(project_id: int):
    db = SessionLocal()
    try:
        project = db.query(Project).filter_by(id=project_id).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found")
            
        captures = db.query(LogCapture).filter_by(project_id=project_id).all()
        stats = []
        
        for capture in captures:
            device_count = db.query(Device).filter_by(log_capture_id=capture.id).count()
            stats.append({
                "capture_id": capture.id,
                "timestamp": capture.timestamp,
                "device_count": device_count
            })
            
        return {
            "project_name": project.name,
            "captures": stats
        }
    finally:
        db.close() 