require("dotenv").config();
const express = require("express");
const ytdl = require("ytdl-core");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const stream = require("stream");

const app = express();
const PORT = process.env.PORT || 3000;

// use env variables for API keys
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

const YOUTUBE_API_BASE_URL = process.env.YOUTUBE_API_BASE_URL;
const SPOTIFY_API_BASE_URL = process.env.SPOTIFY_API_BASE_URL;

console.log("YOUTUBE_API_KEY", YOUTUBE_API_KEY);
console.log("SPOTIFY_CLIENT_ID", SPOTIFY_CLIENT_ID);
console.log("SPOTIFY_CLIENT_SECRET", SPOTIFY_CLIENT_SECRET);
console.log("YOUTUBE_API_BASE_URL", YOUTUBE_API_BASE_URL);
console.log("SPOTIFY_API_BASE_URL", SPOTIFY_API_BASE_URL);

const getVideoInfo = async (videoId) => {
	// Make a request to the YouTube API to get the video information
	const response = await axios.get(`${YOUTUBE_API_BASE_URL}/videos`, {
		params: {
			key: YOUTUBE_API_KEY,
			id: videoId,
			part: "snippet",
		},
	});

	// Extract the video title and author from the response
	const videoTitle = response.data.items[0].snippet.title;
	const videoAuthor = response.data.items[0].snippet.channelTitle;

	return {
		title: videoTitle,
		author: videoAuthor,
	};
};

//
// GET http://localhost:3000/download/from-youtube-id?id=QK8mJJJvaes&bitrate=320
//
app.get("/download/from-youtube-id", async (req, res) => {
	// Get the video ID from the request query parameters
	const videoId = req.query.id;
	// convert bitrate to number
	const bitrate = req.query.bitrate ? Number(req.query.bitrate) : 128;

	// Validate the video ID
	if (!videoId) {
		return res.status(400).send({ error: "Missing id parameter" });
	}

	// Get the video information
	const { title, author } = await getVideoInfo(videoId);

	// Create a writable stream to pipe the audio to
	const audioStream = new stream.PassThrough();

	// Create a writable stream to hold the converted audio
	const convertedStream = new stream.PassThrough();

	// Check for errors during the audio conversion
	ffmpeg()
		.format("mp3")
		.audioCodec("libmp3lame")
		.audioBitrate(128)
		.audioChannels(2)
		.on("error", (err) => {
			console.log("An error occurred: " + err.message);
			res.status(500).send({ error: err.message });
		});

	// Pipe the YouTube video audio stream to ffmpeg for conversion
	const ytStream = ytdl(`https://www.youtube.com/watch?v=${videoId}`, {
		filter: "audioonly",
	}).on("error", (err) => {
		console.log("An error occurred: " + err.message);
		res.status(500).send({ error: err.message });
	});

	ffmpeg({ source: ytStream })
		.format("mp3")
		.audioCodec("libmp3lame")
		.audioBitrate(bitrate)
		.audioChannels(2)
		.on("error", (err) => {
			console.log("An error occurred: " + err.message);
			res.status(500).send({ error: err.message });
		})
		.pipe(convertedStream);

	// Pipe the converted audio stream to the audio stream
	convertedStream.pipe(audioStream);

	// Set the response content type to audio/mpeg
	res.set("Content-Type", "audio/mpeg");

	// Set the response header to suggest a file name for the download
	res.set(
		"Content-Disposition",
		`attachment; filename="${title} - ${author}.mp3"`
	);

	// Pipe the audio stream to the response object
	audioStream.pipe(res);
});

//
// GET http://localhost:3000/download/from-artist-title?artist=eminem&title=stan
//
app.get("/download/from-artist-title", (req, res) => {
	const artist = req.query.artist;
	const title = req.query.title;

	// find youtube video with artist and title
});

//
// GET http://localhost:3000/download/from-spotify-id?id=0eGsygTp906u18L0Oimnem
//
app.get("/download/from-spotify-id", (req, res) => {
	const spotifyId = req.query.id;

	// match ID to a youtube video
});

app.listen(PORT, () => console.log("Server listening to port " + PORT));
