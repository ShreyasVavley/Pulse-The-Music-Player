import os
from fastapi import FastAPI, Request, Depends, HTTPException, status, File, UploadFile, Form
from pydantic import BaseModel
from fastapi.responses import StreamingResponse, Response
import shutil
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
import models
from database import SessionLocal, engine

models.Base.metadata.create_all(bind=engine)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@app.get("/songs")
def get_songs(db: Session = Depends(get_db)):
    return db.query(models.Song).all()

def send_bytes_range_requests(file_path: str, start: int, end: int, chunk_size: int = 1024 * 1024):
    with open(file_path, "rb") as f:
        f.seek(start)
        while (pos := f.tell()) <= end:
            read_size = min(chunk_size, end + 1 - pos)
            chunk = f.read(read_size)
            if not chunk:
                break
            yield chunk

@app.get("/stream/{song_id}")
async def stream_audio(song_id: int, request: Request, db: Session = Depends(get_db)):
    song = db.query(models.Song).filter(models.Song.id == song_id).first()
    if not song:
        raise HTTPException(status_code=404, detail="Song not found")
        
    file_path = song.file_url
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on server")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header:
        # byte-range request
        range_str = range_header.strip().lower().replace("bytes=", "")
        ranges = range_str.split("-")
        start = int(ranges[0]) if ranges[0] else 0
        end = int(ranges[1]) if len(ranges) > 1 and ranges[1] else file_size - 1
        
        # Validations
        if start >= file_size or end >= file_size:
            return Response(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)
        
        content_length = end - start + 1
        headers = {
            "Content-Range": f"bytes {start}-{end}/{file_size}",
            "Accept-Ranges": "bytes",
            "Content-Length": str(content_length),
            "Content-Type": "audio/mpeg",
        }
        
        return StreamingResponse(
            send_bytes_range_requests(file_path, start, end),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            headers=headers
        )
    else:
        # full file request
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(file_size),
            "Content-Type": "audio/mpeg",
        }
        return StreamingResponse(
            send_bytes_range_requests(file_path, 0, file_size - 1),
            headers=headers
        )

@app.post("/upload")
async def upload_song(file: UploadFile = File(...), db: Session = Depends(get_db)):
    os.makedirs("audio", exist_ok=True)
    file_path = f"audio/{file.filename}"
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)
        
    title = file.filename.rsplit(".", 1)[0]
    
    song = models.Song(
        title=title,
        artist="Local Artist",
        album="Local Library",
        duration="Unknown",
        file_url=file_path,
        cover_url=""
    )
    db.add(song)
    db.commit()
    db.refresh(song)
    return {"message": "Successfully uploaded", "song": song.id}

class ScanRequest(BaseModel):
    folder_path: str

@app.post("/scan")
async def scan_folder(req: ScanRequest, db: Session = Depends(get_db)):
    folder_path = req.folder_path
    if not os.path.exists(folder_path) or not os.path.isdir(folder_path):
        raise HTTPException(status_code=400, detail="Invalid directory path")
    
    try:
        import mutagen  # type: ignore
        HAS_MUTAGEN = True
    except ImportError:
        HAS_MUTAGEN = False

    added_count = 0
    for root, dirs, files in os.walk(folder_path):
        for file in files:
            if file.lower().endswith(('.mp3', '.wav', '.flac', '.m4a', '.aac')):
                file_path = os.path.join(root, file)
                
                existing = db.query(models.Song).filter(models.Song.file_url == file_path).first()
                if not existing:
                    title = os.path.splitext(file)[0]
                    artist = "Local Folder"
                    album = os.path.basename(root)
                    duration = "Unknown"
                    
                    if HAS_MUTAGEN:
                        try:
                            from mutagen import File as MutagenFile  # type: ignore
                            audio = MutagenFile(file_path)
                            if audio:
                                if 'TIT2' in audio:
                                    title = str(audio['TIT2'])
                                elif 'title' in audio:
                                    title = str(audio['title'][0])
                                
                                if 'TPE1' in audio:
                                    artist = str(audio['TPE1'])
                                elif 'artist' in audio:
                                    artist = str(audio['artist'][0])
                                
                                if 'TALB' in audio:
                                    album = str(audio['TALB'])
                                elif 'album' in audio:
                                    album = str(audio['album'][0])
                                    
                                if audio.info and hasattr(audio.info, 'length'):
                                    mins = int(audio.info.length // 60)
                                    secs = int(audio.info.length % 60)
                                    duration = f"{mins}:{secs:02d}"
                        except Exception:
                            pass
                            
                    song = models.Song(
                        title=title[:255],
                        artist=artist[:255],
                        album=album[:255],
                        duration=duration,
                        file_url=file_path,
                        cover_url=""
                    )
                    db.add(song)
                    added_count += 1
    db.commit()
    return {"message": f"Successfully scanned and added {added_count} new tracks.", "added": added_count}
