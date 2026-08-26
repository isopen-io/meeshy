# Cycle 80 — Le canal éphémère commandait les canaux durables

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-lgpyud`
**Périmètre** : passerelle seule (`services/notifications/NotificationService.ts`,
`socketio/utils/emitWithSeq.ts`, leurs suites)

**Clients touchés** : aucun. Aucun nom d'événement ajouté ni retiré du contrat,
aucune charge utile modifiée, aucune ligne cliente touchée. Le défaut est
entièrement du côté serveur, dans l'ORDRE des conséquences — pas dans ce qui
part sur le fil.

---

## 1. D'où vient ce cycle

Le cycle 79 fermait la grille « appartenance à une conversation » côté web et
laissait trois domaines voisins à passer : appartenance à une communauté,
épinglage/archivage, blocage/déblocage. Les trois ont été balayés en ouverture
de ce cycle, et **les trois sont clos** :

| domaine | montante | descendante | verdict |
|---|---|---|---|
| épinglage / archivage / sourdine | `PUT …/preferences` | `DELETE …/preferences` | clos — les deux passent par `writeConversationPreferences`, seul écrivain, qui bump `version` ET diffuse |
| blocage / déblocage | `POST /users/:id/block` | `DELETE /users/:id/block` | clos — clé de cache SYMÉTRIQUE (`blockCacheKey` trie ses deux arguments), donc une seule invalidation purge les deux sens |
| appartenance à une communauté | `POST …/members` | `DELETE …/members/:id` | aucun événement temps réel des deux côtés — écart de parité, pas asymétrie ; hors périmètre messagerie (aucun couplage conversation) |

La grille étant close, le cycle a changé d'axe. Les cycles 75 à 79 ont tous
demandé **« ce message arrive-t-il ? »**. Celui-ci demande :

> **quand un canal tombe, qu'emporte-t-il avec lui ?**

## 2. Trois sorties, une seule volatile

`NotificationService.createNotification` écrit la ligne, puis ouvre trois canaux
de sortie, dans cet ordre :

1. l'**emit Socket.IO** — n'atteint qu'un destinataire déjà connecté ;
2. le **push APNs/FCM** — atteint un destinataire absent ;
3. l'**e-mail immédiat** des notifications `high` — atteint un destinataire
   absent, et couvre les alertes de SÉCURITÉ (nouvelle connexion, mot de passe
   changé, 2FA).

Les canaux 2 et 3 sont chacun dans leur propre `try { } catch { }` annoté
« non-blocking ». Le canal 1 ne l'était pas : un `await emitWithSeq(…)` nu, posé
**avant** eux, dans le même `try` que la création de la ligne.

Le canal le plus fragile décidait donc du sort des deux seuls canaux qui
atteignent quelqu'un d'absent. Et la panne qui le déclenche — adaptateur Redis
en défaut, encodeur qui refuse une charge — est précisément celle où **tout le
monde est absent**.

## 3. Quatre conséquences, toutes tenues par un témoin

| # | conséquence | ce que ça donne côté utilisateur |
|---|---|---|
| 1 | le push ne part pas | aucune bannière, alors que le commentaire de la ligne suivante dit « Send push notification (**always**) » |
| 2 | l'e-mail immédiat `high` ne part pas | une alerte de sécurité — mot de passe changé, connexion depuis un nouvel appareil — n'est jamais envoyée |
| 3 | `create()` rend `null` | l'appelant croit à un échec **alors que la ligne existe en base** : il ne retente pas, la notification reste non lue avec `delivery.pushSent:false` à vie |
| 4 | `emitCountsUpdate` est sauté | la pastille ne bouge pas |

## 4. Le même défaut, en fan-out

`announceNotificationsRetracted` et son jumeau `announceNotificationsReproduced`
(annonce d'un rappel de message) bouclent sur les destinataires. L'emit y était
nu **dans la boucle** : une levée sur le premier destinataire sortait de la
méthode. Les suivants n'étaient jamais annoncés, et le recalcul de badge posé
APRÈS la boucle — dont le commentaire de la méthode dit qu'il « compte », parce
que sans lui « un rappel laisserait le compteur sur des lignes que le serveur
vient de supprimer » — ne partait pour personne.

## 5. Et sous tout ça, une promesse abandonnée

`emitWithSeq` sérialise ses emits par user dans une `Map`, et retire la queue une
fois drainée :

```ts
void next.finally(() => { if (userEmitChains.get(userId) === next) userEmitChains.delete(userId); });
```

`.finally` **ADOPTE** le sort de `next` : la promesse qu'il rend rejette quand
`next` rejette — et celle-là est DÉTACHÉE par le `void`. Un appelant qui garde
consciencieusement le `next` qu'on lui rend **ne couvre pas cette branche
dérivée**. C'est la forme la plus discrète de la Leçon 230 : le `void` porte sur
ce qui ressemble à du nettoyage, pas sur un appel métier.

Le jumeau exact existe dans le dépôt et est CORRECT :
`ConversationStatsService.withConversationLock` écrit le même verrou
auto-nettoyant, mais neutralise d'abord la chaîne
(`result.then(() => undefined, () => undefined)`) avant d'en dériver son
`.finally`. Le même idiome, écrit deux fois, désamorcé une fois sur deux.

**Ce que ça coûtait vraiment** : `server.ts` installe un
`process.on('unhandledRejection')` qui **ne quitte pas** — le process ne meurt
donc pas en production. Mais chaque occurrence traverse `writeCrashLog`, qui fait
un `fs.appendFileSync` : de l'I/O **synchrone** sur la boucle d'événements, une
ligne « ❌ UNHANDLED REJECTION » dans `logs/gateway-crashes.log`, et un signal
de crash qui ne nomme aucun vrai crash. Hors de ce filet — un worker Jest, un
script, tout runtime Node aux réglages par défaut — c'est le process qui tombe :
la garde retirée, la suite `emitWithSeq` ne rate pas, **elle tue Node**
(`Node.js v22.22.2`, sortie sans résumé de tests).

## 6. Le correctif

Une seule idée : **le canal éphémère ne commande jamais ce qui le suit.**

- `NotificationService.emitBestEffort(event, userId, emit)` — un point nommé,
  `try/catch` (et non `.catch` : `io.to(…).emit(…)` lève SYNCHRONEMENT, ce
  qu'aucun `.catch` n'attrape — même raison, mot pour mot, que le `try/catch` de
  `ReactionHandler._retractReactionNotification`). L'échec est journalisé en
  `error`, jamais avalé en silence.
- Les trois sites d'emit du service passent par lui : `createNotification`, et
  les deux boucles d'annonce — isolées **par destinataire**.
- `emitWithSeq` : `.catch` sur la chaîne dérivée du `.finally`. Le nettoyage de
  la Map reste le seul travail dû là ; l'erreur, elle, appartient à l'appelant,
  qui la reçoit par le `next` rendu.

Rien n'est masqué : l'événement manqué se rattrape par le chemin prévu pour ça —
la file hors-ligne pour les mutations, `/sync` pour le gap de séquence, la
lecture REST pour la liste.

## 7. Preuves

| gate | résultat |
|---|---|
| 7 témoins de `NotificationService.socketEmitIsolation`, contre le code de `main` | **4 ROUGES** (push 0 appel, `create()` → `null`, e-mail sécurité 0 appel, rejets non gardés) |
| les 2 témoins de fan-out, contre le code de `main` | **ROUGES** (1 destinataire annoncé sur 3 ; 1 sur 2) |
| le témoin négatif « quand l'emit RÉUSSIT, rien ne change » | vert **avant comme après** |
| 3 témoins `emitWithSeq` (erreur rendue à l'appelant / aucun rejet non gardé / queue nettoyée quand même), contre le code de `main` | **ROUGE au point de TUER le worker Node** |
| `emitWithSeq` après correctif | 10/10 verts |
| suites notification + socketio | 153 suites, 3236 tests verts |
| **suite complète passerelle** | **806 suites, 18821 tests verts** |
| `tsc --noEmit` passerelle | **0 erreur** |

Le témoin négatif compte autant que les rouges : il est vert des deux côtés, et
c'est lui qui interdit la sur-correction — un emit qui réussit doit continuer
exactement comme avant.

## 8. Pistes laissées ouvertes

**Les 14 autres `void` détachés de la passerelle sont sûrs — mais par la
construction de leur CALLEE, pas par la leur.** Balayage complet (extraction du
statement à parenthèses équilibrées, recherche d'un `.catch` dedans) : 40 `void`,
15 sans `.catch`, dont `emitWithSeq` corrigé ici. Les 14 restants ont tous été
lus :

| site | pourquoi il ne rejette pas AUJOURD'HUI |
|---|---|
| `ReactionHandler` ×2, `AttachmentReactionHandler`, `MeeshySocketIOManager:3371`, `messages.ts:2222/2324` (pin/unpin) | tous descendent dans `enqueueForOfflineParticipants`, dont le corps ENTIER est sous `try/catch` et dont l'enqueue interne porte son propre `.catch` — « best-effort, never throws » est écrit dans son en-tête |
| `ReactionHandler._createReactionNotification` | `.catch` sur la promesse rendue ; `notifyReactionAdded` est `async`, donc ne lève jamais SYNCHRONEMENT en production (son jumeau `_retractReactionNotification`, lui, a le `try/catch` complet) |
| `CallEventsHandler.onDisconnectGraceExpired` ×2, `CallService.persistHeartbeatToDb`, `rehydrateActiveCalls` | corps entier sous `try/catch` |
| les 2 IIFE `void (async () => {…})()` (`MessageReadStatusService`, `messages.ts:1349`) | corps entier sous `try/catch` |

C'est exactement la propriété que CLAUDE.md § Leçon 230 dit de ne PAS invoquer :
« c'est une propriété du collaborateur, pas une garantie du site d'appel ». Ils
ne sont donc pas des bugs, mais une dette debout : le jour où l'un de ces callees
gagne une instruction non gardée avant son propre `catch`, le site d'appel
tombera sans que rien ne l'ait signalé. Non corrigés ici parce qu'ils sont
prouvés inertes et qu'aucun témoin ne pourrait passer du rouge au vert dessus —
ce cycle ne fusionne que ce qui tombe.

**Ce que ça pourrait devenir, et pourquoi ce n'est pas encore une garde.** Un
scanner « `void` sans `.catch` » est trivial à écrire (celui de ce cycle tient en
trente lignes) mais rendrait rouges 14 sites sains, donc exigerait soit 14
éditions mécaniques, soit une liste d'exceptions — et le cycle 77 a posé la règle
qu'une liste d'exceptions cachée dans un fichier de garde est un endroit où l'on
dépose ce qu'on ne veut pas traiter. La forme utile serait l'inverse : une garde
qui n'accepte le `void` QUE sur un appel dont le callee est annoté
« never throws » de façon vérifiable. Elle n'existe pas encore.

**La classe est plus large que `void`.** Ce cycle a trouvé son défaut sur
`.finally`, pas sur un appel métier — la promesse dérivée d'un nettoyage. Deux
sites de `.finally` existent dans la passerelle ; l'autre est correct. Les autres
formes de promesse dérivée détachée (`.then` sans second argument sur une chaîne
`void`ée, `Promise.all` partiel) n'ont pas été balayées.

**BLOCAGE DÉPÔT — `main` est rouge, et toute PR l'est avec elle.** La PR #3281
porte ce cycle et ne peut pas devenir verte : la porte `Law literals guard`
échoue **verbatim sur `origin/main`**, sur trois opacités codées en dur —
`FocalRow.swift:646` (`0.45`), `FocalRow.swift:745` (`0.40`),
`LentilleFocusCard.swift:184` (`0.35`). La CI de `main` était VERTE au run de
20:19Z (`181127da`, merge du cycle 79) et rouge au suivant, 20:43Z — `f935f91b`,
« Merge feat/ios-list-scroll-fluidity », **fusionnée directement sur `main` sans
CI de PR**. Le commit Android suivant (`6a38ae3f`) hérite du rouge.

Deux précisions qui comptent pour le diagnostic :

- **Le bruit `@meeshy/web#type-check` n'est PAS la cause.** `Lint` et
  `Type-check` sont `continue-on-error: true` (`ci.yml:124`, `:128`) : ils ne
  font jamais tomber le job. Et ils sont antérieurs — **1276 erreurs `tsc` web
  mesurées à l'identique sur `origin/main` ET sur le dernier commit vert**.
