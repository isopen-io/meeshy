# Cycle 77 — Cinq canaux que le contrat promettait et que personne n'émettait

**Date** : 2026-08-21
**Branche** : `claude/keen-hamilton-dw7y92`
**Périmètre** :
- shared (`types/socketio-events.ts`, `__tests__/ci/socket-event-emitter-gate.test.ts`
  — garde neuve, `__tests__/ci/socket-event-name-gate.test.ts` — correctif)
- web (3 services socket, 4 niveaux de la chaîne d'aperçu, 7 fichiers de tests)
- iOS/SDK (`MessageSocketManager.swift`, 2 mocks, 2 suites)
- android (`MessageSocketManager.kt`, `ChatViewModel.kt`, 2 docstrings, 1 suite)

**Clients touchés** : les trois. Aucune ligne de passerelle, aucun nom
d'événement neuf, aucune charge utile modifiée. Cinq noms sortent du contrat et
tout le câblage client qui les servait disparaît avec eux.

---

## 1. D'où vient ce cycle

Le cycle 76 s'est terminé sur une piste nommée en toutes lettres :

> **La garde SYMÉTRIQUE n'est pas écrite : « tout événement déclaré au contrat
> a-t-il un émetteur ? »** […] Chacun demande un arbitrage — implémenter
> l'émetteur ou retirer l'entrée du contrat et ses récepteurs — donc un cycle à
> lui, pas une garde qu'on rend verte à la hâte.

C'est exactement ce cycle. Les deux gardes forment désormais une paire :

| garde | question | déposée |
|---|---|---|
| `socket-event-name-gate` | un nom épelé par un client existe-t-il au contrat ? | cycle 76 |
| `socket-event-emitter-gate` | un nom déclaré au contrat a-t-il un émetteur ? | **cycle 77** |

---

## 2. L'inventaire

124 noms distincts dans `SERVER_EVENTS`. **Huit** ne sont prononcés nulle part
dans le code exécutable de la passerelle. Vérifié, pas déduit — et deux
précautions ont été nécessaires pour que le compte soit juste :

**Résoudre par NOM, pas par clé.** `call:initiated` s'écrit
`CALL_EVENTS.INITIATED` dans `CallEventsHandler`, jamais
`SERVER_EVENTS.CALL_INITIATED`. Une première passe qui ne cherchait que la clé
de `SERVER_EVENTS` rendait dix-neuf canaux d'appel « orphelins » — tous
parfaitement émis. Le comptage se fait sur l'ensemble des tokens qui produisent
le nom, dans les trois maps.

**Retirer les commentaires avant de chercher.** `MeeshySocketIOHandler` cite
`system:message` dans une prose qui raconte que la passerelle ne l'émet PLUS.
Sans dépouillement, cette phrase valait preuve d'émission — la garde aurait béni
le défaut qu'elle est écrite pour interdire.

Les huit se répartissent en trois classes, et chacune demandait son arbitrage :

### Classe A — trois canaux morts avec des récepteurs vivants

| nom | ce qui l'écoutait | pourquoi c'était inoffensif |
|---|---|---|
| `message:translated` | iOS, Android, web | la traduction arrive par `message:translation` |
| `system:message` | iOS, web | un message système arrive par `message:new` |
| `conversation:online-stats` | iOS, web | aucun consommateur d'interface, nulle part |

Inoffensif — mais pas gratuit. `message:translated` faisait porter à Android un
flow `translationCompleted` entier, jumeau de `translationInProgress`, avec son
collecteur de ViewModel, ses trois tests et son merge de dépôt : la moitié de ce
câblage n'a jamais rien transporté. `conversation:online-stats` faisait vivre
côté web une chaîne de **six niveaux** (`presence.service` → `orchestrator` →
`meeshy-socketio.service` → `use-socketio-messaging` → `messaging-utils` →
`use-stream-socket`), dont un handler de quarante lignes qui reconstruit une
liste d'utilisateurs en ligne — pour un événement qu'aucune version de la
passerelle n'a jamais émis.

**Arbitrage : retrait.** Aucun des trois ne manque au produit, et chacun avait
déjà un canal vivant qui fait le travail.

### Classe B — deux frères oubliés d'une correction déjà faite

`comment:reaction-sync` et `post:reaction-sync` sont déclarés `SERVER_EVENTS`,
mais l'instantané de réactions **voyage dans l'ACK** de la requête
correspondante : `PostReactionHandler` répond `callback?.({ success, data })`,
jamais `emit`.

Or le contrat porte, à quinze lignes de là, la trace d'exactement cette
correction — appliquée à leur frère :

> Pas de `REACTION_SYNC` : l'instantané de réactions voyage dans l'ACK de
> `CLIENT_EVENTS.REACTION_REQUEST_SYNC`, jamais en diffusion. Le déclarer ici
> affirmait un canal serveur→client sans émetteur, **et un client s'y était
> abonné en versant l'instantané dans le seau incrémental de `reaction:added`.**

Le canal fantôme n'avait pas seulement manqué sa fonction : il avait produit un
bug. La correction a été faite sur `reaction:sync` — et ses deux frères du même
pipeline sont restés en place. C'est mot pour mot la leçon du cycle 76 (« relire
les classes voisines du même pipeline dans la foulée »), et c'est la troisième
fois que cette forme se présente.

