# Cycle 112 — Le repli qui couvrait tout, sauf le mode où il était seul

> Numéroté 112 et non 111 : une session parallèle a landé son propre cycle 111
> (`…-cycle111.md`, le rejeu hors ligne) pendant que ce lot était en cours. Les
> deux sont indépendants ; c'est la collision de NOM de fichier qui a tranché le
> numéro, pas l'ordre des travaux.

**Branche** : `claude/keen-hamilton-8c0qte`
**Portée** : Phase 2 (synchronisation temps réel — mentions), Phase 3 (livraison),
Phase 8 (architecture — gouvernance de contrat).
Suite directe du cycle 110, dont ce lot **réfute une mesure** et **exécute un
suivi**.

---

## 1. D'où vient ce lot

Le cycle 110 a fermé la porte d'ENTRÉE de l'envoi de message : l'enveloppe de
chiffrement, strippée en silence par un `z.object` sur le chemin PRIMAIRE. Il a
laissé deux suivis, et une mesure.

La mesure est au §8 de son journal, sous le titre « Ce qui a été MESURÉ CORRECT,
et pourquoi on l'écrit » :

> **`mentionedUserIds`** : le web l'émet, le schéma socket le STRIPPE, REST le
> déclare et l'honore. Ce n'est pas un défaut : `computeValidatedMentions` fait
> primer la liste explicite quand elle existe, et retombe sinon sur l'extraction
> des `@username` du CONTENU — que le web envoie aussi. […] Écart de
> consistance, pas de perte.

Chaque phrase de ce paragraphe est vraie. La conclusion ne l'est pas.

## 2. Le repli existe. Sa PRÉCONDITION ne tient pas partout

`resolveMessageMentions` retombe bien sur le contenu :

```ts
if (explicit.length === 0 && !content.includes('@')) return NO_MENTIONS;
```

Reste à savoir ce que `content` porte au moment où la passerelle le lit. Le
client web décide cela DOUZE fichiers plus tôt, dans `sendMessage` :

```ts
if (encryptionMode === 'e2ee') messageData.content = '[Encrypted]';
```

| mode de la conversation | `content` sur le fil | liste explicite | mentions obtenues |
|---|---|---|---|
| clair | `coucou @alice` | strippée | extraites — **rien n'est perdu** |
| `server` | `coucou @alice` | strippée | extraites — rien n'est perdu |
| `hybrid` | `coucou @alice` | strippée | extraites — rien n'est perdu |
| **`e2ee`** | **`[Encrypted]`** | **strippée** | **AUCUNE** |

En `e2ee`, il n'y a plus un seul `@` à extraire. La liste explicite est le SEUL
canal qui rattache le message à ceux qu'il nomme — et c'est exactement celui que
le schéma retirait.

