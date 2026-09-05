import { prendsLePleinEcran } from './plein-ecran';

/**
 * LE MODULE DE LA GALERIE (`/chats/:cle/medias`, #4525) — la SEULE chose
 * qu'un écran SANS participation doit encore au clavier : fermer sa
 * surimpression à Échap, comme le fil (`participate.ts`) et la liste
 * (`liste.ts`) le font déjà pour la leur (`prendsLePleinEcran`, le site
 * UNIQUE de cette élévation, `lib/realtime/plein-ecran.ts`).
 *
 * La galerie n'a ni composeur, ni réserve, ni socket : lui faire télécharger
 * `participate.js` (26 Ko gzip) pour UN appel de fonction serait exactement
 * le défaut que les huit modules séparés existent pour éviter (§ 12.4,
 * doc-comment de `scripts/build-participate.mjs`, « un écran ne doit
 * télécharger que ce qu'il exécute »). Ce module n'ajoute donc AUCUNE ligne
 * de logique — seulement l'appel, sur la MÊME surface (`dialog[open][data-retour]`)
 * que le fil et la liste élèvent déjà.
 *
 * ÉLEVÉE INCONDITIONNELLEMENT, comme dans les deux autres modules : la porte
 * ne sert cette adresse qu'au membre authentifié (`app/chats/[cle]/medias/route.ts`
 * redirige sinon), donc il n'existe ici aucun repli de créance à faire courir
 * cet appel devant.
 */
prendsLePleinEcran();
