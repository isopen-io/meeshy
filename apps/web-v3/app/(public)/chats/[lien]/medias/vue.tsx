import { Icone } from '@/components/ui/icone';
import { SpriteDeLEcran } from '@/components/ui/icones';

import type { AvisDeLaPlace } from '../etats';
import styles from './medias.module.css';
import type { Puce } from './etats';
import type { CarteAudio, Famille, Tuile } from './modele';

/**
 * L'ÉCRAN `media` — les médias d'une conversation partagée, parcourus SANS
 * COMPTE (planche `media`, `cible/media.png`, matrice ordre 7).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZÉRO JAVASCRIPT, ET CE N'EST PAS UNE PERFORMANCE — C'EST LE CRITÈRE
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Le critère de fin demande trois choses qu'aucun îlot n'apporterait mieux :
 * que chaque tuile OUVRE le média, que le poids soit affiché AVANT le
 * téléchargement, et qu'aucun octet de média ne parte à l'ouverture de la
 * grille. Un `<a href>` ouvre, le poids est une donnée de la liste, et l'absence
 * d'`<img>` garantit l'assertion CDP par CONSTRUCTION plutôt que par réglage.
 *
 * Le lecteur audio est le seul contrôle « vivant » de l'écran, et il est
 * NATIF — `<audio controls preload="none">`. Un lecteur dessiné à la main
 * (cercle violet, barre de progression, « 0:08 / 0:23 » de la cible) exigerait
 * un îlot ; sans JavaScript il serait INERTE, ce que la loi 4 refuse, sur
 * l'écran du rôle premier. `preload="none"` tient la même barre que la grille :
 * aucune connexion tant que personne n'a appuyé.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ÉCARTS DÉCLARÉS AVEC LA CIBLE, chacun avec sa raison
 * ────────────────────────────────────────────────────────────────────────────
 *
 *   • la CHROME du lecteur audio est celle du navigateur, pas le cercle violet
 *     de la cible : voir ci-dessus. Les trois éléments de la cible — bouton de
 *     lecture, progression, temps écoulé — y sont, dans le même ordre ;
 *   • la cible montre une carte audio SOUS une grille d'images. Ce sont deux
 *     familles, et la puce « Images » est allumée : les servir ensemble rendrait
 *     la puce sans effet (loi 4). L'écran sert la famille CHOISIE ;
 *   • la vignette. La cible ne dessine aucune image réelle — elle dessine des
 *     ardoises à glyphe, qui sont exactement l'état « rien n'est téléchargé ».
 *     C'est celui que l'écran rend, et le poids dit ce que l'ouverture coûtera ;
 *   • la barre de navigation basse (grille + avatar). Elle appartient au rôle
 *     secondaire : un visiteur sans compte n'a ni fil de contenus ni profil, et
 *     ses deux boutons seraient inertes.
 */

/**
 * Les glyphes que cet écran rend — CALCULÉS depuis ce qu'il rend, jamais listés.
 *
 * Une liste écrite à la main porte deux défauts, et le second est celui que
 * `vue-fil.tsx` a payé : elle oublie un glyphe le jour où l'écran en ajoute un,
 * et elle en garde un que plus aucun nœud ne rend — des octets inlinés
 * au-dessus de la ligne de flottaison, payés par le rôle premier. Ici le cas
 * est concret : la famille `audio` ne rend AUCUNE tuile (elle rend des cartes),
 * donc son glyphe de tuile n'est jamais dessiné, et une liste fixe l'aurait
 * embarqué à chaque visite.
 *
 * `ph-caret-left` est déjà dans le sous-sprite critique de la coquille ;
 * `symbolesAInliner` l'en retire seul.
 */
const glyphesDe = (ecran: EcranDesMedias): readonly string[] => [
  'ph-caret-left',
  ...(ecran.tuiles.length === 0 ? [] : ['ph-arrow-down', ...ecran.tuiles.map((tuile) => tuile.glyphe)]),
  ...(ecran.avis === null ? [] : ['ph-warning-circle']),
];

export type EcranDesMedias = {
  /** Le titre de la conversation — `null` quand la place ne le porte pas. */
  readonly nom: string | null;
  /** L'adresse du fil : un `<a>` réel, elle peut sortir du périmètre v3 (§ 3.2 corollaire 4). */
  readonly retour: string;
  readonly famille: Famille;
  readonly puces: readonly Puce[];
  readonly tuiles: readonly Tuile[];
  readonly cartes: readonly CarteAudio[];
  /** Ce que la lecture DIT quand elle ne sert pas — peint AU-DESSUS de ce qui est déjà lu. */
  readonly avis: AvisDeLaPlace | null;
};

const elements = (compte: number): string =>
  `${compte} ${compte > 1 ? 'éléments' : 'élément'}`;

