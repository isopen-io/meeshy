/**
 * `preact/compat` PLUS `use()`.
 *
 * Pourquoi ce fichier existe : TanStack Router lit `React.use` au chargement du
 * module (`var reactUse = React["use"]`). Sous Preact, la valeur est
 * `undefined` — le build ne rougit pas, l'import ne casse pas, et l'ecran
 * plante seulement le jour ou une route l'appelle. C'est exactement le genre de
 * defaut qu'un POC doit attraper avant qu'il ne coute une architecture.
 *
 * `use()` de React 19 accepte deux « usables » :
 *   - une PROMESSE : rend sa valeur si elle est tenue, releve son erreur si
 *     elle est rompue, et JETTE la promesse tant qu'elle est en attente — ce
 *     que Suspense (supporte par Preact) intercepte.
 *   - un CONTEXTE : rend sa valeur courante.
 *
 * Le suivi d'etat est porte par la promesse elle-meme (`status` / `value` /
 * `reason`), comme le fait React : sans cela, chaque rendu re-souscrirait et
 * Suspense boucherait.
 *
 * EN .js ET NON .ts, deliberement : les types de `preact/compat` sont publies
 * en `export =`, forme que ni `export *` ni un namespace ESM ne savent
 * reprendre (TS2498). Empiler des `@ts-expect-error` pour la contourner
 * couterait plus de confusion que ce fichier de quarante lignes n'apporte de
 * risque — il n'a qu'un role, et il est le seul du depot dans ce cas.
 */
import * as compat from 'preact/compat';

function estPromesse(valeur) {
  return typeof valeur === 'object' && valeur !== null && typeof valeur.then === 'function';
}

export function use(usable) {
  if (estPromesse(usable)) {
    if (usable.status === 'fulfilled') return usable.value;
    if (usable.status === 'rejected') throw usable.reason;
    if (usable.status !== 'pending') {
      usable.status = 'pending';
      void usable.then(
        (value) => Object.assign(usable, { status: 'fulfilled', value }),
        (reason) => Object.assign(usable, { status: 'rejected', reason }),
      );
    }
    throw usable;
  }
  return compat.useContext(usable);
}

export * from 'preact/compat';

/**
 * Le defaut doit PORTER `use` lui aussi : selon la facon dont une dependance
 * importe React (`import React from 'react'` ou `import * as React`), c'est
 * l'un ou l'autre objet qui est lu.
 */
const defautEtendu = { ...compat.default, use };
export default defautEtendu;
