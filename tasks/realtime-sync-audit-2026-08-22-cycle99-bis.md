# Cycle 99 bis (2026-08-22) — `message:new` a deux producteurs, et ils avaient cessé de dire la même chose

> Numéroté **bis** : un autre lot a porté le numéro 99 le même jour
> (`…-cycle99.md`, « un refus de jonction TRANSITOIRE effaçait la conversation »).
> Les deux sont indépendants ; celui-ci a été renommé à l'intégration pour ne
> rien écraser.

## Ce que ce cycle construit

Le cycle 98 laissait la « quatrième famille » outillée sur le protocole Signal et
nommait ce qui restait : **le sérialiseur/décodeur Socket.IO**, et **le couple
producteur passerelle / décodeurs clients**. Ce cycle-ci prend le premier.

`message:new` — l'événement le plus chaud du produit — a **DEUX producteurs** :

| producteur | transport | ce qu'il porte |
|---|---|---|
| `MessageHandler.broadcastNewMessage` | socket `message:send` | messages texte ordinaires |
| `MeeshySocketIOManager._broadcastNewMessage` | REST / ZMQ | `POST /conversations/:id/messages`, retour du traducteur, messages d'agent, routes de lien |

Chacun construisait sa charge utile **à la main, dans son fichier**. Les deux
portaient un commentaire jumeau qui s'en avertissait — « tout champ ajouté ici
doit être répliqué à la main […] et inversement — **c'est la 3e fois** que cette
duplication cause un bug de parité » — et chacun de ces commentaires n'a gardé
que l'exemplaire qui le portait. C'est mot pour mot la leçon du cycle 85
(« Cette entité a-t-elle une JUMELLE ? »), une couche plus haut.

## Le désaccord, mesuré

| famille de champs | socket | REST/ZMQ |
|---|---|---|
| enveloppe E2EE — `isEncrypted`, `encryptionMode`, `encryptedContent`, `encryptionMetadata`, `encryptedPayload` | servie | **absente** |
| plafond de vue-unique — `maxViewOnceCount` | servi | **absent** |
| provenance d'un transfert — `forwardedFromId`, `forwardedFromConversationId` | servie | **absente** |
| réponse à un post — `storyReplyToId` | servie | **absente** |
| `messageSource`, `updatedAt` | **absents** | servis |
| pseudo d'un expéditeur SANS COMPTE | **absent** | servi |

**La colonne perdante n'est pas la moins fréquentée.** Le commentaire du chemin
REST le dit lui-même, quelques lignes au-dessus du défaut :

> Ce chemin est celui de TOUT envoi REST — donc, côté iOS, de tout envoi non
> éligible au socket-first : pièce jointe, **DM chiffré**, **vue-unique**,
> éphémère, message à effets.

Autrement dit : **les familles de champs que ce producteur omettait sont
exactement celles des messages qu'il est SEUL à porter.**

## La panne, remontée jusqu'au consommateur

Ce n'est pas un piège armé. Le chemin est complet et il est en production.

1. `MessageProcessor.saveMessage` écrit `content: isEncrypted ? '' : …` — le
   texte d'un message chiffré vit dans `encryptedContent`, `content` est VIDE.
2. Le chemin REST diffusait donc `content: ''` **sans** `encryptedContent`,
   **sans** `encryptionMetadata`, **sans** le drapeau `isEncrypted`.
3. Côté web, `MessagingService.decryptMessage`
   (`apps/web/services/socketio/messaging.service.ts:258`) lit le chiffré
   **depuis ces deux champs précis** :

```ts
const encryptedContent = socketMsg.encryptedContent;
const encryptionMetadata = socketMsg.encryptionMetadata;
if (!encryptedContent || !encryptionMetadata || !this.encryptionHandlers?.decrypt) {
  return message;   // ← sortie au PREMIER garde, silencieuse
}
```

