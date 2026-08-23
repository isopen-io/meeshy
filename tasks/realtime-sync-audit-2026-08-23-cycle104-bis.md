# Cycle 104 bis — `messageType` : la moitié CLIENT que le serveur ne peut pas corriger

**Date** : 2026-08-23
**Branche** : `claude/keen-hamilton-edf771`
**Prédécesseur** : cycle 103 (PR #3363) — `message:edited`, le transport que le
contrat ne gouvernait pas

---

## Le point de départ

Le cycle 102 avait laissé un suivi, reconduit tel quel par le cycle 103 :

> **Le web porte le CINQUIÈME exemplaire de la règle**
> (`determineMessageTypeFromMime(mimeTypes[0])`, deux sites) : un lot
> hétérogène y part en `'image'` là où la canonique dit `'file'`. La
> dérivation serveur ne le corrige pas — la valeur est explicite, donc
> respectée par construction. Retrait = changement de contrat client.

La note « retrait = changement de contrat client » est ce qui l'avait tenu
ouvert deux cycles. Elle décrit bien le geste qu'il ne faut PAS faire — retirer
le champ du fil — mais elle a masqué celui qu'il fallait faire, et qui est
purement additif : **faire écrire au client la MÊME règle, pas une autre.**

---

## Ce qui rend cette duplication différente des quatre autres

Les cycles 102 et 103 ont traité des règles écrites plusieurs fois **du même
côté du fil** : les copies s'y rattrapaient l'une l'autre, et la dernière
écriture gagnait. Ici, non. La dérivation serveur est **délibérément ADDITIVE** :

```ts
// services/gateway/src/services/messaging/attachmentMessageType.ts
if ((input.persistedMessageType ?? 'text') !== 'text') return undefined;
```

Elle ne parle QUE lorsque la colonne porte encore son défaut. C'est la bonne
règle, et son en-tête l'argumente : `'location'` et `'system'` ne se lisent dans
aucun MIME, donc écraser une déclaration client serait destructeur.

**Corollaire jamais énoncé : ce que le client DÉCLARE, personne ne le corrige.**
Un exemplaire client de la règle n'est donc pas « redondant avec le serveur » —
il est **autoritatif** dès qu'il rend autre chose que `'text'`. La duplication
n'est pas une dette de style ici : c'est le seul écrivain qui compte.

---

## Les DEUX chemins du web, et le seul qui atteigne la base

Le suivi nommait deux sites. Ils ne pèsent pas pareil, et la mesure a compté :

| site | événement | le `messageType` envoyé… |
|---|---|---|
| `messaging.service.ts:370` | `message:send-with-attachments` (socket) | est **STRIPPÉ** — `SocketMessageSendWithAttachmentsSchema` n'a pas ce champ, `z.object` le jette, et `MessageHandler` dérive lui-même (`messageTypeFromMimeTypes`) |
| `messaging.service.ts:485` | `POST /conversations/:id/messages` (repli REST) | **est persisté** — la route accepte l'enum, et la dérivation serveur se tait devant lui |

Un troisième site, absent du suivi, a été trouvé au balayage — et c'est celui
que l'utilisateur VOIT :

| site | rôle | coût |
|---|---|---|
| `ConversationLayout.tsx:593` | `messageType` de la ligne OPTIMISTE | affiché instantanément, puis réconcilié par le serveur — donc un **flip visible** quand les deux règles divergent |

Les trois portaient la même erreur, et deux formes distinctes de divergence.

---

## D1 — la règle client ne regardait que la PREMIÈRE pièce jointe

Canonique (`messageTypeFromMimeTypes`) : les MIME sont rangés en catégories, et
**une seule catégorie ⇒ cette catégorie ; plusieurs ⇒ `'file'`** (un lot
hétérogène est une pièce jointe générique).

Les trois exemplaires client lisaient `mimeTypes[0]`. Un envoi photo + PDF
partait donc en `'image'` :

- persisté tel quel par le repli REST, **sans que rien ne le corrige** ;
- affiché tel quel sur la ligne optimiste, puis réconcilié en `'file'` sur le
  chemin socket — le flip que l'optimisme est censé éviter.

Coût aval mesurable : `protectedPreview`
(`services/notifications/NotificationService.ts`) dérive l'icône de contenu de
`messageType` via `contentTypeIcon`. Un dossier mixte notifie 🖼️ au lieu de 📎.
`ConversationMessageStatsService` compte par la même colonne.

## D2 — `text/*` rendait `'text'`, et une pièce jointe sans MIME connu aussi

L'exemplaire web portait une ligne que la canonique n'a pas :

```ts
if (mimeType.startsWith('text/')) return 'text';
```

Un `.txt` ou un `.csv` joint est une **pièce jointe**, pas un message texte :
le rendre `'text'` place un ballon de conversation sur un message qui porte un
fichier. Même chose pour `if (!mimeType) return 'text'` — des pièces jointes
dont on ignore le MIME restent des pièces jointes.

**Distinction faite, pas supposée** : sur ces deux formes-là, le serveur
RATTRAPE le repli REST (la colonne porte `'text'`, donc la dérivation additive
se déclenche et écrit `'file'`). D2 n'est donc un défaut PERSISTÉ nulle part —
c'est un défaut d'AFFICHAGE sur la ligne optimiste, et un piège armé partout
ailleurs. D1, lui, est persisté. Les deux se corrigent d'un même geste ; ils ne
se racontent pas pareil.

---

## Le correctif : la règle REMONTE, elle ne se recopie pas

`packages/shared/utils/attachment-message-type.ts` — nouvel hôte de la règle,
avec son en-tête. La passerelle garde son module comme point d'import (les
appelants n'ont pas à savoir où la règle habite) ; il est devenu un
ré-export de trois lignes.

Une fonction est AJOUTÉE, et elle n'a pas de jumelle serveur — délibérément :

```ts
messageTypeForClientAttachments({ hasAttachments, mimeTypes }): 'text' | AttachmentMessageType
```

Elle porte les deux choses que seul un client sait, et que
`messageTypeFromMimeTypes` ne peut pas rendre :

1. **des pièces jointes, aucun MIME connu** ⇒ `'file'`, jamais `'text'` — le
   tableau vide dit « je n'ai pas l'information », pas « il n'y a rien à
   joindre » ;
2. **aucune pièce jointe** ⇒ `'text'`, le seul cas où il est vrai, et c'est
   `attachmentIds` qui le dit, pas la liste des MIME.

Les deux moitiés de la même règle, chacune à sa place : `deriveMessageType-
ForAttachments` reste ADDITIVE côté serveur, celle-ci est DÉCLARATIVE côté
client. Le corollaire non écrit du cycle 102 est maintenant écrit, dans l'en-tête
de la fonction additive : **ce que vous DÉCLAREZ, le serveur ne le corrigera
pas.**

Les trois sites web passent par elle ; `determineMessageTypeFromMime` et le
ternaire manuscrit de `ConversationLayout` disparaissent.

---

## RED prouvé, dans les deux sens

L'ancienne règle a été rétablie sur les deux sites de `messaging.service.ts`
(exemplaire manuscrit compris) et la suite relancée : **5 témoins tombent, 112
passent.**

| témoin | ancien | canonique |
|---|---|---|
| `text/plain` seul (socket) | `'text'` | `'file'` |
| `['image/jpeg','application/pdf']` (socket) | `'image'` | `'file'` |
| `['video/mp4','audio/mp3']` (socket) | `'video'` | `'file'` |
| `['image/jpeg','application/pdf']` (repli REST) | `'image'` | `'file'` |
| pièces jointes, aucun MIME (repli REST) | `'text'` | `'file'` |

Les 112 autres passent AVANT comme APRÈS : les catégories homogènes
(`image/jpeg`, `audio/mp3`, `video/mp4`, `application/pdf`,
`application/octet-stream`) et le cas sans pièce jointe sont inchangés — le lot
est strictement additif sur eux.

Le témoin partagé (`packages/shared/__tests__/utils/attachment-message-type.test.ts`)
fixe la règle des deux côtés, y compris **le silence de la moitié additive
devant une déclaration fausse** — la ligne qui explique pourquoi ce fichier
existe.

---

## Gates

- `tsc --noEmit` shared **0 erreur** · gateway **0 erreur**
- web `tsc --noEmit` : **1241 erreurs, inchangé** avant/après (fichiers de test
  préexistants ; le web n'a pas de script `typecheck` en CI). Aucune sur les
  trois fichiers touchés.
- shared **103 suites / 2467 tests verts** (18 nouveaux)
- web `messaging.service` **117/117** + `ConversationLayout` **139/139 cumulé**
- gateway : 39 suites adjacentes **1274/1274**, puis **suite complète verte** (exit 0)

---

## Suivis

- [ ] **Un message de LIEU sans pièce jointe reste `'text'`** quand le client se
      tait, et iOS se tait toujours (`SendMessageRequest` n'a pas le champ) :
      les lieux sont sous-comptés par `ConversationMessageStatsService` pour
      toute la population iOS. Hérité du cycle 102, et NON traité ici sur
      mesure : `'location'` n'est pas dans l'enum de la route REST
      (`['text','image','file','audio','video']`), donc le combler est un
      changement de contrat qui touche la route, l'enum, iOS et le service de
      stats — son propre lot, pas un appendice de celui-ci.
- [ ] **`conversation:updated.senderId` est servi dans DEUX espaces d'id.**
      `MessageHandler` (WS) sert un `User.id`, `MeeshySocketIOManager`
      (REST/ZMQ) et `emitConversationPreviewUpdate` servent le `Participant.id`
      de la colonne. Mesuré comme piège ARMÉ, pas comme panne : aucun client ne
      le lit — le web le compose dans `neutralLastMessage` mais ses deux lignes
      de liste tirent le nom de `lastMessage.sender` (l'OBJET, absent du message
      neutre), et iOS le décode sans le mapper dans le store.
- [ ] **`ConversationUpdatedEventData` ne déclare que 3 champs + une signature
      d'index.** Tout le groupe d'aperçu (`lastMessageAt`, `lastMessageId`,
      `lastMessagePreview`, `senderId`) voyage sans contrat, alors que la parité
      des trois émetteurs est justement ce que l'en-tête de `location` dit avoir
      déjà échoué une fois pour cette raison exacte. Le suivi précédent est le
      premier symptôme mesuré de celui-ci.
- [x] **Le commentaire de `MessageHandler.ts:1453` était PÉRIMÉ, et il est
      corrigé dans ce lot** : il disait « ici `io` est le Socket.IO Server lâche,
      donc le compilateur n'a jamais attrapé l'omission », alors que
      `MessageHandler.io: MeeshyIOServer` est typé (`socketio/typed-socket.ts`),
      exactement comme celui du manager. Ce qui reste vrai, c'est que le typage
      n'attrape rien ICI — non par manque de type, mais à cause de la signature
      d'index ci-dessus. Le diagnostic à garder est celui-là, et un mauvais
      diagnostic écrit dans le code coûte plus qu'aucun (règle du cycle 84 : une
      garde qui a l'air de couvrir).
- [x] Suivi hérité **CLOS par le lot voisin, pas par celui-ci** :
      `PreviewEmitIO.emit(event: string, payload: unknown)` a été dérivé de
      `ServerToClientEvents` par le cycle 104 (PR #3366), qui a trouvé HUIT
      copies de la même déclaration là où le suivi n'en nommait qu'une. Noté ici
      parce que ce lot-ci le portait aussi en suivi : deux lots du même jour,
      instruits en parallèle, et c'est l'autre qui l'a fermé.
- [ ] Suivi hérité — la règle du `senderId` du fil a QUATRE exemplaires
      (`messageEditedPayload.ts:90`, `MeeshySocketIOManager.ts:2572`,
      `MessagingService.ts:544`, `conversations/messages.ts:1076`), dont un en
      `||` là où les trois autres sont en `??`.
- [ ] Suivi hérité — un cliquet sur les `default:` de schémas de REQUÊTE.
