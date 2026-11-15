## Leçon 522 — Un module qui AFFIRME garder une pièce protégée sans lire ses propres drapeaux ment par omission

**Le fait (revue de `media`, #4525, 2026-09-04).** La galerie des médias d'une conversation
(`apps/web-v3/lib/api/medias.ts`) se déclare elle-même « une PROJECTION PURE du fil », et son test
dédié prouve qu'un message à vue unique / flouté / éphémère / supprimé n'y projette AUCUNE pièce
(`e2e/visual/v3-medias.spec.ts:200-206`). C'est vrai — au niveau du MESSAGE. Mais la route lue
(`GET /conversations/:id/attachments`, sept clés minimales : `id`, `fileName`, `mimeType`,
`fileSize`, `fileUrl`, `thumbnailUrl`, `duration`) ne sert PAS les trois drapeaux posés au niveau de
la PIÈCE JOINTE elle-même — `MessageAttachment.isViewOnce` / `isBlurred` / `effectFlags` (cycle 125
du Prisme, CLAUDE.md). La v3 en est aveugle, et rien dans le module ne le dit : le doc-comment lit
comme si la protection était complète.

> **La forme générale — jumelle du cycle 124 du Prisme** (« un champ de service qui DÉCLARE une
> restriction ne la fait pas respecter »), transposée d'un côté qui SUR-sert vers un côté qui
> SOUS-lit : ici ce n'est pas un champ qui ment sur ce qu'il transporte, c'est un MODULE qui
> ment sur ce qu'il GARDE, en confondant la protection qu'il applique (au niveau du message, la
> couche qu'il touche) avec la protection qui existe (au niveau de la pièce, une couche qu'il ne
> lit jamais parce que sa route ne la sert pas). Un témoin vert sur « aucune pièce d'un message
> protégé ne fuit » ne prouve RIEN sur « aucune pièce PROTÉGÉE ne fuit » tant qu'une protection
> peut exister à un niveau que le module ne consulte pas.

**La question à poser avant d'écrire « ce module protège X »** : la protection de X a-t-elle
PLUSIEURS niveaux de déclaration (message ET pièce, ici) ? Si oui, laquelle mon module LIT-il, et
laquelle existe mais qu'il n'a pas les moyens de voir parce que sa source ne la sert pas ? La
réponse à la seconde question n'est pas une nuance à ajouter en bas de doc-comment : c'est une
ligne de rapport « restante », et une issue gateway compagnon (ouvrir la route au minimal élargi),
jamais un contournement côté client.

Site : `apps/web-v3/lib/api/medias.ts`. Détail : rapport de revue `media` (#4525), tour 2026-09-04.
