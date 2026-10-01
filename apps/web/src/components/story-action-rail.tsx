import type { ReactNode } from 'react';

import { GlyphSvg, type GlyphShape } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { GLYPHS } from '@/components/glyphs';
import { THREAD_STATES_GLYPHS } from '@/components/glyphs-thread-states';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  resolveStoryExportRailButtons,
  storyActionRailButtons,
  type StoryActionRailButton,
  type StoryActionRailPlan,
} from '@/lib/stories/action-rail';
import { GLYPH_SIZE } from '@/components/ui-chrome';
import { percent, ringAppearance } from '@/lib/stories/save-progress';
import type { StorySaveJobView } from '@/lib/stories/save-store';

import { VIEWER_GLASS, VIEWER_RAIL_CORRIDOR, ViewerActionRail, type ViewerAction, type ViewerProbe } from './viewer-chrome';

/**
 * **LE RAIL D'ACTIONS DU LECTEUR DE STORIES** — miroir de
 * `StoryActionSidebarView` (`apps/ios/.../StoryViewerView+Sidebar.swift:464-836`),
 * posé sur le bord FIN de la scène, en bas.
 *
 * **LE DESSIN EST CELUI DE TOUS LES PLEIN ÉCRANS** (#8879,
 * `docs/product/visionneuse-plein-ecran.md`) : le disque de verre de 40 dans une
 * cible de 44, le compteur, l'écart de 8, la barre d'outils verticale, les
 * coupures du geste de plateau — tout cela est `ViewerActionRail`
 * (`viewer-chrome.tsx`), le MÊME rail que celui des Réels et de la visionneuse
 * de médias. Ce fichier ne garde que ce qui est PROPRE à la story : la loi
 * (quels boutons, pour qui), les tracés, les libellés, l'anneau d'export.
 *
 * **CE COMPOSANT NE DÉCIDE RIEN.** La loi vit dans `lib/stories/action-rail.ts`
 * (pure, éprouvée hors DOM) et l'ORDRE en est une donnée unique
 * (`STORY_ACTION_RAIL_ORDER`) que ce rendu PARCOURT — il n'existe nulle part
 * une seconde liste à tenir d'accord avec elle.
 *
 * **LOI 4 — UN CONTRÔLE EXISTE S'IL A UN EFFET.** Un bouton n'est rendu que si
 * la loi le dit **et** que l'hôte remet un gestionnaire (`handlers`), **et**
 * qu'un tracé existe. Les actions que la v3.1 ne sait pas encore FAIRE
 * (`repost`, `translations`) n'ont donc pas de gestionnaire, et ne sont pas là
 * (D-88) ; `views`, `share` et `save` ont rejoint le plan AUTEUR avec #7116.
 *
 * **« RÉPONDRE » N'EST PLUS UN BOUTON DU RAIL** : c'est la capsule « Répondre… »
 * de la barre basse (`ViewerBottomBar`), la même sur tous les plein écrans. Le
 * bouton reste connu de la loi — l'hôte ne lui remet simplement plus de
 * gestionnaire.
 */

/**
 * Le couloir que le rail réserve au bord de fin — UNE valeur, celle des
 * primitives. La barre basse partage sa rangée avec le rail : la légende ne
 * passe donc plus jamais dessous, sans que l'hôte ait à réserver quoi que ce soit.
 */
export const STORY_ACTION_RAIL_CORRIDOR = VIEWER_RAIL_CORRIDOR;
const TEXT_SHADOW = '0 1px 2px var(--color-scrim)';

type RailGlyphs = { readonly idle: GlyphShape; readonly active?: GlyphShape };

/**
 * Le glyphe de CHAQUE bouton, par sa clé — une carte, jamais une cascade de
 * ternaires au rendu. `active` n'existe que là où iOS peint un état plein
 * (le cœur, le haut-parleur).
 *
 * **UN TROISIÈME GARDE, ET IL EST STRUCTUREL.** Un bouton sans tracé ne se
 * peint pas : la carte est PARTIELLE, et ce qui n'y est pas est absent du
 * rendu exactement comme ce que la loi refuse ou ce qu'aucun gestionnaire
 * n'atteint.
 *
 * `views` (#7116) REJOINT la carte : `eye` est DÉJÀ dans le socle
 * (`glyphs.ts:39`, `extract-glyphs.mjs` le compte comme USED) — importer
 * `GLYPHS` entier coûte 0 octet de PLUS ici, ce fichier l'important déjà pour
 * `save`/`translations`. La remarque de #7112 (« son tracé vivrait dans
 * `glyphs-communities.ts`, +0,9 Ko ») décrivait un jeu D'ÉCRAN distinct —
 * périmée, mesurée le 2026-09-24 (`grep -n "  eye:" glyphs.ts`).
 */