- **Ce n'est pas une violation de loi mais une collision numérique.** Ligne 645,
  juste au-dessus de la 646 fautive, `opacity(input.isDark ? 0.18 : 0.14)` passe
  sans broncher : `0.45`/`0.40`/`0.35` ne sont fautives que parce qu'elles
  figurent dans la liste de la garde.

**Seconde porte rouge, même commit d'origine — et celle-là a un correctif
prouvé.** `Test web` tombe sur `lentille-tokens.parity.test.ts` : 78 tokens CSS
contre 82 en JSON, reproduit à l'identique sur `origin/main` seul. `f935f91b` a
fait entrer le groupe `list.focusCard` dans
`packages/shared/design/lentille-tokens.json` (`height: 104`,
`padding.vertical: 14`, `avatarSize: 52`, `nameSize: 17` — exactement le Lot 9
de `todo.md`) sans que le miroir `apps/web/styles/lentille-tokens.css` suive.
C'est le SEUL fichier `apps/web`/`packages/shared` qui bouge entre le dernier
commit vert et `main`.

Ici, aucun arbitrage : le JSON EST la source de vérité, le CSS est le côté qui a
dérivé — la réparation que la philosophie du test prescrit littéralement
(« never repair the test by copying the drifted value; repair the token
instead »). Les quatre lignes à ajouter au groupe `/* list.focusCard */` ont été
**appliquées et vérifiées en local (3/3 verts), puis retirées** : un échec qui
reproduit sur la base n'appartient pas à cette PR, et le groupe de tokens
appartient au chantier `feat/ios-list-scroll-fluidity`, encore en vol. Correctif
livré verbatim dans le commentaire de la PR.

