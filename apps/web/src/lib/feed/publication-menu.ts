/**
 * **LES ENTRÉES DU MENU « ⋯ » D'UNE PUBLICATION** (#7533/#7534, directive
 * porteur du 2026-09-23) — miroir `FeedPostCard+Header.swift:164-241` et
 * `ReelFeedCard.swift:495-555`, DANS LEUR ORDRE : Ouvrir · Copier le texte ·
 * Partager · Enregistrer — puis, sur SES publications, Épingler · Modifier ·
 * Supprimer ; sur celles des autres, Signaler.
 *
 * ## UNE ENTRÉE N'EXISTE QUE SI SON GESTE EXISTE (loi 4)
 *
 * iOS décide par des rappels optionnels (`onPin != nil`, `onEdit != nil`…)
 * posés par l'hôte ; cette fonction reçoit les mêmes capacités, nommées, et
 * rend la liste. Un écart, assumé :
 *
 * - **« Enregistrer » est le SIGNET, toujours** : iOS remplace l'entrée par
 *   « Sauvegarder le média » (écriture dans la photothèque) quand la carte en
 *   porte un ; le navigateur n'a pas de photothèque, le signet est le geste
 *   qui existe. Il bascule avec l'état servi (« Retirer des enregistrements »).
 *
 * ## « MODIFIER » (#7534) — LE TEXTE SEULEMENT
 *
 * `FeedPostCard+Header.swift:208-215` la pose ENTRE Épingler et Supprimer,
 * sans séparateur avant elle, hors du bloc destructif — miroir exact ici.
 * L'éditeur web (`publication-edit-sheet.tsx`) ne porte que le texte ; médias,
 * langue, type et audience restent hors tranche (issue compagnon).
 *
 * ## « À MOI » SE DÉCIDE PAR L'IDENTITÉ DE SESSION
 *
 * Un invité (`viewerId === null`) ou une carte sans auteur connu n'est jamais
 * « à moi » — et ne peut rien signaler non plus : la route de signalement
 * exige un compte. La passerelle reste l'autorité (403) ; ceci ne décide que
 * de ce qu'on MONTRE.
 */
export type PostMenuEntry = 'open' | 'copyText' | 'share' | 'save' | 'pin' | 'edit' | 'delete' | 'report';

export function postMenuEntries(params: {
  readonly viewerId: string | null;
  readonly authorId: string | undefined;
  readonly isDetail: boolean;
  readonly hasText: boolean;
  readonly canShare: boolean;
  readonly canSave: boolean;
}): readonly PostMenuEntry[] {
  const { viewerId, authorId, isDetail, hasText, canShare, canSave } = params;
  const signedIn = viewerId !== null && viewerId !== '';
  const isOwn = signedIn && authorId !== undefined && authorId === viewerId;

  return [
    ...(isDetail ? [] : (['open'] as const)),
    ...(hasText ? (['copyText'] as const) : []),
    ...(canShare ? (['share'] as const) : []),
    ...(canSave && signedIn ? (['save'] as const) : []),
    ...(isOwn ? (['pin', 'edit', 'delete'] as const) : []),
    ...(signedIn && !isOwn ? (['report'] as const) : []),
  ];
}
