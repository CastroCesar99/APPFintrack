
import type React from 'react';
import { AppLogoIcon } from '@/components/icons';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';

interface AuthFormWrapperProps {
  title: string;
  description: string;
  children: React.ReactNode;
  footerContent?: React.ReactNode;
}

export function AuthFormWrapper({ title, description, children, footerContent }: AuthFormWrapperProps) {
  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <AppLogoIcon />
          <h1 className="text-3xl font-bold text-primary mt-3">{title}</h1>
          <p className="text-muted-foreground text-center mt-1">{description}</p>
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
