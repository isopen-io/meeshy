# Cycle 171 — ce qui est GRAVÉ était juste, ce qui est SERVI mentait encore

*2026-11-15. Branche `claude/exciting-planck-x33cmv`. Livré : #18701 — le repli
du statut de livraison cesse d'être une horloge murale. Fusionné dans `dev` par
la PR #18732 (`ec7b34059`).*

> **Le numéro 171 a été pris DEUX FOIS le même jour**, par ce lot et par celui de
> #18616 (`…-cycle171-18616.md`). Les deux fichiers coexistent parce que l'autre
> session a suffixé le sien de son numéro d'issue — la parade que la leçon du
> cycle 170 prescrit après la FUSION silencieuse de deux `…-cycle163.md`. Ce
> fichier porte donc le sien aussi. **Un numéro de cycle n'identifie plus un
> lot** : l'issue, elle, l'identifie toujours.

---

## Le choix du lot, et la vérification que le cycle 170 a léguée

La commande du cycle précédent (`gh api search/issues … is:pr <numéro>`) a servi
avant d'écrire une ligne : #18707 et #18701 apparaissaient dans des PR ouvertes,
#18681 et #18680 nulle part. Lu de près, #18701 n'est pas PRIS — il est CITÉ par
la PR #18704, qui l'a ouvert en retirant son propre `Closes`. C'est la moitié que
cette PR ne ferme pas, et son auteur l'écrit : « rétrécir le gel ne change rien
pour aucun utilisateur tant que #18701 n'est pas traitée ».

**Un numéro qui apparaît dans une PR n'est pas forcément un lot pris.** Il peut y
être nommé comme la dette que la PR assume de laisser. Les deux se distinguent en
ouvrant la PR, pas en lisant le résultat du balayage — et le second cas est
précisément celui où le travail est le plus utile, puisque quelqu'un vient de
prouver qu'il manque.

#18681 (la silhouette d'un message sous plancher) a été écarté : son « Preuve
attendue » commence par « un verdict de produit écrit ». Sans porteur à la barre,
ce lot-là se bâcle ou s'arrête.

## Le défaut

```ts
cursor?.lastDeliveredAt && cursor.lastDeliveredAt >= message.createdAt
```

`lastDeliveredAt` est posé à `now` par `_advanceCursor` : l'heure à laquelle un
accusé a été TRAITÉ. `createdAt` est une POSITION dans un fil. Même type, natures
différentes, et la comparaison est vraie par construction pour tout message
antérieur au traitement.

Scénario qui n'exige **aucune panne** : M1 (10:00) évincé par le `LTRIM` à 500 de
`RedisDeliveryQueue`, M2 (10:05) livré, drain à 11:00. Curseur à 11:00 ⇒
`11:00 >= 10:00` ⇒ **l'auteur de M1 voit ✓✓ pour un message que personne n'a
reçu**. Et `_emitDeliveryForDrainedMessages` pousse `getLatestMessageSummary`
dans `READ_STATUS_UPDATED` douze lignes après avoir refusé d'écrire la ligne : le
drain refuse la livraison, puis annonce la remise, dans le même tour de boucle.

## Ce que l'issue n'avait pas, et qui a décidé la forme

L'issue proposait trois pistes d'ÉCRITURE (préfixe contigu, borne de position,
entrée négative). Aucune n'est le correctif minimal, parce que le défaut n'est pas
dans ce qu'on écrit : **la discipline manquante existait déjà, à côté, sur l'autre
colonne.** `resolveReadAt` a sa bascule depuis le 2026-07-24 — passé
`EXACT_READ_TRACKING_SINCE`, l'absence de gel VEUT DIRE l'absence de lecture. La
livraison ne l'avait pas. Le lot est donc la symétrie, pas une invention :
`resolveCursorDeliveredAt`, un site, la même bascule.

Et la borne de POSITION que l'issue proposait en premier ne suffisait pas : dans
SON propre scénario, le trou est ANTÉRIEUR au dernier message livré, donc sous la
borne. L'issue le dit, en note ; la piste reste ouverte, elle porte sur
l'ÉCRITURE, et elle est consignée.

## La prémisse qui est devenue fausse

Quatre témoins verts tenaient le contraire, et leur bloc l'écrivait :

> « `deliveredAt` conserve son repli curseur : un message récupéré est livré. »

Vrai à sa date — parce que le gel était SUR-INCLUSIF : toute la fenêtre recevait
une entrée, livrée ou non, et le repli ne servait jamais sur un message récent.
**#18614 a rendu le gel juste et, du même geste, a mis le repli en première ligne
sur exactement les messages qu'il venait d'écarter.** La phrase est devenue
fausse le jour où sa voisine est devenue vraie.

