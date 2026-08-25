# Cycle 125 — la protection masquait le TEXTE et laissait partir le FICHIER

> Audit de la couche notification-push du gateway, dans la continuité des cycles 121 → 124.
> Un seul lot, mesuré, avec sa mutation.

## Le défaut

`messageNotificationFanOut` compose l'aperçu d'une bannière de message. Le cycle 124 y a
refermé la dernière fuite de TEXTE connue : la transcription d'un vocal ne gagne plus sur le
placeholder que `protectedPreview` compose pour un message ÉPHÉMÈRE / à VUE UNIQUE / FLOUTÉ /
CHIFFRÉ.

Douze lignes plus bas, dans le même objet, sans aucune condition de protection :

```ts
firstAttachmentUrl: first?.fileUrl || undefined,
firstAttachmentMimeType: first?.mimeType || undefined,
```

`createNotification` les recopie dans `data.attachmentUrl` / `data.attachmentMimeType`
(sous la seule garde `showPreview`), et la NSE iOS — mesuré, `NotificationService.swift:171` —
télécharge cette URL puis l'attache en `UNNotificationAttachment` **sans jamais regarder
`notificationLocKey`**, la clé qui dit précisément « ce message est protégé ».

> **Une photo à VUE UNIQUE s'affichait donc ENTIÈRE sur l'écran verrouillé, en grand,
> sous une bannière disant « 👁️ 🖼️ ».**

La même charge transportait le NOM du fichier (`metadata.attachments.firstFilename`,
`firstAttachmentFilename`), sa taille et ses dimensions — et le nom, lui, est PERSISTÉ dans la
ligne `Notification`, donc relu longtemps après que la bannière a disparu.

### Pourquoi les gardes existantes ne l'attrapaient pas

Elles gardent toutes une CHAÎNE. `previewPrismSource` retient une traduction,
`prePersistedMessageFields` retient un corps, `protectedPreview` compose un placeholder. Trois
gardes justes, testées, posées au bon endroit — et **aucune ne parle du fichier**, qui n'a
jamais eu besoin d'un texte pour partir.

C'est la forme du cycle 124 portée d'un cran :

| | cycle 124 | cycle 125 |
|---|---|---|
| la garde masque | le corps | le corps |
| l'hôte sert quand même | **le texte transcrit** | **le média lui-même** |
| ce qu'il fallait remarquer | « le texte qu'elle gouverne est-il celui qui part ? » | « **qu'est-ce qui part À CÔTÉ ?** » |

### Le second niveau, que personne ne lisait

`MessageAttachment` porte SES PROPRES drapeaux de masquage — `isViewOnce`, `isBlurred`,
`effectFlags` — indépendants de ceux du message qui la porte. Le `select` de l'éventail n'en
lisait **aucun** : la protection d'un média n'était donc consultée à aucun des deux niveaux qui
la déclarent.

