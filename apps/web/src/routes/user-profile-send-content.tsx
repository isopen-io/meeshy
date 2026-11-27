import { Suspense, lazy, useState } from 'react';

import type { SendContentOutcome } from '@/lib/profile/send-content';
import { translateCircles } from '@/lib/i18n-circles-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useCirclesCatalog } from '@/lib/use-circles-catalog';
import { useReaderLanguages } from '@/lib/view/use-reader';

import { BRAND, BRAND_FILL, FOCUS } from './user-profile-style';

/* La feuille, sa grille et le moteur d'envoi ne se chargent qu'au premier toucher. */
const ProfileSendContentSheet = lazy(() => import('@/components/profile-send-content-sheet').then((m) => ({ default: m.ProfileSendContentSheet })));

/**
 * **« LUI ENVOYER UN CONTENU » DANS « ENSEMBLE »** (#20245, référence `ProfileActionsPartContent.swift`,
 * `together.sendContent`) — la rangée qui ouvre la grille de mes contenus. L'hôte ne la monte que quand
 * le verdict servi ouvre `together` (`sendContentOffered`) : la rangée ne rejuge rien.
 */
export function ProfileSendContentRow({
  language,
  person,
  viewerId,
  onNotice,
}: {
  readonly language: InterfaceLanguage;
  readonly person: { readonly id: string; readonly name: string };
  readonly viewerId: string | null;
  readonly onNotice: (message: string, failed: boolean) => void;
}) {
  const ready = useCirclesCatalog(language);
  const { languages, locale } = useReaderLanguages();
  const [open, setOpen] = useState(false);
  if (!ready || viewerId === null || viewerId === '') return null;
  return (
    <div data-send-content-row="" className="grid gap-2 rounded-card px-3.5 py-3" style={{ backgroundColor: BRAND_FILL }}>
      <button
        type="button"
        data-send-content-open=""
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={`btn-press grid place-items-center rounded-chip px-4 text-body font-bold ${FOCUS}`}
        style={{ minHeight: 52, color: BRAND, border: `1.5px solid ${BRAND}`, outlineColor: BRAND }}
      >
        <span>
          <span aria-hidden="true">📤 </span>
          {translateCircles(language, 'sendContent.title')}
        </span>
      </button>
      {open ? (
        <Suspense fallback={null}>
          <ProfileSendContentSheet
            language={language}
            person={person}
            viewerId={viewerId}
            contentLanguage={locale}
            readerLanguages={languages}
            onClose={() => setOpen(false)}
            onOutcome={(outcome: SendContentOutcome, message: string) => onNotice(message, outcome === 'refused')}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
