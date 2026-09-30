import { createElement, lazy, Suspense, useState, type ReactNode, type RefObject } from 'react';

import { Glyph } from '@/components/glyph';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import { withVisualFilter, type StudioDraft } from '@/lib/stories/studio';
import type { StudioOpenTool } from '@/lib/stories/studio-focus';
import type { StudioPage } from '@/lib/stories/studio-page';
import {
  STUDIO_EFFECT_LABEL_KEYS,
  studioEffectCarousel,
  studioEffectToggled,
  studioRehearsal,
  studioSceneEffectsServed,
  studioTrailingFocus,
  studioTrailingFoot,
  studioTrailingOptions,
  studioTransitionsAfter,
  type StudioEffectChoice,
  type StudioSceneEffect,
  type StudioTrailingFoot,
} from '@/lib/stories/studio-scene-columns';
import { pageTransitionsOf, withPageTransitions } from '@/lib/stories/studio-scene-edit';
import { studioBackgroundMenuActions, type StudioBackgroundMenuAction } from '@/lib/stories/studio-scene-menu';
import { RedoMark, UndoMark } from '@/routes/story-compose-chrome';
import type { StudioObjectAction } from '@/routes/story-compose-object-menu';
import { TimeMark } from '@/routes/story-compose-parts';
import { StudioTrailingColumn, type StudioColumnTile } from '@/routes/story-compose-scene-rails';
import { EffectMark, ObjectActionMark } from '@/routes/story-compose-scene-marks';
import type { StudioSceneObjectAction } from '@/routes/use-studio-objects';
import { useStudioRehearsal } from '@/routes/use-studio-rehearsal';

const StudioObjectMenu = lazy(() => import('@/routes/story-compose-object-menu').then((m) => ({ default: m.StudioObjectMenu })));
const StudioEffectCarousel = lazy(() => import('@/routes/story-compose-effects').then((m) => ({ default: m.StudioEffectCarousel })));
const StudioTransitionRows = lazy(() => import('@/routes/story-compose-effects').then((m) => ({ default: m.StudioTransitionRows })));
const StudioVisualEffects = lazy(() => import('@/routes/story-compose-effects').then((m) => ({ default: m.StudioVisualEffects })));

const BACKGROUND_LABELS = {
  edit: 'story.studio.background.menu.edit',
  retake: 'story.studio.background.menu.retake',
  forward: 'story.studio.background.menu.forward',
  remove: 'story.studio.background.menu.remove',
} as const;

const FOOT_LABELS = { time: 'story.studio.tile.time', undo: 'story.studio.undo', redo: 'story.studio.redo' } as const;

type Point = { readonly x: number; readonly y: number };

/**
 * **LES COLONNES DE LA SCÈNE, CÔTÉ ÉCRAN** (#8715, #8794 — jumelle de
 * `MeeshyComposerHost+SceneColumns` iOS) : l'objet TOUCHÉ (dont les options
 * montent à droite, terminées par `(x)`), l'effet dont le carrousel est
 * ouvert (à la place de l'audience et de Publier), la répétition des
 * transitions, et le menu d'appui long du FOND. Sorti de `story-compose.tsx`
 * (budget de taille) : l'écran lui remet ses faits et ses gestes, ce hook
 * compose les deux colonnes selon `studio-scene-columns.ts`.
 */
