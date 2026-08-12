'use client';

/**
 * Page de redirection pour les liens de tracking Meeshy
 * Route: /l/[token]
 *
 * Client component qui:
 * 1. Collecte un maximum de données navigateur (screen, timezone, connection, etc.)
 * 2. Détecte la source sociale (WhatsApp, Telegram, etc.) via referrer + user-agent
 * 3. Capture les UTM params de l'URL du clic
 * 4. POST toutes les données au gateway (`/tracking-links/:token/click`)
 * 5. Résout la cible typée via `/tracking-links/:token/resolve` (spec §21.2)
 * 6. Route par `targetType` :
 *    - REEL/POST/STORY → tente l'ouverture app (Universal Link iOS, sinon
 *      custom scheme `meeshy://p|s/<id>`) + fallback web `/feeds/post/<id>`
 *    - CONVERSATION → `/conversations/<id>`
 *    - PROFILE → `/u/<id>`
 *    - EXTERNAL → `originalUrl` (validé via safeExternalUrl)
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { buildApiUrl } from '@/lib/config';
import { safeExternalUrl } from '@/utils/safe-redirect';
import { assignLocation, replaceLocation } from '@/lib/navigate';
import {
  buildAppOpenUrl,
  buildWebFallbackTarget,
  isAppOpenTarget,
  isResolutionExpired,
  normalizeTargetType,
  type TrackingLinkResolution,
} from '@/lib/deep-link';

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

function collectBrowserData(): Record<string, unknown> {
  const ua = navigator.userAgent;
  const ref = document.referrer;

  const data: Record<string, unknown> = {
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
    data.deviceMemory = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
  }

  // Connection info (Chrome only)
  const nav = navigator as unknown as {
    connection?: { effectiveType?: string; type?: string; downlink?: number };
    mozConnection?: { effectiveType?: string; type?: string; downlink?: number };
    webkitConnection?: { effectiveType?: string; type?: string; downlink?: number };
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
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
// Wiring du beacon de confirmation de redirection
// =============================================================================

/**
 * Wire visibility/pagehide beacons that confirm the redirect succeeded, plus
 * a timeout that reports failure when the page is still in the foreground.
 * Returns a cancel function used when we navigate same-origin (the web
 * fallback) and want to suppress the "failed" timeout.
 */
function wireRedirectConfirmation(token: string, clickId: string): () => void {
  const beaconUrl = buildApiUrl(`/tracking-links/${token}/redirect-status`);
  const confirmPayload = new Blob(
    [JSON.stringify({ clickId, status: 'confirmed' })],
    { type: 'application/json' }
  );

  let resolved = false;
  const confirmRedirect = () => {
    if (resolved) return;
    resolved = true;
    navigator.sendBeacon(beaconUrl, confirmPayload);
  };

  const onVisibility = () => {
    if (document.hidden) confirmRedirect();
  };
  document.addEventListener('visibilitychange', onVisibility, { once: true });
  window.addEventListener('pagehide', confirmRedirect, { once: true });

  const failureTimer = window.setTimeout(() => {
    if (resolved) return;
    resolved = true;
    fetch(beaconUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clickId, status: 'failed' }),
      keepalive: true,
    }).catch(() => {});
  }, 5000);

  return () => {
    resolved = true;
    window.clearTimeout(failureTimer);
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('pagehide', confirmRedirect);
  };
}

// =============================================================================
// Ouverture native (custom scheme) avec bascule web après timeout
// =============================================================================

const APP_OPEN_FALLBACK_MS = 1500;

/**
 * Attempt to open the native app via custom scheme, then fall back to the
 * provided web path after ~1.5s if the app never takes over. App takeover
 * is detected via visibilitychange / blur (the page is backgrounded once
 * iOS hands off to the app).
 */
function openAppThenFallback(appUrl: string, webFallback: () => void): void {
  let handedOff = false;
  const markHandoff = () => {
    if (document.hidden) handedOff = true;
  };
  const markBlur = () => {
    handedOff = true;
  };

  document.addEventListener('visibilitychange', markHandoff);
  window.addEventListener('blur', markBlur, { once: true });
  window.addEventListener('pagehide', markBlur, { once: true });

  // Trigger the native open. iOS opens the app if installed; otherwise the
  // page stays foreground and the timeout below routes to the web fallback.
  assignLocation(appUrl);

  window.setTimeout(() => {
    document.removeEventListener('visibilitychange', markHandoff);
    window.removeEventListener('blur', markBlur);
    window.removeEventListener('pagehide', markBlur);
    if (!handedOff) webFallback();
  }, APP_OPEN_FALLBACK_MS);
}

