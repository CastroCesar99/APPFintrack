
import type React from 'react';
// AppLogoIcon removed as it's no longer used here
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AuthFormWrapperProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
}

export function AuthFormWrapper({ title, description, children, footerContent }: AuthFormWrapperProps) {
  return (
    <div className="w-full min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8 text-center">
          {/* <AppLogoIcon /> Removed logo */}
          {/* Removed: <h2 className="text-2xl font-semibold text-foreground mb-2">Bem vindo,</h2> */}
          <h1 className="text-3xl font-bold text-primary mb-2">{title}</h1>
          <p className="text-muted-foreground mt-1">{description}</p>
        </div>
        <Card className="shadow-xl">
          <CardContent className="p-6 space-y-6">
            {children}
          </CardContent>
        </Card>
        {footerContent && (
          <div className="mt-6 text-center text-sm">
            {footerContent}
          </div>
        )}
      </div>
    </div>
  );
}
