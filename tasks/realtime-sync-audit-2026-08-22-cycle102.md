# Cycle 102 — `messageType` : une règle écrite QUATRE fois, et un client qui ne peut pas la dire

## D'où part ce cycle

Le cycle 101 a laissé en suivi nommé le flip du `MessageHandler` — le dernier
handler rendu au `Socket` nu — et a mesuré son blocage :

> Au-delà de `_buildMessagePayload: unknown`, le seul reste est `messageType`
> servi en `string` quand le contrat déclare l'union `MessageType`. Le caster
> BLANCHIRAIT ce que la garde existe pour voir ; l'honnête est de valider la
> colonne contre l'union AU PRODUCTEUR. C'est un lot à part, et il se mesure
> contre les trois clients.

Ce cycle-ci instruit ce suivi, et en ouvrant la colonne il a trouvé, avant la
question de typage, une **panne de produit** : la colonne ne dit pas ce qu'elle
prétend dire, sur trois de ses quatre chemins d'écriture.

## Le défaut

`Message.messageType` dit ce QU'EST un message — photo, vidéo, note vocale,
document, lieu, message système. Il était renseigné **depuis un champ de
requête que le client fournit**.

### 1. Un client ne peut pas le fournir

`SendMessageRequest` (`packages/MeeshySDK/Sources/MeeshySDK/Models/MessageModels.swift`)
n'a **aucun champ `messageType`**. Ni le SDK, ni `ShareSendBody` de l'extension
de partage (`apps/ios/MeeshyShareExtension/ShareSender.swift`).

Or le chemin REST est celui de **TOUT envoi iOS non éligible au socket-first** —
pièce jointe, DM chiffré, vue unique, éphémère — comme l'écrit déjà l'en-tête de
`socketio/messageNewPayload.ts`. Le client qui ne peut pas parler est donc
exactement celui qui porte les messages dont le type compte le plus.

**Toute photo, vidéo et note vocale envoyée depuis iOS se persistait `'text'`.**

### 2. La règle canonique existait, câblée à UN chemin sur quatre

`messageTypeFromMimeTypes` est écrite, documentée et testée depuis le lot qui
l'a créée pour le handler socket. Elle dit, mot pour mot : « Un MIME non
image/audio/video (document, inconnu, vide) tombe dans `'file'` — la catégorie
générique des pièces jointes, **jamais 'text'** », et « plusieurs catégories
mélangées → `'file'` ».

Les trois autres chemins ne l'appelaient pas :

| chemin | règle appliquée | photo iOS | `text/vcard` | lot hétérogène |
|---|---|---|---|---|
| socket `message:send-with-attachments` | **canonique** | `image` ✅ | `file` ✅ | `file` ✅ |
| REST, liaison par `attachmentIds` | **aucune** | **`text`** ❌ | `text` ❌ | `text` ❌ |
| copie de TRANSFERT (`copyForwardedAttachments`) | **manuscrite** | `image` ✅ | **`text`** ❌ | **`image`** ❌ |
| copie de DIFFUSION (`copyAttachments.ts`) | **aucune** | **`text`** ❌ | `text` ❌ | `text` ❌ |

L'exemplaire manuscrit divergeait sur deux points **mesurés** :

```ts
const firstMime = createdAttachments[0].mimeType;   // ← la PREMIÈRE, jamais les autres
let detectedType = 'text';
if (firstMime.startsWith('image/')) detectedType = 'image';
else if (firstMime.startsWith('audio/')) detectedType = 'audio';
else if (firstMime.startsWith('video/')) detectedType = 'video';
else if (firstMime.startsWith('application/')) detectedType = 'file';  // ← et RIEN d'autre
if (detectedType !== 'text') { /* update */ }
```

Une carte de visite `text/vcard`, un `.txt`, un MIME vide n'y franchissaient
aucune branche et restaient `'text'`.

### 3. Les deux exemplaires avaient chacun leur témoin, et les deux se contredisaient

C'est la forme la plus nette que ce défaut ait prise, et elle était **verte des
deux côtés** :

