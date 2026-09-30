/**
 * **LE COMPTE AU NOM DUQUEL « REJOINDRE » AGIT** (#8727, jumelle de
 * `ConversationCardJoinAccount.swift`, #8726) — le bouton le NOMME : le nom
 * d'affichage, comme partout où l'app nomme l'utilisateur connecté
 * (`displayName ?? username`), sinon son pseudo. `handle` sert au lecteur
 * d'écran (« Rejoindre avec le compte @pseudo »). `null` ⇒ le bouton garde le
 * libellé générique « Mon compte ».
 */
export type CardJoinAccount = { readonly title: string; readonly handle: string | null };

type Named = { readonly displayName?: string | null; readonly username?: string | null };

const filled = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
};

export function cardJoinAccount(user: Named | null): CardJoinAccount | null {
  if (user === null) return null;
  const username = filled(user.username);
  const handle = username === null ? null : `@${username}`;
  const title = filled(user.displayName) ?? handle;
  return title === null ? null : { title, handle };
}
