# Cycle 118 — La galerie de médias ne bornait rien

## Le défaut

`GET /conversations/:id/attachments` — la galerie de médias d'une conversation — est un **second
lecteur des messages** : il en sert les pièces jointes, avec `fileUrl`, `originalName`, les
dimensions et la transcription des audios. Le premier lecteur (`GET /conversations/:id/messages`)
applique trois exclusions. La galerie n'en appliquait **aucune**.

**Un membre INSCRIT entré par un lien `allowViewHistory:false` obtenait la galerie entière de la
conversation** — tout l'avant-jointure compris. La branche « membre enregistré » ne vérifiait que
l'adhésion, et rien d'autre. Un inscrit qui rejoint par un lien porte pourtant un
`participant.shareLinkId` au même titre qu'un anonyme (`routes/conversations/sharing.ts:620`, écrit
avec `type: 'user'`) : le lien lui ferme l'historique dans la liste des messages, et la galerie le
lui rouvrait en entier.

C'est le trou que `gwcontract-09` (c) avait fermé pour `/sync` au cycle 115 — « la règle est portée
par la LIGNE PARTICIPANT, pas par le type d'identité » — dans une route que personne n'avait
rouverte depuis.

**Symétriquement, la branche anonyme se trompait en sens INVERSE** : elle rendait `403` sur toute la
galerie dès que le lien fermait l'historique. Ce même participant voit pourtant dans `GET messages`
les messages postés depuis son arrivée, pièces jointes comprises — la galerie les lui cachait
toutes. Un plancher rétrécit une lecture ; il ne la refuse pas.

### Pourquoi (a) restait invisible

La branche anonyme lisait `participant.anonymousSession.shareLinkId` — la copie **embarquée** —
quand `messages.ts`, `/sync` et le module de plancher lisent la colonne `participant.shareLinkId`.
La jointure anonyme écrit le fait aux deux endroits (`routes/anonymous.ts:398` et `:410`), donc
cette branche marchait ; mais seule la colonne existe pour un inscrit. Lire la copie, c'était lire
un champ qui n'existe que là où le contrôle fonctionnait déjà.

### Deux exclusions de plus, hors lien de partage

- **Tombstone `deletedAt`** — jamais appliquée : un média restait listé, URL comprise, après la
  suppression POUR TOUS du message qui le portait.
- **Masquage personnel** (`clear-history`, `delete-for-me`) — jamais appliqué non plus, alors que
  `personalHistoryFilter` existe et sert déjà quatre autres surfaces.

## Ce qui l'a fait apparaître

`gwcontract-14`, une convergence P3 : faire lire à `messages.ts` la règle du module au lieu de sa
copie inline. Le recensement des lecteurs de `allowViewHistory` en a trouvé un **troisième**, non
inventorié — et celui-là ne divergeait pas seulement, il fuyait.

## Cycle 114-bis — PR #2968 (même run)

*Renuméroté 114-bis à la fusion : une autre branche (`claude/keen-hamilton-dl8km4`) tournait en
parallèle et a livré son propre « cycle 115 » (`GET /sync` ouvert aux sessions anonymes, leçon 239),
mergé avant celui-ci. Les deux existent, ils ne se recouvrent pas.*

`fix(ios/sync): l'effectif d'une conversation dérivait à vie, l'effectif ABSOLU du serveur étant ignoré`

Trouvé en appliquant le réflexe que le cycle 114 venait de dégager (« quel champ le serveur
envoie-t-il que le client ne lit pas ? ») — deuxième instance de la MÊME classe de défaut, en
quelques minutes.

- Les 4 structs d'appartenance décodent `memberCount: Int?`.
- `ConversationListViewModel.memberCountAfterMembershipEvent(current:absolute:delta:)` pose
  l'absolu ; le delta n'est plus qu'un repli pour un gateway antérieur au contrat.
- L'absolu tranche `membershipEnded` / `membershipRestored` ; plancher à zéro sur les deux branches.
- CHANGELOG : entrée pour ce correctif, entrée pour le volet iOS du cycle 114, et retrait du
  « Reste ouvert : le client iOS » devenu faux.

TDD : 5 témoins de décodage SDK + 5 côté app.

