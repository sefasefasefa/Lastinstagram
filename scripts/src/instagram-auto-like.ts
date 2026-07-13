import { InstagramClient } from "@workspace/instagram-client";
import { schedule } from "node-cron";
import { loadConfig } from "./config";

async function autoLike() {
  console.log("Starting auto-like job...");
  const config = loadConfig();

  if (!config.instagramUsername || (!config.instagramPassword && !config.instagramSessionCookie)) {
    console.log("Instagram credentials not set in config. Exiting.");
    return;
  }

  const TARGET_USERS = config.targetUsers.split(",").map((u: string) => u.trim()).filter(Boolean);
  if (TARGET_USERS.length === 0) {
    console.log("No target users specified in config. Exiting.");
    return;
  }

  const client = new InstagramClient({
    instagramUsername: config.instagramUsername,
    instagramPassword: config.instagramPassword,
    instagramSessionCookie: config.instagramSessionCookie,
    userAgent: config.userAgent,

    proxyUrl: config.proxyUrl,
    useProxy: config.useProxy,
  });

  try {
    await client.login();

    for (const username of TARGET_USERS) {
      console.log(`Processing user: ${username}`);
      const posts = await client.getUserPosts(username, config.maxLikesPerRun * 2);
      let likedCount = 0;

      for (const post of posts) {
        if (!post.hasLiked && likedCount < config.maxLikesPerRun) {
          console.log(`Liking post ${post.id} from ${username}`);
          const success = await client.likePost(post.id);
          if (success) {
            likedCount++;
          }
        }
      }
      console.log(`Liked ${likedCount} posts for user ${username}`);
    }
  } catch (error) {
    console.error("Auto-like job failed:", error);
  }
}

const scriptConfig = loadConfig();
schedule(`*/${scriptConfig.likeIntervalMinutes} * * * *`, autoLike);

console.log(`Auto-like job scheduled to run every ${scriptConfig.likeIntervalMinutes} minutes.`);
