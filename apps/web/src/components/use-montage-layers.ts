import { frameDisplayName } from '@meeshy/shared/types/frame-name';
import { addingGenre, canAdd, genreRow, isFull, removeLayer, type EffectGenre, type EffectLayer, type EffectStack } from '@/lib/calls/call-effect-layers';
import { setEffectLayers } from '@/lib/calls/call-effect-layers-store';
import type { CaptureFrame } from '@/lib/calls/frames/frame-spec';
import type { FrameStudio } from '@/lib/calls/frames/frame-studio';
import { useEffectLayers } from '@/lib/calls/use-effect-layers';
import type { VideoEffects } from '@/lib/calls/video-effects';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { effectChoiceName, effectsApplied, layersTextOf, textOf, type CategoryEntry } from './call-effects-bar';
import type { LiveFrameHold } from './call-live-frame-hold-option';

/** Les genres que le Montage possède : il en lit la valeur (effets appliqués, cadre choisi). */
const OWNED: readonly EffectGenre[] = ['face', 'color', 'frame'];

type Input = {
  readonly language: InterfaceLanguage;
  readonly effects: VideoEffects;
  readonly frame: CaptureFrame | null;
  readonly frames: FrameStudio | null;
  readonly hold: LiveFrameHold | undefined;
  readonly apply: (patch: Partial<VideoEffects>) => void;
  /** (+) ou une puce Visage · Couleur : ouvre Effets sur ce genre. Sans lui, la rangée ne montre que « Cadres ». */
  readonly onAddLook: ((genre: 'face' | 'color') => void) | undefined;
  readonly clearFrame: () => void;
  /** (+) touché : la barre suit `afterAddingLook`. */
  readonly onAdding: () => void;
  /** Une couche annulée : la barre suit `afterRemoval`. */
  readonly onRemoval: () => void;
  readonly say: (text: string) => void;
};

/**
 * **LA PILE D'EFFETS, VUE DU MONTAGE** (#17903) — le cadre est une couche : celui du carrousel, ou celui qu'on
 * garde en direct. Ce crochet rend la pile, ce qu'un choix a le droit de faire dessus (trois couches au plus),
 * et les gestes de la barre : (+), annuler une couche. Annuler la couche « cadre » retire aussi le cadre gardé
 * en direct, par le chemin de « Cadre » (loi 16).
 */
export function useMontageLayers({ language, effects, frame, frames, hold, apply, onAddLook, clearFrame, onAdding, onRemoval, say }: Input) {
  const text = textOf(language);
  const words = layersTextOf(language);
  const frameLayer = frame?.id ?? hold?.heldFrameId ?? null;
  const stack = useEffectLayers([...effectsApplied(effects), ...(frameLayer === null ? [] : [{ genre: 'frame' as const, choice: frameLayer }])], OWNED);
  const crowded = isFull(stack);
  const row = onAddLook === undefined ? genreRow(false, true) : genreRow(true, true);
  const refuse = (): void => say(words.full);

  /** À trois couches, un cadre de plus n'entre pas : le choix est refusé et dit ; changer le cadre déjà posé reste permis. */
  const frameFits = canAdd(stack, 'frame');
  const framePermitted = (): boolean => {
    if (!frameFits) refuse();
    return frameFits;
  };

  const addLook = (): void => {
    onAdding();
    if (crowded) {
      refuse();
      return;
    }
    const target = addingGenre('frame', stack, row);
    if (target === 'face' || target === 'color') onAddLook?.(target);
  };

  const undo = (genre: EffectGenre): void => {
    onRemoval();
    if (genre === 'face') apply({ faceEffect: 'none' });
    else if (genre === 'color') apply({ preset: 'natural' });
    else {
      if (genre === 'frame') {
        const held = hold?.heldFrameId ?? null;
        if (hold !== undefined && held !== null && held === frameLayer) hold.toggle(held);
        clearFrame();
      }
      setEffectLayers(removeLayer(stack, genre));
    }
  };

  const layerName = (layer: EffectLayer): string | undefined => {
    if (layer.genre !== 'frame') return effectChoiceName(text, layer);
    const named = frames?.find(layer.choice) ?? null;
    return named === null ? undefined : frameDisplayName(named, language);
  };

  const sortEntries: readonly CategoryEntry[] = [
    ...(onAddLook === undefined ? [] : [{ id: 'face', label: text('callStudio.mode.face'), genre: 'face' as const }, { id: 'color', label: text('callStudio.effects.color'), genre: 'color' as const }]),
    { id: 'frames', label: words.frames, genre: 'frame' },
  ];

  return { stack: stack satisfies EffectStack, crowded, frameFits, framePermitted, addLook, undo, layerName, sortEntries, words };
}
