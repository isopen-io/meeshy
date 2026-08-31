import { Icone } from '@/components/ui/icone';

import styles from './fil.module.css';
import { heureDe, initiales, type Bulle } from './fil-modele';

/**
 * UNE BULLE DU FIL — la ligne de la cible, élément par élément
 * (`docs/product/MeeshyWebV3Design/cible/thread.png`).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * QUATRE ÉLÉMENTS QUI MANQUAIENT, ET QUI NE FIGURAIENT DANS AUCUN ÉCART DÉCLARÉ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * L'écran nommait quatre écarts avec leur raison (carte d'appel, puce
 * « Messages riches », double drapeau, nombre en ligne) et en laissait quatre
 * autres SANS MENTION — ce qui est pire qu'un écart, parce qu'une liste
 * d'écarts se lit comme exhaustive :
 *
 *   1. l'AVATAR circulaire à initiales devant chaque message ;
 *   2. le BADGE FANTÔME du participant sans compte — que
 *      `packages/icons/critique.json` justifie NOMMÉMENT par cet écran-ci
 *      (« le badge invité de la vue rights ET DE L'EN-TÊTE D'UNE CONVERSATION
 *      REJOINTE SANS COMPTE »), et qui occupait donc une des huit places du
 *      sous-sprite critique sans rien rendre ;
 *   3. la mention « anonyme » à côté du pseudo ;
 *   4. l'HEURE de chaque bulle. `instantMs` était calculé, transporté, et ne
 *      servait qu'au TRI.
 *
 * Les quatre sont du HTML pur : aucun n'ajoute un octet de transport (les
 * données sont déjà là) et aucun ne demande un chunk (le glyphe est déjà dans
 * la coquille).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI RESTE DÉCLARÉ COMME ABSENT SUR CETTE LIGNE
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   • la ligne système « Tolu a rejoint la conversation ». C'est un message de
 *     TYPE système (`Message.messageType`), que la projection de la v3 ne lit
 *     pas et qu'aucun état de l'écran ne produit : la peindre demanderait de
 *     décider ce qu'on rend des 20 autres types système. Suivi hors de cette
 *     ligne ;
 *   • le fantôme sur MA propre bulle. Il est vrai — le visiteur est sans compte
 *     — et il n'apprend rien : c'est la seule identité que le lecteur connaît
 *     déjà. La cible ne le montre pas non plus (« Vous » y porte ses
 *     initiales).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * LA DISPOSITION EST CELLE DE LA CIBLE : UNE COLONNE, PAS DEUX
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La cible range TOUTES les bulles à gauche, « Vous » compris, et distingue
 * l'auteur par son NOM et par la double coche. L'écran alignait `moi` à droite
 * — un écart qui n'était pas déclaré non plus, et que l'avatar rendait
 * intenable (un avatar à droite d'un texte à droite n'est plus une ligne de
 * conversation). La classe `moi` reste, parce que ce qu'elle marque — la double
 * coche, l'accent — n'est pas une position.
 */
export function BulleDuFil({
  bulle,
  langueDuDocument,
  fuseau,
}: {
  readonly bulle: Bulle;
  readonly langueDuDocument: string;
  /**
   * Le fuseau de l'heure affichée. `UTC` au rendu SERVEUR et au premier rendu
   * client — la seule heure que les deux calculent pareil, donc la seule qui
   * n'oppose pas une divergence d'hydratation à chaque bulle —, `locale` après
   * le montage. Voir `heureDe`.
   */
  readonly fuseau: 'UTC' | 'locale';
}) {
  const fantome = bulle.anonyme && !bulle.moi;

  return (
    <li className={`${styles.bulle} ${bulle.moi ? styles.moi : styles.autre}`}>
      {/*
        L'avatar est DÉCORATIF : tout ce qu'il dit — le nom, le fait d'être
        sans compte — est écrit en toutes lettres juste à côté. L'annoncer
        ferait lire « I B Ibrahim » à un lecteur d'écran.
      */}
      <span className={styles.avatar} aria-hidden="true">
        {fantome ? <Icone nom="ph-ghost" /> : initiales(bulle.moi ? 'Vous' : bulle.auteur)}
      </span>

      <div className={styles.corpsDeBulle}>
        <p className={styles.auteur}>
          {bulle.moi ? 'Vous' : bulle.auteur}
          {fantome ? <span className={styles.anonyme}> anonyme</span> : null}
        </p>
        {/*
          `lang` n'est posé que quand la langue SERVIE diffère de celle du
          document (§ 5.4) : c'est ce qui « part À CÔTÉ » du texte, et sans lui un
          lecteur d'écran prononce une bulle yoruba en phonétique française. Le
          poser partout serait une redondance que les lecteurs d'écran annoncent.
        */}
        <p className={styles.texte} {...(bulle.langue === null ? {} : { lang: bulle.langue })}>
          {bulle.texte}
        </p>
        <p className={styles.pied}>
          {bulle.langue === null ? null : (
            <Icone nom="ph-translate" titre={`Traduit en ${bulle.langue}`} />
          )}
          {bulle.etat === 'en-attente' ? <Icone nom="ph-clock" titre="En attente d’envoi" /> : null}
          {bulle.etat === 'servie' && bulle.moi ? <Icone nom="ph-checks" titre="Envoyé" /> : null}
          {bulle.raison === null ? null : <span className={styles.raison}>{bulle.raison}</span>}
          {/*
            `<time>` et pas un `<span>` : le `datetime` porte l'instant EXACT,
            que le fuseau affiché soit UTC (avant hydratation) ou local. C'est
            la valeur qu'une machine lit, et elle n'est jamais fausse.
          */}
          <time className={styles.heure} dateTime={new Date(bulle.instantMs).toISOString()}>
            {heureDe({ instantMs: bulle.instantMs, langue: langueDuDocument, fuseau })}
          </time>
        </p>
      </div>
    </li>
  );
}
