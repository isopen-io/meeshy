import type { Verdict } from '@/lib/api/messagerie';

import { ACCES_REFUSE, PLACE_FERMEE, avisDuLienMort, type AvisDeLaPlace } from '../etats';
import { FAMILLES, LIBELLE_DE_FAMILLE, type Famille, type GalerieServie } from './modele';

/**
 * CE QUE LA GALERIE DIT — la copie, et l'arbitrage des verdicts.
 *
 * Les avis ne sont pas réécrits ici : `PLACE_FERMEE` et `avisDuLienMort` vivent
 * avec le reste de la copie de cette route (`../etats.ts`), et la galerie les
 * REPREND. Deux modules de copie pour un même fait sont justes le jour où on
 * les écrit — et faux au premier mot changé d'un seul côté.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * L'INDISPONIBILITÉ SE DIT ICI, ALORS QUE LE FIL LA TAIT
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le fil ne peint RIEN sur une lecture indisponible : il a un cache — la
 * première page arrive dans le HTML —, donc une bannière d'incident au-dessus
 * d'un écran lisible ne dirait rien d'utile (§ 6.3 B). La galerie n'a AUCUN
 * cache : si la lecture tombe, l'écran est vide, et un vide muet se lit
 * « cette conversation n'a aucun média ». C'est un mensonge sur une coupure —
 * le seul cas où le § 7 demande de PARLER.
 */

export const GALERIE_INDISPONIBLE: AvisDeLaPlace = {
  titre: 'Les médias n’ont pas pu être chargés',
  corps:
    'La connexion n’a pas abouti. Rien n’est perdu : la conversation reste lisible, réessayez plus tard.',
  reprise: null,
};

/**
 * AUCUNE PLACE N'OUVRE CETTE GALERIE.
 *
 * Ce n'est ni un refus, ni une panne : c'est l'ordre normal des choses quand on
 * ouvre l'adresse des médias sans être entré. L'écran le dit et montre la porte,
 * plutôt que de rediriger — une redirection ferait disparaître l'adresse
 * partagée de la barre du navigateur, et le visiteur ne saurait plus où il
 * allait.
 */
export const PLACE_ABSENTE: AvisDeLaPlace = {
  titre: 'Entrez dans la conversation',
  corps: 'Les médias partagés s’ouvrent depuis la conversation : rejoignez-la pour les parcourir.',
  reprise: 'Aller à la conversation',
};

/**
 * LA LECTURE PARTIELLE — ce qui est lu reste lu, et le trou se DIT.
 *
 * La puce « Fichiers » interroge DEUX portes (`document` et `text`). Quand
 * l'une tombe et que l'autre sert, la galerie garde ce qu'elle a — « erreur
 * réseau ≠ 401 » — mais elle ne peut pas se taire : la liste affichée est
 * INCOMPLÈTE, et le compte sous le titre l'annonce comme un total. Sans cette
 * ligne, un visiteur conclut que la moitié manquante n'existe pas.
 */
export const GALERIE_PARTIELLE: AvisDeLaPlace = {
  titre: 'Une partie des médias manque',
  corps:
    'Tout n’a pas pu être chargé : ce qui s’affiche est incomplet. Rien n’est perdu, réessayez dans un instant.',
  reprise: null,
};

export const avisDeLaGalerie = (verdict: Verdict<GalerieServie>): AvisDeLaPlace | null => {
  if (verdict.etat === 'close') return PLACE_FERMEE;
  if (verdict.etat === 'lien-mort') return avisDuLienMort(verdict.cause);
  if (verdict.etat === 'refus') return ACCES_REFUSE;
  if (verdict.etat === 'indisponible') return GALERIE_INDISPONIBLE;
  return verdict.valeur.partielle ? GALERIE_PARTIELLE : null;
};

export type Puce = {
  readonly famille: Famille;
  readonly libelle: string;
  /** Une ADRESSE, jamais un gestionnaire : la puce doit trier sans JavaScript. */
  readonly href: string;
  readonly active: boolean;
};

/**
 * LES QUATRE PUCES DE LA CIBLE, en liens.
 *
 * La famille par défaut ne porte AUCUN paramètre : `/chats/:lien/medias` et
 * `/chats/:lien/medias?famille=images` seraient deux adresses pour un même
 * écran, donc deux entrées d'historique et deux cartes de partage.
 */
export const puces = ({
  famille,
  retour,
}: {
  readonly famille: Famille;
  readonly retour: string;
}): readonly Puce[] =>
  FAMILLES.map((candidate) => ({
    famille: candidate,
    libelle: LIBELLE_DE_FAMILLE[candidate],
    href:
      candidate === FAMILLES[0]
        ? `${retour}/medias`
        : `${retour}/medias?famille=${encodeURIComponent(candidate)}`,
    active: candidate === famille,
  }));