| fichier | témoin | réponse pour `text/plain` |
|---|---|---|
| `socketio/utils/__tests__/attachment-message-type.test.ts` | « treats an unknown or empty MIME as a generic file, **never text** » | `'file'` |
| `__tests__/unit/services/messaging/MessageProcessor.test.ts` | « **does not update** message type for text/plain forward » | `'text'` |

Deux témoins, deux fichiers, la même question, des réponses **opposées**, aucun
des deux ne sachant que l'autre existe. Le second n'attestait pas une règle : il
**gelait le trou** de l'exemplaire qu'il gardait.

### Ce que ça coûtait, en aval

`messageNotificationFanOut` passe `message.messageType` à `protectedPreview`,
qui en dérive l'icône via `contentTypeIcon` :

```
photo vue-unique envoyée depuis iOS
  → messageType persisté 'text'
  → contentTypeIcon('text') = 💬
  → notification « 👁️ 💬 » au lieu de « 👁️ 🖼️ »
```

C'est le symptôme exact que le lot fondateur de `messageTypeFromMimeTypes`
avait corrigé **pour le seul chemin socket**, en l'écrivant dans son en-tête.
Le chemin REST — le principal pour iOS — le portait toujours.

Et la diffusion produisait une **incohérence entre deux copies de la même
photo** : la cible 1 (téléversement, `attachmentIds`) et les cibles 2..N
(`copyAttachmentsFromMessageId`) recevaient deux types différents pour le même
partage, visible sur TOUS les clients, web compris.

Enfin, côté iOS, `ConversationViewModel` calcule bien un `optimisticMessageType`
pour sa bulle et pour l'aperçu de liste (`optimisticListPreview` → « 📷 Photo »,
« 🎙️ Message vocal »)… et ne l'envoie jamais. L'aperçu optimiste était donc
juste sur l'appareil émetteur jusqu'à la réconciliation, et faux partout ailleurs.

## Le correctif

**Une seule dérivation, au seul point où les pièces jointes FINALES d'un message
sont connues** — `MessageProcessor.saveMessage`, juste après l'ÉTAPE 4 bis qui
relit déjà les pièces jointes pour les trois chemins (`hasAttachmentLinks`
couvre `attachmentIds`, `forwardedFromId` et `copyAttachmentsFromMessageId`).

```ts
const derivedMessageType = deriveMessageTypeForAttachments({
  persistedMessageType: message.messageType,
  mimeTypes: refreshedAttachments.map((att) => att.mimeType),
});
if (derivedMessageType) {
  await this.prisma.message.update({ where: { id: message.id }, data: { messageType: derivedMessageType } });
  (message as Message & { messageType: string }).messageType = derivedMessageType;
}
```

Trois décisions portent ce lot :

1. **La reprise EN MÉMOIRE compte autant que l'écriture.** C'est l'objet
   `message` que lisent la notification (ÉTAPE 6) et `buildMessageNewPayload`.
   Sans elle, la colonne serait juste et le fil resterait faux. Mutation
   assumée, comme celle d'`attachments` dix lignes plus haut et pour la même
   raison — la ligne rendue par `create` a été prise avant que le message ne
   soit complet.

2. **Le lot est strictement ADDITIF.** `deriveMessageTypeForAttachments` ne
   parle que si la colonne porte encore son défaut `'text'`. `'location'` et
   `'system'` ne se lisent dans aucun MIME ; `'image'` posé par le handler
   socket vient déjà de cette règle-ci. Combler un défaut est réparateur,
   écraser une déclaration ne le serait pas. **Deux témoins d'additivité
   passaient AVANT comme APRÈS** — ce sont eux qui rendent la mesure vérifiable.

3. **La règle DÉMÉNAGE dans le domaine du message.** Elle vivait sous
   `socketio/utils/`, du temps où le seul chemin qui dérivait était un
   transport. Elle appartient à `services/messaging/` : c'est là que
   `MessageProcessor` l'applique pour les trois chemins, et le handler socket
   la partage. Ce n'est pas du rangement — c'est ce qui rend l'affirmation
   « source unique » structurellement vraie plutôt que simplement écrite.