**Arbitrage : retrait des deux entrées `SERVER_EVENTS`, types CONSERVÉS** —
`PostReactionSyncEventData` et `CommentReactionSyncEventData` typent l'ACK, qui
lui est bien réel.

### Classe C — trois canaux réservés, et une exemption pourrie

`call:translation-requested`, `call:translation-enabled`,
`call:transcription-result` : le pipeline de traduction EN APPEL, décodé côté
clients, en attente du service qui le produira. Réservation légitime.

Mais le bloc de prose qui portait cette réservation — « Call events RESERVED (no
emitter yet) » — **avait pourri sans que rien ne le signale**. Il énumérait
encore six noms (`call:missed`, `call:quality-alert`,
`call:translated-segment`, `call:transcription-active`,
`call:already-answered`, `call:screen-capture-alert`) dont la passerelle avait
entre-temps implémenté l'émission. Une exemption écrite en commentaire ne peut
pas rougir ; elle survit à sa raison d'être, et finit par couvrir un vrai défaut.

**Arbitrage : `RESERVED_SERVER_EVENTS`, exporté par le contrat et vérifié dans
les deux sens.**

---

## 3. La garde

`packages/shared/__tests__/ci/socket-event-emitter-gate.test.ts` — cinq
assertions, dont trois qui ne cherchent pas de défaut mais protègent la garde
d'elle-même.

**Le critère se trompe du côté PERMISSIF.** Il vérifie que la passerelle
*nomme* l'événement, pas qu'un `.emit(` le prend en argument — parce qu'elle
émet aussi par indirection (`const errorEventName = …; socket.emit(
errorEventName, …)`, `emission.event`), et qu'une garde exigeant la forme
littérale du site d'appel rougirait sur des émetteurs vivants. Le critère
retenu ne peut pas produire de faux positif, et suffit pour la classe visée : un
canal que rien, nulle part, ne mentionne côté serveur.

**« Réservé » se déclare dans le CONTRAT, pas dans la garde.** Une table
d'exceptions vivant dans un fichier de test est un endroit où l'on dépose ce
qu'on ne veut pas traiter, et que personne ne relit. Placée dans
`socketio-events.ts`, à côté des noms qu'elle qualifie, la réservation devient un
acte visible en revue — dans le fichier qu'on ouvre de toute façon pour déclarer
l'événement.

**Et elle est vérifiée dans les deux sens.** Un nom réservé dont l'émetteur a
fini par atterrir doit sortir de la liste, sous peine de rougir. C'est la leçon
directe de la prose pourrie de la classe C : sans cette seconde assertion, la
liste se serait dégradée exactement comme le commentaire qu'elle remplace.

**Deux témoins structurels.** Un seuil de fichiers lus (le scan doit encore
trouver la passerelle — sinon TOUT paraîtrait orphelin, et l'on croirait à cent
défauts) et un témoin NÉGATIF : un nom inventé ne doit jamais être crédité. Sans
lui, une comparaison devenue universelle déclarerait tout émis, et la garde
serait verte à jamais.

### Le correctif sur la garde jumelle

