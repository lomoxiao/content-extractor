import { YoutubeTranscript } from "youtube-transcript";
import axios from "axios";
import type { ExtractInput, ExtractedContent, ExtractorOptions } from "../types.js";
import { httpTimeout } from "../utils/http.js";

function extractVideoId(url: string): string {
  const match = url.match(/(?:v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  if (!match) throw new Error(`Cannot extract YouTube video ID from: ${url}`);
  return match[1];
}

async function fetchYoutubeMetadata(
  videoId: string,
  options: ExtractorOptions
): Promise<Record<string, string>> {
  if (!options.youtubeApiKey) {
    return { videoId, title: "", channelTitle: "", description: "" };
  }

  const res = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
    params: { id: videoId, part: "snippet", key: options.youtubeApiKey },
    timeout: Math.min(httpTimeout(options), 10000)
  });
  const snippet =
    (res.data as { items: Array<{ snippet: Record<string, string> }> }).items?.[0]?.snippet ?? {};
  return {
    videoId,
    title: snippet.title ?? "",
    channelTitle: snippet.channelTitle ?? "",
    description: snippet.description ?? ""
  };
}

async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const transcript = await YoutubeTranscript.fetchTranscript(videoId);
    return transcript.map((t) => t.text).join(" ");
  } catch {
    return "(字幕なし)";
  }
}

export async function fetchYoutubeVideo(
  input: ExtractInput,
  options: ExtractorOptions = {}
): Promise<ExtractedContent> {
  const videoId = extractVideoId(input.url);
  const [meta, transcript] = await Promise.all([
    fetchYoutubeMetadata(videoId, options),
    fetchTranscript(videoId)
  ]);

  const title = meta.title || input.hints?.title || input.url;

  const markdown = [
    `# ${title}`,
    `- **チャンネル**: ${meta.channelTitle}`,
    `- **URL**: ${input.url}`,
    "",
    "## 説明",
    meta.description,
    "",
    "## トランスクリプト",
    transcript
  ].join("\n");

  return {
    url: input.url,
    sourceType: "youtube",
    title,
    markdown,
    references: [],
    assets: [],
    metadata: {
      videoId,
      channelTitle: meta.channelTitle,
      description: meta.description
    }
  };
}
