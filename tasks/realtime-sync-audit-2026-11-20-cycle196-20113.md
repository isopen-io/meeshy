## Cycle 196 — `uploadedBy` n'a plus qu'UN espace de clés, et l'inventaire qui le garde a rendu le défaut qui compte (#20113)

**Date** : 2026-11-20. **Base** : `dev` à `dd00ea14d4`. **Issue** : #20113. **Suivi ouvert** : #20114.

### Le relevé

`MessageAttachment.uploadedBy` avait deux écrivains et deux espaces :

| écrivain | valeur posée |
|---|---|
| `UploadProcessor` ×2, `routes/uploads/tus-handler.ts` ×2 | identité de COMPTE (`User.id`, ou le `Participant.id` d'un anonyme, qui EST son identité d'authentification) |
| `messaging/copyAttachments.ts` | **`Participant.id`** du demandeur |
| `messaging/MessageProcessor.copyForwardedAttachments` | **`Participant.id`** de l'expéditeur (un `Message.senderId`) |

Le champ est **servi aux clients** — le schéma de la galerie le décrit
littéralement « *Uploader id — gates the delete affordance* » — alors que seul le
serveur peut faire la jointure `Participant → User` qui lui donnerait un sens.

`GlobalAchievements` avait déjà tranché la sémantique voulue sans le savoir : il
compte sur `uploadedBy` **plutôt que** sur `message.sender.userId`, « (indexé) …
deux `$lookup` imbriqués par pièce jointe ». Les écrivains de copie étaient donc
la déviation, pas la norme.

### Pourquoi la réponse n'était PAS de servir un verdict

Mon premier plan (#20113, lot 1) était « le canal sert `canDeleteForEveryone` ».
Il ne pouvait pas marcher : un verdict d'appartenance est **par lecteur**, et
`serializeAttachmentForSocket` compose une charge **diffusée à une room** — il
n'y a pas de lecteur à qui répondre. Servir un verdict y aurait été soit faux,
soit une émission par lecteur pour une affordance de bouton. Corrigé sur
l'issue avant d'écrire une ligne.

La réponse est l'unification à l'ÉCRITURE, et **la valeur était déjà en main
aux deux sites** : `copyAttachments` avait lu `requester.userId` deux
instructions plus haut pour son contrôle d'appartenance.

### Le livrable

1. **`services/attachments/uploaderIdentity.ts`** — site unique, deux
   responsabilités SÉPARÉES : `uploaderIdentityOf` / `resolveUploaderIdentity`
   ÉCRIVENT (`userId ?? id`, la convention du dépôt) ; `ownsAsUploader`
   RECONNAÎT les lignes héritées. Elle vivait privée dans
   `routes/attachments/metadata.ts` depuis #13608, **sans autre appelant** — la
   règle valait là où quelqu'un l'avait récitée (leçon 307).
2. Les **deux écrivains de copie** unifiés. Le repli d'une lecture de participant
   en échec est le `Participant.id` : le comportement d'AVANT, que
   `ownsAsUploader` reconnaît — jamais une pièce sans déposant.
3. **`uploaded-by-key-space-sweep`** — l'inventaire gelé des sites qui POSENT ou
   APPARIENT la valeur, chacun avec son espace déclaré.

### Ce que l'inventaire a rendu, et que le symptôme ne pouvait pas donner

Mon premier discriminant ne relevait que les écrivains. En y faisant entrer les
`where` — **un appariement affirme un espace autant qu'une écriture** — cinq
sites sont apparus qui apparient `uploadedBy` à l'échelle d'un compte entier,
dont deux qui comptent :

- `routes/me/export-sections.ts` : l'**export RGPD** ne contient pas les médias
  transférés du compte ;
- `services/purgeDeletedAccountMedia.ts` : la **purge** de fin de période de
  grâce ne voit pas ces lignes.

Unifier les écrivains ne répare que les lignes à venir. La reprise des lignes
héritées est une **migration de données de production**, donc une décision du
porteur (#9223) : elle est #20114, labellisée `décision-produit` et assignée,
avec sa mesure à faire d'abord et le cliquet qui en suit le solde (cinq verdicts
`account-blind-to-legacy`, qui ne peuvent que baisser).

### Le ROUGE, prouvé par mutation

| mutation | témoins rouges |
|---|---|
| `copyAttachments` repose `requesterParticipantId` | 1 (le cas inscrit ; le cas ANONYME reste vert, et c'est juste — les deux valeurs coïncident) |
| `MessageProcessor` repose `senderId` | 1 (idem) |
| un écrivain nommant un `participantId` | le cliquet (« aucun site ne pose un `Participant.id` ») |
| un site d'appariement ajouté sans déclaration | le cliquet (« aucun site non déclaré ») |

Les témoins du cas anonyme étaient VERTS dès l'écriture, et c'est voulu : au
rang où l'ancien code et le nouveau rendent la même valeur, aucun témoin ne peut
tomber — la forme de la leçon 261 appliquée à un témoin, pas à une énumération.

### Ce qui RESTE, et qui le dit

- **`ready-notifier.ts:106`** émet `attachment:ready` vers
  `ROOMS.user(attachment.uploadedBy)` : pour une ligne HÉRITÉE d'un inscrit, une
  room que personne n'a jamais rejointe. Réparé pour les lignes neuves par
  l'unification ; les héritées dépendent de #20114.
- Les **lots 2, 3 et 4** de #20113 (web, iOS, Android) restent ouverts : les
  trois clients appliquent toujours trois règles différentes pour « supprimer
  cette pièce » — le web compare `uploadedBy`, iOS et Android lisent un verdict
  de MESSAGE. L'unification rend celle du web correcte au lieu de fausse ; elle
  ne les met pas d'accord (dimension 6).