La garde des littéraux, elle, n'est pas corrigée ici pour trois raisons
cumulées : arbitrage de rendu qui n'appartient
pas à la passerelle ; invérifiable dans ce conteneur (ni Xcode ni toolchain
Swift) ; et fichiers d'un chantier EN VOL (`feat/ios-list-scroll-fluidity`,
cf. `todo.md`), que CLAUDE.md § Parallel Worktree Strategy interdit de toucher
depuis un autre poste. Correctif proposé au chantier propriétaire, dans le
commentaire de la PR : hisser chaque opacité en constante nommée dans le `Core/`
voisin (`FocalMetrics`, `LentilleMetrics` — sous-arbre que la garde exclut
délibérément), rendu strictement préservé.

**Le compteur `_seq` brûle des numéros sur timeout.** `allocateSeq` dégrade en
émission SANS `_seq` quand `nextSeq` traîne — mais l'upsert MongoDB a déjà
consommé le numéro. Le `checkpointSeq` du serveur avance donc d'un cran que
personne n'a vu, et le client conclut à un événement manqué au prochain `/sync`.
Conséquence bénigne (une resynchronisation de trop, jamais une perte), constatée
et non corrigée : la corriger demanderait de rendre l'allocation réservable, ce
qui coûte plus que le faux positif qu'elle évite.
