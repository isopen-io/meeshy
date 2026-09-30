import { lazy, Suspense, useEffect, type ReactNode } from 'react';

import type { InterfaceLanguage } from '@/lib/interface-language';
import type { PublicationKind } from '@/lib/stories/publication-kind';
import type { StoryFrame } from '@/lib/stories/story-document';
import { withBackgroundFrame, withVisualCaption, type StudioDraft } from '@/lib/stories/studio';
import {
  studioBackgroundEditOpened,
  studioBackgroundEditResolved,
  studioBackgroundSections,
  studioBackgroundToolActions,
  studioBackgroundToolTapped,
  type StudioBackgroundEdit,
  type StudioBackgroundSection,
} from '@/lib/stories/studio-background-tools';
import type { StudioPage } from '@/lib/stories/studio-page';
import type { StudioPageEdit } from '@/lib/stories/studio-page-edit';
import type { StudioBackgroundColumn } from '@/lib/stories/studio-scene-columns';
import { useBackDismiss } from '@/lib/view/use-back-dismiss';

/** Les contrôles d'un outil du fond, CHARGÉS À LA DEMANDE — ils ne pèsent que
 * si l'auteur ouvre un outil. */
const StudioBackgroundToolPanel = lazy(() => import('@/routes/story-compose-frame').then((m) => ({ default: m.StudioBackgroundToolPanel })));

/** Le retour matériel et Échap, outils ouverts, rendent la gestion de la
 * scène — une plaque ouverte par-dessus se referme d'abord (#8517). */
function BackgroundToolsDismiss({ onBack }: { readonly onBack: () => void }) {
  useBackDismiss(onBack, { escape: true });
  return null;
}

export type StudioBackgroundToolsState = {
  readonly edit: StudioBackgroundEdit | null;
  readonly setEdit: (next: StudioBackgroundEdit | null) => void;
};

/**
 * **LES OUTILS DU FOND, CÔTÉ ÉCRAN** (#8849, jumelle de
 * `MeeshyComposerHost+BackgroundTools` iOS, #8847) — l'écran lui remet l'état
 * brut et ses faits ; ce hook résout l'édition (elle ne survit pas à son
 * fond), compose la colonne du rail droit et la plaque de l'outil ouvert, sous
 * la scène. Sorti de `story-compose.tsx` (budget de taille).
 */
export function useStudioBackgroundTools({
  state,
  lang,
  page,
  kind,
  frame,
  retouching,
  timelineOpen,
  locked,
  edit,
  editPage,
}: {
  readonly state: StudioBackgroundToolsState;
  readonly lang: InterfaceLanguage;
  readonly page: StudioPage;
  readonly kind: PublicationKind;
  readonly frame: StoryFrame;
  readonly retouching: boolean;
  readonly timelineOpen: boolean;
  readonly locked: boolean;
  readonly edit: (change: (current: StudioDraft) => StudioDraft, key?: string | null) => void;
  readonly editPage: StudioPageEdit;
}): {
  readonly active: boolean;
  readonly enter: (requested: StudioBackgroundSection | null) => void;
  readonly leave: () => void;
  readonly column: StudioBackgroundColumn | null;
  readonly onSection: (section: StudioBackgroundSection) => void;
  readonly panel: ReactNode;
} {
  const background = page.background;
  const resolved = studioBackgroundEditResolved(state.edit, { hasBackground: background !== null, timelineOpen });
  const served = background === null ? [] : studioBackgroundSections({ mediaType: background.mediaType, retouching });

  // Un fond retiré (ou défait) ferme l'édition pour de bon : un fond posé
  // plus tard ne rouvre pas les outils d'un autre.
  const { edit: raw, setEdit } = state;
  useEffect(() => {
    if (raw !== null && resolved === null) setEdit(null);
  }, [raw, resolved, setEdit]);

  const leave = () => state.setEdit(null);
  const column: StudioBackgroundColumn | null =
    resolved === null
      ? null
      : {
          sections: served,
          open: resolved.open,
          actions: studioBackgroundToolActions({ offersPhoto: kind !== 'REEL', overlayFree: page.overlay === null, retouching }),
        };

  const panel =
    resolved === null || background === null ? null : (
      <>
        <BackgroundToolsDismiss onBack={leave} />
        {resolved.open !== null ? (
          <div inert={locked}>
            <Suspense fallback={null}>
              <StudioBackgroundToolPanel
                key={resolved.open}
                lang={lang}
                section={resolved.open}
                frame={frame}
                onFrame={(next) => edit((current) => withBackgroundFrame(current, next))}
                onClose={() => state.setEdit({ open: null })}
                {...(retouching
                  ? {}
                  : {
                      caption: { value: background.caption, onChange: (value: string) => edit((current) => withVisualCaption(current, 'visual', value), 'caption:visual') },
                      media: { alt: background.alt ?? '', filter: background.filter ?? null, onPage: editPage },
                    })}
              />
            </Suspense>
          </div>
        ) : null}
      </>
    );

  return {
    active: resolved !== null,
    enter: (requested) => state.setEdit(studioBackgroundEditOpened({ requested, served })),
    leave,
    column,
    onSection: (section) => {
      if (resolved !== null) state.setEdit(studioBackgroundToolTapped(section, resolved));
    },
    panel,
  };
}