## Cycle 114-ter — non-lu iOS : une seule vérité locale, et elle tombe à l'ouverture

Signalé par l'utilisateur : « quand j'ouvre une conversation, le compteur doit IMMÉDIATEMENT être à
0, sans glitch de 99 ». Audit des porteurs du compteur en local — il y en avait trois, et aucun
chemin d'ouverture ne les touchait tous.

| Porteur | Écrivait sur ouverture ? |
|---|---|
| Cache disque (`ConversationSyncEngine`, seul à appliquer `reconcileUnread`) | oui, mais en différé |
| Store RAM (`ConversationStore`, SoT déclarée de `userState`) | **non** |
| Lignes `@Published` (`ConversationListViewModel`) | non (seulement via le rechargement débouncé) |
| Badge d'icône + widget (`NotificationCoordinator`) | **non** |

- `ConversationReadSignal` (app) — point d'écriture UNIQUE de la lecture locale, les 4 surfaces.
  Appelé par `start()` (ouverture), la quick-action push et le widget. Aucun appel réseau : l'accusé
  de lecture serveur garde son exigence d'exactitude et part séparément.
- `reconcileUnread` devient la règle des TROIS porteurs (cache, store, lignes), et sa frontière est
  monotone (MAX) au lieu de `local ?? incoming` — qui la faisait reculer sur le chemin store.
- Miroir synchrone de l'agrégat inter-conversations : `setCurrentlyOpenConversation` republie dans
  le tour de boucle de l'ouverture, sinon l'abonné suivant recevait le total d'avant.
- Le geste « Marquer comme lu » de la LISTE reste sur `store.apply(.markAsRead)` : c'est le seul
  chemin dont le zéro doit rester annulable par le rollback 4xx.

TDD : 3 témoins store, 1 règle, 2 agrégat, 3 lignes de liste, 1 ouverture.

**Renversement de politique assumé** : `docs/superpowers/specs/2026-07-24-read-exactness-design.md`
énonçait « le badge ne se vide plus à l'ouverture ». Il se vide de nouveau — mais LOCALEMENT
seulement. L'exactitude que la fiche protège porte sur ce qu'on DÉCLARE aux autres, pas sur sa
propre pastille ; c'est la confusion des deux qui produisait les deux bugs symétriques.

## Reste ouvert (candidats des prochains cycles)

- **Auditer les PRESCRIPTIONS écrites dans `packages/shared/types/`** (voir leçon 238, corollaire de
  méthode). Les commentaires du type « à POSER, pas à incrémenter », « absent ⇒ `true` », « ne
  jamais soustraire » prescrivent un comportement CLIENT : chacun nomme un bug possible, et se
  vérifie par un grep du nom du champ chez chaque client. Deux instances trouvées en un run — la
  troisième est probablement déjà écrite quelque part.

- **Constat 2 ci-dessus** — masquage personnel au niveau message : décision produit à prendre.
- **`GET /sync`** — reste sans client ; le brancher côté iOS est un chantier à part entière
  (le SDK a son propre `ConversationSyncEngine` sur `/conversations?updatedSince=`).
- **Android** — aucun delta `updatedSince` ; pas d'écart symétrique à combler aujourd'hui.
- **`conversation:left` n'a pas de branche « c'est MOI qui suis parti »** (candidat prochain cycle) :
  `ConversationSyncEngine.startSocketRelay` n'y fait qu'un
  `cache.participants.invalidate(for:)` — le pendant TEMPS RÉEL du correctif de ce cycle manque
  donc. Un départ déclenché depuis un autre appareil ne retire la conversation de la liste qu'au
  prochain delta (ce que la PR #2966 rend enfin possible), pas immédiatement. `conversation:closed`
  et `conversation:deleted`, eux, ont bien leur branche de retrait — l'asymétrie est l'écart.
  À vérifier avant de coder : le device qui vient de quitter est-il encore dans la room au moment
  de l'émission (`emitToConversationParticipants`, `routes/conversations/leave.ts:91`) ? Si non,
  le canal correct est `broadcastToUser`, et le correctif est côté gateway.

## Livré

- **`services/shareLinkHistoryFloor.ts`** — `historyFloorFor(join, link)`, la règle PURE et
  désormais unique. `loadShareLinkHistoryFloors` (forme ensembliste, `/sync`) l'appelle ;
  `messages.ts` l'appelle ; la galerie l'appelle via `loadShareLinkHistoryFloor` (forme unitaire).
  Les deux cas d'absence — pas de lien, lien INTROUVABLE — sont énoncés une fois et testés.
- **`routes/conversations/messages.ts`** (gwcontract-14) — la copie inline disparaît. La séparation
  que la fiche prescrivait est tenue en laissant la règle **sans chargeur imposé** : `/sync` lit
  tous les liens d'un coup, `messages.ts` lit LE lien avec les colonnes de la porte (`expiresAt`,
  `maxUses`) dont il a besoin par ailleurs. Un chargeur commun aurait ajouté un aller-retour à l'un
  des deux ; la règle partagée n'en ajoute aucun. **La porte (403) reste entièrement dans la route.**
