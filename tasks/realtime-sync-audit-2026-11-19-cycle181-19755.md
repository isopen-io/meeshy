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
