import { Router } from 'express';
import { requireAuth } from '../middlewares/requireAuth';

const router = Router();

router.use(requireAuth);

// Config'ı al
router.get('/settings', async (req, res) => {
  // Database veya dosyadan config al
  res.json({
    success: true,
    config: {
      instagramUsername: process.env.INSTAGRAM_USERNAME || '',
      instagramPassword: process.env.INSTAGRAM_PASSWORD || '',
      instagramSessionCookie: process.env.INSTAGRAM_SESSION_COOKIE || '',
      targetUsers: process.env.TARGET_USERS || '',
      likeIntervalMinutes: parseInt(process.env.LIKE_INTERVAL_MINUTES || '10'),
      maxLikesPerRun: parseInt(process.env.MAX_LIKES_PER_RUN || '10'),
      userAgent: process.env.USER_AGENT || 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
      referer: process.env.REFERER || 'https://www.instagram.com/',
      xIgAppId: process.env.X_IG_APP_ID || '936619743392459',
      proxyUrl: process.env.PROXY_URL || '',
      useProxy: process.env.USE_PROXY === 'true'
    }
  });
});

// Config'ı kaydet
router.post('/settings', async (req, res) => {
  try {
    const newConfig = req.body as Record<string, unknown>;

    // Proxy ayarlarını process.env'e yaz (mevcut process için geçerli — kalıcı
    // yapmak için PROXY_URL ve USE_PROXY'yi Replit Secrets'tan ayarlayın).
    if (typeof newConfig.proxyUrl === 'string') {
      process.env.PROXY_URL = newConfig.proxyUrl;
    }
    if (typeof newConfig.useProxy === 'boolean') {
      process.env.USE_PROXY = newConfig.useProxy ? 'true' : 'false';
    }
    if (typeof newConfig.instagramUsername === 'string') {
      process.env.INSTAGRAM_USERNAME = newConfig.instagramUsername;
    }
    if (typeof newConfig.instagramPassword === 'string' && newConfig.instagramPassword) {
      process.env.INSTAGRAM_PASSWORD = newConfig.instagramPassword;
    }
    if (typeof newConfig.userAgent === 'string' && newConfig.userAgent) {
      process.env.USER_AGENT = newConfig.userAgent;
    }

    // Env değişti — aktif client'ı sıfırla ki bir sonraki istekte yeni değerleri alsın
    const { resetClient } = await import('./instagram');
    resetClient();

    res.json({ success: true, message: 'Config kaydedildi' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Config kaydında hata' });
  }
});

export default router;
