import os
import spotipy
from spotipy.oauth2 import SpotifyClientCredentials
import requests
from sqlalchemy.orm import Session
from backend.database import SessionLocal, engine
from backend import models

# Set up database
models.Base.metadata.create_all(bind=engine)
db = SessionLocal()

def populate():
    if not os.environ.get("SPOTIPY_CLIENT_ID") or not os.environ.get("SPOTIPY_CLIENT_SECRET"):
        print("Spotify credentials not found. Populating with mock data.")
        add_mock_data()
        return

    sp = spotipy.Spotify(client_credentials_manager=SpotifyClientCredentials())
    
    try:
        results = sp.playlist_tracks("37i9dQZEVXbMDoHDwVN2tF", limit=10)
        os.makedirs("backend/audio", exist_ok=True)
        
        for item in results['items']:
            track = item['track']
            preview_url = track['preview_url']
            
            if not preview_url:
                continue
                
            title = track['name']
            artist = track['artists'][0]['name']
            album = track['album']['name']
            cover_url = track['album']['images'][0]['url'] if track['album']['images'] else ""
            
            file_name = f"backend/audio/{track['id']}.mp3"
            if not os.path.exists(file_name):
                response = requests.get(preview_url)
                with open(file_name, 'wb') as f:
                    f.write(response.content)
            
            duration = "0:30"
            
            existing = db.query(models.Song).filter(models.Song.title == title).first()
            if not existing:
                song = models.Song(
                    title=title,
                    artist=artist,
                    album=album,
                    duration=duration,
                    file_url=file_name,
                    cover_url=cover_url
                )
                db.add(song)
        
        db.commit()
        print("Successfully populated database from Spotify.")
        
    except Exception as e:
        print(f"Error fetching from Spotify: {e}")
        add_mock_data()

def add_mock_data():
    os.makedirs("backend/audio", exist_ok=True)
    
    songs_data = [
        {
            "title": "Midnight Obsidian",
            "artist": "Pulse Streamers",
            "album": "Dark Aesthetics",
            "duration": "6:12",
            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
            "cover": "https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?auto=format&fit=crop&q=80&w=300"
        },
        {
            "title": "Deep Bass",
            "artist": "The Coders",
            "album": "Backend Vibes",
            "duration": "7:05",
            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
            "cover": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?auto=format&fit=crop&q=80&w=300"
        },
        {
            "title": "Neon Dreams",
            "artist": "Synthwave Master",
            "album": "Retro Future",
            "duration": "5:44",
            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
            "cover": "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&q=80&w=300"
        },
        {
            "title": "Ocean Breeze",
            "artist": "Chill Vibes",
            "album": "Summer Sounds",
            "duration": "5:02",
            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
            "cover": "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=300"
        },
        {
            "title": "Cyber City",
            "artist": "The Night Riders",
            "album": "City Lights",
            "duration": "6:53",
            "url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
            "cover": "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=300"
        }
    ]

    for index, data in enumerate(songs_data):
        local_path = f"backend/audio/mock_song_{index+1}.mp3"
        if not os.path.exists(local_path):
            print(f"Downloading {data['title']}...")
            try:
                response = requests.get(data['url'])
                with open(local_path, 'wb') as f:
                    f.write(response.content)
            except Exception as e:
                print(f"Failed to download audio for {data['title']}: {e}")
                continue
                
        existing = db.query(models.Song).filter(models.Song.title == data['title']).first()
        if not existing:
            song = models.Song(
                title=data['title'],
                artist=data['artist'],
                album=data['album'],
                duration=data['duration'],
                file_url=local_path,
                cover_url=data['cover']
            )
            db.add(song)
            
    db.commit()
    print("Mock data added.")

if __name__ == "__main__":
    populate()
