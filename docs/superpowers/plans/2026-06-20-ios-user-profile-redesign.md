# iOS — Refonte du profil utilisateur (UserProfileSheet) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refondre la feuille de profil d'un autre utilisateur (header compact collapsible + 3 onglets Postes/Conversations/Détails i18n+a11y), exposer le profil vocal public (backend + UI), fiabiliser les stats, et mettre le cache profil/posts/convos en TTL 1 mois prolongé à chaque visite — en réutilisant au maximum l'existant.

**Architecture:** `UserProfileSheet` (SDK MeeshyUI) reste l'orchestrateur mais est décomposé en container + header + 3 onglets. Le rendu des posts utilise `FeedPostCard` (app-side) injecté via `@ViewBuilder` (le SDK ne peut pas importer l'app). Le profil vocal public est porté par l'endpoint public profil existant (`buildPublicProfile`) enrichi, et le toggle réutilise `PATCH /users/profile`. Le cache gagne un `touch()` (prolonge `lastFetchedAt`) et des policies 30 j.

**Tech Stack:** SwiftUI (iOS 16 min, runtime 18/26), Swift 6, MeeshySDK/MeeshyUI (SPM), GRDB cache, Fastify 5 gateway, Prisma/MongoDB, Jest, XCTest.

## Global Constraints

- iOS deployment target **16.0** ; runtime 18/26. JAMAIS `.onChange` 2-params brut → `adaptiveOnChange`. JAMAIS `.onPreferenceChange` seul pour le scroll (figé iOS 18+) → `trackScrollContentOffset` (iOS 18+) + `ScrollOffsetPreferenceKey` (16-17).
- **Réutilisation FERME** : avant toute nouvelle classe/vue/service/endpoint, inventorier et réutiliser/généraliser l'existant. Nouveaux fichiers UNIQUEMENT pour la décomposition lisibilité.
- **SDK purity** : pas d'orchestration UX produit nouvelle déposée au SDK ; le `touch()` cache est un building block pur (SDK OK). Rendu posts = injection app-side.
- Pas de booléen redondant : flag = `DateTime?` nullable (`voicePublicAt`).
- xcstrings : 5 langues, `defaultValue` + entrée `en` obligatoires (sinon rendu brut).
- Fastify : déclarer tout champ au response schema (sinon strippé) ; `.map()` Prisma → forme déclarée.
- Couleurs : `conversation.accentColor` / `theme.*` / palette indigo ; jamais hardcoder.
- accents/diacritiques corrects partout (fr).
- Commits **sélectifs par pathspec** (worktree partagé) ; JAMAIS `--amend` / `reset --hard` ; PAS de trailer Co-Authored-By.
- Gates avant commit : `tsc` gateway 0 err (fichiers touchés) + `./apps/ios/meeshy.sh build` OK + Jest gateway concerné vert.
- Nouveaux fichiers iOS classiques → entrées manuelles `project.pbxproj` (objectVersion 63, 4 entrées + 2 UUID/fichier).

---

## File Structure

**Backend (Phase A)**
- Modify `packages/shared/prisma/schema.prisma` — `UserVoiceModel.voicePublicAt DateTime?`
- Modify `services/gateway/src/routes/users/profile.ts` (ou fichier des routes `GET /users/:id`, `GET /u/:username`, `PATCH /users/profile`) — enrichir `buildPublicProfile()` + accepter `voicePublic`
- Modify `services/gateway/src/routes/voice-profile.ts` + `services/gateway/src/services/VoiceProfileService.ts` — setter visibilité (réutilisé par le PATCH profil)
- Modify gateway stats route/service (`getUserStats`) — fiabilisation
- Test `services/gateway/src/**/__tests__/*voice*.test.ts`, `*stats*.test.ts`

**SDK cache (Phase B)**
- Modify `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift` — `touch(for:)` + `bumpLastFetchedAtInL2`
- Modify `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift` — `userProfiles` 30 j + nouvelles policies user-feed/shared-convos
- Modify `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift` — exposer `touch` sur les stores concernés
- Test `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTouchTests.swift`

**SDK models (Phase C)**
- Modify `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` — `MeeshyUser` champs voix optionnels
- Modify `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift` — propagation champs voix
- Test `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MeeshyUserVoiceDecodeTests.swift`

**iOS UI (Phases D/E)** — décomposition de `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`
- Create `.../Profile/ProfileHeaderMetrics.swift` — fonction pure `headerProgress(offset:)` + métriques
- Create `.../Profile/ProfileCollapsibleHeader.swift` — header étendu ↔ replié
- Create `.../Profile/ProfilePostsTab.swift` — liste posts (rendu injecté)
- Create `.../Profile/ProfileConversationsTab.swift` — conversations partagées (restylé)
- Create `.../Profile/ProfileDetailsTab.swift` — bio/langues/pays/vocal/actions/stats
- Modify `.../Profile/UserProfileSheet.swift` — container : header collapse + barre onglets épinglée + switch + cache touch/SWR
- Create `apps/ios/Meeshy/Features/Main/Views/UserProfileSheet+PostsContent.swift` — fournit le rendu `FeedPostCard` injecté + migration call-sites
- Modify call-sites (`RootView.swift`, `PostDetailView.swift`, …) — passer le rendu posts
- Modify `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift` — toggle « rendre public »
- Modify `apps/ios/Meeshy/Localizable.xcstrings` (+ SDK `Localizable.xcstrings` si clés SDK) — clés onglets/actions/motifs/stats/vocal
- Modify `apps/ios/Meeshy.xcodeproj/project.pbxproj` — nouveaux fichiers
- Test `apps/ios/MeeshyTests/Unit/ProfileHeaderMetricsTests.swift`

---

## PHASE A — Backend (rollout d'abord)

### Task A1: Prisma — flag `voicePublicAt` sur UserVoiceModel

**Files:**
- Modify: `packages/shared/prisma/schema.prisma` (modèle `UserVoiceModel`, ~ligne 2466)

