import { Link } from 'wouter';
import { ArrowLeft } from 'lucide-react';
import { Button, Card, Input, Label } from '../components/ui/core';
import { useState, useEffect } from 'react';
import { loadConfig, saveConfig, resetConfig, AppConfig } from '../lib/config';
import { toast } from 'sonner';

export default function SettingsPage() {
  const [config, setConfig] = useState<AppConfig>(loadConfig());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const handleChange = (key: keyof AppConfig, value: string | number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleNumberChange = (key: keyof AppConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: parseInt(value) || 0 }));
  };

  const handleReset = () => {
    resetConfig();
    setConfig(loadConfig());
    toast.success('Ayarlar sıfırlandı');
  };

  const handleSaveToBackend = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
        credentials: 'include',
      });
      if (response.ok) {
        toast.success("Ayarlar kaydedildi");
      } else {
        toast.error('Hata: ' + response.statusText);
      }
    } catch (error) {
      toast.error('Hata: ' + (error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="sticky top-0 z-40 border-b border-border bg-background/80 backdrop-blur-md">
        <div className="max-w-3xl mx-auto px-4 h-16 flex items-center gap-3">
          <Link href="/dashboard">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-semibold tracking-tight">Ayarlar</span>
        </div>
      </header>

      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-6 lg:p-8 space-y-6">

        {/* Instagram Hesap */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Instagram Hesap Ayarları</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Instagram oturum açma bilgilerinizi girin</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı Adı</Label>
            <Input id="username" value={config.instagramUsername} onChange={e => handleChange('instagramUsername', e.target.value)} placeholder="instagram_kullanici_adi" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Şifre</Label>
            <Input id="password" type="password" value={config.instagramPassword} onChange={e => handleChange('instagramPassword', e.target.value)} placeholder="şifreniz" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="sessionCookie">Session Cookie <span className="text-muted-foreground font-normal">(2FA için opsiyonel)</span></Label>
            <Input id="sessionCookie" value={config.instagramSessionCookie} onChange={e => handleChange('instagramSessionCookie', e.target.value)} placeholder="sessionid=abc123..." />
          </div>
        </Card>

        {/* Beğenme */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Beğenme Ayarları</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Otomatik beğenme davranışlarını yapılandırın</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetUsers">Hedef Kullanıcılar</Label>
            <Input id="targetUsers" value={config.targetUsers} onChange={e => handleChange('targetUsers', e.target.value)} placeholder="kullanici1, kullanici2" />
            <p className="text-xs text-muted-foreground">Virgülle ayrılmış kullanıcı adları</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="likeInterval">Beğenme Aralığı (dakika)</Label>
              <Input id="likeInterval" type="number" value={config.likeIntervalMinutes} onChange={e => handleNumberChange('likeIntervalMinutes', e.target.value)} min="1" max="60" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="maxLikes">Maks. Beğeni / Çalıştırma</Label>
              <Input id="maxLikes" type="number" value={config.maxLikesPerRun} onChange={e => handleNumberChange('maxLikesPerRun', e.target.value)} min="1" max="50" />
            </div>
          </div>
        </Card>

        {/* HTTP Headers */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">HTTP Header Ayarları</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Instagram API istekleri için header değerleri</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="userAgent">User-Agent</Label>
            <Input id="userAgent" value={config.userAgent} onChange={e => handleChange('userAgent', e.target.value)} placeholder="Mozilla/5.0..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="referer">Referer</Label>
            <Input id="referer" value={config.referer} onChange={e => handleChange('referer', e.target.value)} placeholder="https://www.instagram.com/" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="xIgAppId">X-IG-App-ID</Label>
            <Input id="xIgAppId" value={config.xIgAppId} onChange={e => handleChange('xIgAppId', e.target.value)} placeholder="936619743392459" />
          </div>
        </Card>

        {/* Proxy */}
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="font-semibold">Proxy Ayarları</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Proxy kullanmak istiyorsanız yapılandırın</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="proxyUrl">Proxy URL</Label>
            <Input id="proxyUrl" value={config.proxyUrl} onChange={e => handleChange('proxyUrl', e.target.value)} placeholder="http://proxy:port" />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="useProxy" checked={config.useProxy} onChange={e => handleChange('useProxy', e.target.checked)} className="h-4 w-4 rounded border-border" />
            <Label htmlFor="useProxy" className="cursor-pointer font-normal">Proxy Kullan</Label>
          </div>
        </Card>

        {/* Butonlar */}
        <div className="flex flex-wrap gap-3 pb-8">
          <Button onClick={handleSaveToBackend} disabled={isLoading}>
            {isLoading ? 'Kaydediliyor...' : 'Kaydet'}
          </Button>
          <Button variant="outline" onClick={handleReset}>Varsayılanlara Sıfırla</Button>
          <Button variant="outline" onClick={() => {
            const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url; a.download = 'instagram-config.json'; a.click();
            toast.success('Config dosyası indirildi');
          }}>
            Config'i İndir
          </Button>
        </div>
      </main>
    </div>
  );
}
