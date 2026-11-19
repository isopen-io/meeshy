# Cycle 181 — la carte des clés partait vide, et la réparer en place l'aurait rendue illimitée

*2026-11-19, à la suite du cycle 180 (#19690, fusionné dans `dev` par `6fde25b36`).
Branche `claude/exciting-planck-w7ci6z`. Instruit **#19755**, relevé par l'audit
adversarial du cycle 180 comme constat G — « une SECONDE graphie, et son
exemplaire vivant », vérifié ligne à ligne et ouvert hors périmètre.*

---

## Pourquoi celui-là

Les suivis du cycle 180 étaient #19677 (199 lookups), #19739 (une mesure contre
`mongo:8`, qui demande une base), #19748 (le tri des 126 égalités nues, un lot
par colonne), #19754 (le gate d'« Ensemble » ne journalise rien), #19755, et les
cinq constats d'audit non absorbés (#19756–#19760).

#19755 les surclasse sur le même critère que #19690 au cycle précédent : c'est un
défaut **mesuré**, qui porte sur la population entière, dans le coffre de clés —
donc crypto, donc `auditeur-adversarial` avant fusion (#9226).

## Ce que l'issue demandait d'instruire AVANT de corriger, et la réponse

L'issue posait trois questions, et disait que la première décide de la gravité :
**« que fait le service d'une carte vide ? »** Réponse, mesurée en lisant les
consommateurs un par un :

| question | réponse mesurée |
|---|---|
| la carte est-elle une autorité de LECTURE ? | **non** — un chiffré voyage avec son `keyId` (`encryptionMetadata.keyId`) et s'ouvre par sa LIGNE (`loadKey`, `getKeyFor`, dont le contrôle d'appartenance lit `conversationId` ou la désignation). Rien n'est devenu illisible. |
| qui la lit ? | **un seul site** : le chemin rapide de `getOrCreateConversationKey`. Sur un manque, il **forge et persiste une clé NEUVE** (`generateKey` + `setConversationKey`, qui n'écrit pas la désignation). |
| quelles conversations le paient ? | celles dont `Conversation.serverEncryptionKeyId` est **nul** — les trois chemins d'écriture de message passent la désignation en `preferredKeyId` et court-circuitent la carte. Restent l'ACTIVATION sans désignation, les conversations d'avant #11381, celles que `obsolete-conversation-purge` a détachées (`serverEncryptionKeyId: null`), et les deux chemins `encryptMessage` / `encryptHybridServerLayer`. |
| combien de lignes en base ? | **non mesurable d'ici** (pas de base dans ce conteneur). L'effet est donc une possibilité documentée dans son AMPLEUR, pas dans son existence. |

**Verdict : un cache froid ET une prolifération, jamais une perte.** Une ligne
`ServerEncryptionKey` de plus par processus et par démarrage pour ces
conversations, indéfiniment, avec leur historique éparpillé sur autant de clés.
Et le journal l'annonçait à voix haute à chaque démarrage —
`conversationKeysLoaded: 0` — sans que personne ne le lise comme une anomalie.

## Le défaut

`ServerKeyVault.initialize()` :

```ts
where: { purpose: 'conversation', expiresAt: { equals: null } }  // « Non-expired keys »
```

`{ equals: null }` est une ÉGALITÉ : elle n'apparie pas un document dont la clé
est ABSENTE. Et **aucun des deux créateurs n'écrit `expiresAt`** —
`ServerKeyVault.generateKey` (huit colonnes, pas celle-là) et
`AttachmentEncryptionService.generateKey` (même forme). `existingKeys` était donc
TOUJOURS vide.

## Ce qui rend ce lot instructif : la forme juste n'était pas `unsetOrNull`

Le correctif de forme était évident, et il est **faux**. Réparer le filtre en
place rend le balayage de démarrage EFFICACE : il lit alors **chaque** clé de
conversation de la base pour les tenir toutes dans une `Map` **sans borne ni
éviction** — un plein scan au premier chiffrement, et une rétention
proportionnelle au nombre de conversations, là où `keyCache` (500) et
`designationCache` (2 000) sont bornés. C'est la dimension 3 (« que reste-t-il en
mémoire une fois l'écran quitté ? ») et la contrainte #9232 (« rien ne doit
empêcher de monter vite à 100 000 »).

