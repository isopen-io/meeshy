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
