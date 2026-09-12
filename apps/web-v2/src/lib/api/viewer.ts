import { VIEWER_HANDLE, VIEWER_ID } from './fixtures-base';
import type { DataSource } from './config';
import type { SessionState } from './session';

/**
 * QUI LIT — le site UNIQUE (#5695, étape 9) que les surfaces à venir
 * copieront pour résoudre l'identité du lecteur, source-aware comme
 * `resolveRouteAccess` (`session-guard.ts:39-44`).
 *
 * `id: null` / `handle: null` pour un invité : jamais une chaîne vide qui
 * ressemblerait à un identifiant réel.
 */
export type Viewer = {
  readonly id: string | null;
  readonly handle: string | null;
  readonly displayName: string;
  readonly isAnonymous: boolean;
  /**
   * MON PORTRAIT — servi par la connexion (`SessionUser.avatar`,
   * `session.ts`), OMIS quand le compte n'en a pas (jamais posé à
   * `undefined` : `exactOptionalPropertyTypes`). Ajouté ici plutôt que relu
   * du `sessionStore` par chaque écran (revue #5652) : la pastille « moi » du
   * rail de stories est la PREMIÈRE surface à en avoir besoin, les suivantes
   * (profil, composeur, en-tête du fil) liront la même clé.
   */
  readonly avatar?: string;
};

export function resolveViewer(input: { readonly source: DataSource; readonly session: SessionState }): Viewer {
  if (__FIXTURES__ && input.source === 'fixtures') {
    return { id: VIEWER_ID, handle: VIEWER_HANDLE, displayName: 'Vous', isAnonymous: false };
  }
  if (input.session.status === 'authenticated') {
    const avatar = input.session.user.avatar?.trim();
    return {
      id: input.session.user.id,
      handle: input.session.user.username,
      displayName: input.session.user.displayName ?? input.session.user.username,
      isAnonymous: false,
      ...(avatar === undefined || avatar === '' ? {} : { avatar }),
    };
  }
  return { id: null, handle: null, displayName: '', isAnonymous: true };
}