**Interfaces:**
- Produces: champ `voicePublicAt DateTime?` lisible/écrivable côté gateway via `prisma.userVoiceModel`.

- [ ] **Step 1: Lire le modèle existant**

Read `packages/shared/prisma/schema.prisma` autour de `model UserVoiceModel` (champs `referenceAudioUrl`, `totalDurationMs`, `qualityScore`, `userId @unique`).

- [ ] **Step 2: Ajouter le champ**

Dans `model UserVoiceModel`, ajouter (près des champs de métadonnées) :

```prisma
  /// Profil vocal rendu public par l'utilisateur (null = privé ; non-null = public + horodatage)
  voicePublicAt DateTime?
```

- [ ] **Step 3: Régénérer le client + build shared**

Run:
```bash
cd /Users/smpceo/Documents/v2_meeshy && pnpm --filter @meeshy/shared prisma generate && pnpm --filter @meeshy/shared build
```
Expected: génération OK, build shared OK.

- [ ] **Step 4: Commit**

```bash
git add packages/shared/prisma/schema.prisma
git commit -m "feat(shared): voicePublicAt sur UserVoiceModel pour profil vocal public"
```

---

### Task A2: Gateway — lecture publique enrichie (profil vocal)

**Files:**
- Modify: route+helper du profil public (`GET /users/:id`, `GET /u/:username`, `buildPublicProfile()`) — localiser via `grep -rn "buildPublicProfile" services/gateway/src`
- Test: `services/gateway/src/**/__tests__/users-public-voice.test.ts` (créer)

**Interfaces:**
- Consumes: `prisma.userVoiceModel` (champ `voicePublicAt`, `referenceAudioUrl`, `totalDurationMs`, `qualityScore`).
- Produces: DTO profil public avec champs optionnels `voicePublic: boolean`, `voiceSampleUrl?: string`, `voiceSampleDurationMs?: number`, `voiceQuality?: number`.

- [ ] **Step 1: Localiser et lire**

Run: `grep -rn "buildPublicProfile" services/gateway/src` puis lire la fonction + la route `GET /users/:id` (auth optionnelle, pattern public) + son response schema Fastify.

- [ ] **Step 2: Écrire le test (RED)**

Créer `services/gateway/src/.../__tests__/users-public-voice.test.ts` couvrant :
1. user avec `voicePublicAt != null` → réponse contient `voicePublic: true` + `voiceSampleUrl` + `voiceSampleDurationMs`.
2. user avec `voicePublicAt == null` → `voicePublic: false`, pas de `voiceSampleUrl`.
3. demandeur bloqué par le user → `voicePublic: false`, pas de `voiceSampleUrl`.

```ts
// Squelette — adapter aux fixtures gateway existantes (mock prisma + app.inject)
import { test, expect } from '@jest/globals';

test('GET /users/:id expose la voix uniquement si publique', async () => {
  // arrange: userVoiceModel.voicePublicAt = new Date(), referenceAudioUrl, totalDurationMs
  const res = await app.inject({ method: 'GET', url: `/api/v1/users/${userId}` });
  const body = res.json();
  expect(body.data.voicePublic).toBe(true);
  expect(body.data.voiceSampleUrl).toBe('https://.../ref.m4a');
  expect(body.data.voiceSampleDurationMs).toBeGreaterThan(0);
});

test('voix non exposée si privée', async () => { /* voicePublicAt = null → voicePublic:false, pas de url */ });
test('voix non exposée si bloqué', async () => { /* requester dans blockedBy → voicePublic:false */ });
```

- [ ] **Step 3: Run test → FAIL**

Run: `cd services/gateway && pnpm jest users-public-voice -i`
Expected: FAIL (champs absents).

- [ ] **Step 4: Implémenter**

Dans la requête du profil : inclure `userVoiceModel: { select: { voicePublicAt: true, referenceAudioUrl: true, totalDurationMs: true, qualityScore: true } }`. Dans `buildPublicProfile()`, calculer :

```ts
const vm = user.userVoiceModel;
const voiceVisible = !!vm?.voicePublicAt && !!vm?.referenceAudioUrl && !isBlockedRelation;
const voiceFields = voiceVisible
  ? { voicePublic: true, voiceSampleUrl: vm!.referenceAudioUrl!, voiceSampleDurationMs: vm!.totalDurationMs ?? null, voiceQuality: vm!.qualityScore ?? null }
  : { voicePublic: false };
```

Ajouter ces champs au **response schema Fastify** (optionnels) sinon strippés. `isBlockedRelation` = réutiliser le helper de blocage existant (`grep -rn "blocked" services/gateway/src/services`).

- [ ] **Step 5: Run test → PASS + tsc**

