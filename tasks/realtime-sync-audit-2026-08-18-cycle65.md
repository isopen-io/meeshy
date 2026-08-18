# Cycle 65 — la porte qui avait le plus besoin du réessai était la seule à ne pas l'avoir

**Date** : 2026-08-18
**Branche** : `claude/keen-hamilton-0xdlil`
**Périmètre** : gateway (`AuthHandler`) — authentification socket, adhésion aux rooms
**Clients touchés** : aucun

---

## 1. Par quel bout le cycle a pris le carnet

Le carnet du cycle 64 laissait huit pistes. Trois sont bloquées sur l'absence de
Xcode, deux sont des décisions produit, deux demandent une mesure que cet
environnement ne peut pas produire (§ 7). La piste n° 5 — **la file hors ligne
par APPAREIL** — est la seule dont le défaut soit à la fois réel, constaté et
côté gateway.

Elle n'a pas été livrée telle quelle, et c'est le résultat du cycle plutôt qu'un
renoncement. Le cycle 58 § 7 la décrivait **double** :

| Moitié | Ce qu'elle demande |
|--------|--------------------|
| file par appareil | une identité d'appareil que la socket ne porte pas — « un cycle entier, et sans doute plusieurs » |
| **le drain reste clé par UTILISATEUR** | — |

En instruisant la première moitié, on lit la porte de livraison elle-même :

```ts
if (isActor || connectedUsers.has(queueKey)) continue;   // offlineParticipantQueue.ts:208
```

C'est en cherchant ce que cette porte suppose que le cycle a trouvé son défaut :
**elle suppose que « inscrit comme connecté » implique « joignable »**. Une des
deux portes d'authentification laissait cette implication fausse.

---

## 2. Le défaut : s'inscrire n'est pas neutre, ça DÉSARME la file

Les deux portes d'authentification rejoignent les rooms de conversation **avant**
d'inscrire la socket dans `connectedUsers` — cet ordre est correct des deux
côtés, et déjà gardé. Mais elles ne rejoignent pas de la même façon.

| | porte inscrite (JWT) | porte invitée (lien partagé) |
|---|---|---|
| rooms | toutes ses conversations actives | son unique conversation |
| adhésion | `_joinConversationRoomsWithRetry` — **3 tentatives** | `await socket.join(...)` nu — **1 tentative** |
| échec définitif | `logger.error`, inscrit quand même | `logger.warn`, inscrit quand même |

La porte inscrite a reçu son réessai borné dans un cycle antérieur, avec le
commentaire qui en donne la raison — « a failed-and-un-retried join is silent
message loss ». La porte invitée, écrite au même endroit, ne l'a jamais reçu.

**Ce que coûte l'écart.** S'inscrire dans `connectedUsers` n'est pas un acte
neutre : c'est ce qui **désarme la file hors ligne**. Une socket dont
l'adaptateur a rejeté l'adhésion, puis inscrite malgré tout, est vue joignable
par `enqueueForOfflineParticipants` — qui cesse donc d'enfiler — alors que le
`io.to(ROOMS.conversation(...))` ne l'atteint pas davantage. Les deux chemins de
livraison sont coupés en même temps, et par le même geste :

- pas d'émission vivante — la socket n'est pas dans la room ;
- pas d'entrée en file — la porte la croit en ligne ;
- **pas de rejeu ultérieur** — rien n'a été enfilé à rejouer.

Le message ne va nulle part. Il reste en base, donc il réapparaît au prochain
`GET /messages` du client, mais il ne franchit jamais le temps réel de la
session.

### 2 bis. Pourquoi l'écart penche du mauvais côté

L'asymétrie ne va pas dans le sens de la sévérité, elle va contre.

Un inscrit qui perd une room sur trente perd **une fraction** de sa livraison.
**Un invité de lien partagé n'a qu'UNE conversation** : « une room échouée » y
vaut la **totalité** de sa livraison temps réel, pour toute la session.

Et c'est la population dominante d'une conversation ouverte par lien — ce que ce
dépôt a déjà constaté ailleurs, dans les termes de
`_emitDeliveryForDrainedMessages` : « le lecteur sans compte est la population
DOMINANTE d'une conversation ouverte par lien de partage ». La porte qui avait le
plus besoin du réessai était la seule à ne pas l'avoir.

---

## 3. Trouvé en chemin : une room jointe que personne n'a jamais adressée

En inventoriant les adhésions des deux portes, `conversation:any` ne se rattache
à rien :

```
grep -rn "conversation:any"  →  AuthHandler.ts:241 (le join), AuthHandler.ts:243 (son log)
```

**Deux occurrences dans tout le dépôt, et les deux sont l'adhésion elle-même.**
Aucun émetteur — ni gateway, ni translator, ni configuration — et la recherche
`git grep` sur l'historique des commits n'en produit pas davantage : cette room
n'a **jamais** été visée par une émission, à aucun commit.

