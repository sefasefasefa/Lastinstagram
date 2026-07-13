// Seed script — populates the database with the admin user + realistic mock data.
// Usage: pnpm --filter @workspace/scripts run db:seed
import "dotenv/config";
import { pool } from "@workspace/db";

type MediaRow = {
  username: string;
  mediaType: "post" | "reel";
  externalId: string;
  thumbnailUrl: string;
  caption: string;
  likedAtDaysAgo: number;
  hasLiked: boolean;
};
async function main() {
  const anyPool = pool as unknown as {
    exec?: (sql: string) => Promise<unknown>;
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
  };

  const q = async (sql: string, params?: unknown[]) =>
    anyPool.query(sql, params);

  console.log("🌱  Seeding database…");

  // ── 1. Admin user ──────────────────────────────────────────────────────────
  // bcrypt hash of "admin123" (cost 10) — pre-computed to avoid a bcryptjs dependency here.
  const passwordHash = "$2b$10$D9iBCSa3hRIqTcHcWlitqusZbT4QvfS0HVtjZ7S0FGZrzjKbOpDQe";
  await q(`
    INSERT INTO users (username, password_hash)
    VALUES ('admin', $1)
    ON CONFLICT (username) DO NOTHING
  `, [passwordHash]);
  console.log("  ✓ admin user");

  // ── 2. app_state ───────────────────────────────────────────────────────────
  await q(`
    INSERT INTO app_state (id, monitoring_enabled)
    VALUES (1, false)
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("  ✓ app_state");

  // ── 3. request_config ──────────────────────────────────────────────────────
  await q(`
    INSERT INTO request_config (id, target_url, headers, cookies)
    VALUES (1, NULL, '{}', '{}')
    ON CONFLICT (id) DO NOTHING
  `);
  console.log("  ✓ request_config");

  // ── 4. Tracked users (mock Instagram profiles) ─────────────────────────────
  const now = new Date();
  const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

  const trackedUsers = [
    // followers
    { username: "zeynep.yilmaz", fullName: "Zeynep Yılmaz", avatarUrl: "https://i.pravatar.cc/150?u=zeynep", category: "follower", addedAt: daysAgo(30), lastInteraction: daysAgo(2), interactionCount: 14, autoLike: true },
    { username: "ahmet.kaya.34", fullName: "Ahmet Kaya", avatarUrl: "https://i.pravatar.cc/150?u=ahmet", category: "follower", addedAt: daysAgo(25), lastInteraction: daysAgo(5), interactionCount: 8, autoLike: false },
    { username: "elif_demir", fullName: "Elif Demir", avatarUrl: "https://i.pravatar.cc/150?u=elif", category: "follower", addedAt: daysAgo(20), lastInteraction: daysAgo(1), interactionCount: 22, autoLike: true },
    { username: "murat.ozturk", fullName: "Murat Öztürk", avatarUrl: "https://i.pravatar.cc/150?u=murat", category: "follower", addedAt: daysAgo(18), lastInteraction: daysAgo(7), interactionCount: 3, autoLike: false },
    { username: "selin.arslan_", fullName: "Selin Arslan", avatarUrl: "https://i.pravatar.cc/150?u=selin", category: "follower", addedAt: daysAgo(15), lastInteraction: null, interactionCount: 0, autoLike: false },
    { username: "burak.celik07", fullName: "Burak Çelik", avatarUrl: "https://i.pravatar.cc/150?u=burak", category: "follower", addedAt: daysAgo(10), lastInteraction: daysAgo(3), interactionCount: 6, autoLike: true },
    // liked_post
    { username: "instagram.tr", fullName: "Instagram Türkiye", avatarUrl: "https://i.pravatar.cc/150?u=igtr", category: "liked_post", addedAt: daysAgo(12), lastInteraction: daysAgo(12), interactionCount: 1, autoLike: false },
    { username: "fatma.sahin_photo", fullName: "Fatma Şahin", avatarUrl: "https://i.pravatar.cc/150?u=fatma", category: "liked_post", addedAt: daysAgo(9), lastInteraction: daysAgo(9), interactionCount: 1, autoLike: true },
    { username: "can.uysal", fullName: "Can Uysal", avatarUrl: "https://i.pravatar.cc/150?u=can", category: "liked_post", addedAt: daysAgo(6), lastInteraction: daysAgo(6), interactionCount: 2, autoLike: false },
    // liked_story
    { username: "merve.koc_", fullName: "Merve Koç", avatarUrl: "https://i.pravatar.cc/150?u=merve", category: "liked_story", addedAt: daysAgo(4), lastInteraction: daysAgo(4), interactionCount: 1, autoLike: false },
    { username: "omer.polat", fullName: "Ömer Polat", avatarUrl: "https://i.pravatar.cc/150?u=omer", category: "liked_story", addedAt: daysAgo(2), lastInteraction: daysAgo(2), interactionCount: 1, autoLike: true },
    // liked_reel
    { username: "kerem.videos", fullName: "Kerem Yıldız", avatarUrl: "https://i.pravatar.cc/150?u=kerem", category: "liked_reel", addedAt: daysAgo(14), lastInteraction: daysAgo(14), interactionCount: 1, autoLike: false },
    { username: "dilan.reels_", fullName: "Dilan Çetin", avatarUrl: "https://i.pravatar.cc/150?u=dilan", category: "liked_reel", addedAt: daysAgo(10), lastInteraction: daysAgo(10), interactionCount: 2, autoLike: true },
    { username: "berk.content", fullName: "Berk Aydın", avatarUrl: "https://i.pravatar.cc/150?u=berk", category: "liked_reel", addedAt: daysAgo(7), lastInteraction: daysAgo(7), interactionCount: 1, autoLike: false },
    { username: "nazli.clips", fullName: "Nazlı Şen", avatarUrl: "https://i.pravatar.cc/150?u=nazli", category: "liked_reel", addedAt: daysAgo(3), lastInteraction: daysAgo(3), interactionCount: 3, autoLike: true },
    { username: "ugur.studio", fullName: "Uğur Demirci", avatarUrl: "https://i.pravatar.cc/150?u=ugur", category: "liked_reel", addedAt: daysAgo(1), lastInteraction: daysAgo(1), interactionCount: 1, autoLike: false },
  ];

  for (const u of trackedUsers) {
    await q(`
      INSERT INTO tracked_users
        (username, full_name, avatar_url, category, added_at,
         last_interaction_at, interaction_count, auto_like_enabled)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT DO NOTHING
    `, [
      u.username, u.fullName, u.avatarUrl, u.category,
      u.addedAt, u.lastInteraction, u.interactionCount, u.autoLike,
    ]);
  }
  console.log(`  ✓ ${trackedUsers.length} tracked users`);

  // ── 5. Automation jobs ─────────────────────────────────────────────────────
  const automationJobs = [
    { targetUsername: "zeynep.yilmaz", actionType: "like", frequencyMinutes: 60, randomizeDelay: true, status: "active", nextRunAt: daysAgo(-1) },
    { targetUsername: "elif_demir", actionType: "like", frequencyMinutes: 120, randomizeDelay: true, status: "active", nextRunAt: daysAgo(-2) },
    { targetUsername: "burak.celik07", actionType: "view_story", frequencyMinutes: 1440, randomizeDelay: false, status: "paused", nextRunAt: daysAgo(-1) },
    { targetUsername: "fatma.sahin_photo", actionType: "like", frequencyMinutes: 30, randomizeDelay: true, status: "paused", nextRunAt: daysAgo(0) },
    { targetUsername: "omer.polat", actionType: "follow", frequencyMinutes: 720, randomizeDelay: true, status: "failed", nextRunAt: daysAgo(1) },
  ];

  for (const j of automationJobs) {
    await q(`
      INSERT INTO automation_jobs
        (target_username, action_type, frequency_minutes, randomize_delay, status, next_run_at)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [j.targetUsername, j.actionType, j.frequencyMinutes, j.randomizeDelay, j.status, j.nextRunAt]);
  }
  console.log(`  ✓ ${automationJobs.length} automation jobs`);

  // ── 6. Request run log samples ─────────────────────────────────────────────
  const logs = [
    { success: true,  status: 200, statusText: "OK",       error: null,                    ranAt: daysAgo(3) },
    { success: true,  status: 200, statusText: "OK",       error: null,                    ranAt: daysAgo(2) },
    { success: false, status: 429, statusText: "Too Many", error: "Rate limit exceeded",   ranAt: daysAgo(1) },
    { success: true,  status: 200, statusText: "OK",       error: null,                    ranAt: daysAgo(0.5) },
  ];
  for (const l of logs) {
    await q(`
      INSERT INTO request_run_log (success, status, status_text, error_message, ran_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [l.success, l.status, l.statusText, l.error, l.ranAt]);
  }
  console.log(`  ✓ ${logs.length} request run log entries`);

  // ── 7. Liked media ─────────────────────────────────────────────────────────
  // Map username → mediaType for the users that have media
  const mediaByUser: Record<string, MediaRow[]> = {
    "instagram.tr": [
      { username: "instagram.tr", mediaType: "post", externalId: "ig_post_001", thumbnailUrl: "https://picsum.photos/seed/ig1/400/400", caption: "Instagram'ın yeni özelliklerini keşfedin! 🚀", likedAtDaysAgo: 12, hasLiked: true },
      { username: "instagram.tr", mediaType: "post", externalId: "ig_post_002", thumbnailUrl: "https://picsum.photos/seed/ig2/400/400", caption: "Hikayelerinizi daha eğlenceli hale getirin ✨", likedAtDaysAgo: 11, hasLiked: true },
      { username: "instagram.tr", mediaType: "post", externalId: "ig_post_003", thumbnailUrl: "https://picsum.photos/seed/ig3/400/400", caption: null, likedAtDaysAgo: 10, hasLiked: false },
    ],
    "fatma.sahin_photo": [
      { username: "fatma.sahin_photo", mediaType: "post", externalId: "fs_post_001", thumbnailUrl: "https://picsum.photos/seed/fatma1/400/400", caption: "Bugün çektiğim kareler 📸 #fotoğrafçılık", likedAtDaysAgo: 9, hasLiked: true },
      { username: "fatma.sahin_photo", mediaType: "post", externalId: "fs_post_002", thumbnailUrl: "https://picsum.photos/seed/fatma2/400/400", caption: "Doğanın renkleri 🌿", likedAtDaysAgo: 8, hasLiked: true },
      { username: "fatma.sahin_photo", mediaType: "post", externalId: "fs_post_003", thumbnailUrl: "https://picsum.photos/seed/fatma3/400/400", caption: "Altın saat ışığı 🌅", likedAtDaysAgo: 7, hasLiked: true },
    ],
    "can.uysal": [
      { username: "can.uysal", mediaType: "post", externalId: "cu_post_001", thumbnailUrl: "https://picsum.photos/seed/can1/400/400", caption: "Yeni proje çalışmalarım devam ediyor 💪", likedAtDaysAgo: 6, hasLiked: true },
      { username: "can.uysal", mediaType: "post", externalId: "cu_post_002", thumbnailUrl: "https://picsum.photos/seed/can2/400/400", caption: null, likedAtDaysAgo: 5, hasLiked: false },
    ],
    "kerem.videos": [
      { username: "kerem.videos", mediaType: "reel", externalId: "kv_reel_001", thumbnailUrl: "https://picsum.photos/seed/kerem1/400/400", caption: "Bu anı kaçırmayın 🎬 #reels #trending", likedAtDaysAgo: 14, hasLiked: true },
      { username: "kerem.videos", mediaType: "reel", externalId: "kv_reel_002", thumbnailUrl: "https://picsum.photos/seed/kerem2/400/400", caption: "Şehrin gece hali 🌙", likedAtDaysAgo: 13, hasLiked: true },
    ],
    "dilan.reels_": [
      { username: "dilan.reels_", mediaType: "reel", externalId: "dr_reel_001", thumbnailUrl: "https://picsum.photos/seed/dilan1/400/400", caption: "Günlük rutinlerim ☀️ #lifestyle", likedAtDaysAgo: 10, hasLiked: true },
      { username: "dilan.reels_", mediaType: "reel", externalId: "dr_reel_002", thumbnailUrl: "https://picsum.photos/seed/dilan2/400/400", caption: "Kahve saati ☕", likedAtDaysAgo: 9, hasLiked: true },
      { username: "dilan.reels_", mediaType: "reel", externalId: "dr_reel_003", thumbnailUrl: "https://picsum.photos/seed/dilan3/400/400", caption: null, likedAtDaysAgo: 8, hasLiked: false },
    ],
    "berk.content": [
      { username: "berk.content", mediaType: "reel", externalId: "bc_reel_001", thumbnailUrl: "https://picsum.photos/seed/berk1/400/400", caption: "İçerik üretiminin sırları 🎯", likedAtDaysAgo: 7, hasLiked: true },
    ],
    "nazli.clips": [
      { username: "nazli.clips", mediaType: "reel", externalId: "nc_reel_001", thumbnailUrl: "https://picsum.photos/seed/nazli1/400/400", caption: "Gün batımı videosu 🌇 #video", likedAtDaysAgo: 3, hasLiked: true },
      { username: "nazli.clips", mediaType: "reel", externalId: "nc_reel_002", thumbnailUrl: "https://picsum.photos/seed/nazli2/400/400", caption: "Sabah yürüyüşü 🏃‍♀️", likedAtDaysAgo: 2, hasLiked: true },
      { username: "nazli.clips", mediaType: "reel", externalId: "nc_reel_003", thumbnailUrl: "https://picsum.photos/seed/nazli3/400/400", caption: "Dans videosu 💃", likedAtDaysAgo: 1, hasLiked: true },
    ],
    "ugur.studio": [
      { username: "ugur.studio", mediaType: "reel", externalId: "us_reel_001", thumbnailUrl: "https://picsum.photos/seed/ugur1/400/400", caption: "Stüdyo günlüğü 🎥", likedAtDaysAgo: 1, hasLiked: true },
    ],
  };

  // Fetch tracked_user ids for users that have media
  let mediaCount = 0;
  for (const [username, mediaRows] of Object.entries(mediaByUser)) {
    const res = await q(
      `SELECT id FROM tracked_users WHERE username = $1`,
      [username],
    ) as { rows: { id: number }[] };
    const trackedUserId = res.rows[0]?.id;
    if (!trackedUserId) continue;

    for (const m of mediaRows) {
      await q(`
        INSERT INTO liked_media
          (tracked_user_id, media_type, external_id, thumbnail_url, caption, liked_at, has_liked)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT DO NOTHING
      `, [
        trackedUserId, m.mediaType, m.externalId,
        m.thumbnailUrl, m.caption,
        daysAgo(m.likedAtDaysAgo), m.hasLiked,
      ]);
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
