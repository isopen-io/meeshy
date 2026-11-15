import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CanvasDocument } from '@/lib/canvas/document';
import {
  AUTO_CHOICE,
  storyBadgeCode,
  storyPrism,
  type StoryLanguageChoice,
} from '@/lib/stories/language-choice';
import { availableStoryLanguages, hasTranslatableStoryContent, hasTranslatableStoryText } from '@/lib/stories/language-availability';
import type { StoryPlaybackStory } from '@/lib/stories/playback';

/**
 * **L'ÉTAT DE LANGUE DU LECTEUR DE STORY** (#7114, § 5.2 de la spécification)
 * — miroir de `sessionLanguageOverride` (`StoryViewerView.swift:248-252`,
 * `:823-827`) : le choix est ÉTIQUETÉ par `storyId`, jamais remis à zéro dans
 * un effet (même discipline que `mediaDuration`, `soundAvailability`,
 * `frozenRail` — une remise à zéro « à chaque story » est la course entre les
 * effets du parent et ceux de l'enfant que `routes/story.tsx` documente déjà).
 *
 * **LE FOCUS REVIENT AU BOUTON TRADUCTIONS À LA FERMETURE** — porté ICI,
 * motif `useCommentsSheetHost` (D-90 : « celui qui détruit le focus est le
 * seul à pouvoir le rendre »). `globalThis.document` évite le SHADOW du
 * paramètre `document` (le `CanvasDocument`, distinct du DOM).
 */
export type StoryLanguage = {
  readonly choice: StoryLanguageChoice;
  /** La chaîne à remettre à TOUS les rendus (légende, légende du média,
   * objets de scène) — une seule valeur, jamais un relais par surface. */
  readonly prism: readonly string[];
  readonly badgeCode: string | null;
  readonly available: readonly string[];
  readonly offersTranslations: boolean;
  readonly barOpen: boolean;
  readonly openBar: () => void;
  readonly closeBar: () => void;
  /** Pose le choix ET ferme la barre (`Sidebar.swift:876-881`). */
  readonly choose: (language: string | 'original') => void;
  /** La pastille : original ↔ auto. */
  readonly toggleOriginal: () => void;
};

export function useStoryLanguage(params: {
  readonly story: StoryPlaybackStory | undefined;
  readonly document: CanvasDocument | null;
  readonly readerLanguages: readonly string[];
  /** Tranche 2 seulement — `false` en tranche 1 (aucune route de demande). */
  readonly canRequestTranslation: boolean;
}): StoryLanguage {
  const { story, document, readerLanguages, canRequestTranslation } = params;
  const storyId = story?.id;

  const [choiceState, setChoiceState] = useState<{ readonly storyId: string; readonly choice: StoryLanguageChoice } | null>(
    null,
  );
  const [barOpen, setBarOpen] = useState(false);
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /* LE CHANGEMENT DE STORY RETOMBE LE CHOIX ET FERME LA BARRE
     (`StoryViewerView.swift:823-827`) — jamais une remise à zéro qui
     courrait contre l'effet qui pose le choix lui-même : la comparaison de
     `storyId` DANS l'état (ci-dessous, `choice`) fait le même travail sans
     effet dédié, à l'identique de `frozenRail`. */
  useEffect(() => {
    setBarOpen(false);
  }, [storyId]);

  const choice: StoryLanguageChoice = choiceState !== null && choiceState.storyId === storyId ? choiceState.choice : AUTO_CHOICE;

  useEffect(() => {
    if (barOpen) return;
    const target = returnFocusRef.current;
    returnFocusRef.current = null;
    if (target !== null && target.isConnected) target.focus();
  }, [barOpen]);

  const prism = useMemo(() => storyPrism({ readerLanguages, choice }), [readerLanguages, choice]);
  const badgeCode = storyBadgeCode(prism);

  const available = useMemo(
    () =>
      availableStoryLanguages({
        content: story?.content,
        originalLanguage: story?.originalLanguage,
        translations: story?.translations,
        document,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story?.id, story?.content, story?.originalLanguage, story?.translations, document],
  );

  const hasText = useMemo(
    () => hasTranslatableStoryText({ content: story?.content, document }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [story?.id, story?.content, document],
  );

  const offersTranslations = hasTranslatableStoryContent({ hasText, availableLanguages: available, canRequestTranslation });

  const openBar = useCallback(() => {
    returnFocusRef.current = globalThis.document?.activeElement instanceof HTMLElement ? globalThis.document.activeElement : null;
    setBarOpen(true);
  }, []);
  const closeBar = useCallback(() => setBarOpen(false), []);

  const choose = useCallback(
    (language: string | 'original') => {
      if (storyId === undefined) return;
      const next: StoryLanguageChoice = language === 'original' ? { kind: 'original' } : { kind: 'explore', language };
      setChoiceState({ storyId, choice: next });
      setBarOpen(false);
    },
    [storyId],
  );

  const toggleOriginal = useCallback(() => {
    setChoiceState((current) => {
      if (storyId === undefined) return current;
      const isOriginal = current !== null && current.storyId === storyId && current.choice.kind === 'original';
      return { storyId, choice: isOriginal ? AUTO_CHOICE : { kind: 'original' } };
    });
  }, [storyId]);

  return { choice, prism, badgeCode, available, offersTranslations, barOpen, openBar, closeBar, choose, toggleOriginal };
}
