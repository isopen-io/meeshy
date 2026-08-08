# Cycle 23 — Le cinquième écrivain : `message:edit` ne nommait personne

Tête laissée par le cycle 22 :
« **`MessageHandler.handleMessageEdit` (édition par WebSocket) ne touche AUCUNE mention.**
Il écrit `content`, `isEdited`, `editedAt`, `translations: null` et s'arrête là : ni ligne
`Mention`, ni `validatedMentions`. Éditer « salut @alice » en « salut @bob » par socket laisse
Alice mentionnée et ne nomme jamais Bob. C'est le cinquième écrivain de la famille, et le seul
qui n'écrit rien du tout. »

Vérifié, et c'est bien le cas — sur le transport d'édition **PRIMAIRE**. Le handler porte déjà
la parité stricte avec REST sur la fenêtre de 24 h, sur la garde anti-suppression concurrente, sur
le report des pièces jointes et sur l'éventail `conversation:updated`. La seule chose qu'il n'avait
jamais reprise à REST, c'est ce que le message doit aux gens qu'il nomme.

## Ce que l'édition socket cassait

| # | Défaut | Ce que l'utilisateur voyait |
|---|---|---|
| D1 | aucune ligne `Mention` créée | éditer un message pour y ajouter `@bob` ne mettait jamais Bob dans son inbox `/mentions` |
| D2 | aucune ligne `Mention` supprimée | retirer `@alice` du texte la laissait mentionnée pour toujours — la ligne survit au mot qui l'a produite |
| D3 | `validatedMentions` jamais réécrit | le web surligne depuis ce champ : le nom retiré restait surligné, le nom ajouté restait du texte brut |
| D4 | aucune notification | personne n'apprenait jamais avoir été nommé par une édition |
| D5 | aucun `mention:created` | même en ligne, un nouveau nommé hors du salon de conversation n'était averti par rien : `message:edited` ne fan qu'à `conversation:<id>` |

## La forme du correctif — souder ce qui n'avait de sens qu'ensemble

Le cycle 22 avait livré `replaceMessageMentions` (la réconciliation) et la route REST gardait,
dépliée à côté, la notification des entrants. Deux appels séparés, dont le second consomme le seul
produit que le premier ne consomme pas (`newlyMentionedUserIds`). C'est exactement la forme qui
permet à un écrivain d'en oublier une moitié — ou, ici, les deux.

`reconcileEditedMentions` les soude en un point d'appel public unique :

```ts
export async function reconcileEditedMentions(params: EditedMentionParams): Promise<ResolvedMentions> {
  const resolved = await replaceMessageMentions(params);
  await notifyNewlyMentioned(params, resolved.newlyMentionedUserIds);
  return resolved;
}
```

Les deux appelants d'édition passent par là : la route REST (qui perd 45 lignes dépliées) et
`MessageHandler.handleMessageEdit` (qui en gagne 10). Même contrat des deux côtés :

- **Seuls les ENTRANTS sont notifiés.** Renotifier l'ensemble ferait de dix corrections de frappe
  dix pushes pour quelqu'un nommé au premier envoi.
- **La notification est APRÈS l'écriture et son échec ne la défait pas.** `reconciled` continue de
  décrire la base, qui a bel et bien été réconciliée.
- **`editorUserId` est un `User.id`,** pas le `Participant.id` que porte `Message.senderId` — c'est
  contre lui que `createMentionNotificationsBatch` filtre l'auto-mention (cf. cycle 22, D3).

## `validatedMentions` dans le payload : établi vide ≠ rien établi

Le handler ne recopie `validatedUsernames` dans `message:edited` que si `reconciled`. Poser le
champ inconditionnellement rejouerait **au niveau du payload** l'effacement que l'unité vient
d'empêcher en base : les clients écrasent leur message caché avec `{ ...cached, ...editedPayload }`,
et un `[]` venu d'une panne transitoire effacerait un surlignage vivant. Le web cache avec
`staleTime: Infinity` — la mention ne reviendrait pas.

