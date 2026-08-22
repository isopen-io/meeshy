# Cycle 94 bis — La dernière enveloppe inerte, et les deux défauts qu'elle couvrait

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-hjakmo`
**Périmètre** : passerelle — `routes/messages.ts` ; schéma partagé — `types/api-schemas.ts`

> **Homonyme.** Un cycle concurrent porte déjà le numéro 94 sur `main`
> (`…-cycle94.md`, sous-arbre DMA/Signal remis sous le compilateur) — sujet sans
> aucun recouvrement avec celui-ci, ni en fichiers ni en matière. Ce journal
> prend donc le suffixe `-bis`, comme les cycles 86, 91 et 93 avant lui. Les
> deux numérotations se sont croisées parce qu'elles avancent en parallèle sur
> la même journée, pas parce que l'une reprend l'autre.

**Clients touchés** : aucun changement de code client. Aucun nom d'événement
ajouté ni retiré, aucune charge utile temps réel modifiée, aucune ligne de
Socket.IO touchée. Deux réponses REST changent — voir §6.

---

## 0. Le point de départ : une ligne, et une interdiction de la traiter en passant

`FROZEN_INVENTORY` ne portait plus qu'une entrée depuis le cycle 91 bis :

```
messages.ts|sender|200
```

Le cliquet la signalait comme un `{ type: 'object' }` nu. Elle ne l'était pas —
ou plutôt, elle l'était sans que cela ait la moindre conséquence. C'est le seul
site de la **forme 3** de la taxonomie : le schéma décrit le MESSAGE (`id`,
`content`, `sender`…) quand `sendSuccess` répond `{ success, data }`. Aucune de
ses six déclarations ne matche l'objet réel, `success` et `data` ne sont pas
déclarés, et l'`additionalProperties: true` du bloc les laisse traverser
**entiers et non gouvernés**.

Mesuré au sérialiseur sur la charge utile réelle, avant tout changement :

```
data keys served : 42/42
MISSING          : (none)
sender out       : id,userId,displayName,avatar,isOnline,type,user
```

Trois cycles avaient laissé cette ligne en place avec la même raison écrite, et
elle était juste :

> Aligner ce schéma sur l'enveloppe est un lot en soi : il faudrait décrire TOUT
> ce que la route sert, sans quoi la déclaration tronquerait ce qui passe
> aujourd'hui.

Ce lot est celui-là.

## 1. La méthode : relever les clés, pas les lire

Les 42 clés servies ont été extraites **mécaniquement** — un parcours de
profondeur sur le littéral `select:` du handler, plus les surcharges que le
handler compose après (`deliveredCount`, `readCount`, `recipientCount`,
`deliveredToAllAt`, `readByAllAt`, `statusSummary`) et le `location` que
`hoistLocationOnto` hisse.

Ce n'est pas de la coquetterie de méthode. Le cycle 93 s'est trompé de cycle
entier pour avoir **inventé** la charge utile au lieu de la lire chez son
producteur, et sa leçon est explicite : la question n'est pas « à quoi ressemble
cette réponse ? » mais « que passe le gestionnaire à `sendSuccess` ? ». Un
parcours de programme ne peut pas répondre à côté de la question.

Puis la même charge est passée au vrai `fast-json-stringify`, contre la
réutilisation NAÏVE du schéma partagé — celle qu'on aurait écrite en copiant la
forme juste d'à côté :

```
=== NAIVE messageResponseSchema (shared, as-is) ===
data keys served : 39/42
MISSING          : encryptionMode, conversation, statusSummary
sender out       : id,userId,displayName,avatar,isOnline,type      ← `user` PERDU
```

Cinq pertes, dont deux qui ne sont pas des détails de cette route.

> **Copier la forme juste d'à côté ne suffit toujours pas.** Quatrième fois
> (cycles 84, 89, 91, et celui-ci) : la bonne forme est à portée de regard, et
> elle est fausse contre le producteur de CETTE route. La seule méthode qui
> tienne est de l'ouvrir contre lui.

## 2. Le premier défaut que la mesure a découvert : `translations` sort en CARTE

`schema.prisma` est sans ambiguïté :

```
/// Traductions du message - map: langue -> données
/// Structure: { "en": { text, translationModel, confidenceScore, createdAt … } }
translations Json?
```

C'est une **carte**. Le contrat, lui, déclare un **tableau** d'objets
`{ id, messageId, targetLanguage, translatedContent, … }` — et les trois clients
le décodent ainsi : iOS `APIMessage.translations: [APITextTranslation]?`,
Android `List<ApiTextTranslation>`, le schéma partagé
`{ type: 'array', items: messageTranslationSchema }`.

Le pont entre les deux existe depuis longtemps :
`transformTranslationsToArray` (`utils/translation-transformer.ts`). Il est
appliqué par la liste de messages, par la recherche, et — **dans le fichier même
de cette route, aux lignes 600 et 950** — par les transports d'édition et de
suppression.

Le GET de détail ne l'appelait pas. Il étalait `...message` et servait la carte
brute. L'import du helper était déjà en tête de fichier.

### Pourquoi personne ne l'avait vu

Parce que le seul consommateur de cette route est un chemin où rien ne
remonte : l'**extension de notification iOS**.

```
push → NSEDataSync.syncMessage() → GET /api/v1/messages/:messageId
     → dépose le blob JSON dans l'App Group
     → réveil de l'app → NSEPendingMessageConsumer.consumeAll()
     → try? decoder.decode(APIMessage.self, from: item.data)