// =============================================================================
// Résolution de la cible typée
// =============================================================================

async function resolveTarget(token: string): Promise<TrackingLinkResolution | null> {
  try {
    const url = buildApiUrl(`/tracking-links/${token}/resolve`);
    const response = await fetch(url, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const json = await response.json();
    const data = (json?.data ?? json) as TrackingLinkResolution | undefined;
    return data ?? null;
  } catch {
    return null;
  }
}

// =============================================================================
// Composant Page
// =============================================================================

type PageState = 'loading' | 'error' | 'expired';

export default function TrackingLinkPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const token = params.token as string;
  const [state, setState] = useState<PageState>('loading');
  const [expiredFallbackUrl, setExpiredFallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    /**
     * Record the click (preserving full browser capture + sharer attribution).
     * Returns the legacy `originalUrl` (validated) and `clickId` so the
     * caller can wire the redirect-confirmation beacon.
     */
    async function recordClick(): Promise<{ originalUrl: string | null; clickId?: string }> {
      const data = collectBrowserData();

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

      try {
        const response = await fetch(buildApiUrl(`/tracking-links/${token}/click`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data),
        });
        if (!response.ok) return { originalUrl: null };
        const result = await response.json();
        const rawOriginalUrl = result.data?.originalUrl || result.originalUrl;
        const clickId = result.data?.clickId;
        return { originalUrl: safeExternalUrl(rawOriginalUrl), clickId };
      } catch {
        return { originalUrl: null };
      }
    }

    async function trackAndRedirect() {
      try {
        // 1. Enregistrer le clic (capture max + attribution sharerId côté gateway)
        //    et résoudre la cible typée, en parallèle.
        const [click, resolution] = await Promise.all([
          recordClick(),
          resolveTarget(token),
        ]);
        if (cancelled) return;

        // 2. Lien expiré / désactivé → message + fallback originalUrl si présent.
        if (resolution && isResolutionExpired(resolution)) {
          const fallback =
            safeExternalUrl(resolution.originalUrl) ?? click.originalUrl ?? null;
          setExpiredFallbackUrl(fallback);
          setState('expired');
          return;
        }

        const cancelBeacon = click.clickId
          ? wireRedirectConfirmation(token, click.clickId)
          : () => {};

        const targetType = resolution ? normalizeTargetType(resolution.targetType) : null;
        const targetId = resolution?.targetId ?? null;

        // 3. Routage par targetType.
        if (targetType) {
          // REEL / POST / STORY → tentative app + fallback web.
          if (isAppOpenTarget(targetType)) {
            const webPath = buildWebFallbackTarget(targetType, targetId, resolution?.originalUrl);
            const appUrl = buildAppOpenUrl(targetType, targetId);
            if (webPath) {
              const navigateWeb = () => replaceLocation(webPath);
              if (appUrl) {
                openAppThenFallback(appUrl, navigateWeb);
              } else {
                navigateWeb();
              }
              return;
            }
          } else {
            // CONVERSATION / PROFILE → route interne. EXTERNAL → originalUrl validé.
            const target = buildWebFallbackTarget(targetType, targetId, resolution?.originalUrl);
            if (target) {
              if (targetType === 'EXTERNAL') {
                const safe = safeExternalUrl(target);
                if (safe) {
                  replaceLocation(safe);
                  return;
                }
              } else {
                replaceLocation(target);
                return;
              }
            }
          }
        }

        // 4. Pas de résolution typée exploitable → fallback legacy originalUrl.
        if (click.originalUrl) {
          replaceLocation(click.originalUrl);
          return;
        }

        cancelBeacon();
        setState('error');
      } catch (err) {
        console.error('[TrackingLink] Error:', err);
        if (!cancelled) setState('error');
      }
    }

    trackAndRedirect();

    return () => {
      cancelled = true;
    };
  }, [token, searchParams]);

  if (state === 'expired') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800">
        <div className="text-center space-y-6 p-8">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
              <svg className="h-8 w-8 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">
              Lien expiré
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Ce lien de tracking n&apos;est plus actif.
            </p>
          </div>
          {expiredFallbackUrl ? (
            <a
              href={expiredFallbackUrl}
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Continuer vers la destination
            </a>
          ) : (
            <a
              href="/"
              className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retour à l&apos;accueil
            </a>
          )}
        </div>
      </div>
    );
  }

  if (state === 'error') {
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
              Ce lien de tracking n&apos;existe pas ou a expiré.
            </p>
          </div>
          <a
            href="/"
            className="inline-block px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Retour à l&apos;accueil
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
