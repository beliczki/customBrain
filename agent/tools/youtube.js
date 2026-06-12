import { getYouTube } from '../../server/drive-context.js';

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

  // snippet.publishedAt on a playlistItem is the date the video was ADDED to
  // the playlist (i.e. when it was liked), NOT the video's publish date. When a
  // sinceDate is given (MCP get_youtube_likes tool) we filter by like-date;
  // when omitted (the intake cron) we process the whole playlist and let
  // source_id dedup skip already-captured videos.
  const since = sinceDate ? new Date(sinceDate) : null;
  const items = (itemsRes.data.items || []).filter(
    (item) => !since || new Date(item.snippet.publishedAt) >= since
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
      video_summary: null, // filled in by caller if wanted — Gemini call is expensive
    };

    // Fetch tags + category from video details
    try {
      const videoRes = await youtube.videos.list({ id: videoId, part: 'snippet' });
      const snip = videoRes.data.items?.[0]?.snippet;
      entry.tags = snip?.tags || [];
      entry.category_id = snip?.categoryId || null;
    } catch {}

    results.push(entry);
  }

  return results;
}