C'est la famille exacte que le cycle 64 a retirée dans l'autre sens. Lui traitait
« émis, jamais écouté » ; ici c'est « **joint, jamais adressé** ». Le prix est
plus petit — un aller-retour d'adaptateur par connexion inscrite et une entrée de
room par socket dans l'adaptateur Redis — mais il est payé à chaque connexion, et
il n'achète rien.

---

## 4. Ce qui a été livré

1. **La porte invitée passe par `_joinConversationRoomsWithRetry`**, le helper qui
   existait déjà dans la même classe. Le correctif est un **site d'appel**, pas
   un second mécanisme : un réessai recopié aurait été la sixième copie du motif
   que le cycle 13 a passé son temps à défaire.
2. **L'échec définitif de la porte invitée est escaladé en `logger.error`**, avec
   un message qui dit ce qui est vrai de CETTE porte — « no live message can
   reach this session », là où l'inscrite dit « may miss live messages ». Pour
   l'invité, ce n'est pas un risque partiel, c'est la totalité.
3. **`conversation:any` retirée** (l'adhésion et son log).
4. **Quatre gardes**, dont une de parité — § 5.

---

## 5. Les gardes, et laquelle compte

`services/gateway/src/socketio/handlers/__tests__/AuthHandler.test.ts` :

| Garde | Ce qu'elle affirme |
|-------|--------------------|
| réessai invité | un rejet transitoire sur l'unique room est réessayé — 2 tentatives |
| réessai borné | un adaptateur durablement cassé s'arrête à 3, la boucle ne tourne pas |
| **parité** | **les deux portes accordent le MÊME nombre de tentatives** |
| room morte | l'authentification ne joint aucune room que rien n'adresse |

**La troisième est celle qui a de la valeur.** Les deux premières décrivent la
porte invitée ; elles resteraient vertes si un cycle futur portait la porte
inscrite à cinq tentatives et laissait l'invitée à trois — c'est-à-dire sous la
récidive exacte de ce dossier, qui n'est pas « il manque un réessai » mais **« un
réessai n'a été ajouté que d'un côté »**. La garde de parité ne nomme aucun
nombre : elle compare les deux portes entre elles, et tombe dès qu'elles
divergent, dans un sens comme dans l'autre.

Même préférence que le cycle 64 § 5 : la garde porte sur la RELATION avant de
porter sur la valeur.

**ROUGE prouvé avant livraison** — les 4 témoins tombent sur le code d'avant
(`4 failed, 4 total`), chacun sur l'assertion qu'il nomme. La garde de parité
mesure l'écart en clair :

```
● les deux portes accordent le MÊME nombre de tentatives à une room qui rejette
  Expected: 3      ← la porte inscrite
  Received: 1      ← la porte invitée
```

---

## 6. Vérification

| Gate | Résultat |
|------|----------|
| `tsc --noEmit` gateway | ✅ 0 erreur |
| Suite gateway (avant fusion de `main`) | ✅ **745/745 suites, 18 053 témoins** verts |
| Δ témoins vs cycle 64 | +4 — exactement les gardes ajoutées, aucun témoin existant réécrit |
| Suite gateway (après fusion de `main`) | ✅ **746/746 suites, 18 066 témoins** verts |
| `vitest` `packages/shared` | ✅ **83 fichiers / 2 168 témoins** verts |
| CI sur la tête finale | ✅ 12/13 jobs verts — `Test gateway`, `Test web`, `Test shared`, `Test agent`, `Test Python`, `Quality`, `Security`, `Prisma`, `Build`, `Audio`, `Voice API` |
| Clients (web / iOS / Android) | **aucun changement** |

Suite complète lancée et non seulement le typecheck — c'est la leçon du cycle 64
§ 6 bis (`tsconfig` du gateway exclut `__tests__`), appliquée ici alors même que
le changement ne touche aucune signature.

### 6 bis. Ce que l'intégration a coûté, et ce qu'elle a montré du CI

`origin/main` a avancé DEUX fois pendant le cycle (7 puis 8 commits). Les deux
fusions ont été faites à la main. La seconde a rendu un conflit, sur
`tasks/lessons.md` seul : les deux côtés AJOUTAIENT en fin de fichier — l'addendum
du cycle 63 ter d'un côté, la leçon 233 de l'autre. Résolution par COMPOSITION,
pas par choix (c'est exactement la règle que `main` venait d'écrire dans ce même
fichier) : l'addendum reste sous la leçon à laquelle il appartient, la 233 suit.

Deux observations sur le CI lui-même, notées parce qu'elles ont coûté des heures
et qu'elles se reproduiront :

1. **Une PR en conflit ne produit AUCUN run.** GitHub ne peut pas construire la
   ref de fusion, donc aucun `pull_request` run n'est créé — et la PR n'affiche
   pas « en conflit » du côté des checks, elle affiche « en attente ». Le
   symptôme (`check_runs: []` qui ne bouge pas) se lit comme un CI lent alors
   que c'est un `mergeable_state: dirty`. **Vérifier la mergeabilité AVANT de
   diagnostiquer une lenteur de CI.**
2. **`test-tts-stt` n'a pas de `timeout-minutes`**, et son étape
   `Install system dependencies (ffmpeg + dev libs for PyAV)` — un `apt-get` qui
   prend 25 s quand tout va bien, et qui a réussi dans les trois jobs FRÈRES du
   même run — s'est bloquée plus d'une heure. Sans borne, le plafond est celui
   de GitHub : 6 h. Douze jobs sur treize étaient verts, dont `Test gateway` ;
   le treizième a tenu la PR à lui seul. Porté en piste § 8-1.

---

## 7. La décision NON prise, et pourquoi elle ne l'a pas été

Le § 2 rend une conclusion plus forte que le correctif livré : quand une socket
se retrouve dans **zéro** room de conversation alors qu'elle en a au moins une,
l'inscrire est **pire que ne rien faire**. Ne pas l'inscrire laisserait
`connectedUsers.has(clé)` à faux, donc la file enfilerait tout, donc l'invité
recevrait l'arriéré complet à sa prochaine connexion réussie. Rien ne serait
perdu.

La règle se généralise proprement aux deux portes — « inscrire seulement si la
socket a atteint au moins une des rooms qu'elle devait atteindre », l'échec
partiel continuant d'inscrire — et le cas « zéro conversation » (un inscrit sans
aucune conversation) en sort indemne par construction.

