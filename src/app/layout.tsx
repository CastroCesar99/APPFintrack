
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider } from '@/context/language-context';
import { AuthProvider } from '@/context/auth-context';
import { DateNavigationProvider } from '@/context/date-navigation-context';
import { ThemeProvider } from '@/context/theme-context'; // NEW IMPORT

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'FinTrack',
  description: 'Track your finances with ease.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ThemeProvider> {/* ThemeProvider wraps everything */}
      <html lang="en" suppressHydrationWarning> {/* suppressHydrationWarning for client-side class changes */}
        <body suppressHydrationWarning={true} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <AuthProvider>
            <LanguageProvider>
              <DateNavigationProvider>
                <SidebarProvider defaultOpen={true}>
                  {children}
                </SidebarProvider>
              </DateNavigationProvider>
            </LanguageProvider>
          </AuthProvider>
          <Toaster />
        </body>
      </html>
    </ThemeProvider>
  );
}