Les quatre témoins ont été lus avant d'être changés, et leur raison écrite dans
l'amendement DATÉ de la spécification. Détail et règle :
`tasks/lessons/2026-11-15-une-garantie-rendue-exacte-fait-mentir-ce-qui-se-reposait-sur-son-inexactitude.md`.

## Ce qui voyageait À CÔTÉ

Trois des quatre sites alimentaient l'arbitre partagé. Le quatrième recopiait la
dérivation pour servir **`deliveredAt`** — un champ rendu tel quel par
`getMessageStatusDetails` et qui gouverne son filtre `?filter=delivered`. Fermer
l'arbitre par un type marqué ne l'aurait pas touché : le panneau « Qui a vu »
aurait annoncé une date de remise que le compteur venait de retirer.

D'où **deux gardes de natures différentes**, et les deux sont nécessaires :

| garde | ferme |
|---|---|
| `CursorDeliveredAt`, type marqué | la PORTE — `cursor.lastDeliveredAt` brut ne compile plus (`TS2322`, mesuré sur sonde) |
| `delivery-cursor-fallback-sweep.test.ts` | le CONTOURNEMENT — un site qui dérive le repli pour un autre champ |

Le balayage prouve d'abord qu'il VOIT : il lit la forme exacte d'avant le
correctif et doit la rendre. Une garde négative dont le balayage ne rend rien
reste verte.

## Mutation, une garde à la fois

