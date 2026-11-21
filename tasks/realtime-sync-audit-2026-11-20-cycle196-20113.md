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

## L'audit adversarial a rendu le lot BLOQUANT, et il avait raison

Lancé avant fusion parce que le lot touche un prédicat de contrôle d'accès
(directive porteur 2026-10-03). Verdict : **bloquant sur un constat**, et six
autres à solder. Ce qu'il a cassé est l'hypothèse CENTRALE du lot — « unifier
sur l'identité de compte ne peut qu'améliorer, puisque tous les lecteurs lisent
déjà `uploadedBy` comme un `User.id` ». Vrai pour les lecteurs qui refusaient à
tort. **Faux pour un lecteur dont le métier est de refuser**, et pour qui
apparier PLUS de lignes est une perte.

### F1 — une photo reçue en privé devenait l'avatar PUBLIC de qui la transfère

`identityImageOwnership.ts` (#16811) apparie « une ligne `MessageAttachment` de
type image, **TÉLÉVERSÉE par l'appelant**, qui porte ce fichier ». Le mot
« téléversée » n'était tenu par **aucune colonne** : il l'était par ACCIDENT,
parce qu'une copie transférée portait un `Participant.id` et que la garde
compare un `User.id`. Mon unification faisait disparaître l'accident — et la
garde avec.

`copiedAttachmentFields` reprend `filePath`, `fileUrl` et `mimeType` à
l'identique (« le MÊME blob »), `/attachments/file/*` sert par chemin **sans
authentification**, et `unlinkIfUnreferenced` compte les lignes qui citent un
`filePath` mais **jamais les avatars** : la photo y restait après que son auteur
a supprimé son message, puis son compte.

Fermé dans ce lot, et **mieux qu'avant** : la garde refuse désormais toute ligne
portant une marque de transfert (`unsetOrNull('forwardedFromAttachmentId')`,
parce que la colonne d'un téléversement est ABSENTE, pas nulle). « Téléversée »
est tenu par une colonne, plus par une coïncidence d'espaces de clés. La copie
d'une DIFFUSION n'en porte aucune, et c'est juste : `copyAttachments` exige que
le demandeur soit l'expéditeur de la source, donc elle ne recopie que ses
propres octets.

> **Aucun témoin ne pouvait tomber**, et c'est la vraie leçon : le témoin
> existant double Prisma par `where.uploadedBy === USER_ID && …`. Un double
> AUTO-RÉALISATEUR valide un changement d'espace de clés au lieu de le voir. Le
> nouveau témoin APPLIQUE le `where` ligne par ligne (`matchesMongoWhere`, à qui
> ce lot ajoute `startsWith`).

### F5 — le court-circuit « je l'ai déposée » survivait au bannissement

`VoiceProfileService.verifyAttachmentAccess` et
`AttachmentTranslateService.verifyUserAccess` — jumeaux ligne pour ligne —
répondaient `true` sur `uploadedBy === userId` **avant** de consulter
l'appartenance. Le trou préexistait pour les téléversements ; mon unification
l'étendait aux copies, donc à toute pièce transférée par qui a ensuite quitté la
conversation ou s'y est fait bannir.

Fermé par `attachmentUseAdmission.callerMayUseAttachment`, site unique qui
INVERSE l'ordre des deux questions — le porteur d'abord, le déposant ensuite —
comme le font déjà `attachmentReadVerdict` et `routes/attachments/metadata.ts`.
Et un porteur **non chargé** refuse : `messageId` posé sans `conversationId` est
une projection incomplète, pas une pièce libre ; répondre `true` y ferait d'un
`select` oublié une porte ouverte.

### F2, F3, F4 — le cliquet ne mesurait pas ce qu'il annonçait

Trois trous du discriminant, tous mesurés :
- un **filtre** Prisma (`{ in: … }`, `{ equals: … }`) était écarté comme un
  schéma JSON, sur la seule présence de l'accolade — c'est-à-dire **toute la
  catégorie que le balayage revendique** ;
- une affectation coupée après les deux-points (ce que produit Prettier)
  n'était pas vue du tout ;
- deux usages sur une même ligne n'en comptaient qu'un.

Le balayage lit désormais le fichier EN ENTIER, capture la valeur jusqu'à sa
virgule de même profondeur, et distingue schéma et filtre par les CLÉS de
l'objet. Il porte ses propres **pièges** en témoins.

Et le témoin « aucun site ne pose un `Participant.id` » a été **retiré** : il
était vide par construction (les deux écrivains posent une locale ou nomment
leur repli), donc il passait quelle que soit la valeur réellement posée. Un
cliquet qui rassure à tort est pire que pas de cliquet. Ce qui se mesure
vraiment le remplace : les deux écrivains PASSENT par le site unique.

### F6, F8, F9 — soldés

- **F6** : le `!= null` que j'avais introduit « sans changer le comportement »
  était bien un durcissement. Tracé : aucun appelant ne passe aujourd'hui une
  identité nulle. Mais la fonction est devenue PUBLIQUE sous un `tsconfig` à
  `strictNullChecks: false`, donc elle refuse l'appelant sans identité
  explicitement, avec son témoin.
- **F8** : `toHaveLength(5)` contredisait son commentaire (« solder un site est
  attendu ») — c'est un cliquet, donc `toBeLessThanOrEqual`.
- **F9** : le compte de succès « pièces envoyées » inclut désormais les copies.
  Assumé, et écrit au site : transférer la même photo N fois compte N.

### F10 — #20114 était surjouée sur la purge

`anonymizeMessagesOfDeletedAccount` (#5689) tourne **avant**
`purgeDeletedAccountMedia`, trouve les messages par `senderId in participantIds`
et supprime leurs pièces une par une — or une copie transférée a toujours un
`messageId`, et ce message est celui du compte supprimé. Le trou résiduel se
limite aux messages déjà `deletedAt` avant le passage de #5689. L'export RGPD,
lui, reste exact et sans recours. Corrigé sur l'issue.

### Ce que l'audit a cherché et NON trouvé
Destruction d'octets partagés, ré-attachement d'une pièce au message d'autrui,
enregistrements d'appel, lecture des octets et du détail, croisement
anonyme ↔ inscrit, rétrocompatibilité des trois clients (iOS **jette** la valeur
servie et la réécrit en `Participant.id` — la prémisse « tous ses lecteurs la
lisent comme un `User.id` » était donc fausse pour iOS, sans conséquence ici).
