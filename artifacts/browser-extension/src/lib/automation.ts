// ─── Panel tarafı otomasyon yardımcıları ─────────────────────────────────────
// background.ts'deki AutoState tipiyle birebir eşleşmeli.

export interface AutoState {
  enabled:           boolean;
  timeFrom:          number;   // 0-23
  timeTo:            number;   // 0-23
  minDelaySec:       number;
  maxDelaySec:       number;
  maxPerDay:         number;
  targetType:        'stories' | 'reels' | 'both';
  // runtime
  todayCount:        number;
  todayDate:         string;
  nextRunAt:         number;
  backoffUntil:      number;
  consecutiveErrors: number;
  lastActionLabel:   string;
}

export const AUTO_DEFAULTS: AutoState = {
  enabled: false, timeFrom: 9, timeTo: 23,
  minDelaySec: 45, maxDelaySec: 120, maxPerDay: 50, targetType: 'stories',
  todayCount: 0, todayDate: '', nextRunAt: 0, backoffUntil: 0,
  consecutiveErrors: 0, lastActionLabel: '',
};

/** Background'dan mevcut otomasyon durumunu çek. */
export function fetchAutoState(): Promise<AutoState> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'IG_AUTO_GET' }, (res: AutoState | undefined) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      resolve(res ?? AUTO_DEFAULTS);
    });
  });
}

/** Otomasyon ayarlarını güncelle. */
export function updateAutoState(patch: Partial<AutoState>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'IG_AUTO_SET', patch }, (res: { ok: boolean } | undefined) => {
      if (chrome.runtime.lastError) { reject(new Error(chrome.runtime.lastError.message)); return; }
      if (res?.ok) resolve(); else reject(new Error('Otomasyon ayarları güncellenemedi'));
    });
  });
}

/** Takip listesi önbelleğini temizle (ayarlar değiştiğinde çağır). */
export function clearAutoCache(): void {
  chrome.runtime.sendMessage({ type: 'IG_AUTO_CLEAR_CACHE' }, () => {});
}

/** Kalan backoff süresini saniye cinsinden döndürür (0 = aktif). */
export function backoffRemaining(state: AutoState): number {
  const rem = state.backoffUntil - Date.now();
  return rem > 0 ? Math.ceil(rem / 1000) : 0;
}

/** Sonraki çalışmaya kalan süreyi saniye cinsinden döndürür. */
export function nextRunRemaining(state: AutoState): number {
  const rem = state.nextRunAt - Date.now();
  return rem > 0 ? Math.ceil(rem / 1000) : 0;
}

/** Durumu okunabilir etikete çevirir. */
export function statusLabel(state: AutoState): { text: string; kind: 'idle' | 'active' | 'backoff' | 'off' | 'window' } {
  if (!state.enabled) return { text: 'Kapalı', kind: 'off' };
  const now = Date.now();
  if (state.backoffUntil > now) {
    const s = Math.ceil((state.backoffUntil - now) / 1000);
    const m = Math.floor(s / 60), r = s % 60;
    return { text: `Bekleniyor ${m > 0 ? m + 'd ' : ''}${r}s`, kind: 'backoff' };
  }
  const h = new Date().getHours();
  const inWin = state.timeFrom <= state.timeTo
    ? h >= state.timeFrom && h < state.timeTo
    : h >= state.timeFrom || h < state.timeTo;
  if (!inWin) return { text: 'Pencere dışı', kind: 'window' };
  if (state.todayCount >= state.maxPerDay) return { text: 'Günlük limit', kind: 'window' };
  return { text: 'Aktif', kind: 'active' };
}