4. Le web, lui, ENVOIE ses messages chiffrés par le socket, et refuse
   explicitement le repli REST (« REST can't handle E2EE yet »).

**Conclusion : web → web fonctionnait (chemin socket) ; iOS → web ne
fonctionnait pas.** Un DM chiffré parti d'un iPhone arrivait chez un
destinataire web comme une **bulle vide** — pas un message dégradé, pas une
erreur, rien à signaler. Le chiffrement de bout en bout était **unidirectionnel
sans que rien ne le dise**.

Et le symptôme touchait aussi l'EXPÉDITEUR iOS. `ConversationSocketHandler`
porte la garde exacte, avec sa raison écrite :

```swift
// For an own E2EE message we keep the OPTIMISTIC plaintext: the server echo
// only carries ciphertext […] Without this the bubble would flip plaintext →
// base64 ciphertext on echo.
let reconciledContent: String? = (apiMsg.isEncrypted == true) ? optimisticContent : serverMsg.content
```

`isEncrypted` étant absent du fil REST, la garde ne se déclenchait jamais sur le
transport qui porte les messages chiffrés : la bulle de l'expéditeur basculait de
son texte clair optimiste vers `serverMsg.content`, soit **la chaîne vide**.

> **Une garde écrite pour un symptôme peut ne jamais s'exécuter sur le transport
> qui le produit.** Elle était juste, commentée, et sans effet — même forme que
> le correctif de symétrie du cycle 97 défait par sa couche consommatrice.

## Le témoin

`src/socketio/__tests__/message-new-producer-parity.test.ts` — six affirmations.

Il applique le patron de la quatrième famille (cycles 97/98) tel quel :

1. **Deux productions RÉELLES.** Un seul `MeeshySocketIOManager` est construit,
   et on lui prend le vrai `MessageHandler` qu'il porte — le harnais du manager,
   lui, le DOUBLE, ce qui est précisément pourquoi il ne pouvait rien voir. Les
   deux producteurs confrontés sont exactement ceux que la passerelle exécute.
2. **Un seul message**, portant une valeur de chaque famille du contrat.
3. **Affirmations SÉPARÉES** — la séparation EST le diagnostic.

**Les témoins existants étaient eux-mêmes en JUMELLES** : un par producteur,
chacun dans le harnais de sa classe, l'un annoté « Jumeau EXACT du témoin de
`MessageHandler.broadcastNewMessage` ». Deux exemplaires d'une même affirmation,
chacun vert contre sa moitié — structurellement incapables de voir un désaccord.
C'est le coût, mesuré, de la duplication d'un témoin.

### ROUGE prouvé, mutation par mutation

Contre la production d'avant le lot : **6/6 tombent**. Puis, une famille retirée
à la fois de l'unité partagée :

| mutation | témoins qui tombent |
|---|---|
| enveloppe E2EE retirée | 1 — « l'enveloppe E2EE voyage par les DEUX transports » |
| `maxViewOnceCount` retiré | 1 — « le plafond de vue-unique… » |
| provenance de transfert retirée | 1 — « la provenance d'un transfert… » |
| `storyReplyToId` retiré | 1 — « la réponse à un post… » |
| repli du pseudo anonyme retiré | 1 — « le pseudo d'un expéditeur SANS COMPTE… » |
| un producteur regagne un champ que l'autre n'a pas | 1 — « le MÊME jeu de clés de contrat » |

**Chaque mutation en fait tomber EXACTEMENT UN, et c'est celui qui nomme sa
famille.** Le cliquet de divergence et les témoins nommés sont complémentaires,
jamais redondants : retirer un champ de l'unité PARTAGÉE le retire des deux
côtés, donc les jeux de clés continuent de coïncider — seul le témoin nommé
tombe. Inversement, un champ ajouté à un seul producteur ne fait tomber que le
cliquet.

## Le correctif

`src/socketio/messageNewPayload.ts` — `buildMessageNewPayload`, source **unique**
des champs dérivés de la ligne message. Les deux producteurs l'appellent.

Ce qui reste PARAMÈTRE, parce que la forme diffère délibérément d'un transport à
l'autre, avec la raison écrite aux deux sites :

- `replyTo` — passthrough BRUT côté socket, sender reconstruit et APLATI côté
  REST ;
- `attachments` — normalisés par `serializeAttachmentForSocket` côté socket,
  bruts côté REST ;
- `translations` — chaque chemin les obtient par sa propre voie.

Et deux champs laissés HORS contrat **par décision**, écrite dans le cliquet
pour qu'elle ne se relise pas comme un oubli :

- `originalContent` — **n'est pas une colonne** : il duplique `content` sur le
  fil. L'ajouter au chemin socket doublerait le poids texte du chemin le plus
  chaud du service pour un alias que le web lit en SECOND
  (`content || originalContent`).
- `metadata` — l'enveloppe brute d'où le chemin socket HISSE ce dont les clients
  ont besoin (`location`, `trackingLinks`, `postReplyTo`) ; iOS y lit encore
  `callSummary` et `joinNotice`, deux familles de messages système que seul le
  transport REST produit.

Les retirer du chemin REST serait un **RETRAIT**, qui demande d'abord de relever
leurs consommateurs sur les trois clients — donc un lot à part.

> **Le lot entier est ADDITIF.** Aucun champ ne disparaît d'aucun transport ;
> chaque producteur gagne ce que l'autre avait. C'est ce qui le rend livrable
> sans coordination client : un décodeur qui lisait déjà un champ continue de le
> lire, un décodeur qui l'ignorait l'ignore encore (`decodeIfPresent` partout
> côté iOS).

### Une note de typage qui est une garde

Le type de retour de `buildMessageNewPayload` est **inféré**, jamais annoté en
`Record<string, unknown>` : le chemin REST étale ce résultat dans son littéral
puis l'émet sur un `emit` typé `message:new`. Une annotation large ferait perdre
au littéral son type exact et l'émission cesserait d'être vérifiée — la garde que
`stripClientMessageId`, générique et préservant (cycle 7), avait été écrit pour
ne pas casser. Mesuré : annoter large, puis annoter `sender.type: string`, ont
fait tomber le compilateur aux trois sites d'émission, l'un après l'autre.

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- Suite complète passerelle : voir § Résultats ci-dessous
- Témoin du lot : **6/6**, ROUGE prouvé séparément pour chacune des 6 mutations

## Suivis

- [ ] **iOS ne lit PAS `encryptedContent` du fil.** `APIMessage` n'a pas cette
      clé ; `decryptMessagesIfNeeded` tire le chiffré de `msg.content`
      (`Data(base64Encoded: msg.content)`), que la passerelle laisse VIDE pour un
      message chiffré. Le correctif de ce cycle est une PRÉCONDITION pour iOS,
      pas une garantie : il rétablit le contrat du fil, il ne rétablit pas à lui
      seul le déchiffrement côté iOS. À instruire comme un lot propre — et à
      trancher d'abord : est-ce le fil qui doit servir le chiffré dans `content`
      (comme le web le lit ailleurs), ou iOS qui doit lire `encryptedContent` ?
      Les deux moitiés sont cohérentes séparément. **C'est la quatrième famille,
      exactement, sur le couple producteur passerelle / décodeur iOS** — celui
      que le cycle 98 nommait en second et qui reste ouvert.
- [ ] **`originalContent` : alias hérité à retirer du fil** après relevé de ses
      consommateurs web (`MessageSearch.tsx`, `BubbleMessageNormalView.tsx`
      le déclarent ; `content || originalContent` le lit en second). Gain direct
      sur le poids de CHAQUE message du chemin REST.
- [ ] **`attachments` : les deux transports ne les normalisent pas pareil.**
      Le chemin socket passe par `serializeAttachmentForSocket` (qui garantit
      `transcription` + `translations` et agrège les réactions), le chemin REST
      les sert bruts. Unifier est un CHANGEMENT de forme, pas un ajout — à
      instruire contre les consommateurs des trois clients avant de bouger.
- [ ] **`SocketIOMessage` déclare 13 champs pour une charge utile qui en porte
      plus de trente.** Le type partagé qui NOMME `message:new`
      (`packages/shared/types/socketio-events.ts:2292`) ignore l'enveloppe E2EE,
      la vue-unique, le transfert, `effectFlags`, `translations`,
      `validatedMentions`, `attachments`, `clientMessageId`… Rien n'est
      SUPPRIMÉ — c'est une `interface`, pas un sérialiseur — mais le web doit
      caster pour lire ce qu'il lit déjà :

      ```ts
      const socketMsg = socketMessage as SocketIOMessage & { encryptedContent?: string; … };
      ```

      Et le compilateur ne s'en plaint pas : les deux producteurs émettent une
      VARIABLE, pas un littéral frais, donc le contrôle des propriétés en excès
      ne se déclenche jamais. **C'est ce cycle qui rend le lot faisable** : tant
      que « le contrat » était ce sur quoi deux littéraux manuscrits se
      trouvaient d'accord, il n'y avait rien à déclarer. Il y a maintenant une
      unité unique à lire pour l'écrire. À faire dans un lot dédié — élargir un
      type partagé se mesure contre les trois clients (règle du cycle 93 : le
      schéma partagé ne grossit pas pour deux appelants).
- [ ] **Reste de la quatrième famille** : le couple producteur passerelle /
      décodeurs **Android**. Non instruit ici.
