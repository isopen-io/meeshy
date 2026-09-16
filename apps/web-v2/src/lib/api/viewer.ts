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
  /**
   * L'INVITÉ D'UN LIEN (#5561) — il a une identité : un participant, un pseudo
   * qu'il a choisi. `isAnonymous` reste VRAI (il n'a pas de compte) mais `id`
   * n'est plus `null` : c'est ce qui fait que ses propres bulles sont les
   * siennes dans le fil (`isMineOf`, `view/message.ts`). Le confondre avec un
   * visiteur SANS session lui ferait lire ses propres messages comme ceux d'un
   * autre.
   *
   * `handle` reste `null` : un invité n'a pas d'identifiant public, et en
   * inventer un depuis son pseudo laisserait croire qu'on peut le retrouver.
   */
  if (input.session.status === 'guest') {
    const nickname = input.session.guest.nickname.trim();
    return {
      id: input.session.guest.participantId,
      handle: null,
      /* Un lien peut ne PAS exiger de pseudo : la passerelle en génère alors un
       * qu'elle ne remet pas à la jonction. Plutôt que d'inventer un nom ou
       * d'en afficher un vide, on nomme le RÔLE — et le fil relira le vrai
       * pseudo quand il interrogera `PATCH /guest-sessions/me`. */
      displayName: nickname === '' ? 'Invité' : nickname,
      isAnonymous: true,
    };
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
