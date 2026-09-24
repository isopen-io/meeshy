import type { CSSProperties } from 'react';

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
import { percent, ringAppearance } from '@/lib/stories/save-progress';
import type { StorySaveJobView } from '@/lib/stories/save-store';

/**
 * **LE RAIL D'ACTIONS DU LECTEUR DE STORIES** — miroir de
 * `StoryActionSidebarView` (`apps/ios/.../StoryViewerView+Sidebar.swift:464-836`),
 * posé sur le bord FIN de la scène, en bas, comme le rail des Réels
 * (`reel-page.tsx` — même disque, même compteur, même pas de 44 px : deux
 * rails du même produit ne peuvent pas se toucher différemment).
 *
 * **CE COMPOSANT NE DÉCIDE RIEN.** La loi vit dans
 * `lib/stories/action-rail.ts` (pure, éprouvée hors DOM) et l'ORDRE en est
 * une donnée unique (`STORY_ACTION_RAIL_ORDER`) que ce rendu PARCOURT — il
 * n'existe nulle part une seconde liste à tenir d'accord avec elle. Le
 * fichier Swift a supprimé ses blocs numérotés pour exactement cette raison
 * (« déplacer le son d'un cran a suffi à rendre la moitié de la suite
 * fausse »).
 *
 * **LOI 4 — UN CONTRÔLE EXISTE S'IL A UN EFFET.** Un bouton n'est rendu que
 * si la loi le dit **et** que l'hôte remet un gestionnaire (`handlers`).
 * C'est la généralisation du `canReply: onReplyToStory != nil` d'iOS : le
 * gel décide de l'APPARTENANCE, la remise d'un gestionnaire décide de
 * l'ATTEIGNABILITÉ, et les deux sont structurels — aucune branche à oublier
 * au rendu, aucun décor qui ne fait rien. Les actions que la v3.1 ne sait
 * pas encore FAIRE (`repost`, `translations`) n'ont donc pas de
 * gestionnaire, et ne sont pas là (D-88) ; `views`, `share` et `save` ont
 * rejoint le plan AUTEUR avec #7116 — `share`/`save` seulement quand la
 * story porte un média exportable (`storyDownloadableMedia`).
 *
 * **LE SCHÉMA** — la scène est peinte par le contenu de la story, pas par le
 * thème : le rail vit sur du blanc franc + ombre portée en clair COMME en
 * sombre (le lecteur force `colorScheme: 'dark'`, `routes/story.tsx:630`), et
 * son disque est le même `rgba(0,0,0,0.35)` que celui des Réels. Un rail qui
 * suivrait le thème de l'application serait illisible une fois sur deux, la
 * photo d'en dessous n'ayant aucune raison de le suivre.
 */

/** Le disque sous le glyphe — la valeur du rail des Réels (`reel-page.tsx`),
 * lue une fois ici pour que les deux rails ne divergent pas. */
const RAIL_DISC = 'rgba(0,0,0,0.35)';

/**
 * **LE COULOIR QUE LE RAIL RÉSERVE**, en pixels — 44 de bouton + 8 de marge de
 * fin + 8 de respiration. La LÉGENDE de la story doit s'arrêter là : mesuré au
 * navigateur sur `/story/st-amie-2` (390×844), le bloc de légende courait de
 * x 16 à x 374 pendant que le bouton « Commentaires » occupait x 338→382 et y
 * 769→832 — une phrase un peu plus longue passait SOUS le rail. iOS borne la
 * légende par la barre latérale (`StoryViewerView+CanvasCaption.swift`) ; ici
 * la valeur est EXPORTÉE plutôt que recopiée chez l'hôte, pour qu'élargir le
 * rail déplace la légende dans le même geste.
 */
export const STORY_ACTION_RAIL_CORRIDOR = 60;
const TEXT_SHADOW = '0 1px 2px rgba(0,0,0,0.55)';

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
 */
