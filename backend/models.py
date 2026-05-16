from sqlalchemy import Column, Integer, String
from database import Base

class Song(Base):
    __tablename__ = "songs"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, index=True)
    artist = Column(String, index=True)
    album = Column(String, default="Unknown Album")
    duration = Column(String)
    file_url = Column(String)
    cover_url = Column(String)