function Grille({ tuiles }: { readonly tuiles: readonly Tuile[] }) {
  return (
    <ul className={styles.grille}>
      {tuiles.map((tuile) => (
        <li key={tuile.id}>
          {/*
            Le nom ACCESSIBLE porte le nom du fichier ET son poids ; le libellé
            VISIBLE n'est que le poids, et il est contenu dans le premier —
            c'est ce qu'exige le critère 2.5.3. Sans lui, un lecteur d'écran
            annoncerait quarante-huit liens « 420 Ko » indistinguables.
          */}
          <a className={styles.tuile} href={tuile.url} aria-label={tuile.etiquette}>
            <Icone nom={tuile.glyphe} className={styles.type} />
            {tuile.poids === null ? null : (
              <span className={styles.poids}>
                <Icone nom="ph-arrow-down" />
                {tuile.poids}
              </span>
            )}
          </a>
        </li>
      ))}
    </ul>
  );
}

function Cartes({ cartes }: { readonly cartes: readonly CarteAudio[] }) {
  return (
    <ul className={styles.cartes}>
      {cartes.map((carte) => (
        <li key={carte.id} className={styles.carte}>
          {/*
            `preload="none"` — le contrôle est là, atteignable au clavier, et
            n'ouvre AUCUNE connexion avant qu'on appuie. C'est ce qui rend
            l'assertion CDP du spec vraie sur un média que la page MONTE.
          */}
          <audio
            className={styles.lecteur}
            controls
            preload="none"
            src={carte.url}
            aria-label={`Écouter ${carte.nom}`}
          />
          <p className={styles.ligne}>
            <span>{[carte.duree, carte.poids].filter((part) => part !== null).join(' · ')}</span>
            {carte.mention === null ? null : <span>{carte.mention}</span>}
          </p>
          {carte.texte === null ? null : (
            /*
              `lang` sur le nœud dont le texte a été RÉSOLU dans une langue autre
              que celle du document (§ 9.5) — c'est ce qui « part à côté » du
              texte servi, sans quoi un lecteur d'écran le prononce dans la
              mauvaise phonétique.
            */
            <p className={styles.transcription} {...(carte.langue === null ? {} : { lang: carte.langue })}>
              {carte.texte}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

function Avis({ avis, retour }: { readonly avis: AvisDeLaPlace; readonly retour: string }) {
  return (
    <section className={styles.avis}>
      <h2 className={styles.avisTitre}>
        <Icone nom="ph-warning-circle" />
        {avis.titre}
      </h2>
      <p className={styles.avisCorps}>{avis.corps}</p>
      {avis.reprise === null ? null : (
        <nav aria-label="Suite">
          <a className={styles.reprise} href={retour}>
            {avis.reprise}
          </a>
        </nav>
      )}
    </section>
  );
}

export function VueDesMedias({ ecran }: { readonly ecran: EcranDesMedias }) {
  const { avis, cartes, nom, puces: onglets, retour, tuiles } = ecran;
  const compte = tuiles.length + cartes.length;

  return (
    <div className={styles.cadre}>
      <SpriteDeLEcran glyphes={glyphesDe(ecran)} />

      <header className={styles.entete}>
        <a className={styles.retour} href={retour} aria-label="Revenir à la conversation">
          <Icone nom="ph-caret-left" />
        </a>
        <div className={styles.titres}>
          <h1 className={styles.titre}>Médias partagés</h1>
          <p className={styles.sous}>
            {nom ?? 'Conversation'} · {elements(compte)}
          </p>
        </div>
      </header>

      {/*
        Les puces ne sont rendues que lorsqu'elles TRIENT quelque chose. Sans
        place, aucune famille n'est servie : les quatre mèneraient au même
        écran, c'est-à-dire à un contrôle sans effet (loi 4).
      */}
      {onglets.length === 0 ? null : (
        <nav className={styles.onglets} aria-label="Types de médias">
          <ul>
            {onglets.map((onglet) => (
              <li key={onglet.famille}>
                <a
                  className={`${styles.onglet} ${onglet.active ? styles.ongletActif : ''}`}
                  href={onglet.href}
                  {...(onglet.active ? { 'aria-current': 'page' as const } : {})}
                >
                  {onglet.libelle}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      )}

      <main id="main-content" className={styles.corps}>
        {avis === null ? null : <Avis avis={avis} retour={retour} />}
        {tuiles.length > 0 ? <Grille tuiles={tuiles} /> : null}
        {cartes.length > 0 ? <Cartes cartes={cartes} /> : null}
        {avis === null && compte === 0 ? (
          <p className={styles.vide}>Aucun média dans cette conversation pour l’instant.</p>
        ) : null}
      </main>
    </div>
  );
}