```

Et dans `APIMessage.init(from:)`, `translations` se décode ainsi :

```swift
translations = try c.decodeIfPresent([APITextTranslation].self, forKey: .translations)
```

Un `try` **non tolérant** — contrairement à ses voisins immédiats
`callSummary`, `joinNotice` et `trackingLinks`, qui sont en `try?` avec un
commentaire expliquant pourquoi. Une carte y fait donc échouer le décodage du
message **entier**. Le consommateur journalise `NSE prefetch decode failed` et
**supprime le fichier**.

Conséquence : **le démarrage à froid depuis une notification n'avait plus son
message en local, pour tout message portant au moins une traduction** — c'est-à-
dire, sur un produit dont le Prisme Linguistique traduit tout, à peu près tous.

L'ironie est documentée dans le dépôt : le commentaire d'en-tête de
`NSEDataSync.syncMessage` raconte que cette route a justement été CHOISIE, à
l'audit du 2026-08-13, pour rétablir cette garantie — l'appel précédent visait
une paire méthode/chemin que la passerelle n'a jamais enregistrée et répondait
404. La garantie a été rétablie au niveau du transport, et reperdue une couche
plus bas, au niveau de la FORME.

> **Réparer l'ADRESSE d'un appel ne prouve rien sur la FORME de sa réponse.**
> Le 404 se voyait ; un 200 dont le corps ne se décode pas, non — il n'a laissé
> qu'une ligne de log dans un processus que personne ne regarde.

## 3. Le second : `encryptionMode`, absent du schéma partagé sur la foi d'un commentaire

```ts
// Encryption (encryptionMode is only on Conversation)
isEncrypted: { … },
encryptedContent: { … },
encryptionMetadata: { … },
```

Le commentaire est faux. `schema.prisma` porte le champ sur `Message` aussi
(« Encryption mode: "e2ee" (end-to-end), "server" (server-side), "hybrid" »),
**deux routes le chargent** (`conversations/messages.ts:719` pour la liste,
`routes/messages.ts:195` pour le détail), et le SDK iOS le **déclare et le
décode** sur son message (`APIMessage.encryptionMode`).

Et ce défaut-là ne vivait pas seulement sur la route de ce lot. La LISTE de
messages sert par `items: messageSchema`. Mesuré :

```
LIST row served : id,conversationId,senderId,content,reactionCount,isEncrypted,encryptedContent,createdAt
encryptionMode  : *** STRIPPED ***
```

Un client E2EE recevait donc `isEncrypted: true` **et** le chiffré, sans jamais
savoir **sous quel régime** déchiffrer.

C'est mot pour mot le défaut « R5 » des pièces jointes, une couche plus haut.
`messageAttachmentSchema` a gagné son enveloppe E2EE et un cliquet
(`attachmentIncludes.test.ts`, dont le commentaire dit : « E2EE clients couldn't
decrypt attachments served by routes that applied messageAttachmentSchema as
their response shape »). Le MESSAGE porteur, lui, ne l'avait pas.

> **Un commentaire qui ÉNONCE une contrainte de schéma est une affirmation, et
> se vérifie comme telle.** Celui-ci a tenu le champ hors du contrat pendant
> toute la vie de `messageSchema`, alors que `schema.prisma` le contredisait à
> deux fichiers de là. Le dépôt connaît déjà cette famille : la note de
> `storyAuthorSelect` qui ÉNUMÉRAIT trois audiences gatées en omettant la
> quatrième, celle qui ne l'est pas. Fausse nulle part, décisive là où elle
> l'était.

Le correctif est dans le schéma PARTAGÉ, parce que le défaut y est : la liste en
bénéficie sans qu'une ligne de son fichier change.

## 4. Le grain de `sender` : local, et DIFFÉRENT de celui du cycle 93

Cycle 93 avait laissé une règle : « à une troisième route qui charge le même
participant élargi, la réponse deviendra un `participantSenderSchema` partagé ».

Ce n'est pas cette route. Les deux ne chargent pas le même participant :

| | cycle 93 (`PUT`/`PATCH` d'édition) | ce lot (`GET` de détail) |
|---|---|---|
| en plus de `userMinimalSchema` | `role`, `language`, `user` | `user` |
| `isOnline` | **omis** — fail-closed, le `select` ne le charge pas | **déclaré** — chargé délibérément, gaté à la source |

Fusionner les deux exigerait de porter `isOnline` dans le schéma commun, ce qui
**désarmerait précisément la décision fail-closed du cycle 93**. La déclaration
reste donc locale des deux côtés, et la raison est écrite sur les deux sites.

Ici `isOnline` est légitime et se déclare : le `select` le charge sur ses DEUX
porteurs (la ligne `Participant` et le `User` imbriqué), et le handler les gate
tous les deux par `applyPresenceVisibilityAsOffline` en régime prefs-only —
l'appelant est un participant ACTIF, vérifié par le 403 vingt lignes plus haut.
**La garde reste dans le handler, jamais dans le sérialiseur.**

## 5. Ce qui est déclaré plutôt que retiré, et pourquoi

Deux champs servis aujourd'hui auraient pu passer pour du bruit :

- **`conversation`** — chargé pour le CONTRÔLE D'ACCÈS, et servi depuis toujours
  par l'étalement. Son `where` ne rend que la ligne de l'APPELANT
  (`{ userId, isActive: true }`) : c'est sa propre appartenance, jamais celle
  d'un tiers, donc aucune question de confidentialité.
- **`statusSummary`** — le miroir groupé des trois compteurs déjà servis à plat.

Les deux sont **déclarés tels qu'ils sont servis**. Les retirer serait un
changement de contrat, et un changement de contrat se décide sur des preuves de
consommation client — pas en passant, dans un lot dont le but est justement de
ne rien tronquer.

> **Un lot qui gouverne une charge utile jusque-là libre ne doit rien y
> décider d'autre.** Sinon la mesure « rien n'a été perdu » cesse d'être
> vérifiable, et c'est la seule qui protège les clients.

## 6. Ce qui change dans les réponses

**`GET /messages/:messageId`** :
- `translations` passe de la CARTE Mongo au TABLEAU du contrat — la forme que
  les trois clients décodent déjà, et que les deux autres transports du même
  fichier servaient déjà.
- `encryptionMode` (déjà chargé) est désormais déclaré, donc servi.
- Le reste est **inchangé** : 42 clés entrent, 42 sortent.

**`GET /conversations/:id/messages`** (liste) : `encryptionMode`, chargé depuis
toujours et supprimé par le sérialiseur, est désormais servi. Aucune ligne de
ce fichier n'a changé.

Aucune réponse ne perd de champ.

## 7. Témoins

`__tests__/unit/routes/message-detail-serialization.test.ts` — 9 témoins.

Il monte le **VRAI module de route** (`app.register(messageRoutes)`) sur une
vraie instance Fastify et injecte : la charge utile traverse donc le vrai
handler ET le vrai sérialiseur. Le double Prisma rend la ligne telle que le
`select` la produit — **`translations` en CARTE**, parce que c'est ce que rend
Mongo.

C'est le harnais que le cycle 88 avait déjà bâti pour le gate de présence de
cette même route (`message-detail-sender-presence.test.ts`), réemployé plutôt
que recopié. À noter : ce fichier-là porte un témoin qui dit explicitement
garder contre « une future *correction* du schéma qui, elle, tronquerait pour de
bon ». **Le piège a fonctionné** : il est resté vert, ce qui est la preuve que
`sender` et son `user` imbriqué survivent à ce lot.

**ROUGE prouvé, deux fois, isolément :**

| mutation | effet |
|---|---|
| retrait de `transformTranslationsToArray` du handler | **9 / 9 tombent** — la carte ne traverse plus le schéma du tout, la route rend 500 |
| retrait d'`encryptionMode` de `messageSchema` | **1 / 9 tombe** — `Expected "e2ee", Received undefined` |

Le premier ROUGE est brutal et c'est ce qu'on veut : il montre que le contrat
**rejette** désormais la forme carte, au lieu de la laisser filer vers un
décodeur client qui, lui, échouait en silence.

Contre-mesure de la faute du cycle 93 : la charge utile du témoin n'est pas
inventée, elle est calquée sur ce que la requête rend — d'où la carte en entrée
et le tableau en sortie, dans le même témoin.

## 8. Le cliquet

`FROZEN_INVENTORY` passe de UNE ligne à **ZÉRO**, et le compte est lu dans le
FICHIER — pas hérité du journal précédent, faute que le cycle 93 a dû corriger
sur quatre cycles de prose.

Les trois balayages sont donc à inventaire vide en même temps :

| cliquet | garde | inventaire |
|---|---|---|
| `response-schema-sweep` | objet NU (forme 1 et 2) | **vide** |
| `response-payload-mismatch` | clé déclarée ABSENTE de la charge (forme 2) | vide |
| `error-schema-sweep` | type FAUX sur une enveloppe d'erreur | vide |

C'est un état à défendre, pas un état atteint — et surtout, **ce n'est pas une
attestation que les schémas disent vrai**. Les trois cherchent une déclaration
absente, mal appariée ou mal typée. Aucun ne voit une déclaration **présente,
bien formée, et fausse contre son producteur** : c'est exactement ce qu'était
l'enveloppe de ce lot, et c'est ce qu'était `messageSchema.translations` face à
un handler qui servait une carte. La quatrième famille n'est pas outillée, et
elle est celle qui reste.

## 8 bis. « Cette entité a-t-elle une JUMELLE ? » — posée, et la réponse est OUI

La règle du dépôt veut qu'on la pose **au moment où l'on corrige**, pas des
cycles plus tard. Les huit sites de `routes/` qui chargent `Message.translations`
ont donc été ouverts un par un :

| site | forme servie | verdict |
|---|---|---|
| `conversations/messages.ts` (liste, recherche) | transform | ✅ |
| `conversations/threads.ts` | transform | ✅ |
| `messages.ts` — édition, suppression, `GET /:id/translations` | transform | ✅ |
| `conversations/core.ts` | `buildLastMessagePreviewTranslations`, champ dédié `lastMessageTranslations` | ✅ délibéré |
| `admin/content.ts` | non instruit — surface d'administration, pas de contrat client | à voir |
| **`routes/messages.ts` — `GET /:messageId`** | **CARTE brute** | ❌ corrigé par ce lot |
| **`routes/sync.ts` — `GET /sync`** | **CARTE brute** | ⚠️ piège ARMÉ |

**`GET /sync` porte le même défaut, et aucun client ne l'appelle aujourd'hui**
— vérifié sur les trois (iOS/SDK, web, Android : zéro appelant). Il n'a par
ailleurs **aucun schéma de réponse**, donc rien n'y est gouverné du tout.

Ce n'est donc pas une panne, c'est un piège armé au sens du cycle 84 : le
premier client qui câblera ce point d'entrée et décodera en `APIMessage`
perdra le message ENTIER, en silence, sans qu'un témoin tombe.

**Il n'est pas corrigé ici, et c'est une décision.** Lui donner sa forme
demande de lui donner d'abord un schéma de réponse — c'est un lot en soi, du
même genre que celui-ci, et l'élargir maintenant ferait perdre la seule mesure
qui protège ce lot-ci (« 42 clés entrent, 42 sortent »). Ce qui n'est pas
négociable, c'est de **dire exactement ce qui reste** : c'est fait ici et au §9.

## 9. Ce que ce cycle laisse ouvert

- **`GET /messages/:messageId` n'agrège pas les réactions de pièce jointe.**
  `attachmentFullSelect` charge la relation `reactions` brute
  (`{emoji, participantId}`) ; le contrat de fil, lui, est
  `reactionSummary` + `currentUserReactions`, produits par une agrégation
  serveur que cette route ne fait pas. Tant que la réponse n'était pas
  gouvernée, la relation brute partait telle quelle — une forme qu'aucun client
  ne décode. Elle ne part plus. Poser l'agrégation ici est un lot en soi, et il
  se mesure : `attachmentIncludes.test.ts` nomme déjà `reactions` comme champ
  d'agrégation interne.
- **`APIMessage.translations` se décode avec un `try` non tolérant** quand ses
  trois voisins immédiats sont en `try?` avec la raison écrite. La passerelle ne
  sert plus de carte, donc le piège est désamorcé côté serveur ; mais un seul
  émetteur qui se trompe de forme continuerait de faire perdre le message
  ENTIER, pas seulement ses traductions. C'est un lot iOS, à instruire contre la
  raison qui a fait choisir `try?` à côté.
- **`GET /sync` sert la même CARTE brute, et n'a aucun schéma de réponse**
  (§8 bis). Zéro appelant sur les trois clients aujourd'hui : piège armé, pas
  panne. Le lot est « donner un contrat à `/sync` », pas « recopier un
  transform » — et c'est cet ordre-là qui compte, puisque c'est le contrat qui
  rend la forme fausse observable.
- **Le quatrième balayage n'existe pas** (§8) : rien ne garde contre une
  déclaration bien formée et fausse contre son producteur. Les deux défauts de
  ce cycle en étaient. Un cliquet qui apparierait chaque `select:` avec le
  schéma de la réponse qu'il alimente couvrirait la famille ; c'est un outil,
  donc il vit dans le dépôt ou il n'existe pas — leçon du cycle 87 bis.

## 10. La leçon

> **Réparer une enveloppe rend lisibles les défauts de ce qu'elle contenait.**
> Le cycle 93 l'avait écrite pour une enveloppe fantôme qui vidait. Elle vaut
> aussi, et plus fort, pour une enveloppe INERTE qui laissait tout passer : tant
> que rien n'était gouverné, aucune forme n'était fausse — il n'y avait pas de
> contrat à contredire. Gouverner, c'est créer la possibilité même du désaccord,
> et les deux désaccords étaient là depuis le début.

Et le corollaire, sur le coût de ne pas gouverner :

> **Une charge utile non gouvernée ne se trompe jamais, et c'est ce qui la rend
> dangereuse.** Les deux défauts de ce cycle vivaient depuis longtemps derrière
> un 200 vert et des témoins verts. Le seul endroit où ils se voyaient était un
> `Logger.nse.error` dans une extension de notification — un processus qui meurt
> en quelques secondes, dont personne ne lit les journaux, et dont l'échec se
> manifeste à l'utilisateur sous la forme la plus muette qui soit : un écran
> qui met un peu plus longtemps à se remplir.