/**
 * MESURE DU 2026-09-20 (#7121) — RETIRER LES CINQ GLYPHES QUE LE WEB NE SERT
 * PAS (`forward`, `repost`, `share`, `save`, `translations`) NE REND QUE
 * 0,05 Ko : `story_reader` passe de 9,74 à 9,69.
 *
 * La raison est STRUCTURELLE, et elle vaut pour tout candidat de cette forme :
 * ces tracés viennent de TABLES — `FEED_GLYPHS`, `GLYPHS` — importées ENTIÈRES
 * pour d'autres entrées de cette même carte (`heart`, `heartFill`,
 * `chatCircle`). Retirer une entrée ne retire pas son tracé du chunk ; seul
 * l'abandon complet d'une table y change quelque chose, et aucune n'est
 * abandonnable ici.
 *
 * Mesuré parce que la revue de #7112 les désignait comme LE poids à rendre.
 * Ils ne le sont pas. Ne pas rejouer ce nettoyage en espérant un gain.
 *
 * **`save` PORTE `GLYPHS.downloadSimple` DEPUIS LA REVUE DE #7116, MESURÉ LE
 * 2026-09-24** — miroir de `square.and.arrow.down.fill`
 * (`StoryViewerView+Sidebar.swift:788-795`), là où `archive` n'était qu'un
 * FAUX AMI sémantique (dimension 6 : « archiver » et « enregistrer sur
 * l'appareil » ne sont pas le même geste pour l'utilisateur). La même raison
 * STRUCTURELLE ci-dessus joue en sens inverse pour un AJOUT : `downloadSimple`
 * rejoint le socle (`glyphs.ts`, déjà importé ici pour `archive`/`eye`/
 * `translate`), une table PARTAGÉE dont `story_reader` ne reçoit qu'une
 * RÉFÉRENCE — `node scripts/measure-weight.mjs` rend 10,93 Ko avant et après,
 * plafond 11 Ko inchangé. Aucune arbitrage porteur n'était donc dû : la
 * revue avait mesuré un AUTRE ajout (une clé absente du socle, coûtant sa
 * table entière) et généralisé à tort à celui-ci.
 */
const GLYPH_OF: Partial<Readonly<Record<StoryActionRailButton, RailGlyphs>>> = {
  sound: { idle: MEDIA_TRANSPORT_GLYPHS.speakerSlash, active: MEDIA_TRANSPORT_GLYPHS.speakerHigh },
  react: { idle: FEED_GLYPHS.heart, active: FEED_GLYPHS.heartFill },
  reply: { idle: THREAD_STATES_GLYPHS.arrowBendUpLeft },
  forward: { idle: THREAD_STATES_GLYPHS.arrowBendUpRight },
  repost: { idle: FEED_GLYPHS.arrowsClockwise },
  views: { idle: GLYPHS.eye },
  share: { idle: FEED_GLYPHS.shareNetwork },
  save: { idle: GLYPHS.downloadSimple },
  comments: { idle: FEED_GLYPHS.chatCircle },
  translations: { idle: GLYPHS.translate },
};

/**
 * UNE UNION LITTÉRALE, jamais `InterfaceCatalogKey` (le catalogue entier) —
 * `translate()` distribue ses paramètres sur CHAQUE clé du type qu'on lui
 * passe, et exigerait un troisième argument dès que le type couvre une seule
 * clé paramétrée, même si aucune de ces dix n'en porte (même piège et même
 * remède que `PostGestureMessageKey`, `lib/api/feed-gestures.ts`).
 */
type StoryActionLabelKey = Extract<
  InterfaceCatalogKey,
  | 'story.sound.off'
  | 'story.action.react'
  | 'story.action.reply'
  | 'story.action.forward'
  | 'story.action.repost'
  | 'story.action.views'
  | 'story.action.share'
  | 'story.action.save'
  | 'story.action.comments'
  | 'story.action.translations'
>;

