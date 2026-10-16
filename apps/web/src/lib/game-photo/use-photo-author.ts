import { useMemo } from 'react';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';

import { photoAuthorOf, type PhotoAuthor } from './author-plate';

/** L'auteur des photos du jeu (#10816) : le lecteur, résolu au site unique (`resolveViewer`) ; `null` pour un invité. */
export function usePhotoAuthor(): PhotoAuthor | null {
  const session = useStore(sessionStore, (state) => state.session);
  return useMemo(() => photoAuthorOf(resolveViewer({ source: apiDeps.source, session })), [session]);
}
