import cron from 'node-cron';
import { db } from './db';
import { request_config, app_state, tracked_users } from './db/schema';
import { eq } from 'drizzle-orm';
import { InstagramBot } from './instagramBot';

export const initAutomation = () => {
  // Her 30 dakikada bir çalışacak şekilde ayarlayalım (Çok sık çalışırsa Instagram hesabı kapatır)
  cron.schedule('*/30 * * * *', async () => {
    console.log('--- Otomasyon Döngüsü Başladı ---');

    const state = await db.select().from(app_state).where(eq(app_state.id, 1)).get();
    if (!state?.monitoringEnabled) return;

    const config = await db.select().from(request_config).where(eq(request_config.id, 1)).get();
    if (!config?.cookies) return;

    // Takip listesindeki kullanıcıları çek
    const targets = await db.select().from(tracked_users).all();
    if (targets.length === 0) return;

    const bot = new InstagramBot();

    try {
      const cookiesObj = JSON.parse(config.cookies);
      const isInitialized = await bot.init(cookiesObj);

      if (isInitialized) {
        for (const target of targets) {
          if (target.category === 'follower') {
            // Kullanıcının hikayelerini izle
            await bot.viewUserStories(target.username);
          } else if (target.category === 'liked_post' || target.category === 'liked_story') {
            // Eğer username alanı aslında bir gönderi linkiyse beğen ve yorum yap
            if (target.username.includes('instagram.com/p/') || target.username.includes('instagram.com/reels/')) {
              await bot.interactWithPost(target.username, "Harika içerik! 🔥");
            }
          }
        }
      }
    } catch (error) {
      console.error('Otomasyon döngüsünde kritik hata:', error);
    } finally {
      await bot.shutdown();
      console.log('--- Otomasyon Döngüsü Bitti ve Tarayıcı Kapatıldı ---');
    }
  });
};