const LABEL_OF: Readonly<Record<StoryActionRailButton, StoryActionLabelKey>> = {
  /* Le son garde SA clé, celle qu'il portait dans la ligne auteur : un
     libellé CONSTANT (« Muet ») avec `aria-pressed` pour l'état — un libellé
     qui change avec l'état s'annonce « Son, non enfoncé », l'inverse de ce
     qui se passe (`story-parts.tsx` § `SoundToggle`). */
  sound: 'story.sound.off',
  react: 'story.action.react',
  reply: 'story.action.reply',
  forward: 'story.action.forward',
  repost: 'story.action.repost',
  views: 'story.action.views',
  share: 'story.action.share',
  save: 'story.action.save',
  comments: 'story.action.comments',
  translations: 'story.action.translations',
};

export type StoryActionRailHandlers = Partial<Record<StoryActionRailButton, () => void>>;

export type StoryActionRailCounts = Partial<Record<StoryActionRailButton, number | null | undefined>>;

export type StoryActionRailProps = {
  readonly plan: StoryActionRailPlan;
  readonly language: InterfaceLanguage;
  readonly handlers: StoryActionRailHandlers;
  /** Les compteurs VIVANTS — ils changent en cours de lecture, et c'est voulu :
   * seule l'APPARTENANCE est figée (`freezeStoryActionRail`). Un compteur nul
   * ou absent laisse le bouton sans chiffre, comme iOS. */
  readonly counts?: StoryActionRailCounts;
  /** Les boutons BASCULE et leur état — `aria-pressed` le porte, jamais le
   * libellé. `sound` est le seul aujourd'hui ; `react` le rejoint dès que le
   * lecteur sait qu'il a déjà réagi. */
  readonly pressed?: Partial<Record<StoryActionRailButton, boolean>>;
  /** Masqué avec le reste du chrome pendant une pause par appui long
   * (`chromeHidden`), ou recouvert par la feuille de commentaires — la même
   * opacité que l'en-tête, jamais un démontage : le rail reparaîtrait alors au
   * relâchement en refaisant sa mise en page. Il devient alors INERTE (voir le
   * rendu), parce qu'un rail qu'on ne voit plus ne doit pas rester une
   * commande. */
  readonly hidden?: boolean;
  /**
   * **L'EXPORT EN COURS** (#7116) — `null`/absent ⇒ le bouton « Enregistrer »
   * plein rend. Un job ⇒ `save` bascule vers l'anneau
   * (`StoryExportRailButtons.resolve`, `lib/stories/action-rail.ts`),
   * « Partager » restant un bouton au premier plan tout du long.
   *
   * C'est l'instantané du store (`lib/stories/save-store.ts`), SEULE source
   * de l'anneau : `progress` est la progression BRUTE du téléchargement
   * (0..1) — `null` quand le flux n'annonce pas sa longueur. Le CHIFFRE et
   * l'ARC en dérivent tous deux par `lib/stories/save-progress.ts`, jamais
   * recalculés ici.
   */
  readonly saving?: StorySaveJobView | null;
  /** Le tap sur l'anneau ANNULABLE — absent, l'anneau ne se pose pas dans un
   * bouton (loi 4 : jamais de contrôle inerte). */
  readonly onCancelSave?: (() => void) | undefined;
  /**
   * **LE BADGE DE CHAQUE BOUTON** (#7114) — `null`/absent ⇒ aucune capsule.
   * Miroir du badge de code-langue d'iOS (`displayedLanguageCode`,
   * `StoryViewerView+Sidebar.swift:848-861`) : `aria-hidden`, il ne PORTE
   * aucune information que le nom accessible du bouton n'a déjà — la vérité
   * SERVIE reste celle de `PrismPastille` (D-99) et de `lang=`.
   */
  readonly badges?: Partial<Record<StoryActionRailButton, string | null>>;
  /**
   * **LA SURFACE ANCRÉE À UN BOUTON** (#7114) — la barre rapide des langues,
   * ancrée au bouton « Traductions » comme le strip de réactions à SON bouton
   * (`Sidebar.swift:862-903`, « À GAUCHE du bouton, EXACTEMENT comme le strip
   * de réactions »). Un bouton ABSENT du rail n'ancre jamais rien : l'enveloppe
   * ne se pose qu'autour d'un bouton RENDU.
   */
  readonly anchored?: { readonly action: StoryActionRailButton; readonly node: ReactNode };
};

