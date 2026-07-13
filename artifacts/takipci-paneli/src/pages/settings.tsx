import { Link } from 'wouter';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { SettingsForm } from '../components/ui/settings-form';

export default function SettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">⚙️ Ayarlar</h1>
            <p className="text-sm text-muted-foreground">
              Tüm ayarlarınızı tek yerden yönetin
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/instagram">← Geri</Link>
          </Button>
        </div>

        <SettingsForm />
      </div>
    </div>
  );
}