const GLYPH_OF: Partial<Readonly<Record<StoryActionRailButton, RailGlyphs>>> = {
  sound: { idle: MEDIA_TRANSPORT_GLYPHS.speakerSlash, active: MEDIA_TRANSPORT_GLYPHS.speakerHigh },
  react: { idle: FEED_GLYPHS.heart, active: FEED_GLYPHS.heartFill },
  reply: { idle: THREAD_STATES_GLYPHS.arrowBendUpLeft },
  forward: { idle: FEED_GLYPHS.shareNetwork },
  repost: { idle: FEED_GLYPHS.arrowsClockwise },
  views: { idle: GLYPHS.eye },
  share: { idle: FEED_GLYPHS.shareNetwork },
  save: { idle: GLYPHS.archive },
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
};

function RailButton({
  action,
  label,
  glyph,
  count,
  pressed,
  onPress,
}: {
  readonly action: StoryActionRailButton;
  readonly label: string;
  readonly glyph: GlyphShape;
  readonly count?: number | undefined;
  readonly pressed?: boolean | undefined;
  readonly onPress: () => void;
}) {
  return (
    <button
      type="button"
      data-story-action={action}
      /* LA PRISE HISTORIQUE DU SON SURVIT À SON DÉMÉNAGEMENT (#4508) — le
         bouton a quitté la ligne auteur pour la tête du rail, et c'est la
         MÊME commande : `check-story-scene.mjs` la tape par
         `[data-story-sound-toggle]`. La retirer aurait rendu ce gate VERT
         PAR OMISSION sur un contrôle devenu introuvable. */
      {...(action === 'sound' ? { 'data-story-sound-toggle': '' } : {})}
      /* LE GESTE DU LECTEUR NE DOIT PAS AVALER LE TAP. Le plateau porte
         `onPointerDown`/`onPointerUp` pour naviguer d'une story à l'autre :
         sans cette coupure, toucher « Répondre » dans le tiers droit ferait
         AUSSI avancer d'une story — le bouton aurait l'air de ne rien faire,
         et le vrai coupable serait invisible. Même remède que `CloseButton`
         et `SoundToggle` (`routes/story.tsx`, `story-parts.tsx`). */
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={onPress}
      aria-label={label}
      {...(pressed === undefined ? {} : { 'aria-pressed': pressed })}
      className="pointer-events-auto flex flex-col items-center gap-1 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ color: '#fff', outlineColor: '#fff', minWidth: 44 }}
    >
      <span className="grid place-items-center rounded-full" style={{ width: 44, height: 44, background: RAIL_DISC }}>
        <GlyphSvg glyph={glyph} size={22} />
      </span>
      {count !== undefined ? (
        <span className="text-check font-semibold tabular-nums" style={{ textShadow: TEXT_SHADOW }}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

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
  const color = appearance.tone === 'accent' ? 'var(--ios-indigo-400)' : 'rgba(255,255,255,0.6)';
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
      className="relative grid place-items-center rounded-full"
      /* LE MÊME DISQUE QUE SES VOISINS (`RAIL_DISC`, 44) — sans lui, l'anneau
         se posait NU sur la photo : une piste blanche à 25 % sur un ciel clair
         ne se lit pas, et la face « Enregistrer » changeait de silhouette. */
      style={{ width: 44, height: 44, background: RAIL_DISC }}
    >
      <svg width={RING_SIZE} height={RING_SIZE} viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`} aria-hidden="true">
        <circle cx={RING_SIZE / 2} cy={RING_SIZE / 2} r={RING_RADIUS} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={RING_STROKE} />
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
        <span className="absolute text-mini font-semibold tabular-nums" style={{ color: '#fff', textShadow: TEXT_SHADOW }} aria-hidden="true">
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
    <div className="relative grid place-items-center" style={{ width: 44, height: 44 }}>
      {ring}
      {cancellable ? (
        <button
          type="button"
          data-story-save-cancel
          onPointerDown={(e) => e.stopPropagation()}
          onPointerUp={(e) => e.stopPropagation()}
          onClick={onCancel}
          aria-label={translate(language, 'story.save.cancel')}
          className="pointer-events-auto absolute inset-0 rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ outlineColor: '#fff' }}
        />
      ) : null}
    </div>
  );
}

const usefulCount = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export function StoryActionRail({ plan, language, handlers, counts, pressed, hidden, saving, onCancelSave }: StoryActionRailProps) {
  /* La loi d'abord, le gestionnaire ensuite — dans CET ordre, pour qu'un
     bouton sans gestionnaire ne soit pas seulement invisible mais ABSENT du
     DOM : un `disabled` annoncerait une action que le produit ne rend pas. */
  const boutons = storyActionRailButtons(plan).filter(
    (action) => handlers[action] !== undefined && GLYPH_OF[action] !== undefined,
  );
  if (boutons.length === 0) return null;

  /**
   * **UN RAIL QU'ON NE VOIT PLUS NE DOIT PAS RESTER UNE COMMANDE.** L'opacité
   * ne retire que ce que l'ŒIL voit : le conteneur porte bien
   * `pointer-events-none`, mais CHAQUE bouton le ré-active
   * (`pointer-events-auto`, § `RailButton`) — c'est nécessaire au rail VISIBLE,
   * pour que le geste de plateau passe ENTRE les boutons. Masqué, le rail
   * restait donc cliquable ET tabulable : `routes/story.tsx` le masque quand la
   * feuille de commentaires s'ouvre, et ses boutons invisibles commandaient
   * par-dessus elle — « Commentaires » recouvrant le bouton d'envoi du
   * composeur.
   *
   * `inert` retire le sous-arbre des DEUX arbres en un geste — jamais un couple
   * `aria-hidden` + `tabindex="-1"` à tenir par bouton, qui se désynchroniserait
   * au premier bouton ajouté (même remède et même raison que
   * `story-rail.tsx:405-422`). `aria-hidden` DISPARAÎT avec lui : il ne parlait
   * qu'à l'arbre d'accessibilité, et posé sur un sous-arbre focusable il est
   * la violation que les vérificateurs nomment `aria-hidden-focus`.
   *
   * Et une région INERTE n'a rien à annoncer : **son libellé tombe avec elle**,
   * sinon c'est lui qui reste dans l'arbre pendant que son contenu en sort.
   *
   * Le rail est ici le nœud le PLUS HAUT qu'il rende : un seul `inert` suffit,
   * là où `story-rail.tsx` a dû le poser aussi sur son enveloppe (le doublon
   * s'était reconstitué un cran au-dessus de l'attribut).
   */
  const masked = hidden === true;

  const style: CSSProperties = {
    paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)',
    opacity: masked ? 0 : 1,
    transition: 'opacity 180ms ease',
  };

  return (
    <div
      data-story-action-rail
      role="toolbar"
      aria-label={masked ? undefined : translate(language, 'story.action.rail')}
      aria-orientation="vertical"
      className="pointer-events-none absolute end-2 bottom-0 flex flex-col items-center gap-3"
      style={style}
      inert={masked}
    >
      {boutons.map((action) => {
        /* **`save` A UNE SECONDE FORME** — l'anneau, quand un export est EN
           COURS pour cette story. Les deux faces d'`showsExport` (`share` et
           `save`) apparaissent/disparaissent ENSEMBLE (`resolveStoryExportRailButtons`)
           — `share` reste ici un bouton ORDINAIRE, `save` seul bascule. */
        if (action === 'save' && saving !== null && saving !== undefined) {
          const exportButtons = resolveStoryExportRailButtons({ showsExport: plan.showsExport, saveProgress: saving.progress ?? 0 });
          if (exportButtons.showsSaveProgressRing) {
            return <SaveProgressRing key="save" job={saving} onCancel={onCancelSave} language={language} />;
          }
        }
        /* Non-null : `boutons` ne garde que les actions dont le tracé existe. */
        const glyphs = GLYPH_OF[action] as RailGlyphs;
        const isPressed = pressed?.[action];
        /* `sound` est le seul bouton dont l'état ALLUMÉ est « pas enfoncé » :
           `aria-pressed` y dit « muet », donc le glyphe PLEIN (haut-parleur
           ouvert) correspond à `false`. Les autres suivent la règle usuelle. */
        const showsActive = action === 'sound' ? isPressed !== true : isPressed === true;
        return (
          <RailButton
            key={action}
            action={action}
            label={translate(language, LABEL_OF[action])}
            glyph={showsActive && glyphs.active !== undefined ? glyphs.active : glyphs.idle}
            count={usefulCount(counts?.[action])}
            pressed={isPressed}
            /* Non-null : `boutons` ne garde que les actions dont le
               gestionnaire existe — le filtre ci-dessus EST la garde. */
            onPress={handlers[action] as () => void}
          />
        );
      })}
    </div>
  );
}
