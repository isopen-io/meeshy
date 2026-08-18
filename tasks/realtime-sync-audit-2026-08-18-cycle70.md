# Cycle 70 — la porte vérifiait que le LIEN était vivant, jamais la conversation

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-f98lyg`
**Périmètre** : gateway (`services/conversations/conversationEntryAdmission.ts`,
`routes/conversations/sharing.ts`, `routes/conversations/participants.ts`,
`routes/anonymous.ts`)
**Clients touchés** : aucun (aucun nom d'événement, aucune charge utile modifiés ;
deux codes de refus s'ajoutent — 410)

---

## 1. D'où vient ce cycle

Le cycle 69 a laissé quatre pistes. La deuxième était nommée, non livrée, et
portait sa propre excuse :

> **La garde `otherActiveCount === 0` de `leave.ts` reste lue hors
> transaction.** La fenêtre nommée au cycle 67 § 2 ter (un ajout de participant
> qui commit entre le `count` et l'écriture) n'est pas fermée par ce cycle — elle
> demande de déplacer le `count` DANS la transaction, ce que la forme tableau ne
> permet pas. Demande la forme interactive, et une mesure du coût.

Leçon 236 dit d'attaquer la JUSTIFICATION d'un report, pas son sujet. Ici la
justification contenait deux erreurs, et la seconde est le cycle entier.

**Première erreur, technique.** Déplacer le `count` dans la transaction ne
fermerait rien. MongoDB donne aux transactions l'isolation par instantané, pas la
sérialisabilité : une lecture n'y pose aucun verrou de prédicat, si bien qu'une
insertion concurrente commit sans conflit et que les deux transactions
réussissent. Le remède proposé aurait coûté la forme interactive pour un no-op.

**Seconde erreur, et c'est la bonne piste.** Le report décrivait le défaut comme
une FENÊTRE — « entre le `count` et l'écriture ». Poser la question dans l'autre
sens (« qu'est-ce qui empêche d'entrer dans une conversation close ? ») rend :
**rien, jamais, par aucune porte.** Ce n'est pas une course de quelques
microsecondes. C'est une porte ouverte en permanence, et elle le reste
indéfiniment après la clôture.

---

## 2. Le défaut

### 2.1 La moitié symétrique d'un constat déjà écrit

`packages/shared/prisma/schema.prisma` documente `Conversation.closedAt` par
« Conversation closed for all — **no one can write**, messages stay readable ».
Le cycle 31 a fait respecter cette phrase, et
`services/messaging/conversationWriteAdmission.ts` l'énonce en long.

Personne n'avait posé la question voisine : ***peut-on encore y ENTRER ?*** Elle
n'était écrite nulle part, et sa réponse par défaut était **oui**.

Les trois portes passent par `resolveConversationEntry`, l'unité qui décide
« que faire de la ligne `Participant` déjà là ». Elle interroge l'état de la
PERSONNE — bannie, membre, ancienne, inconnue — et **aucun de ses trois appelants
ne lui passait l'état de la CONVERSATION**, qu'elle n'avait d'ailleurs aucun
moyen de recevoir.

### 2.2 Une clôture n'éteint aucun lien de partage

Les quatre écrivains de clôture (`core.ts`, `leave.ts`, les deux branches de
`delete-for-me.ts`) n'écrivent **que** sur `Conversation`.
`ConversationShareLink.isActive` leur survit intact — vérifié plutôt que déduit :
aucun `conversationShareLink.update` du dépôt n'est appelé depuis un chemin de
clôture. Un lien qui circule reste donc joignable après la mort du fil.

### 2.3 Ce que ça coûtait, porte par porte

| porte | ce qui l'autorisait | pourquoi la clôture ne l'arrêtait pas |
|---|---|---|
| `POST /conversations/join/:linkId` | lien actif, non expiré | le lien survit à la conversation |
| `POST /anonymous/join/:linkId` | **NEUF** propriétés du lien | idem, et zéro propriété de la conversation |
| `POST /conversations/:id/participants` | rang `creator`/`admin`/`moderator` | **fermer n'écrit sur AUCUNE ligne `Participant`** : le rang survit |
| `POST /conversations/:id/invite` | rang `creator`/`admin` | idem |

La colonne de droite est ce qui rend le défaut structurel plutôt qu'accidentel :
**la clôture est un fait porté par `Conversation` SEULE**, donc aucune
autorisation dérivée de `Participant` ne peut la voir. Les deux portes d'ajout
étaient exactement aussi ouvertes le lendemain de la clôture que la veille.

Ce qu'obtient l'arrivant, par n'importe laquelle des quatre :

- un **200**, et une ligne `Participant` neuve et active dans un fil mort ;
- une conversation que `GET /conversations` ne rend pas (filtre `isActive` à la
  racine) et que les clients ont retirée de leur cache sur `conversation:closed`
  (web `use-socket-cache-sync`, iOS `SocialSocketManager`) — donc introuvable
  dans la liste ;
- un premier message refusé par `conversationWriteAdmission`, sans qu'aucun
  événement n'ait jamais expliqué pourquoi ;
- un `conversation:participant-joined` diffusé aux membres d'un fil terminé.

**Pour l'anonyme, c'est terminal.** Ce participant EST son identité : il n'a
aucun compte, aucun autre chemin, et rien à réessayer.

### 2.4 La porte anonyme, en particulier

Elle vérifie **neuf** propriétés du LIEN — actif, expiration, nombre d'usages,
utilisateurs concurrents, pays, langue, plage IP, compte requis, identité requise
— et **zéro** propriété de ce vers quoi il pointe. La conversation était déjà
chargée par la requête (`include: { conversation: { select: … } }`) ; il manquait
deux colonnes au `select` et une ligne de garde.

---

## 3. Ce qui a été livré

Une règle, au même endroit que celle qu'elle complète.

`resolveConversationEntry` gagne un cinquième dénouement, **`closed`**, évalué
AVANT toute lecture de `Participant` : la question « que faire de la ligne déjà
là » ne se pose que dans un conteneur qui accepte encore quelqu'un. Une
conversation terminale ne coûte donc aucune lecture.

Le prédicat n'est pas nouveau : `isConversationClosed` existe, est exporté, lit
les DEUX colonnes, et son en-tête désignait déjà les routes de lien de partage
comme ses clientes. **Il n'était appelé par aucune porte d'ENTRÉE.**

### 3.1 Le paramètre est REQUIS, et c'est le cœur du correctif

`ConversationEntryParams.conversation` n'est pas optionnel.

- **Passé plutôt que lu**, parce que deux portes sur trois tiennent déjà la ligne
  (`shareLink.conversation`, le `findUnique` de l'invitation) : leur facturer une
  lecture pour reposer une question dont elles ont la réponse serait gratuit.
  Seule la porte d'ajout paie une lecture, et elle n'en avait aucune.
- **Requis**, parce qu'un paramètre optionnel aurait laissé la question sans
  réponse à la porte qui l'oublie, **en silence**. Requis, il fait échouer la
  COMPILATION — vérifié, pas supposé :

  ```
  error TS2345: … Property 'conversation' is missing in type
  '{ prisma; conversationId; userId; }' but required in type
  'ConversationEntryParams'.
  ```

  Une porte future ne peut pas se construire sans répondre. C'est la seule partie
  du correctif qui protège du prochain cycle plutôt que de celui-ci.

`null` reste recevable : c'est la réponse d'un appelant qui a cherché la
conversation et ne l'a pas trouvée — il a déjà son propre 404 à rendre.

### 3.2 La porte anonyme, hors typage

Elle n'appelle pas l'unité : celle-ci est keyée sur `(conversationId, userId)` et
un anonyme n'a pas de `User.id`. Elle appelle `isConversationClosed` directement,
sur la ligne qu'elle charge déjà (deux colonnes ajoutées au `select`). C'est le
seul site que le compilateur ne contraint pas ; il a ses propres témoins.

### 3.3 Ce qui n'a PAS été fait, délibérément

**Éteindre les liens de partage à la clôture.** C'était l'autre correctif
possible. Il ne couvre ni l'ajout par un admin ni l'invitation, il ne dit rien
des conversations **déjà** closes, et il ferait dépendre la fermeture de la porte
de la discipline de quatre écrivains — celle-là même qui a divergé trente-sept
cycles durant. L'argument est écrit dans `conversationWriteAdmission` et vaut
mot pour mot ici : *lire l'état réel de la base plutôt que la discipline de ses
écrivains est ce qui rend une garde indépendante de leurs oublis.*

**Les DEUX colonnes sont lues**, pour la raison qui y est écrite : les lignes
fermées par l'ancien `leave.ts` (avant cycle 67) existent en base sans
`closedAt`, et rien ne les rétro-remplit.

### 3.4 Les quatre portes sont l'énumération COMPLÈTE

Les autres écrivains de `Participant` ont été instruits, pas supposés sains :

| site | verdict |
|---|---|
| `MessagingService.ts:589` | **backfill**, pas une porte — matérialise la ligne d'un membre que la collection héritée `members` porte déjà |
| `AuthService.ts:641` | auto-adhésion à la conversation GLOBALE `meeshy` à l'inscription — jamais close |
| `InitService.ts` (×4) | amorçage au démarrage |
| `sharing.ts`, `participants.ts`, `anonymous.ts` | **les quatre portes**, toutes gardées |

Et la piste 4 du cycle 69 (« la famille *deux écritures pour un geste* n'est pas
épuisée ») est **soldée par un résultat négatif** : `ban.ts` (deux routes) et
`participants.ts` (ajout, retrait, rang) portent chacune UNE écriture par geste.
Rien à fusionner.

---

## 4. Les gardes, et lesquelles comptent

Dix-neuf, dans quatre fichiers.

| fichier | gardes | ce qu'elles affirment |
|---|---|---|
| `conversationEntryAdmission.test.ts` | 7 | `closed` sur chaque colonne SEULE ; aucune décision d'écriture possible sur un fil terminé ; **aucune ligne `Participant` lue** ; `null` permissif ; contre-épreuve |
| `conversation-sharing.test.ts` | 6 | jointure et invitation : **aucune ligne écrite**, 410, pas de réintégration non plus ; contre-épreuves |
| `participants.test.ts` | 3 | ajout : idem, y compris pour un `creator` |
| `anonymous.test.ts` | 3 | 410 alors que les neuf propriétés du lien sont valides ; contre-épreuve |

**Les gardes qui comptent sont celles qui nomment la CONSÉQUENCE.** Elles
n'affirment pas « le dénouement vaut `closed` » — une forme qu'un refactor peut
satisfaire en perdant la propriété — mais **`participant.create` et
`participant.update` n'ont pas été appelés**. Elles tombent sur toute
implémentation qui écrit une appartenance dans un fil terminé, quelle que soit la
route qu'elle prend pour y arriver.

La garde « ne lit AUCUNE ligne `Participant` » est la seule qui pinne l'ORDRE, et
elle est délibérée : le court-circuit avant lecture est la propriété qui rend une
conversation close gratuite.

### 4.1 ROUGE prouvé avant livraison, et pour la raison nommée

**Routes** — les quatre fichiers de production remis à leur état d'avant
(`git stash`), les témoins inchangés :

```
● POST /anonymous/join/:linkId › returns 410 when the conversation itself is closed…
● POST /anonymous/join/:linkId › refuses on `isActive: false` alone…
● POST …/participants › n'ÉCRIT AUCUNE ligne `Participant` quand la conversation est close
● POST …/participants › refuse aussi sur `isActive: false` seul…
● POST …/participants › ne RÉINTÈGRE pas non plus un ancien membre dans un fil terminé
● POST /conversations/join/:linkId › n'ÉCRIT AUCUNE ligne `Participant`…
● POST /conversations/join/:linkId › refuse aussi sur `isActive: false` seul…
● POST /conversations/join/:linkId › ne RÉINTÈGRE pas non plus un ancien membre…
● POST /conversations/:id/invite › n'ÉCRIT AUCUNE ligne… même pour un créateur

