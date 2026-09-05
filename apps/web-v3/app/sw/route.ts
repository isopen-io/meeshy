import { actifTravailleur } from '@/lib/sw/actif-sw';

/**
 * `/__v3/sw` — le TRAVAILLEUR DE ZONE (#4473), servi DANS la zone.
 *
 * Même architecture que `app/rt/[nom]/route.ts` (gestionnaire de route, jamais
 * `public/` — § 4.4 : la racine appartient au legacy), avec TROIS différences
 * qui sont chacune une décision :
 *
 * - L'URL est STABLE, sans hash : l'URL d'un Service Worker est son identité —
 *   en changer enregistrerait un worker NEUF au lieu de mettre à jour
 *   l'existant. La version vit dans le CORPS (l'empreinte substituée par
 *   `lib/sw/actif-sw.ts`, qui nomme le cache `meeshy-v3-sw-<empreinte>`).
 *
 * - `Service-Worker-Allowed: /` : la portée maximale d'un worker est par
 *   défaut le répertoire de son script — `/__v3/` ne couvrirait jamais `/l/`.
 *   Cet en-tête la porte à la racine, ce qui LÈVE la « nécessité de portée »
 *   qui aurait exigé de servir le script à la racine de l'URL (§ 7) : le
 *   script vit sous `/__v3/sw`, un chemin que `V3_ZONE_PREFIXES` couvre déjà
 *   (`/__v3`, segment-aware) — aucune fenêtre de propagation legacy. Les
 *   portées réellement DEMANDÉES restent étroites (#4472) : l'en-tête est un
 *   plafond, pas une registration.
 *
 * - `no-cache`, pas `immutable` : le navigateur doit revalider ce corps à
 *   chaque vérification d'update — un worker immuable ne se mettrait jamais à
 *   jour.
 *
 * `.rt/sw.js` absent ⇒ 404 `no-store`, et la registration côté document
 * l'avale (`catch` silencieux) : le worker n'existe pas pour ce déploiement.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (): Promise<Response> => {
  const actif = actifTravailleur();

  if (actif === null) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

  return new Response(actif.corps, {
    status: 200,
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'no-cache',
      'service-worker-allowed': '/',
      'x-content-type-options': 'nosniff',
    },
  });
};
