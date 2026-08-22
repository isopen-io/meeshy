# Cycle 88 — Déclarer une clé que la charge ne porte pas ne dégrade pas la réponse : ça l'EMPORTE

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-ampdvb`
**Périmètre** : passerelle — les deux transports REST d'édition de message
(`PUT /conversations/:id/messages/:messageId`, `PATCH /messages/:messageId`),
la création de lien de partage (`POST /conversations/:id/new-link`), et le schéma
partagé `messageResponseSchema` qui les a semés.

**Clients touchés** : aucun code client modifié. Aucun nom d'événement ajouté ni
retiré, aucune charge utile temps réel modifiée, aucune ligne de Socket.IO
touchée. **Trois réponses REST changent de contenu** — elles passaient vides.

---

## 0. D'où vient ce cycle

Le cycle 87 bis a installé le cliquet du balayage `{ type: 'object' }` dans le
dépôt (`routes/__tests__/response-schema-sweep.test.ts`) et a gelé les 30 sites
restants, en écrivant que « les `200` / `202` sont la vraie dette — chacun vide
une charge utile SERVIE ».

Cette phrase était vraie, et elle sous-estimait la moitié de l'inventaire.

## 1. La famille a deux gravités, pas une

Tous ces sites déclarent un objet sans `properties` ni `additionalProperties`.
`fast-json-stringify` applique `additionalProperties: false` par défaut, donc
le champ sort `{}`. C'est la gravité que le cycle 86 a nommée et balayée.

Mais un schéma de réponse ne décrit pas seulement le CONTENU d'un champ. Il
décrit aussi **la présence de ce champ**. Et quand la clé déclarée n'existe pas
dans la charge que le gestionnaire passe à `sendSuccess`, l'objet parent n'a
plus aucune propriété déclarée qui corresponde à quoi que ce soit :

| gravité | forme | effet |
|---|---|---|
| **1** — le champ existe | `sender: { type: 'object' }` sur une charge qui porte `sender` | `sender` sort `{}`, **le reste survit** |
| **2** — le champ n'existe pas | `data: { properties: { message } }` sur une charge qui n'a pas de `message` | **`data` ENTIER sort `{}`** |

Deux entrées de l'inventaire gelé étaient de la seconde espèce, et rien ne les
distinguait des autres — l'outil de balayage ne voit que la forme du schéma, pas
la charge d'en face.

Vérifié en isolant le compilateur :

```
schéma : data: { type:'object', properties: { message: { type:'object' } } }
in     : { success: true, data: { id:'…', content:'hi', translations:[…] } }
out    : {"success":true,"data":{}}
```

## 2. Une édition de message REST ne rendait RIEN

Les deux transports servent `sendSuccess(reply, messageResponse)`, où
`messageResponse` **EST** le message édité — la charge est à `data`, pas à
`data.message`. Leur schéma déclarait pourtant l'enveloppement `data.message`.

L'enveloppement n'a jamais existé. Aucun gestionnaire ne l'a produit, aucun
client ne l'a lu : iOS décode `APIResponse<APIMessage>`, Android
`ApiResponse<ApiMessage>`, et pour les deux `data` **est** le message.

### D'où venait la forme fantôme

De `messageResponseSchema` (`packages/shared/types/api-schemas.ts`), qui la
portait — et qui n'était **utilisé nulle part**. Un schéma mort ne se corrige
pas quand on corrige la route : il se COPIE. Ses deux exemplaires inline vivaient
dans les deux routes d'édition, et le cadavre qui les avait semés dormait dans
le paquet partagé, prêt à en semer un troisième.

Le cycle 87 bis avait écrit : « une connaissance écrite dans un commentaire
n'est pas partagée ». Le corollaire est ici : **une forme écrite dans du code
mort n'est pas maintenue, et se propage quand même.**

### Ce que ça coûtait, mesuré chez les clients

**Android — une édition réussie se présentait comme une panne, indéfiniment.**
C'est ce transport qu'Android emprunte (`@PATCH("messages/{id}")`,
`ApiResponse<ApiMessage>`). La chaîne est complète et chaque maillon fait
exactement son travail :

1. `data: {}` — `ApiMessage.id` et `.conversationId` n'ont pas de valeur par
   défaut, kotlinx lève `MissingFieldException` ;
2. `apiCall` (`net/ApiCall.kt`) l'attrape en `SerializationException` et rend
   `Failure(code = "PARSE")` ;
3. `OutboxFlushWorker` traduit tout `Failure` d'une `EDIT_MESSAGE` en
   `TransientFailure` — donc en **RÉESSAI**.

La ligne d'outbox ne draine jamais. Chaque vidange rejoue l'édition, que le
serveur applique de nouveau et **rediffuse en `message:edited` à toute la
room**. Un défaut de sérialisation, seul, produisait une boucle de réémission
temps réel.

**Web** (`PUT`, `services/message.service.ts`) ne lit pas la charge rendue :
il vérifie `response.ok`, affiche « Message edited successfully » et recharge
par ailleurs. L'édition était bien persistée, la réponse était vide, et personne
ne s'en plaignait — c'est ce qui a donné au défaut sa longévité.

**iOS** ne passe par aucun des deux : il emprunte `PUT /messages/:messageId`
(`routes/messages.ts`), qui **ne déclare aucun schéma de réponse** et sert donc
la charge entière. Trois transports pour une même opération, trois contrats
différents, et le seul qui marchait est celui qui ne déclarait rien.

### Le correctif

`messageResponseSchema` devient ce que les trois clients décodent déjà —
`data: messageSchema` — et les deux routes le CONSOMMENT au lieu d'en recopier
une version. Le schéma mort devient vivant : il n'y a plus de forme à copier,
il y a un import.

`messageSchema` déclare `sender`, `translations`, `attachments`, `metadata`,
`validatedMentions`, les compteurs de livraison et les champs de chiffrement :
la charge des deux gestionnaires y entre entière, à une exception près.

**Le seul champ que ce lot ne restaure pas** est `meta.conversationStats`, que
le sibling `PUT` joint à sa charge. Aucun des trois clients ne le lit (vérifié
sur `apps/web`, `apps/ios`, `packages/MeeshySDK`, `apps/android` : zéro
occurrence), et il était retiré AVANT ce lot comme après. Le déclarer aurait été
inventer un contrat que personne ne demande ; le trancher veut dire décider si
les statistiques de conversation voyagent avec chaque édition — une question de
forme d'API, pas de sérialisation.

## 3. Une création de lien de partage ne rendait ni le lien, ni son code

`POST /conversations/:id/new-link` est le troisième site, trouvé en triant
l'inventaire par gravité. Sa déclaration se trompait **deux fois sur la seule
clé qu'elle nommait** :

```ts
data: { type: 'object', properties: { link: { type: 'object' } } }
```

- `link` est la **chaîne** de l'URL d'invitation
  (`${FRONTEND_URL}/chat/:code`). Sérialisée contre un schéma d'objet, elle
  sortait `{}`.
- `code` et `shareLink` — le code d'invitation et TOUS les réglages retenus
  (plafond d'usages, expiration, droits des anonymes, champs requis à l'entrée)
  — n'étaient pas déclarés, donc retirés.

Servi : `{"success":true,"data":{"link":{}}}`. Une création de lien qui réussit,
persiste, et ne rend ni le lien, ni son code, ni ses réglages.

**Ce site n'a aucune victime aujourd'hui** : les trois clients créent leurs
liens par `POST /links` (`routes/links/`), pas par cette porte. C'est ce qui a
laissé le défaut vivre ; ce n'est pas ce qui le rend acceptable. La porte reste
servie, et un client qui l'emprunterait demain n'aurait **aucun moyen de deviner
pourquoi sa réponse est vide** — la route répond 200, le lien existe en base,
et le corps est muet.

`conversationShareLinkResponseSchema` est exporté depuis `sharing.ts` pour être
exerçable : un test de route mocke `sendSuccess` et n'exerce donc jamais le
schéma de réponse. C'est exactement pourquoi ces défauts survivent à des suites
vertes.

## 4. Témoins

**13 neufs**, tous au niveau où le défaut vit — la sortie sérialisée, obtenue en
compilant le schéma RÉEL avec `fast-json-stringify`.

- `message-edit-response-serialization.test.ts` (7) : l'identité du message
  survit, le contenu édité est servi, aucun enveloppement `message`, `id` et
  `conversationId` présents (les deux sans défaut côté Android — leur absence
  EST la boucle d'outbox), expéditeur et traductions servis, mentions
  revalidées du sibling `PUT`, enveloppe intacte.
  **ROUGE prouvé** : 5 des 7 tombent avant le correctif. Les 2 qui passaient
  déjà — « pas de clé `message` » et « `success` intact » — passaient parce que
  `data` était vide, ce qui est la démonstration de pourquoi un témoin de forme
  ne suffit pas.
- `conversation-share-link-serialization.test.ts` (6) : l'URL servie comme
  chaîne, le code, les réglages, les droits des anonymes, l'absence de plafond
  et d'expiration qui ne fabrique pas les clés, enveloppe intacte.
  **ROUGE prouvé** avant correctif : `{"success":true,"data":{"link":{}}}`.

**Cliquet** : les trois entrées réparées sortent de `FROZEN_INVENTORY` (30 → 27),
et deux témoins de non-régression nomment les fichiers désormais propres. Le
commentaire de l'inventaire porte maintenant la discrimination des deux
gravités, avec la question à se poser AVANT de réparer un site restant : *la clé
déclarée existe-t-elle dans ce que le gestionnaire passe à `sendSuccess` ?*

## 5. Ce que ce lot laisse ouvert, priorisé

### D'abord : un cycle 88 concurrent a réfuté une de mes conclusions

Ce lot a été mené en parallèle du **cycle 88** (`claude/keen-hamilton-inwn81`,
PR #3311, fusionné le premier), sans que l'un connaisse l'autre. Nous avons
traité des familles disjointes — la présence pour lui, l'enveloppe fantôme pour
moi — et nous nous croisons sur un seul site : `messages.ts|sender|200`, que
j'avais **délibérément laissé** en écrivant que sa réparation « publierait une
présence que la panne retenait ».

**Il n'y avait pas de panne, et la fuite était déjà ouverte.** Sa version est la
bonne, et voici ce qu'elle a vu que je n'avais pas vu : le schéma de cette route
déclare `id`, `content`, `sender`… **au premier niveau**, alors que `sendSuccess`
répond `{ success, data }`. Aucune de ces propriétés ne matche quoi que ce soit,
`success` et `data` ne sont pas déclarés, et l'objet entier traverse par
l'`additionalProperties: true` du bloc. **Toutes les déclarations y sont
inertes** — `sender` n'était donc pas vidé, il était servi BRUT, présence
comprise, sur ses deux porteurs.

Mon erreur est instructive et tient en une phrase : **j'ai compilé le
sous-schéma, pas la réponse.** Ma sonde a nourri `{ id, sender, … }` à un schéma
qui décrit `{ id, sender, … }` — et a mesuré exactement ce que je lui avais
demandé de mesurer. Il fallait lui donner `{ success, data: { … } }`, la charge
que `sendSuccess` construit réellement. **Une sonde qui n'emprunte pas
l'enveloppe de production ne prouve rien sur la production**, et elle échoue en
CONFIRMANT ce qu'on croyait déjà — le pire des modes de panne pour une
vérification.

Le tableau ci-dessous est donc corrigé : cette famille n'a pas deux formes mais
**trois**, et la troisième est la plus dangereuse parce que le balayage y rend un
FAUX POSITIF — un champ signalé « vidé » qui est en réalité en fuite active.

| forme | ce que le schéma fait | ce que ça coûte |
|---|---|---|
| **1** — la clé déclarée existe | ce champ sort `{}` | un champ perdu |
| **2** — la clé déclarée n'existe pas | le parent sort `{}` ENTIER | la réponse perdue |
| **3** — le schéma décrit la mauvaise enveloppe | rien : tout traverse | **une fuite, sous un signal de vidage** |

### L'inventaire restant

23 sites, **triés par ce qui les rend urgents** plutôt qu'en liste plate. Les
`400` (11 sites) restent la queue : ce sont des `details` / `errors` de schémas
d'ERREUR, sans producteur — à RETIRER plutôt qu'à déclarer.

| site | forme probable | victime vivante ? |
|---|---|---|
| `links/admin.ts\|creator\|200` | à établir | à établir |
| `users/profile.ts\|permissions\|200` | 1 | à établir |
| `voice-analysis.ts\|analysis\|200` ×4 | 1 | à établir |
| `voice/translation.ts\|attachment\|200`, `\|202`, `\|transcription\|200` | 1 | à établir |

`messages.ts|sender|200` **reste dans l'inventaire**, mais pour une raison qui
n'est plus la mienne : sa fuite est fermée (gate à la source, cycle 88), et ce
qui subsiste est une dette de FORME. Aligner son schéma sur l'enveloppe réelle
est un lot en soi — déclarer partiellement ce qui passait entier TRONQUERAIT ce
qui marche aujourd'hui. À faire avec la liste complète des champs servis, ou pas
du tout.

Une remarque de méthode pour la suite : l'entrée `voice/translation.ts` porte
DEUX sites nus voisins (`attachment` et `transcription`, mêmes `properties`
absentes) tandis que le même fichier déclare correctement les mêmes champs trois
cents lignes plus loin. C'est la signature exacte du cycle 87 — un fichier qui
porte la forme juste et la forme nue en même temps. Les réparer ensemble — et,
avant de conclure quoi que ce soit sur eux, **vérifier l'enveloppe**.

## 6. Les leçons

> **Un schéma de réponse ne décrit pas seulement le contenu d'un champ, il
> décrit sa PRÉSENCE.** Déclarer une clé que la charge ne porte pas ne dégrade
> pas la réponse : elle emporte tout le parent. Les deux gravités ont la même
> forme dans le code et des conséquences sans commune mesure — l'une vide un
> champ, l'autre vide la réponse.

> **Une forme écrite dans du code mort n'est pas maintenue, et se propage quand
> même.** `messageResponseSchema` n'était utilisé nulle part, ce qui l'a mis
> hors de portée de toute correction — et n'a rien empêché : ses deux copies
> inline vivaient dans les routes servies. Un schéma mort n'est pas neutre, il
> est un patron. Le correctif n'est pas de le supprimer, c'est de le rendre
> VIVANT : il n'y a plus de forme à copier, il y a un import.

> **Trois transports pour une même opération, trois contrats — et le seul qui
> marchait est celui qui ne déclarait rien.** `PUT /messages/:messageId` sert la
> charge entière parce qu'il n'a pas de schéma de réponse. Ses deux siblings en
> ont un, et c'est lui qui les cassait. Un schéma faux est strictement pire que
> pas de schéma ; la conclusion n'est pas d'en retirer, c'est qu'un contrat
> déclaré doit être EXERCÉ.

> **Un défaut de sérialisation, seul, produit une boucle de réémission temps
> réel.** Rien dans le pipeline Android n'est fautif : la désérialisation stricte
> est correcte, la traduction en `Failure` est correcte, le réessai d'une
> mutation en échec est correct. Trois maillons justes sur une réponse vide font
> une édition rejouée sans fin et rediffusée à toute la room. **Chercher la
> cause d'une boucle de réessai dans la file d'attente, c'est chercher là où la
> lumière est meilleure.**

> **Un test de route qui mocke `sendSuccess` n'exerce jamais le schéma de
> réponse.** Les trois défauts de ce cycle vivaient sous des suites vertes. Un
> contrat de sérialisation se teste en compilant le schéma réel — ce qui exige
> qu'il soit exportable, donc qu'il ait un nom.

> **Une sonde qui n'emprunte pas l'enveloppe de production ne prouve rien, et
> elle échoue en CONFIRMANT.** J'ai compilé le sous-schéma de `messages.ts` et
> je lui ai donné la charge que ce sous-schéma décrit ; il m'a rendu ce que je
> croyais déjà — `sender: {}` — et j'ai classé le site « sans victime, fuite
> retenue par la panne ». Le cycle 88 concurrent, lui, a nourri la vraie
> enveloppe `{ success, data }` et a trouvé l'inverse : déclarations inertes,
> charge traversant entière, **présence en fuite active**. Une vérification qui
> ne peut que confirmer l'hypothèse n'est pas une vérification. Nourrir la
> charge que le GESTIONNAIRE construit, jamais celle que le schéma décrit.

> **Un signal d'outil est une hypothèse, pas un constat.** Le balayage ne voit
> que des schémas ; il ne peut pas distinguer « ce champ sort vide » de « toute
> la réponse sort vide » de « rien ne sort vide, et ce champ fuit ». Les trois
> ont la même signature. **Le cas le plus dangereux est celui où l'outil se
> trompe dans le sens rassurant** — un faux positif de vidage a servi de
> couverture à une fuite de présence, et m'a fait écrire noir sur blanc qu'il n'y
> avait rien à craindre.
