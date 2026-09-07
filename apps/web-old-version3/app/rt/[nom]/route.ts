import { actifParNom } from '@/lib/actifs-rt';

/**
 * `/__v3/rt/:nom` — les DEUX actifs du temps réel, servis dans la ZONE
 * (conception § 12.4) : `participate.<hash>.js` et `socket.io.<hash>.js`.
 *
 * Le fichier vit sous `app/rt/`, pas sous `app/__v3/rt/` : Next ignore tout
 * segment de `app/` qui commence par `_` (dossier privé — `next/dist/build/
 * entries.js`, `ignorePartFilter`), et une route qui y vivrait ne serait
 * jamais servie. L'adresse dans la zone vient de la réécriture
 * `/__v3/rt/:nom → /rt/:nom` que `next.config.ts` pose depuis
 * `scripts/lib/perimetre-de-zone.mjs`, le site UNIQUE de cette déclaration.
 *
 * Pourquoi un gestionnaire de route, et pas `public/` ni le pipeline webpack :
 * `public/` est servi à la RACINE de l'URL, donc par le legacy derrière Traefik
 * (§ 4.4, mesuré) ; le pipeline webpack émettrait un fichier verbatim sous un
 * nom que personne ne compose. Ici le nom porte le hash du contenu, calculé par
 * `lib/actifs-rt.ts` — le même module qui écrit l'URL dans le document — et la
 * réponse est IMMUABLE : un octet qui change change l'adresse.
 *
 * Un nom inconnu — y compris un hash périmé après un redéploiement — rend 404 :
 * le chargeur du fil l'avale, et le fil reste ce qu'il est sans JavaScript.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = async (
  _requete: Request,
  contexte: { params: Promise<{ nom: string }> },
): Promise<Response> => {
  const { nom } = await contexte.params;
  const actif = actifParNom(nom);

  if (actif === null) return new Response(null, { status: 404, headers: { 'cache-control': 'no-store' } });

  return new Response(actif.corps, {
    status: 200,
    headers: {
      'content-type': 'text/javascript; charset=utf-8',
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
    },
  });
};
