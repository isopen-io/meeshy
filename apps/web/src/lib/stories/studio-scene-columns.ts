import type { StoryFilterId } from '@/lib/canvas/media-filter';
import type { InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { SceneTransition } from '@/lib/canvas/scene-transition';

import type { StudioBackgroundSection, StudioBackgroundToolAction } from './studio-background-tools';

/**
 * **LA GÉOGRAPHIE DES RAILS DE LA SCÈNE** (#8715, jumelle web de
 * `ComposerSceneColumns` iOS, #8712–#8714 et #8792 — directives porteur des
 * 2026-09-29 et 2026-09-30) :
 *
 * > « change l'emplacement de l'icône animé/éclair pour la mettre après la
 * > géolocalisation et mets à sa place le bouton (+) pour créer une nouvelle
 * > scène ; de même [le Cadre] tu la mets après l'icône éclair. De sorte qu'en
 * > bas on a undo et redo toujours […] et au-dessus les options de l'outil
 * > sélectionné, qui apparaissent scrollables s'il y a trop d'options. »
 *
 * > « Lorsqu'on sélectionne une image, vidéo, texte ou son de la scène par le
 * > simple toucher, les options d'édition apparaissent à droite en partant du
 * > haut, avec en fin (x) pour quitter le mode de l'outil. »
 *
 * Règles pures ; la colonne droite COMPOSE ce qui existe (les actions d'un
 * objet que `useStudioObjects` sert déjà, les effets de la scène), sans
 * seconde liste d'actions.
 */

/** Les deux boutons de SCÈNE que le couloir gauche porte après ses portes. */
export type StudioSceneToggle = 'animated' | 'frame';

/** L'éclair, PUIS le Cadre — un bouton qui paraît ne déplace pas son voisin. */
export function studioLeadingSceneToggles({ animated, frame }: { readonly animated: boolean; readonly frame: boolean }): readonly StudioSceneToggle[] {
  return [...(animated ? (['animated'] as const) : []), ...(frame ? (['frame'] as const) : [])];
}

/**
 * **UNE FAMILLE D'EFFETS de la scène** (#8792) — `opening` : l'ENTRÉE et la
 * SORTIE de la scène (`scene.opening` / `scene.closing` de CanvasV3) ;
 * `visual` : le LOOK du fond (`payload.filter` de son objet média).
 */
export type StudioSceneEffect = 'opening' | 'visual';

export const STUDIO_EFFECT_LABEL_KEYS = {
  opening: 'story.studio.effect.opening',
  visual: 'story.studio.effect.visual',
} as const satisfies Record<StudioSceneEffect, InterfaceCatalogKey>;

export type StudioBackgroundKind = 'image' | 'video' | null;

/** Aucun fond média ⇒ aucune colonne ; l'effet visuel ne se cuit que dans une
 * IMAGE — un fond vidéo ne l'offre pas (#8798). */
export function studioSceneEffectsServed(background: StudioBackgroundKind): readonly StudioSceneEffect[] {
  if (background === 'image') return ['opening', 'visual'];
  if (background === 'video') return ['opening'];
  return [];
}

/** Toucher l'effet ouvert le REFERME ; en toucher un autre bascule sur lui. */
export function studioEffectToggled(tapped: StudioSceneEffect, open: StudioSceneEffect | null): StudioSceneEffect | null {
  return open === tapped ? null : tapped;
}

/** Le carrousel ne vit que tant que son effet est servi, qu'aucun objet n'est
 * touché et qu'aucun outil n'occupe l'écran. */
export function studioEffectCarousel({
  open,
  served,
  objectSelected,
  toolOpen,
}: {
  readonly open: StudioSceneEffect | null;
  readonly served: readonly StudioSceneEffect[];
  readonly objectSelected: boolean;
  readonly toolOpen: boolean;
}): StudioSceneEffect | null {
  if (open === null || !served.includes(open) || objectSelected || toolOpen) return null;
  return open;
}

/** Les deux transitions d'une scène — ce que la répétition rejoue. */
export type StudioTransitions = { readonly opening: SceneTransition | null; readonly closing: SceneTransition | null };

/** Ce qu'un carrousel vient de choisir. */
export type StudioEffectChoice =
  | { readonly kind: 'opening'; readonly effect: SceneTransition | null }
  | { readonly kind: 'closing'; readonly effect: SceneTransition | null }
  | { readonly kind: 'visual'; readonly filter: StoryFilterId | null };

/** Une ouverture garde la fermeture, une fermeture garde l'ouverture, un
 * effet visuel ne touche ni l'une ni l'autre. */
export function studioTransitionsAfter(choice: StudioEffectChoice, current: StudioTransitions): StudioTransitions {
  if (choice.kind === 'opening') return { opening: choice.effect, closing: current.closing };
  if (choice.kind === 'closing') return { opening: current.opening, closing: choice.effect };
  return current;
}

/** **Chaque choix — visuel OU de transition — rejoue l'ouverture puis la
 * fermeture** : l'effet se voit EN SITUATION. `null` : rien à rejouer. */
export function studioRehearsal(choice: StudioEffectChoice, current: StudioTransitions): StudioTransitions | null {
  const after = studioTransitionsAfter(choice, current);
  return after.opening === null && after.closing === null ? null : after;
}

/** Les actions qu'un objet touché offre — celles de son menu d'appui long. */
export type StudioObjectActionId = 'edit' | 'raise' | 'lower' | 'duplicate' | 'set-background' | 'replace-background' | 'remove';

/** Sur quoi l'auteur agit — un outil ouvert l'emporte sur une sélection. */
export type StudioTrailingFocus =
  | { readonly kind: 'scene'; readonly effects: readonly StudioSceneEffect[]; readonly open: StudioSceneEffect | null }
  | { readonly kind: 'tool' }
  | { readonly kind: 'object'; readonly id: string; readonly actions: readonly StudioObjectActionId[] }
  | ({ readonly kind: 'background' } & StudioBackgroundColumn);

/** Ce que l'édition du FOND porte au rail droit (#8849) — ses outils, celui
 * dont les contrôles sont ouverts sous la scène, ses gestes. */
export type StudioBackgroundColumn = {
  readonly sections: readonly StudioBackgroundSection[];
  readonly open: StudioBackgroundSection | null;
  readonly actions: readonly StudioBackgroundToolAction[];
};

export type StudioTrailingEntry =
  | { readonly kind: 'effect'; readonly effect: StudioSceneEffect; readonly open: boolean }
  | { readonly kind: 'object-action'; readonly action: StudioObjectActionId }
  | { readonly kind: 'exit-object' }
  | { readonly kind: 'background-section'; readonly section: StudioBackgroundSection; readonly open: boolean }
  | { readonly kind: 'background-action'; readonly action: StudioBackgroundToolAction }
  | { readonly kind: 'exit-tool' };

export function studioTrailingFocus({
  toolOpen,
  object,
  effects,
  openEffect,
  background = null,
}: {
  readonly toolOpen: boolean;
  readonly object: { readonly id: string; readonly actions: readonly StudioObjectActionId[] } | null;
  readonly effects: readonly StudioSceneEffect[];
  readonly openEffect: StudioSceneEffect | null;
  /** L'édition du fond en cours (#8849) — elle l'emporte sur la sélection. */
  readonly background?: StudioBackgroundColumn | null;
}): StudioTrailingFocus {
  if (toolOpen) return { kind: 'tool' };
  if (background !== null) return { kind: 'background', ...background };
  if (object !== null) return { kind: 'object', id: object.id, actions: object.actions };
  return { kind: 'scene', effects, open: openEffect !== null && effects.includes(openEffect) ? openEffect : null };
}

/**
 * **Les options, de HAUT en bas, le `(x)` en dernier.** Pour un objet :
 * « Modifier » d'abord (le même geste que le double toucher), puis ses autres
 * actions. Un outil ouvert (Cadre, édition) porte ses réglages dans SA plaque
 * du bas, avec son propre (X) : le rail n'en répète rien.
 */
export function studioTrailingOptions(focus: StudioTrailingFocus): readonly StudioTrailingEntry[] {
  if (focus.kind === 'tool') return [];
  if (focus.kind === 'background') {
    return [
      ...focus.sections.map((section): StudioTrailingEntry => ({ kind: 'background-section', section, open: section === focus.open })),
      ...focus.actions.map((action): StudioTrailingEntry => ({ kind: 'background-action', action })),
      { kind: 'exit-tool' },
    ];
  }
  if (focus.kind === 'scene') return focus.effects.map((effect) => ({ kind: 'effect', effect, open: effect === focus.open }));
  const edit: readonly StudioTrailingEntry[] = focus.actions.includes('edit') ? [{ kind: 'object-action', action: 'edit' }] : [];
  const rest = focus.actions.filter((action) => action !== 'edit').map((action): StudioTrailingEntry => ({ kind: 'object-action', action }));
  return [...edit, ...rest, { kind: 'exit-object' }];
}

export type StudioTrailingFoot = 'time' | 'undo' | 'redo';

/** Le bas de la colonne — TOUJOURS l'historique, sous « Temps » quand la
 * scène est animée ; un outil ouvert garde l'historique, pas « Temps ». */
export function studioTrailingFoot(focus: StudioTrailingFocus, timeServed: boolean): readonly StudioTrailingFoot[] {
  if (focus.kind === 'tool' || focus.kind === 'background' || !timeServed) return ['undo', 'redo'];
  return ['time', 'undo', 'redo'];
}