- **`routes/attachments/metadata.ts`** — une seule résolution de participant pour les deux branches,
  la colonne canonique, le plancher et le masquage personnel recouverts en `Promise.all`.
- **`AttachmentService.getConversationAttachments`** — prend un `messageFilter` **opaque** et pose
  ses deux invariants (`conversationId`, `deletedAt: null`) **après** le spread : un appelant ne peut
  qu'ajouter, jamais sortir de la conversation ni ressusciter une tombstone. Gelé par test.

### Ce qui a été REFUSÉ

Faire porter au module la décision de réponse (403 expiry/quota) en plus du filtre. La fiche le
disait, et c'est juste : la porte et le plancher répondent à deux questions différentes sur la même
ligne. Les empiler aurait donné au module de filtre le pouvoir de terminer une requête HTTP.

Appliquer la porte à la galerie « par symétrie ». Un lien expiré ferme une ENTRÉE ; il ne révoque
pas ce qu'un participant déjà entré a le droit de lire. `GET messages` en décide ainsi, la galerie
suit — et c'est le comportement inchangé.

## TDD

RED d'abord, vérifié : 8 tests rouges (5 sur le plancher de la galerie, 2 sur le masquage, 1 sur la
suite service qui ne compilait plus), plus la suite du module rouge sur `historyFloorFor`
introuvable. Un test existant disait `403 quand le lien ne permet pas l'historique` — il encodait le
défaut (b) ; il est réécrit pour dire la règle, avec la raison en commentaire.

Ajouté aussi à `messages-routes.test.ts` : deux tests qui pinnent le plancher DANS la clause. La
suite ne vérifiait que `reply.send` — « plancher appliqué » et « plancher perdu » s'y terminaient de
la même façon, donc la convergence n'y aurait rien cassé de visible.

## Gates

| Gate | Résultat |
|---|---|
| prisma generate + shared `bun run build` | OK (prérequis) |
| gateway jest **complet** | **710 suites / 17 376 tests verts** |
| gateway `tsc --noEmit` | **0 erreur** |
| couverture `metadata.ts` | **100 %** lignes (91,6 % branches) |
| couverture `shareLinkHistoryFloor.ts` | **100 %** lignes |
| couverture `AttachmentService.ts` | **100 %** lignes/branches |
| couverture globale gateway | 95,08 % stmts / 95,75 % lignes |

## Reste ouvert après ce cycle

- **`bun run lint` (gateway) ne s'exécute pas** — aucun `eslint.config.js` dans `services/gateway/`,
  et le script pointe sur `eslint src/`. ESLint 10 refuse l'ancien format. **Antérieur à ce cycle**,
  et la CI ne lance pas ce script : le gate lint n'existe donc pas pour la gateway. À instruire.
- **iOS — fossile INERTE** : `SocketNotificationEvent.isRead` (`MessageSocketManager.swift:1115`),
  toujours `nil`, zéro consommateur. Non livrable depuis un runner Linux (Xcode).
- **Volets iOS de `gwcontract-05` et `gwcontract-13`** — miroir Swift des deux prédicats bulk, à
  livrer ENSEMBLE. Hérité des cycles 116/117.
- Hérités : `net-02` (P1, iOS), `sync-01` (aucun client n'appelle encore `/sync`), arbitrage produit
  `delete-for-me` au niveau message (cycle 114).
