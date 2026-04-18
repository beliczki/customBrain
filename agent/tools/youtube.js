import { getYouTube } from '../../server/drive-context.js';
import { fetchVideoSummary } from './youtube-gemini.js';

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
      video_summary: null,
    };

    // Fetch tags + category from video details
    try {
      const videoRes = await youtube.videos.list({ id: videoId, part: 'snippet' });
      const snip = videoRes.data.items?.[0]?.snippet;
      entry.tags = snip?.tags || [];
      entry.category_id = snip?.categoryId || null;
    } catch {}

    // Video summary via Gemini multimodal (watches the full video).
    // Skipped for filtered categories (cron layer filters before calling
    // this anyway, but belt-and-braces here too).
    try {
      entry.video_summary = await fetchVideoSummary(videoId);
    } catch (err) {
      console.warn(`Gemini summary failed for ${videoId}: ${err.message}`);
    }

    results.push(entry);
  }

  return results;
}
