# Cycle 140 — la file de rejeu ne remet que ce qui est encore VIVANT (#16685)

**Branche** : `claude/exciting-planck-6fgpu8`. **Issue** : #16685, milestone #242.
Suivi du cycle 139 (#16684), dont l'audit a déposé ce défaut vérifié ligne à ligne.

## Le défaut

`enqueueForOfflineParticipants` écrit `payload: body` VERBATIM. Le drain ne
rejoue qu'un gate d'APPARTENANCE (`_dropEndedMemberships`). **Rien ne relit
l'état du MESSAGE.** Un message éphémère brûlé — `content: ''`, `deletedAt`
posé, fichiers supprimés — laisse une copie LISIBLE de son texte dans
`delivery_queue:<userId>` (Redis, AOF) pour le reste des 48 h de TTL, et le
prochain drain l'émet.

`NotificationService.messageLiveness` existe pour exactement cette raison
(« we MUST NOT leak the original content via the banner »). Le chemin de REJEU,
qui remet bien plus qu'une bannière, n'a aucun équivalent.

## Le cadrage, et c'est le point du lot

**Une garde de vivacité ne s'applique PAS à toutes les entrées de la file.**
`'deleted'` et `'expired'` ont pour UNIQUE objet d'annoncer la mort du message :
les refuser parce que le message est mort laisserait le client afficher
indéfiniment un message détruit — strictement PIRE que le défaut qu'on corrige.

La loi qui sépare les deux ensembles EXISTE et est déjà déclarée :
`TextBearingQueuedEvent` (`socketio/queuedEventContract.ts`, #12822) — « les
familles dont la charge porte le TEXTE d'un message, ou ce qui voyage avec lui ».
Le gate s'y adosse, il ne réénumère pas.

| famille | la charge porte | la garde |
|---|---|---|
| `new` `edited` `translation` `link-message` `attachment-updated` | le TEXTE | **gardée** |
| `deleted` `expired` | la mort du message | **doit passer** |
| `pinned` `unpinned` réactions ×4 | des identifiants, un emoji | rien à garder |

## Le plan

1. Extraire `messageLiveness` de `NotificationService` en loi partagée — un
   site, deux consommateurs (l'éventail de bannières, le drain). Le verdict
   reste à TROIS états : fail-CLOSED sur la preuve, fail-OPEN sur son absence.
2. Gate dans `_drainPendingMessages`, APRÈS le gate d'appartenance
   (l'autorisation avant le contenu, et moins d'ids à interroger).
3. `messageId` filtré par la forme ObjectId AVANT l'agrégation `{ in: [...] }` —
   la leçon du cycle 112 : un champ agrégé n'a pas de correctif local, et une
   entrée illisible ferait lever la requête pour tout le lot.
4. Témoin ROUGE d'abord : une entrée `'new'` enfilée, le message brûlé, le
   drain n'émet PAS son contenu — ET une entrée `'expired'` sur le même message
   passe.

## Critère de fin

Le drain interroge la vivacité avant d'émettre, par la loi existante ; `gone`
jette l'entrée, `unknown` la laisse passer (une livraison manquée se rattrape,
un secret remis non).