/**
 * **L'ANNEAU D'EXPORT** (#7116) — miroir de `StorySaveProgressRing.swift` :
 * le CHIFFRE et l'ARC dérivent tous deux de `percent`
 * (`lib/stories/save-progress.ts`), jamais un second calcul qui pourrait
 * diverger ; le ton et le balayage viennent de `ringAppearance`.
 *
 * **LE BALAYAGE TOURNE SEUL** (revue #7116) — le premier jet faisait tourner
 * l'anneau ENTIER, chiffre compris : pendant la livraison, « 90 » pivotait
 * sur lui-même. iOS pose un arc indéterminé PAR-DESSUS l'arc de valeur ; ici
 * de même, un segment dans son propre calque. `prefers-reduced-motion` le
 * fige par la règle générale de `styles/app.css`.
 *
 * **PROGRESSION INCONNUE ⇒ `aria-busy`, AUCUN `aria-valuenow`** — un flux
 * sans `Content-Length` (le cas NOMINAL de la route d'export) ne dit pas
 * « 0 % » pendant toute sa durée : il dit « en cours », et le balayage le
 * montre.
 *
 * **NON ANNULABLE ⇒ PAS DE `<button>`** (D-88, loi 4 : jamais de contrôle
 * inerte) — l'anneau reste seul dans sa case 44×44, sans rien à toucher.
 */
const RING_SIZE = 32;
const RING_STROKE = 3;
const RING_RADIUS = (RING_SIZE - RING_STROKE) / 2;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** La part de cercle que le balayage occupe — un segment, pas une valeur. */
const SWEEP_SHARE = 0.25;

function RingArc({ share, color }: { readonly share: number; readonly color: string }) {
  const middle = RING_SIZE / 2;
  return (
    <circle
      cx={middle}
      cy={middle}
      r={RING_RADIUS}
      fill="none"
      stroke={color}
      strokeWidth={RING_STROKE}
      strokeDasharray={RING_CIRCUMFERENCE}
      strokeDashoffset={RING_CIRCUMFERENCE * (1 - share)}
      strokeLinecap="round"
      transform={`rotate(-90 ${middle} ${middle})`}
    />
  );
}

function SaveProgressRing({
  job,
  onCancel,
  language,
}: {
  readonly job: StorySaveJobView;
  readonly onCancel: (() => void) | undefined;
  readonly language: InterfaceLanguage;
}) {
  const figure = job.progress === null ? null : percent(job.progress);
  const appearance = ringAppearance({ cancellable: job.cancellable, indeterminate: figure === null });
  const color = appearance.tone === 'accent' ? 'var(--ios-indigo-400)' : 'var(--color-on-media-3)';
  const value =
    figure === null
      ? { 'aria-busy': true }
      : { 'aria-valuenow': figure, 'aria-valuetext': translate(language, 'story.save.progress', { percent: String(figure) }) };

  const ring = (
    <span
      data-story-save-ring
      data-story-save-tone={appearance.tone}
      data-story-save-sweeps={appearance.sweeps ? 'true' : 'false'}
      role="progressbar"
      aria-label={translate(language, 'story.action.save')}
      aria-valuemin={0}
      aria-valuemax={100}
      {...value}
      /* LE MÊME DISQUE QUE SES VOISINS (`VIEWER_GLASS`, 40) — sans lui, l'anneau
         se posait NU sur la photo : une piste blanche sur un ciel clair ne se
         lit pas, et la face « Enregistrer » changeait de silhouette. */
      className={`${VIEWER_GLASS} viewer-disc relative grid place-items-center rounded-full`}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="var(--color-media-hairline)" strokeWidth={RING_STROKE} />
        {figure === null ? null : <RingArc share={figure / 100} color={color} />}
      </svg>
      {appearance.sweeps ? (
        <svg
          data-story-save-sweep
          className="absolute animate-spin"
          width={RING_SIZE}
          height={RING_SIZE}
          viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
          aria-hidden="true"
        >
          <RingArc share={SWEEP_SHARE} color={color} />
        </svg>
      ) : null}
      {figure === null ? null : (
        <span className="absolute text-mini font-semibold tabular-nums" style={{ color: 'var(--color-on-media)', textShadow: TEXT_SHADOW }} aria-hidden="true">
          {figure}
        </span>
      )}
    </span>
  );

  /* LE BOUTON D'ANNULATION EST LE VOISIN DE L'ANNEAU, PAS SON PARENT : les
     enfants d'un `button` sont PRÉSENTATIONNELS (ARIA), et un `progressbar`
     posé dedans perdait son rôle et sa valeur — iOS dit les deux
     (`accessibilityLabel` + `accessibilityValue`, `:758-787`). Le bouton
     couvre la case 44×44 ; l'anneau reste dans l'arbre avec sa valeur. */
  const cancellable = job.cancellable && onCancel !== undefined;
  return (
    <div className="relative grid size-11 place-items-center">
      {ring}
      {cancellable ? (
        <button
          type="button"
          data-story-save-cancel
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={onCancel}
          aria-label={translate(language, 'story.save.cancel')}
          className="pointer-events-auto absolute inset-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-on-media"
        />
      ) : null}
    </div>
  );
}