> **Un filtre faux peut CACHER le coût de la requête qu'il porte.** Tant qu'il
> ne rendait rien, le balayage non borné était gratuit, donc invisible : personne
> n'a jamais vu cette `Map` grandir. Réparer la lecture aurait livré le défaut de
> mémoire le jour même, dans un lot qui parlait d'autre chose — et il aurait eu
> l'air d'une régression de performance sans cause. **Avant de réparer un filtre
> inerte, lire la requête comme si elle rendait tout : c'est ce qu'elle va faire.**

La carte étant un CACHE dont le manque se remplit en UNE lecture, elle devient
read-through et BORNÉE (2 000, la discipline déjà nommée pour les désignations),
et le démarrage ne lit plus rien. La lecture est de plus **plus juste que
l'ancienne sur deux points que le balayage ne regardait pas** :

- `isActive: true` — l'ancien balayage chargeait les clés qu'`AttachmentEncryptionService.deleteKey`
  avait ÉTEINTES, et les aurait servies pour sceller du neuf. L'égalité est nue
  **par décision** : Prisma écrit son `@default(true)` à chaque création, et son
  absence éventuelle ÉCARTE la ligne — le sens de l'erreur est celui qui ne
  réutilise jamais une clé retirée ;
- `orderBy: { createdAt: 'desc' }` — DÉTERMINISTE, pour que deux instances
  s'accordent sur la même clé là où la prolifération d'avant ce lot en a laissé
  plusieurs.

## Fail-OUVERT, et c'est un arbitrage, pas un défaut de garde