Run: `cd services/gateway && pnpm jest users-public-voice -i && npx tsc --noEmit 2>&1 | grep -E "users/profile|voice" || echo "no new tsc errors"`
Expected: PASS, pas d'erreur tsc sur les fichiers touchés.

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src
git commit -m "feat(gateway): exposer le profil vocal public dans buildPublicProfile (ACL blocage)"
```

---

### Task A3: Gateway — toggle visibilité vocale via PATCH /users/profile

**Files:**
- Modify: route `PATCH /users/profile` (localiser via `grep -rn "users/profile" services/gateway/src/routes`) + `VoiceProfileService.ts` (setter) si pertinent
- Test: `services/gateway/src/.../__tests__/voice-visibility-toggle.test.ts`

**Interfaces:**
- Consumes: body `PATCH /users/profile` (réutilisé).
- Produces: acceptation `voicePublic?: boolean` → set `voicePublicAt = voicePublic ? new Date() : null` sur `userVoiceModel` de l'utilisateur authentifié.

- [ ] **Step 1: Lire** la route `PATCH /users/profile` (schema body + handler).

- [ ] **Step 2: Test (RED)**

```ts
test('PATCH /users/profile { voicePublic:true } rend la voix publique', async () => {
  const res = await app.inject({ method:'PATCH', url:'/api/v1/users/profile', headers:auth, payload:{ voicePublic:true }});
  expect(res.statusCode).toBe(200);
  const vm = await prisma.userVoiceModel.findUnique({ where:{ userId }});
  expect(vm?.voicePublicAt).not.toBeNull();
});
test('voicePublic:false repasse en privé', async () => { /* attend voicePublicAt === null */ });
```

- [ ] **Step 3: Run → FAIL** : `cd services/gateway && pnpm jest voice-visibility-toggle -i`

- [ ] **Step 4: Implémenter** : ajouter `voicePublic` (optionnel boolean) au schema body ; dans le handler, si défini : `await prisma.userVoiceModel.update({ where:{ userId }, data:{ voicePublicAt: body.voicePublic ? new Date() : null }})` (gérer le cas où il n'y a pas de voiceModel → ignorer ou 409 selon convention). Ne pas casser le reste du PATCH.

- [ ] **Step 5: Run → PASS + tsc** (mêmes commandes que A2 step 5).

- [ ] **Step 6: Commit**

```bash
git add services/gateway/src
git commit -m "feat(gateway): toggle voicePublic via PATCH /users/profile"
```

---

### Task A4: Gateway — fiabilisation des stats utilisateur

**Files:**
- Modify: route/service `getUserStats` (localiser via `grep -rn "getUserStats\|/stats" services/gateway/src`)
- Test: `services/gateway/src/.../__tests__/user-stats.test.ts`

**Interfaces:**
- Produces: réponse stats correcte et complète (membre depuis, nb messages, nb traductions, langues) conforme au response schema déclaré.

- [ ] **Step 1: Lire** la route stats + son response schema + le calcul (compter les sources : messages, traductions, langues). Comparer avec le modèle iOS `UserStats` (`packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift`) pour aligner les clés.

- [ ] **Step 2: Diagnostiquer** : identifier le bug réel (champ non déclaré au schema → strippé ? calcul faux ? objet Prisma brut renvoyé sans `.map()` ?). Documenter la cause dans le message de commit.

- [ ] **Step 3: Test (RED)** : asserter la **forme** (toutes les clés attendues présentes) ET des **valeurs** sur un fixture connu.

```ts
test('GET stats renvoie des compteurs corrects et complets', async () => {
  // fixture: user avec N messages, M traductions, K langues, createdAt connu
  const res = await app.inject({ method:'GET', url:`/api/v1/users/${userId}/stats`, headers:auth });
  const s = res.json().data;
  expect(s.memberSince ?? s.createdAt).toBeTruthy();
  expect(s.messageCount).toBe(N);
  expect(s.translationCount).toBe(M);
  expect(Array.isArray(s.languagesUsed)).toBe(true);
});
```

- [ ] **Step 4: Run → FAIL** : `cd services/gateway && pnpm jest user-stats -i`

- [ ] **Step 5: Implémenter** le fix (déclarer les champs au schema + `.map()` vers la forme + corriger le calcul). 

- [ ] **Step 6: Run → PASS + tsc**.

- [ ] **Step 7: Commit**

```bash
git add services/gateway/src
git commit -m "fix(gateway): fiabiliser le calcul et le mapping des stats utilisateur"
```

---

## PHASE B — SDK cache (touch + TTL 30 j)

### Task B1: `GRDBCacheStore.touch(for:)`

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTouchTests.swift` (créer)

**Interfaces:**
- Produces: `public func touch(for key: Key) async` — remet `loadedAt` (L1) et `lastFetchedAt` (L2) à `now` sans refetch ; no-op si aucune entrée.

- [ ] **Step 1: Écrire le test (RED)**

Créer `GRDBCacheStoreTouchTests.swift`. Utiliser une policy à fenêtre fraîche courte pour prouver que `touch` ramène en `.fresh`. S'appuyer sur le setup de test GRDB existant (chercher un test existant : `grep -rln "GRDBCacheStore(" packages/MeeshySDK/Tests`).

```swift
import XCTest
import GRDB
@testable import MeeshySDK

final class GRDBCacheStoreTouchTests: XCTestCase {
    // CacheTestModel: CacheIdentifiable & Codable — réutiliser le modèle de test existant si présent.

    func test_touch_resets_freshness_clock() async throws {
        let queue = try DatabaseQueue() // + migrations cache (réutiliser le helper de test existant)
        // policy avec staleTTL ~0.2s, ttl 30j
        let policy = CachePolicy(ttl: .days(30), staleTTL: 0.2, maxItemCount: 100, storageLocation: .grdb)
        let store = GRDBCacheStore<String, CacheTestModel>(policy: policy, db: queue)
        try await store.save([CacheTestModel(id: "1")], for: "k")
        try await Task.sleep(nanoseconds: 300_000_000) // dépasse staleTTL → .stale
        if case .stale = await store.load(for: "k") {} else { XCTFail("attendu .stale") }
        await store.touch(for: "k")
        if case .fresh = await store.load(for: "k") {} else { XCTFail("attendu .fresh après touch") }
    }

    func test_touch_noop_when_absent() async throws {
        let queue = try DatabaseQueue()
        let store = GRDBCacheStore<String, CacheTestModel>(policy: .userProfiles, db: queue)
        await store.touch(for: "absent") // ne doit pas crasher
        if case .empty = await store.load(for: "absent") {} else { XCTFail("attendu .empty") }
    }
}
```

- [ ] **Step 2: Run → FAIL** : `xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/GRDBCacheStoreTouchTests -quiet` → échec (méthode absente).

- [ ] **Step 3: Implémenter** (dans `GRDBCacheStore`, après `load`) :

```swift
/// Reset the freshness clock for `key` to "now" WITHOUT refetching, so a
/// subsequent `load` returns `.fresh` and retention is extended on access.
/// Bumps L1 `loadedAt` and L2 `lastFetchedAt`. No-op when no entry exists.
public func touch(for key: Key) async {
    let now = Date()
    if var l1 = memoryCache[key] {
        l1.loadedAt = now
        memoryCache[key] = l1
        touchKey(key)
    }
    bumpLastFetchedAtInL2(to: now, for: namespacedKey(key.description))
}
```

