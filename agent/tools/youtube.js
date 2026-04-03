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
      captions_text: null,
    };

    // Fetch tags from video details
    try {
      const videoRes = await youtube.videos.list({ id: videoId, part: 'snippet' });
      entry.tags = videoRes.data.items?.[0]?.snippet?.tags || [];
    } catch {}

    // Try to fetch captions
    try {
      const capsRes = await youtube.captions.list({ videoId, part: 'snippet' });
      const cap = capsRes.data.items?.find(
        (c) => c.snippet.language === 'en' || c.snippet.trackKind === 'ASR'
      );
      if (cap) {
        const dlRes = await youtube.captions.download({ id: cap.id, tfmt: 'srt' });
        entry.captions_text = typeof dlRes.data === 'string'
          ? dlRes.data.replace(/\d+\n[\d:,\s->]+\n/g, '').trim()
          : null;
      }
    } catch {}

    results.push(entry);
  }

  return results;
}