La lecture rend `undefined` quand elle échoue, donc l'appelant forge une clé
neuve. Fermer ici (`SERVER_AT_REST_UNAVAILABLE`) **refuserait un envoi que la
production accepte aujourd'hui** — la carte étant vide à chaque fois, le chemin
d'avant forgeait déjà. Et l'ouverture coûte au plus une clé de plus, puisqu'un
chiffré s'ouvre par sa ligne. C'est l'arbitrage du cycle 127 : fail-CLOSED sur
une PREUVE, fail-OUVERT sur une absence de preuve — ici une livraison, pas un
secret. Rétrocompatibilité (#9223) : aucun refus nouveau.

**`try`/`catch` et non `.catch`**, et ce n'est pas un détail de style : un client
qui n'expose pas la méthode jette **SYNCHRONEMENT**, et une promesse jamais
construite ne porte aucun `.catch`. Les deux formes d'échec sont disjointes — la
règle que le dépôt écrit déjà pour `void p` (§ Critical Gotchas), prise par
l'autre bout. Ce n'était pas hypothétique : un double PARTIEL de la table des
clés (`earlyDedupAtRest`) l'a produit au premier passage de la suite complète.

## Les témoins, et les deux qui ne pouvaient pas tomber

`serverKeyVaultConversationKeyLookup.test.ts`, **10 témoins**, dont la paire qui
dit la leçon du cycle 180 sur la MÊME base de code :

| forme de la ligne | avant le correctif |
|---|---|
| aucune colonne `expiresAt` — ce que PRODUCTION crée | **ROUGE** |
| `expiresAt: null` explicite — ce qu'une fixture écrit | **VERT** |

Les deux témoins sont dans le fichier, côte à côte, pour que la seconde ligne ne
se relise jamais comme une garde.

**Chaque clause du filtre est prouvée par mutation** : filtre nu (égalité +
`isActive` ignoré) ⇒ 3 rouges ; sans `isActive` ⇒ la clé éteinte est servie ;
sans le prédicat d'absence ⇒ la clé expirée est servie ; sans la borne de
conversation ⇒ la clé voisine est servie ; sans `orderBy` ⇒ les deux instances
divergent ; carte non bornée ⇒ 2 600 entrées retenues.

Et **trois doubles de la table des clés ont été réparés** : leur `findMany`
n'appariait que `purpose`, donc il rendait ses lignes quel que soit le filtre —
ils ne POUVAIENT pas voir ce défaut, et l'un d'eux servait la clé d'une AUTRE
conversation sans broncher (`HybridEncryption` « should use different keys for
different conversations » passait pour cette seule raison). Ils évaluent
désormais le `where` contre des documents (`matchesMongoWhere`).

**Deux témoins ont changé de MOMENT, pas de valeur** : « charge la carte au
démarrage » devient « retrouve la clé à la demande », et « le démarrage échoue si
la base est injoignable » devient « le démarrage ne lit plus rien, et une lecture
en échec n'empêche pas de sceller ». Chacun porte sa raison écrite.

## Le cliquet : une limite ÉCRITE protège le site qu'elle cache

Le cliquet du cycle 180 portait deux colonnes. Il en porte trois, et le tri de
`expiresAt` (#19748) a rendu : **7 sites, un seul nu** — celui du coffre. Cinq
disaient déjà l'absence. Le septième est **gelé avec sa discipline d'écriture
mesurée**, et c'est la première absolution que ce cliquet accorde :

> `Notification.expiresAt` a **un** créateur (l'unique `prisma.notification.create`
> du dépôt) et il écrit TOUJOURS la colonne (`params.expiresAt || null`) ; aucun
> script n'en crée. La forme à DEUX branches est de plus **mesurée** —
> `scripts/migrations/mongodb/010_notification_expiry_index.js` et
> `@@index([userId, isRead, expiresAt])` existent pour que ses deux branches
> soient des intervalles d'index, `emitCountsUpdate` tournant à CHAQUE
> notification créée. Y ajouter une troisième branche toucherait un chemin chaud
> pour couvrir les seules lignes ANTÉRIEURES à la colonne, qu'aucun chemin vivant
> ne crée : la forme ATTESTÉE gagne (cycle 180, constat I).

Un témoin de plus garde l'absolution elle-même : **une discipline gelée qui ne
décrit plus aucun site nu est à retirer** — sinon elle couvre le site suivant.

### Et c'est l'extension du balayage qui a trouvé ce septième site

Le cliquet du cycle 180 nommait sa limite : « il ne voit pas les fragments de
`where` nommés ailleurs puis répandus ». Elle lui cachait exactement un site, et
c'était le prédicat partagé des **sept** lectures de notifications. Une
annotation `Prisma.<Modèle>WhereInput` — type de retour d'une fonction, ou type
d'une constante — déclare un `where` aussi sûrement que la clé littérale, et
ouvre désormais un cadre de lecture.

> **Une limite qu'on ÉCRIT au lieu de la mesurer protège le site qu'elle
> cache.** Elle est honnête, elle est vraie, et elle est incapable de rougir :
> elle se relit comme une frontière du problème plutôt que comme du travail à
> faire. Même famille que « zéro trouvé n'est pas zéro existe » (leçon 261), avec
> le tour de plus que la limite était PUBLIÉE — ce qui la rendait rassurante.

**Corollaire qui s'est appliqué à ce lot même, et il est tombé dessus :** le
correctif extrait son filtre dans une constante (`WRITABLE_CONVERSATION_KEY`), et
la première mutation de contrôle a montré que **le cliquet ne le voyait plus** —
une constante sans annotation n'est pas un `where`. Un lot qui répare une égalité
nue en la DÉPLAÇANT sort du champ de sa propre garde. La constante est annotée, et
la mutation la NOMME (`services/ServerKeyVault.ts:50#expiresAt (equals)`).

## Preuve

- `serverKeyVaultConversationKeyLookup.test.ts` : **10 verts**, RED prouvé par
  **six** mutations (une par clause du filtre, plus la borne de la carte) ;
- le cliquet : **13 verts** (10 fixtures d'instrument + 3 inventaires), RED prouvé
  par mutation dans les deux sens — filtre nu réintroduit ⇒ il NOMME le site ;
  absolution périmée ajoutée ⇒ il la refuse ;
- trois doubles de la table des clés réparés ; un double PARTIEL complété ;
- `tsc --noEmit` **vert** sur `services/gateway` ;
- suite gateway complète : voir le commentaire de clôture de #19755.

## Ce qui reste, et ce qui n'a pas été mesuré

- **`deletedAt` : 92 sites, 91 nus.** C'est le gros de #19748, et il ne se gèle
  pas d'un bloc — `LIVE_MESSAGE_MARK` est une discipline d'écriture NOMMÉE pour
  `Message.deletedAt`, à prouver site de création par site de création, et les
  autres modèles n'en ont aucune de nommée. La méthode est désormais outillée :
  le cliquet accepte une absolution, à condition qu'elle soit mesurée et qu'elle
  décrive un site qui existe.
- **Aucun comportement contre un vrai MongoDB 8** : pas de base ici, pas
  d'intégration DB dans la CI de la passerelle. En particulier, `isSet: false`
  dans un `findMany` + `orderBy` + `take` n'est pas mesuré contre le moteur —
  c'est #19739, et la forme employée est celle que le dépôt porte déjà à cinq
  endroits pour la même colonne (forme attestée, cycle 180 constat I).
- **La distribution réelle en production** : combien de lignes
  `ServerEncryptionKey` existent, combien par conversation, combien de
  conversations sans désignation. La prolifération est donc décrite dans son
  mécanisme, pas dans son ampleur.
- **La prolifération déjà en base n'est pas nettoyée.** Ce lot l'arrête ; il ne
  purge rien. `obsolete-conversation-purge` ne retire les clés que d'une
  conversation obsolète.

---

## L'audit adversarial a rendu BLOQUANT, et il avait raison sur six points

Le lot est passé par `auditeur-adversarial` avant fusion (#9226 : coffre de clés).
Verdict **BLOQUANT** — et pas sur le changement de production, jugé sain, mais sur
**le CLIQUET que le lot livrait comme sa preuve**. C'est la forme du cycle 180
rejouée un niveau plus haut, et elle mérite d'être dite ainsi :

> **Un lot dont la preuve est un cliquet doit auditer le cliquet comme il auditerait
> la production.** Le mien bénissait une forme fausse et sa couverture du site
> réparé tenait à une ligne d'annotation — deux défauts que le `tsc` et les
> témoins laissaient passer, parce qu'ils sont dans l'INSTRUMENT.

### Constat A — le cliquet bénissait l'absence NIÉE

`OR: [{ champ: null }, { NOT: { champ: { isSet: false } } }]` rendait
`absenceSaidInSameOr: true`. Or la seconde branche dit « la clé EST posée » :
l'union « nulle OU posée » exclut exactement les documents absents — #19690
réinstallé, **certifié correct par le cliquet censé l'interdire**.

Le cycle 180 avait déjà corrigé ce cliquet pour la même raison (constat F : il
cherchait `isSet: false` n'importe où dans le bloc, donc bénissait la conjonction
impossible). Son correctif a remonté le test du bloc au seul tableau `OR` **sans
changer sa nature** : c'était toujours une expression régulière sur du TEXTE.

> **Un cliquet qui cherche la forme JUSTE par ses MOTS finit par bénir sa
> négation.** Le texte était le bon ; c'est la POLARITÉ qui change le sens, et
> aucune recherche textuelle ne la voit. La correction n'est pas une regex plus
> fine — c'en était déjà une plus fine — c'est de chercher une STRUCTURE : une
> BRANCHE de premier niveau du même tableau `OR` qui est EXACTEMENT le prédicat
> d'absence. Toute enveloppe (`NOT`, une seconde condition dans la branche) n'est
> plus l'alternative que `unsetOrNull` compose, et n'est plus reconnue.

Deux fixtures le gardent : l'absence niée, et l'absence dite dans la MÊME branche.

### Constat B — la protection du site réparé tenait à une ANNOTATION, et l'audit l'a mesuré de bout en bout

Le lot avait annoté `WRITABLE_CONVERSATION_KEY` précisément pour rester dans le
champ de son cliquet, et l'avait écrit en commentaire. L'audit a fait l'expérience
complète : **annotation retirée ET égalité nue réinstallée** ⇒ `tsc --noEmit`
**EXIT=0** (l'annotation n'est pas portante : le spread reste assignable) et
cliquet **VERT**. Le défaut que ce lot répare revenait au prix d'une ligne
d'annotation redondante supprimée — ce qu'un lot de nettoyage propose de lui-même.

Trois formes ordinaires étaient de plus invisibles, chacune reproduite : type
INFÉRÉ, ALIAS de type local, `satisfies`.

> **Une règle qui dépend d'une annotation garde ce que personne n'a encore
> simplifié.** Le balayage reconnaît donc un `where` par TROIS voies, et la
> troisième ne demande rien au type : **une constante RÉPANDUE dans un `where`
> EST un `where`**. C'est la propriété, là où l'annotation n'en était qu'un
> indice.

Mesure après correction, sur la même expérience : `tsc` toujours EXIT=0, et le
cliquet **NOMME** `services/ServerKeyVault.ts:49#expiresAt (equals)`.

**Et un fragment PARTAGÉ se résout sur le CORPUS, pas sur son fichier** : un
`where` défini ici et répandu trois répertoires plus loin n'était gardé que chez
celui qui le répand. Le balayage fait donc deux tours — relever les identifiants
répandus sous un `where` partout, puis rejouer chaque fichier avec cet ensemble.
Effet mesuré : **25 → 30 sites vus**, et l'angle mort publié tombe de **149 à 8**.
Le prix assumé est une collision de noms, qui ne peut produire qu'un FAUX POSITIF
— la direction sûre pour un cliquet, et l'inventaire des sites nus étant vide,
aucune n'est vivante.

### Constat C — l'absolution était par FICHIER, donc elle couvrait le site SUIVANT

Reproduit : une SECONDE égalité nue ajoutée dans le fichier absous laissait le
cliquet **vert**. Le témoin « aucune discipline gelée ne couvre un site qui
n'existe plus » vérifie qu'elle couvre ENCORE un site ; il ne peut pas voir
qu'elle en couvre désormais deux. Or la mesure qui la justifie décrit UNE lecture.

L'absolution porte donc son **COMPTE** (`{ sites: 1, raison }`), et un témoin
compare le compte mesuré au compte gelé. Un numéro de ligne dériverait à la
première édition ; un compte, non.

### Constat D — `isActive: true` nu : l'affirmation était juste et la justification fausse

L'audit a refusé « Prisma écrit son `@default(true)` à chaque création » : non
mesurée (aucune base ici), et **CUITE DANS LA FIXTURE** — `nominalKey()` posait la
colonne à la main, donc aucun témoin de la suite ne pouvait la falsifier. C'était
le défaut du lot reproduit sur la colonne voisine.

La correction n'était pas de changer le prédicat mais de trouver **la mesure qui
le fonde**, et elle est venue du compilateur en une ligne :
`differsOrUnset('isActive', false)` **ne compile pas** —
`TS2322: Type '{ isSet: false }' is not assignable to type 'boolean | BoolFilter'`.

> **Prisma n'expose `isSet` que sur les colonnes OPTIONNELLES.** `isActive` est
> `Boolean @default(true)`, REQUISE, à la différence d'`expiresAt` et de
> `conversationId` : le piège que ce lot répare **n'existe pas** sur elle, et
> c'est le compilateur qui le dit. Deux témoins l'épinglent — l'un prouve que le
> prédicat d'absence compile sur `expiresAt` (donc le piège y est), l'autre qu'il
> ne compile PAS sur `isActive` (`@ts-expect-error`). Le jour où la colonne
> passerait `Boolean?`, le second témoin tombe — c'est-à-dire exactement le moment
> où l'égalité nue deviendrait un défaut.

Ce que le filtre achète est en revanche **DORMANT**, et le lot le dit maintenant :
`isActive: false` n'est écrit que par `deleteKey` et `cleanupExpiredKeys`, dont
**aucun appelant de production n'existe** (la purge, elle, supprime les lignes).

### Constat E — le `catch` fail-ouvert absorbait aussi la question MAL POSÉE

`ServerEncryptionKey.conversationId` est un `@db.ObjectId` : un identifiant qui
n'en a pas la forme fait rendre `Malformed ObjectID`, que le `catch` traduisait en
« pas de clé » — donc **une clé forgée et persistée à CHAQUE appel**, avec pour
seule trace un `warn` indistinct d'une panne de base. Le dépôt porte déjà la règle
(« un `catch` fail-open couvre aussi la question qu'on a mal posée », cycle 112)
et l'outil (`isAddressableConversationId`). La garde va donc **AVANT** l'appel,
avec sa propre raison journalisée : les deux refus ne s'arbitrent pas pareil, donc
ils ne se journalisent pas ensemble.

Mesuré : aucun appelant vivant ne passe autre chose que `conversation.id`. Piège
armé, pas panne — mais c'est le piège dont ce lot est la sixième occurrence.

### Constat G — « deux instances s'accordent » était surévalué

`orderBy: { createdAt: 'desc' }` n'avait **pas de clé secondaire**, et
`createdAt: new Date()` est à la milliseconde. Or l'égalité est le cas RÉALISTE :
`keyGenerationLocks` est **par processus**, il n'existe aucun verrou
inter-instances, donc deux instances qui forgent la première clé d'une
conversation le font dans la même milliseconde. L'ordre est désormais TOTAL
(`createdAt`, puis `id`, un UUID), avec son témoin sur deux clés du même instant.

Et la phrase est bornée à ce qu'elle garde : l'accord vaut **sur un défaut de
cache**. Une fois chaque instance servie par sa carte, qu'aucun chemin
n'invalide, deux processus peuvent sceller sous deux clés différentes — ce qui ne
perd rien (les deux lignes portent leur `conversationId`) mais n'est pas de la
cohérence. C'est écrit au site, et c'est #19787.

### Constat H — le prédicat dit « aucune échéance », pas « non expirée »

`unsetOrNull('expiresAt')` écarte aussi une clé dont l'échéance est à VENIR. C'est
délibéré — **un chemin d'ÉCRITURE a le droit d'être plus strict que son chemin de
LECTURE** (on peut ouvrir un chiffré sous une clé qui expire bientôt, on ne doit
pas en sceller un neuf dessous) — mais le témoin portait une échéance PASSÉE,
donc il n'attestait rien de l'intention. Il en porte une FUTURE.

### Les trois témoins qui manquaient (constat K)

1. **La concurrence.** Le lot déplace un `await` DEVANT le verrou de génération.
   La TOCTOU n'est pas rouverte (le check-and-set qui suit reste synchrone), et
   l'audit l'a mesuré — mais rien ne l'attestait, et le symptôme d'une inversion
   serait une prolifération silencieuse, c'est-à-dire le défaut même du lot. Dix
   appels concurrents sur une base vide ⇒ **une** clé.
2. **La désignation.** `world(rows, designation)` prenait un paramètre
   qu'**aucun témoin ne passait** : la surface vivante de la lecture est pourtant
   « une conversation dont la désignation est NULLE », et rien ne disait que la
   carte n'est pas consultée quand elle en a une. Le témoin le dit, et il borne
   l'effet du lot.
3. **Le mode.** Le coffre n'a **aucune** garde de mode : il rend volontiers la clé
   serveur d'une conversation passée en `e2ee`. Les chemins de scellement vivants
   sont tous gardés par `sealsAtRest` (vérifié), donc rien ne ressuscite cette clé
   aujourd'hui — mais c'est un piège armé à la frontière d'irréversibilité de
   #12949, et c'est **#19788** (`décision-produit` : la garde va-t-elle au coffre
   ou reste-t-elle chez les appelants ?).

### Ce que l'audit a trouvé et que le lot n'absorbe pas

| constat | sort |
|---|---|
| un appelant en attente du verrou PEND indéfiniment quand la génération échoue (reproduit : > 400 ms, jamais réglé) — préexistant, mais le fail-ouvert le rend nominal pendant un incident | **#19786** |
| rien ne fait TOURNER une clé de conversation, et la carte n'est invalidée par aucune suppression (`keyCache` répond 30 min après une purge) ; ce que le lot ÉCHANGE : rayon d'explosion d'une clé porté de « la vie d'un processus » à « toute la conversation, pour toujours » | **#19787** |
| le coffre n'a aucune garde de mode (e2ee) | **#19788** |
| trois déchiffrements sans appelant de production, dont deux SANS contrôle d'appartenance — la surface que #11381 avait fermée ailleurs | **#19789** |

### Ce que l'audit a vérifié SANS rien trouver, qui compte autant

Les dix témoins tombent, mutation par mutation (huit mutations mesurées par
l'audit, six par le lot). La borne FIFO est réelle (`Map.set` sur une clé
existante ne réordonne pas) et le manque se relit. `writableConversationKey`
refuse toujours `unwrap-failed` sans rien remplacer. La lecture est bornée par
`conversationId` et `generateKey` écrit le propriétaire, donc réutiliser une clé
existante n'ouvre aucun accès. Et `setConversationKey`, qui réécrirait
`conversationId` sans condition, n'est jamais appelé qu'avec une clé fraîchement
générée (noté dans #19789).

### Ce que l'audit n'a pas pu vérifier, et qui ne doit pas se lire comme vert

- **que Prisma persiste bien un `@default` dans le document MongoDB** : mesuré
  autrement (la colonne est REQUISE, donc `isSet` n'existe pas dessus), mais pas
  contre `mongo:8` ;
- **que les `@@index` du modèle existent dans la base** — Prisma ne les crée que
  par `db push`, et c'est `@@index([conversationId])` qui rend cette lecture peu
  coûteuse ;
- **la population réelle** : combien de lignes `ServerEncryptionKey`, combien de
  conversations `server`/`hybrid` à désignation nulle (la seule surface vivante du
  correctif), combien de lignes `Notification` antérieures à `expiresAt` ;
- **la graphie `{ champ: { in: [null] } }`**, que le balayage ne voit pas et qui
  n'est pas instruite.

Et le rappel que l'agent pose lui-même : **ceci n'est pas un audit
cryptographique tiers.** Avant toute promotion en production de cette famille de
lots, une revue externe reste requise — clé maîtresse (dérivation, stockage,
rotation : aucune), absence de confidentialité persistante au repos, et le modèle
de menace du mode `hybrid`, où le serveur détient le clair par conception.

---

## Preuve finale, sur l'arbre FUSIONNÉ (`6597a37fe`, `origin/dev` à `56a24345c`)

- `tsc --noEmit` sur `services/gateway` : **EXIT=0** ;
- **suite gateway complète : 2 898 suites vertes sur 2 904, 43 811 témoins verts
  sur 43 829.** Les six rouges sont les suites de codecs d'image — HEIF ×3,
  EXIF ×2, AVIF ×1 —, rouges pour `spawn heif-convert ENOENT` : le binaire n'est
  pas dans ce conteneur. C'est **exactement** la ligne de base que le cycle 180 a
  consignée (mêmes 6 suites, mêmes 17 témoins). **Le lot n'ajoute aucun échec.**
- les deux suites du lot : `serverKeyVaultConversationKeyLookup` **17 verts**,
  `soft-state-equality-filter-guard` **21 verts** ;
- RED prouvé par **neuf** mutations au total : six sur le filtre et la carte
  (filtre nu, sans `isActive`, sans le prédicat d'absence, sans la borne de
  conversation, sans l'ordre, carte non bornée), trois sur les clauses ajoutées
  par l'audit (garde de forme de l'id, départage de l'ordre, échéance future) —
  plus, sur le cliquet, le filtre nu réinstallé **avec son annotation retirée**
  (il NOMME le site là où il restait vert avant l'audit) et une absolution dont le
  compte ne décrit plus le dépôt ;
- les cliquets de taille : `EncryptionService.test.ts` QUITTE la dette (1 044 →
  996, sous le plafond de 1 000) — le fichier était hors budget, donc interdit
  d'addition, et l'extraction est le correctif.

---

## Suite immédiate : #19786, le suivi que ce lot avait rendu NOMINAL

*Fusionné dans `dev` par `0da8f615f`, le cycle continue sur son propre suivi.*

Le constat de l'audit (constat F) était préexistant et je l'avais ouvert plutôt
qu'absorbé. Mais il n'est pas resté théorique : **le fail-ouvert de ce lot en
fait le mode nominal d'un incident de base.** Pendant une panne Mongo, la
relecture rend `undefined` pour toute la salve, le premier appelant prend le
verrou, `create` échoue — et tous les envois concurrents de cette conversation
détenaient une promesse qui ne se réglait jamais.

> **Un lot qui ouvre une vanne hérite de ce qui est en aval.** Le verrou était
> cassé avant ; sa probabilité d'être atteint, non. Ouvrir le suivi était juste ;
> le laisser mûrir un cycle ne l'était pas, parce que c'est MON changement qui
> l'avait rendu atteignable.

La seconde moitié du correctif est celle qui mérite d'être retenue, et elle n'est
pas celle que l'issue décrivait. Donner son `reject` au verrou suffit pour les
ATTENDANTS ; mais la promesse du verrou peut n'avoir **aucun** attendant — c'est
même le cas nominal, un seul appelant — et la rejeter sans écouteur **termine le
process** sous le `--unhandled-rejections=throw` par défaut de Node 22.

Mesuré par mutation, et le verdict est plus net qu'une assertion : sans
`void lockPromise.catch(() => undefined)`, la suite ne rend pas un témoin rouge,
elle rend **`Tests: 0 total`** — le worker jest est MORT avant de pouvoir
rapporter, en tenant le rôle de la passerelle.

> **La règle du dépôt sur `void p` vaut de la promesse qu'on REJETTE comme de
> celle qu'on détache.** Ajouter un chemin de rejet à une promesse partagée crée
> un rejet potentiellement non observé, et le `.catch` de déclaration n'est pas
> une politesse : c'est la moitié du correctif qui empêche le remède d'être pire
> que le mal. Un correctif de robustesse peut introduire une panne PLUS GRAVE que
> celle qu'il répare, et seule une mutation le montre.

## Et `dev` était rouge, d'un rouge qui n'est pas le mien

En rejouant les gardes sur l'arbre fusionné, la règle 3 du budget de taille des
suites a rougi : `calls-routes.test.ts`, **2 154 gelées → 2 175 réelles**. Mesuré
sur un `git archive origin/dev` (arbre propre) : le rouge est sur `dev`,
introduit par `7630c0fc8`, et il est **antérieur à ma fusion comme postérieur à
mon verdict** — mon run était vert quand `dev` était à `e4282f1e`.

La règle vivant dans une suite jest de la passerelle, **toute branche qui
contient `dev` hérite ce rouge** : aucun lot de la passerelle ne peut obtenir de
verdict vert tant qu'il tient. C'est ce qui l'a fait trouver — par un lot sans
aucun rapport.

**Je n'y touche pas**, et c'est la doctrine qui le dit :
`claude/call-system-display-zrz108` est une branche VIVANTE et c'est son fichier.
« Quand deux lots se disputent un fichier, celui qui n'a rien écrit cède »
(#5243). Je cède et je signale : **#19808**, avec la mesure, le commit fautif, et
le correctif attendu (extraire, puis BAISSER la ligne de dette — jamais la
monter, ce serait la marge que le cliquet existe pour refuser).
