import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "@/lib/polyfills"; // ⚡ Polyfills pour anciennes versions Android (DOIT être en premier)
import "./globals.css";
import "../styles/bubble-stream.css";
import "../styles/z-index-fix.css";
import "../styles/custom-toast.css";
import { Toaster } from "@/components/ui/sonner";
import { StoreInitializer } from "@/stores";
import { ThemeProvider, QueryProvider, PresenceProvider, MotionProvider } from "@/components/providers";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { ClientOnly } from "@/components/common/client-only";
import { MessageViewProvider } from "@/hooks/use-message-view-state";
import { getAllFontVariables } from "@/lib/fonts";
import { CriticalPreloader } from "@/components/common/CriticalPreloader";
import { CallManager } from "@/components/video-call";
import { TabNotificationManager } from "@/components/common/TabNotificationManager";
import { GoogleAnalytics } from "@/components/analytics";
import { FirebaseInitializer } from "@/components/providers/FirebaseInitializer";
import { ServiceWorkerInitializer } from "@/components/providers/ServiceWorkerInitializer";
import { HtmlLangSync } from "@/components/common/HtmlLangSync";
import { SystemStatusBanner } from "@/components/common/SystemStatusBanner";
import { buildPageMetadata, getMetadataBundle } from "@/lib/i18n/metadata";
import { getServerLocale } from "@/lib/i18n/server-locale";
import "@/utils/console-override"; // 🔇 Désactive console.log en production

export async function generateMetadata(): Promise<Metadata> {
  const base = await buildPageMetadata('home', {
    url: 'https://meeshy.me',
    image: 'https://meeshy.me/images/meeshy-og-welcome.jpg',
  });

  return {
    ...base,
    formatDetection: {
      email: false,
      address: false,
      telephone: false,
    },
    icons: {
      icon: [
        { url: '/favicon.ico', sizes: 'any' },
        { url: '/favicon.svg', type: 'image/svg+xml' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [
        { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
    },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getServerLocale();
  const skipToContent = getMetadataBundle(locale).skipToContent;

  return (
    <html lang={locale} suppressHydrationWarning>
      <body className={`${getAllFontVariables()} antialiased font-nunito`}>
        {/* Skip link for keyboard navigation (WCAG 2.4.1) */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[9999] focus:px-4 focus:py-2 focus:bg-primary focus:text-primary-foreground focus:rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {skipToContent}
        </a>

        {/* Recovery automatique pour chunks obsoletes apres deploiement */}
        <Script src="/chunk-recovery.js" strategy="beforeInteractive" />

        {/* Preload des composants critiques (Client Component) */}
        <CriticalPreloader />

        {/* Google Analytics - Tracking sur toutes les pages */}
        <GoogleAnalytics />

        {/* Firebase Initializer - Vérifie Firebase au démarrage */}
        <FirebaseInitializer />

        {/* SW Initializer - Enregistre et check les updates au démarrage */}
        <ServiceWorkerInitializer />

        {/* Sync <html lang> with user's interface language */}
        <HtmlLangSync />

        <QueryProvider>
          <StoreInitializer>
            <ThemeProvider>
              <MotionProvider>
                <MessageViewProvider>
                  <ErrorBoundary>
                    <ClientOnly>
                      <SystemStatusBanner />
                      <PresenceProvider>
                        <main id="main-content">
                          {children}
                        </main>
                      </PresenceProvider>
                      <CallManager />
                      <TabNotificationManager />
                    </ClientOnly>
                  </ErrorBoundary>
                </MessageViewProvider>
              </MotionProvider>
            </ThemeProvider>
          </StoreInitializer>
        </QueryProvider>
        <Toaster
          position="top-right"
          expand={true}
          richColors
          visibleToasts={5}
          toastOptions={{
            duration: 5000,
            classNames: {
              toast: 'dark:bg-gray-800 dark:border-gray-700 top-0 sm:top-auto',
              title: 'dark:text-white',
              description: 'dark:text-gray-400',
            },
          }}
          className="!top-4 sm:!top-4 sm:!right-4"
        />
      </body>
    </html>
  );
}