const probeOf = (action: StoryActionRailButton): ViewerProbe =>
  /* LA PRISE HISTORIQUE DU SON SURVIT À SON DÉMÉNAGEMENT (#4508) : le bouton a
     quitté la ligne auteur pour la tête du rail, et c'est la MÊME commande —
     `check-story-scene.mjs` la tape par `[data-story-sound-toggle]`. */
  action === 'sound' ? { 'data-story-action': action, 'data-story-sound-toggle': '' } : { 'data-story-action': action };

export function StoryActionRail({
  plan,
  language,
  handlers,
  counts,
  pressed,
  hidden,
  saving,
  onCancelSave,
  badges,
  anchored,
}: StoryActionRailProps) {
  /* La loi d'abord, le gestionnaire ensuite — dans CET ordre, pour qu'un
     bouton sans gestionnaire ne soit pas seulement invisible mais ABSENT du
     DOM : un `disabled` annoncerait une action que le produit ne rend pas. */
  const boutons = storyActionRailButtons(plan).filter((action) => handlers[action] !== undefined && GLYPH_OF[action] !== undefined);
  if (boutons.length === 0) return null;

  const actions: readonly ViewerAction[] = boutons.map((action) => {
    /* Non-null : `boutons` ne garde que les actions dont le tracé existe. */
    const glyphs = GLYPH_OF[action] as RailGlyphs;
    const isPressed = pressed?.[action];
    /* `sound` est le seul bouton dont l'état ALLUMÉ est « pas enfoncé » :
       `aria-pressed` y dit « muet », donc le glyphe PLEIN (haut-parleur
       ouvert) correspond à `false`. Les autres suivent la règle usuelle. */
    const showsActive = action === 'sound' ? isPressed !== true : isPressed === true;
    const glyph = showsActive && glyphs.active !== undefined ? glyphs.active : glyphs.idle;
    /* **`save` A UNE SECONDE FORME** — l'anneau, quand un export est EN COURS
       pour cette story. `share` reste ici un bouton ORDINAIRE, `save` seul bascule. */
    const ring =
      action === 'save' && saving !== null && saving !== undefined
        ? resolveStoryExportRailButtons({ showsExport: plan.showsExport, saveProgress: saving.progress ?? 0 }).showsSaveProgressRing
        : false;
    return {
      action,
      label: translate(language, LABEL_OF[action]),
      glyph: <GlyphSvg glyph={glyph} size={GLYPH_SIZE.lg} />,
      /* Non-null : le filtre ci-dessus EST la garde. */
      onPress: handlers[action] as () => void,
      pressed: isPressed,
      count: counts?.[action],
      badge: badges?.[action],
      /* Le cœur POSÉ prend le rouge du SDK HORS SCHÉMA (`--ios-error`), comme celui des Réels : même geste, même teinte — `--color-error` tombe à #c81e1e en clair, sous 3:1 sur le verre sombre. */
      ink: action === 'react' && isPressed === true ? 'var(--ios-error)' : undefined,
      probe: probeOf(action),
      override:
        ring && saving !== null && saving !== undefined ? <SaveProgressRing job={saving} onCancel={onCancelSave} language={language} /> : undefined,
    };
  });

  return (
    <ViewerActionRail
      probe={{ 'data-story-action-rail': '' }}
      label={translate(language, 'story.action.rail')}
      actions={actions}
      hidden={hidden === true}
      {...(anchored === undefined ? {} : { anchored: { action: anchored.action, node: anchored.node } })}
    />
  );
}
