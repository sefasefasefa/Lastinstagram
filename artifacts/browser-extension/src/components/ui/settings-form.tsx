import { useState, useEffect } from 'react';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';
import { Input } from './input';
import { Label } from './label';
import { loadConfig, saveConfig, resetConfig, AppConfig } from '../../lib/config';
import { toast } from 'sonner';

export function SettingsForm() {
  const [config, setConfig] = useState<AppConfig>(loadConfig());
  const [isLoading, setIsLoading] = useState(false);

  // Config değiştiğinde kaydet
  useEffect(() => {
    saveConfig(config);
  }, [config]);

  const handleChange = (key: keyof AppConfig, value: string | number | boolean) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleNumberChange = (key: keyof AppConfig, value: string) => {
    const numValue = parseInt(value) || 0;
    setConfig(prev => ({ ...prev, [key]: numValue }));
  };

  const handleArrayChange = (key: keyof AppConfig, value: string) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  };

  const handleReset = () => {
    resetConfig();
    setConfig(loadConfig());
    toast.success('Ayarlar sıfırlandı');
  };

  const handleSaveToBackend = async () => {
    setIsLoading(true);
    try {
      saveConfig(config);
      toast.success('Ayarlar kaydedildi');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Instagram Ayarları */}
      <Card>
        <CardHeader>
          <CardTitle>🔐 Instagram Hesap Ayarları</CardTitle>
          <CardDescription>
            Instagram oturum açma bilgilerinizi girin
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Kullanıcı Adı</Label>
            <Input
              id="username"
              value={config.instagramUsername}
              onChange={(e) => handleChange('instagramUsername', e.target.value)}
              placeholder="instagram_kullanici_adi"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Şifre</Label>
            <Input
              id="password"
              type="password"
              value={config.instagramPassword}
              onChange={(e) => handleChange('instagramPassword', e.target.value)}
              placeholder="şifreniz"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sessionCookie">
              Session Cookie (2FA için)
              <span className="text-sm text-muted-foreground">
                {" (Opsiyonel - 2FA etkinse gereklidir)"}
              </span>
            </Label>
            <Input
              id="sessionCookie"
              value={config.instagramSessionCookie}
              onChange={(e) => handleChange('instagramSessionCookie', e.target.value)}
              placeholder="sessionid=abc123..."
            />
          </div>
        </CardContent>
      </Card>

      {/* Beğenme Ayarları */}
      <Card>
        <CardHeader>
          <CardTitle>❤️ Beğenme Ayarları</CardTitle>
          <CardDescription>
            Otomatik beğenme davranışlarını yapılandırın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="targetUsers">Hedef Kullanıcılar</Label>
            <Input
              id="targetUsers"
              value={config.targetUsers}
              onChange={(e) => handleArrayChange('targetUsers', e.target.value)}
              placeholder="kullanici1, kullanici2, kullanici3"
            />
            <p className="text-sm text-muted-foreground">
              Virgülle ayrılmış kullanıcı adları
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="likeInterval">Beğenme Aralığı (dakika)</Label>
              <Input
                id="likeInterval"
                type="number"
                value={config.likeIntervalMinutes}
                onChange={(e) => handleNumberChange('likeIntervalMinutes', e.target.value)}
                min="1"
                max="60"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="maxLikes">Maksimum Beğeni (her çalıştırmada)</Label>
              <Input
                id="maxLikes"
                type="number"
                value={config.maxLikesPerRun}
                onChange={(e) => handleNumberChange('maxLikesPerRun', e.target.value)}
                min="1"
                max="50"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Header Ayarları */}
      <Card>
        <CardHeader>
          <CardTitle>🌐 HTTP Header Ayarları</CardTitle>
          <CardDescription>
            Instagram API istekleri için header değerleri
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userAgent">User-Agent</Label>
            <Input
              id="userAgent"
              value={config.userAgent}
              onChange={(e) => handleChange('userAgent', e.target.value)}
              placeholder="Mozilla/5.0..."
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="referer">Referer</Label>
            <Input
              id="referer"
              value={config.referer}
              onChange={(e) => handleChange('referer', e.target.value)}
              placeholder="https://www.instagram.com/"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="xIgAppId">X-IG-App-ID</Label>
            <Input
              id="xIgAppId"
              value={config.xIgAppId}
              onChange={(e) => handleChange('xIgAppId', e.target.value)}
              placeholder="936619743392459"
            />
          </div>
        </CardContent>
      </Card>

      {/* Proxy Ayarları */}
      <Card>
        <CardHeader>
          <CardTitle>🔄 Proxy Ayarları</CardTitle>
          <CardDescription>
            Proxy kullanmak istiyorsanız yapılandırın
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="proxyUrl">Proxy URL</Label>
            <Input
              id="proxyUrl"
              value={config.proxyUrl}
              onChange={(e) => handleChange('proxyUrl', e.target.value)}
              placeholder="http://proxy:port"
            />
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="useProxy"
              checked={config.useProxy}
              onChange={(e) => handleChange('useProxy', e.target.checked)}
              className="h-4 w-4"
            />
            <Label htmlFor="useProxy" className="cursor-pointer">
              Proxy Kullan
            </Label>
          </div>
        </CardContent>
      </Card>

      {/* Aksiyon Butonları */}
      <div className="flex flex-wrap gap-4">
        <Button
          onClick={handleSaveToBackend}
          disabled={isLoading}
          className="flex-1 md:flex-none"
        >
          {isLoading ? 'Kaydediliyor...' : 'Backend\'e Kaydet'}
        </Button>

        <Button
          variant="outline"
          onClick={handleReset}
          className="flex-1 md:flex-none"
        >
          Varsayılanlara Sıfırla
        </Button>

        <Button
          variant="secondary"
          onClick={() => {
            // Export config
            const data = JSON.stringify(config, null, 2);
            const blob = new Blob([data], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'instagram-config.json';
            a.click();
            toast.success('Config dosyası indirildi');
          }}
          className="flex-1 md:flex-none"
        >
          Config'i İndir
        </Button>
      </div>
    </div>
  );
}