L'exemplaire manuscrit de `copyForwardedAttachments` est **supprimé**, avec sa
raison écrite sur place.

## Pourquoi PAS un champ `messageType` côté iOS

C'était l'autre correctif possible, et il est moins bon. Le serveur est le seul
à connaître le jeu de pièces jointes FINAL — c'est lui qui les associe, les
copie et les relit ; le client ne peut que deviner avant l'aller-retour, et
l'extension de partage est un processus séparé qui ne voit même pas ce que
l'app a téléversé. Ajouter le champ aurait produit un **cinquième** exemplaire
de la règle, dans le langage d'un client de plus, à tenir aligné avec les
autres. Le web en porte déjà un (voir les suivis).

## Le ROUGE, mesuré

Les sept témoins ont été écrits d'abord et joués contre la production d'avant :

```
Tests: 5 failed, 2 passed
```

Et les deux qui passaient sont **exactement** les deux témoins d'additivité.
Le témoin « lot hétérogène » recevait `"image"` — la preuve directe que la
règle manuscrite ne lisait que `createdAttachments[0]`.

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- `attachmentMessageType.test.ts` + `MessageProcessor.test.ts` : **112/112**
- `src/socketio` + `src/services/messaging` + suites messagerie/handlers :
  **74 suites / 2369 tests verts**
- suite complète passerelle : verte

Quatre témoins de transfert préexistants ont dû être rendus **fidèles** : ils
mockaient la relecture de l'ÉTAPE 4 bis à `[]`
(`.mockResolvedValueOnce([att]).mockResolvedValue([])`), ce que la production ne
fait jamais — elle relit les lignes qu'elle vient de créer. Le mock est passé à
`.mockResolvedValue([att])`. Ce n'est pas une concession au correctif : c'est un
double qui mentait sur son collaborateur.

## Suivis nommés

- [ ] **Le web porte le cinquième exemplaire de la règle.**
      `determineMessageTypeFromMime(attachmentMimeTypes[0])`
      (`apps/web/services/socketio/messaging.service.ts`, deux sites) ne lit que
      la PREMIÈRE pièce jointe : un lot hétérogène y part en `'image'` là où la
      canonique dit `'file'`. La dérivation serveur ne le corrige PAS — la valeur
      est explicite, donc respectée par construction (décision 2). Le retrait du
      champ côté web est un changement de contrat client, à instruire contre les
      trois clients, pas à glisser dans ce lot.
- [ ] **Un message de LIEU sans pièce jointe reste `'text'` quand le client se
      tait** — et iOS se tait toujours. `ConversationMessageStatsService` compte
      les lieux par `messageType === 'location'` : ils sont donc sous-comptés
      pour toute la population iOS. Le serveur SAIT (`data.location` est validé
      et écrit dans `metadata.location`) ; la dérivation correspondante est
      symétrique de celle-ci, mais elle change le TYPE rendu aux clients pour
      une famille de messages entière — lot à part, à mesurer contre les trois.
- [ ] **Le flip du `MessageHandler` reste ouvert**, et son blocage est
      inchangé : `_buildMessagePayload` rend `unknown`, et `messageType` est
      servi en `string` quand le contrat déclare l'union `MessageType`. Ce
      cycle-ci a réparé ce que la colonne CONTIENT ; il n'a pas encore contraint
      ce qu'elle DÉCLARE. Les deux se suivent, dans cet ordre — valider une
      union sur une colonne qui ment n'aurait rien prouvé.
- [ ] Suivi hérité — `broadcastMessageMutation` prend
      `payload: Record<string, unknown>` : le 3e producteur de `message:edited`
      sert le contrat par ACCIDENT (`include` large), pas par construction.
- [ ] Suivi hérité — `senderId` : le chemin REST sert le `Participant.id` brut
      là où les deux autres servent le `User.id`. À instruire côté web.
