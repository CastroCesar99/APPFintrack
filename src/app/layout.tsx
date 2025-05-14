
import type {Metadata} from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Toaster } from "@/components/ui/toaster";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider } from '@/context/language-context'; // Import LanguageProvider

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
    <html lang="en" className="dark">
      <body suppressHydrationWarning={true} className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <LanguageProvider> {/* Wrap with LanguageProvider */}
          <SidebarProvider defaultOpen={true}>
            {children}
          </SidebarProvider>
        </LanguageProvider>
        <Toaster />
      </body>
    </html>
  );
}
