import * as authEndpoints from '@meeshy/shared/api/endpoints/auth';

import { commentDrafts } from '../comments/comment-draft';
import { unsentComments } from '../comments/unsent-comments';
import { draftStore } from '../send/draft-store';
import { safeLocalStorage } from '../storage';

import { forgetAccountCaches } from './account-caches';
import { createAccountSwitcher, createAccountVault, forgettingLocalData, purgeAccountLocalData } from './accounts';
import { logout } from './auth';
import { httpTransport } from './client';
import { createProvenSessionGestures } from './proven-session';
import { sessionStore } from './session';

/**
 * LES INSTANCES DE L'APPLICATION (#8286) — le coffre et la bascule branchés
 * sur le `localStorage` réel, le magasin de session PARTAGÉ et le transport
 * PARTAGÉ. Seuls les écrans qui les montrent (connexion, réglages) les
 * importent : la première peinture n'en paie rien.
 */

const now = (): number => Date.now();

function storedKeys(): readonly string[] {
  try {
    const storage = globalThis.localStorage;
    return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
  } catch {
    return [];
  }
}

/**
 * CE QU'UN COMPTE LAISSE SUR L'APPAREIL, EFFACÉ (#8286, #8674) — brouillons,
 * modes de lecture, dernières ouvertures, cache de requêtes rangé, seaux du
 * service worker et envois en attente de la file de partage (#10948). Appelé par la déconnexion et par « retirer ce compte » ;
 * jamais par un changement de compte.
 */
function forgetAccountLocally(userId: string): void {
  draftStore.forgetScope(`u_${userId}`);
  commentDrafts.forgetScope(`u_${userId}`);
  unsentComments.getState().forgetScope(`u_${userId}`);
  purgeAccountLocalData({ storage: safeLocalStorage(), userId, keys: storedKeys() });
  forgetAccountCaches({ userId });
  /* Ses envois en attente (contenu et fichiers dans IndexedDB) partent avec lui ; chargé au geste. */
  void import('../send/send-queue-instance').then(({ sendQueue }) => sendQueue.forget(userId)).catch(() => undefined);
}

/**
 * « RETIRER CE COMPTE » efface en plus son carnet de progression (#10161, D-154) :
 * ses photos n'ont pas d'autre exemplaire, la DÉCONNEXION les garde donc, et
 * seul le retrait du compte de l'appareil les emporte.
 */
function retireAccountLocally(userId: string): void {
  forgetAccountLocally(userId);
  /* Chargé au geste : l'écran de connexion et les réglages n'embarquent pas le carnet. */
  void import('../game-photo/notebook-legacy')
    .then(({ forgetAccountNotebook }) => forgetAccountNotebook(typeof indexedDB === 'undefined' ? undefined : indexedDB, userId))
    .catch(() => undefined);
}

export const accountVault = forgettingLocalData(createAccountVault({ storage: safeLocalStorage(), now }), retireAccountLocally);

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

/**
 * LE LIEN D'UN AUTRE COMPTE (#10451) — accepter passe par la bascule (le
 * compte quitté reste au sélecteur), refuser referme la session prouvée côté
 * passerelle. Chargé au geste par `AccountReplacementPrompt`.
 */
export const provenSessions = createProvenSessionGestures({
  store: sessionStore,
  transport: httpTransport,
  suspend: () => accountSwitcher.suspend(),
  noteActive: (user) => accountVault.noteActive(user),
});

/**
 * « DÉCONNEXION » (#8286) — la session finit (serveur compris) et les données
 * locales du compte partent, cache de requêtes compris (#8674) ; le compte
 * RESTE listé, et y revenir exige le mot de passe ou un lien magique. Changer
 * de compte, lui, ne passe jamais ici.
 */
export async function signOutOfThisDevice(): Promise<void> {
  const current = sessionStore.getState().session;
  const userId = current.status === 'authenticated' ? current.user.id : null;
  if (current.status === 'authenticated') accountVault.noteActive(current.user);
  await logout().catch(() => undefined);
  if (userId === null) return;
  /* Son cache de requêtes, rangé par `clearSession()` le temps de la
     déconnexion, part avec le reste (#8674). */
  forgetAccountLocally(userId);
}
