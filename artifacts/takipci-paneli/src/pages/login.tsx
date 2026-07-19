import { useState } from 'react';
import { useLocation } from 'wouter';
import { useLogin, useGetMe } from '@workspace/api-client-react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Instagram, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { useToast } from '@/hooks/use-toast';

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

export default function LoginPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const login = useLogin();
  const { data: user, isLoading: isCheckingUser } = useGetMe();

  if (user) {
    // Already logged in
    setLocation('/dashboard');
  }

  const form = useForm<z.infer<typeof loginSchema>>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });

  const onSubmit = (values: z.infer<typeof loginSchema>) => {
    login.mutate(
      { data: values },
      {
        onSuccess: () => {
          toast({ title: 'Login successful' });
          setLocation('/dashboard');
        },
        onError: (error) => {
          toast({ 
            title: 'Login failed', 
            description: error.data?.error || 'Invalid credentials',
            variant: 'destructive'
          });
        },
      }
    );
  };

  if (isCheckingUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background relative overflow-hidden">
      {/* Background gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
        <div className="absolute -top-[20%] -left-[10%] w-[50%] h-[50%] rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute top-[60%] -right-[10%] w-[40%] h-[60%] rounded-full bg-secondary/10 blur-[120px]" />
      </div>

      <div className="w-full max-w-md px-4 relative z-10">
        <div className="flex justify-center mb-8">
          <div className="h-16 w-16 bg-gradient-to-tr from-secondary to-primary rounded-2xl flex items-center justify-center shadow-lg shadow-primary/20 text-white">
            <Instagram className="h-8 w-8" />
          </div>
        </div>

        <Card className="border-border/60 shadow-xl shadow-black/5 bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center space-y-2">
            <CardTitle className="text-2xl font-bold tracking-tight">Takipçi Paneli</CardTitle>
            <CardDescription>Enter your admin credentials to access the control center.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Username</FormLabel>
                      <FormControl>
                        <Input placeholder="admin" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input type="password" placeholder="••••••••" {...field} className="bg-background/50" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full mt-6" disabled={login.isPending}>
                  {login.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Sign In
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t border-border/40 py-4 bg-muted/30">
            <div className="flex items-center text-xs text-muted-foreground gap-2">
              <ShieldAlert className="h-4 w-4" />
              <span>Authorized personnel only</span>
            </div>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}