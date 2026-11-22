# Cycle 219 — la phrase qui gelait DEUX lacunes, et la seconde a survécu au lot qui dénonçait la première

Routine « amélioration continue du temps réel », 2026-11-22.
Suite directe des cycles 217 (#20336, web) et 218 (#20341, iOS / #20349, web).

| lot | plateforme | issue | état |
|---|---|---|---|
| la première connexion ne rattrape pas la FICHE d'une conversation | web | #20421 | livré |
| ce que la première connexion rattrape côté Android | Android | #20352 | **mesuré — pas de défaut** |

---

## Lot 1 — web (#20421)

### Comment il a été trouvé

En reposant, un cran PLUS BAS, la question qui avait rendu un défaut deux cycles
de suite. Les cycles 217 et 218 l'avaient posée de la **liste des familles** ;
celui-ci la pose de la **portée** que la branche de première connexion applique
à la racine des conversations.

| branche | ce qui est périmé sous `['conversations']` |
|---|---|
| reconnexion | **tout le préfixe** — liste, fiche, fil vivant, fenêtres ancrées |
| première authentification (`isListOrLiveThread`) | liste (long. 1) et fil VIVANT (long. 3 + `'messages'`) — **la fiche était exclue** |

### Le défaut : une raison VRAIE qui répondait à côté

`isListOrLiveThread` écrivait sa raison — « ni la case d'une conversation, ni
une fenêtre ancrée (#7420, du passé) : `message:new` ne les nourrit pas ».
Exacte, et sans rapport avec la question : **`message:new` n'est pas ce qui
nourrit la fiche.** Mesuré, **huit** écrivains temps réel du cache de détail
vivent dans `apps/web/src/lib/api/`, tous branchés sur la MÊME connexion dont la
première authentification déclenche ce rattrapage (`socket.ts` 913-936) :

| écrivain | événement | ce que la fiche perd |
|---|---|---|
| `realtime-encryption-regime` / `-changed` | `conversation:encryption-changed` | le RÉGIME de chiffrement (les deux invalident cette clé en `exact`) |
| `realtime-participant-rights` | `participant:rights-updated` | les droits d'envoi servis (#20277) |
| `realtime-viewer-role` | `participant:role-updated` | le rang du lecteur |
| `realtime-conversation-updated` | `conversation:updated` | nom, réglages, apparence |
| `realtime-membership` | départ / retour | `isMember` |
| `realtime-member-count` | arrivée / départ | le nombre de membres |
| `realtime-conversation-gone` | conversation disparue | la fiche entière (`removeQueries`) |

> **Un doc-comment qui justifie une exclusion en nommant l'unique famille qui ne
> s'applique pas est une AFFIRMATION sur la bonne question, pas sur la sienne.**
> La question n'est pas « cet événement nourrit-il cette clé ? » mais **« qu'est-ce
> qui NOURRIT cette clé ? »** — et elle se répond en relevant les écrivains, pas
> en vérifiant l'exemple cité.

### Ce que ça coûtait

Le plus cher est le **régime E2EE**. Une conversation passée en chiffrement de
bout en bout pendant la fenêtre laissait le client sur le régime CLAIR : la fiche
n'était pas relue, son `staleTime` de 30 s (défaut de `query-client.ts`) la tenait
fraîche, et le composeur envoyait en clair dans une conversation chiffrée — ce
que la passerelle REFUSE (fail-closed, #9224). L'utilisateur voit un envoi
rejeté sans comprendre pourquoi. Les droits d'envoi en sont le second : un
tiroir de composeur ouvert sur des droits périmés, exactement le symptôme que
#20277 avait fermé pour la lecture d'amorce.

**La fenêtre, à sa taille** — elle n'existe que pour un démarrage à froid qui
ouvre un fil AVANT que le socket ait fini de s'authentifier (une adresse de
conversation ouverte directement), et seulement si la fiche est déjà servie et
au repos à cet instant (`servedAndAtRest`). Une fiche encore en vol est
couverte, sa réponse étant postérieure à son départ. **Le cache étant PERSISTÉ**
(`dehydrate`/`hydrate`), une fiche restaurée du disque satisfait
`servedAndAtRest` dès la première peinture : c'est précisément le cas où la
fenêtre a emporté quelque chose.

### Et le témoin gelait la lacune — dans la phrase même qui raconte ce défaut

`socket-missed-catch-up.test.ts` § « la case d'une conversation et une fenêtre
ancrée ne sont pas touchées » portait ce commentaire :

> La cloche figurait ICI jusqu'à #18573, dans la même phrase que les deux
> assertions ci-dessous […] l'assertion gelait une lacune sous les apparences
> d'une décision.

**La cloche est sortie de cette phrase au cycle #18573 ; la fiche y est restée,
sur le même raisonnement, et le commentaire qui dénonce la forme était posé
au-dessus d'elle.** Quatrième exemplaire en trois cycles de la forme « un témoin
dont le “rien d'autre” n'a pas de raison écrite » (#20336 en avait retourné deux,
#20349 un).

> **Un lot qui sort UN membre d'une énumération fautive doit instruire les
> AUTRES membres de la même phrase.** Corriger l'exemplaire qui a motivé le lot
> laisse ses voisins sous la raison qu'on vient de déclarer insuffisante — et le
> commentaire qui explique la faute passée les rend plus crédibles, pas moins.

### Le correctif, et le cliquet de sa SECONDE affirmation

La fiche rejoint la portée par sa LONGUEUR (`queryKey.length === 2`). Les
fenêtres ancrées restent dehors : leur raison, elle, est juste et porte sur le
PASSÉ (#7420), que l'intervalle ne peut pas avoir modifié — les deux témoins se
séparent donc, chacun avec sa raison.

Ce discriminant porte **deux** affirmations, et la seconde est celle que
personne ne relit (leçon 261) : « aucune AUTRE famille n'a cette forme sous
cette racine ». Le cliquet la mesure, et **son discriminant est la NATURE du
second segment, pas son nom** :

- une FICHE est adressée par une VARIABLE — et **deux** sites du dépôt l'écrivent,
  le second (`lib/send/served-regime.ts`) par décision ÉCRITE, pour ne pas tirer
  les décodeurs des conversations dans son morceau. Les nommer un à un aurait
  fait rougir le cliquet au premier site qui choisit un autre nom de variable ;
- une SŒUR est nommée par une CHAÎNE LITTÉRALE (`['conversations', 'categories']`)
  — une famille, pas une ligne. C'est elle que la longueur 2 avalerait en silence.

**La portée du balayage est `apps/web/src` ENTIER, pas `lib/api/`.** Le premier
jet ne lisait que le répertoire du lot : il ne voyait ni
`lib/send/served-regime.ts` ni `components/send-sheet-directory.ts`, c'est-à-dire
que son relevé était plus étroit que son affirmation. C'est en l'élargissant que
le second écrivain de la clé est apparu — et avec lui le bon discriminant.

### Preuve du ROUGE (par mutation, à chaque fois)

| mutation | ce qui tombe |
|---|---|
| la production revient à l'ancienne portée (fiche exclue) | **2 rouges / 58 verts** — les deux témoins de la fiche, et eux seuls ; celui de la fenêtre ancrée reste vert |
| une SŒUR de longueur 2 entre en production | le cliquet de sœur, **seul** (1 rouge / 59 verts) |
| le producteur de la clé change de forme | le cliquet de producteur, plus les deux témoins de la fiche |

### Gates

| gate | résultat |
|---|---|
| `bun test src/lib/api/` | **4709 verts / 0 rouge** (4693 avant) |
| `tsc --noEmit` (web) | **0** |
| `bun run build` | OK |
| `measure-weight.mjs` | **exit 0** — aucun morceau ne grossit |

---

## Lot 2 — Android (#20352) : mesuré, **pas de défaut**, avec la raison de mécanisme

La question de #20341 posée sur Android. Elle avait rendu un défaut sur le web
et sur iOS ; **elle n'en rend pas ici, et c'est le piège de transposition qui
l'explique.**

### Les quatre porteurs de connexion, et leurs consommateurs

| porteur | première connexion ? | consommateurs |
|---|---|---|
| `didReconnect` (`SocketManager.kt:286`, `if (wasReconnect)`) | **non** | 2 — `ConversationSyncCoordinator`, `NotificationGapResyncCoordinator` |
| `SocialSocketManager.reconnected` | **non** | 4 — fil social, commentaires, détail, stories |
| `connected` (`SocketManager.kt:285`, inconditionnel) | **oui** | 9 |
| `connectionState` (`StateFlow`) | **oui** — un collecteur tardif y voit encore `CONNECTED` | 9 |

### Pourquoi le défaut d'iOS n'a pas de jumeau

**Le geste cher d'iOS — `flushOutbox` — n'est, sur Android, dans AUCUNE branche
socket.** Trois faits, chacun vérifié en relisant le code (et non sur la foi du
relevé) :

1. **La file est vidée par WorkManager, pas par la socket.** `OutboxFlushWorker`
   ne gate que sur `network.isOnline` (`:41`) et n'interroge le socket nulle part ;
   chaque `flushNow()` enfile un travail WorkManager contraint
   `NetworkType.CONNECTED`, **qui survit à la mort du process**. C'est exactement
   ce qui rendait le défaut iOS illimité dans le temps, et c'est ici porté par le
   framework.
2. **Le démarrage à froid le rejoue de toute façon.** Le contrat de
   `AppLifecycleHook.onForeground` le dit lui-même — « ON_START apres un passage
   en arriere-plan (**et au premier demarrage**) » — et `MeeshyApplication` câble
   ON_START → `lifecycleDispatcher.onForeground()` → `drain()`.
3. **Le `drop(1)` ne mange pas la première connexion.**
   `risingEdge = distinctUntilChanged().drop(1).filter { it }` sur un `StateFlow`
   jette la valeur INITIALE (`false`), pas le premier `true`.

**Et `ChatResyncController` — le point de départ cité par l'issue — est la
jumelle LEXICALE de `wireCatchUp`, pas sa jumelle de MÉCANISME** : il ne joue
qu'un geste, il le prend de `connected` (donc des DEUX fronts, sans asymétrie), et
la fenêtre d'un fil est de toute façon fermée par le flux cache-first que
l'ouverture du fil démarre. **Sur Android, la relecture appartient à l'écran et au
cycle de vie du process ; la branche socket n'est qu'un déclencheur de plus.**

Android porte même la propriété que #20336 et #20341 ont dû fabriquer — une
liste déclarée UNE fois — sous la forme de `SessionTransitionPlan.opening()`,
mais pour l'OUVERTURE DE SESSION et non pour la connexion socket.

---

## Ce que le cycle a mesuré SANS le corriger

Deux faits relevés sur Android qui **ne sont pas ce défaut**, et qui méritent
leur propre issue s'ils méritent une suite :

- **`AppForegroundSignal.entered` est un `MutableSharedFlow` sans rejeu**, dont
  l'émetteur est posé dans `Application.onCreate` tandis que ses trois abonnés ne
  s'abonnent qu'à l'attache de session — l'émission du premier plan est
  vraisemblablement perdue au froid. Sans conséquence ici (les trois gestes ont
  leur chemin d'écran), et c'est exactement le risque que
  `PreferencesSyncCoordinator` NOMME et contourne en lisant le `StateFlow`
  plutôt que le `SharedFlow`. **Lecture de code, non exécutée** (aucune chaîne
  Android joignable depuis un conteneur Linux). Issue : **#20422**.
- **Aucun équivalent Android du filigrane `changedSince` des préférences de
  conversation d'iOS** : elles arrivent dans la ligne de conversation, donc
  dépendent du filigrane `updatedSince` de la passe de liste et du réconcile
  complet périodique. **Identique sur les DEUX branches** — donc pas la forme de
  #20352. Issue : **#20423**.

## Suivi

- **#20353** (ouverte au cycle 218, toujours ouverte) — la portée de
  `UNQUEUED_FAMILY_VERDICT` (trois préfixes sur cinquante) et son discriminant
  documenté. **Mesuré dans ce cycle sans être livré** : les prefixes que la file
  TOUCHE sont `message:`, `reaction:`, `attachment:` et `link:message:`, quand la
  portée de la table est `message:`, `attachment:`, `attachment-status:`. Les
  deux prefixes manquants ne rendent **aucun** écart aujourd'hui (leurs seuls
  événements serveur sont tous enfilés), mais la portée reste écrite à la main là
  où elle pourrait être DÉRIVÉE de `DRAINED_EVENT`.
- iOS n'est pas relevé sur le lot 1 : la fenêtre y dépend des TTL de
  `CacheCoordinator`, non mesurés — même réserve qu'au cycle 218.
- `pack:installation-updated` sans écouteur web : **instruit par ce cycle, et
  TRANCHÉ PAR UNE AUTRE SESSION dans le même cycle — à son avantage.** Mon
  relevé a mesuré que l'asymétrie était INVENTORIÉE avec sa raison dans
  `socket-event-platform-parity-gate.test.ts` (« iOS et le web […] relisent leurs
  vitrines par REST »), que la mesure la confirmait (`packQueryKeys(domain).installed`,
  `staleTime` de 5 min), et j'en ai conclu que « la raison inventoriée tient, à
  cinq minutes près ». #20354, fusionné dans `dev` pendant ce cycle, a branché
  l'écouteur web (`lib/packs/installation-sync.ts`) et sorti le web de
  l'inventaire, qui ne porte plus qu'`absents: ['ios']`.

  > **C'était la moins bonne lecture, et la raison vaut d'être écrite** : j'ai
  > traité « l'asymétrie est inventoriée avec une raison » comme une réponse à
  > « cette fenêtre est-elle acceptable ? ». Ce sont deux questions, et la
  > seconde n'avait pas été posée. Le lot 1 de CE MÊME cycle ferme une fenêtre
  > structurellement IDENTIQUE — un `staleTime` qui tient un cache périmé après
  > qu'un événement a été manqué — ce qui rend l'indulgence d'autant moins
  > défendable. **Un inventaire d'asymétries dit ce qui a été DÉCIDÉ, jamais ce
  > qui est BON** ; le relire comme un verdict de produit est la même faute que
  > de lire un doc-comment de fenêtre comme une mesure (lot 1, et #20349 au
  > cycle 218).
