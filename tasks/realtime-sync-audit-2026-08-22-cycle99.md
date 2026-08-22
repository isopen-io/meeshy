# Cycle 99 — un refus de jonction TRANSITOIRE effaçait la conversation

## Ce que le cycle 98 demandait, et où il envoyait chercher

Le cycle 98 laissait la « quatrième famille » — deux moitiés d'un même contrat,
chacune cohérente avec elle-même et fausses l'une contre l'autre — outillée sur
UNE paire seulement, et nommait les deux qui restaient : le sérialiseur/décodeur
Socket.IO, et le couple producteur passerelle / décodeurs iOS-Android.

**La première n'existe pas.** Vérifié : le dépôt n'a aucun parser Socket.IO
personnalisé. Le suivi est à retirer de la liste, pas à porter.

La seconde a livré le défaut de ce cycle, et il est en PRODUCTION — contrairement
aux cycles 95-98, dont le cycle 98 a lui-même établi que le sous-arbre
`dma-interoperability` n'est appelé de nulle part.

## Le défaut

`conversation:join-error` est émis par `ConversationHandler.handleConversationJoin`
sur **huit sites**, portant **sept motifs distincts** :

| motif | ce qu'il dit | famille |
|---|---|---|
| `not_a_member` (×2 sites) | tu n'es pas membre | appartenance |
| `banned` | tu es banni | appartenance |
| `no_longer_member` | tu n'es plus membre | appartenance |
| `rate_limited` | 30 jonctions/min dépassées | **transitoire** |
| `server_error` | la passerelle a échoué | **transitoire** |
| `not_authenticated` | session pas encore résolue | **transitoire** |
| `invalid_payload` | requête malformée | **transitoire** |

**Les deux consommateurs lisaient `reason` et n'en faisaient RIEN.**

- **web** (`use-socket-cache-sync.ts`) — destructurait `reason`, puis retirait
  inconditionnellement la conversation de la liste, supprimait son détail et
  **purgeait tout son historique de messages en cache**.
- **iOS** (`ConversationSocketHandler.swift`) — appelait
  `handleSocketAccessRevoked` sans regarder le motif : purge du cache de la
  conversation **et fermeture de la vue ouverte sous un bandeau « accès
  révoqué »**.

Donc : une limite de débit franchie — ce qu'une tempête de reconnexion produit
mécaniquement, puisqu'elle rejoint toutes les rooms d'un coup — éjectait
l'utilisateur du fil qu'il était en train de lire et jetait son cache. Sur un
produit qui promet la lecture hors ligne, c'est le cache qui porte cette
promesse qu'on détruisait, sur un incident passager.

`not_authenticated` est au moins aussi atteignable : il se lève quand la carte
`connectedUsers` n'a pas encore la session du socket — exactement la fenêtre où
les clients rejoignent leurs rooms.

## La cause, et elle est structurelle

**`conversation:join-error` n'était déclaré NULLE PART.** Pas de type de payload,
aucune entrée dans `ServerToClientEvents`. Ses deux consommateurs en avaient donc
chacun transcrit la forme en lisant le producteur — et tous deux avaient conclu la
même chose de travers.

Pourquoi rien ne l'exigeait : `MeeshySocketIOManager` déclare bien son `io` avec
les deux maps, donc ce qu'il émet lui-même est vérifié. **Les handlers, eux,
importaient le `Socket` NU de `socket.io`**, dont les génériques valent
`DefaultEventsMap` — `[event: string]: (...args: any[]) => void`. Sur un tel
socket, `socket.emit(n'importe quoi, n'importe quoi)` compile.

> Un contrat que seul l'orchestrateur honore n'est pas un contrat, c'est une
> convention. Les décodeurs iOS et Android sont pourtant écrits contre lui.

## Pourquoi les témoins existants ne pouvaient pas le voir

Le web AVAIT trois témoins sur ce gestionnaire. Ils exerçaient `banned` et
`not_a_member` — **les deux seuls motifs où purger est juste**. La couverture
était réelle et la conclusion fausse : les témoins attestaient que la purge a
lieu, jamais qu'elle est conditionnelle.

C'est la forme du § *« un témoin qui ne peut pas tomber »* appliquée à un
échantillon : ce n'est pas le témoin qui était faible, c'est le jeu de motifs
qu'il traversait.

## Ce qui a été fait

**1. Le contrat, déclaré** (`packages/shared`)
- `CONVERSATION_JOIN_ERROR_REASONS` — les sept motifs, énumérés.
- `ConversationJoinErrorEventData` + entrée dans `ServerToClientEvents`.
- `isMembershipDeniedJoinError()` — **la seule règle** qui sépare les deux
  familles, partagée par les deux consommateurs TypeScript.

**2. Le producteur, contraint** (`services/gateway`)
- `src/socketio/typed-socket.ts` : `MeeshySocket` / `MeeshyIOServer`, le socket
  d'un handler typé contre le contrat partagé.
- `ConversationHandler` l'emploie. **Mesuré** : un `reason` mal orthographié
  (`'bnned'`) fait désormais échouer `tsc` en nommant les sept valeurs admises.
- Le littéral nu de `_resyncReadStatusToSocket` est annoté
  `ReadStatusUpdatedEventData`, comme ses quatre frères émetteurs.

**3. Les consommateurs, corrigés**
- web : la purge est gardée par `isMembershipDeniedJoinError`. Le `CustomEvent`
  part toujours — l'UI doit pouvoir dire « réessaie ».
- iOS SDK : `ConversationJoinErrorEvent.isMembershipDenied`, jumeau Swift de la
  règle partagée.
