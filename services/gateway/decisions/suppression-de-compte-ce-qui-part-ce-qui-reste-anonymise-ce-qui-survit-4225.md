## Suppression de compte — ce qui part, ce qui reste anonymisé, ce qui survit (#4225)

**Décision du 2026-08-30.** #4225 exigeait ces quatre arbitrages **avant toute
ligne de code** ; les voici, avec leur raison. Ils gouvernent le job de purge à
écrire, et rien d'autre ne le gouverne.

### 0. Le périmètre réel n'est pas celui que l'issue énumérait

L'issue nommait seize entités. Mesuré sur `packages/shared/prisma/schema.prisma` :
**quarante-quatre modèles portent une référence à un compte** (`userId`,
`authorId`, `senderId`, `creatorId`, `ownerId`, `closedBy`, `deletedBy`). C'est
la leçon 261 du dépôt appliquée à une liste de tables — *une énumération porte
deux affirmations, « ces sites appliquent la règle » et « ce sont les sites où
elle s'applique », et la seconde n'est presque jamais vérifiée.* Toute purge
écrite contre la liste de seize aurait laissé vingt-huit tables intactes, dont
`PushToken`, `MagicLinkToken` et `DMASession`.

**Corollaire de méthode** : la purge se dérive du SCHÉMA, pas d'une liste
recopiée. Un modèle ajouté demain avec un `userId` doit faire rougir un cliquet
tant que son verdict n'est pas déclaré — sans quoi la première table oubliée
sera silencieuse, exactement comme les vingt-huit d'aujourd'hui.

### 1. La durée de rétention : **30 jours**, en configuration

`ACCOUNT_DELETION_RETENTION_DAYS`, défaut `30`, lue par le job de purge et
**citée par le texte servi** — la page de `/delete-now` cesse de parler d'une
« durée de rétention légale » que rien ne définit et annonce le nombre réel.

Trente jours, et pas sept ni quatre-vingt-dix : c'est la fenêtre pendant
laquelle une suppression accidentelle ou sous le coup de la colère se rétracte
encore, et c'est la durée que la population compare (WhatsApp, Signal). Plus
court trahit ceux qui reviennent ; plus long trahit la promesse faite à ceux qui
partent.

### 2. Trois verdicts, et un principe qui les décide

> **Ce qui identifie la personne part. Ce qu'elle a contribué à l'espace
> d'autrui reste, sans son nom. Ce qui prouve qu'on a bien effacé survit.**

| verdict | ce qu'il recouvre |
|---|---|
| **EFFACER** | les données dont la personne est le seul sujet et le seul bénéficiaire |
| **ANONYMISER** | ses contributions à un fil, une communauté ou un espace partagé — le contenu demeure, l'auteur devient une pierre tombale |
| **CONSERVER** | ce dont l'effacement détruirait la preuve de l'effacement lui-même, ou une obligation d'audit |

**EFFACER** (31 tables) — `UserContact`, `NotificationPreference`,
`Notification`, `UserStats`, `UserPreferences`, `UserPreference`,
`ConversationPreference`, `UserConversationPreferences`,
`UserConversationCategory`, `UserCommunityPreferences`, `PasswordResetToken`,
`PhonePasswordResetToken`, `MagicLinkToken`, `PasswordHistory`, `UserSession`,
`SignalPreKeyBundle`, `ConversationPublicKey`, `ServerEncryptionKey`,
`DMASession`, `UserVoiceModel`, `UserMessageDeletion`, `PushToken`, `PostView`,
`PostImpression`, `PostEngagement`, `PostBookmark`, `PostMediaDownload`,
`AgentGlobalProfile`, `AgentUserRole`, `UserEventSeq`, `MutationLog`,
`FriendRequest`, et les **publications propres** : `Post` avec ses réactions et
commentaires en cascade.

Une préférence, une session, une clé, un jeton, une statistique, une vue de
post : personne d'autre ne les lit, personne d'autre ne les perd.

**ANONYMISER** (6 tables) — `Message` (le `senderId` pointe la pierre tombale,
le contenu demeure), `Participant`, `CommentReaction`, `PostReaction`,
`PostComment` **sur le post d'autrui**, `CommunityMember`. Plus `User`
lui-même, qui devient une **pierre tombale** : la ligne survit avec son `id` et
rien d'autre — pseudonyme neutralisé, e-mail, téléphone, noms, avatar, bio,
langues, biométrie vocale effacés. Sans cette ligne, quarante-quatre clés
étrangères pointeraient dans le vide.

**CONSERVER** (3 tables) — `AdminAuditLog` (une action d'administration se
prouve, et sa preuve ne s'efface pas sur demande de son sujet), `SecurityEvent`
(même raison, avec sa propre durée), et `AccountDeletionRequest`, qui **est** le
journal de la purge : le critère 6 de l'issue l'exige, et il a raison — sans
lui, on ne peut plus démontrer qu'on a effacé.

### 3. La question centrale : le contenu dans les conversations d'autrui

**Il reste, anonymisé. Jamais effacé.**

C'était la question que l'issue désignait comme centrale, en avertissant qu'y
répondre par « on verra » revient à choisir « conserver ». Voici la réponse, et
sa raison : **une conversation appartient à ses participants, au pluriel.**
Effacer les messages d'un partant crible le fil de trous chez des tiers qui
n'ont rien demandé — un échange devenu incompréhensible est une donnée détruite
chez quelqu'un d'autre. Retirer l'identité, en revanche, retire exactement ce
que la personne a le droit de faire retirer.

La limite est assumée et doit être écrite : **un contenu peut être identifiant
par lui-même** (« je m'appelle X, mon numéro est Y »). L'anonymisation de
l'auteur ne l'atteint pas. C'est le prix de ne pas détruire le fil d'autrui, et
la voie de recours reste la suppression message par message, que le produit
offre déjà de son vivant.

### 4. Les médias hors base

**Le média suit le sort de son porteur**, et cette règle se dérive plutôt que
s'énumérer :

- média d'une entité EFFACÉE (avatar, bannière, échantillon vocal, média d'un
  `Post`) → **effacé du stockage objet**, avec ses vignettes, ses variantes
  d'image et ses pistes TTS ;
- média d'un message ANONYMISÉ → **conservé**, parce que l'effacer trouerait le
  fil d'autrui exactement comme effacerait le texte. Ses métadonnées
  identifiantes (nom de fichier d'origine) sont neutralisées.

**Une purge qui ne touche que MongoDB laisse les octets** — l'issue le dit, et
c'est le point où une purge se croit finie sans l'être. Le job énumère donc les
clés d'objet à partir des lignes qu'il efface, **avant** de les effacer : après,
l'adresse du fichier n'est plus dérivable de rien.

### Ce que ces décisions n'autorisent pas encore

Elles ouvrent l'implémentation, elles ne la remplacent pas. Le job reste tenu
par les critères 2 à 6 de l'issue : **idempotent et rejouable** (un échec
partiel se relance sans dommage), **aucune résurrection** après purge,
`dataPurged` qui ne passe à `true` qu'une fois la purge effective — le champ
existe précisément pour ne pas mentir pendant l'intervalle —, et un témoin par
entité vérifiant le verdict ci-dessus.
