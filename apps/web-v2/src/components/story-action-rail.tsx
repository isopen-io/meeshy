import type { CSSProperties } from 'react';

import { GlyphSvg, type GlyphShape } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { MEDIA_TRANSPORT_GLYPHS } from '@/components/glyphs-media-transport';
import { GLYPHS } from '@/components/glyphs';
import { THREAD_STATES_GLYPHS } from '@/components/glyphs-thread-states';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import {
  storyActionRailButtons,
  type StoryActionRailButton,
  type StoryActionRailPlan,
} from '@/lib/stories/action-rail';

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
 * au rendu, aucun décor qui ne fait rien. Les cinq actions que la v3.1 ne
 * sait pas encore FAIRE (`repost`, `views`, `share`, `save`, `translations`)
 * n'ont donc pas de gestionnaire, et ne sont pas là (D-88).
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
 * n'atteint. `views` n'y figure donc pas — son tracé vivrait dans
 * `glyphs-communities.ts`, un jeu d'ÉCRAN que le lecteur de stories tirerait
 * ENTIER dans son chunk pour une seule action qu'il ne sait pas encore faire
 * (mesuré : +0,9 Ko gzip sur `story_reader`). Le jour où « Vues » aura son
 * effet, il aura son tracé — pas avant.
 */
const GLYPH_OF: Partial<Readonly<Record<StoryActionRailButton, RailGlyphs>>> = {
  sound: { idle: MEDIA_TRANSPORT_GLYPHS.speakerSlash, active: MEDIA_TRANSPORT_GLYPHS.speakerHigh },
  react: { idle: FEED_GLYPHS.heart, active: FEED_GLYPHS.heartFill },
  reply: { idle: THREAD_STATES_GLYPHS.arrowBendUpLeft },
  forward: { idle: FEED_GLYPHS.shareNetwork },
  repost: { idle: FEED_GLYPHS.arrowsClockwise },
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

const usefulCount = (value: number | null | undefined): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined;

export function StoryActionRail({ plan, language, handlers, counts, pressed, hidden }: StoryActionRailProps) {
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
  const masque = hidden === true;

  const style: CSSProperties = {
    paddingBottom: 'calc(var(--safe-bottom, 0px) + 12px)',
    opacity: masque ? 0 : 1,
    transition: 'opacity 180ms ease',
  };

  return (
    <div
      data-story-action-rail
      role="toolbar"
      aria-label={masque ? undefined : translate(language, 'story.action.rail')}
      aria-orientation="vertical"
      className="pointer-events-none absolute end-2 bottom-0 flex flex-col items-center gap-3"
      style={style}
      inert={masque}
    >
      {boutons.map((action) => {
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
