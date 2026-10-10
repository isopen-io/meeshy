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
 * ## « MODIFIER » (#7534, #9317) — LE STUDIO, OU LA FEUILLE DE TEXTE
 *
 * `FeedPostCard+Header.swift:208-215` la pose ENTRE Épingler et Supprimer,
 * sans séparateur avant elle, hors du bloc destructif — miroir exact ici.
 * Une publication qui porte une scène ou un média se modifie dans le STUDIO
 * (`/posts/:id/edit`, `routes/publication-edit.tsx`) : scènes modifiées,
 * ajoutées, supprimées. Un post de texte seul, ou une republication, garde la
 * feuille de texte (`publication-edit-sheet.tsx`).
 *
 * ## « VUES » (#9727) — QUI A VU CETTE PUBLICATION : LES ADMINISTRATEURS SEULS
 *
 * Décision porteur du 2026-10-09 : « seuls les administrateurs peuvent voir qui
 * a vu les posts » — l'AUTEUR d'un post ou d'un réel n'en voit que le NOMBRE,
 * comme avant #9727. L'entrée ne s'offre donc qu'à ADMIN/BIGBOSS (le rôle
 * servi par la matrice d'administration, `useAdministrationRank`), sur toute
 * publication, avant le bloc de l'auteur ; elle ouvre la feuille « Vues »
 * (`publication-viewers-sheet.tsx`, `GET /posts/:postId/interactions`), dont
 * chaque lecture est journalisée côté passerelle (#9733). Les stories gardent
 * LEUR « Vues » à l'auteur, par leurs propres surfaces (`story.tsx`). Même
 * règle dans le menu iOS (`FeedPostCard+Header.swift`).
 *
 * ## « À MOI » SE DÉCIDE PAR L'IDENTITÉ DE SESSION
 *
 * Un invité (`viewerId === null`) ou une carte sans auteur connu n'est jamais
 * « à moi » — et ne peut rien signaler non plus : la route de signalement
 * exige un compte. La passerelle reste l'autorité (403) ; ceci ne décide que
 * de ce qu'on MONTRE.
 */
export type PostMenuEntry = 'open' | 'copyText' | 'share' | 'save' | 'views' | 'pin' | 'edit' | 'delete' | 'report';

export function postMenuEntries(params: {
  readonly viewerId: string | null;
  readonly authorId: string | undefined;
  readonly isDetail: boolean;
  readonly hasText: boolean;
  readonly canShare: boolean;
  readonly canSave: boolean;
  /** ADMIN/BIGBOSS — la seule personne à qui « Vues » s'offre sur un post ou un réel. */
  readonly viewerIsAdministrator: boolean;
}): readonly PostMenuEntry[] {
  const { viewerId, authorId, isDetail, hasText, canShare, canSave, viewerIsAdministrator } = params;
  const signedIn = viewerId !== null && viewerId !== '';
  const isOwn = signedIn && authorId !== undefined && authorId === viewerId;

  return [
    ...(isDetail ? [] : (['open'] as const)),
    ...(hasText ? (['copyText'] as const) : []),
    ...(canShare ? (['share'] as const) : []),
    ...(canSave && signedIn ? (['save'] as const) : []),
    ...(signedIn && viewerIsAdministrator ? (['views'] as const) : []),
    ...(isOwn ? (['pin', 'edit', 'delete'] as const) : []),
    ...(signedIn && !isOwn ? (['report'] as const) : []),
  ];
}
