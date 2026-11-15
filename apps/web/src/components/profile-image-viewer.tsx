import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { profileImageAttachment, type ProfileImageKind } from '@/lib/profile/profile-image';

const MediaViewer = lazy(() => import('./media-viewer'));

const LABEL = { avatar: 'profile.avatar.view', banner: 'profile.banner.view' } as const;

type Opened = { readonly kind: ProfileImageKind; readonly container: Element | null };

/**
 * **LA PHOTO ET LA BANNIÈRE S'OUVRENT EN PLEIN ÉCRAN** (#10092, miroir iOS
 * `UserProfileSheet+Header`) — la visionneuse existante, chargée à la demande :
 * Échap, le retour du navigateur et le geste la referment comme partout.
 * Ouverte depuis une feuille (`<dialog>` modal), elle se pose DANS ce dialogue
 * (#8103) : la couche supérieure rendrait inerte tout ce qui est hors de lui.
 */
export function useProfileImageViewer(params: {
  readonly ownerId: string;
  readonly images: Readonly<Record<ProfileImageKind, string | null>>;
}): { readonly open: (kind: ProfileImageKind, from: Element | null) => void; readonly viewer: ReactNode } {
  const [opened, setOpened] = useState<Opened | null>(null);
  const open = useCallback((kind: ProfileImageKind, from: Element | null) => setOpened({ kind, container: from?.closest('dialog') ?? null }), []);
  const close = useCallback(() => setOpened(null), []);
  const src = opened === null ? null : params.images[opened.kind];
  const items = useMemo(
    () => (opened === null || src === null ? [] : [profileImageAttachment({ kind: opened.kind, src, ownerId: params.ownerId })]),
    [opened, src, params.ownerId],
  );
  const language = currentInterfaceLanguage();
  const viewer =
    opened === null || items.length === 0 ? null : (
      <Suspense fallback={null}>
        <MediaViewer items={items} startIndex={0} onClose={close} languages={[language]} fallbackLanguage={language} container={opened.container} />
      </Suspense>
    );
  return { open, viewer };
}

/**
 * LE BOUTON QUI OUVRE L'IMAGE — nommé, 44 px au moins, et rien d'autre : il
 * enveloppe l'image telle que la fiche la peint.
 */
export function ProfileImageButton({
  kind,
  onOpen,
  className,
  children,
}: {
  readonly kind: ProfileImageKind;
  readonly onOpen: (kind: ProfileImageKind, from: Element | null) => void;
  readonly className?: string;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      data-profile-open-image={kind}
      aria-label={translate(currentInterfaceLanguage(), LABEL[kind])}
      onClick={(event) => onOpen(kind, event.currentTarget)}
      className={`block focus-visible:outline-2 focus-visible:outline-offset-2 ${className ?? ''}`}
      style={{ minWidth: 44, minHeight: 44, cursor: 'zoom-in', outlineColor: 'var(--color-ios-brand)' }}
    >
      {children}
    </button>
  );
}
