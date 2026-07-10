import { Link } from "wouter";
import { AlertCircle } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4">
        <div className="w-16 h-16 bg-destructive/10 rounded-2xl flex items-center justify-center mx-auto">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">404 - Not Found</h1>
          <p className="text-muted-foreground max-w-sm mx-auto">
            The control panel section you're looking for does not exist or has been moved.
          </p>
        </div>
        <Link href="/dashboard" className="inline-flex h-12 px-8 items-center justify-center rounded-md bg-primary text-primary-foreground font-medium transition-colors hover:bg-primary/90 mt-4">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
