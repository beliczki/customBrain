import { getYouTube } from '../../server/drive-context.js';
// The package has "type": "module" but its "main" entry is a CJS file —
// Node can't resolve the named export via the default path. Pin to the
// actual ESM build.
import { YoutubeTranscript } from 'youtube-transcript/dist/youtube-transcript.esm.js';

async function fetchTranscript(videoId) {
  try {
    // Try preferred languages in order — auto-generated falls back last.
    for (const lang of ['en', 'hu']) {
      try {
        const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang });
        if (segments?.length) {
          return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
        }
      } catch {
        /* try next lang */
      }
    }
    // Last resort: default (whatever YouTube returns, often auto-gen)
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    return segments?.length
      ? segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim()
      : null;
  } catch {
    return null;
  }
}

export async function getYoutubeLikes(sinceDate) {
  const youtube = getYouTube();

  // Get the "Likes" playlist ID
  const channelRes = await youtube.channels.list({
    mine: true,
    part: 'contentDetails',
  });
  const likesPlaylistId =
    channelRes.data.items?.[0]?.contentDetails?.relatedPlaylists?.likes;
  if (!likesPlaylistId) return [];

  // Fetch liked videos
  const itemsRes = await youtube.playlistItems.list({
    playlistId: likesPlaylistId,
    part: 'snippet',
    maxResults: 50,
  });

  const since = sinceDate ? new Date(sinceDate) : new Date(Date.now() - 86400000);
  const items = (itemsRes.data.items || []).filter(
    (item) => new Date(item.snippet.publishedAt) >= since
  );

  const results = [];
  for (const item of items) {
    const videoId = item.snippet.resourceId?.videoId;
    if (!videoId) continue;

    const entry = {
      video_id: videoId,
      title: item.snippet.title,
      channel: item.snippet.videoOwnerChannelTitle || '',
      description: item.snippet.description || '',
      published_at: item.snippet.publishedAt,
      tags: [],
      category_id: null,
      captions_text: null,
    };

    // Fetch tags + category from video details
    try {
      const videoRes = await youtube.videos.list({ id: videoId, part: 'snippet' });
      const snip = videoRes.data.items?.[0]?.snippet;
      entry.tags = snip?.tags || [];
      entry.category_id = snip?.categoryId || null;
    } catch {}

    // Fetch transcript from YouTube's open timedtext endpoint via
    // youtube-transcript (works for auto-generated captions on third-party
    // videos — unlike the official captions.download which requires channel
    // ownership).
    entry.captions_text = await fetchTranscript(videoId);

    results.push(entry);
  }

  return results;
}
