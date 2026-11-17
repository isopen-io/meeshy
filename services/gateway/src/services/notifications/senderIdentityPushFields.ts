/**
 * Les quatre clés `data` qui NOMMENT ou MONTRENT l'acteur sur le fil APNs/FCM :
 * nom affiché, pseudo, avatar et `imageURL` (l'avatar sert aussi de vignette).
 * La NSE iOS en fait un `INSendMessageIntent` — nom et photo sur l'écran
 * verrouillé — et le titre `'Meeshy'` de `showSenderName:false` ne masque rien
 * tant que ces clés voyagent à côté.
 *
 * Site UNIQUE de la règle : sous `showSenderName:false`, les quatre partent
 * VIDES. `senderId` reste (routage au tap, jamais affiché) et la FORME de la
 * charge ne change pas — une ancienne NSE retombe sur « Meeshy » sans avatar
 * au lieu de planter (#18910).
 */
export type PushActorIdentity = {
  readonly username?: string | null;
  readonly displayName?: string | null;
  readonly avatar?: string | null;
};

export type SenderIdentityPushFields = {
  readonly senderUsername: string;
  readonly senderDisplayName: string;
  readonly senderAvatar: string;
  readonly imageURL: string;
};

export function senderIdentityPushFields(params: {
  readonly actor: PushActorIdentity | undefined;
  readonly showSenderName: boolean;
}): SenderIdentityPushFields {
  const { actor, showSenderName } = params;
  if (!showSenderName) return { senderUsername: '', senderDisplayName: '', senderAvatar: '', imageURL: '' };
  return {
    senderUsername: actor?.username || '',
    senderDisplayName: actor?.displayName || '',
    senderAvatar: actor?.avatar || '',
    imageURL: actor?.avatar || '',
  };
}

const escapeForPattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Le CORPS de la bannière sous `showSenderName:false`. Plusieurs corps nomment l'acteur (« Nouvelle conversation
 * avec {actor} », réactions, demandes d'ami) et s'affichent sur l'écran verrouillé sous le titre neutre : son nom
 * affiché et son pseudo y deviennent « Quelqu'un » dans la langue du destinataire (`someone`, résolu seulement
 * quand il sert), en mot entier — un nom d'une lettre ne se cherche pas, il mutilerait le texte.
 */
export async function bodyWithoutActorName(params: {
  readonly body: string;
  readonly actor: PushActorIdentity | undefined;
  readonly showSenderName: boolean;
  readonly someone: () => Promise<string>;
}): Promise<string> {
  const names = [params.actor?.displayName, params.actor?.username]
    .map((name) => name?.trim() ?? '')
    .filter((name) => [...name].length >= 2)
    .sort((a, b) => b.length - a.length);
  if (params.showSenderName || names.length === 0) return params.body;
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${names.map(escapeForPattern).join('|')})(?![\\p{L}\\p{N}_])`, 'gu');
  if (!pattern.test(params.body)) return params.body;
  const someone = await params.someone();
  return params.body.replace(pattern, someone);
}

/**
 * Les DEUX lignes de texte de la bannière sous `showSenderName:false` : le corps ET le sous-titre. Le sous-titre
 * porte l'action sociale, où l'auteur du contenu est fusionné (« a répondu dans une story de Alice ») — quand
 * l'auteur est l'acteur, son nom s'y lit sur l'écran verrouillé sous le titre neutre (#19210). Un seul site pour la
 * création et pour le remplacement d'une notification réécrite ; `someone` est résolu une fois au plus.
 */
export async function bannerTextsWithoutActorName(params: {
  readonly body: string;
  readonly subtitle: string | undefined;
  readonly actor: PushActorIdentity | undefined;
  readonly showSenderName: boolean;
  readonly someone: () => Promise<string>;
}): Promise<{ readonly body: string; readonly subtitle: string | undefined }> {
  let someone: Promise<string> | undefined;
  const mask = (text: string): Promise<string> => bodyWithoutActorName({
    body: text,
    actor: params.actor,
    showSenderName: params.showSenderName,
    someone: () => (someone ??= params.someone()),
  });
  return {
    body: await mask(params.body),
    subtitle: params.subtitle === undefined ? undefined : await mask(params.subtitle),
  };
}

/** L'acteur tel qu'une ligne `Notification` relue le porte (JSON) — seuls les champs qui le NOMMENT. */
export function pushActorOfRow(actor: unknown): PushActorIdentity | undefined {
  if (actor === null || typeof actor !== 'object') return undefined;
  const read = (key: string): string | null => {
    const value = (actor as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  };
  return { username: read('username'), displayName: read('displayName'), avatar: read('avatar') };
}
