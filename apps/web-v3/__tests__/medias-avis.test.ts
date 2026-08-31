/**
 * @jest-environment node
 */

import {
  ACCES_REFUSE,
  PLACE_FERMEE,
  avisDuLienMort,
} from '@/app/(public)/chats/[lien]/etats';
import {
  GALERIE_INDISPONIBLE,
  GALERIE_PARTIELLE,
  avisDeLaGalerie,
} from '@/app/(public)/chats/[lien]/medias/etats';
import { avisDuFil } from '@/app/(public)/chats/[lien]/fil-etats';
import type { GalerieServie } from '@/app/(public)/chats/[lien]/medias/modele';
import type { Verdict } from '@/lib/api/messagerie';

/**
 * CE QUE LA GALERIE DIT DE CHAQUE VERDICT — la copie, et surtout les états que
 * l'écran ne SÉPARAIT pas.
 *
 * La liste des états à dessiner (dimension 8) en compte six : vide, chargement,
 * erreur, hors-ligne, PERMISSION REFUSÉE, contenu expiré. Deux manquaient, et
 * les deux se peignaient en « la connexion n'a pas abouti … réessayez plus
 * tard » :
 *
 *   • le REFUS (403) — la connexion a abouti, la conversation n'est plus
 *     lisible, et réessayer n'y changera rien. Les trois membres de la phrase
 *     d'indisponibilité sont faux, et le troisième transforme un cul-de-sac en
 *     invitation à boucler ;
 *   • la lecture PARTIELLE — une porte sur deux tombée. Là c'est l'inverse :
 *     l'écran ne disait RIEN, et la liste amputée passait pour complète.
 *
 * Le fil et la galerie partagent la copie du refus (`../etats.ts`) : deux
 * phrases pour un même fait divergent au premier mot changé d'un seul côté, et
 * l'invité lirait deux choses différentes selon l'écran où le refus l'a surpris.
 */

const servie = (partielle: boolean): Verdict<GalerieServie> => ({
  etat: 'servi',
  valeur: { medias: [], partielle },
});

describe('l’avis de la galerie, un par verdict', () => {
  it('401 ⇒ la place fermée, 410 ⇒ le lien mort — la copie de la route, jamais une seconde', () => {
    expect(avisDeLaGalerie({ etat: 'close' })).toBe(PLACE_FERMEE);
    expect(avisDeLaGalerie({ etat: 'lien-mort', cause: 'lien-expire' })).toEqual(
      avisDuLienMort('lien-expire'),
    );
  });

  /**
   * LE DÉFAUT : un refus définitif peint en panne passagère. Le témoin exige
   * que l'avis ne soit PAS celui de l'indisponibilité — c'est ce qui le fait
   * tomber si un futur `else` les refond.
   */
  it('403 ⇒ un état NOMMÉ, et surtout pas l’avis d’indisponibilité', () => {
    const avis = avisDeLaGalerie({ etat: 'refus' });

    expect(avis).toBe(ACCES_REFUSE);
    expect(avis).not.toBe(GALERIE_INDISPONIBLE);
  });

  /**
   * Et il ne renvoie pas vers « plus tard » : la reprise mène à la
   * CONVERSATION, seul geste qui ait encore un effet (loi 4).
   */
  it('le refus offre une reprise, là où l’indisponibilité n’en offre aucune', () => {
    expect(ACCES_REFUSE.reprise).not.toBeNull();
    expect(GALERIE_INDISPONIBLE.reprise).toBeNull();
  });

  /**
   * LA MÊME PHRASE SUR LES DEUX ÉCRANS. Le fil et la galerie lisent la même
   * constante — c'est la propriété, pas le texte, que ce témoin garde.
   */
  it('le fil dit du refus exactement ce que la galerie en dit', () => {
    expect(avisDuFil({ type: 'acces-refuse' })).toBe(ACCES_REFUSE);
  });

  it('une lecture complète ne peint RIEN, une lecture amputée le DIT', () => {
    expect(avisDeLaGalerie(servie(false))).toBeNull();
    expect(avisDeLaGalerie(servie(true))).toBe(GALERIE_PARTIELLE);
  });

  it('l’indisponibilité garde sa propre phrase', () => {
    expect(avisDeLaGalerie({ etat: 'indisponible' })).toBe(GALERIE_INDISPONIBLE);
  });
});
