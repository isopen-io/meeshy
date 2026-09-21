# Lecture, non-lecture, accusés et progression média — sur iOS et web-v2, validés sur staging

Date : 2026-09-21. Porteur : directive du 2026-09-21 (matin). Workflow : `.claude/workflows/meeshy-lecture-et-accuses.js`.

## 1. La directive

1. **Une gestion claire et précise du marquage lu / non lu** des notifications, des conversations et
   des messages, avec un **marqueur des nouveaux messages en couleur primaire** (« — messages non
   lus — ») qui gouverne où s'ouvre une conversation et ce que disent les résumés.
2. **Une gestion complète des indicateurs** : émis, reçu, vu ; nombre d'ouvertures d'une pièce ;
   lecture d'un audio / d'une vidéo et **jusqu'où** c'est lu.
3. Sur **iOS (`apps/ios`) et web-v2 (`apps/web-v2`)** — le legacy `apps/web` ne bouge plus, le
   Kotlin natif est gelé. Validé **au simulateur local connecté à staging** et **sur
   `staging.meeshy.me`**. En boucle jusqu'à un état acceptable.
4. Livraison continue : chaque lot vert part vers `dev` **par PR** (une session voisine veille le
   verdict de `dev` ; rien n'y est poussé directement). À la fin, sur feu vert explicite du
   porteur : `dev` → `main` → Xcode Cloud.

## 2. Ce que le relevé du 2026-09-21 établit (trois explorations, fichier:ligne dans les rapports)

| capacité | gateway | iOS | web-v2 |
|---|---|---|---|
| marquage lu, compteur non-lu | mûr : `POST/GET /conversations/:id/receipts`, `ConversationReadCursor.unreadCount`, `read-status:updated`, `conversation:unread-updated` | mûr : `ConversationReadLedger` (source unique, #6998), `SeenMessageAccumulator` 300 ms via Outbox | **manuel seulement** (geste de la Lentille) ; aucun `receipts` à l'ouverture, au scroll, au retour au premier plan |
| frontière de lecture (premier non-lu) | `lastReadMessageId` en base et dans le contrat (`packages/shared/types/conversation.ts:606`), **servi par aucune route** | absent ; ouverture en bas ; `onResumeThread` « firstUnread » ne lit pas l'état de lecture (`ConversationView.swift:1869`) | absent ; ouverture en bas par design (`thread.tsx:593`) |
| accusés ✓ / ✓✓ | mûr (agrégé en push, nominatif en pull) | mûr (`DeliveryStatusResolver`, tous-ou-rien en groupe, « Vu par ») | rendu OK ; **`read-status:updated` jamais écouté** |
| ouvertures d'une pièce | mûr (`AttachmentStatusEntry`) | image/document **envoyés, jamais affichés** (`MessageViewsDetailView` filtre audio/vidéo) | aucune fiche « infos » ; `consumeViewOnce` **jamais appelé** |
| progression audio/vidéo | mûr (`lastPlayPositionMs`, segments, `listenedComplete`) | envoyée ; reprise **par appareil** (UserDefaults), jamais réhydratée | affichée en lecture seule ; **ni reprise ni envoi** |
| temps réel social | complet | complet | `post:*`, `comment:added` livrés ; **Réels ignorés** par les événements d'autrui ; `story:reacted`, `comment:updated/deleted/liked`, `post:reaction-*` jamais écoutés |
| badge | `aps.badge` = **notifications** non lues | badge d'icône = **conversations** non lues | pastille flottante = notifications |

## 3. Décisions du porteur (2026-09-21) — opposables

- **D-L1 — le badge d'icône compte les CONVERSATIONS non lues** (hors muettes), comme l'app iOS et
  comme WhatsApp ; la cloche garde son propre compte de notifications ; le serveur aligne
  `aps.badge` sur cette projection. Une demande d'ami n'incrémente que la cloche. Tranche #7001.
- **D-L2 — une conversation qui a des non-lus s'ouvre SUR le séparateur**, toujours, quel que soit
  le nombre ; tout lu ⇒ ouverture en bas comme aujourd'hui. Une seule règle, partagée web/iOS.
- **D-L3 — le séparateur est en couleur PRIMAIRE** (jeton primaire du design system, pas l'accent
  de la conversation), libellé « N messages non lus » dans les sept langues.

## 4. Les lots (G = gateway, S = shared, W = web-v2, I = iOS), ordonnés par dépendance

| clé | résultat attendu | dépend |
|---|---|---|
| G1 | La frontière de lecture (`lastReadMessageId`, `lastReadAt`, `lastReadMessageCreatedAt`) est servie par la liste et le détail de conversation | — |
| G2 | Un seul calcul du non-lu alimente la liste et le push, avec un témoin de parité | — |
| G3 | `aps.badge` compte les conversations non lues, comme l'app (D-L1, Closes #7001) | — |
| S1 | La loi du premier non-lu est UNE fonction de `packages/shared` (`firstUnreadBoundary`), avec son miroir Swift dans `MeeshySDK` | G1 |
| W1 | Ouvrir un fil, le faire défiler, revenir au premier plan marquent lu (`receipts` avec `caughtUpToMessageId`), en optimiste | — |
| W2 | Les coches ✓✓ bougent en direct (`read-status:updated`, `message:pending-delivered`) | — |
| W3 | Le fil porte « — N messages non lus — » en couleur primaire et s'ouvre dessus (D-L2, D-L3) | S1, G1 |
| I1 | Même chose sur iOS ; `onResumeThread` cible le vrai premier non-lu | S1, G1 |
| W4 | Le titre d'onglet et `navigator.setAppBadge` portent les conversations non lues (D-L1) | — |
| W5 | Ouvrir une vue unique le dit au serveur (`consumeViewOnce`) — un F5 ne la rouvre plus | — |
| W6 | Un audio / une vidéo reprend à sa position et rapporte sa progression (`POST /attachments/:id/status`) | — |
| I3 | La reprise audio/vidéo est réhydratée depuis `currentUserConsumption` (multi-appareil) | — |
| W7 | Fiche « Infos du message » : reçu par, vu par, écouté / regardé jusqu'où, ouvertures | — |
| I2 | Les ouvertures d'une image ou d'un document s'affichent dans « Vu par » | — |
| W8 | Les Réels apprennent ce que le Flux apprend ; `story:reacted/unreacted`, `comment:updated/deleted/liked`, `post:reaction-*` mettent l'écran à jour | — |
| I4 | #6997, #6999, #7000 sont vérifiées contre le code, closes avec preuve ou terminées | — |
| I5 | Le badge d'icône iOS compte les CONVERSATIONS non lues, hors muettes — le même nombre que `aps.badge` (D-L1, Closes #7236 ; ajouté le 2026-09-21 après la revue de G3) | G3 |

Trois chaînes parallèles, une par plateforme (worktree dédié chacune) ; à l'intérieur d'une chaîne,
les lots sont séquentiels. Chaque lot : sa branche `lot/<clé>` depuis `origin/dev`, son issue, sa
PR vers `dev` avec auto-merge. Un lot dépendant d'un lot non encore fusionné fusionne la branche du
lot amont dans la sienne (la PR porte alors les deux, GitHub résout à la fusion de l'amont).

## 5. Le workflow — phases d'un tour

1. **Synchroniser** — `fetch origin dev` dans chaque worktree de chaîne ; relevé des PR et branches
   vivantes des autres sessions ; `packages/shared/dist` reconstruit.
2. **Cadrer** (sonnet) — chaque lot est vérifié contre l'arbre VIVANT : déjà livré, tenu ailleurs,
   ou à faire (avec ce qui existe déjà, fichier:ligne).
3. **Ouvrir** (haiku) — une issue par lot à faire (ou l'issue existante), milestone #103 pour la
   famille A, milestone « Un envoi dit s'il est reçu, vu, écouté — et jusqu'où » pour la famille B,
   projet « Meeshy — pilotage » `Status = In Progress`. Le commentaire de #7001 porte D-L1.
4. **Par chaîne, lot après lot** : Développer en TDD (sonnet ; haiku si le cadrage le juge petit) →
   Revue-correction (opus, corrige lui-même) → Gates + Livrer (sonnet : gates de la plateforme,
   commit `Closes #n`, PR, auto-merge, commentaire de clôture). Un seul build iOS à la fois.
5. **Valider** (opus) — attendre les fusions et le déploiement staging ; scénario à deux comptes :
   A sur Chrome (`staging.meeshy.me`), B sur le simulateur `Meeshy Ref-Native` pointé sur
   `gate.staging.meeshy.me` ; envois, lectures, coches, séparateur, vocal écouté à moitié, vue
   unique, badge. Chaque échec devient un lot du tour suivant.
6. **Livrer final** (opus, `livrer_main: true` seulement, donné par le porteur) — `dev` → `main` →
   Xcode Cloud.

## 6. Ce que le chantier ne fait pas

Les 3 366 lignes de tests notifications hors gate (#7154, #7165 — tenues ailleurs) ; le Kotlin
natif ; le legacy `apps/web` ; toute écriture directe sur `dev`.
