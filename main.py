import random
import string
from fastapi import FastAPI, Query, Response
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from spotdl import Spotdl
from dotenv import load_dotenv
from spotipy import SpotifyOAuth
from spotipy.exceptions import SpotifyException
from starlette.background import BackgroundTasks


import traceback
import requests
import os
import nest_asyncio

nest_asyncio.apply()

load_dotenv()

origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def remove_file(path: str):
    try:
        os.remove(path)
    except Exception as e:
        print(e)


def generate_id(length: int) -> str:
    return "".join(random.choices(string.ascii_letters + string.digits, k=length))


spotify_dl = Spotdl(client_id=os.environ["SPOTIFY_CLIENT_ID"],
                    client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
                    print_errors=True,
                    log_level="DEBUG",
                    overwrite="force"
                    )


@app.get("/download/from-spotify-id")
async def download_audio_from_spotify_id(
    id: str = Query(...), bitrate: int = Query(320, ge=128, le=320),
    background_tasks: BackgroundTasks = BackgroundTasks()
):
    spotify_dl.downloader.bitrate = f"{bitrate}k"

    try:
        songs = spotify_dl.search([f"https://open.spotify.com/track/{id}"])
        print(songs)
        song, path = spotify_dl.download(songs[0])
        print(song, path)

        background_tasks.add_task(remove_file, path)
        return FileResponse(path)
    except Exception as e:
        print(e)
        # print trace
        traceback.print_exc()
        return Response(status_code=500, content=str(e))


@app.get("/auth/spotify")
async def spotify_auth():
    state = generate_id(16)
    scope = "playlist-read-private playlist-read-collaborative user-library-read"

    params = {
        "response_type": "code",
        "client_id": os.environ["SPOTIFY_CLIENT_ID"],
        "scope": scope,
        "redirect_uri": os.environ["SPOTIFY_REDIRECT_URI"],
        "state": state,
    }

    url = f"https://accounts.spotify.com/authorize?{requests.compat.urlencode(params)}"
    return Response(status_code=307, headers={"location": url})


@app.get("/auth/spotify/callback")
async def spotify_callback(
    code: str = Query(...), state: str = Query(...)
):

    spotify_oauth = SpotifyOAuth(
        client_id=os.environ["SPOTIFY_CLIENT_ID"],
        client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
        redirect_uri=os.environ["SPOTIFY_REDIRECT_URI"]
    )

    try:
        data = spotify_oauth.get_access_token(code)
        access_token = data["access_token"]
        refresh_token = data["refresh_token"]
        expires_in = data["expires_in"]
        return {"access_token": access_token, "refresh_token": refresh_token, "expires_in": expires_in}
    except SpotifyException as e:
        return Response(content=str(e), status_code=400)


@app.get("/auth/spotify/refresh")
async def spotify_refresh(
    refresh_token: str = Query(...),
):

    spotify_oauth = SpotifyOAuth(
        client_id=os.environ["SPOTIFY_CLIENT_ID"],
        client_secret=os.environ["SPOTIFY_CLIENT_SECRET"],
        redirect_uri=os.environ["SPOTIFY_REDIRECT_URI"]
    )

    try:
        data = spotify_oauth.refresh_access_token(refresh_token)
        access_token = data["access_token"]
        expires_in = data["expires_in"]
        return {"access_token": access_token, "expires_in": expires_in}
    except SpotifyException as e:
        return Response(content=str(e), status_code=400)