Et dans la section `nonisolated DB operations` (près de `writeCursorToL2`) :

```swift
private nonisolated func bumpLastFetchedAtInL2(to date: Date, for keyStr: String) {
    do {
        try db.write { db in
            guard var meta = try DBCacheMetadata.filter(Column("key") == keyStr).fetchOne(db) else { return }
            meta.lastFetchedAt = date
            try meta.save(db)
        }
    } catch {
        logger.error("Failed to touch L2 lastFetchedAt for key \(keyStr, privacy: .public): \(error.localizedDescription, privacy: .public)")
    }
}
```

- [ ] **Step 4: Run → PASS** (même commande qu'au Step 2).

- [ ] **Step 5: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/GRDBCacheStore.swift packages/MeeshySDK/Tests/MeeshySDKTests/Cache/GRDBCacheStoreTouchTests.swift
git commit -m "feat(sdk): GRDBCacheStore.touch — prolonge le TTL à l'accès sans refetch"
```

---

### Task B2: Policies 30 jours (profils, posts-user, convos-partagées)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift`

**Interfaces:**
- Produces: `userProfiles` à TTL 30 j ; `userPosts` et `sharedConversations` (nouvelles policies si stores dédiés) à TTL 30 j.

- [ ] **Step 1:** Modifier `userProfiles` (ligne 53) :

```swift
    /// Profil d'un autre utilisateur. TTL 30 j + fenêtre fraîche courte :
    /// affichage cache instantané, prolongé à chaque visite via `touch`,
    /// revalidation SWR silencieuse au-delà de la fenêtre fraîche.
    public static let userProfiles = CachePolicy(ttl: .days(30), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
```

- [ ] **Step 2:** Si l'onglet Postes utilise un store dédié (cf. C/D), ajouter :

```swift
    /// Posts d'un utilisateur précis (onglet profil). TTL 30 j, prolongé à la visite.
    public static let userPosts = CachePolicy(ttl: .days(30), staleTTL: .minutes(5), maxItemCount: 200, storageLocation: .grdb)
    /// Conversations partagées avec un utilisateur (onglet profil). TTL 30 j.
    public static let sharedConversations = CachePolicy(ttl: .days(30), staleTTL: .minutes(5), maxItemCount: 100, storageLocation: .grdb)
```

> Note réutilisation : si l'onglet Postes réutilise le store `.feed` existant avec une clé `user:<id>`, NE PAS dupliquer la policy — garder `.feed` et appliquer la stratégie via `touch`. Décider en Task D3 selon le store retenu, puis revenir cocher l'option pertinente ici.

- [ ] **Step 3: Build SDK** : `cd packages/MeeshySDK && swift build` → OK.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Cache/CachePolicy.swift
git commit -m "feat(sdk): policies cache 30 j pour profil/posts-user/convos-partagées"
```

---

### Task B3: Exposer `touch` via CacheCoordinator (si nécessaire)

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Cache/CacheCoordinator.swift`

**Interfaces:**
- Produces: accès `await CacheCoordinator.shared.profiles.touch(for:)` (et `.feed`/`.conversations`) utilisable depuis l'app/SDK UI.

- [ ] **Step 1:** Vérifier l'accessibilité : `touch` est `public` sur `GRDBCacheStore`, et les stores `profiles`/`feed`/`conversations` sont exposés par `CacheCoordinator` (`grep -n "public let profiles\|public let feed\|public let conversations" CacheCoordinator.swift`). Si déjà publics → **aucun code**, juste cocher.

- [ ] **Step 2:** Si un store concerné n'est pas exposé publiquement, l'exposer en lecture (suivre le pattern des autres stores). Sinon skip.

- [ ] **Step 3: Build** `swift build` → OK ; **Commit** seulement s'il y a eu un changement.

---

## PHASE C — SDK models (champs voix)

### Task C1: `MeeshyUser` — champs voix optionnels

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift` (struct `MeeshyUser`, ~191-334)
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Models/MeeshyUserVoiceDecodeTests.swift` (créer)

**Interfaces:**
- Produces: `MeeshyUser.voicePublic: Bool?`, `voiceSampleUrl: String?`, `voiceSampleDurationMs: Int?`, `voiceQuality: Double?` + CodingKeys.

- [ ] **Step 1: Test (RED)** : décoder un JSON profil avec champs voix → vérifier mapping ; et un JSON SANS champs voix → tout `nil` (rollout-safe).

```swift
import XCTest
@testable import MeeshySDK

final class MeeshyUserVoiceDecodeTests: XCTestCase {
    func test_decode_voice_public_fields() throws {
        let json = """
        {"id":"u1","username":"a","voicePublic":true,"voiceSampleUrl":"https://x/r.m4a","voiceSampleDurationMs":4200,"voiceQuality":0.9}
        """.data(using: .utf8)!
        let u = try JSONDecoder.meeshy.decode(MeeshyUser.self, from: json) // réutiliser le décodeur configuré existant
        XCTAssertEqual(u.voicePublic, true)
        XCTAssertEqual(u.voiceSampleUrl, "https://x/r.m4a")
        XCTAssertEqual(u.voiceSampleDurationMs, 4200)
    }
    func test_decode_without_voice_is_nil() throws {
        let json = #"{"id":"u1","username":"a"}"#.data(using: .utf8)!
        let u = try JSONDecoder.meeshy.decode(MeeshyUser.self, from: json)
        XCTAssertNil(u.voicePublic)
        XCTAssertNil(u.voiceSampleUrl)
    }
}
```

> Lire d'abord comment `MeeshyUser` est décodé dans les tests existants (décodeur/CodingKeys) et adapter `JSONDecoder.meeshy` au helper réel.

- [ ] **Step 2: Run → FAIL**.

- [ ] **Step 3: Implémenter** : ajouter les 4 propriétés optionnelles à `MeeshyUser` + entrées CodingKeys (`voicePublic`, `voiceSampleUrl`, `voiceSampleDurationMs`, `voiceQuality`). Optionnels → rétrocompatibles.

- [ ] **Step 4: Run → PASS** ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift packages/MeeshySDK/Tests/MeeshySDKTests/Models/MeeshyUserVoiceDecodeTests.swift
git commit -m "feat(sdk): champs profil vocal public optionnels sur MeeshyUser"
```

---

### Task C2: `ProfileSheetUser` — propagation des champs voix

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift`

**Interfaces:**
- Consumes: `MeeshyUser.voice*` (C1).
- Produces: `ProfileSheetUser.voicePublic/voiceSampleUrl/voiceSampleDurationMs/voiceQuality` + propagation dans `from(user:)`.

- [ ] **Step 1:** Ajouter les 4 propriétés optionnelles à `ProfileSheetUser` (après `hasE2EE`), au `init` (params optionnels `= nil`), et les renseigner dans `from(user:)` (étendre le `return ProfileSheetUser(...)`, lignes 153-170) :

```swift
            // … champs existants …
            hasE2EE: user.signalIdentityKeyPublic != nil,
            voicePublic: user.voicePublic,
            voiceSampleUrl: user.voiceSampleUrl,
            voiceSampleDurationMs: user.voiceSampleDurationMs,
            voiceQuality: user.voiceQuality
```

> Ne pas casser `==` (ne pas ajouter ces champs à l'égalité avatar/banner/id sauf besoin de re-render — laisser `==` tel quel).

- [ ] **Step 2: Build SDK** `swift build` → OK ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileSheetUser.swift
git commit -m "feat(sdk): propager les champs profil vocal dans ProfileSheetUser"
```

---

## PHASE D — iOS UI : décomposition + redesign

> Avant toute la phase D : **lire intégralement** `UserProfileSheet.swift` (1193 l.) pour réutiliser ses sous-vues existantes (pills langues `languagePills`/`languagePill`, chips pays/timezone, boutons d'action `profileActionButton`, états connexion, lignes conversations, lignes stats). On DÉPLACE/RÉUTILISE, on ne réécrit pas.

### Task D1: Fonction pure `headerProgress` + métriques

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileHeaderMetrics.swift`
- Test: `apps/ios/MeeshyTests/Unit/ProfileHeaderMetricsTests.swift`
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj` (ajouter les 2 fichiers)

**Interfaces:**
- Produces: `enum ProfileHeaderMetrics { static let expandedBanner: CGFloat; static let collapsedBar: CGFloat; static func progress(offset: CGFloat) -> CGFloat }` (0…1, clampé).

- [ ] **Step 1: Test (RED)** :

```swift
import XCTest
@testable import MeeshyUI

final class ProfileHeaderMetricsTests: XCTestCase {
    func test_progress_clamped_0_to_1() {
        XCTAssertEqual(ProfileHeaderMetrics.progress(offset: 0), 0, accuracy: 0.001)        // haut
        XCTAssertEqual(ProfileHeaderMetrics.progress(offset: -1000), 1, accuracy: 0.001)    // scroll fort → replié
        XCTAssertGreaterThan(ProfileHeaderMetrics.progress(offset: -50), 0)
        XCTAssertLessThan(ProfileHeaderMetrics.progress(offset: -50), 1)
    }
    func test_progress_monotonic() {
        XCTAssertGreaterThanOrEqual(ProfileHeaderMetrics.progress(offset: -120), ProfileHeaderMetrics.progress(offset: -60))
    }
}
```

> Note signe : convention du repo = offset négatif quand on scrolle (cf. `ScrollOffsetPreferenceKey` + `trackScrollContentOffset { -$0 }`). `progress` prend l'offset signé tel que stocké dans `scrollOffset` du conteneur.

- [ ] **Step 2: Run → FAIL** (cible XCTest app : `./apps/ios/meeshy.sh test` ou xcodebuild only-testing ProfileHeaderMetricsTests).

- [ ] **Step 3: Implémenter** :

```swift
import CoreGraphics

public enum ProfileHeaderMetrics {
    public static let expandedBanner: CGFloat = 160
    public static let collapsedBar: CGFloat = 52
    /// Course de collapse (pt de scroll). Au-delà → header pleinement replié.
    public static let collapseDistance: CGFloat = 120

    /// 0 = header étendu, 1 = header replié. `offset` signé (négatif en scrollant).
    public static func progress(offset: CGFloat) -> CGFloat {
        let scrolled = max(0, -offset)
        return min(1, scrolled / collapseDistance)
    }
}
```

- [ ] **Step 4:** Ajouter `ProfileHeaderMetrics.swift` (SDK, pas de pbxproj — SPM) ; ajouter `ProfileHeaderMetricsTests.swift` aux 4 entrées `project.pbxproj` (PBXBuildFile + PBXFileReference + group + Sources phase, 2 UUID).

- [ ] **Step 5: Run → PASS** ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileHeaderMetrics.swift apps/ios/MeeshyTests/Unit/ProfileHeaderMetricsTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): fonction pure de progression du header de profil + tests"
```

---

### Task D2: `ProfileCollapsibleHeader` (étendu ↔ replié)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileCollapsibleHeader.swift`

**Interfaces:**
- Consumes: `ProfileSheetUser`, `progress: CGFloat` (D1), `moodEmoji`, callbacks tap avatar/banner.
- Produces: `struct ProfileCollapsibleHeader: View` — interpole bannière/avatar/nom selon `progress` ; expose le **bloc détails compact** (bio tronquée + chips langues/pays/mood) visible quand `progress < ~0.5`, et la barre compacte (petit avatar + nom + @pseudo) en overlay quand `progress` augmente.

- [ ] **Step 1: Lire** dans `UserProfileSheet.swift` les sous-vues existantes à réutiliser : section bannière (155-207), avatar+présence (234-253), nom/username (219-225), `languagePills` (986-1017). Les EXTRAIRE/RÉUTILISER ici (déplacement, pas réécriture). **Supprimer** le texte « En ligne » (256-271) — l'info reste sur le point de présence.

- [ ] **Step 2: Implémenter** le header : 
  - `ZStack(alignment: .top)` : bannière (`CachedBannerImage` existant) hauteur interpolée `expandedBanner → collapsedBar` selon `progress`, teinte `accentColor` quand repliée ; avatar (`CachedAvatarImage`) qui rétrécit + remonte ; nom+@pseudo qui migrent vers la barre compacte (opacité croisée via `progress`).
  - Bloc détails compact (bio 1–2 lignes `.lineLimit(2)` + `HStack` chips : `languagePills` + drapeau pays si `registrationCountry` + `moodEmoji`) sous le nom, opacité `1 - progress`.
  - Conserver tap avatar/banner → `FullscreenImageView` (réutiliser).
  - Couleurs via `accentColor`/`theme.*`. Respecter Light/Dark (épingler dark seulement sur surfaces sombres fixes — ici header normal → couleurs adaptatives `theme.textPrimary/textMuted`).

- [ ] **Step 3: Build** `swift build` (SDK) → OK.

- [ ] **Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileCollapsibleHeader.swift
git commit -m "feat(ios): header de profil collapsible (bio+détails compacts, En ligne retiré)"
```

---

### Task D3: `ProfilePostsTab` (rendu injecté, pagination, pull-to-refresh)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfilePostsTab.swift`

**Interfaces:**
- Consumes: `userId: String`, `postRow: (FeedPost) -> AnyView` (injecté par l'app, Task E2), `PostService.getUserPosts`, store cache posts (réutiliser `.feed` clé `user:<id>` OU `.userPosts`).
- Produces: `struct ProfilePostsTab: View` — liste paginée + pull-to-refresh + empty state ; expose un closure `onScroll` pour remonter l'offset si nécessaire (sinon partage le scroll parent).

- [ ] **Step 1: Inventaire réutilisation** : `grep -rn "getUserPosts\|FeedPost(" packages apps/ios` — réutiliser la **conversion `APIPost → FeedPost`** existante (chercher `toFeedPost`/`toDomain` sur `APIPost`) et le store cache. Ne PAS dupliquer la logique de like/repost : ce câblage vit dans le `postRow` injecté (FeedPostCard + callbacks de l'app).

- [ ] **Step 2: Implémenter** : 
  - Fetch via `PostService.shared.getUserPosts(userId:cursor:limit:)`, mapper en `[FeedPost]`, cacher (clé `user:<id>`), afficher `postRow(post)` dans un `LazyVStack`.
  - SWR : lire cache (affichage instant) → `touch` → revalidation silencieuse → merge ; pagination au scroll (curseur) ; `.refreshable` (pull-to-refresh) = force refetch.
  - Empty state soigné (illustration légère + texte localisé) si 0 post visible.

- [ ] **Step 3: Build** `swift build` → OK ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfilePostsTab.swift
git commit -m "feat(ios): onglet Postes du profil (rendu FeedPostCard injecté, SWR, pull-to-refresh)"
```

---

### Task D4: `ProfileConversationsTab` (restylé, réutilisé)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileConversationsTab.swift`

**Interfaces:**
- Consumes: `userId`, `ConversationService.listSharedWith`, lignes conversation existantes du sheet (700-779).
- Produces: `struct ProfileConversationsTab: View`.

- [ ] **Step 1:** Déplacer/réutiliser le rendu conversations existant (`UserProfileSheet.swift` 700-779) dans ce fichier, restylé en continuité (accentColor, glass). Cache `.conversations` clé `shared:<id>` + `touch` + SWR.

- [ ] **Step 2: Build** → OK ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileConversationsTab.swift
git commit -m "feat(ios): onglet Conversations du profil (restylé, cache SWR)"
```

---

### Task D5: `ProfileDetailsTab` (bio/langues/pays/vocal/actions/stats)

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileDetailsTab.swift`

**Interfaces:**
- Consumes: `ProfileSheetUser` (dont champs voix), `UserStats`, services `FriendService`/`BlockService`/`ReportService`, `AudioPlayerView`/`AudioPlaybackManager`, `FriendshipCache`.
- Produces: `struct ProfileDetailsTab: View` regroupant : bio complète, pills langues, pays, **profil vocal (si `voicePublic == true`)**, actions (connexion/bloquer/**signaler**), bande stats compacte.

- [ ] **Step 1: Réutiliser** les briques existantes du sheet : bio card (556-559), `languagePills` (986-1017), chips pays/timezone (573-579), `profileActionButton` (659-664), états connexion (600-667), lignes stats (784-857). Déplacer ici.

- [ ] **Step 2: Profil vocal** : si `displayUser.voicePublic == true` et `voiceSampleUrl != nil`, afficher une carte « Voix » avec `AudioPlayerView`(`AudioPlaybackManager` jouant `voiceSampleUrl`, durée `voiceSampleDurationMs`). Sinon ne rien afficher.

- [ ] **Step 3: Signaler** (nouveau, mais via service existant) : bouton « Signaler » → `confirmationDialog`/sheet de motifs mappés à l'enum gateway (`spam, inappropriate, harassment, violence, hate_speech, fake_profile, impersonation, other`) → `ReportService.shared.reportUser(userId:reportType:reason:)` → toast succès/erreur. Labels localisés.

- [ ] **Step 4: Bande stats compacte** en bas : membre depuis + compteurs (réutiliser le rendu stats existant, condensé). Données via `UserStats` (cache `.stats`).

- [ ] **Step 5: Build** → OK ; **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/ProfileDetailsTab.swift
git commit -m "feat(ios): onglet Détails (bio/langues/pays/vocal public/connexion/bloquer/signaler/stats)"
```

---

### Task D6: Container `UserProfileSheet` — header collapse + onglets épinglés + switch

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift`

**Interfaces:**
- Consumes: D1-D5, `trackScrollContentOffset`/`ScrollOffsetPreferenceKey`, `CacheCoordinator` (touch+SWR).
- Produces: `UserProfileSheet` recomposé ; nouvel enum `ProfileTab { posts, conversations, details }` ; init accepte `@ViewBuilder postsContent`/`postRow` (default fallback).

- [ ] **Step 1: Remplacer l'enum** `ProfileTab` (1170-1192) par `posts/conversations/details` avec titres **localisés** (`String(localized:..., defaultValue:, bundle:.module)`) + icônes SF (`square.text.square`, `bubble.left.and.bubble.right.fill`, `person.text.rectangle`).

- [ ] **Step 2: Recomposer le corps** :

```
ScrollView {
  LazyVStack(spacing: 0, pinnedViews: [.sectionHeaders]) {
    ProfileCollapsibleHeader(user:..., progress: ProfileHeaderMetrics.progress(offset: scrollOffset), ...)
    Section {
      switch selectedTab {
        case .posts: ProfilePostsTab(userId:..., postRow: postRow)
        case .conversations: ProfileConversationsTab(userId:...)
        case .details: ProfileDetailsTab(displayUser:..., ...)
      }
    } header { tabBar }   // barre d'onglets ÉPINGLÉE (réutiliser le strip existant 279-345, restylé)
  }
  // mesure offset (16-17)
  GeometryReader { geo in Color.clear.preference(key: ScrollOffsetPreferenceKey.self, value: geo.frame(in: .named("profileScroll")).minY) }.frame(height: 0)
}
.coordinateSpace(name: "profileScroll")
.onPreferenceChange(ScrollOffsetPreferenceKey.self) { scrollOffset = $0 }   // 16-17
.trackScrollContentOffset { scrollOffset = -$0 }                            // 18+
.overlay(alignment: .top) { compactBar.opacity(...) } // si non géré dans le header
```

  - Barre compacte d'overlay alternative : si le header gère déjà le crossfade interne, ne pas dupliquer.
  - Onglets : `accessibilityAddTraits` `.isButton` + `.isSelected` ; `accessibilityLabel` localisé.

- [ ] **Step 3: Cache touch + SWR à l'ouverture** : dans `loadDataIfNeeded()` (356-389) et `.task`/`onAppear`, après lecture cache (toute fraîcheur) → `await CacheCoordinator.shared.profiles.touch(for: identifier)` (+ `.feed`/`.conversations` clés user au moment où chaque onglet charge). Conserver le `switch` SWR existant (afficher cache, revalider si stale/expired).

- [ ] **Step 4: Présentation** : au call-site la sheet passe en `.presentationDetents([.large, .medium])` (large par défaut pour la course de scroll) — appliqué en E2.

- [ ] **Step 5: Build** `./apps/ios/meeshy.sh build` → OK (le fallback `postRow` par défaut permet la compilation SDK seule). **Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshyUI/Profile/UserProfileSheet.swift
git commit -m "feat(ios): UserProfileSheet recomposé — header collapse, onglets Postes/Conversations/Détails épinglés, cache touch+SWR"
```

---

## PHASE E — Intégration app + réglages

### Task E1: Toggle « rendre mon profil vocal public » (réglages)

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift` (+ son ViewModel)

**Interfaces:**
- Consumes: chemin de mise à jour profil existant (`UserService.updateProfile`/équivalent envoyant `voicePublic`).
- Produces: toggle UI « Rendre public » synchronisé avec `voicePublicAt` serveur.

- [ ] **Step 1: Inventaire** : `grep -rn "updateProfile\|profile.*PATCH" packages/MeeshySDK apps/ios` — réutiliser la méthode existante de mise à jour de profil ; vérifier qu'elle peut transmettre `voicePublic` (sinon ajouter le champ optionnel à son body — pas de nouveau service).

- [ ] **Step 2: Test (RED)** (ViewModel) : `toggleVoicePublic(true)` appelle le service avec `voicePublic:true` et reflète l'état. Réutiliser le pattern Mock du ViewModel.

- [ ] **Step 3: Implémenter** le toggle dans `VoiceProfileManageView` (section près du toggle cloning existant, ~237-252) + méthode VM `toggleVoicePublic(_:)`.

- [ ] **Step 4: Build + test** → OK ; **Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/VoiceProfileManageView.swift apps/ios/Meeshy/Features/Main/ViewModels
git commit -m "feat(ios): réglage 'rendre mon profil vocal public' (réutilise updateProfile)"
```

---

### Task E2: Injection du rendu posts + migration des call-sites

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/UserProfileSheet+PostsContent.swift`
- Modify: call-sites (`RootView.swift`, `PostDetailView.swift`, et tout `grep -rln "UserProfileSheet(" apps/ios`)
- Modify: `apps/ios/Meeshy.xcodeproj/project.pbxproj`

**Interfaces:**
- Consumes: `UserProfileSheet(postRow:)` (D6), `FeedPostCard` + callbacks like/repost/bookmark (réutilisés du feed).
- Produces: une convenience app-side unique `UserProfileSheet.app(user:...)` (ou helper `appPostRow(_:)`) qui injecte le rendu `FeedPostCard` + le câblage d'actions existant.

- [ ] **Step 1:** Créer un helper unique qui construit le `postRow` à partir de `FeedPostCard` + les callbacks like/repost/bookmark déjà utilisés dans le feed (réutiliser le même VM/handlers — ne pas réinventer le câblage d'engagement).

- [ ] **Step 2:** Migrer TOUS les call-sites pour passer ce `postRow` (et `.presentationDetents([.large, .medium])`). `grep -rln "UserProfileSheet(" apps/ios` pour les recenser.

- [ ] **Step 3:** Ajouter le nouveau fichier au `project.pbxproj`.

- [ ] **Step 4: Build** `./apps/ios/meeshy.sh build` → OK ; **Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/UserProfileSheet+PostsContent.swift apps/ios/Meeshy/Features/Main/Views/RootView.swift apps/ios/Meeshy/Features/Main/Views/PostDetailView.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(ios): injecter le rendu FeedPostCard dans l'onglet Postes du profil (call-sites)"
```

---

## PHASE F — i18n, a11y, build final

### Task F1: Clés xcstrings (5 langues)

**Files:**
- Modify: `apps/ios/Meeshy/Localizable.xcstrings` (et SDK `packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings` si clés utilisées dans le SDK avec `bundle:.module`)

**Interfaces:**
- Produces: clés `profile.tab.posts/conversations/details`, `profile.action.report` + motifs `report.reason.*`, `profile.voice.title`, `profile.stats.memberSince/messages/translations/languages`, `voice.makePublic`.

- [ ] **Step 1:** Identifier toutes les clés introduites (D1-E2) via `grep -rn "String(localized:" packages/MeeshySDK/Sources/MeeshyUI/Profile apps/ios/.../VoiceProfileManageView.swift`.

- [ ] **Step 2:** Ajouter chaque clé aux xcstrings avec `defaultValue` + **les 5 langues** (dont **`en` obligatoire**), en respectant le format byte-identique Xcode (`json.dumps(..., separators=(',', ' : '))+'\n'` via `apps/ios/scripts/check_localization.py` si présent, ou édition manuelle propre). Vérifier avec `LocalizationConsistencyTests` (déjà présent dans le tree).

- [ ] **Step 3: Build + test localisation** → OK ; **Commit**

```bash
git add apps/ios/Meeshy/Localizable.xcstrings packages/MeeshySDK/Sources/MeeshyUI/Resources/Localizable.xcstrings
git commit -m "i18n(ios): clés onglets profil, signalement, profil vocal, stats (5 langues)"
```

---

### Task F2: Audit a11y (Accessibility Auditor)

**Files:** (revue + ajustements ciblés sur D2/D5/D6)

- [ ] **Step 1:** Dispatch agent `Accessibility Auditor` sur les fichiers Profile : vérifier onglets (`.isButton`+`.isSelected`+label), ordre VoiceOver (header → onglets → contenu), lecteur vocal labellisé, contrôles d'action labellisés, contraste Light/Dark, tailles tap ≥ 44pt.
- [ ] **Step 2:** Appliquer les correctifs remontés (ciblés).
- [ ] **Step 3: Build** → OK ; **Commit** des ajustements a11y.

---

### Task F3: Revue UI/UX + whimsy (continuité design)

- [ ] **Step 1:** Dispatch `ui-designer` + `whimsy-injector` (selon CLAUDE.md, après changements UI) sur header/onglets/empty states : continuité indigo/glass/accentColor, micro-animations du collapse, empty state Postes/Conversations délicieux. Ne RIEN retirer comme effet visuel (cf. règle « do not strip visual effects »).
- [ ] **Step 2:** Appliquer les correctifs (invisibles côté perf > esthétique).
- [ ] **Step 3: Build** → OK ; **Commit**.

---

### Task F4: Gate d'intégration + revue de code

- [ ] **Step 1: Gates** :
```bash
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && npx tsc --noEmit 2>&1 | grep -E "routes/(users|voice)|services/Voice|stats" || echo "no new tsc errors"
cd /Users/smpceo/Documents/v2_meeshy && ./apps/ios/meeshy.sh build
cd /Users/smpceo/Documents/v2_meeshy/services/gateway && pnpm jest users-public-voice voice-visibility-toggle user-stats -i
xcodebuild test -scheme MeeshySDK-Package -destination 'platform=iOS Simulator,name=iPhone 16 Pro' -only-testing:MeeshySDKTests/GRDBCacheStoreTouchTests -only-testing:MeeshySDKTests/MeeshyUserVoiceDecodeTests -quiet
```
Expected: tout vert.
- [ ] **Step 2:** Dispatch `Code Reviewer` (4 axes : correctness, SDK purity, réutilisation, perf re-render) sur l'ensemble du diff. Corriger.
- [ ] **Step 3: Validation device** (manuelle, à demander à l'utilisateur) : déplier la sheet, scroller → collapse du header + onglets épinglés ; profil vocal public lisible ; cache : rouvrir un profil → instantané sans spinner.
- [ ] **Step 4:** Commit final éventuel.

---

## Self-Review (couverture spec)

- Header restructuré (bio+détails entre bannière et ancien « En ligne »), « En ligne » retiré → D2.
- Header collapsible (déplier + scroll → replié, onglets épinglés) → D1, D2, D6.
- 3 onglets Postes/Conversations/Détails i18n+a11y → D3, D4, D5, D6, F1, F2.
- Détails : bio, langues, pays, vocal public, connexion/bloquer/signaler, stats compacte → D5.
- Profil vocal backend complet (flag + lecture publique + toggle réutilisé) → A1, A2, A3, C1, C2, D5, E1.
- Stats fiabilisées → A4 (+ affichage D5).
- Cache 30 j + touch à la visite + SWR silencieux + pull-to-refresh, images jamais re-DL → B1, B2, B3, D3, D4, D6.
- Réutilisation maximale (FeedPostCard injecté, briques sheet déplacées, endpoints existants enrichis) → contrainte globale + D1-D6, E2, A2/A3.
- Décomposition `UserProfileSheet` → D1-D6.
- Gates/rollout backend-first → A* d'abord, F4.

**Placeholder scan :** pas de TODO/TBD ; chaque tâche a test + code/contrat + commit. Quelques étapes exigent un `grep`/lecture préalable explicite (fichiers volumineux non inlinés volontairement, code à réutiliser) — c'est intentionnel et borné.

**Type consistency :** `headerProgress`/`progress(offset:)`, `touch(for:)`/`bumpLastFetchedAtInL2`, champs voix `voicePublic/voiceSampleUrl/voiceSampleDurationMs/voiceQuality` cohérents de A→E. Enum `ProfileTab { posts, conversations, details }` unique (D6).
