'use client';

/**
 * Page de redirection pour les liens de tracking Meeshy
 * Route: /l/[token]
 *
 * Client component qui:
 * 1. Collecte un maximum de données navigateur (screen, timezone, connection, etc.)
 * 2. Détecte la source sociale (WhatsApp, Telegram, etc.) via referrer + user-agent
 * 3. Capture les UTM params de l'URL du clic
 * 4. POST toutes les données au gateway
 * 5. Redirige vers l'URL originale
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { buildApiUrl } from '@/lib/config';

// =============================================================================
// Détection de la source sociale
// =============================================================================

function detectSocialSource(referrer: string, userAgent: string): string {
  const ref = (referrer || '').toLowerCase();
  const ua = (userAgent || '').toLowerCase();

  // --- Détection via referrer ---
  // WhatsApp
  if (ref.includes('whatsapp.com') || ref.includes('wa.me') || ref.includes('l.wl.co')) return 'WhatsApp';
  // Telegram
  if (ref.includes('t.me') || ref.includes('telegram.org') || ref.includes('telegram.me')) return 'Telegram';
  // Facebook / Messenger
  if (ref.includes('facebook.com') || ref.includes('fb.com') || ref.includes('l.facebook.com') || ref.includes('lm.facebook.com') || ref.includes('m.facebook.com')) return 'Facebook';
  if (ref.includes('messenger.com')) return 'Messenger';
  // Instagram
  if (ref.includes('instagram.com') || ref.includes('l.instagram.com')) return 'Instagram';
  // Twitter / X
  if (ref.includes('t.co') || ref.includes('twitter.com') || ref.includes('x.com')) return 'Twitter/X';
  // LinkedIn
  if (ref.includes('linkedin.com') || ref.includes('lnkd.in')) return 'LinkedIn';
  // Reddit
  if (ref.includes('reddit.com') || ref.includes('redd.it')) return 'Reddit';
  // TikTok
  if (ref.includes('tiktok.com')) return 'TikTok';
  // Discord
  if (ref.includes('discord.com') || ref.includes('discordapp.com')) return 'Discord';
  // Slack
  if (ref.includes('slack.com') || ref.includes('slack-redir.net')) return 'Slack';
  // Snapchat
  if (ref.includes('snapchat.com')) return 'Snapchat';
  // Pinterest
  if (ref.includes('pinterest.com') || ref.includes('pin.it')) return 'Pinterest';
  // YouTube
  if (ref.includes('youtube.com') || ref.includes('youtu.be')) return 'YouTube';
  // Email clients
  if (ref.includes('mail.google.com') || ref.includes('mail.yahoo.com') || ref.includes('outlook.live.com') || ref.includes('outlook.office.com')) return 'Email';
  // Search engines
  if (ref.includes('google.') && (ref.includes('/search') || ref.includes('?q='))) return 'Google Search';
  if (ref.includes('bing.com')) return 'Bing';
  if (ref.includes('duckduckgo.com')) return 'DuckDuckGo';

  // --- Détection via user-agent (navigateurs in-app) ---
  if (ua.includes('fban') || ua.includes('fbav') || ua.includes('fb_iab')) return 'Facebook';
  if (ua.includes('instagram')) return 'Instagram';
  if (ua.includes('twitter') || ua.includes('twitterandroid')) return 'Twitter/X';
  if (ua.includes('linkedinapp')) return 'LinkedIn';
  if (ua.includes('snapchat')) return 'Snapchat';
  if (ua.includes('bytedance') || ua.includes('tiktok')) return 'TikTok';
  if (ua.includes('line/')) return 'LINE';
  if (ua.includes('kakaotalk')) return 'KakaoTalk';
  if (ua.includes('weibo')) return 'Weibo';
  if (ua.includes('micromessenger')) return 'WeChat';

  // Pas de referrer = Direct (copié-collé, bookmark, email client qui strip le referrer)
  if (!referrer || referrer === '') return 'Direct';

  // Referrer existe mais non reconnu
  return 'Other';
}

// =============================================================================
// Détection navigateur / OS / device (côté client pour plus de précision)
// =============================================================================

function detectBrowser(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Firefox') && !ua.includes('Seamonkey')) return 'Firefox';
  if (ua.includes('SamsungBrowser')) return 'Samsung Internet';
  if (ua.includes('Opera') || ua.includes('OPR')) return 'Opera';
  if (ua.includes('Edg')) return 'Edge';
  if (ua.includes('Chrome') && !ua.includes('Edg') && !ua.includes('OPR')) return 'Chrome';
  if (ua.includes('Safari') && !ua.includes('Chrome') && !ua.includes('Chromium')) return 'Safari';
  if (ua.includes('MSIE') || ua.includes('Trident')) return 'Internet Explorer';
  return 'Other';
}

function detectOS(ua: string): string {
  if (!ua) return 'Unknown';
  if (ua.includes('Windows NT 10') || ua.includes('Windows NT 11')) return 'Windows';
  if (ua.includes('Windows')) return 'Windows';
  if (ua.includes('Mac OS X') || ua.includes('Macintosh')) return 'macOS';
  if (ua.includes('CrOS')) return 'ChromeOS';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad') || ua.includes('iPod')) return 'iOS';
  if (ua.includes('Linux')) return 'Linux';
  return 'Other';
}

function detectDevice(ua: string): string {
  if (!ua) return 'unknown';
  if (ua.includes('iPad') || ua.includes('Tablet') || (ua.includes('Android') && !ua.includes('Mobile'))) return 'tablet';
  if (ua.includes('Mobile') || ua.includes('iPhone') || ua.includes('iPod') || (ua.includes('Android') && ua.includes('Mobile'))) return 'mobile';
  return 'desktop';
}

// =============================================================================
// Collecte complète des données navigateur
// =============================================================================

function collectBrowserData(): Record<string, any> {
  const ua = navigator.userAgent;
  const ref = document.referrer;

  const data: Record<string, any> = {
    // Données de base enrichies
    userAgent: ua,
    browser: detectBrowser(ua),
    os: detectOS(ua),
    device: detectDevice(ua),
    referrer: ref,
    language: navigator.language?.split('-')[0] || 'en',
    languages: (navigator.languages || [navigator.language]).join(','),

    // Ecran
    screenResolution: `${screen.width}x${screen.height}`,
    viewportSize: `${window.innerWidth}x${window.innerHeight}`,
    pixelRatio: window.devicePixelRatio || 1,
    colorDepth: screen.colorDepth || 24,

    // Timezone
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,

    // Touch
    touchSupport: navigator.maxTouchPoints > 0,

    // Platform
    platform: navigator.platform || '',

    // Cookies
    cookiesEnabled: navigator.cookieEnabled,

    // Hardware
    hardwareConcurrency: navigator.hardwareConcurrency || undefined,

    // Source sociale
    socialSource: detectSocialSource(ref, ua),
  };

  // Device memory (Chrome only)
  if ('deviceMemory' in navigator) {
    data.deviceMemory = (navigator as any).deviceMemory;
  }

  // Connection info (Chrome only)
  const conn = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;
  if (conn) {
    data.connectionType = conn.effectiveType || conn.type || undefined;
    data.connectionSpeed = conn.downlink || undefined;
  }

  // Device fingerprint simple (hash de données stables)
  const fpData = [
    ua,
    screen.width,
    screen.height,
    screen.colorDepth,
    window.devicePixelRatio,
    navigator.language,
    navigator.platform,
    navigator.hardwareConcurrency,
    Intl.DateTimeFormat().resolvedOptions().timeZone,
  ].join('|');

  let hash = 0;
  for (let i = 0; i < fpData.length; i++) {
    const char = fpData.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  data.deviceFingerprint = `fp-${Math.abs(hash).toString(36)}`;

  return data;
}

// =============================================================================
// Composant Page
// =============================================================================

export default function TrackingLinkPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;

    async function trackAndRedirect() {
      try {
        // 1. Collecte de toutes les données navigateur
        const data = collectBrowserData();

        // 2. Capture des UTM params depuis l'URL du clic (/l/token?utm_source=...)
        const utmSource = searchParams.get('utm_source');
        const utmMedium = searchParams.get('utm_medium');
        const utmCampaign = searchParams.get('utm_campaign');
        const utmTerm = searchParams.get('utm_term');
        const utmContent = searchParams.get('utm_content');

        if (utmSource) data.utmClickSource = utmSource;
        if (utmMedium) data.utmClickMedium = utmMedium;
        if (utmCampaign) data.utmClickCampaign = utmCampaign;
        if (utmTerm) data.utmClickTerm = utmTerm;
        if (utmContent) data.utmClickContent = utmContent;

        // 3. POST au gateway
        const url = buildApiUrl(`/tracking-links/${token}/click`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });

        if (response.ok) {
          const result = await response.json();
          const originalUrl = result.data?.originalUrl || result.originalUrl;

          if (originalUrl) {
            // 4. Redirect
            window.location.replace(originalUrl);
            return;
          }
        }

        // Fallback: si le POST échoue, essayer un GET direct au gateway
        setError(true);
      } catch (err) {
        console.error('[TrackingLink] Error:', err);
        setError(true);
      }
    }

    trackAndRedirect();
  }, [token, searchParams]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center space-y-6 p-8">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <svg className="h-8 w-8 text-red-600 dark:text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Lien introuvable
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ce lien de tracking n'existe pas ou a expiré.
            </p>
          </div>
          <a
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retour à l'accueil
          </a>
        </div>
      </div>
    );
  }

  // Loading state
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
      <div className="text-center space-y-6 p-8">
        <div className="flex justify-center">
          <div className="relative">
            <div className="h-16 w-16 rounded-full border-4 border-blue-200 dark:border-blue-800"></div>
            <div className="absolute top-0 h-16 w-16 animate-spin rounded-full border-4 border-transparent border-t-blue-600 dark:border-t-blue-400"></div>
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
            Redirection en cours...
          </h1>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Vous allez être redirigé vers votre destination
          </p>
        </div>
        <div className="flex justify-center gap-2">
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400 [animation-delay:-0.3s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400 [animation-delay:-0.15s]"></div>
          <div className="h-3 w-3 animate-bounce rounded-full bg-blue-600 dark:bg-blue-400"></div>
        </div>
      </div>
    </div>
  );
}
