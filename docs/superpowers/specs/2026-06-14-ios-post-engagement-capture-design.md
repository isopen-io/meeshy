# iOS — Capture d'engagement des posts (story / status / reel / post)

- **Date** : 2026-06-14 (rev. 2026-06-15 — fusion de la spec « Reels métriques/partage »)
- **Statut** : Phase 1 (capture) — Lot 1 SDK **livré sur `main`** ; Lots 2-4 à faire. Phase 2 (agrégation + affichage + partage tracé + deep link) **spécifiée §19-22**, à exécuter APRÈS les Lots 2-4.
- **Périmètre Phase 1** : iOS d'abord. Capture seule (instrumentation + envoi durable). `Post`/`PostView`/`PostImpression` intacts.
- **Périmètre Phase 2 (2026-06-15)** : agrégation des compteurs (vues totales/qualifiées, complétions), badge œil, partage tracé **par-partageur** (`/l/<token>`), deep link & page de redirection intelligente. Cette phase **lève** la contrainte « ne rien toucher à `Post` » (ajout de compteurs dénormalisés dérivés) — voir §19.
- **Décision de fusion (2026-06-15)** : la spec autonome `2026-06-15-reels-engagement-playback-metrics-design.md` (proposait `PostPlaybackSession`/`/posts/:id/playback`, **doublon** d'`EngagementSession`) est **abandonnée** ; son contenu de valeur (agrégation, partage tracé, deep link, fixes de bugs) est fusionné ici en §19-22.

---

## 1. Contexte & problème

L'app capture aujourd'hui des **vues** (`POST /posts/:id/view` → `PostView @@unique(postId,userId)` + `viewCount`) et des **impressions** de feed (`POST /posts/impressions/batch`). Trois manques :

1. **Le temps passé sur le contenu n'est jamais collecté.** `PostView.duration` existe et `PostService.viewPost(postId:duration:)` encode déjà `duration` dans le body — mais **aucun appelant ne passe de durée** (toujours `nil`). Champ mort.
2. **Aucune capture des micro-actions de parcours** (ouverture commentaires, tap profil, replay, mute, expand, pause, swipe-away) qui ne sont pas déjà persistées par les tables d'interaction.
3. **Aucune mesure de watch-time vidéo** côté post (le seul watch-time existant, `SharedAVPlayerManager.reportWatchProgress` → `/attachments/:id/status`, est scopé attachment pour la reprise de lecture, pas analytics post).

On veut capturer, pour chaque **consommation réelle** d'un contenu, une **session d'engagement** structurée (temps + actions), persistée durablement, envoyée par batch au backend, dans le respect du consentement utilisateur.

---

## 2. Objectifs / non-objectifs

**Objectifs (cette itération, iOS)**
- Instrumenter les 4 surfaces de consommation : post detail, reels, story viewer, status bubble.
- Mesurer le **dwell-time** (temps écran au premier plan) et le **watch-time** vidéo (heartbeat).
- Capturer les **micro-actions** horodatées de parcours.
- Transport **durable** (survit aux kills), idempotent, gated réseau et **gated consentement**.
- Endpoint backend d'**ingestion minimal** (append-only, upsert idempotent) pour que ce soit testable end-to-end.

**Non-objectifs (phases ultérieures)**
- Agrégation / calcul de tendances / vues uniques dérivées des sessions (le backend stocke brut ; l'agrégation viendra).
- UI d'affichage des stats/tendances dans l'app.
- Parité web.
- Flux d'events atomiques entièrement re-sessionnisables façon Snowplow (voir §15 — évolution possible).

---

## 3. Décisions actées

| # | Décision | Choix |
|---|----------|-------|
| D1 | Granularité de capture | **Session d'engagement structurée** (temps + actions) |
| D2 | Périmètre itération | **Capture seule** (instrumentation + envoi) |
| D3 | Transport | **Outbox SQLite durable** (réutilise l'infra `OutboxFlusher`) |
| D4 | Définition du temps | **Watch-time vidéo + dwell-time écran** |
| D5 | Stockage backend | **Nouveau modèle `PostEngagement` append-only** (existant intact) |
| D6 | Endpoint | **Ingestion minimale livrée maintenant** |
| D7 | Watch-time vidéo | **Heartbeat ~10 s** + start + position finale (pas de mécanisme VAST séparé) |
| D8 | Seuil session qualifiée | `dwellMs ≥ 1000 ms` OU vidéo (`watchMs ≥ 2000 ms` ou `completed`), filtré **client** |
| D9 | Consentement | **Gating pré-capture** sur `PrivacyPreferences.allowAnalytics` |

---

## 4. Alignement SOTA (synthèse)

Comparé aux pratiques 2023-2026 (Snowplow, Segment, Amplitude, GA4, Adobe/Vimeo/Conviva, IAB VAST, EDPB) :

- **Déjà SOTA, à garder** : outbox durable SQLite + batch + upsert/idempotence ; agrégation reportée côté serveur (schema-on-read).
- **Corrections intégrées pour atteindre le SOTA** :
  - **Heartbeat vidéo** (D7) au lieu d'un `watchMs` unique au finalize → résilience au crash + courbe de rétention reconstructible serveur. (Adobe/Vimeo ~10 s.)
  - **Gating consentement pré-capture** (D9) → ePrivacy Art. 5(3) / EDPB : opt-in avant écriture sur le device pour l'UE ; dwell/watch pour ranker un feed = profilage.
  - **Seuil de session qualifiée** (D8) → filtrer le bruit sub-seconde (plancher de dwell, démarrage à ≥ 50 % visible).
- **Volontairement hors-scope v1** : flux d'events atomiques bruts entièrement re-sessionnisables (gold-plating pour une v1 capture-first ; l'enveloppe session + actions horodatées + samples heartbeat couvrent ~90 % du bénéfice).

---

## 5. Architecture — séparation SDK / App

Règle de pureté du projet : SDK = atomes / services low-level / models stateless ; App = orchestration UX (« quand faire X »).

**SDK (`MeeshySDK` core)**
- `EngagementSession`, `EngagementAction`, `WatchSample`, `Surface`, `ContentType` (réutilise `PostType`) — value types `Codable, Sendable, Hashable`.
- `EngagementOutbox` — persistance SQLite append-only sur fichier dédié, cycle de vie `.open`/`.finalized`, boot sweep, purge/cap. Prend des sessions opaques.
- `EngagementFlusher` — **2ᵉ instance de `OutboxFlusher`** pointée sur le writer engagement (l'API accepte déjà `any DatabaseWriter`).
- `PostService.recordEngagement(_ sessions: [EngagementSession])` → `POST /posts/engagement/batch`.

**App (`apps/ios/Meeshy`)**
- `EngagementTracker` (`@MainActor` singleton) : décide **quand** `begin/checkpoint/end`, accumule dwell + actions, fait le pont watch-time, applique le seuil qualifié et le gating consentement, pousse vers l'outbox SDK.
- Modificateur SwiftUI `.trackEngagement(postId:contentType:surface:)` branché sur les surfaces single-active (via `adaptiveOnChange`, jamais `onChange` brut).
- `SharedAVPlayerManager` (déjà dans **MeeshyUI**, même couche que le tracker) gagne un seam de heartbeat (voir §7).

---

## 6. Modèle d'événement

```
EngagementSession {
  sessionId: String        // UUID client → idempotence (upsert backend)
  userId: String           // propriétaire (anti-fuite cross-user au flush)
  postId: String
  contentType: ContentType // = PostType : POST | REEL | STORY | STATUS (raw MAJUSCULE)
  surface: Surface         // detail | reels | storyViewer | statusBubble
  startedAt: Date          // wall-clock (ISO8601) — horodatage seulement
  dwellMs: Int             // durée monotone (DispatchTime), foreground only
  watchMs: Int?            // nil pour non-vidéo ; sinon temps de lecture réel
  mediaDurationMs: Int?    // nil si inconnu/non mesuré (0/NaN → nil)
  completed: Bool          // vidéo lue ~100 %
  truncated: Bool          // true = session récupérée après crash (open orpheline)
  consent: String          // état de consentement au moment de la capture
  actions: [EngagementAction]
  watchSamples: [WatchSample]   // heartbeats (vide pour non-vidéo)
}

EngagementAction { type: String, atMs: Int }     // atMs = offset monotone vs startedAt
WatchSample      { positionMs: Int, atMs: Int }  // position de lecture à l'instant atMs
```

**Marqueurs vs source de vérité** : les actions `reacted` / `shared` / `bookmarked` / `commented` sont loguées comme **marqueurs de parcours** uniquement. Les tables `PostReaction` / `PostComment` / `PostBookmark` restent la **source de vérité** des compteurs. Zéro double comptage.

**Types d'actions (v1)** : `openedComments`, `tappedProfile`, `expandedText`, `replayed`, `muted`, `unmuted`, `paused`, `resumed`, `swipedAway`, `reacted`, `shared`, `bookmarked`, `commented`, `reported`. Extensible (string).

---

## 7. Mesure du temps

### Dwell-time
- **Surfaces single-active uniquement** : post detail, reels, story viewer, status bubble. **Pas sur les cellules de feed** — `onAppear`/`onDisappear` en `LazyVStack` se déclenchent au rendu (prefetch/recyclage), pas à la visibilité → sessions fantômes. Le feed garde son système d'**impressions** existant.
- **Horloge monotone** (`DispatchTime`) pour la durée ; wall-clock seulement pour `startedAt` (immunité aux corrections NTP).
- **Foreground only** : pause au `scenePhase != .active`, reprise au retour.
- **Règle « la surface au sommet possède l'horloge »** : status bubble au-dessus d'un detail → le dwell du detail est **mis en pause** tant que la bubble est active (pas deux horloges simultanées).

### Watch-time (D7 — heartbeat)
- Un **seul player global** (`SharedAVPlayerManager.shared`, un seul `attachmentId`, pas de `currentId` publié — donc le « lire le scalaire au changement » initial est abandonné).
- **Seam SDK** : `SharedAVPlayerManager` émet, via un callback/`@Published` léger, un `WatchSample(positionMs, atMs)` :
  - à `play()` (position de départ, souvent 0),
  - toutes les **~10 s** tant que `isPlaying` + app au premier plan (les surfaces vidéo trackées — reels/story — sont plein écran, donc visibilité ≈ 100 % par construction ; le seuil géométrique ≥ 50 % ne concernerait qu'une future extension dwell-feed, hors-scope),
  - à `pause()` / `didPlayToEndTime` (position finale, `completed`),
  - à chaque bouclage de replay (frontière de boucle).
- La **surface** relie `(postId ↔ attachmentId actif)` et route les samples vers la session via `EngagementTracker`. **Le tracker n'observe jamais le player** (pas de stream 10 Hz). Au `end()`, la surface fournit aussi un snapshot final `currentTime`/`duration` lu **synchronement** sur `@MainActor`.
- `watchMs` = somme dérivée des intervalles de lecture effective (reconstructible depuis `watchSamples`). `mediaDurationMs` = `nil` si `duration` ≤ 0 ou NaN-dérivé-0.

### Contrat à deux plans (anti double-comptage backend)
- `/attachments/:id/status` = **position de reprise** (scope attachment, UX). **Inchangé.**
- `engagement.watchMs` / `watchSamples` = **signal analytics** (scope post). Alimente **uniquement** `PostEngagement`. Ne jamais sommer les deux côté backend. À documenter explicitement dans le contrat backend.

---

## 8. Transport durable

- **Fichier SQLite dédié** `engagement_outbox` (séparé du pool messages pour ne pas concurrencer le dirty-tracking/vacuum), piloté par une **2ᵉ instance de `OutboxFlusher`** + son propre scheduler dérivé de `OutboxRetryScheduler`. Nouveau pool exposé via `DependencyContainer`.
- **Ne pas étendre `OutboxKind`/`OutboxRecord`** (raw-values stables liées au `MutationLog` gateway). `EngagementRecord` + `EngagementOutboxDispatcher` dédiés.
- **Cycle de vie à 2 états** (colonne `lifecycle` distincte du `status` outbox) :
  - `begin()` → ligne `lifecycle = .open` (**invisible au dispatch** : le SELECT du flusher filtre `lifecycle == .finalized && status == .pending`).
  - `checkpoint()` (périodique + au passage background) → met à jour `dwellMs`/`watchSamples` de la ligne `.open` (perte max = depuis le dernier checkpoint).
  - `end()` → même `sessionId`, `lifecycle = .finalized` + `status = .pending` → déclenche flush.
  - **Boot sweep** (ordre : sweep-open → finalize-stale → flush) : lignes `.open` orphelines (crash) finalisées `truncated = true` avec dernier checkpoint ; ne **jamais** retoucher une ligne déjà `.finalized` (évite double-finalize si crash après `end()` mais avant flush).
- **Déclencheurs de flush** : à l'`end()`/enqueue + au **foreground** (`resumeFromBackground`, là où l'outbox messages flush déjà) + à la **reconnexion réseau** (`NetworkConditionMonitor`, via `MainActor.run`). **Pas de network-flush au `.background`** (l'OS suspend, URLSession tué) — au background : `checkpointAll()` seulement.
- **Backoff** exponentiel + jitter ; liste de codes non-retry (4xx définitifs).
- **Purge** : âge > 7 jours + cap par nombre de lignes (~5000, éviction FIFO des plus vieilles finalisées), dans le drain path ou le hook `DatabaseMaintenance`.
- **Garantie** : at-least-once → doublons possibles côté réseau, neutralisés par l'**upsert sur `sessionId`** côté backend.

---

## 9. Consentement & privacy (D9)

- **Gating à `begin()`** : si `PrivacyPreferences.allowAnalytics == false`, **aucune ligne n'est créée** (pas de stockage device → conforme ePrivacy Art. 5(3)).
- **Révocation en cours de route** : à la bascule OFF, purge des lignes engagement en file (open + finalized non flushées).
- **Stamp de consentement** par ligne (`consent`) pour enforcement serveur (drop/route).
- **Défaut régional** : `allowAnalytics` par défaut = `true` aujourd'hui ; pour l'UE, le **défaut opt-in** (default=false UE) est une décision à valider par le responsable privacy. L'ingénierie n'est pas bloquée : la capture **honore le flag** quel que soit son défaut. *(Décision ouverte — voir §16.)*
- ATT/IDFA : non concerné (first-party, keyé JWT, pas de tracking cross-app).

---

## 10. Vue unique & relation vue ↔ session

- La **vue unique** reste gérée par le backend existant : on continue d'appeler `viewPost` (→ `PostView @@unique` + `viewCount`). **`viewPost` reste SANS `duration`** (ping « j'ai ouvert » idempotent). Le dwell vit **uniquement** dans la session.
- Vue et session **desync légitimement** : une vue est unique-par-(post,user) à vie ; une session est émise à chaque consommation (replay J+5 = nouvelle session, pas de nouvelle vue). C'est correct et désiré. Corrélation au query-time via `postId` + `userId` (LEFT JOIN), pas à la capture.

---

## 11. Multi-surface & changement d'utilisateur

- **Clé des sessions actives** : par `sessionId` (surface + postId en attributs), **pas** `[Surface: Session]` (deux posts différents sur le même type de surface se collisionneraient → corruption silencieuse).
- **Topmost owns the clock** : la surface au sommet accumule ; les sous-jacentes sont en pause (§7).
- **Reel autoplay scroll rapide** : le seuil qualifié (D8) jette les sessions sub-seuil avant création de ligne durable.
- **Logout / changement d'utilisateur** :
  - Sessions ouvertes au logout : abandonnées (acceptable).
  - `CacheCoordinator.reset()` **doit** purger `engagement_outbox` (décision explicite) ; sinon les lignes de l'utilisateur A seraient flushées sous le JWT de B.
  - Filet de sécurité : chaque ligne stampée `userId` ; au flush, **drop** si l'utilisateur courant diffère.

---

## 12. Backend minimal (D5/D6)

**Modèle Prisma `PostEngagement` (append-only — n'altère rien d'existant)**
```prisma
model PostEngagement {
  id              String   @id @default(auto()) @map("_id") @db.ObjectId
  sessionId       String   @unique          // idempotence
  postId          String   @db.ObjectId
  userId          String   @db.ObjectId
  contentType     String                    // POST | REEL | STORY | STATUS
  surface         String
  startedAt       DateTime
  dwellMs         Int
  watchMs         Int?
  mediaDurationMs Int?
  completed       Boolean  @default(false)
  truncated       Boolean  @default(false)
  consent         String?
  actions         Json     @default("[]")
  watchSamples    Json     @default("[]")
  createdAt       DateTime @default(now())

  post Post @relation(fields: [postId], references: [id], onDelete: Cascade)
  user User @relation("UserPostEngagements", fields: [userId], references: [id])

  @@index([postId])
  @@index([userId])
  @@index([postId, createdAt])   // tendances futures
}
```
`Post` / `PostView` / `PostImpression` : **intacts.**

**Endpoint `POST /posts/engagement/batch`**
- Auth requise (`requiredAuth`), rate-limité.
- Body `{ sessions: EngagementSession[] }`, **cap de batch explicite** (lignes plus lourdes que les 50 IDs d'impression — ex. 50 sessions max/requête).
- **Upsert sur `sessionId`** (non négociable : gère l'ACK perdu après 200).
- **Skip-and-continue** si un `postId` n'existe plus (post supprimé entre begin et flush) — ne pas 400 tout le batch.
- Réponse mappée au schema Fastify (cf. règle « Fastify strips undeclared fields »).
- **Pas d'agrégation/tendances.** `viewCount` non touché.

---

## 13. Invariants (et comment ils tiennent)

1. **Zéro modif structures existantes** — `PostEngagement` est neuf ; `viewPost`/`PostView`/`viewCount` inchangés (pas de `duration` ajouté).
2. **Jamais perdu** — persist `.open` à `begin()` + checkpoints + boot sweep ; flush au foreground/reconnexion. *(Cas logout : perte assumée des lignes du user sortant via reset — voir §11.)*
3. **Jamais doublé** — `sessionId` + upsert backend + claim atomique outbox ; boot sweep ne touche que `.open`.
4. **Zéro double comptage** — actions = marqueurs (tables = vérité) ; dwell engagement-only ; `engagement.watchMs` ≠ `/attachments/:id/status` (plans séparés).

---

## 14. Notes de concurrence Swift 6

- `EngagementSession`/`EngagementAction`/`WatchSample`/`Surface` = value types `Sendable` (pas de type référence). Tests JSON avec `.sortedKeys` (key order non déterministe iOS 26).
- `@MainActor EngagementTracker` → `actor EngagementOutbox` : la session traverse la frontière (Sendable OK). Closure de dispatch `@Sendable` : ne capture pas le tracker MainActor ; lire `NetworkConditionMonitor.shared` via `await MainActor.run`.
- **Pas de `deinit` isolé** : finalisation par `end()` explicite + boot sweep (jamais en `deinit`).
- `scenePhase` via `adaptiveOnChange` (jamais `.onChange` brut). Au `.background` → `checkpointAll()`, pas de network-flush.
- Heartbeat : callbacks `addPeriodicTimeObserver` off-main déjà wrappés `Task { @MainActor }` dans le manager — le tracker ne touche pas ce chemin.
- Cadence de flush via le pattern `Task`-based `OutboxRetryScheduler` (pas un nouveau `Timer`).
- Nouveaux fichiers app : entrées **pbxproj manuelles** (classic xcodeproj objectVersion 63) ; nouveaux fichiers SDK via `Package.swift`.

---

## 15. Plan de tests (TDD) & lots

> Re-scope honnête : le cycle `.open/.finalized`, le dispatcher engagement, le boot-sweep, la purge et le 2ᵉ pool sont du **code neuf** ; seul `OutboxFlusher` (multi-instance) est réutilisé tel quel. **Le seam heartbeat du player est un prérequis du lot tracker, pas du lot surfaces.**

- **Lot 1 — SDK modèle + outbox**
  - `EngagementSession` Codable round-trip (`.sortedKeys`), wire format `PostType` MAJUSCULE.
  - `EngagementOutbox` : persist `.open`/`.finalized`, dispatch ignore `.open`, boot sweep (finalize-stale `truncated`), purge âge + cap FIFO, backoff, drop sur user mismatch.
  - `PostService.recordEngagement` (mock `APIClient`).
- **Lot 2 — Player heartbeat seam + App tracker**
  - Seam heartbeat `SharedAVPlayerManager` (samples start/10s/pause/end/loop).
  - `EngagementTracker` (dwell monotone, foreground pause, topmost-owns-clock, actions `atMs`, pont watch-time, seuil qualifié D8, gating consentement D9, checkpoint background) avec `MockEngagementOutbox`.
- **Lot 3 — Surfaces**
  - Branchement detail / reels / story / status via `.trackEngagement` (+ entrées pbxproj). Feed inchangé (impressions). `viewPost` reste duration-less.
- **Lot 4 — Backend**
  - Modèle Prisma `PostEngagement` + endpoint ingestion (auth, upsert idempotent, skip-and-continue post supprimé, cap batch, append-only, `viewCount` non touché).

Chaque lot laisse le code dans un état fonctionnel et testable (`./apps/ios/meeshy.sh test` vert avant commit).

---

## 16. Risques & décisions ouvertes

- **Défaut régional du consentement** (§9) : default opt-in UE (`allowAnalytics=false` UE) à valider par le responsable privacy. N'empêche pas le développement (la capture honore le flag).
- **Estimation** : le « réutilise l'outbox » est en réalité majoritairement du code neuf (cf. §15) — refléter dans le chiffrage.
- **Volume backend** : suivre la taille de `PostEngagement` après mise en prod ; prévoir TTL/rollups quand la phase d'agrégation arrivera.

---

## 17. Évolutions futures (hors-scope v1)

- Flux d'events atomiques entièrement re-sessionnisables (schema-on-read total façon Snowplow) si le besoin de redéfinir les métriques a posteriori dépasse ce que `watchSamples` + `actions` permettent.
- Agrégation serveur : vues uniques dérivées, courbes de rétention, tendances, « vues qualifiées » (IAB/MRC).
- UI in-app des stats/tendances (créateur).
- Parité web (impressions au scroll + sessions detail/story).

---

## 18. Points de contact (fichiers)

**SDK** : `packages/MeeshySDK/Sources/MeeshySDK/Services/PostService.swift` (`recordEngagement`), `…/Persistence/OutboxFlusher.swift` (2ᵉ instance), `…/Persistence/OutboxRecord.swift` (ne pas étendre `OutboxKind`), `…/Networking/NetworkConditionMonitor.swift` (gate), nouveaux fichiers `EngagementSession.swift` / `EngagementOutbox.swift` / `EngagementOutboxDispatcher.swift`. **MeeshyUI** : `…/Media/SharedAVPlayerManager.swift` (seam heartbeat).

**App** : `apps/ios/Meeshy/MeeshyApp.swift` (scenePhase `adaptiveOnChange`), `…/Services/BackgroundTransitionCoordinator.swift` (`resumeFromBackground` flush), `…/Services/OutboxDispatcher.swift` (pattern `OutboxFlushTrigger`/`OutboxRetryScheduler`), surfaces `…/Views/PostDetailView.swift`, `…/Views/ReelsPlayerView.swift`, `…/Features/Story/…/StoryViewerView.swift`, `…/Services/StatusBubbleController.swift`, `…/Views/FeedView.swift` (inchangé — impressions), nouveaux `EngagementTracker.swift` / `TrackEngagementModifier.swift`. **DI** : `DependencyContainer` (2ᵉ pool), `CacheCoordinator` (reset purge engagement).

**Backend** : `packages/shared/prisma/schema.prisma` (`PostEngagement`), `services/gateway/src/routes/posts/interactions.ts` (endpoint batch), `services/gateway/src/services/PostService.ts` (persistance).

---

# PHASE 2 — Agrégation, affichage & partage tracé (extension 2026-06-15)

> **Prérequis** : Lots 2-4 (capture) livrés. La Phase 2 **dérive** des compteurs depuis `PostEngagement` (déjà ingéré) et `PostImpression` (existant), et ajoute le partage tracé + deep link (indépendants de la capture). À exécuter **après** les Lots 2-4. Cette phase ajoute des **compteurs dénormalisés sur `Post`** (dérivés) — la contrainte « ne rien toucher à `Post` » de Phase 1 est levée ici.

## 19. Agrégation des compteurs & affichage

### 19.1 Taxonomie — vocabulaire produit ↔ noms techniques

⚠️ **Collision de nommage à connaître** : le code a **déjà** `Post.impressionCount`/`PostImpression` = apparitions **feed** (scroll). Le produit appelle ça « listingCount ». Le produit appelle « impressionCount » les apparitions **plein écran** — qui sont un **autre** compteur. Pour éviter l'ambiguïté on fige des noms techniques distincts ; le mapping est explicite (nom produit **à confirmer**).

| Produit (mots de l'utilisateur) | Nom technique (spec) | +1 quand | Source de données | Affiché |
|---|---|---|---|---|
| listingCount | `impressionCount` **existant** (`PostImpression`) | apparition dans le viewport du feed | inchangé (`POST /posts/impressions/batch`, `FeedView`) | analytics auteur |
| **impressionCount** | 🆕 `reelOpenCount` (dénormalisé dérivé) | apparition plein écran (page active du lecteur reel) | count `PostEngagement` `surface=reels` | **badge œil plein écran** |
| viewCount (total qualifié) | 🆕 `qualifiedViewCount` (dénormalisé dérivé) | session qualifiée (règle §19.3) | `PostEngagement` qualifiées | analytics auteur |
| (vues uniques — inchangé) | `viewCount` **existant** (`PostView`) | 1ʳᵉ ouverture par user | `viewPost` **inchangé** (cf. spec §10) | viewers list / stories |
| playCount | 🆕 `playCount` (dénormalisé dérivé) | complétion lecture (chaque fin/boucle) | `PostEngagement.watchSamples`/`completed` | analytics auteur |

> **Choix clé (résout le blast-radius)** : on **ne resémantise PAS** `viewCount` (il reste les vues uniques `PostView`, intactes — conforme à Phase 1 §10). Les « vues totales » deviennent des **nouveaux** compteurs dénormalisés explicites. Cela évite de casser tout consommateur de `viewCount`, et évite de toucher `PostView`/`viewPost` (donc pas de problème d'anonymes sur `PostView`).

### 19.2 Dérivation (à l'ingestion, idempotente)

Les compteurs dénormalisés sont mis à jour **à l'ingestion d'une nouvelle `PostEngagement`**, dans `recordEngagementBatch` (Lot 4) :

- L'upsert d'engagement est keyé `sessionId` (immuable une fois finalisée). On incrémente les compteurs du `Post` **uniquement à l'INSERT** (pas aux updates/retries) → idempotent. Implémentation : différencier insert vs update **dans la transaction** (ex. `create`-puis-catch-P2002, ou comparer `modifiedCount`/`upsertedId`), incrémenter seulement sur insert réel.
- À l'insert d'une session : `reelOpenCount += 1` si `surface=reels` ; `playCount += completions` (cf. §19.3) ; `qualifiedViewCount += 1` si `qualifiedView` (§19.3).
- Pas de delta cumulatif (les sessions sont immuables → pas le bug de double-comptage par delta de l'ancienne proposition `PostPlaybackSession`).

### 19.3 Règle de qualification serveur (`qualifiedView`) & `completions`

Calculées depuis la session reçue (`watchMs`, `watchSamples`, `mediaDurationMs`, `dwellMs`, `mediaType`) :

```
maxPositionMs   = max(watchSamples.positionMs) ou 0
SHORT_VIDEO_MS  = 8300   // pivot 30%↔2,5s (tunable, à confirmer produit)
positionThresh  = (mediaDurationMs > 0 && mediaDurationMs < SHORT_VIDEO_MS) ? 0.90 : 0.30
qualifiedView   = (mediaDurationMs > 0 && maxPositionMs / mediaDurationMs >= positionThresh)   // média temporel
              ||  (isVideoOrAudio && (watchMs ?? 0) >= 2500)
              ||  (!isVideoOrAudio && dwellMs >= 2500)                                          // contenu direct
completions     = nombre de fins de lecture de la session (depuis watchSamples `complete`/boucles)
```

- **Seuil de position adaptatif** : courtes vidéos (`< SHORT_VIDEO_MS`) → 90 % (anti scrub-éclair) ; longues → 30 % (où `watchMs ≥ 2,5 s` domine en lecture normale).
- `mediaDurationMs` null/0 → seule la branche temps (2,5 s) s'applique.
- **TOTAL** : chaque session qualifiée compte (pas de dédup par user) ; les viewers uniques restent `PostView`.
- Le seuil client D8 (spec §3, `dwell≥1000`/`watch≥2000`/`completed`) reste un **plancher d'envoi** (anti-bruit) — distinct de la qualification serveur.

### 19.4 Compteurs Prisma & transport

```prisma
model Post {
  // ... existant : viewCount, impressionCount, ...
  reelOpenCount     Int @default(0)   // 🆕 apparitions plein écran (badge œil)
  qualifiedViewCount Int @default(0)  // 🆕 vues totales qualifiées
  playCount         Int @default(0)   // 🆕 complétions de lecture
}
```

- Exposer ces 3 compteurs dans `GET /posts/feed` (route sans `response` schema → pas de strip ; vérifier qu'ils sont bien dans le `select`/`include` de `PostFeedService`).
- **iOS `FeedPost`** : ajouter `reelOpenCount`/`qualifiedViewCount`/`playCount` comme **propriétés** (n'existent pas) **+ aux `CodingKeys`** (corrige aussi le cold-start des compteurs existants `repostCount/bookmarkCount/shareCount/viewCount`, absents des `CodingKeys`). Mapper dans `APIPost.toFeedPost`.
- **Badge œil** (`ReelActionRail`, `ReelsPlayerView`) : rebind sur **`reelOpenCount`** (aujourd'hui lit `reel.viewCount`). Faire ce rebind **avant** tout changement sémantique pour ne pas changer le nombre affiché en silence.

### 19.5 Fixes connexes (indépendants, à faire dans cette phase)

- **Bug bookmark** : `bookmarkCount` incrémenté sur upsert **inconditionnel** (`PostService.ts` `bookmarkPost`) → remplacer par **`create` + catch P2002** (l'`upsert` Prisma ne distingue pas créé/maj). Décrément `unbookmark` : guard `≥ 0` (ou recount autoritatif `bookmarkCount = count(PostBookmark)` comme `likeCount`).

## 20. Partage tracé par-partageur

### 20.1 Modèle — `TrackingLink` cible typée + index unique PARTIEL

```prisma
enum TrackingTargetType { POST REEL STORY STATUS CONVERSATION PROFILE EXTERNAL }

model TrackingLink {
  // ... existant (token, originalUrl, createdBy, totalClicks, uniqueClicks, expiresAt, isActive, ...)
  targetType TrackingTargetType @default(EXTERNAL)  // 🆕
  targetId   String?            @db.ObjectId         // 🆕 postId / conversationId / userId
  // PAS de @@unique Prisma (champs nullables → index Mongo non-partiel interdit, cf. clientMessageId schema.prisma)
}
```

**Unicité « 1 lien par (cible × partageur) » = index unique PARTIEL** créé en migration `.mongodb.js` (modèle `2026-05-09-message-client-id.mongodb.js`) :

```js
db.TrackingLink.createIndex(
  { targetId: 1, createdBy: 1 },                                  // clé SANS targetType (déterminé par targetId)
  { unique: true, partialFilterExpression: {
      targetId:  { $type: 'objectId' },
      createdBy: { $type: 'objectId' } } }
);
```

- **Clé `{targetId, createdBy}`** (pas `targetType`) : `targetId` détermine déjà le post → évite qu'un post changeant de type (REEL↔POST) crée un 2ᵉ lien (BUG 3.1).
- Filtre `$type:'objectId'` (pas `'string'`) : le backfill **doit** écrire des `ObjectId` BSON, pas des strings, sinon hors index (BUG 3.3).
- Anonymes (`createdBy null`) : non indexés → **lien attribué = compte requis** ; les anonymes obtiennent un lien `EXTERNAL` non réutilisé (ne JAMAIS `findFirst({createdBy:null})` → attribution croisée).

### 20.2 Création / réutilisation (`POST /posts/:id/share`)

- résout `targetType` depuis le `Post` (REEL/POST/STORY/STATUS), `targetId=postId`, `createdBy=sharerId`.
- **upsert applicatif en transaction** : `findFirst({targetId,createdBy})` → réutilise le token ; sinon `create` (token 6 chars) **puis `shareCount += 1` dans la même transaction** ; **catch P2002** (race) → re-`findFirst`, **pas** de ré-incrément (BUG 4.1).
- `shareCount` = dénormalisé, +1 **uniquement à la création** d'un lien (1ʳᵉ fois par partageur distinct) — réutilise le pattern du fix bookmark. Décrément éventuel : guard `≥ 0`.

### 20.3 Stats renvoyées au partageur

`GET /posts/:id/share` (ou réponse du POST) → `{ shortUrl, token, totalClicks, uniqueClicks, lastClickedAt }` du lien du **partageur courant** (déjà tous sur `TrackingLink`). Déclarer `additionalProperties:true` ou les champs explicitement (anti-strip Fastify).

### 20.4 Cycle de vie

- Suppression de post = **soft-delete** (`deletedAt`) → `onDelete: Cascade` ne se déclenche **pas**. Invalider (`isActive=false`) les `TrackingLink` du post **explicitement dans `deletePost`** (BUG 12.4). Idem `PostEngagement` : la cascade est cosmétique sous soft-delete (documenter).

## 21. Deep link, résolution & page de redirection intelligente

### 21.1 BUG existant à corriger — collision `/l/<token>` (tracking ↔ invitation)

Aujourd'hui : `/l/<x>` sert **deux** espaces sans désambiguïsation — `TrackingLink.token` (partage de post, `shortUrl=/l/<token>`) ET `ConversationShareLink.linkId` (invitation). L'AASA déclare `/l/*` ; iOS `DeepLinkRouter` route `/l/` → **toujours** `.joinLink`. ⇒ **un partage de reel ouvert dans l'app iOS lance le flux join → 404, le reel ne s'ouvre jamais, le clic n'est pas tracé** (bug actif en prod).

**Fix** : résolution **serveur** unifiée + routage iOS **asynchrone par type**.

### 21.2 Résolution serveur — `GET /tracking-links/:token/resolve`

Renvoie `{ kind, targetType, targetId, originalUrl, sharerId, isActive, expiresAt }` sans rediriger :
- tente **`TrackingLink`** par `token` ; sinon **fallback `ConversationShareLink`** par `linkId`/`identifier` → `kind=conversation`.
- lien **expiré/inactif** → `{ isActive:false }` (HTTP 200, pas 404 silencieux) ; la page/app affiche « lien expiré » + fallback `originalUrl`.
- **Déclarer tous les champs** dans le `response` schema Fastify (`sharerId` est nouveau → fort risque de strip).

### 21.3 Page de redirection intelligente (web `/l/[token]`)

Fait évoluer la page existante (capture déjà les **35 champs** `collectBrowserData` + `detectSocialSource`) :
1. **capture** max + `POST /tracking-links/:token/click` (attribution `sharerId`).
2. **résout** via `/resolve`.
3. **route** par `targetType` : REEL/POST/STORY → ouverture app (Universal Link iOS, sinon `meeshy://p/<id>`/`meeshy://s/<id>`), **fallback web** `/feeds/post/<id>` ; CONVERSATION → `/c/<id>` (ou flux join existant) ; PROFILE → `/u/<username>` ; EXTERNAL → `originalUrl`.
4. **smart-banner / app-open + fallback** après timeout.

### 21.4 Capture côté app iOS (parité tracking) + dédup

- iOS ne parse plus `/l/<x>` en `.joinLink` localement : pose un `pendingDeepLink = .trackedLink(token)` **neutre**, résolu via `/resolve`, et **seul `targetType` décide** (reel viewer / postDetail / story / join conversation). Les invitations restent `.joinLink` **via la résolution** (`kind=conversation`).
- **Enregistre le clic** (`POST /tracking-links/:token/click`) avec la capture device iOS disponible (UA app, `Locale`, modèle, timezone, langue(s), résolution, connexion). **Best-effort, non bloquant** pour la navigation.
- **Cold-launch / offline (M7)** : machine d'état — pose le `pendingTrackedLink` ; après `hasCheckedSession`, résout (retry + file offline) ; `/click` fire-and-forget ; échec `/resolve` offline → garder le pending, réessayer au prochain `.active` ; navigation reel attend le `targetType` (spinner court + timeout → fallback web). Le chemin **non-authentifié** cold-launch doit gérer REEL/POST/STORY (aujourd'hui `handleGuestDeepLink` ne gère que join/chat/magic).
- **Dédup clic app/web (M9, BUG 12.3)** : le `deviceFingerprint` app ≠ web (inputs différents) → **ne pas** prétendre dédupliquer app↔web par fingerprint. Dédup : `(token, userId)` si authentifié (cas app) ; sinon `(token, ipAddress, fenêtre)`. Assumer que app-intercept et page-web restent comptés séparément (cas Handoff rare).

### 21.5 Parité de capture (M8) — limite assumée

Quand iOS **intercepte** le Universal Link, la page web (35 champs `navigator.*`) **n'est jamais chargée** → la capture app est un **sous-ensemble** nommé (pas de `navigator.*`/referrer social/fingerprint web). L'objectif « capture maximale » est **structurellement dégradé** pour les liens ouverts in-app (majorité mobile) — l'**assumer** explicitement et ne pas comparer naïvement volumes web vs app en analytics.

## 22. Lots d'implémentation Phase 2 (après Lots 2-4)

- **Lot 5 — Agrégation & affichage** : compteurs `reelOpenCount/qualifiedViewCount/playCount` (Prisma + dérivation idempotente dans `recordEngagementBatch` + règle §19.3), exposition feed, propriétés `FeedPost` + CodingKeys + mapper, rebind badge œil. Fix bookmark. + tests.
- **Lot 6 — Partage tracé par-partageur** : `TrackingLink.targetType/targetId` + migration `.mongodb.js` (backfill `ObjectId` + **dédup legacy avant `createIndex`** + index partiel), upsert par-partageur (catch P2002, `shareCount` à la création), `GET /posts/:id/share`, invalidation au soft-delete. + tests.
- **Lot 7 — Deep link & redirection** : `GET /tracking-links/:token/resolve` (TrackingLink + fallback ConversationShareLink), page `/l/[token]` intelligente (routage typé + smart-banner/fallback), `DeepLinkRouter` (`.trackedLink` + routage async par `targetType`, cold-launch/offline, capture clic), dédup `/click`. + tests.

Ordre : **Lots 2-4 (capture) → Lot 5 → (Lot 6 ∥ Lot 7)**. Lot 6 et Lot 7 sont indépendants de la capture (peuvent démarrer dès que prioritaire), mais le badge (Lot 5) dépend du Lot 4 (backend ingestion).

## 23. Bugs réels corrigés par cette phase (synthèse review Opus 2026-06-15)

| Bug | Statut |
|---|---|
| Double-comptage delta (ancienne `PostPlaybackSession`) | ✅ éliminé — `EngagementSession` immuable + dérivation à l'insert |
| `@@unique` sur nullables MongoDB | ✅ index **partiel** `{targetId,createdBy}` |
| Migration legacy doublons → `createIndex` plante | ✅ dédup legacy avant index (l'ancien `/share` mint un token par partage) |
| `upsert` bookmark ne distingue créé/maj | ✅ `create`+catch P2002 |
| `shareCount` non atomique | ✅ +1 dans la transaction du create |
| `PostView.userId` non-nullable / anonymes | ✅ moot — `viewCount`/`PostView` non touchés |
| `/view` partagé stories | ✅ moot — `viewPost` inchangé (Phase 1 §10) |
| Collision `/l/<token>` tracking↔invitation | ✅ `/resolve` unifié + routage async par type |
| Badge œil = `viewCount` (mauvais sens) | ✅ rebind `reelOpenCount`, ordre avant resémantisation |
| Dédup clic app/web par fingerprint | ✅ dédup par `(token,userId)`/`(token,ip,fenêtre)` |
| Decrement négatif, cascade soft-delete, strip Fastify, STATUS targetType | ✅ traités §19.5/§20.2/§20.4/§21.2 |

**Décisions ouvertes (à confirmer produit)** : (1) nom « impressionCount » produit = `reelOpenCount` technique (collision avec l'`impressionCount` feed existant) ; (2) `SHORT_VIDEO_MS = 8300` ; (3) seuil/fenêtre de dédup `/click`.