Tests: 9 failed, 179 passed, 188 total
```

**Unité** — ce même stash ne produisait PAS un rouge de comportement : il
retirait le champ du type, donc le fichier de témoins ne compilait plus
(`TS2561: 'conversation' does not exist in type 'ConversationEntryParams'`). Un
rouge dont la cause n'est pas celle qu'on croit ne prouve rien. La mutation a
donc été refaite au scalpel — la SEULE ligne de court-circuit retirée, le type
gardé :

```
● refuse l'entrée dans une conversation fermée (`closedAt` posé)
● refuse aussi sur `isActive: false` SEUL
● refuse sur `closedAt` SEUL
● ne peut RENDRE aucune décision d'écriture sur un fil terminé
● ne lit AUCUNE ligne `Participant` sur un fil terminé

Tests: 5 failed, 15 passed, 20 total
```

Les deux contre-épreuves (`null` permissif, conteneur vivant) restent VERTES des
deux côtés — c'est leur fonction : elles bornent la correction, elles ne
détectent pas le défaut.

### 4.2 Aucun témoin existant n'a été réécrit

Les 188 témoins des quatre fichiers passent sans qu'une seule assertion soit
touchée. Aucun ne gelait l'entrée dans un fil clos. **Le défaut n'a pas survécu à
un témoin : il a survécu à leur absence** — même constat qu'aux cycles 68 et 69
sur leurs propres familles.

Deux doubles de test ont gagné une méthode, et les deux manques étaient réels :

- `conversation-sharing.test.ts` n'avait **aucun** double pour
  `participant.update` — la branche RÉINTÉGRATION de la jointure par lien passe
  pourtant par là. Aucun témoin ne pouvait affirmer qu'elle n'avait PAS eu lieu.
- `participants.test.ts` n'avait pas `conversation.findUnique`.

---

## 5. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Les 4 suites touchées | ✅ **208/208** (188 avant, +20 gardes) |
| Suite gateway complète | ✅ (voir § 5 de la PR) |
| Clients (web / iOS / Android) | **aucun changement** |

---

## 6. Pistes pour le cycle 71

1. **Un membre ACTIF d'une conversation close reste actif, indéfiniment.** Ce
   cycle empêche d'y ENTRER ; il ne dit rien de ceux qui y étaient. `core.ts`
   ferme le fil sans toucher une seule ligne `Participant`, si bien que tout le
   monde reste membre d'un conteneur mort. C'est sans victime tant que chaque
   lecteur pense à opposer l'état de la conversation — ce que
   `conversationWriteAdmission` fait et que `GET /conversations` fait, mais qui
   est une propriété de chaque lecteur pris un par un. À instruire lecteur par
   lecteur, PAS à « simplifier » par une écriture de masse : marquer les
   participants inactifs à la clôture ferait mentir `leftAt` et casserait la
   distinction entre partir et voir son fil fermé.
2. **La clôture est IRRÉVERSIBLE et aucun écrivain ne rallume
   `Conversation.isActive`** (constat de `conversationWriteAdmission`, toujours
   vrai). Ce cycle en durcit la conséquence : une conversation close est
   désormais close pour de bon, entrée comprise. Si le produit veut une
   réouverture, elle n'existe nulle part et doit être conçue — **décision
   PRODUIT**.
3. **Les liens de partage d'une conversation close restent `isActive: true` en
   base.** Ce cycle rend la chose inoffensive (la porte refuse), mais
   `GET /anonymous/link/:identifier` et les écrans d'administration de liens
   continueront de présenter ces liens comme vivants. Cosmétique, réel, non
   couvert ici.
4. **La fenêtre nommée par le cycle 69 § 2 est RÉDUITE, pas supprimée.** Les
   quatre portes lisent l'état de la conversation avant d'écrire ; ni MongoDB ni
   Prisma ne rendent cette paire atomique. Fermer réellement demanderait de
   matérialiser le conflit sur le document `Conversation` que les deux
   transactions touchent — technique correcte, coût non mesuré, et le report du
   cycle 69 avait tort sur le remède mais raison sur la prudence.
5. **La piste 3 du cycle 69 reste ouverte et reste PRODUIT** : `leave.ts` refuse
   au créateur de partir en laissant des membres actifs, `delete-for-me.ts` lui
   accorde un transfert automatique.
