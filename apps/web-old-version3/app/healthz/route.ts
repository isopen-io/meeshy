import { baseDeLaPasserellePublique } from '@/lib/api/passerelle';

/**
 * LA SANTÉ DU CONTENEUR DIT AUSSI SA CONFIGURATION.
 *
 * Cette route répondait `{ ok: true }` en statique : un conteneur qui démarre
 * est sain, quoi qu'il serve. Sur staging (2026-09-05), un conteneur SANS
 * `NEXT_PUBLIC_API_URL` est ainsi devenu sain, Traefik lui a envoyé les
 * lecteurs, et chaque document remettait au navigateur l'adresse INTERNE de la
 * passerelle — bloquée en contenu mixte, donc un fil sans temps réel ni médias,
 * sans qu'aucun signal ne le dise. La configuration se lit à l'EXÉCUTION (d'où
 * `force-dynamic` : en statique, le verdict serait celui de la machine de
 * build) et un conteneur qui ne peut pas nommer la passerelle au navigateur
 * n'est PAS sain : 503, avec la cause, avant qu'un lecteur ne le découvre.
 */
export const dynamic = 'force-dynamic';

export function GET(): Response {
  try {
    return Response.json({ ok: true, passerellePublique: baseDeLaPasserellePublique() });
  } catch (erreur) {
    const cause = erreur instanceof Error ? erreur.message : String(erreur);
    return Response.json({ ok: false, cause }, { status: 503 });
  }
}
