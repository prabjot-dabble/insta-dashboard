// Local archive of story insights. Meta only exposes a story (and its insights) for 24 hours, so
// every time the dashboard loads stories it saves the latest numbers here; expired stories then
// stay visible as history. Free: a JSON file on disk, no database or paid service.
//
// Limits, by design:
// - Only stories that were live while someone had the dashboard open get archived, and each keeps
//   the last numbers seen (close to final if the dashboard was opened late in the story's day).
// - On hosts with a read-only or temporary filesystem (most serverless platforms) writes fail
//   silently and history simply stays empty — the dashboard never errors because of this file.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const ARCHIVE_DIR = path.join(process.cwd(), ".data");
const ARCHIVE_FILE = path.join(ARCHIVE_DIR, "story-history.json");
const KEEP_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface ArchivedStory {
  id: string;
  timestamp: string;
  permalink: string | null;
  views: number | null;
  reach: number | null;
  replies: number | null;
  follows: number | null;
  profileVisits: number | null;
  navigation: number | null;
  taps: { forward: number; back: number; exit: number; nextStory: number } | null;
  /** When the dashboard last refreshed this story's numbers. */
  lastSeenAt: string;
}

async function readArchive(): Promise<Record<string, ArchivedStory>> {
  try {
    const parsed = JSON.parse(await readFile(ARCHIVE_FILE, "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** Merges the latest live stories into the archive. Never throws. */
export async function archiveStories(stories: Omit<ArchivedStory, "lastSeenAt">[]): Promise<void> {
  if (stories.length === 0) return;
  try {
    const archive = await readArchive();
    const now = new Date().toISOString();
    for (const story of stories) archive[story.id] = { ...story, lastSeenAt: now };
    const cutoff = Date.now() - KEEP_DAYS * DAY_MS;
    for (const [id, story] of Object.entries(archive)) {
      if (Date.parse(story.timestamp) < cutoff) delete archive[id];
    }
    await mkdir(ARCHIVE_DIR, { recursive: true });
    await writeFile(ARCHIVE_FILE, JSON.stringify(archive));
  } catch {
    // Read-only or temporary filesystem: skip archiving rather than break the Stories section.
  }
}

/** Archived stories from the last `days` days, newest first, excluding ids still live. */
export async function readStoryHistory(excludeIds: ReadonlySet<string>, days = 30): Promise<ArchivedStory[]> {
  const cutoff = Date.now() - days * DAY_MS;
  return Object.values(await readArchive())
    .filter((s) => !excludeIds.has(s.id) && Date.parse(s.timestamp) >= cutoff)
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}