**Elle n'a pas été livrée ici**, pour une raison qui n'est pas la prudence
d'écriture mais un prix non mesuré : refuser la session fait repartir le client
en reconnexion. Si l'adaptateur est cassé pour tout le monde — le cas où les
trois tentatives échouent vraiment — c'est un **troupeau de reconnexions** sur
un Redis déjà en peine. Le comportement actuel échoue en silence ; celui-là
échouerait en amplifiant.

C'est exactement la règle que le cycle 63 § 7-8 a posée et que le cycle 64 a
suivie : **avant de trancher une piste motivée par un prix supposé, mesurer.**
Le taux de rejet réel de `socket.join` en production n'est pas mesurable depuis
cet environnement. La piste part au carnet avec son arbitrage nommé, pas avec un
« à faire ».

---

## 8. Pistes pour le cycle 66

1. **Borner les jobs CI qui ne le sont pas** (§ 6 bis-2) — nouvelle, constatée.
   `quality`, `test-tts-stt`, `security`, `prisma` et `build` n'ont pas de
   `timeout-minutes` ; `test` (20), `test-audio-pipeline` (15) et les étapes de
   `test-voice-api` en ont. `quality` est le plus cher des cinq, parce que tous
   les autres jobs le déclarent en `needs` : une étape pendue là gèle le
   pipeline entier. Les durées réelles sont connues et petites (`quality` 95 s,
   `test-tts-stt` ~2 min), donc la borne ne peut pas tuer un job légitime — il
   faut la choisir sur la durée MESURÉE, pas devinée. Bénéfice : un blocage
   d'infrastructure devient un échec rapide et rejouable au lieu d'une PR
   immobilisée sans diagnostic.
2. **Refuser la session quand ZÉRO room a été atteinte** (§ 7) — nouvelle,
   instruite, non livrée. Demande une mesure : taux de rejet de `socket.join`
   en production, et coût d'un troupeau de reconnexions pendant une panne
   d'adaptateur. Si le taux est faible, la règle est un gain net.
3. **La file hors ligne par APPAREIL** (cycles 58/64) — intacte. Ce cycle en a
   traité un symptôme voisin, pas la cause : `connectedUsers` reste indexé par
   utilisateur, donc un appareil absent pendant qu'un autre est connecté ne
   reçoit toujours rien. Demande une identité d'appareil sur la socket.
4. **Le drain hors ligne reste destructif** (cycle 57 § 8-2) — instruite ici sans
   être livrée. `DRAIN_LUA` fait `LRANGE` + `DEL` atomiquement, puis
   `_drainPendingMessages` émet vers `ROOMS.user(...)`. Entre le `DEL` et
   l'arrivée effective des octets, rien n'accuse réception : une socket qui meurt
   pendant le rejeu perd l'arriéré **définitivement**. Le correctif de fond est
   un accusé client avant retrait (ce que fait Signal), donc les trois clients —
   bloqué sur Xcode pour la moitié iOS.
5. **Les trois écouteurs iOS sans émetteur** (cycle 64 § 7-1) — intacte, bloquée
   sur Xcode.
6. **Le flake non identifié de `packages/shared`** (cycle 61 bis) — intacte. La
   suite `shared` n'a pas été relancée ce cycle (aucun fichier `shared` touché) ;
   le prochain CI rouge doit le NOMMER.
7. **`conversations.infinite()` en pagination keyset** (cycles 59/60) — intacte,
   soumise à la règle « mesurer avant de trancher ».
8. **`PUT /conversations/:id` accepte toujours de renommer un tête-à-tête** —
   intacte, cosmétique.
9. **Les deux ÉVÉNEMENTS avant les deux FUSIONS côté iOS** (cycles 51/52/53) —
   intacte, bloquée sur Xcode.