| mutation | témoins tombés |
|---|---|
| la borne de BASCULE retirée (le défaut d'avant) | 7 |
| la borne au MESSAGE retirée | 1 |
| le repli TOUJOURS nul (correctif trop large) | 4 |
| un seul site relit le curseur brut (`deliveredAt`) | 1 |

## Ce que le lot COÛTE, dit à voix haute

Les deux sites qui avancent le curseur de livraison figent dans le même
mouvement, **hors transaction**. Un processus qui meurt entre les deux laisse un
curseur en avance sans entrées, et ces messages-là seront désormais servis « non
remis » sans rattrapage possible (`freezeMessageStatus` part de
`since: prevDeliveredAt`).

C'est assumé, et le sens de l'erreur est le bon : **une coche manquante se
rattrape, une coche qui ment ne se rattrape pas.**

## Preuve

- `tsc --noEmit` gateway : **EXIT=0**, lu hors pipe ;
- `src/__tests__/unit/{services,utils,config}` + `src/__tests__/routes` +
  `src/socketio` + `src/__tests__/unit/socketio` : **1 035 suites / 18 009
  témoins**, un seul rouge — `UploadProcessor.heif-conversion`, **pré-existant
  sur `dev`** (mesuré par `git stash` : 2 rouges sur `dev` sans ce lot ; `sharp`
  du conteneur ne lit pas le HEIC) ;
- le cliquet de type prouvé par sonde, puis la sonde retirée.

## Suivi

- **Le curseur de livraison n'est pas encore le préfixe CONTIGU de la remise.**
  Un trou ANTÉRIEUR au dernier message livré reste sous la borne pour un message
  pré-bascule. Lot d'ÉCRITURE, consigné en **#18731**.
# Cycle 171 — l'index que personne ne posait, et le témoin qui ne pouvait pas le voir

*2026-11-15. Branche `claude/exciting-planck-kexumt`, dans la continuité du
cycle 170.*

**Livré** : #18621 — l'index unique PARTIEL du dedup d'envoi est posé à chaque
démarrage. **Ouvert en chemin** : #18700 — les 45 migrations `.mongodb.js` que
nul déploiement ne joue.

---

## Le défaut

L'unicité de `(conversationId, clientMessageId)` est la SEULE chose qui ferme la
fenêtre de concurrence du dedup d'envoi. Le dépôt la documente sur place : « deux
requêtes concurrentes avec le même clientMessageId passent toutes les deux le
findUnique avant que l'une INSERT ». Sans contrainte réelle, le `catch` P2002
qui devait rattraper la seconde ne se déclenche jamais, et le repli « même
contenu sous 2 s » ne peut pas aider — il rend `false` dès qu'il y a une pièce
jointe.

`schema.prisma` décline `@@unique` **pour une bonne raison** : le connecteur
MongoDB poserait un index NON partiel, qui traite tous les `null` comme égaux et
casserait l'envoi pour toutes les lignes historiques. Le choix est juste.
**Ce qui manquait, c'est tout ce qui le rendait VRAI** — aucun déploiement ne
joue `prisma/migrations/*.mongodb.js`, aucun lanceur n'existe, rien ne vérifiait
sa présence.

Ce qui SURVIT sans lui : les renvois SÉQUENTIELS, absorbés par la lecture
précoce — le cas courant d'une vidange d'outbox. Ce qui ne survit pas : les
renvois réellement CONCURRENTS.

## Il a déjà manqué deux mois, et aucun témoin n'aurait pu le voir

Du 2026-05-09 au 2026-07-02, pour deux raisons qu'aucun témoin portant sur le
fichier de migration n'aurait attrapées :

| panne | ce qu'elle a donné |
|---|---|
| `$ne` dans le `partialFilterExpression` — opérateur NON supporté | `createIndex` lève, « l'index n'a JAMAIS existé en prod » |
| `db.messages` au lieu de `db.Message` — le model n'a pas de `@@map` | une collection VIDE, « l'index semblait créé et ne protégeait rien » |

Seul un audit manuel l'a trouvé. **C'est cela qui a dicté la forme des témoins
de ce lot** : ils portent sur la RÈGLE (la liste blanche des opérateurs qu'un
filtre partiel admet, telle que MongoDB la documente) et sur la SOURCE du nom de
collection (le model Prisma, qui ne porte aucun `@@map`) — jamais sur une copie
de la spec attendue. Une copie serait restée verte sur les deux pannes, parce
qu'elle aurait recopié la faute.

## La forme

`services/gateway/src/services/messaging/messageDedupIndex.ts`, posé par
`InitService.ensureMessageDedupIndexes` **hors de la porte `shouldInitialize()`**
— la base qui porte les messages à ne pas dupliquer est par définition peuplée,
donc celle que la porte ne laisse jamais passer. Le dépôt a payé exactement cette
confusion avec `ensurePostGeoIndex` (500 en production le 2026-08-25), et
`database-bootstrap.ts` existe pour rendre la séquence observable.

Le moteur n'est pas réécrit : `ensureSocialEventIndexesByCommand` a été scindé en
`ensureIndexesByCommand(prisma, specs)` + sa liste, et les deux ensembles le
partagent. Recopier la boucle aurait recopié avec elle ce qu'elle a appris — ne
jamais lire `listIndexes` par `$runCommandRaw` (Prisma lève sur un `$type`
textuel), lire « créé » au compte d'index, SIGNALER un conflit 85/86 au lieu de
droper. **Deux listes qui partagent la règle sans partager le code divergent au
premier défaut corrigé d'un seul côté.**

Postures d'échec, et elles sont DEUX :

- **conflit 85/86** ⇒ journalisé, laissé en place. Droper un index unique sous
  une base vivante est l'affaire d'une migration nommée, et refuser de servir
  laisserait en prime personne pour diagnostiquer.
- **toute autre erreur** ⇒ remonte et arrête le boot, comme chez les trois
  voisins. Un `E11000` dit que des doublons existent DÉJÀ — exactement ce que
  l'index devait empêcher. L'avaler ferait du démarrage le complice du défaut
  qu'il vient mesurer.

---

## Mutation, une garde à la fois

| # | mutation | témoins tombés |
|---|---|---|
| P1 | l'étape retirée de la séquence de boot | 2 |
| P2 | l'étape passe DERRIÈRE la porte du seed | 2 |
| P3 | la collection redevient `messages` | 3 |
| P4 | le filtre reprend l'opérateur `$ne` | 4 |
| P5 | l'index n'est plus unique | 3 |
| P6 | le filtre partiel disparaît | 4 |
| P7 | un conflit 85/86 est lu comme « présent » | 6 |
| P8 | toute erreur est avalée par `InitService` | 1 |
| P9 | `InitService` n'appelle pas le poseur | 2 |
| P10 | le poseur reçoit une liste vide | 6 |

P9 est le témoin que la séquence seule ne pouvait pas rendre : `bootstrapDatabase`
s'exécute contre un DOUBLE, donc il prouve qu'une étape est appelée, jamais
qu'elle émet quoi que ce soit vers la base de `InitService`.

## Ce que le lot n'a pas fermé

Le mécanisme qui a produit le défaut est intact : **45 migrations `.mongodb.js`,
aucune jouée par un déploiement, aucune trace de ce qui l'a été.** Plusieurs
portent des index uniques dont l'absence se lit, comme ici, comme un dedup qui
marche. Ce lot n'en ferme qu'une. → #18700.

## Preuve

- `src/services`, `src/__tests__/unit/services` et les gates de budget : 17 576
  témoins verts. Les 16 rouges sont environnementaux (`heif-convert`, `avifenc`,
  `jpegtran` absents du conteneur) et tombent à l'identique sur l'arbre STASHÉ —
  vérifié, pas supposé.
- `tsc --noEmit` EXIT=0.