**Nommer quelqu'un dans une conversation chiffrée ne produisait rien** : aucune
ligne `Mention` (donc rien dans l'inbox `/mentions`), aucun `validatedMentions`
(le web surligne depuis ce champ — le nom restait du texte brut), aucune
notification. Le compositeur, lui, affichait la pastille du mentionné : côté
expéditeur, l'envoi avait tout l'air d'avoir marché.

> **Un repli n'est une garantie que là où sa précondition tient.** Celle-ci
> tombait précisément sur le mode où le canal principal était coupé. Ce n'est pas
> une exception rare au repli : c'est le seul cas où le repli était le dernier
> recours, et c'est le seul où il ne pouvait rien.

## 3. Pourquoi le cycle 110 ne pouvait pas le voir, et ce que ça apprend

Il a instruit `mentionedUserIds` **en tant que champ**, sur la seule question
« existe-t-il un autre chemin par lequel cette donnée arrive ? ». La réponse était
oui, et elle est juste.

La question qui manquait n'est pas sur le champ, elle est sur le CROISEMENT :
*« cet autre chemin, dans quel état est-il quand celui-ci est coupé ? »* Or les
deux chemins ne sont pas indépendants — ils lisent la **même** variable
`content`, et le mode `e2ee` la vide pour les deux à la fois.

> **Deux canaux qui lisent la même source ne sont pas deux canaux.** Une
> redondance ne se mesure pas à ce qu'elle porte, mais à ce qui la fait tomber :
> deux voies qui échouent sur la même cause n'en font qu'une.

C'est la faute de méthode du cycle 107 (« un suivi hérité est une AFFIRMATION »)
retrouvée par l'autre bout : **une mesure PUBLIÉE est une affirmation elle
aussi**, et elle se relit avec le même soupçon qu'un suivi. Celle-ci était
publiée sous le titre « MESURÉ CORRECT » — ce qui, plus qu'un suivi ordinaire,
décourage d'y revenir.

## 4. Le geste : une déclaration, lue par les TROIS transports

Recopier `mentionedUserIds: z.array(z.string()).optional()` dans les deux schémas
socket aurait rétabli les mentions et laissé trois déclarations à faire diverger.
`validation/mention-list.ts` porte donc les deux pièces, et REST comme les deux
chemins socket les LISENT :

- `MENTIONED_USER_IDS_SHAPE` — la forme de fil, `z.string()` et non `mongoId`,
  parce que c'est ce que `POST /messages` accepte et que l'objet de l'unité est
  que les trois portes acceptent la même chose ;
- `MAX_MENTIONS_PER_MESSAGE` — le plafond, jusque-là champ privé de
  `MentionService`.

Les deux handlers socket transmettent `validated.mentionedUserIds` ; la route
REST a perdu sa ligne manuscrite au profit de l'unité.

## 5. Le plafond appartenait à la RÉSOLUTION, pas au transport

L'extraction depuis le contenu tronque à cinquante depuis toujours, sur ses deux
sites. **La liste explicite n'était bornée nulle part.** L'écart était sans
conséquence tant qu'elle n'était honorée que par REST ; déclarer le champ sur le
transport qui porte le trafic aurait ouvert une entrée non bornée de plus, sur le
chemin le plus fréquenté du produit.

Le plafond est donc posé au point où les deux sources CONVERGENT
(`computeValidatedMentions`), et non dans les schémas :

- dans un schéma, `.max(50)` **REJETTE** l'envoi ;
- à la convergence, il **TRONQUE** — ce que l'extraction fait déjà.

Deux sources qui décrivent la même intention doivent subir la même règle **et le
même comportement**. Un message ne doit pas échouer pour avoir nommé trop de
monde là où l'autre chemin se contente d'en retenir cinquante.

Ce qui a été mesuré et n'a PAS motivé d'urgence : l'entrée non bornée n'était pas
un vecteur d'abus. `validateMentionPermissions` filtre contre l'effectif réel de
la conversation avant toute requête Prisma sur ces ids, et les notifications ont
leur propre limiteur par paire. C'était un coût CPU, pas une porte. On le ferme
parce qu'on ouvrait à côté, pas parce qu'il brûlait.

## 6. Le suivi du cycle 110 : la porte de SORTIE

Second volet du lot, et c'était le suivi « Neuf » n°1 du cycle 110 :

> la charge d'envoi du WEB est un `Record<string, unknown>`, avec deux
> `as unknown as` au moment d'émettre. C'est la porte de SORTIE jumelle de celle
> qu'on vient de fermer côté entrée.

Le cycle 110 avait raison sur le diagnostic ET sur l'ordre : cette porte ne
pouvait pas se fermer avant lui, parce que le contrat était **faux** — il ne
déclarait ni l'enveloppe ni les dix champs que la passerelle honore. La typer
plus tôt aurait produit des erreurs qu'on aurait fait taire par des casts.

La cause du `Record<string, unknown>` n'était pas le typage : c'était la
**construction par MUTATION**. La charge naissait, puis le chiffrement lui
ajoutait des champs, puis les pièces jointes. Aucun type ne décrit un objet qui
n'existe pas encore entièrement.

Trois gestes, dans cet ordre :

1. **`resolveOutgoingEncryption`** rend l'enveloppe comme une VALEUR (`null` si la
   conversation n'est pas chiffrée). Le remplacement de `content` par
   `[Encrypted]` y vit aussi — c'est une décision de chiffrement, pas une
   décision d'envoi.
2. **La charge devient un littéral unique**, déclaré contre le contrat.
3. **L'émission redescend à l'appelant**, en deux branches monomorphes portant
   chacune un nom d'événement LITTÉRAL. `emitWithTimeout` ne connaît plus ni le
   nom ni la charge : elle ne sait que poser une échéance et normaliser l'accusé.

Les deux `as unknown as` ont disparu — pas contournés, **rendus inutiles**.

### Portée exacte de la garde, pour qu'on n'en attende pas plus

Écrite dans le code, parce qu'une porte annoncée plus stricte qu'elle n'est vaut
moins que pas de porte (cycle 107) :

| à travers les spreads conditionnels de la charge | verdict |
|---|---|
| champ requis ABSENT | refusé |
| champ déclaré du MAUVAIS TYPE | refusé |
| champ EXCÉDENTAIRE | **silence** (cycle 106) |

Le contrôle des propriétés excédentaires ne s'applique qu'aux clés écrites
DIRECTEMENT dans le littéral. Ce sont celles-là qui portent le contrat.

## 7. Ce que la porte a fait tomber à la première compilation

Trois erreurs, trois déclarations manquantes qu'aucune relecture n'avait
nommées — le cycle 110 avait prévenu que ce serait le cas.

### 7.1 `SendMessageRequest` ne déclarait pas `mentionedUserIds`

Le contrat REST des clients. Troisième site du même champ : la route l'accepte et
l'honore, aucun client typé ne pouvait le poser.

### 7.2 Et le repli REST du web ne l'envoyait pas

Conséquence directe : un message parti par REST après un accusé socket en échec
ne notifiait que ceux que l'extraction des `@` retrouvait. **Même défaut que
celui du lot, sur le chemin de secours de ce même envoi** — et il n'aurait pas
été trouvé sans typer la porte, parce que rien ne relie visuellement les deux
sites.

### 7.3 `EncryptionMetadata` était une `interface`, donc inexprimable

```
Type 'EncryptionMetadata' is not assignable to 'Readonly<Record<string, unknown>>'
```

Une **interface** n'a pas de signature d'index implicite : elle n'est assignable à
aucune carte ouverte. Or le contrat de fil déclare la métadonnée en
`Readonly<Record<string, unknown>>` — délibérément, parce que les trois clients y
posent des formes différentes et que la passerelle la range en JSON opaque.

Tant que ce type était une interface, **aucun émetteur typé ne pouvait remplir ce
champ**. C'est ce qui rendait le cast du web inévitable ; et le cast, à son tour,
empêchait de le remarquer. Passé en alias de type — ce que la règle de style du
dépôt demandait déjà (`type` pour une donnée, `interface` pour un contrat de
comportement).

> **Un cast sur un objet de contrat NOMME la déclaration qui manque** (cycle 96).
> Trois fois dans ce lot, et la troisième était dans le paquet PARTAGÉ, à deux
> fichiers du contrat qu'elle empêchait de satisfaire.

## 8. `messageType` : un champ posé, juste, et sans destinataire

La charge socket portait `messageType` quand il y avait des pièces jointes, sous
ce commentaire :

```ts
// Elle reste posée — et posée JUSTE — parce que l'objet sert aussi de charge
// au repli REST, où elle est, elle, autoritative (cf. `sendMessageViaRest`).
```

`MessageSendWithAttachmentsData` ne déclare aucun champ de ce nom, et
`SocketMessageSendWithAttachmentsSchema` le STRIPPE. Le motif invoqué justifiait
donc, seul, de continuer à le poser. Il est **faux** : `sendMessageViaRest`
RECONSTRUIT sa charge depuis `options` et recalcule `messageType` lui-même. Les
deux objets ne se touchent jamais.

Rien n'était perdu — le serveur dérive la même règle de son côté. Mais **huit
témoins attestaient une clé que la passerelle ne reçoit jamais**, et le
commentaire qui les couvrait décrivait un couplage inexistant.

Les huit visent désormais le repli REST, seul site où la valeur est autoritative
(la route l'accepte et la persiste ; la dérivation serveur, additive, ne repasse
jamais derrière une déclaration explicite) — c'est-à-dire le seul dont un
changement casse quelque chose. Un neuvième, en négatif, gèle l'absence de la clé
sur la charge socket.

> **Un commentaire qui justifie de GARDER quelque chose est une affirmation, au
> même titre qu'un compte (cycle 93) ou qu'un tri (cycle 86 bis).** Celui-ci
> tenait en vie le seul champ de la charge que le typage refuserait, et le
> tenait au nom d'un couplage qu'il suffisait d'ouvrir pour ne pas trouver.

## 9. Ce qui a été mesuré et n'est PAS un défaut

- **iOS et Android n'émettent aucune liste explicite.** Le grep est vide sur les
  deux. Ils dépendent donc entièrement de l'extraction — ce qui est correct pour
  eux tant qu'ils n'envoient pas en `e2ee` avec un contenu remplacé. La perte
  mesurée ici est web-seule, et le contrat désormais déclaré leur ouvre le champ
  s'ils en ont besoin.
- **`validateMentionCount`** (`middleware/rate-limiter.ts`) n'a **aucun
  appelant**, et ne compte de toute façon que les `@` du contenu. Code mort ; il
  n'entre pas dans ce lot, mais il ne doit pas se lire comme la garde du plafond.
- **La liste explicite ne contourne aucune permission** :
  `validateMentionPermissions` filtre contre l'effectif de la conversation, quel
  que soit le canal par lequel les ids sont arrivés.

## 10. Mesures

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| `tsc --noEmit` `packages/shared` | **0 erreur** |
| Cliquet de dette de types `apps/web` | **1196 — inchangé** |
| `SendDoorRatchet` sous mutation (champ retiré d'un seul schéma) | **TS2344**, en nommant la ligne |
| Témoins de schéma (8) | nés **ROUGES** (6/8 en échec avant le correctif) |
| Témoins de handler (3) | nés **ROUGES** sous retrait de la propagation |
| Témoin de repli REST (web) | né **ROUGE** |
| Suite `apps/web` | **758/758 suites, 14 039 témoins** |
| Suite passerelle (complète) | *cf. §12* |

## 11. Ce que ce cycle apprend

> **Une mesure PUBLIÉE est une affirmation.** Le §8 du cycle 110 s'intitulait
> « Ce qui a été MESURÉ CORRECT », et chacune de ses phrases était vraie. C'est
> la CONCLUSION qui manquait une condition — et le titre, plus qu'un suivi
> ordinaire, décourageait d'y revenir. Un inventaire de non-défauts se relit avec
> le même soupçon qu'un inventaire de suivis.

> **Deux canaux qui lisent la même variable ne sont pas deux canaux.** La
> redondance ne se mesure pas à ce que chacun porte, mais à ce qui les fait
> tomber. Ici les deux lisaient `content`, et un seul mode le vidait pour les
> deux.

> **Un repli masque sa propre panne partout sauf là où il compte.** Trois modes
> sur quatre n'avaient aucun besoin de lui et le rendaient invisible ; le
> quatrième en dépendait entièrement et n'en recevait rien. C'est la forme
> normale d'un repli mal conditionné — il n'est jamais silencieux là où on le
> teste.

> **Un lot qui ferme une porte d'ENTRÉE doit être suivi de celui qui ferme la
> SORTIE, et pas l'inverse.** Typer l'émetteur web avant le cycle 110 aurait
> produit des erreurs sur un contrat FAUX, qu'on aurait fait taire par des casts.
> L'ordre n'était pas une commodité de planification : le contrat devait d'abord
> dire vrai.

> **Un `Record<string, unknown>` de charge est un symptôme de CONSTRUCTION, pas
> de typage.** Tant que l'objet se complétait par mutation, aucun type ne pouvait
> le décrire — et le corriger commence par rendre la construction immuable, pas
> par écrire une annotation.

## 12. Suivis

- [ ] **Neuf** — les autres familles `ClientToServerEvents` du web émettent
      encore hors contrat par endroits. La famille ENVOI est fermée aux deux
      bouts ; l'inventaire des autres reste à faire, et il n'est plus bloqué par
      un contrat faux.
- [ ] Hérité (110) — les autres familles `ClientToServerEvents` n'ont pas leur
      `SendDoorRatchet`. L'égalité de jeux de clés est mécanique et se généralise.
- [ ] Hérité (110) — `import/first` n'est pas activé. Un import posé sous une
      instruction de niveau module qui le lit compile, passe le type-check
      bloquant de la CI, et refuse de se charger.
- [ ] Hérité (109) — les 11 portes d'accusé manuscrites gelées, mesurées
      non-divergentes.
- [ ] Hérité (109) — le REST `DELETE /reactions/:id/:emoji` sert encore une
      phrase anglaise non localisée sur le fil.
- [ ] Hérité (106) — la LECTURE depuis Redis reste non validée à l'exécution.
- [ ] **Neuf** — `validateMentionCount` (`middleware/rate-limiter.ts`) est du
      code mort sans appelant, et se lit comme la garde du plafond de mentions
      alors qu'il ne garde rien. À retirer dans un lot d'hygiène.
