import { useEffect, useState, type ReactNode } from 'react';

import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { studioPublishRefusal, type PublicationKind } from '@/lib/stories/publication-kind';
import type { PublishChoice } from '@/lib/stories/publication-layout';
import type { StudioDraft } from '@/lib/stories/studio';
import {
  NO_REEL_AUTO_SWITCH,
  reelAutoSwitchApplied,
  reelAutoSwitchAuthorChose,
  reelAutoSwitchDecision,
  studioSceneDemandsReel,
} from '@/lib/stories/studio-reel-auto-switch';

/**
 * **LA BASCULE POST → RÉEL, côté écran** (#8794, jumelle de
 * `MeeshyComposerHost+ReelAutoSwitch`, #8793) — relue à chaque changement de
 * la DEMANDE (vidéo de fond, son sur une image de fond) ou de l'OFFRE (le menu
 * sert le réel : la durée d'un média se mesure après sa pose). Le retour
 * visible est la capsule (« Publier le réel ») ; l'annonce polie le dit à qui
 * ne la regarde pas. `authorChose` — le chevron — verrouille la composition.
 */
export function useStudioReelAutoSwitch({
  lang,
  draft,
  entryKind,
  enabled,
  setChoice,
}: {
  readonly lang: InterfaceLanguage;
  readonly draft: StudioDraft;
  readonly entryKind: PublicationKind;
  /** Une retouche d'image ne publie rien : jamais de bascule. */
  readonly enabled: boolean;
  readonly setChoice: (choice: PublishChoice) => void;
}): { readonly autoArmed: boolean; readonly authorChose: () => void; readonly announcement: ReactNode } {
  const [state, setState] = useState(NO_REEL_AUTO_SWITCH);
  const [announced, setAnnounced] = useState(false);
  const demands = enabled && studioSceneDemandsReel(draft);
  const reelChoosable = studioPublishRefusal(draft, 'REEL') === null;

  useEffect(() => {
    const applied = reelAutoSwitchApplied(reelAutoSwitchDecision({ demands, entryKind, state, reelChoosable }), state);
    if (applied === null) return;
    setState(applied.state);
    setChoice(applied.choice);
    setAnnounced(applied.choice.kind === 'REEL');
    // `setChoice` est l'état de l'écran : son identité ne décide de rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demands, reelChoosable, entryKind, state]);

  return {
    autoArmed: state.autoArmed,
    authorChose: () => setState(reelAutoSwitchAuthorChose),
    announcement: (
      <p role="status" aria-live="polite" data-story-reel-switch={announced ? 'armed' : undefined} className="sr-only">
        {announced ? translate(lang, 'story.studio.reelSwitch.announcement') : ''}
      </p>
    ),
  };
}
