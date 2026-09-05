import type { CauseDeCloture } from '@/lib/api/links';

import { documentDeLEcran, type LigneDuDocument } from '../document';
import { etatDeCloture } from './etats';

/**
 * Le DOCUMENT de l'écran d'un lien clos — ce que `route.ts` sert, octet pour
 * octet.
 *
 * Il vit ici, et pas dans le gestionnaire, pour une raison de mesure : Next
 * VALIDE les exports d'un `route.ts` (seuls les verbes HTTP et les options de
 * segment y sont admis), donc le gestionnaire ne peut rien exposer d'autre que
 * `GET`. Or le gate d'accessibilité (§ 9.5) juge une PAGE dans un DOM, et
 * `jsdom` — l'environnement qu'`axe` exige — ne fournit ni `Request` ni
 * `Response` : sans ce module, le témoin a11y devrait RECONSTITUER le document
 * à côté de celui qui est servi, c'est-à-dire juger une jumelle.
 *
 * La séparation dit aussi ce que chacun fait : `etats.ts` dit CE QUE l'écran
 * annonce, ce module comment il est DESSINÉ, `route.ts` ce qui est SERVI —
 * l'enveloppe HTTP et rien d'autre.
 */

/**
 * Un titre CONSTANT, et c'est délibéré : le faire dépendre de la cause
 * l'exposerait dans l'onglet et dans tout historique qui le recopie. La raison,
 * elle, est dans le `<h1>` — là où le lecteur la lit.
 *
 * `noindex, nofollow` parce qu'une adresse de lien mort n'a rien à faire dans un
 * index, et pour la même raison que `apps/web/app/story/layout.tsx` le pose : un
 * extrait indexé survivrait au contenu qu'il annonce. Aucune CARTE d'aperçu non
 * plus — un lien mort n'a pas de contenu à annoncer.
 */
const META = {
  titre: 'Lien indisponible — Meeshy',
  description: 'Ce lien de partage ne donne plus accès à son contenu.',
  robots: 'noindex, nofollow',
  carte: null,
} as const;

const SOUS_TITRE = 'Accès refusé';
const PASTILLE = { glyphe: 'ph-warning-circle', ton: 'alerte' } as const;
const VERIFIE = 'À l’instant';

export const documentDuLienClos = ({
  cause,
  token,
}: {
  readonly cause: CauseDeCloture;
  readonly token: string;
}): string => {
  const etat = etatDeCloture({ cause, token });

  const lignes: readonly LigneDuDocument[] = [
    { cle: 'Jeton', valeur: `l/${token}` },
    { cle: 'Statut', valeur: etat.statut },
    { cle: 'État vérifié', valeur: VERIFIE },
  ];

  return documentDeLEcran({
    meta: META,
    entete: { titre: etat.entete, sous: SOUS_TITRE },
    pastille: PASTILLE,
    titre: etat.titre,
    corps: etat.corps,
    lignes,
    principal: etat.principal,
    secondaire: etat.secondaire,
  });
};
