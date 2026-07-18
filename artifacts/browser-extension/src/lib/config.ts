export interface AppConfig {
  // Instagram Ayarları
  instagramUsername: string;
  instagramPassword: string;
  instagramSessionCookie: string;

  // Beğenme Ayarları
  targetUsers: string;
  likeIntervalMinutes: number;
  maxLikesPerRun: number;

  // Header Ayarları
  userAgent: string;
  referer: string;
  xIgAppId: string;

  // Proxy Ayarları
  proxyUrl: string;
  useProxy: boolean;
}

export const DEFAULT_CONFIG: AppConfig = {
  // Instagram
  instagramUsername: '',
  instagramPassword: '',
  instagramSessionCookie: '',

  // Beğenme
  targetUsers: '',
  likeIntervalMinutes: 10,
  maxLikesPerRun: 10,

  // Header
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
  referer: 'https://www.instagram.com/',
  xIgAppId: '936619743392459',

  // Proxy
  proxyUrl: '',
  useProxy: false
};

// LocalStorage key
export const CONFIG_KEY = 'instagram_automation_config';

// Config'ı yükle
export function loadConfig(): AppConfig {
  if (typeof window !== 'undefined' && window.localStorage) {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      try {
        return { ...DEFAULT_CONFIG, ...JSON.parse(saved) };
      } catch {
        return DEFAULT_CONFIG;
      }
    }
  }
  return DEFAULT_CONFIG;
}

// Config'ı kaydet
export function saveConfig(config: Partial<AppConfig>): AppConfig {
  const current = loadConfig();
  const newConfig = { ...current, ...config };
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(newConfig));
  }
  return newConfig;
}

// Config'ı sıfırla
export function resetConfig(): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.removeItem(CONFIG_KEY);
  }
}