- iOS app : `handleSocketAccessRevoked` n'est plus appelé que sur un refus
  d'appartenance ; un transitoire journalise et ne détruit rien.

## La décision qui compte : où tombe l'INCONNU

Liste d'**autorisation**, jamais d'exclusion — un motif qu'un client ne connaît
pas rend `false`, donc ne détruit pas. Deux raisons :

1. Les deux erreurs ne coûtent pas la même chose. Purger à tort détruit des
   données locales que rien ne rattrape hors ligne ; garder à tort un cache
   périmé se corrige au prochain 403 REST.
2. **C'est la règle de maison déjà écrite dans ce contrat**, pour exactement la
   même raison : « un pont ILLISIBLE n'est pas un pont ABSENT — ne pas savoir
   lire n'autorise pas à détruire » (`BridgeAnnouncement`).

## ROUGE prouvé

- **web** : les quatre motifs transitoires, avant correctif ⇒ **4/4 tombent**
  (`Received array: []` — la conversation avait disparu de la liste). Après ⇒
  93/93, les trois témoins de purge légitime préexistants compris.
- **passerelle** : `reason: 'bnned'` injecté ⇒ `tsc` rouge (TS2820, avec la liste
  des sept). Mutation revertie ⇒ 0 erreur.
- **shared** : le module absent ⇒ la suite ne se charge pas. Après ⇒ 15/15.

## Gates

| gate | résultat |
|---|---|
| `tsc --noEmit` passerelle | **0 erreur** |
| `tsc --noEmit` web | **1241 erreurs = BASELINE À L'IDENTIQUE** (diff vide, mesuré par `git stash`) |
| suite shared | **102 fichiers / 2449 témoins / 0 échec** |
| couverture shared | stmts 98.78 · branches 94.99 · fn 98.6 · lignes 99.2 — **tous les seuils passés** |
| web ciblé | **144/144** (`use-socket-cache-sync` + `presence.service`) |
| suite complète passerelle | voir § ci-dessous |

**Le web porte 1241 erreurs `tsc` préexistantes**, presque toutes dans des
fichiers de test. Ce n'est pas un gate du CI ; je l'ai mesuré par différence
contre l'arbre propre pour prouver que ce lot n'en ajoute aucune. Le compte est
relevé, pas hérité.

## Ce que ce lot NE prouve pas

- **Le socket typé ne rattrape pas la nullité.** La passerelle compile sous
  `strictNullChecks: false` : `participantId: string | null` passe dans un champ
  déclaré `string`. C'est pourquoi le site d'appel de `_resyncReadStatusToSocket`
  doit prouver la non-nullité — il la prouve (les deux branches du contrôle
  d'appartenance rendent la main avant), mais le typage n'en est pas témoin.
- **Les témoins Swift n'ont pas tourné ici** : pas de Xcode sous Linux. Ils sont
  gatés par `sdk-tests.yml` (suite SDK complète) et `ios.yml` (compile de l'app).

## Suivis

- [ ] **Un seul handler est typé.** `MeeshySocket` existe ; `ConversationHandler`
      l'emploie. Les autres handlers (`MessageHandler`, `ReactionHandler`,
      `StatusHandler`, `LocationHandler`, `SocialEventsHandler`,
      `CallEventsHandler`, `AttachmentReactionHandler`, `Comment/PostReactionHandler`)
      importent toujours le `Socket` nu. Les basculer un par un — chacun peut
      révéler un événement non déclaré, comme celui-ci.
- [ ] **Après un refus transitoire, iOS ne re-tente pas la jonction.** Le fil
      reste ouvert et son cache intact (c'est le gain), mais sa room n'est pas
      rejointe tant que le cycle de reconnexion du socket ne repasse pas. Un
      re-essai borné avec retrait exponentiel sur les seuls motifs transitoires
      est la suite naturelle — non fait ici faute de pouvoir l'exercer.
- [ ] **Android n'a pas été instruit.** Le cycle 92 bis a montré qu'un
      consommateur Android peut exister et n'avoir jamais fonctionné. Relever si
      un décodeur `conversation:join-error` y existe, et lui porter la règle.
- [ ] **La quatrième famille : le sérialiseur/décodeur Socket.IO n'existe pas**
      (vérifié). Reste le couple producteur passerelle / décodeurs iOS-Android,
      dont ce cycle n'a instruit qu'UN événement sur les ~158 du contrat.
- [ ] Hérités du cycle 98, non touchés : les 3 suites `dma-interoperability`
      rouges et exclues (56/114) ; le suivi des clés distantes d'`asymmetricRatchet` ;
      la pré-clé unique non CONSOMMÉE par le répondeur ;
      `SignalKeyManager.registrationId` tiré au hasard au constructeur ;
      préfixe `F` et sel du HKDF.

## Une observation de méthode, pour le prochain cycle

En cherchant, j'ai relevé une asymétrie de codecs de dates qui n'est PAS un
défaut vivant, et je la consigne pour qu'elle ne soit pas rouverte à froid : les
frontières de fil (socket, REST) décodent les dates avec une stratégie `.custom`
qui accepte les fractions de seconde, tandis que les caches locaux encodent ET
décodent en `.iso8601` Foundation, qui formate à la seconde entière. Les deux
moitiés de chaque cache étant accordées entre elles, le round-trip est cohérent ;
la perte de précision ne franchit aucune comparaison d'ordre, les messages étant
persistés en COLONNES GRDB (millisecondes préservées), pas en JSON. **Piège armé,
pas panne** — et à traiter comme tel si un jour un type ordonné par date transite
par `GRDBCacheStore`.