Retirer `post:reaction-sync` du contrat a fait rougir
`socket-event-name-gate`… sur un **commentaire**. `SocialSocketManager` explique
en prose pourquoi il ne s'abonne PAS à cet événement, et l'explication cite la
ligne qu'elle dit ne pas écrire : `there is no socket.on("post:reaction-sync")`.

C'est la version miroir du piège que la garde jumelle documente déjà pour le
contrat : là-bas la prose pouvait faire passer un nom pour DÉCLARÉ, ici elle le
faisait passer pour ABONNÉ. Le dépouillement des commentaires a donc été ajouté
à la garde du cycle 76 — la précaution valait aux deux bouts du fil, et un seul
des deux l'avait.

Les commentaires eux-mêmes sont conservés : ils disent vrai, et disent
précisément ce que le contrat formalise maintenant.

---

## 4. Ce que ce cycle NE change PAS

- **Aucune ligne de passerelle.** Le serveur avait raison partout.
- **Aucun comportement produit.** Les cinq canaux retirés n'ont jamais
  transporté un seul octet ; ce qui les remplace était déjà là et déjà branché.
- **Les types d'ACK** (`PostReactionSyncEventData`,
  `CommentReactionSyncEventData`) et `ConversationOnlineUser` (encore utilisé par
  `ConversationStatsDTO`, canal `conversation:stats` bien vivant) : intacts.

---

## 5. Le symbole menteur, deuxième application

Android gardait deux flows de traduction, `translationCompleted` (fantôme) et
`translationInProgress` (réel). Le survivant a été renommé
**`translationReceived`** — d'après l'événement qui l'alimente vraiment, et
comme son homologue iOS.

Ce n'est pas de la cosmétique. C'est la leçon du cycle 76 appliquée telle
quelle : *« Renommer le symbole d'après l'événement RÉEL fait partie du
correctif. »* Un flow nommé `translationInProgress` alors qu'il porte la
traduction FINIE aurait perpétué, sous un autre nom, la fiction des deux étapes
que le canal fantôme avait installée.

---

## 6. Preuves

| gate | résultat |
|---|---|
| `socket-event-emitter-gate` AVANT correction | **ROUGE**, sur exactement les 5 défauts, aucun faux positif sur 124 noms |
| `socket-event-emitter-gate` APRÈS correction | vert (5/5) |
| `socket-event-name-gate` (garde jumelle, corrigée) | vert |
| `packages/shared` — suite complète | **98 fichiers / 2356 tests verts** |
| `tsc --noEmit` shared | vert |
| `apps/web` — 12 suites touchées | **556 tests verts** |
| `tsc --noEmit` gateway | vert |
| `tsc --noEmit` web (fichiers touchés) | 22 erreurs préexistantes → 21 |
| iOS / Android | via CI (`ios-pr-compile-gate`, workflow `Android`) |

Le témoin ROUGE est la preuve qui compte : la garde a été écrite AVANT la
correction et a listé les cinq défauts réels — sans un faux positif, y compris
sur les dix-neuf canaux d'appel qu'une première rédaction naïve accusait à tort.

---

## 7. Pistes laissées ouvertes

1. **`CALL_SIGNAL` est déclaré dans `SERVER_EVENTS` ET `CLIENT_EVENTS`.** Le
   `CLAUDE.md` de `packages/shared` interdit explicitement cette double
   déclaration sauf si les deux sens existent réellement — et prévient qu'une
   déclaration parasite « empêche d'écrire une garde "tout `CLIENT_EVENTS` a un
   handler gateway" sans liste d'exemptions ». C'est la troisième garde de la
   série, et `call:signal` est le cas à arbitrer d'abord (relais bidirectionnel
   réel, ou dérive ?).

2. **Les 26 autres événements de `MessageSocketManager` (Android) n'ont
   toujours aucun test de comportement** — piste 2 du cycle 76, inchangée. Leur
   NOM est couvert par la garde du cycle 76 ; leur décodage reste non prouvé.

3. **Défense en profondeur sur le relais `call:signal`** — piste 1 du cycle 75,
   toujours ouverte, toujours arbitrée de la même façon (coût d'une lecture DB
   sur le chemin le plus chaud).
