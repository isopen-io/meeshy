# Cycle 20 — L'accusé atteint enfin celui qui l'a produit : l'éventail de rooms laissait tomber tout participant sans compte

## Constat

Ce cycle a démarré sur le premier point ouvert du cycle 18 (l'accusé « remis » inatteignable
depuis les routes de lien) et l'a trouvé **déjà mergé sur `main` à mi-parcours**, produit en
parallèle par une autre exécution de la routine (`73fadd58`). Le travail dupliqué a été
abandonné. Ce qui suit est le **défaut résiduel** que la relecture de ce correctif a fait
apparaître, et qu'il ne pouvait pas voir depuis son propre périmètre.

## Diagnostic

### D1 — l'anonyme acquitte la remise et n'apprend jamais qu'elle a eu lieu

`73fadd58` a fait entrer le participant anonyme dans le filtre de présence
(`_presenceKey = userId ?? id`) et dans la lecture de préférences. Trois lignes plus bas, la
diffusion est restée inchangée :

```ts
for (const p of participants) {
  if (!p.userId) continue;          // ← l'anonyme qui vient d'acquitter est ici
  const userRoom = ROOMS.user(p.userId);
  ...
}
```

Le participant anonyme entre donc dans le NUMÉRATEUR de `getLatestMessageSummary` sans entrer
dans la diffusion qui l'annonce. Son test d'accompagnement fige la croyance :
`expect(roomTargets).not.toContain('user:<anonParticipantId>')`, commenté « l'acquitteur
anonyme n'a pas de room personnelle ».

### D2 — cette room existe, et le dépôt le dit à trois fichiers de distance

`AuthHandler._authenticateAnonymousUser` fait rejoindre `ROOMS.user(participant.id)` à toute
socket anonyme, sous un commentaire écrit en réparant ce défaut sur un autre canal :

> « La room personnelle DOIT utiliser `ROOMS.user(...)` — […] la seule room que TOUT émetteur
> d'événement personnel adresse (`io.to(ROOMS.user(participant.userId ?? participant.id))`).
> Joindre la room `socketUser.id` nue laissait la socket anonyme dans une room qu'aucun
> émetteur n'adresse, si bien que `conversation:unread-updated` n'atteignait jamais les
> participants anonymes. »

La room de conversation n'est pas un substitut : c'est la raison d'être du chaînage. Un client
parti sur la liste des conversations a quitté `conversation:<id>` et n'est joignable que par sa
room personnelle — donc le destinataire que l'éventail laissait tomber est exactement celui qui
ne regardait pas.

### D3 — trois copies verbatim, le même angle mort, deux qui ne lisent même pas l'identité de repli

| Site | Sélection | Éventail |
|---|---|---|
| `MessageHandler.autoDeliverToOnlineRecipients` | `{ id, userId }` | `if (!p.userId) continue` |
| `broadcastReadStatusUpdate` (`routes/message-read-status.ts`) | `{ userId }` | `if (!p.userId) continue` |
| diffusion d'accusé (`routes/conversations/messages.ts`) | `{ userId }` | `if (!p.userId) continue` |

Deux des trois ne chargent pas `Participant.id` : l'identité de repli n'est pas ignorée, elle
n'est pas lue. La forme correcte existait pourtant depuis le cycle 17 dans
`emitUnreadCountsToRecipients` (`ROOMS.user(recipient.userId ?? recipient.id)`), à un fichier
des trois copies fausses.

Conséquence produit, sur les trois chemins : un participant anonyme n'apprend ni qu'un pair a
lu, ni que la remise qu'il vient lui-même d'acquitter a eu lieu.

## Plan
- [x] T1 — RED : `emitToConversationParticipants` adresse un participant sans compte par son id
- [x] T2 — GREEN : `socketio/emitToConversationParticipants.ts` (chaînage, dédup, rooms rendues)
- [x] T3 — les trois copies convergent sur l'unité, les deux `select` chargent `id`
- [x] T4 — l'assertion négative de `MessageHandler.autoDeliver.test.ts` corrigée en positive
- [x] T5 — RED→GREEN sur les deux routes via leur API HTTP publique
- [x] T6 — gates : suite gateway complète + `tsc --noEmit`
- [x] T7 — changeset + CHANGELOG + lessons
- [x] T8 — PR, CI vert, merge sur main

## Revue

### Le travail perdu n'était pas le diagnostic

La collision a coûté le code, pas la lecture. Relire ce qui venait d'atterrir — plutôt que de
constater le doublon et refermer — a produit un défaut que le correctif jumeau ne pouvait pas
voir : son périmètre s'arrêtait au filtre de présence, et le trou était dans la diffusion trois
lignes plus bas. **Après une collision, comparer et publier la différence.**

### Une assertion négative protège le défaut

`not.toContain('user:<anon>')` n'échoue jamais tant que la croyance qu'elle encode reste fausse
dans le code. Elle ne verrouille donc pas un contrat, elle verrouille un état. Ici elle
affirmait l'inverse exact d'un `socket.join` documenté, et le commentaire qui la justifiait
citait la room de conversation comme substitut — ce qu'elle n'est précisément pas.

### Reste ouvert après ce cycle

- Les points hérités du cycle 19 restent ouverts tels quels : `getLatestMessageSummary` décrit
  le DERNIER message de la conversation et non celui qu'on vient d'acquitter ; les mentions du
  chemin de lien attendent toujours l'extraction qui écrit `Message.validatedMentions` ; aucun
  client iOS n'écoute `link:message:new` ; les pièces jointes du chemin de lien n'entrent pas
  dans le pipeline audio ; l'arbitrage `delete-for-me` du cycle 12 attend une validation
  humaine.
- **`emitConversationPreviewUpdate` et les autres émetteurs par room personnelle n'ont pas été
  audités contre la même clé.** Ce cycle a traité les trois copies de l'éventail d'accusés ; la
  règle « adresser par `userId ?? id` » vaut pour tout émetteur personnel, et rien ne garantit
  que les autres la respectent. À instruire par une recherche sur `ROOMS.user(` plutôt que par
  déduction.
