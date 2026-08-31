import { Icone } from '@/components/ui/icone';
import { SpriteDeLEcran } from '@/components/ui/icones';

import styles from './fil.module.css';
import { IlotDuFil, type ContexteDuFil } from './ilot-fil';

/**
 * L'ÉCRAN `thread` — le fil d'une conversation partagée, lu et écrit SANS
 * COMPTE (planche `thread`, `cible/thread.png`, matrice ordre 5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUI EST SERVEUR, ET POURQUOI CE PARTAGE-LÀ
 * ────────────────────────────────────────────────────────────────────────────
 *
 * La coquille — cadre, en-tête, titre, puce de langue — est RENDUE PAR LE
 * SERVEUR, et la première page de messages arrive DANS LE HTML. C'est ce qui
 * rend vraie la première ligne du § 6.3 B (« rend d'abord le cache : jamais de
 * spinner sur un cache non vide ») sans une ligne de JavaScript : sur un
 * téléphone en 3G, le fil est lisible avant que le moindre chunk n'ait été
 * exécuté.
 *
 * L'îlot ne prend la main que pour ce qu'un serveur ne peut pas faire : le
 * battement, la reprise au retour d'arrière-plan, la file hors-ligne et
 * l'envoi optimiste.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * CE QUE CET ÉCRAN NE REND PAS, ET QUI EST DANS LA CIBLE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Écarts DÉCLARÉS, chacun avec sa raison :
 *
 *   • la carte « Appel audio manqué ». Les 25 événements `call:*` sont hors
 *     périmètre v3 (§ 5.3, P2) : la peindre serait afficher un état qu'aucun
 *     transport ne produit, et son bouton de rappel serait inerte (loi 4) ;
 *   • la puce « Messages riches ». C'est l'écran `rich` (matrice ordre 6), sa
 *     propre issue et son propre budget ;
 *   • les drapeaux de langue sous chaque bulle. La cible en dessine deux par
 *     message (origine et destination) ; la v3 sert UNE langue par bulle — celle
 *     que le Prisme a élue — et l'annonce par `lang` plus un glyphe `translate`.
 *     Dire « en → fr » supposerait d'afficher aussi l'original, c'est-à-dire de
 *     transporter les deux textes : c'est l'écran `sheet:lang` (L3) ;
 *   • le nombre de personnes en ligne. La visibilité de la présence est
 *     restreinte aux amis acceptés (directive 2026-08-25) : un invité n'y a
 *     droit sur PERSONNE, et un agrégat servi ici serait la sélection que la
 *     règle interdit. La ligne sous le titre dit donc ce que l'invité peut
 *     savoir — son propre statut de lecteur sans compte ;
 *   • la ligne système « Tolu a rejoint la conversation ». C'est un message de
 *     TYPE système (`Message.messageType`), que la projection de la v3 ne lit
 *     pas : la peindre demanderait de décider ce qu'on rend des autres types
 *     système, ce qui est un lot à soi.
 *
 * Quatre autres écarts NE FIGURAIENT PAS dans cette liste et n'étaient pas non
 * plus rendus — l'avatar, le badge fantôme, la mention « anonyme » et l'HEURE
 * de chaque bulle. Une liste d'écarts se lit comme exhaustive, donc leur
 * absence de la liste les déclarait présents à l'écran. Ils sont rendus depuis
 * (`bulle.tsx`, et le fantôme ci-dessous pour l'en-tête).
 */

/**
 * Les glyphes que cet écran rend. `ph-caret-left`, `ph-translate` et
 * `ph-warning-circle` sont déjà dans le sous-sprite critique de la coquille ;
 * `symbolesAInliner` les retire seul. La liste dit ce que l'ÉCRAN a besoin de
 * voir — la taire deviendrait faux le jour où le sous-sprite change.
 *
 * `ph-ghost` y figurait sans qu'AUCUN nœud ne le rende, alors que
 * `packages/icons/critique.json` réserve pour lui une des huit places du
 * sous-sprite critique en le justifiant NOMMÉMENT par cet écran-ci (« le badge
 * invité de la vue rights ET DE L'EN-TÊTE D'UNE CONVERSATION REJOINTE SANS
 * COMPTE »). Une place du sous-sprite critique tenue pour un pixel qui n'existe
 * pas est une dépense d'octets au-dessus de la ligne de flottaison, payée par
 * le rôle premier. Le glyphe est rendu, aux deux endroits que sa justification
 * nomme : l'EN-TÊTE (ici) et le badge de chaque auteur sans compte
 * (`bulle.tsx`).
 */
const GLYPHES: readonly string[] = [
  'ph-caret-left',
  'ph-translate',
  'ph-ghost',
  'ph-clock',
  'ph-clock-counter-clockwise',
  'ph-checks',
  'ph-paperclip',
  'ph-arrow-up',
  'ph-arrow-down',
];

export type EcranDuFil = {
  readonly nom: string | null;
  readonly contexte: ContexteDuFil;
  /** L'adresse de retour — un `<a>` réel : elle peut sortir du périmètre v3 (§ 3.2 corollaire 4). */
  readonly retour: string;
  readonly reprise: () => void | Promise<void>;
};

export function VueDuFil({ ecran }: { readonly ecran: EcranDuFil }) {
  const { contexte, nom, retour, reprise } = ecran;

  return (
    <div className={styles.cadre}>
      <SpriteDeLEcran glyphes={GLYPHES} />

      <header className={styles.entete}>
        {/*
          Un `<a>` réel, jamais un `<Link>` : le retour peut mener hors du
          périmètre v3, où la navigation client-side de Next ne va pas (§ 3.2
          corollaire 4, garanti par un lint).
        */}
        <a className={styles.retour} href={retour} aria-label="Revenir">
          <Icone nom="ph-caret-left" />
        </a>
        <div className={styles.titres}>
          <h1 className={styles.titre}>{nom ?? 'Conversation'}</h1>
          {/*
            Le fantôme de la cible, à l'endroit exact que `critique.json`
            nomme : l'en-tête d'une conversation rejointe sans compte. Il est
            DÉCORATIF — la phrase qui le suit dit déjà tout ce qu'il signifie,
            et l'annoncer ferait lire deux fois la même chose.
          */}
          <p className={styles.sous}>
            <Icone nom="ph-ghost" />
            Vous lisez et écrivez sans compte.
          </p>
        </div>
      </header>

      {/*
        Un `<p>`, pas un `<nav>` : la puce DIT le prisme dans lequel le fil est
        servi, elle ne mène nulle part. Un repère de navigation sans lien est un
        repère que le lecteur d'écran annonce pour rien — et en faire un bouton
        serait un contrôle inerte tant que `sheet:lang` (L3) n'existe pas.
      */}
      <p className={styles.puces}>
        <span className={styles.puce}>
          <Icone nom="ph-translate" />
          AUTO · {contexte.langueDeclaree ?? contexte.langueDuDocument}
        </span>
      </p>

      <main id="main-content" className={styles.corps}>
        <IlotDuFil contexte={contexte} reprise={reprise} />
      </main>
    </div>
  );
}
