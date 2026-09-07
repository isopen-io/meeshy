import { jetonDuLecteur } from '@/app/session';

/**
 * `/settings/notification` — UN ALIAS, pas un écran : la planche range
 * `notifPrefs` sous la boîte de notifications (`lib/contenu/reglages.ts`,
 * doc-comment de tête), et `/notifications/preferences` (#4899) porte déjà
 * tout le contenu de `detail-notification` — treize bascules ET, depuis ce
 * lot, l'édition de la fenêtre DND. Une seconde vue à cette adresse aurait été
 * la jumelle que la charte interdit.
 */
const CHEMIN = '/settings/notification';
const CIBLE = '/notifications/preferences';

export const GET = (requete: Request): Response => {
  const jeton = jetonDuLecteur(requete);
  if (jeton === null) {
    return new Response(null, {
      status: 302,
      headers: { location: `/login?returnUrl=${encodeURIComponent(CHEMIN)}`, 'cache-control': 'no-store, private' },
    });
  }
  return new Response(null, { status: 302, headers: { location: CIBLE, 'cache-control': 'no-store, private' } });
};

export const dynamic = 'force-dynamic';