À l'inverse, un texte édité qui ne nomme plus personne **doit** produire `validatedMentions: []` :
c'est un vide ÉTABLI. Les deux cas sont testés séparément, parce que rien dans le champ lui-même ne
les distingue.

## `mention:created` sur l'édition (D5)

Émis aux entrants dans leur salon **personnel**, avec la garde d'auto-mention. Les `User.id` sont
déjà résolus par la réconciliation, donc contrairement au chemin d'envoi
(`broadcastNewMessage`, qui repart des usernames de `validatedMentions`), aucune requête de
résolution n'est nécessaire. C'est le point resté ouvert depuis le cycle 21 — clos pour le chemin
socket ; la route REST n'émet toujours rien (cf. « reste ouvert »).

## Ce que le cycle a aussi corrigé, côté test

Le double d'`io` de `MessageHandlerEditDelete.test.ts` partageait **un seul** objet d'émission pour
tous les salons : « émis à `user:bob` » et « émis à `conversation:X` » y étaient indistinguables.
Toute assertion de ciblage y passait par accident — y compris celle qui affirmait que
`conversation:updated` partait vers le salon de conversation, alors qu'il ne part qu'aux salons
personnels. Le double est désormais **par salon** (`emitsTo(io, room)`), et l'assertion de
l'éventail a été retournée dans le bon sens (`.not.toContainEqual` sur le salon de conversation).

## Vérification

```
services/gateway : 600 suites / 15622 tests — tous verts
tsc --noEmit     : propre
```

Nouveaux tests : 5 sur `reconcileEditedMentions` (entrants seuls, déjà-mentionné silencieux, rien
établi ⇒ rien notifié, notification en panne ⇒ réconciliation acquise, sans notifier câblé), 7 sur
le chemin socket (réconciliation des lignes, `validatedMentions` persisté + diffusé, notification
du seul entrant, `mention:created` au salon personnel, auto-mention silencieuse, panne qui
n'efface rien, vide établi qui efface).

## Reste ouvert après ce cycle

- **`MessageHandler.handleMessageEdit` ne repasse toujours pas par le traitement des liens
  `[[url]]` / `<url>`** que la route REST applique avant de sauver (`trackingLinkService
  .processExplicitLinksInContent`). Éditer un message par socket pour y coller un lien traçable
  écrit le texte brut ; par REST, le même geste crée le lien. Sixième asymétrie du même handler,
  et la seule qui reste sur le contenu lui-même. **Tête du prochain cycle.**
- **L'édition REST n'émet toujours aucun `mention:created`** (cycle 21). Le chemin socket le fait
  désormais ; REST n'a pas d'`io` sous la main dans cette route — le câblage passe par le
  `fastify.socketIOManager`, une pièce distincte.
- **Le domaine social extrait encore avec `extractMentions`.** `routes/posts/core.ts` (création ET
  édition de post) et `routes/posts/comments.ts` : un `@John Doe` dans un post ou un commentaire ne
  nomme personne — jamais, pas seulement à l'édition.
- **`repair-mention-user-ids.ts` n'a jamais été exécuté** — aucun accès base depuis cette routine.
  À lancer sans `--apply` d'abord.
- **`MentionCreatedEventData.mentionedParticipantId` reste dans les types partagés** et n'est peuplé
  par aucun émetteur ; le SDK iOS le décode. Champ mort des deux côtés.
- **`getMentionsForMessage` et `getRecentMentionsForUser` n'ont aucun consommateur d'écran** —
  l'inbox `/mentions` reste une capacité backend sans écran.
- **`MeeshySocketIOManager.getConversationParticipantsForMention` est toujours un deuxième
  exemplaire du chargeur de participants** (cycle 21, inchangé).
- **`getLatestMessageSummary` résume le DERNIER message de la conversation, pas celui qu'on vient
  d'acquitter** (cycle 19, inchangé).
- L'arbitrage `delete-for-me` tranché par le cycle 12 attend toujours une validation humaine.
