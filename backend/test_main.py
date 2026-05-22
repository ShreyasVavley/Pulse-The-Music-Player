import os
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Setup temporary test database
TEST_DB_URL = "sqlite:///./test_songs.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

from backend import models
from backend.database import Base
from backend.main import app, get_db

# Create test tables
Base.metadata.create_all(bind=engine)

# Override database dependency to point to our test database
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

client = TestClient(app)

@pytest.fixture(autouse=True)
def run_around_tests():
    # Setup: Ensure database tables are empty/fresh
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    yield
    # Teardown: Clean up database file
    Base.metadata.drop_all(bind=engine)
    if os.path.exists("./test_songs.db"):
        try:
            os.remove("./test_songs.db")
        except PermissionError:
            pass

def test_get_songs_empty():
    response = client.get("/songs")
    assert response.status_code == 200
    assert response.json() == []

def test_upload_song():
    # Create fake audio data to upload
    file_content = b"fake audio data"
    response = client.post(
        "/upload",
        files={"file": ("test_song.mp3", file_content, "audio/mpeg")}
    )
    assert response.status_code == 200
    res_data = response.json()
    assert res_data["message"] == "Successfully uploaded"
    assert "song" in res_data

    # Verify that the uploaded song is in the songs list
    response_list = client.get("/songs")
    assert response_list.status_code == 200
    songs = response_list.json()
    assert len(songs) == 1
    assert songs[0]["title"] == "test_song"
    assert songs[0]["artist"] == "Local Artist"

    # Clean up file created by backend upload
    mock_file_path = "backend/audio/test_song.mp3"
    if os.path.exists(mock_file_path):
        os.remove(mock_file_path)

def test_stream_audio_not_found():
    response = client.get("/stream/999")
    assert response.status_code == 404

def test_scan_invalid_path():
    response = client.post("/scan", json={"folder_path": "C:\\invalid\\path\\does\\not\\exist"})
    assert response.status_code == 400
