# Cycle 67 — le quatrième écrivain de clôture, nommé dans le code et laissé ouvert trente-sept cycles

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-sj2y77`
**Périmètre** : gateway (`routes/conversations/leave.ts`) — clôture de conversation
**Clients touchés** : aucun (nom d'événement et charge utile inchangés)

---

## 1. Par quel bout le cycle a pris le carnet

Le cycle 66 laissait sa question de méthode en héritage (§ 7-9) :

> *où le signal est-il REGARDÉ, et est-ce là qu'il est adressé ?*

avec trois candidats nommés. Ils ont été instruits **et ils sont sains** — c'est
le premier résultat de ce cycle, et il vaut d'être écrit pour que le cycle 68 ne
les repasse pas :

| candidat | verdict |
|---|---|
| `MESSAGE_CONSUMED` | **sain** — iOS le souscrit hors conversation ouverte, et un témoin le dit (`ConversationSyncEngineRealtimePersistenceTests` : « `message:consumed` n'était souscrit nulle part hors conversation ouverte ») |
| `LOCATION_LIVE_*` | **sain, et thread-only à juste titre** — la carte vit DANS le fil, et un rejeu à l'entrée de room (`replayLiveLocationsTo`) couvre déjà le rattrapage |
| `PARTICIPANT_ROLE_UPDATED` | **sain** — vérifié plutôt que déduit, comme son commentaire le demandait : aucune ligne de liste ne rend un rang |

La question a donc été passée sur les **treize** émissions vers
`ROOMS.conversation(` du dépôt, pas seulement sur les trois candidats. Les
mutations de message (`broadcastMessageMutation`) portent déjà leurs trois
audiences, la clôture (`core.ts`) adresse déjà les rooms personnelles. **La
famille est épuisée sur ce périmètre.**

Ce n'est pas elle qui a rendu ce dossier. C'est le balayage voisin qu'elle a
imposé — *qui ÉCRIT l'état que ces signaux annoncent ?* — et la réponse était
écrite depuis trente-sept cycles, en toutes lettres, dans le dépôt.

---

## 2. Le défaut : le quatrième écrivain de clôture, hors de la discipline des trois autres

`services/messaging/conversationWriteAdmission.ts` porte cette phrase :

> `core.ts` et les deux branches de `delete-for-me.ts` posent `{ isActive:
> false, closedAt, closedBy }`, mais `leave.ts` (créateur dernier membre)
> n'écrit que `isActive: false` — **constat latent nº 2 du cycle 30, non corrigé
> depuis.**

Le code de `leave.ts` disait la même chose :

```ts
await prisma.conversation.update({
  where: { id },
  data: { isActive: false },   // ni closedAt, ni closedBy
})
```

Et il ne diffusait **rien** : les trois autres écrivains annoncent
`conversation:closed` aux rooms PERSONNELLES ; le quatrième était muet.

### 2 bis. Ce que l'omission coûte, et à quel lecteur exactement

`closedAt` n'est pas décoratif : c'est la **seule** colonne que le flux de
rattrapage lit.

```ts
// utils/delta-tombstones.ts
where: { closedAt: { gt: since }, participants: { some: { userId } } }
```

Une clôture qui n'écrit que `isActive: false` n'est donc portée par **aucun**
delta. Le fil disparaît de `GET /conversations` (filtré `isActive: true` à la
racine) sans qu'aucun tombstone ne dise pourquoi — et les deux clients
PERSISTENT leur liste (cache disque iOS, `staleTime: Infinity` web).

Le prédicat d'admission en écriture, lui, s'en sortait — parce qu'il avait été
écrit en SE DÉFIANT de ses écrivains :

> Un prédicat qui ne lirait que `closedAt` laisserait ce quatrième écrivain hors
> de la règle. Lire les deux fait tenir la garde sur l'état réel de la base
> plutôt que sur la discipline de ses écrivains.

**Deux lecteurs, deux politiques, et c'est là toute l'histoire de ce défaut :**
celui qui lisait deux colonnes a survécu trente-sept cycles ; celui qui n'en lit
qu'une était aveugle depuis le début. La divergence d'un écrivain ne se paie pas
chez lui — elle se paie chez le lecteur le moins défensif, et le prix reste
invisible tant que personne ne fait l'inventaire des deux côtés.

### 2 ter. La victime, et son honnêteté

Il faut le dire sans le gonfler : **la branche fautive ne fire que quand
l'appelant est le DERNIER membre actif**, et l'appelant est couvert par son
propre `leftAt` (troisième stream de tombstones). Le trou était donc, en régime
nominal, **sans victime** — et c'est exactement ce qui l'a laissé vivre
trente-sept cycles : il ne produisait aucun symptôme à rapporter.

Il en a une hors du régime nominal. La garde `otherActiveCount === 0` ne vaut
qu'à l'instant où elle est LUE :

```
t0  leave  : count(autres actifs) → 0
t1  ailleurs: POST /participants commit — un membre est ajouté
t2  leave  : conversation fermée
```

À `t2`, un membre actif est dans une conversation terminale. Le direct ne
l'atteint pas (aucune diffusion), le rattrapage non plus (aucun `closedAt`), et
`conversationWriteAdmission` refusera ses messages sans qu'aucun événement n'ait
jamais expliqué pourquoi. Fenêtre étroite — et précisément la sorte de fenêtre
qu'un état écrit referme et qu'un état omis laisse ouverte.

Trois pistes qui auraient élargi la victime ont été instruites et **écartées,
vérifiées plutôt que déduites** :

- **Les participants sans compte sont bien comptés.** `userId: { not: userId }`
  matche les lignes à `userId` nul (le dépôt le confirme à l'envers :
  `callEndedFanout.ts` doit écrire `userId: { not: null }` — « DÉLIBÉRÉ ici, à
  l'inverse de tous les autres » — précisément pour les EXCLURE). Un invité de
  lien actif empêche donc le créateur de partir.
- **Le chemin de lien partagé est défendu.** `routes/links/messages.ts` charge
  `isActive` ET `closedAt` dans son `select` partagé.
- **Il n'y a pas de cinquième écrivain.** Balayage de tout `isActive: false` du
  service : les autres portent sur `TrackingLink`, `User`, `Participant`.

---

## 3. Ce qui a été livré

`leave.ts` rejoint ses trois jumeaux, sur les deux moitiés du geste :

1. **L'état** — `{ isActive: false, closedAt: now, closedBy: userId }`, et `now`
   hissé au-dessus de la branche pour que la clôture et le `leftAt` partagent un
   seul instant (deux `new Date()` les feraient tomber de part et d'autre d'un
   `since` de rattrapage — discipline littérale de `delete-for-me.ts`).
2. **L'annonce** — `conversation:closed` via `emitToConversationParticipants`,
   donc aux rooms PERSONNELLES : correction que les deux jumeaux portent déjà,
   pour la raison du cycle 66 (« un client posé sur la LISTE a quitté
   `conversation:<id>` »).
3. **L'audience ramenée PAR l'écriture** (`include: { participants }`), jamais
   par une requête de plus — mot pour mot l'argument de `core.ts` : « une
   seconde requête pour les lire pourrait tomber sur un état déjà modifié ».
4. **Émise APRÈS toutes les écritures** : une annonce ne précède jamais la
   durabilité du fait qu'elle annonce.

`conversation:participant-left` est CONSERVÉ tel quel et n'est pas remplacé : il
dit « un membre s'en va », jamais « ce fil est terminé ». Ce sont deux faits, et
c'est la seconde phrase que le prédicat d'admission fera respecter au prochain
envoi.

### 3 bis. Ce qui n'a PAS été touché, et pourquoi c'est le point délicat

`conversationWriteAdmission` **continue de lire les deux colonnes**. La tentation
était réelle — les quatre écrivains s'accordant enfin, la seconde lecture
ressemble à de la ceinture devenue inutile.

Elle ne l'est pas : **les lignes fermées par l'ancien `leave.ts` existent en
base**, `isActive: false` et `closedAt` absent, et rien ne les rétro-remplit. Un
prédicat réduit à `closedAt` les rendrait toutes ouvertes à l'écriture. La
discipline retrouvée des écrivains ne dit rien de ce qu'ils ont déjà écrit.

Le commentaire a donc été corrigé plutôt que supprimé : il ne peut plus dire
« non corrigé depuis » (ce serait faux), et il doit continuer de dire pourquoi
la double lecture reste porteuse (ce qui reste vrai, pour une autre raison
qu'avant).

**Le correctif est posé à la SOURCE et non chez le lecteur.** Ajouter `isActive`
au `where` de `delta-tombstones` aurait fait taire le symptôme en ajoutant une
troisième politique de lecture à un état qui en avait déjà deux.

---

## 4. Les gardes, et laquelle compte

`src/__tests__/unit/routes/conversation-leave-ban-delete-stats.test.ts` :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| état écrit | la clôture pose les trois champs, pas seulement `isActive` |
| annonce | `conversation:closed` atteint la room PERSONNELLE de l'audience |
| non-régression | un simple membre qui part ne ferme ni n'annonce rien |
| **parité** | **les DEUX routes de clôture par départ écrivent le même état et annoncent le même fait** |

**La quatrième est celle qui a de la valeur**, et pour la raison exacte du cycle
66 § 4 : les trois premières décrivent `leave` seul et resteraient VERTES si
`delete-for-me` perdait demain ses `closedAt`/`closedBy` ou son annonce. Celle-ci
ne nomme AUCUNE des deux formes — elle fait jouer aux deux routes le même geste
(le créateur part, personne ne reste) et compare les deux résultats entre eux.

**ROUGE prouvé avant livraison.** Les deux moitiés du correctif remises à leur
état d'avant, les trois gardes tombent, et la parité chiffre le défaut au
présent :

```
● les DEUX routes de clôture par départ écrivent le même état et annoncent le même fait
    - "annonce": true          ← delete-for-me
    - "roomPersonnelle": true
    + "annonce": false         ← leave
    + "roomPersonnelle": false
```

### 4 bis. Le témoin JUMEAU, trouvé par la suite complète et non par la lecture

Le défaut était épinglé par **DEUX** fichiers de témoins, pas un :
`conversation-leave-ban-delete-stats.test.ts` (handler appelé à nu) et
`conversations-leave.test.ts` (via `app.inject`). Les deux affirmaient
`data: { isActive: false }` **à l'exclusion du reste** — c'est-à-dire le défaut
lui-même, gelé deux fois.

Le second n'a pas été trouvé en lisant : il a été trouvé parce que la suite
LARGE a été lancée après le vert du fichier ciblé. Un témoin qui épingle un
défaut se trouve rarement par la recherche du nom de la route — les deux
fichiers ici ne partagent ni nom, ni harnais, ni convention d'assertion.

### 4 ter. La sonde qui mesurait la mauvaise chose

Le premier jet des gardes d'audience écrivait
`expect(io.to).toHaveBeenCalledWith(ROOMS.user(…))`, et il est parti **ROUGE
pour une raison fausse** : `io.to` ne retient que le PREMIER maillon d'une
chaîne, et `emitToConversationParticipants` amorce toujours par la room de
conversation. La production était juste ; la sonde regardait ailleurs.

L'en-tête de `makeChainableIO` l'écrit déjà noir sur blanc — « `expect(io.to)`
ne prouve pas la livraison : il dit qu'une room a été nommée quelque part, jamais
qu'elle appartenait à la chaîne qui a émis CET événement ». Les gardes passent
donc par `_roomsFor(event)`, qui lit la chaîne de l'émission elle-même.

C'est la leçon 233 dans son registre outillage : **un helper qui documente la
sonde correcte ne protège que les tests qui le lisent**, et un rouge dont on n'a
pas vérifié la CAUSE est aussi trompeur qu'un vert.

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suite `conversation-leave-ban-delete-stats` | ✅ **58/58** (55 avant, +3 gardes) |
| Suite `conversations-leave` | ✅ 12/12 (témoin jumeau corrigé) |
| Suite gateway complète | ✅ **746/746 suites, 18 073 témoins** verts |
| Δ témoins vs cycle 66 | **+3** (18 070 → 18 073) — exactement les gardes ajoutées |
| Clients (web / iOS / Android) | **aucun changement** |

Les deux témoins RÉÉCRITS ne sont pas comptés dans le delta : ils épinglaient le
défaut, ils disent maintenant la même phrase que leur jumeau `delete-for-me`.

---

## 5 bis. La même question passée aux DEUX autres streams de tombstones : zéro défaut

La question qui a produit ce cycle — *les écrivains d'un même état s'accordent-ils ?*
— a été passée sur les deux autres streams de `loadConversationTombstones`, qui
portent sur `Participant` et non sur `Conversation`. **Elle rend zéro défaut**,
et c'est un résultat : le cycle 68 n'a pas à la repasser sur ce périmètre.

| stream | écrivains | verdict |
|---|---|---|
| `leftAt` | `leave.ts`, retrait de membre (`participants.ts`), bannissement | **tous** écrivent `{ isActive: false, leftAt }` ensemble |
| `bannedAt` | `ban.ts` (aller et retour) | passe par une unité PARTAGÉE et typée, `conversationBanState.ts` |
| `deletedForMe` | `delete-for-me.ts` | son propre stream ; l'absence de `leftAt` y est exacte — « masquer pour moi » n'est pas « partir » |

Deux raisons à cet écart de discipline avec la clôture, et elles instruisent la
leçon plus que le décompte :

1. **Le bannissement a une unité partagée** (`resolveBanWrite` /
   `resolveUnbanWrite`) qui rend la transition comme une VALEUR typée. Un
   écrivain ne peut pas en omettre la moitié : le type
   `{ bannedAt, isActive: false, leftAt }` ne se décompose pas. La clôture, elle,
   était recopiée à la main dans quatre routes — et c'est exactement le site
   recopié qui a divergé.
2. **Un seul site écrit `deletedForMe`.** Aucun jumeau, donc aucune divergence
   possible.

> Le nombre d'écrivains d'un état est le meilleur prédicteur de sa divergence, et
> une unité partagée typée est ce qui ramène ce nombre à un.

---

## 6. Pistes pour le cycle 68

1. **`presence:snapshot` n'est envoyé qu'à l'authentification** (cycle 66 § 7-1)
   — intacte. Demande un changement CLIENT, à instruire quand Xcode est
   disponible.
2. **Refuser la session quand ZÉRO room a été atteinte** (cycle 65 § 7) —
   intacte. Demande une mesure de production que cet environnement ne produit
   pas.
3. **La file hors ligne par APPAREIL** (cycles 58/64/65) — intacte. Demande une
   identité d'appareil sur la socket.
4. **Le drain hors ligne reste destructif** (cycle 57 § 8-2) — intacte, bloquée
   sur Xcode pour sa moitié iOS.
5. **Les trois écouteurs iOS sans émetteur** (cycle 64 § 7-1) — intacte, bloquée
   sur Xcode.
6. **Le flake non identifié de `packages/shared`** (cycle 61 bis) — intacte ; le
   prochain CI rouge doit le NOMMER.
7. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte,
   soumise à « mesurer avant de trancher ».
8. **`PUT /conversations/:id` accepte toujours de renommer un tête-à-tête** —
   intacte, cosmétique.
9. **La famille « où le signal est-il REGARDÉ » est ÉPUISÉE** sur les treize
   émissions vers `ROOMS.conversation(` (§ 1) — ne pas la repasser. La question
   qui l'a remplacée et qui a produit ce cycle : *qui ÉCRIT l'état que ces
   signaux annoncent, et les écrivains d'un même état s'accordent-ils ?*
10. **Nouvelle, non livrée — `leave.ts` et `delete-for-me.ts` tranchent
    l'INVERSE sur le même cas.** Un créateur qui part en laissant des membres
    actifs reçoit un 400 de `/leave` (« transférez l'ownership d'abord ») mais
    obtient de `/delete-for-me` un transfert automatique au premier modérateur.
    La seconde route est donc un contournement complet de la règle que la
    première fait respecter. Les deux comportements sont défendables
    séparément ; leur coexistence est une décision PRODUIT, pas un défaut à
    corriger unilatéralement — à porter à l'équipe.
11. **Nouvelle, non livrée — l'ordre d'écriture de `leave.ts` reste inversé par
    rapport à son jumeau.** La clôture commit AVANT la mise à `isActive: false`
    de l'appelant ; si la seconde échoue, la conversation est fermée alors que
    la réponse HTTP est un 500 qui nie l'opération. `delete-for-me.ts` évite
    exactement ce mode d'échec en n'annonçant qu'après toutes les écritures — ce
    cycle a repris sa discipline d'ANNONCE, pas son ordre d'ÉCRITURE. Corriger
    demande de savoir ce que le client doit croire après un 500, ce qui dépasse
    le périmètre d'un correctif de clôture.