Mesure d'atteignabilité, honnête : à ce jour aucun chemin de création n'ÉCRIT ces deux drapeaux
sur une pièce jointe (`UploadProcessor`, `tus-handler`, `copyAttachments`, `MessageProcessor`
n'y posent que `isEncrypted`). Le niveau attachment est donc **armé, pas encore atteignable** —
mais il est déclaré par le modèle, lu par l'API (`AttachmentService`), et le coût de le
respecter est de trois champs dans un `select`.

## Le correctif

Trois sites, une règle.

1. **`maskedAttachment()`** — la JUMELLE de `protectedPreview`, posée juste à côté d'elle dans
   `NotificationService.ts`. `protectedPreview` dit ce que le CORPS a le droit de montrer ;
   celle-ci dit ce que la pièce jointe a le droit de laisser voyager. Adjacentes par
   construction : c'est la leçon 271 (« un helper à un appelant est un inventaire ») appliquée
   d'avance — deux jumelles séparées divergent.

   Elle ne lit PAS `isEncrypted` : le chiffrement d'une pièce jointe est un mode de TRANSPORT
   que le chemin de téléchargement dénoue, pas un masque d'affichage. Le message chiffré, lui,
   reste retenu — par la quatrième branche de `protectedPreview`.

2. **L'éventail** — `mediaMayTravel = protectedOverride === null && !maskedAttachment(first)`
   gouverne `attachmentInfo` EN BLOC (fichier + étiquettes) **et** `firstAttachmentTranscript`,
   qui posait déjà la même question un niveau plus bas. Un seul prédicat pour les deux : sans
   quoi le texte repartirait par la porte que le fichier vient de fermer.

   Retenu en bloc, et non le seul `fileUrl`, pour deux raisons mesurées : le nom de fichier est
   persisté (donc relu), et le placeholder porte déjà l'icône de type (`contentTypeIcon`) — le
   corps ne perd rien à ce silence.

3. **`createNotification`** — SECOND VERROU : un `notificationLocKey` non vide vide
   `attachmentUrl` / `attachmentMimeType` / `attachmentDurationMs`. Même arbitrage que
   `previewPrismSource` et `prePersistedMessageFields`, et il n'est pas redondant :
   `protectedPreview` est l'unique producteur de cette clé dans tout le dépôt (vérifié), donc
   sa présence est une déclaration de protection qu'aucun appelant ne pose par accident. Un
   appelant qui masque le corps sans retirer son média perd ici le rich-push, jamais le secret.

### Pas de changement iOS, et c'est délibéré

La NSE pourrait refuser d'attacher un média quand `notificationLocKey` est présent. Elle n'a
pas été touchée :

- la fuite est fermée **à la source**, et la source est le seul endroit qui CONNAÎT l'état de
  protection du message — le client ne fait que rendre ce qu'on lui envoie ;
- pour le seul cas où la NSE révèle légitimement un contenu protégé (E2EE déchiffré
  localement), la passerelle ne pousse plus d'URL du tout : la garde cliente serait inerte ;
- une édition Swift non compilable ici achèterait un risque de build (cf. leçon 274,
  corollaire de harnais) contre zéro comportement observable.

## Gates

| gate | résultat |
|---|---|
| `protectedMediaLeaks.test.ts` (nouveau) | **15 témoins** — 13 rouges avant, 15 verts après |
| suites voisines (`notifications/` + éventail + `voiceNoteBannerPrism`) | 24 suites, 366 témoins |
| suite gateway complète | **854/854 suites, 19476 témoins** |
| `services/gateway` `tsc --noEmit` | 0 erreur |
| mutation « `mediaMayTravel` retiré de l'éventail » | **17 témoins tombent** (dont les 14 du cycle 124) |
| mutation « second verrou retiré de `createNotification` » | **1 témoin tombe** |
| Swift | non modifié |

La première mutation est la mesure qui compte : `mediaMayTravel` a REPRIS
`firstAttachmentTranscript`, la garde du cycle 124, dont les témoins tombent donc depuis son
NOUVEAU site.

## Suivi MESURÉ

- **Les éventails RÉPONSE et MENTION ne composent aucun aperçu de média.** Ils reçoivent
  `notificationPreview` (jamais `…ForPush`) et aucun `attachmentInfo`, donc leur corps est
  `Message.content` — VIDE pour un vocal ou une photo sans légende. Répondre à quelqu'un par un
  vocal lui pousse une bannière au corps vide pendant que les autres membres reçoivent la
  transcription. Reporté du cycle 124, toujours ouvert : le corriger change ce que ces bannières
  MONTRENT, pas la langue dans laquelle elles le montrent.
- `isEncrypted` reste lue par la NSE et jamais émise (cycle 124) — piège armé, pas panne.
- Les éventails réponse et mention ne poussent ni `createdAt` ni `messageType` : leur bulle
  reste ordonnée par l'horloge du device.
- La bannière d'un vocal joint toujours le fichier ORIGINAL, jamais la piste traduite du Prisme
  (hérité du cycle 123).
- Aucun chemin de création n'écrit `isViewOnce` / `isBlurred` sur une `MessageAttachment` —
  le second niveau de `maskedAttachment` est armé, pas encore atteignable.
# Cycle 125 — la bulle que la NSE pré-enregistre : sur QUELLE ligne, et avec quels champs

Le suivi MESURÉ du cycle 124 donnait une ADRESSE (« les éventails RÉPONSE et
MENTION ne portent aucune transcription ») et une décision produit assumée. La
leçon 273 dit quoi en faire :

> Un suivi hérité ne vaut pas seulement par ce qu'il affirme. Il vaut par
> l'ADRESSE qu'il donne.

L'adresse a été ouverte. Ce qu'elle porte n'est pas ce que le suivi annonçait :
c'est l'AUTRE lecteur du même fil push — celui que le cycle 124 venait de
recâbler — et il écrivait dans la base locale des lignes qui ne lui
appartenaient pas.

## 1. Défaut A — une notification de RÉACTION écrasait le message réagi

`prePersistMessage` (`apps/ios/MeeshyNotificationExtension/NotificationService.swift`)
écrit une ligne `MessageRecord` dès l'arrivée d'un push, pour que la bulle
existe avant même que l'application démarre. Son unique garde était :

```swift
guard let messageId = userInfo["messageId"] as? String,
      let conversationId = userInfo["conversationId"] as? String,
      let senderId = userInfo["senderId"] as? String,
      let pool = Self.sharedPool
else { return }
…
try pool.write { db in try record.save(db) }
```

**Aucun gate de TYPE.** Or quatre familles de push portent un `messageId` —
mesuré sur les quatre SEULS sites de la passerelle qui posent
`context.messageId` (`NotificationService.ts:1856, 1995, 2184, 3625`) :

| type | ce que `messageId` désigne | `senderId` du fil |
|---|---|---|
| `new_message` | le message qui arrive | son auteur |
| `message_reply` | la réponse qui arrive | son auteur |
| `user_mentioned` | le message qui mentionne | son auteur (ou l'ÉDITEUR) |
| **`message_reaction`** | **le message RÉAGI** | **le RÉACTEUR** |

La quatrième ligne n'est pas une nuance. Une notification de réaction part vers
l'**AUTEUR** du message : le `messageId` désigne donc, dans la quasi-totalité
des cas, une ligne que le destinataire détient DÉJÀ — celle qu'il a écrite.
`localId` étant la clé primaire de la table `messages`
(`MessageDatabaseMigrations.swift:17`) et `save()` un UPSERT, chaque réaction
reçue hors application réécrivait **toutes les colonnes** de ce message :

| colonne | après une réaction reçue |
|---|---|
| `content` | `""` — le texte écrit par l'utilisateur, **effacé** |
| `senderId` | l'id du RÉACTEUR — son propre message devient un message entrant |
| `createdAt` | l'instant du push — le message remonte au bas de la conversation |
| `originalLanguage` | `"en"` |
| `attachmentsJson`, `reactionsJson`, `replyToJson`, `mentionedUsersJson` | `nil` |
| `isEdited`, `pinnedAt`, `expiresAt`, `effectFlags`, `viewOnceCount` | remis à zéro |

**La distinction manquante était déjà ÉCRITE dans le fichier**, trente lignes
plus bas, sur le frère immédiat de cette méthode :

```swift
/// Push types that mean "a new message was delivered to this recipient".
/// Reactions and social events also carry a messageId, but they do not
/// constitute message delivery, so they are excluded.
private static let deliveryReceiptTypes: Set<String> = [ … ]
```

`postDeliveryReceipt` porte ce gate. `prePersistMessage`, appelé à la ligne
PRÉCÉDENTE, ne l'a jamais eu — et c'est la plus destructrice des deux
opérations : l'une envoie un accusé, l'autre écrit en base.

> **Un invariant écrit chez le voisin conforme ne garde que le voisin.** Même
> famille que le cycle 97 (le répondeur X3DH énonçait l'invariant que
> l'initiateur violait) et que la note de `storyAuthorSelect` (cycle 83).
> Ici les deux appels sont CONSÉCUTIFS, ce qui rend la lecture pire : le gate
> est visible à l'écran quand on lit le site fautif.

## 2. Défaut B — un placeholder n'a jamais à remplacer une ligne canonique

Refermer le gate de type ne suffit pas, et ne pas s'en contenter est le
corollaire du cycle 124 (« une garde qui n'a qu'un verrou n'a pas de garde ;
elle a un pari sur ce verrou »).

`user_mentioned` est légitimement dans la famille « un message arrive » — sauf
sur le chemin d'ÉDITION. `notifyNewlyMentioned` (`messageMentions.ts:403`) crée
une notification de mention pour un message **EXISTANT** qu'on vient d'éditer,
avec l'ÉDITEUR pour acteur. Un destinataire nouvellement nommé est un membre de
la conversation : rien ne dit qu'il n'a pas déjà la ligne.

Le verrou juste ne parle donc pas du type mais de la NATURE de l'écriture :
une bulle pré-enregistrée est un **PLACEHOLDER** pour la fenêtre qui précède la
synchro REST. L'écriture est un `INSERT`, jamais un `UPSERT` :

```swift
try pool.write { db in
    guard try MessageRecord.fetchOne(db, key: plan.messageId) == nil else { return }
    try record.insert(db)
}
```

Le chemin canonique n'en souffre pas : `NSEPendingMessageConsumer` verse la
réponse REST par `upsertFromAPIMessages`, un mécanisme indépendant qui écrase
toujours.

## 3. Défaut C — GW5 émettait deux champs « de persistance NSE » que la NSE ne lisait pas

La passerelle pose depuis GW5, en les nommant :

```ts
// GW5 — champs de persistance NSE (timestamp serveur + type + Prisme).
...(params.context.messageCreatedAt ? { createdAt: params.context.messageCreatedAt } : {}),
...(params.context.messageType ? { messageType: params.context.messageType } : {}),
```

Mesuré : **`grep` de `"createdAt"` et `"messageType"` sur tout
`apps/ios/MeeshyNotificationExtension/` rend ZÉRO occurrence.** Ni l'un ni
l'autre n'était lu. `prePersistMessage` posait `createdAt: Date()` et déduisait
le type du seul MIME de la pièce jointe.

Conséquences, l'une et l'autre mesurables :

- **l'horodatage** est celui de la REMISE, pas de l'ENVOI. Un push remis en
  retard — appareil rallumé, arriéré APNs, collapse — plaçait la bulle au bas
  de la conversation, et plusieurs bulles pré-enregistrées se rangeaient dans
  l'ordre de REMISE ;
- **le type** retombait sur `text` pour tout ce qui n'a pas de fichier
  (`location`) et pour tout push où la pièce jointe ne voyage pas —
  `attachmentMimeType` est retiré sous `showPreview: false` (GW7).

C'est la forme du cycle 122 dans l'autre sens : là, un contenu était RÉSOLU sans
être servi ; ici, deux champs sont TRANSPORTÉS, nommés pour leur lecteur, et
jamais lus. **La question « qui AFFICHE ce que le serveur résout ? » a une
jumelle : « qui LIT ce que le serveur envoie POUR lui ? ».**

## 4. Défaut D — une clé qu'aucun producteur n'émet, à cent lignes de la bonne

```swift
senderName: userInfo["senderName"] as? String,
senderUsername: nil, senderColor: nil, senderAvatarURL: nil,
```

`senderName` n'est émis par **aucun** producteur du dépôt (vérifié : les seules
occurrences côté passerelle sont `ConversationBridgeService` et `EmailService`,
sans rapport avec le fil push). La bulle pré-enregistrée était donc ANONYME —
et `senderUsername` / `senderAvatarURL` étaient câblés à `nil` alors que le fil
porte `senderUsername` et `senderAvatar`.

Les bons noms sont lus **dans le même fichier, cent lignes plus bas** :

```swift
let senderName = (userInfo["senderDisplayName"] as? String)…
    ?? (userInfo["senderUsername"] as? String)…
```

Exactement le défaut C du cycle 124 (`content` / `originalLanguage`, deux clés
que le fil ne portait pas), avec l'inversion : là le fil ne portait pas la clé,
ici il la porte sous un autre nom. **Une clé de payload est un CONTRAT à deux
bouts ; le lire de mémoire produit les deux erreurs symétriques.**

## 5. La forme du correctif : la décision est PURE, l'écriture ne garde que la base

Tout ce qui se décide sans la base part dans
`NotificationPayloadHelpers.prePersistedMessagePlan(userInfo:now:)` — Foundation
seul, donc compilé DANS `MeeshyTests` (`project.yml` le liste déjà), donc
gardé par des témoins. `now` est passée en paramètre : la seule impureté de la
décision devient une entrée.

Le site d'écriture ne garde plus que le verrou qui ne peut PAS se décider hors
de la base : « cette ligne existe-t-elle déjà ? ».

Deux points de forme, tirés du payload lui-même :

- **le payload push est un `Record<string, string>`** : une clé « absente » y
  voyage sous la forme d'une chaîne VIDE (les `|| ''` de `createNotification`).
  Lire `as? String ?? "en"` prend donc `''` pour une valeur — la colonne
  `originalLanguage` est NOT NULL, et une chaîne vide y est une langue que le
  Prisme ne sait pas classer. `nonEmptyString` fait la distinction UNE fois ;
- **le type déclaré prime, mais seulement s'il est rendable.** Un
  `messageType` d'un vocabulaire voisin retombe sur la déduction par MIME
  plutôt que de produire une bulle que rien ne sait afficher.

## 6. Les témoins

| fichier | témoins | ce qu'ils gardent |
|---|---|---|
| `MeeshyTests/Unit/Services/NotificationPayloadHelpersTests.swift` (`NSEPrePersistedMessagePlanTests`) | 14 | la décision d'écriture : type, identités, E2EE, `createdAt`, `messageType`, noms d'expéditeur, langue |
| `services/gateway/.../nsePrePersistedMessage.test.ts` (+3) | 3 | le contrat CROISÉ : les noms de clé que la NSE lit, et la prémisse du gate de type |

Trois points de méthode :

1. **Les verts ne sont pas du remplissage.**
   `test_messageArrivalTypes_writeTheBubble` garde le mode d'échec du
   CORRECTIF : refermer le gate ne doit pas supprimer la bulle des trois
   familles qui annoncent bien un message qui arrive.
2. **Le témoin de piège armé est ASSUMÉ comme tel.**
   « n'a jamais porté `senderName` » ne peut pas tomber aujourd'hui — c'est sa
   raison d'être (règle du cycle 84) : il tombera le jour où quelqu'un ajoutera
   la clé au fil, et l'obligera à constater que la NSE ne la lit plus.
3. **Le ROUGE des témoins de passerelle est PROUVÉ par la mutation qu'ils
   nomment.** `createdAt` retiré du payload et `senderDisplayName` renommé en
   `senderName` : **2 témoins tombent sur 10**, dont le piège armé, qui fire
   exactement sur la mutation pour laquelle il a été posé. Production restaurée
   à l'identique (`git diff` vide) et 10/10 verts après.

## 7. Ce que ce cycle ne prouve PAS, et il faut le dire

**Le correctif iOS n'a pas été compilé.** Cet environnement n'a pas de chaîne
Swift (`swift: command not found`) — le gate est la CI « iOS Tests ». Les
quatre défauts ont été mesurés par lecture croisée du producteur (passerelle,
exécutée) et du consommateur (Swift, lu), jamais par exécution du second.

## 8. Suivi — MESURÉ, pas hérité

**Les éventails RÉPONSE et MENTION n'émettent aucun couple
`content` / `originalLanguage`.** `createMessageNotification` le pose (cycle
124) ; `createReplyNotification` et `createMentionNotification` ne le posent
pas. Leur bulle pré-enregistrée existe donc — bien horodatée et bien nommée
depuis ce lot — mais SANS CORPS jusqu'à la synchro REST.

Non absorbé ici, et pour une raison précise plutôt que par prudence : sur le
chemin d'ÉDITION, `notifyNewlyMentioned` produit une mention pour un message
ANCIEN dont la passerelle n'émet pas le `createdAt` (le contexte de
`createMentionNotification` ne porte pas `messageCreatedAt`). Lui donner un
corps sans lui donner son horodatage poserait une bulle datée de la REMISE —
le défaut C, réintroduit par la porte que ce lot vient de fermer. Les deux
champs se posent ensemble ou pas du tout.

Vérifié en ouvrant les deux créateurs, pas déduit de la forme du lot.

## 9. Gates

| gate | résultat |
|---|---|
| `services/gateway` — `tsc --noEmit` | **0 erreur** (code de retour lu après redirection, jamais à travers un pipe) |
| `services/gateway` — suites `notifications` + `messaging` | 56 suites / 1 157 témoins verts |
| `services/gateway` — suite COMPLÈTE | **850 suites / 19 431 témoins verts** (code de retour 0) |
| iOS — compilation & témoins | **non exécutés ici** (pas de chaîne Swift) — CI « iOS Tests » |
