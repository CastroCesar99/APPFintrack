
import type {Metadata, Viewport} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider } from '@/context/language-context';
import { AuthProvider } from '@/context/auth-context';
import { AuthGuard } from '@/components/auth/auth-guard';
import { DateNavigationProvider } from '@/context/date-navigation-context';
import { ThemeProvider } from '@/context/theme-context';
import { defineCustomElements } from '@ionic/pwa-elements/loader';

// Registrar PWA Elements para câmera funcionar na web
if (typeof window !== 'undefined') {
  defineCustomElements(window);
}

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Athena',
  description: 'Financial wisdom at your fingertips.',
  icons: {
    icon: '/images/Logo.png',
    apple: '/images/Logo.png',
  },
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning={true}>
      <body suppressHydrationWarning={true} className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-[100dvh] flex flex-col w-full max-w-full overflow-x-hidden overflow-y-auto overscroll-none pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]`}>
        <ThemeProvider>
          <AuthProvider>
            <AuthGuard>
              <LanguageProvider>
                <DateNavigationProvider>
                  <SidebarProvider defaultOpen={true}>
                    {children}
                  </SidebarProvider>
                </DateNavigationProvider>
              </LanguageProvider>
            </AuthGuard>
          </AuthProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
