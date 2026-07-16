// Seed script — populates the database with the admin user + realistic mock data.
// Usage: pnpm --filter @workspace/scripts run db:seed
import "dotenv/config";
import { db, sqlite } from "@workspace/db";
import {
  usersTable,
  appStateTable,
  requestConfigTable,
  trackedUsersTable,
  automationJobsTable,
  requestRunLogTable,
  likedMediaTable,
} from "@workspace/db/schema";
import bcrypt from "bcryptjs";

const now = new Date();
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

async function main() {
  console.log("🌱  Seeding database…");

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("admin123", 10);
  db.insert(usersTable)
    .values({ username: "admin", passwordHash })
    .onConflictDoNothing()
    .run();
  console.log("  ✓ admin user");

  // ── 2. app_state ───────────────────────────────────────────────────────────
  db.insert(appStateTable)
    .values({ id: 1, monitoringEnabled: false })
    .onConflictDoNothing()
    .run();
  console.log("  ✓ app_state");

  // ── 3. request_config ──────────────────────────────────────────────────────
  db.insert(requestConfigTable)
    .values({ id: 1, targetUrl: null, headers: {}, cookies: {} })
    .onConflictDoNothing()
    .run();
  console.log("  ✓ request_config");

  // ── 4. Tracked users (mock Instagram profiles) ─────────────────────────────
  const trackedUsers = [
    // followers
    { username: "zeynep.yilmaz",     fullName: "Zeynep Yılmaz",     avatarUrl: "https://i.pravatar.cc/150?u=zeynep", category: "follower"   as const, addedAt: daysAgo(30), lastInteractionAt: daysAgo(2),  interactionCount: 14, autoLikeEnabled: true  },
    { username: "ahmet.kaya.34",     fullName: "Ahmet Kaya",         avatarUrl: "https://i.pravatar.cc/150?u=ahmet",  category: "follower"   as const, addedAt: daysAgo(25), lastInteractionAt: daysAgo(5),  interactionCount: 8,  autoLikeEnabled: false },
    { username: "elif_demir",        fullName: "Elif Demir",         avatarUrl: "https://i.pravatar.cc/150?u=elif",   category: "follower"   as const, addedAt: daysAgo(20), lastInteractionAt: daysAgo(1),  interactionCount: 22, autoLikeEnabled: true  },
    { username: "murat.ozturk",      fullName: "Murat Öztürk",       avatarUrl: "https://i.pravatar.cc/150?u=murat",  category: "follower"   as const, addedAt: daysAgo(18), lastInteractionAt: daysAgo(7),  interactionCount: 3,  autoLikeEnabled: false },
    { username: "selin.arslan_",     fullName: "Selin Arslan",       avatarUrl: "https://i.pravatar.cc/150?u=selin",  category: "follower"   as const, addedAt: daysAgo(15), lastInteractionAt: null,          interactionCount: 0,  autoLikeEnabled: false },
    { username: "burak.celik07",     fullName: "Burak Çelik",        avatarUrl: "https://i.pravatar.cc/150?u=burak",  category: "follower"   as const, addedAt: daysAgo(10), lastInteractionAt: daysAgo(3),  interactionCount: 6,  autoLikeEnabled: true  },
    // liked_post
    { username: "instagram.tr",      fullName: "Instagram Türkiye",  avatarUrl: "https://i.pravatar.cc/150?u=igtr",   category: "liked_post" as const, addedAt: daysAgo(12), lastInteractionAt: daysAgo(12), interactionCount: 1,  autoLikeEnabled: false },
    { username: "fatma.sahin_photo", fullName: "Fatma Şahin",        avatarUrl: "https://i.pravatar.cc/150?u=fatma",  category: "liked_post" as const, addedAt: daysAgo(9),  lastInteractionAt: daysAgo(9),  interactionCount: 1,  autoLikeEnabled: true  },
    { username: "can.uysal",         fullName: "Can Uysal",          avatarUrl: "https://i.pravatar.cc/150?u=can",    category: "liked_post" as const, addedAt: daysAgo(6),  lastInteractionAt: daysAgo(6),  interactionCount: 2,  autoLikeEnabled: false },
    // liked_story
    { username: "merve.koc_",        fullName: "Merve Koç",          avatarUrl: "https://i.pravatar.cc/150?u=merve",  category: "liked_story" as const, addedAt: daysAgo(4),  lastInteractionAt: daysAgo(4),  interactionCount: 1,  autoLikeEnabled: false },
    { username: "omer.polat",        fullName: "Ömer Polat",         avatarUrl: "https://i.pravatar.cc/150?u=omer",   category: "liked_story" as const, addedAt: daysAgo(2),  lastInteractionAt: daysAgo(2),  interactionCount: 1,  autoLikeEnabled: true  },
    // liked_reel
    { username: "kerem.videos",      fullName: "Kerem Yıldız",       avatarUrl: "https://i.pravatar.cc/150?u=kerem",  category: "liked_reel" as const, addedAt: daysAgo(14), lastInteractionAt: daysAgo(14), interactionCount: 1,  autoLikeEnabled: false },
    { username: "dilan.reels_",      fullName: "Dilan Çetin",        avatarUrl: "https://i.pravatar.cc/150?u=dilan",  category: "liked_reel" as const, addedAt: daysAgo(10), lastInteractionAt: daysAgo(10), interactionCount: 2,  autoLikeEnabled: true  },
    { username: "berk.content",      fullName: "Berk Aydın",         avatarUrl: "https://i.pravatar.cc/150?u=berk",   category: "liked_reel" as const, addedAt: daysAgo(7),  lastInteractionAt: daysAgo(7),  interactionCount: 1,  autoLikeEnabled: false },
    { username: "nazli.clips",       fullName: "Nazlı Şen",          avatarUrl: "https://i.pravatar.cc/150?u=nazli",  category: "liked_reel" as const, addedAt: daysAgo(3),  lastInteractionAt: daysAgo(3),  interactionCount: 3,  autoLikeEnabled: true  },
    { username: "ugur.studio",       fullName: "Uğur Demirci",       avatarUrl: "https://i.pravatar.cc/150?u=ugur",   category: "liked_reel" as const, addedAt: daysAgo(1),  lastInteractionAt: daysAgo(1),  interactionCount: 1,  autoLikeEnabled: false },
  ];

  for (const u of trackedUsers) {
    db.insert(trackedUsersTable).values(u).onConflictDoNothing().run();
  }
  console.log(`  ✓ ${trackedUsers.length} tracked users`);

  // ── 5. Automation jobs ─────────────────────────────────────────────────────
  const automationJobs = [
    { targetUsername: "zeynep.yilmaz",     actionType: "like"       as const, frequencyMinutes: 60,   randomizeDelay: true,  status: "active" as const, nextRunAt: daysAgo(-1)  },
    { targetUsername: "elif_demir",         actionType: "like"       as const, frequencyMinutes: 120,  randomizeDelay: true,  status: "active" as const, nextRunAt: daysAgo(-2)  },
    { targetUsername: "burak.celik07",      actionType: "view_story" as const, frequencyMinutes: 1440, randomizeDelay: false, status: "paused" as const, nextRunAt: daysAgo(-1)  },
    { targetUsername: "fatma.sahin_photo",  actionType: "like"       as const, frequencyMinutes: 30,   randomizeDelay: true,  status: "paused" as const, nextRunAt: daysAgo(0)   },
    { targetUsername: "omer.polat",         actionType: "follow"     as const, frequencyMinutes: 720,  randomizeDelay: true,  status: "failed" as const, nextRunAt: daysAgo(1)   },
  ];

  for (const j of automationJobs) {
    db.insert(automationJobsTable).values(j).run();
  }
  console.log(`  ✓ ${automationJobs.length} automation jobs`);

  // ── 6. Request run log samples ─────────────────────────────────────────────
  const logs = [
    { success: true,  status: 200, statusText: "OK",         errorMessage: null,                  ranAt: daysAgo(3)   },
    { success: true,  status: 200, statusText: "OK",         errorMessage: null,                  ranAt: daysAgo(2)   },
    { success: false, status: 429, statusText: "Too Many",   errorMessage: "Rate limit exceeded", ranAt: daysAgo(1)   },
    { success: true,  status: 200, statusText: "OK",         errorMessage: null,                  ranAt: daysAgo(0.5) },
  ];
  for (const l of logs) {
    db.insert(requestRunLogTable).values(l).run();
  }
  console.log(`  ✓ ${logs.length} request run log entries`);

  // ── 7. Liked media ─────────────────────────────────────────────────────────
  type MediaSpec = { mediaType: "post" | "reel"; externalId: string; thumbnailUrl: string; caption: string | null; likedAtDaysAgo: number; hasLiked: boolean };
  const mediaByUser: Record<string, MediaSpec[]> = {
    "instagram.tr": [
      { mediaType: "post", externalId: "ig_post_001", thumbnailUrl: "https://picsum.photos/seed/ig1/400/400",     caption: "Instagram'ın yeni özelliklerini keşfedin! 🚀",  likedAtDaysAgo: 12, hasLiked: true  },
      { mediaType: "post", externalId: "ig_post_002", thumbnailUrl: "https://picsum.photos/seed/ig2/400/400",     caption: "Hikayelerinizi daha eğlenceli hale getirin ✨", likedAtDaysAgo: 11, hasLiked: true  },
      { mediaType: "post", externalId: "ig_post_003", thumbnailUrl: "https://picsum.photos/seed/ig3/400/400",     caption: null,                                             likedAtDaysAgo: 10, hasLiked: false },
    ],
    "fatma.sahin_photo": [
      { mediaType: "post", externalId: "fs_post_001", thumbnailUrl: "https://picsum.photos/seed/fatma1/400/400", caption: "Bugün çektiğim kareler 📸 #fotoğrafçılık",       likedAtDaysAgo: 9,  hasLiked: true  },
      { mediaType: "post", externalId: "fs_post_002", thumbnailUrl: "https://picsum.photos/seed/fatma2/400/400", caption: "Doğanın renkleri 🌿",                            likedAtDaysAgo: 8,  hasLiked: true  },
      { mediaType: "post", externalId: "fs_post_003", thumbnailUrl: "https://picsum.photos/seed/fatma3/400/400", caption: "Altın saat ışığı 🌅",                            likedAtDaysAgo: 7,  hasLiked: true  },
    ],
    "can.uysal": [
      { mediaType: "post", externalId: "cu_post_001", thumbnailUrl: "https://picsum.photos/seed/can1/400/400",   caption: "Yeni proje çalışmalarım devam ediyor 💪",        likedAtDaysAgo: 6,  hasLiked: true  },
      { mediaType: "post", externalId: "cu_post_002", thumbnailUrl: "https://picsum.photos/seed/can2/400/400",   caption: null,                                             likedAtDaysAgo: 5,  hasLiked: false },
    ],
    "kerem.videos": [
      { mediaType: "reel", externalId: "kv_reel_001", thumbnailUrl: "https://picsum.photos/seed/kerem1/400/400", caption: "Bu anı kaçırmayın 🎬 #reels #trending",          likedAtDaysAgo: 14, hasLiked: true  },
      { mediaType: "reel", externalId: "kv_reel_002", thumbnailUrl: "https://picsum.photos/seed/kerem2/400/400", caption: "Şehrin gece hali 🌙",                            likedAtDaysAgo: 13, hasLiked: true  },
    ],
    "dilan.reels_": [
      { mediaType: "reel", externalId: "dr_reel_001", thumbnailUrl: "https://picsum.photos/seed/dilan1/400/400", caption: "Günlük rutinlerim ☀️ #lifestyle",               likedAtDaysAgo: 10, hasLiked: true  },
      { mediaType: "reel", externalId: "dr_reel_002", thumbnailUrl: "https://picsum.photos/seed/dilan2/400/400", caption: "Kahve saati ☕",                                 likedAtDaysAgo: 9,  hasLiked: true  },
      { mediaType: "reel", externalId: "dr_reel_003", thumbnailUrl: "https://picsum.photos/seed/dilan3/400/400", caption: null,                                             likedAtDaysAgo: 8,  hasLiked: false },
    ],
    "berk.content": [
      { mediaType: "reel", externalId: "bc_reel_001", thumbnailUrl: "https://picsum.photos/seed/berk1/400/400",  caption: "İçerik üretiminin sırları 🎯",                   likedAtDaysAgo: 7,  hasLiked: true  },
    ],
    "nazli.clips": [
      { mediaType: "reel", externalId: "nc_reel_001", thumbnailUrl: "https://picsum.photos/seed/nazli1/400/400", caption: "Gün batımı videosu 🌇 #video",                  likedAtDaysAgo: 3,  hasLiked: true  },
      { mediaType: "reel", externalId: "nc_reel_002", thumbnailUrl: "https://picsum.photos/seed/nazli2/400/400", caption: "Sabah yürüyüşü 🏃‍♀️",                            likedAtDaysAgo: 2,  hasLiked: true  },
      { mediaType: "reel", externalId: "nc_reel_003", thumbnailUrl: "https://picsum.photos/seed/nazli3/400/400", caption: "Dans videosu 💃",                               likedAtDaysAgo: 1,  hasLiked: true  },
    ],
    "ugur.studio": [
      { mediaType: "reel", externalId: "us_reel_001", thumbnailUrl: "https://picsum.photos/seed/ugur1/400/400",  caption: "Stüdyo günlüğü 🎥",                             likedAtDaysAgo: 1,  hasLiked: true  },
    ],
  };

  let mediaCount = 0;
  const findUser = sqlite.prepare("SELECT id FROM tracked_users WHERE username = ?");
  for (const [username, mediaRows] of Object.entries(mediaByUser)) {
    const user = findUser.get(username) as { id: number } | undefined;
    if (!user) continue;

    for (const m of mediaRows) {
      db.insert(likedMediaTable)
        .values({
          trackedUserId: user.id,
          mediaType: m.mediaType,
          externalId: m.externalId,
          thumbnailUrl: m.thumbnailUrl,
          caption: m.caption,
          likedAt: daysAgo(m.likedAtDaysAgo),
          hasLiked: m.hasLiked,
        })
        .onConflictDoNothing()
        .run();
      mediaCount++;
    }
  }
  console.log(`  ✓ ${mediaCount} liked media items`);

  console.log("\n✅  Seed complete. Login: admin / admin123");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