export function useStudioSceneColumns({
  lang,
  page,
  kind,
  locked,
  retouching,
  tool,
  timeline,
  history,
  objects,
  edit,
  stageRef,
  background,
  hidden,
}: {
  readonly lang: InterfaceLanguage;
  readonly page: StudioPage;
  readonly kind: PublicationKind;
  readonly locked: boolean;
  readonly retouching: boolean;
  readonly tool: StudioOpenTool;
  /** « Temps » — `onToggle` nul sur une scène statique. */
  readonly timeline: { readonly open: boolean; readonly onToggle: (() => void) | null };
  readonly history: { readonly onUndo: (() => void) | null; readonly onRedo: (() => void) | null };
  readonly objects: {
    readonly ids: readonly string[];
    readonly nameOf: (id: string) => string;
    readonly actionsOf: (id: string) => readonly StudioSceneObjectAction[];
    readonly onDeselect: () => void;
  };
  readonly edit: (change: (current: StudioDraft) => StudioDraft, key?: string | null) => void;
  readonly stageRef: RefObject<HTMLElement | null>;
  /** Les gestes du menu du FOND (#8716). */
  readonly background: { readonly onEdit: () => void; readonly onRetake: () => void; readonly onForward: () => void; readonly onRemove: () => void };
  readonly hidden: boolean;
}): {
  readonly trailing: ReactNode;
  readonly carousel: ReactNode;
  readonly onSelectObject: (id: string | null) => void;
  readonly onBackgroundMenu: ((point: Point) => void) | undefined;
  readonly backgroundMenu: ReactNode;
} {
  const [touched, setTouched] = useState<string | null>(null);
  const [openEffect, setOpenEffect] = useState<StudioSceneEffect | null>(null);
  const [menuAt, setMenuAt] = useState<Point | null>(null);
  const rehearse = useStudioRehearsal(stageRef);

  const toolOpen = tool !== null || timeline.open;
  const focusedId = touched !== null && objects.ids.includes(touched) && !toolOpen ? touched : null;
  const served = studioSceneEffectsServed(retouching ? null : (page.background?.mediaType ?? null));
  const carouselEffect = studioEffectCarousel({ open: openEffect, served, objectSelected: focusedId !== null, toolOpen });
  const actions = focusedId === null ? [] : objects.actionsOf(focusedId);
  const focus = studioTrailingFocus({
    toolOpen,
    object: focusedId === null ? null : { id: focusedId, actions: actions.map((action) => action.id) },
    effects: served,
    openEffect: carouselEffect,
  });

  const choose = (choice: StudioEffectChoice) => {
    const current = pageTransitionsOf(page);
    if (choice.kind === 'visual') edit((draft) => withVisualFilter(draft, 'visual', choice.filter));
    else edit((draft) => withPageTransitions(draft, studioTransitionsAfter(choice, current)));
    const plan = studioRehearsal(choice, current);
    if (plan !== null) rehearse(plan);
  };

  const entries = studioTrailingOptions(focus);
  const options = entries.flatMap((entry): StudioColumnTile[] => {
    if (entry.kind === 'effect') {
      return [
        {
          key: `effect.${entry.effect}`,
          label: translate(lang, STUDIO_EFFECT_LABEL_KEYS[entry.effect]),
          probe: `effect:${entry.effect}`,
          glyph: <EffectMark effect={entry.effect} />,
          pressed: entry.open,
          onPress: () => setOpenEffect((open) => studioEffectToggled(entry.effect, open)),
        },
      ];
    }
    if (entry.kind === 'exit-object') return [];
    const action = actions.find((candidate) => candidate.id === entry.action);
    return action === undefined
      ? []
      : [
          {
            key: `action.${action.id}`,
            label: action.label,
            probe: `object:${action.id}`,
            glyph: <ObjectActionMark action={action.id} />,
            ...(action.destructive === true ? { destructive: true } : {}),
            onPress: action.onSelect,
          },
        ];
  });
  const exit: StudioColumnTile | null = entries.some((entry) => entry.kind === 'exit-object')
    ? {
        key: 'exit.object',
        label: translate(lang, 'story.studio.object.deselect'),
        probe: 'deselect',
        glyph: <Glyph name="x" size={18} />,
        onPress: () => {
          setTouched(null);
          objects.onDeselect();
        },
      }
    : null;

  const footHandlers: Record<StudioTrailingFoot, (() => void) | null> = { time: timeline.onToggle, undo: history.onUndo, redo: history.onRedo };
  const footGlyphs: Record<StudioTrailingFoot, ReactNode> = { time: <TimeMark size={20} />, undo: <UndoMark size={20} />, redo: <RedoMark size={20} /> };
  const footKinds: readonly StudioTrailingFoot[] = timeline.open ? ['time'] : studioTrailingFoot(focus, timeline.onToggle !== null);
  const foot = footKinds.flatMap((kindOf): StudioColumnTile[] => {
    const onPress = footHandlers[kindOf];
    return onPress === null
      ? []
      : [{ key: kindOf, label: translate(lang, FOOT_LABELS[kindOf]), probe: kindOf, glyph: footGlyphs[kindOf], onPress, ...(kindOf === 'time' ? { pressed: timeline.open } : {}) }];
  });

  const trailing = (
    <StudioTrailingColumn
      lang={lang}
      locked={locked}
      label={focusedId !== null ? translate(lang, 'story.studio.object.options', { name: objects.nameOf(focusedId) }) : translate(lang, 'story.studio.effect.column')}
      options={options}
      exit={exit}
      foot={foot}
      hidden={hidden}
    />
  );

  const carousel =
    carouselEffect === null || page.background === null ? null : (
      <Suspense fallback={null}>
        <StudioEffectCarousel lang={lang} effect={carouselEffect} onClose={() => setOpenEffect(null)}>
          {carouselEffect === 'opening' ? (
            <StudioTransitionRows lang={lang} opening={page.opening ?? null} closing={page.closing ?? null} onChoose={choose} locked={locked} />
          ) : (
            <StudioVisualEffects
              lang={lang}
              source={page.background.previewUrl}
              aspectRatio={page.background.aspectRatio}
              filter={page.background.filter ?? null}
              onChoose={choose}
              locked={locked}
            />
          )}
        </StudioEffectCarousel>
      </Suspense>
    );

  const backgroundHandlers: Record<StudioBackgroundMenuAction, () => void> = {
    edit: background.onEdit,
    retake: background.onRetake,
    forward: background.onForward,
    remove: background.onRemove,
  };
  const backgroundActions: readonly StudioObjectAction[] = studioBackgroundMenuActions({ offersPhoto: kind !== 'REEL', overlayFree: page.overlay === null }).map((action) => ({
    id: action,
    label: translate(lang, BACKGROUND_LABELS[action]),
    glyph: createElement(ObjectActionMark, { action }),
    ...(action === 'remove' ? { destructive: true } : {}),
    onSelect: backgroundHandlers[action],
  }));

  const backgroundMenu =
    menuAt === null || page.background === null ? null : (
      <Suspense fallback={null}>
        <StudioObjectMenu
          label={translate(lang, 'story.studio.background.menu.title')}
          title={translate(lang, 'story.studio.background.menu.title')}
          point={menuAt}
          actions={backgroundActions}
          onClose={() => setMenuAt(null)}
        />
      </Suspense>
    );

  return {
    trailing,
    carousel,
    onSelectObject: (id) => {
      setTouched(id);
      if (id !== null) setOpenEffect(null);
    },
    onBackgroundMenu: page.background === null || locked || retouching || tool !== null ? undefined : setMenuAt,
    backgroundMenu,
  };
}
