require("dotenv").config();
const express = require("express");
const ytdl = require("ytdl-core");
const axios = require("axios");
const ffmpeg = require("fluent-ffmpeg");
const stream = require("stream");
const SpotifyWebApi = require("spotify-web-api-node");

const app = express();
const PORT = process.env.PORT || 3000;

const YOUTUBE_API_BASE_URL = "https://www.googleapis.com/youtube/v3";

const DEFAULT_BITRATE = 128;

const YOUTUBE_API_HEADER = "x-youtube-api-key";
const SPOTIFY_CLIENT_ID_HEADER = "x-spotify-client-id";
const SPOTIFY_CLIENT_SECRET_HEADER = "x-spotify-client-secret";

const getVideoInfo = async (videoId, apiKey) => {
	// Make a request to the YouTube API to get the video information
	const response = await axios.get(`${YOUTUBE_API_BASE_URL}/videos`, {
		params: {
			key: apiKey,
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

const getVideoId = async (artist, title, apiKey) => {
	// Make a request to the YouTube API to get the video information
	const response = await axios.get(`${YOUTUBE_API_BASE_URL}/search`, {
		params: {
			key: apiKey,
			q: `${artist} ${title}`,
			part: "snippet",
			type: "video",
			maxResults: 1,
		},
	});

	// Extract the video title and author from the response
	const videoId = response.data.items[0].id.videoId;

	return videoId;
};

const getBitrateQuery = (query) =>
	query.bitrate ? Number(query.bitrate) : DEFAULT_BITRATE;

const getSpotifyCredentials = (headers) => {
	const clientId = headers[SPOTIFY_CLIENT_ID_HEADER];
	const clientSecret = headers[SPOTIFY_CLIENT_SECRET_HEADER];

	return {
		clientId,
		clientSecret,
	};
};

const getYoutubeApiKey = (headers) => {
	const apiKey = headers[YOUTUBE_API_HEADER];

	return apiKey;
};

const downloadAudioFromYoutubeId =
	(videoId, bitrate, apiKey) => async (req, res) => {
		// Validate the video ID
		if (!videoId) {
			return res.status(400).send({ error: "Missing id parameter" });
		}

		if (!bitrate) {
			bitrate = DEFAULT_BITRATE;
		}

		// Get the video information
		const { title, author } = await getVideoInfo(videoId, apiKey);

		// Create a writable stream to pipe the audio to
		const audioStream = new stream.PassThrough();

		// Create a writable stream to hold the converted audio
		const convertedStream = new stream.PassThrough();

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
	};

const findArtistAndTitleFromSpotifyTrackId = (trackId, spotifyApi) =>
	spotifyApi
		.clientCredentialsGrant()
		.then((data) => {
			// Save the access token so that it's used in future calls
			spotifyApi.setAccessToken(data.body["access_token"]);
			return spotifyApi.getTrack(trackId);
		})
		.then((data) => {
			const artists = data.body.artists.map((artist) => artist.name).join(", ");
			const title = data.body.name;

			return {
				artist: artists,
				title: title,
			};
		})
		.catch((err) => {
			console.log("Something went wrong!", err);
		});

//
// GET http://localhost:3000/download/from-youtube-id?id=QK8mJJJvaes&bitrate=320
//
app.get("/download/from-youtube-id", async (req, res) => {
	const videoId = req.query.id;
	const bitrate = getBitrateQuery(req.query);
	const apiKey = getYoutubeApiKey(req.headers);

	console.log("YouTube API Key", apiKey);

	if (!apiKey) {
		return res
			.status(400)
			.send({ error: `Missing ${YOUTUBE_API_HEADER} header` });
	}

	await downloadAudioFromYoutubeId(videoId, bitrate, apiKey)(req, res);
});

//
// GET http://localhost:3000/download/from-artist-title?artist=eminem&title=stan
//
app.get("/download/from-artist-title", async (req, res) => {
	const artist = req.query.artist;
	const title = req.query.title;
	const bitrate = getBitrateQuery(req.query);

	console.log("artist", artist);
	console.log("title", title);
	console.log("bitrate", bitrate);

	const apiKey = getYoutubeApiKey(req.headers);

	console.log("YouTube API Key", apiKey);

	if (!apiKey) {
		return res
			.status(400)
			.send({ error: `Missing ${YOUTUBE_API_HEADER} header` });
	}

	// find youtube video with artist and title
	const videoId = await getVideoId(artist, title, apiKey);

	console.log("videoId", videoId);

	// run the download function
	await downloadAudioFromYoutubeId(videoId, bitrate, apiKey)(req, res);
});

//
// GET http://localhost:3000/download/from-spotify-id?id=0eGsygTp906u18L0Oimnem
//
app.get("/download/from-spotify-id", async (req, res) => {
	const trackId = req.query.id;
	const bitrate = getBitrateQuery(req.query);
	const { clientId, clientSecret } = getSpotifyCredentials(req.headers);
	const ytApiKey = getYoutubeApiKey(req.headers);

	if (!clientId) {
		return res
			.status(400)
			.send({ error: `Missing ${SPOTIFY_CLIENT_ID_HEADER} header` });
	}

	if (!clientSecret) {
		return res
			.status(400)
			.send({ error: `Missing ${SPOTIFY_CLIENT_SECRET_HEADER} header` });
	}

	if (!ytApiKey) {
		return res
			.status(400)
			.send({ error: `Missing ${YOUTUBE_API_HEADER} header` });
	}

	console.log("Spotify Client ID", clientId);
	console.log("Spotify Client Secret", clientSecret);
	console.log("YouTube API Key", ytApiKey);

	const spotifyApi = new SpotifyWebApi({
		clientId: clientId,
		clientSecret: clientSecret,
	});

	// match ID to youtube video
	const { artist, title } = await findArtistAndTitleFromSpotifyTrackId(
		trackId,
		spotifyApi
	);

	console.log("artist", artist);
	console.log("title", title);

	// find youtube video with artist and title
	const videoId = await getVideoId(artist, title, ytApiKey);

	console.log("videoId", videoId);

	// run the download function
	await downloadAudioFromYoutubeId(videoId, bitrate, ytApiKey)(req, res);
});

app.listen(PORT, () => console.log("Server listening to port " + PORT));
