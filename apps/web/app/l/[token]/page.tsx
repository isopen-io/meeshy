/**
 * Page de redirection pour les liens de tracking Meeshy
 * Route: /l/[token]
 * 
 * Cette page:
 * 1. Récupère le token du lien de tracking
 * 2. Enregistre le clic avec les informations du visiteur (IP, user-agent, etc.)
 * 3. Redirige vers l'URL originale
 */

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

interface TrackingLinkPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Génère une empreinte simple de l'appareil côté serveur
 */
function generateServerDeviceFingerprint(userAgent: string, ip: string): string {
  let hash = 0;
  const data = `${userAgent}-${ip}`;
  
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash;
  }
  
  return `fp-server-${Math.abs(hash)}`;
}

/**
 * Détecte le navigateur depuis le user agent
 */
function detectBrowser(userAgent: string): string {
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) return 'Chrome';
  if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) return 'Safari';
  if (userAgent.includes('Edg')) return 'Edge';
  if (userAgent.includes('Opera') || userAgent.includes('OPR')) return 'Opera';
  return 'Other';
}

/**
 * Détecte l'OS depuis le user agent
 */
function detectOS(userAgent: string): string {
  if (userAgent.includes('Windows')) return 'Windows';
  if (userAgent.includes('Mac OS')) return 'macOS';
  if (userAgent.includes('Linux')) return 'Linux';
  if (userAgent.includes('Android')) return 'Android';
  if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) return 'iOS';
  return 'Other';
}

/**
 * Détecte le type d'appareil depuis le user agent
 */
function detectDevice(userAgent: string): string {
  if (userAgent.includes('Mobile') || userAgent.includes('Android') || userAgent.includes('iPhone')) {
    return 'mobile';
  }
  if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
    return 'tablet';
  }
  return 'desktop';
}

/**
 * Enregistre le clic et retourne l'URL originale
 */
async function recordClickAndGetUrl(token: string, clickData: any): Promise<string | null> {
  try {
    // Utiliser API_URL (serveur) au lieu de NEXT_PUBLIC_API_URL (client)
    // Car ce code s'exécute côté serveur (Server Component)
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const url = `${apiUrl}/api/tracking-links/${token}/click`;

    console.log('[TRACKING_LINK] Enregistrement du clic pour token:', token);
    console.log('[TRACKING_LINK] URL API:', url);
    console.log('[TRACKING_LINK] Click data:', clickData);

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(clickData),
      cache: 'no-store',
      // @ts-ignore - Ignorer la vérification SSL en développement pour certificats auto-signés
      ...(process.env.NODE_ENV === 'development' && {
        agent: new (await import('https')).Agent({
          rejectUnauthorized: false
        })
      })
    });

    console.log('[TRACKING_LINK] Réponse HTTP:', response.status, response.statusText);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[TRACKING_LINK] ❌ Erreur API:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    console.log('[TRACKING_LINK] Données reçues:', JSON.stringify(data, null, 2));

    const originalUrl = data.data?.originalUrl || data.originalUrl || null;
    console.log('[TRACKING_LINK] URL originale extraite:', originalUrl);

    return originalUrl;
  } catch (error) {
    console.error('[TRACKING_LINK] ❌ Exception lors de l\'enregistrement:', error);
    return null;
  }
}

/**
 * Page de redirection pour les liens de tracking
 */
export default async function TrackingLinkPage({ params }: TrackingLinkPageProps) {
  const { token } = await params;

  console.log('[TRACKING_LINK] ========================================');
  console.log('[TRACKING_LINK] Page de tracking appelée avec token:', token);

  // Récupérer les headers
  const headersList = await headers();
  const userAgent = headersList.get('user-agent') || '';
  const ip = headersList.get('x-forwarded-for') || headersList.get('x-real-ip') || 'unknown';
  const referrer = headersList.get('referer') || headersList.get('referrer') || '';
  const acceptLanguage = headersList.get('accept-language') || '';

  // Extraire la langue principale
  const language = acceptLanguage.split(',')[0]?.split('-')[0] || 'en';

  // Détection des informations du visiteur
  const browser = detectBrowser(userAgent);
  const os = detectOS(userAgent);
  const device = detectDevice(userAgent);
  const deviceFingerprint = generateServerDeviceFingerprint(userAgent, ip);

  console.log('[TRACKING_LINK] Informations visiteur:', {
    browser,
    os,
    device,
    language,
    ip,
    deviceFingerprint: deviceFingerprint.substring(0, 20) + '...'
  });

  // Préparer les données du clic
  const clickData = {
    userAgent,
    browser,
    os,
    device,
    language,
    referrer,
    deviceFingerprint,
    ipAddress: ip,
  };


  // Enregistrer le clic et récupérer l'URL originale
  const originalUrl = await recordClickAndGetUrl(token, clickData);

  if (originalUrl) {
    console.log('[TRACKING_LINK] ✅ Redirection vers:', originalUrl);
    redirect(originalUrl);
  } else {
    console.error('[TRACKING_LINK] ❌ Échec récupération URL pour token:', token);
    console.error('[TRACKING_LINK] ❌ Redirection vers la page d\'accueil avec erreur');
    // Rediriger vers la page d'accueil ou une page d'erreur
    redirect('/?error=invalid-tracking-link');
  }
}

/**
 * Métadonnées dynamiques pour la page
 */
export async function generateMetadata({ params }: TrackingLinkPageProps) {
  const { token } = await params;
  
  return {
    title: 'Redirection Meeshy',
    description: 'Vous êtes en cours de redirection...',
    robots: 'noindex, nofollow',
  };
}
