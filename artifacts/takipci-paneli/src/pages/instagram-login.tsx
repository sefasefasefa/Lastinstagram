import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLoginInstagram, useVerifyTwoFactor, useSelectCheckpointMethod, useVerifyCheckpoint, useGetCheckpointOptions } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useToast } from '@/hooks/use-toast';
import { Instagram, Loader2, ShieldCheck, ArrowRight, Smartphone } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetInstagramStatusQueryKey } from '@workspace/api-client-react';

type FlowStep = 'login' | '2fa' | 'checkpoint_select' | 'checkpoint_verify';

export default function InstagramLoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [step, setStep] = useState<FlowStep>('login');
  
  // Login State
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  
  // 2FA State
  const [twoFactorCode, setTwoFactorCode] = useState('');
  
  // Checkpoint State
  const [checkpointChoice, setCheckpointChoice] = useState('');
  const [checkpointCode, setCheckpointCode] = useState('');

  // Mutations
  const loginIg = useLoginInstagram();
  const verify2FA = useVerifyTwoFactor();
  const selectCheckpoint = useSelectCheckpointMethod();
  const verifyCheckpoint = useVerifyCheckpoint();

  // Query for checkpoint options (only fetched when on that step)
  const { data: checkpointOptions, isLoading: isLoadingOptions } = useGetCheckpointOptions({
    query: { enabled: step === 'checkpoint_select' }
  });

  // Handle step updates on options load if API says we should verify directly
  if (step === 'checkpoint_select' && checkpointOptions?.stepName === 'verify_code') {
    setStep('checkpoint_verify');
  }

  const handleSuccess = () => {
    queryClient.invalidateQueries({ queryKey: getGetInstagramStatusQueryKey() });
    toast({ title: 'Instagram account connected successfully!' });
    setLocation('/instagram');
  };

  const onLogin = (e: React.FormEvent) => {
    e.preventDefault();
    loginIg.mutate(
      { data: { username, password } },
      {
        onSuccess: () => handleSuccess(),
        onError: (err) => {
          const errorData = err.data;
          if (errorData?.twoFactorRequired) {
            setStep('2fa');
            toast({ title: '2FA Required', description: 'Please enter your two-factor authentication code.' });
          } else if (errorData?.checkpointRequired) {
            setStep('checkpoint_select');
            toast({ title: 'Checkpoint Challenge', description: 'Instagram requires verification.' });
          } else {
            toast({ title: 'Login failed', description: errorData?.error || 'Invalid credentials', variant: 'destructive' });
          }
        }
      }
    );
  };

  const onVerify2FA = (e: React.FormEvent) => {
    e.preventDefault();
    verify2FA.mutate(
      { data: { verificationCode: twoFactorCode } },
      {
        onSuccess: () => handleSuccess(),
        onError: () => toast({ title: 'Verification failed', description: 'Invalid 2FA code.', variant: 'destructive' })
      }
    );
  };

  const onSelectCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkpointChoice) return;
    
    selectCheckpoint.mutate(
      { data: { choice: checkpointChoice } },
      {
        onSuccess: () => setStep('checkpoint_verify'),
        onError: () => toast({ title: 'Failed to select method', variant: 'destructive' })
      }
    );
  };

  const onVerifyCheckpoint = (e: React.FormEvent) => {
    e.preventDefault();
    verifyCheckpoint.mutate(
      { data: { verificationCode: checkpointCode } },
      {
        onSuccess: () => handleSuccess(),
        onError: () => toast({ title: 'Verification failed', description: 'Invalid checkpoint code.', variant: 'destructive' })
      }
    );
  };

  return (
    <div className="max-w-md mx-auto mt-12">
      <Card className="border-border/60 shadow-xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-orange-500" />
        
        <CardHeader className="text-center pb-2 pt-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-orange-500 via-primary to-purple-600 rounded-2xl flex items-center justify-center mb-4 text-white shadow-lg shadow-primary/20">
            <Instagram className="h-8 w-8" />
          </div>
          <CardTitle className="text-2xl">Connect Instagram</CardTitle>
          <CardDescription>
            {step === 'login' && 'Enter your Instagram credentials securely.'}
            {step === '2fa' && 'Enter the 6-digit code from your authenticator app or SMS.'}
            {step === 'checkpoint_select' && 'Select how you want to receive your security code.'}
            {step === 'checkpoint_verify' && 'Enter the security code sent by Instagram.'}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {step === 'login' && (
            <form onSubmit={onLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ig-username">Username</Label>
                <Input 
                  id="ig-username" 
                  placeholder="instagram_handle" 
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ig-password">Password</Label>
                <Input 
                  id="ig-password" 
                  type="password" 
                  placeholder="••••••••" 
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full mt-6" disabled={loginIg.isPending}>
                {loginIg.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Login to Instagram
              </Button>
            </form>
          )}

          {step === '2fa' && (
            <form onSubmit={onVerify2FA} className="space-y-6">
              <div className="flex justify-center text-primary mb-4">
                <ShieldCheck className="h-16 w-16 opacity-50" />
              </div>
              <div className="space-y-2 text-center">
                <Label htmlFor="2fa-code" className="text-lg">Authentication Code</Label>
                <Input 
                  id="2fa-code" 
                  className="text-center text-2xl tracking-widest font-mono h-14" 
                  placeholder="000000"
                  maxLength={8}
                  value={twoFactorCode}
                  onChange={e => setTwoFactorCode(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={verify2FA.isPending}>
                {verify2FA.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify & Connect
              </Button>
            </form>
          )}

          {step === 'checkpoint_select' && (
            <form onSubmit={onSelectCheckpoint} className="space-y-6">
              {isLoadingOptions ? (
                <div className="flex justify-center p-8"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
              ) : (
                <>
                  <div className="bg-muted/50 p-4 rounded-lg text-sm text-center mb-4 border border-border">
                    {checkpointOptions?.message || 'Instagram needs to verify it is you.'}
                  </div>
                  
                  <RadioGroup value={checkpointChoice} onValueChange={setCheckpointChoice} className="space-y-3">
                    {checkpointOptions?.choices?.map((choice) => (
                      <div key={choice.value} className="flex items-center space-x-3 border border-border p-3 rounded-md hover:bg-muted/50 cursor-pointer">
                        <RadioGroupItem value={choice.value} id={choice.value} />
                        <Label htmlFor={choice.value} className="flex-1 cursor-pointer font-medium">{choice.label}</Label>
                        <Smartphone className="h-4 w-4 text-muted-foreground" />
                      </div>
                    ))}
                  </RadioGroup>

                  <Button type="submit" className="w-full" disabled={selectCheckpoint.isPending || !checkpointChoice}>
                    {selectCheckpoint.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                    Send Code
                  </Button>
                </>
              )}
            </form>
          )}

          {step === 'checkpoint_verify' && (
            <form onSubmit={onVerifyCheckpoint} className="space-y-6">
              <div className="space-y-2 text-center">
                <Label htmlFor="cp-code" className="text-lg">Security Code</Label>
                <Input 
                  id="cp-code" 
                  className="text-center text-2xl tracking-widest font-mono h-14" 
                  placeholder="000000"
                  value={checkpointCode}
                  onChange={e => setCheckpointCode(e.target.value)}
                  required
                />
                <p className="text-xs text-muted-foreground mt-2">Enter the code sent to your selected contact method.</p>
              </div>
              <Button type="submit" className="w-full" disabled={verifyCheckpoint.isPending}>
                {verifyCheckpoint.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Verify Code
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center border-t border-border/40 py-4 bg-muted/20">
          <p className="text-xs text-muted-foreground text-center">
            Credentials are only sent directly to Instagram's API.
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}