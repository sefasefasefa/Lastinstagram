import "dotenv/config";
import cron from "node-cron";
import { InstagramClient } from "@workspace/instagram-client";

const configuredTargetUsername = process.env.TARGET_USERNAME?.trim();
const cronSchedule = process.env.CRON_SCHEDULE?.trim() || "0 */6 * * *";

if (!configuredTargetUsername) {
  throw new Error("TARGET_USERNAME must be set");
}

const targetUsername: string = configuredTargetUsername;

if (!cron.validate(cronSchedule)) {
  throw new Error(`Invalid CRON_SCHEDULE: ${cronSchedule}`);
}

const client = new InstagramClient({
  username: process.env.INSTAGRAM_USERNAME ?? "",
  password: process.env.INSTAGRAM_PASSWORD,
  sessionCookie: process.env.INSTAGRAM_SESSION_COOKIE,
});

let running = false;

async function autoLike(): Promise<void> {
  if (running) {
    console.warn("Previous Instagram auto-like run is still active; skipping.");
    return;
  }

  running = true;
  try {
    const posts = await client.getUserPosts(targetUsername, 1);
    if (posts[0] && !posts[0].hasLiked) {
      const liked = await client.likePost(posts[0].id);
      console.log(liked ? `Liked post ${posts[0].id}` : `Could not like post ${posts[0].id}`);
    }

    const stories = await client.getUserStories(targetUsername);
    for (const story of stories) {
      const liked = await client.likeStory(story.id);
      console.log(liked ? `Liked story ${story.id}` : `Could not like story ${story.id}`);
    }
  } catch (error) {
    console.error("Instagram auto-like run failed:", error);
  } finally {
    running = false;
  }
}

console.log(`Instagram auto-like scheduler started with: ${cronSchedule}`);
cron.schedule(cronSchedule, autoLike);
void autoLike();

async function shutdown(): Promise<void> {
  try {
    await client.logout();
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
