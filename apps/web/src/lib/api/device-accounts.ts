import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';

import { draftStore } from '../send/draft-store';
import { safeLocalStorage } from '../storage';

import { forgetAccountCaches } from './account-caches';
import { createAccountSwitcher, createAccountVault, purgeAccountLocalData } from './accounts';
import { logout } from './auth';
import { httpTransport } from './client';
import { sessionStore } from './session';

/**
 * LES INSTANCES DE L'APPLICATION (#8286) — le coffre et la bascule branchés
 * sur le `localStorage` réel, le magasin de session PARTAGÉ et le transport
 * PARTAGÉ. Seuls les écrans qui les montrent (connexion, réglages) les
 * importent : la première peinture n'en paie rien.
 */

const now = (): number => Date.now();

export const accountVault = createAccountVault({ storage: safeLocalStorage(), now });

export const accountSwitcher = createAccountSwitcher({
  vault: accountVault,
  store: sessionStore,
  now,
  endServerSession: (session) => {
    void httpTransport
      .request<{ message: string }>({
        method: 'POST',
        path: authEndpoints.logout,
        headers: { Authorization: `Bearer ${session.token}`, 'X-Session-Token': session.sessionToken },
      })
      .catch(() => undefined);
  },
});

function storedKeys(): readonly string[] {
  try {
    const storage = globalThis.localStorage;
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
  } catch {
    return [];
  }
}

/**
 * « DÉCONNEXION » (#8286) — la session finit (serveur compris) et les données
 * locales du compte partent, cache de requêtes compris (#8674) ; le compte RESTE listé, et y revenir exige le mot
 * de passe ou un lien magique. Changer de compte, lui, ne passe jamais ici.
 */
export async function signOutOfThisDevice(): Promise<void> {
  const current = sessionStore.getState().session;
  const userId = current.status === 'authenticated' ? current.user.id : null;
  if (current.status === 'authenticated') accountVault.noteActive(current.user);
  await logout().catch(() => undefined);
  if (userId === null) return;
  draftStore.forgetScope(`u_${userId}`);
  purgeAccountLocalData({ storage: safeLocalStorage(), userId, keys: storedKeys() });
  /* Son cache de requêtes, rangé par `clearSession()` le temps de la
     déconnexion, et les seaux du service worker (#8674). */
  forgetAccountCaches({ userId });
}
