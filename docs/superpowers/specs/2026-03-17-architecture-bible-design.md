# Meeshy Architecture Bible — Design Specification

**Date:** 2026-03-17
**Scope:** Full-stack (Gateway, Web, iOS, future Android) — patterns obligatoires pour atteindre une reactivite WhatsApp-like
**Objectif:** Zero latence percue. L'utilisateur voit TOUJOURS du contenu (sauf cold start sans donnees). Les deux applications sont totalement responsives, sans freeze, avec precharge des donnees.

---

## Table des matieres

1. [Diagnostic — Etat des lieux](#1-diagnostic)
2. [Principes fondamentaux — "Instant App"](#2-principes-fondamentaux)
3. [Patterns obligatoires par couche](#3-patterns-par-couche)
   - 3.1 Backend (Gateway)
   - 3.2 iOS (SwiftUI + MeeshySDK)
   - 3.3 Web (Next.js + React Query)
   - 3.4 Android (futur — Kotlin/Compose)
   - 3.5 Shared (types, validation, resolution)
4. [Audit d'incoherences — 47 findings avec fixes](#4-audit-dincoherences)
5. [Mises a jour CLAUDE.md](#5-mises-a-jour-claudemd)
6. [Plan d'execution phase](#6-plan-dexecution)

---

## 1. Diagnostic

### 1.1 Ce qui fonctionne bien

| Couche | Points forts |
|--------|-------------|
| **iOS** | Cache multi-couches (L1 Dict + L2 GRDB + L3 Disk), prefetch 20 conversations, O(1) index lookups, optimistic updates messages/reactions, actors pour thread safety |
| **Web** | React Query avec `staleTime: Infinity` + Socket.IO live sync, `useSocketCacheSync` bridge, Zustand stores bien structures, shallow selectors |
| **Gateway** | Fastify 5 performant, Socket.IO rooms correctement geres, ZMQ pipeline fonctionnel, error hierarchy bien concue, rate limiting multi-niveaux |
| **SDK** | Dual-target (Core + UI), CacheCoordinator avec 17 socket subscriptions, CacheResult<T> (.fresh/.stale/.expired/.empty), DiskCacheStore avec SHA256 naming |
| **Shared** | Types centralises, events Socket.IO types, Prisma schema unique |

### 1.2 Lacunes critiques

**L'app ne fonctionne PAS comme WhatsApp parce que :**

1. **6 ViewModels iOS sur 9 n'ont AUCUN cache** — Feed, Stories, Bookmarks, Status, Search, PostDetail font un fetch reseau a chaque ouverture. Ecran vide + spinner en attendant.

2. **Le pattern stale-while-revalidate existe dans le SDK mais n'est PAS utilise** — `CacheResult.stale` est prevu mais tous les callers appellent `.value` qui ecrase la distinction fresh/stale. Aucun ViewModel ne fait "afficher stale + refresh en arriere-plan".

3. **Pas d'architecture offline coherente** — `OfflineQueue` existe mais n'est PAS cable a `sendMessage()`. L'iOS n'a pas de banniere offline systematique. Le web n'a pas de detection reseau.

4. **Le gateway n'a AUCUN cache utilisateur** — `prisma.user.findUnique` a CHAQUE requete HTTP. Le `ConversationListCache` est du dead code (`canUseCache = false`). Aucun header HTTP `Cache-Control` sur les routes API.

5. **90 occurrences dans 77 fichiers iOS avec `@ObservedObject ThemeManager.shared`** — chaque changement de theme cause un re-render en cascade de TOUTES les vues souscrites simultanement. Alternative SwiftUI native a considerer : `@Environment(\.colorScheme)` pour les cas simples dark/light.

6. **Le Prisme Linguistique a 3 implementations divergentes** — `resolveUserLanguage` (shared), `auth.ts:179` (gateway), `preferredContentLanguages` (SDK iOS) ne suivent pas le meme ordre de resolution.

### 1.3 Inventaire cache par ViewModel iOS

| ViewModel | CacheCoordinator | Pattern actuel | Impact UX |
|-----------|-----------------|----------------|-----------|
| ConversationListViewModel | `.conversations` + `.messages` | Cache-first + TTL gate 30s | Conversations visibles immediatement |
| ConversationViewModel | `.messages` | Cache-first, toujours refresh | Messages visibles immediatement |
| UserProfileViewModel | `.profiles` | Cache-hit-then-stop (PAS de background refresh) | Profil potentiellement stale indefiniment |
| **FeedViewModel** | **AUCUN** | Network-only | Ecran vide a chaque visite |
| **StoryViewModel** | **AUCUN** | Network-only | Stories absentes au demarrage |
| **BookmarksViewModel** | **AUCUN** | Network-only | Favoris recharges a chaque fois |
| **StatusViewModel** | **AUCUN** | Network-only | Statuts jamais caches |
| **GlobalSearchViewModel** | **AUCUN** | Network-only | Recherches non persistees |
| **PostDetailViewModel** | **AUCUN** | Network-only | Detail post charge chaque fois |

### 1.4 Inventaire cache Web

| Donnee | Cache actuel | Lacune |
|--------|-------------|--------|
| Conversations | React Query (30min GC) | OK, socket sync |
| Messages | React Query infinite (30min GC) | Sort O(n log n) a chaque render |
| Feed | React Query | Pas de persistence offline |
| Traductions | `Map<string, string>` sans eviction | Fuite memoire en session longue |
| Images | Aucune optimisation (`unoptimized: true`) | Full-res partout |

### 1.5 Inventaire cache Gateway

| Cache | Etat | Probleme |
|-------|------|----------|
| ConversationListCache | **DEAD CODE** | `canUseCache = false` + Redis jamais cable |
| TranslationCache | Actif | `redis.keys("translation:*")` O(N) scan |
| LanguageCache | Actif | Insertion-order eviction (pas LRU) |
| MultiLevelCache | Actif | Memoire illimitee, pas de size cap |
| RedisWrapper | Actif | Se desactive permanent sur 1 erreur |
| Auth user cache | **INEXISTANT** | `prisma.user.findUnique` par requete |
| ConversationId cache | **INEXISTANT** | `prisma.conversation.findUnique` par join |
| HTTP Cache-Control | **INEXISTANT** | Aucun header sur les routes API |

---

## 2. Principes fondamentaux — "Instant App"

Ces 7 principes sont **non-negociables** au meme titre que le TDD. Tout nouveau code DOIT les respecter.

### Principe 1 : Cache-First, Network-Second

```
Ouverture ecran
  |
  v
Lire cache local (GRDB/SQLite iOS, React Query/IndexedDB Web)
  |
  +-- Donnees trouvees --> Afficher IMMEDIATEMENT
  |                           |
  |                           v
  |                     Fetch reseau en arriere-plan
  |                           |
  |                           v
  |                     Merge silencieux (pas de spinner, pas de flash)
  |
  +-- Cache vide (cold start) --> Skeleton placeholder + Fetch reseau
```

**Regle absolue** : Pas de spinner si des donnees cachees existent. Le spinner n'apparait QUE quand le cache est vide (premiere utilisation ou cache expire).

**Implementation :**
- **iOS** : Chaque ViewModel DOIT appeler `CacheCoordinator.shared.{store}.load(for: key)` AVANT toute requete API
- **Web** : Chaque `useQuery` DOIT utiliser `placeholderData` depuis un cache persiste (IndexedDB via `persistQueryClient`)
- **Gateway** : Chaque endpoint read-heavy DOIT retourner des headers `Cache-Control` et supporter `ETag`/`If-None-Match`

### Principe 2 : Stale-While-Revalidate

Le modele mental est celui du HTTP `stale-while-revalidate` : **toujours servir le contenu stale pendant qu'on rafraichit**.

```
CacheResult<T>
  .fresh(data, age)   --> Afficher. Rien a faire.
  .stale(data, age)   --> Afficher IMMEDIATEMENT. Lancer refresh en arriere-plan.
  .expired            --> Ne PAS afficher. Fetch obligatoire. Skeleton.
  .empty              --> Premiere visite. Fetch obligatoire. Skeleton.
```

**Regles :**
- `staleTTL` DOIT etre configure pour chaque store (actuellement `messages.staleTTL = nil` — a corriger)
- Les ViewModels DOIVENT distinguer `.stale` de `.fresh` — PAS utiliser `.value` directement
- Le refresh en arriere-plan DOIT etre silencieux (pas de `isLoading = true` quand on sert du stale)

**TTL recommandees :**

| Donnee | TTL (donnee fraiche) | staleTTL (servir en attendant) | maxItems |
|--------|---------------------|-------------------------------|----------|
| Conversations (liste) | 24h | 5 min | -- |
| Messages (par conversation) | 6 mois | **2 min** (actuellement nil) | 200 (actuellement 50) |
| Participants | 24h | 5 min | -- |
| Profils utilisateur | 1h | 5 min | 100 |
| **Feed posts** | **6h** | **2 min** | **100** |
| **Stories** | **1h** | **1 min** | **50** |
| **Bookmarks** | **24h** | **5 min** | **200** |

### Principe 3 : Prefetch Proactif

Charger les donnees AVANT que l'utilisateur en ait besoin. Chaque milliseconde comptee.

| Donnee | Declencheur | Strategie |
|--------|------------|-----------|
| Messages des 20 premieres conversations | Apres chargement liste | `TaskGroup` background (deja fait iOS, a faire Web) |
| Stories actives | Apres chargement liste | Parallele au prefetch messages |
| Feed posts (page 1) | Au lancement app | Background fetch simultane au load conversations |
| Avatars des participants | Avec la liste conversations | `DiskCacheStore.image()` pre-warm / Web: `<link rel=preload>` |
| Commentaires post visible | Quand feed affiche | Prefetch au scroll (iOS: `onAppear` du post) |
| Conversation survolee (Web) | Hover | `queryClient.prefetchQuery()` messages |
| Medias de conversation | Ouverture conversation | Prefetch thumbnails des attachments visibles |

### Principe 4 : Optimistic Updates Systematiques

Toute action utilisateur a un retour INSTANTANE. Le reseau confirme apres.

| Action | Effet UI immediat | Si echec |
|--------|-------------------|----------|
| Envoyer message | Bulle `.sending` ajoutee | Marquer `.failed`, proposer retry |
| Like/reaction | Compteur +1, animation haptic | Compteur -1 silencieux |
| Marquer lu | Badge supprime | Badge restaure |
| Creer post | Post insere en tete de feed | Retirer + toast erreur |
| Supprimer message | Message masque avec animation | Message restaure |
| Rejoindre conversation | Ajout dans la liste | Retirer + toast erreur |
| Modifier profil | Champs mis a jour localement | Rollback aux valeurs precedentes |

**Pattern :**
```
1. Capturer etat precedent (snapshot)
2. Appliquer changement local immediatement
3. Envoyer requete reseau
4. Si succes: confirmer (rien a faire, deja affiche)
5. Si echec: rollback au snapshot + feedback utilisateur
```

### Principe 5 : Offline Graceful Degradation

L'app DOIT fonctionner hors ligne (en lecture) des qu'il y a des donnees cachees.

```
Online       --> Comportement normal
Offline      --> Afficher donnees cachees
              + Banniere "Hors ligne" (subtile, pas bloquante)
              + Actions en queue (OfflineQueue)
              + PAS de spinner, PAS de freeze, PAS d'ecran d'erreur
Retour ligne --> Flush queue en FIFO
              + Refresh silencieux des donnees stale
              + Retirer banniere
```

**Regles :**
- `NetworkMonitor` (NWPathMonitor iOS / `navigator.onLine` + fetch probe Web) DOIT etre souscrit globalement
- Toute action d'ecriture offline DOIT etre enqueue dans `OfflineQueue` (pas jeter d'erreur a l'utilisateur)
- L'`OfflineQueue` DOIT etre cable a `sendMessage()`, `likePost()`, `markAsRead()`, `addReaction()`
- Le flush DOIT etre FIFO avec retry exponentiel (1s, 2s, 4s, max 30s)

### Principe 6 : Zero Re-render Inutile (iOS specifique)

Le scroll DOIT etre a 60 FPS constant. Chaque re-render est un ennemi.

**Regles obligatoires SwiftUI :**

| Regle | Pourquoi | Comment |
|-------|----------|---------|
| Pas d'`@ObservedObject` pour des singletons globaux dans les vues leaf | Cause re-render de TOUTES les vues souscrites | Passer `isDark: Bool`, `accentColor: String` comme `let` params, ou utiliser `@Environment(\.colorScheme)` pour le dark/light (SwiftUI natif, propage automatiquement dans la hierarchie sans params manuels) |
| Pas de computed property couteux dans `body` | Recalcule a chaque render | Pre-calculer dans ViewModel ou `init`, stocker en `let` |
| `Equatable` + `.equatable()` sur les vues repetees en liste | SwiftUI skip le re-render si inputs inchanges | Implementer `Equatable` basee sur les champs visuels |
| Pas d'animation `repeatForever` sur des vues toujours visibles | GPU drain constant a 60fps | Animations finies ou declenchees par action |
| `LazyVStack` / `LazyHStack` pour les listes | Load on demand | Jamais `VStack` pour une liste scrollable |
| `@State` pour les timers (pas `let`) | `let` recree le timer a chaque reconstruction struct | `@State private var timer = Timer.publish(...)` |
| Guard les `onReceive` de timer | Mutation `@State` a chaque tick meme si inutile | `guard condition else { return }` |

### Principe 7 : Source de Verite Unique par Donnee

Chaque type de donnee a UNE source de verite. Pas de duplication.

| Donnee | Source de verite | Interdit |
|--------|-----------------|----------|
| Types partages | `packages/shared/types/` | Redefinir dans le SDK ou l'app |
| Resolution langue | `packages/shared/utils/conversation-helpers.ts:resolveUserLanguage()` | Reimplementer dans auth.ts, ViewModel, ou hooks |
| Modeles API iOS | `packages/MeeshySDK/Sources/MeeshySDK/Models/` | Definir dans `apps/ios/` |
| Etat cache iOS | `CacheCoordinator.shared` | TTL gates locaux dans les ViewModels |
| Etat cache Web | React Query | `conversation-store.ts` (dead code) |
| Events Socket.IO | `packages/shared/types/socketio-events.ts` | String literals hardcodes |
| Format reponse API | `services/gateway/src/utils/response.ts:sendSuccess()` | Object literals `{ success: true, data }` |
| Validation | `packages/shared/utils/validation.ts:CommonSchemas` | Schemas locaux incomplets |

---

## 3. Patterns par couche

### 3.1 Backend (Gateway)

#### Pattern G1 : Auth User Cache (Redis, 5 min TTL)

Le `prisma.user.findUnique` dans auth.ts DOIT etre cache.

```
auth.ts:
  1. Decoder JWT → extraire userId
  2. Verifier Redis: `user:session:{userId}`
     - HIT → utiliser les donnees cachees
     - MISS → prisma.user.findUnique → sauver en Redis (TTL 5min)
  3. Invalider le cache sur: profile update, role change, language change
```

Champs a cacher (stables par session) : `id, username, email, firstName, lastName, displayName, avatar, role, systemLanguage, regionalLanguage, customDestinationLanguage, useCustomDestination, translateToSystemLanguage, translateToRegionalLanguage`

Champs a NE PAS cacher (volatiles) : `isOnline, lastActiveAt, updatedAt`

#### Pattern G2 : ConversationId Mapping Cache (in-memory, permanent)

`normalizeConversationId` fait un `prisma.conversation.findUnique` a chaque `conversation:join`. Le mapping identifier→ObjectId est **immutable** — cacher indefiniment.

```typescript
private conversationIdCache = new Map<string, string>()

async normalizeConversationId(id: string): Promise<string> {
  if (isObjectId(id)) return id
  const cached = this.conversationIdCache.get(id)
  if (cached) return cached
  const conv = await prisma.conversation.findUnique({ where: { identifier: id }, select: { id: true } })
  if (conv) this.conversationIdCache.set(id, conv.id)
  return conv?.id ?? id
}
```

#### Pattern G3 : HTTP Cache-Control sur endpoints read-heavy

```
GET /conversations          → Cache-Control: private, max-age=0, must-revalidate + ETag
GET /conversations/:id/messages → Cache-Control: private, max-age=0, must-revalidate + ETag
GET /posts/feed             → Cache-Control: private, max-age=30
GET /users/:id              → Cache-Control: private, max-age=60
GET /attachments/:id        → Cache-Control: public, max-age=31536000, immutable (deja fait)
```

L'`ETag` est un hash MD5 du body serialise. Si le client envoie `If-None-Match` avec le meme ETag, repondre `304 Not Modified` sans body.

#### Pattern G4 : Response Format Unifie

TOUTES les routes DOIVENT utiliser `sendSuccess()` / `sendError()` de `utils/response.ts`.

```typescript
// CORRECT
return sendSuccess(reply, { data: conversations, meta: { pagination: { total, offset, limit, hasMore } } })

// INTERDIT
return reply.send({ success: true, data: conversations, pagination: { nextCursor, hasMore } })
```

Les routes posts DOIVENT etre migrees vers ce format.

#### Pattern G5 : RedisWrapper Resilience

La logique de reconnexion est correcte (3 tentatives). Le vrai probleme : une seule erreur d'operation (`get`/`set`/`del` timeout) met `permanentlyDisabled = true` immediatement, tuant Redis pour toute la duree du process. Adopter un circuit breaker :

```
Closed (normal)  --[3 erreurs en 1 min]--> Open (desactive 30s)
Open             --[30s ecoules]--------> Half-Open (1 requete test)
Half-Open        --[succes]-------------> Closed
Half-Open        --[echec]--------------> Open (30s de plus)
```

#### Pattern G6 : Eliminer les read-after-write

`MessagingService.handleMessage()` DOIT retourner le message enrichi complet (avec sender, attachments, replyTo). Le handler Socket.IO ne doit PAS re-fetcher depuis la DB.

#### Pattern G7 : resolveUserLanguage comme source unique

`auth.ts:179` DOIT appeler `resolveUserLanguage()` de `packages/shared/utils/conversation-helpers.ts` au lieu de reimplementer la resolution. Ce changement corrige simultanement :
- L'ordre inverse `regionalLanguage || systemLanguage` (devrait etre `systemLanguage` d'abord)
- Le `customDestinationLanguage` utilise sans verifier `useCustomDestination`
- Le fallback `'en'` au lieu de `'fr'`

### 3.2 iOS (SwiftUI + MeeshySDK)

#### Pattern I1 : ViewModel Cache-First Template

Chaque ViewModel qui charge des donnees DOIT suivre ce pattern :

```swift
@MainActor class SomeViewModel: ObservableObject {
    @Published private(set) var items: [Item] = []
    @Published private(set) var loadState: LoadState = .idle

    enum LoadState {
        case idle           // Pas encore charge
        case cachedStale    // Donnees cachees affichees, refresh en cours
        case cachedFresh    // Donnees fraiches du cache, pas besoin de fetch
        case loading        // Premiere charge (pas de cache) — skeleton
        case loaded         // Donnees fraiches du reseau
        case offline        // Offline + donnees cachees
        case error(String)  // Erreur + donnees cachees eventuelles
    }

    func load() async {
        // 1. Cache-first
        let cacheResult = await CacheCoordinator.shared.{store}.load(for: key)

        switch cacheResult {
        case .fresh(let data, _):
            items = data
            loadState = .cachedFresh
            return // Pas besoin de fetch

        case .stale(let data, _):
            items = data
            loadState = .cachedStale
            // Continue vers le fetch en arriere-plan (PAS de spinner)

        case .expired, .empty:
            loadState = .loading // Skeleton visible
        }

        // 2. Fetch reseau
        do {
            let freshData = try await service.fetch()
            items = freshData
            loadState = .loaded
            // 3. Sauver en cache (background)
            Task.detached(priority: .utility) {
                await CacheCoordinator.shared.{store}.save(freshData, for: key)
            }
        } catch {
            if items.isEmpty {
                loadState = .error(error.localizedDescription)
            } else {
                loadState = NetworkMonitor.shared.isOffline ? .offline : .error(error.localizedDescription)
                // Les donnees cachees restent affichees
            }
        }
    }
}
```

**Vue correspondante :**
```swift
var body: some View {
    Group {
        switch viewModel.loadState {
        case .loading:
            SkeletonPlaceholder()  // PAS un spinner
        case .error(let msg) where viewModel.items.isEmpty:
            ErrorRetryView(message: msg, onRetry: { Task { await viewModel.load() } })
        default:
            ContentView(items: viewModel.items)
        }
    }
    .overlay(alignment: .top) {
        if viewModel.loadState == .offline {
            OfflineBanner()
        }
    }
}
```

#### Pattern I2 : CacheCoordinator — Stores manquants

Ajouter les stores pour les donnees sociales :

```swift
// Dans CacheCoordinator.swift
public let feed = GRDBCacheStore<String, FeedPost>(policy: .feed)
public let stories = GRDBCacheStore<String, MeeshyStory>(policy: .stories)
public let bookmarks = GRDBCacheStore<String, FeedPost>(policy: .bookmarks)
```

Souscrire aux events SocialSocket (actuellement NON souscrit) :
- `post:created` → append to feed store
- `post:updated` → replace in feed store
- `post:deleted` → filter from feed store
- `post:liked` → update like count in feed store
- `story:created` → append to stories store
- `story:viewed` → mark as viewed in stories store

#### Pattern I3 : isDark Propagation (pas @ObservedObject ThemeManager)

Les vues leaf (repetees en liste) DOIVENT recevoir `isDark: Bool` comme parametre, PAS souscrire a `@ObservedObject ThemeManager.shared`.

**Vues prioritaires a migrer :**
1. `ThemedMessageBubble` — rendu par cellule dans la liste messages
2. `MeeshyAvatar` — rendu par cellule dans la liste conversations ET messages
3. `ThemedConversationRow` — rendu par cellule dans la liste conversations

**Pattern :**
```swift
// INTERDIT dans une vue leaf
@ObservedObject var theme = ThemeManager.shared

// OBLIGATOIRE
let isDark: Bool  // Passe par le parent qui souscrit a ThemeManager
```

Le parent (ConversationView, ConversationListView) souscrit UNE fois et propage `isDark` a tous les enfants.

#### Pattern I4 : Skeleton Placeholders (pas de spinners)

Chaque ecran DOIT avoir un skeleton qui mime la forme du contenu final :

| Ecran | Skeleton |
|-------|----------|
| Liste conversations | 8 rows avec cercle gris + 2 barres grises |
| Messages | 5 bulles grises alternees gauche/droite |
| Feed | 2 cartes avec rectangle gris + barre grise |
| Stories | 6 cercles gris en scroll horizontal |
| Profil | Cercle avatar gris + 3 barres grises |

Utiliser `.shimmer()` (existe deja) UNIQUEMENT pendant le chargement initial. Retirer le shimmer des que les donnees arrivent.

#### Pattern I5 : OfflineQueue Cable

`OfflineQueue` DOIT etre cable a ces actions :
- `ConversationViewModel.sendMessage()` → si offline, enqueue au lieu de throw
- `FeedViewModel.likePost()` → si offline, enqueue
- `ConversationViewModel.markAsRead()` → si offline, enqueue
- `ConversationViewModel.addReaction()` → si offline, enqueue

Pattern dans le ViewModel :
```swift
func sendMessage(_ content: String) async {
    // Optimistic insert immediatement
    let localMessage = Message(content: content, status: .sending)
    messages.append(localMessage)

    if NetworkMonitor.shared.isOffline {
        messages[localIdx].deliveryStatus = .queued
        await OfflineQueue.shared.enqueue(.sendMessage(conversationId: id, content: content))
        return
    }

    do {
        let sent = try await messageService.send(content)
        messages[localIdx] = sent  // Remplacer optimistic par reel
    } catch {
        messages[localIdx].deliveryStatus = .failed
    }
}
```

### 3.3 Web (Next.js + React Query)

#### Pattern W1 : React Query Persistence (IndexedDB)

Persister le cache React Query dans IndexedDB pour un cold start instantane.
localStorage est limite a 5-10 MB — insuffisant pour une app de messaging. Utiliser IndexedDB :

```typescript
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { persistQueryClient } from '@tanstack/react-query-persist-client'
import { get, set, del } from 'idb-keyval'

const persister = createAsyncStoragePersister({
  storage: { getItem: get, setItem: set, removeItem: del }
})

persistQueryClient({ queryClient, persister, maxAge: 24 * 60 * 60 * 1000 })
```

**Resultat :** A l'ouverture du navigateur, les conversations et messages de la session precedente s'affichent IMMEDIATEMENT. Le fetch reseau met a jour en arriere-plan.

#### Pattern W2 : Data Prefetch on Hover

```typescript
// hooks/use-prefetch-conversation.ts
function usePrefetchConversation(conversationId: string) {
  const queryClient = useQueryClient()

  const prefetch = useCallback(() => {
    queryClient.prefetchInfiniteQuery({
      queryKey: queryKeys.messages.infinite(conversationId),
      queryFn: () => fetchMessages(conversationId, { limit: 30 }),
      staleTime: 5 * 60 * 1000
    })
  }, [conversationId, queryClient])

  return { onMouseEnter: prefetch }
}

// Dans ConversationItem :
<div {...usePrefetchConversation(conversation.id)}>
  <ConversationRow conversation={conversation} />
</div>
```

#### Pattern W3 : Next.js Image Optimization

Retirer `unoptimized: true` de `next.config.ts` et configurer correctement :

```typescript
images: {
  // RETIRER: unoptimized: true
  formats: ['image/webp', 'image/avif'],
  deviceSizes: [640, 750, 828, 1080, 1200],
  imageSizes: [16, 32, 48, 64, 96, 128, 256],
  remotePatterns: [
    { protocol: 'https', hostname: 'gate.meeshy.me' },
    { protocol: 'https', hostname: '*.meeshy.me' }
  ]
}
```

Utiliser `<Image>` de Next.js au lieu de `<img>` pour les avatars et attachments.

#### Pattern W4 : Supprimer conversation-store.ts (dead code)

Ce store contient des mock functions qui retournent `[]`. Il est un artefact de la migration vers React Query. Avant suppression, migrer les imports existants :
- `apps/web/stores/index.ts` (re-export)
- `apps/web/services/socketio/presence.service.ts`
- `apps/web/components/common/bubble-message/MessageContent.tsx`
- Tests referençant le store

Puis supprimer le fichier.

#### Pattern W5 : Error Boundaries par feature

```typescript
// Au lieu d'un seul ErrorBoundary global
<Layout>
  <ErrorBoundary fallback={<ConversationListError />}>
    <ConversationList />
  </ErrorBoundary>
  <ErrorBoundary fallback={<MessageListError />}>
    <MessageList />
  </ErrorBoundary>
</Layout>
```

Si la liste de messages crash, la liste des conversations reste fonctionnelle.

#### Pattern W6 : Offline Detection + Banner

```typescript
// hooks/use-network-status.ts
function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  return isOnline
}
```

Afficher une banniere subtle quand offline. Les mutations React Query DOIVENT utiliser `onMutate` pour optimistic + `onError` pour rollback — aucun changement si le pattern optimistic est deja en place.

#### Pattern W7 : Translation Cache avec Eviction

Remplacer le `Map<string, string>` sans eviction par un LRU borne :

```typescript
class LRUCache<K, V> {
  private cache = new Map<K, V>()
  constructor(private maxSize: number) {}

  get(key: K): V | undefined {
    const value = this.cache.get(key)
    if (value !== undefined) {
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(key: K, value: V) {
    this.cache.delete(key)
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
    }
    this.cache.set(key, value)
  }
}

const translationCache = new LRUCache<string, string>(500)
```

### 3.4 Android (futur — Kotlin/Compose)

Les patterns ci-dessus s'appliquent nativement a Android :

| Pattern iOS | Equivalent Android |
|------------|-------------------|
| CacheCoordinator (GRDB actor) | Room Database + Repository pattern |
| GRDBCacheStore | Room DAO avec `@Query` + Flow |
| DiskCacheStore | Coil image loader + disk cache |
| CacheResult<T> | `sealed class CacheResult<T>` identique |
| @MainActor ViewModel | `viewModelScope` + `Dispatchers.Main` |
| NetworkMonitor (NWPathMonitor) | `ConnectivityManager.NetworkCallback` |
| OfflineQueue | WorkManager avec constraints `NetworkType.CONNECTED` |
| Combine PassthroughSubject | `SharedFlow` / `StateFlow` |
| LazyVStack | `LazyColumn` (Compose) |

Le SDK Android DOIT implementer les memes interfaces que le SDK iOS :
- `CacheCoordinator` avec les memes stores et policies
- `CacheResult<T>` avec les memes 4 etats
- Memes socket subscriptions pour invalidation en temps reel

### 3.5 Shared (types, validation, resolution)

#### Pattern S1 : resolveUserLanguage comme source unique

`resolveUserLanguage()` dans `packages/shared/utils/conversation-helpers.ts` est LA source de verite.

**Etat actuel — 3 implementations divergentes :**

| Implementation | Ordre | Flags respectes | Fallback |
|---------------|-------|----------------|----------|
| `resolveUserLanguage()` (shared, source de verite declaree) | custom → system → regional | Oui (`useCustomDestination`, `translateToSystemLanguage`, `translateToRegionalLanguage`) | `'fr'` |
| `auth.ts:179` (gateway) | custom → regional → system | NON (aucun flag verifie) | `'en'` |
| `preferredContentLanguages` (SDK iOS) | custom → system → regional | NON (`translateToSystemLanguage` et `translateToRegionalLanguage` ignores) | aucun |
| `resolveParticipantLanguage` (shared) | custom → regional → system | NON (aucun flag) | `systemLanguage` |

**Decision de design requise :** Les flags `translateToSystemLanguage` et `translateToRegionalLanguage` DOIVENT-ils gater l'inclusion ? La reponse est **OUI** — c'est le sens de ces booleans. Un utilisateur qui desactive `translateToSystemLanguage` ne veut PAS recevoir de traductions dans sa langue systeme.

**Ordre canonique (respectant les flags) :**
```
1. Override manuel (selection explicite dans l'onglet Language)
2. customDestinationLanguage (SI useCustomDestination === true)
3. systemLanguage (SI translateToSystemLanguage === true OU si c'est le seul fallback)
4. regionalLanguage (SI translateToRegionalLanguage === true)
5. Fallback: systemLanguage || 'fr'
```

Note : `systemLanguage` apparait en #3 (gate) ET en #5 (fallback). C'est le comportement actuel de `resolveUserLanguage()` qui est correct : la langue systeme est toujours le dernier recours, mais les traductions VERS cette langue ne sont generees que si le flag est actif.

**Implementations a aligner :**
- `auth.ts:179` → appeler `resolveUserLanguage(user)` de shared (corrige l'ordre ET les flags ET le fallback)
- `MeeshyUser.preferredContentLanguages` (SDK iOS) → respecter `translateToSystemLanguage` ET `translateToRegionalLanguage` flags
- `utils/user-language-preferences.ts` (Web) → importer et utiliser `resolveUserLanguage` de shared
- `use-message-translations.ts` (Web) → supprimer la reimplementation, utiliser le hook unifie
- `resolveParticipantLanguage` (shared) → aligner sur le meme ordre avec flags

#### Pattern S2 : Validation Zod Complete

Note : `validation.ts` definit deja `messageTypeEnum` (ligne 425) avec tous les types et `conversationTypeEnum` (ligne 548) avec `broadcast`. Le probleme est que `CommonSchemas.messageType` (ligne 67) est une **copie incomplete** a cote. Fix : aligner `CommonSchemas` sur les enums existants ou supprimer la duplication :

```typescript
// Option A : Aligner CommonSchemas
messageType: messageTypeEnum  // Reutiliser l'enum existant

// Option B : Supprimer CommonSchemas.messageType et utiliser messageTypeEnum directement
```

Meme chose pour `CommonSchemas.conversationType` → utiliser `conversationTypeEnum`.

#### Pattern S3 : TranslationData — Resoudre la collision de nom

Renommer `TranslationData` dans `conversation.ts` en `MessageTranslationPayload` pour eviter la collision avec `TranslationData` dans `socketio-events.ts`.

#### Pattern S4 : Notification Events Types

Ajouter les 4 events notification dans `ServerToClientEvents` :
```typescript
[SERVER_EVENTS.NOTIFICATION_NEW]: (data: NotificationPayload) => void
[SERVER_EVENTS.NOTIFICATION_READ]: (data: { notificationId: string }) => void
[SERVER_EVENTS.NOTIFICATION_DELETED]: (data: { notificationId: string }) => void
[SERVER_EVENTS.NOTIFICATION_COUNTS]: (data: { unreadCount: number }) => void
```

Et les souscrire dans le SDK iOS `MessageSocketManager`.

---

## 4. Audit d'incoherences — 47 findings avec fixes

### P0 — Correctness (PRIORITE IMMEDIATE)

| # | Finding | Fix | Fichiers |
|---|---------|-----|----------|
| 1 | `_extractConversationLanguages` ignore `useCustomDestination` | Gater `customDestinationLanguage` derriere le flag | `services/gateway/src/services/message-translation/MessageTranslationService.ts` |
| 2 | `auth.ts:179` mauvais ordre de resolution langue | Appeler `resolveUserLanguage(user)` de shared | `services/gateway/src/middleware/auth.ts:179` |
| 3 | `conversationListCache` Redis jamais cable + `canUseCache = false` | Cable Redis ou supprimer le dead code | `services/gateway/src/services/ConversationListCache.ts:44`, `routes/conversations/core.ts:173` |
| 4 | `requireRole`/`requireEmailVerification` stubs vides | Implementer ou supprimer + throw si appele | `services/gateway/src/middleware/auth.ts:502-520` |
| 5 | iOS `preferredContentLanguages` ignore `translateToSystemLanguage` | Gater `systemLanguage` derriere le flag | `packages/MeeshySDK/Sources/MeeshySDK/Auth/AuthModels.swift:289-301` |
| 6 | SDK `ConversationType` manque `.broadcast` | Ajouter le case + mapping dans `toConversation()` | `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift` |
| 7 | Web v2 MediaCards fallback `translations[0]` | Retourner `undefined` si pas de match langue preferee | `apps/web/components/v2/Media{Video,Image,Audio}Card.tsx` |
| 8 | 3 fallback langues differentes (`fr`, `en`, `en`) | Unifier sur `'fr'` partout (langue par defaut Meeshy) | `conversation-helpers.ts:29`, `auth.ts:182`, `messages.ts:626` |

### P1 — Performance (SPRINT SUIVANT)

| # | Finding | Fix | Fichiers |
|---|---------|-----|----------|
| 9 | Feed zero cache iOS | Ajouter store `.feed` dans CacheCoordinator + adopter pattern I1 | `FeedViewModel.swift`, `CacheCoordinator.swift` |
| 10 | OfflineQueue non cable a sendMessage | Implementer pattern I5 | `ConversationViewModel.swift`, `OfflineQueue.swift` |
| 11 | 78x @ObservedObject ThemeManager en vues leaf | Migration progressive isDark:Bool (pattern I3) | `ThemedMessageBubble.swift`, `MeeshyAvatar.swift` + 76 autres |
| 12 | colorPalette computed (~13 appels/row) | Stocker comme `let` dans init | `CoreModels.swift:140-157` |
| 13 | ISO8601DateFormatter recree par champ | Cacher en `static let` | `APIClient.swift:174-184` |
| 14 | Auth middleware prisma.user.findUnique par requete | Pattern G1 (Redis cache 5min) | `auth.ts:136-156` |
| 15 | Re-fetch message apres handleMessage | Pattern G6 (retourner enrichi) | `MeeshySocketIOManager.ts:424-496` |
| 16 | Pas de timeout ZMQ | Ajouter TTL 30s + retry automatique | `ZmqTranslationClient`, `MessageTranslationService` |
| 17 | Web `unoptimized: true` | Pattern W3 (activer optimisation images) | `apps/web/next.config.ts` |
| 18 | Web sort messages O(n log n) par render | Memoize la liste triee par ID, pas par reference | `use-conversation-messages-rq.ts:152-162` |
| 19 | Web translation cache sans eviction | Pattern W7 (LRU 500) | `apps/web/utils/translation.ts:12` |
| 20 | Pas de prefetch donnees Web | Pattern W2 (hover prefetch) | Nouveau hook |

### P2 — Incoherences (BACKLOG PRIORITAIRE)

| # | Finding | Fix |
|---|---------|-----|
| 21 | 2 MessageSocketManager.shared (SDK + app) | Consolider en un seul dans le SDK |
| 22 | ChatViewModelTests 100% commente | Supprimer ou reactiver avec ConversationViewModel |
| 23 | FeedViewModel.requestTranslation bypass DI | Utiliser `self.postService` |
| 24 | AnyCodable duplique dans FeedViewModel | Extraire vers shared ou SDK |
| 25 | Debug print/CFAbsoluteTimeGetCurrent en prod | Remplacer par `os.Logger` |
| 26 | conversation-store.ts dead code Web | Supprimer le fichier |
| 27 | setTyping fonction vide Web | Implementer ou supprimer |
| 28 | Double language store Web | Fusionner en un seul store |
| 29 | navigator.language pour contenu Web | Utiliser `resolveUserLanguage` |
| 30 | 3 implementations resolution langue Web | Consolider en un seul hook |
| 31 | Posts routes sans sendSuccess() | Migrer vers response.ts |
| 32 | Server error handler shadow BaseAppError | Supprimer les classes locales |
| 33 | (request as any).authContext x30 | Utiliser `UnifiedAuthRequest` type |
| 34 | TranslationData collision de nom | Renommer dans conversation.ts |
| 35 | CommonSchemas.messageType incomplet | Ajouter audio/video/location |

### P3 — Dette technique (ROADMAP)

| # | Finding | Fix |
|---|---------|-----|
| 36 | Tokens JWT en UserDefaults | Migrer vers Keychain |
| 37 | UserRole.AGENT manquant TS | Ajouter dans shared/types/user.ts |
| 38 | 4 notification events non types | Ajouter dans ServerToClientEvents |
| 39 | Rate limit absent Socket.IO MESSAGE_SEND | Appeler socket-rate-limiter |
| 40 | require() CommonJS dans module ES Web | Refactorer en import() dynamique |
| 41 | MessageTranslationService.bak.ts | Supprimer |
| 42 | Display name anonyme re-fetch par msg | Cacher a l'auth socket |
| 43 | syncEncryption/syncPrivacy double fetch | Dedupliquer |
| 44 | Un seul ErrorBoundary global Web | Pattern W5 |
| 45 | Image NSCache exclu de la pressure memoire | Connecter a evictUnderMemoryPressure |
| 46 | Messages L1 illimite vs L2 cap 50 | Aligner a 200 |
| 47 | Certificate pinning hostname hardcode | Sourcer de MeeshyConfig |

---

## 5. Mises a jour CLAUDE.md

Les sections suivantes DOIVENT etre ajoutees aux CLAUDE.md respectifs :

### 5.1 CLAUDE.md racine — Nouvelle section "Instant App Principles"

```markdown
## Instant App Principles (Non-Negotiable)

Ces principes sont obligatoires au meme titre que le TDD.

### Cache-First, Network-Second
Tout ecran DOIT afficher des donnees cachees IMMEDIATEMENT si elles existent.
Pas de spinner si le cache contient des donnees (meme stale).
Le spinner/skeleton n'apparait QUE sur un cache vide (cold start).

### Stale-While-Revalidate
Utiliser CacheResult<T> (.fresh/.stale/.expired/.empty) et distinguer chaque cas.
Servir `.stale` immediatement + refresh en arriere-plan.
Ne JAMAIS appeler `.value` directement — traiter chaque cas explicitement.

### Optimistic Updates
Toute action utilisateur a un retour instantane. Le reseau confirme apres.
Capturer snapshot → appliquer local → envoyer reseau → rollback si echec.

### Offline Graceful
L'app DOIT fonctionner hors ligne en lecture.
Actions d'ecriture en queue (OfflineQueue). Flush FIFO au retour en ligne.

### Zero Re-render Inutile
Vues leaf : PAS d'@ObservedObject sur des singletons globaux.
Passer des valeurs primitives (isDark: Bool, accentColor: String).
Equatable + .equatable() sur toute vue repetee en liste.

### Source de Verite Unique
Chaque donnee a UNE source. Pas de reimplementation.
Resolution langue : resolveUserLanguage() de packages/shared/.
Types : packages/shared/types/. Modeles iOS : packages/MeeshySDK/.
Format reponse : sendSuccess()/sendError() de utils/response.ts.
```

### 5.2 apps/ios/CLAUDE.md — Section "Cache-First Pattern"

```markdown
## Cache-First Pattern (Obligatoire)

Chaque ViewModel qui charge des donnees DOIT :
1. Appeler CacheCoordinator.shared.{store}.load(for: key) AVANT toute requete API
2. Distinguer .fresh / .stale / .expired / .empty dans un switch
3. Afficher .stale immediatement + refresh silencieux en arriere-plan
4. NE PAS afficher de spinner si des donnees cachees existent
5. Utiliser SkeletonPlaceholder (pas UIActivityIndicatorView/ProgressView) sur cache vide

### LoadState Enum
Tout ViewModel DOIT exposer un `loadState: LoadState` avec les cas :
.idle, .cachedStale, .cachedFresh, .loading, .loaded, .offline, .error(String)

### Vues leaf — Zero @ObservedObject Singleton
Les vues rendues en boucle (ThemedMessageBubble, MeeshyAvatar, ThemedConversationRow)
NE DOIVENT PAS avoir @ObservedObject sur des singletons globaux.
Passer isDark: Bool, accentColor: String comme parametres let.
```

### 5.3 apps/web/CLAUDE.md — Section "React Query Patterns"

```markdown
## React Query Patterns (Obligatoire)

### Cache Persistence
Le cache React Query DOIT etre persiste en IndexedDB via persistQueryClient.
Resultat : ouverture du navigateur = donnees de la session precedente affichees immediatement.

### Hover Prefetch
Les elements cliquables (ConversationItem, PostCard) DOIVENT prefetch
les donnees de la destination sur hover via queryClient.prefetchQuery().

### Translation Cache
Le cache de traduction DOIT etre un LRU borne (max 500 entries), pas un Map sans eviction.

### Error Boundaries
Chaque feature DOIT avoir son propre ErrorBoundary.
Un crash dans la liste messages ne doit PAS crasher la liste conversations.

### Dead Code
conversation-store.ts est du DEAD CODE — NE PAS utiliser.
Utiliser les hooks React Query (useConversationsQuery, useConversationMessages).
```

### 5.4 services/gateway/CLAUDE.md — Section "Caching & Response"

```markdown
## Caching Patterns (Obligatoire)

### Auth User Cache
L'auth middleware DOIT cacher le resultat prisma.user.findUnique en Redis (5min TTL).
Invalider sur: profile update, role change, language change.

### ConversationId Cache
normalizeConversationId DOIT cacher le mapping identifier→ObjectId en memoire (immutable).

### HTTP Cache-Control
Endpoints read-heavy DOIVENT retourner des headers Cache-Control + ETag.
Le client envoie If-None-Match, le gateway repond 304 si inchange.

### Response Format
TOUTES les routes DOIVENT utiliser sendSuccess()/sendError() de utils/response.ts.
Pagination sous meta.pagination, PAS en top-level.
Erreurs sous error: { code, message }, PAS error: "string".
```

---

## 6. Architecture Avancee — Vision Long Terme

Cette section couvre les aspects qui vont au-dela du "fix immediat" et posent les fondations pour les 10-30 prochaines annees de la plateforme.

### 6.1 HTTP Moderne — Request ID, Caching Headers, Protocols

#### 6.1.1 Correlation ID / Request Tracing

Chaque requete entrante DOIT recevoir un identifiant unique qui la suit a travers toute la chaine : client → gateway → translator → DB → response.

```
Client envoie:
  X-Request-ID: uuid-v7 (genere par le client)

Gateway:
  - Si X-Request-ID present, utiliser celui du client
  - Sinon, generer un UUID v7 (ordonne temporellement)
  - Propager dans TOUS les logs (Pino child logger)
  - Propager vers translator via ZMQ Frame 1 metadata
  - Retourner dans la reponse: X-Request-ID: <meme valeur>

Avantage:
  - Debug bout-en-bout d'une requete en une seule recherche de log
  - Detection de requetes dupliquees (idempotency)
  - Metriques de latence par requete
```

**Implementation Fastify :**
```typescript
// middleware/request-id.ts
fastify.addHook('onRequest', (request, reply, done) => {
  const requestId = request.headers['x-request-id'] ?? crypto.randomUUID()
  request.id = requestId
  reply.header('x-request-id', requestId)
  // Enrichir le logger Pino pour toute la requete
  request.log = request.log.child({ requestId })
  done()
})
```

**Etat actuel des headers :**

Le systeme a deja des headers `X-Meeshy-*` envoyes par les clients :

| Header | iOS | Web | Usage actuel |
|--------|-----|-----|-------------|
| `X-Meeshy-Platform` | `"ios"` | `"web"` | Identification plateforme |
| `X-Meeshy-Version` | Version app | -- | Versioning |
| `X-Meeshy-Build` | Build number | -- | Versioning |
| `X-Meeshy-Device` | Modele device | -- | Analytics |
| `X-Meeshy-OS` | Version OS | -- | Compatibilite |
| `X-Meeshy-Locale` | Locale device | -- | i18n UI |
| `X-Meeshy-Timezone` | Timezone | Timezone | Affichage heures |
| `X-Meeshy-Country` | Geoloc country | Geoloc country | Analytics |
| `X-Meeshy-City` | Geoloc city (1h cache) | Geoloc city | Analytics |

**Manquant et a ajouter :**

| Header | Direction | Usage |
|--------|-----------|-------|
| `X-Request-ID` | Bidirectionnel | Correlation/tracing (UUID v7) |
| `X-App-ID` | Client → Server | Identification app officielle |
| `X-App-Signature` | Client → Server | HMAC verification (section 6.2.1) |
| `X-App-Timestamp` | Client → Server | Anti-replay pour signature |
| `X-Device-ID` | Client → Server | Identification device persistant |
| `Cache-Control` | Server → Client | Politique cache HTTP (section 6.1.2) |
| `ETag` | Server → Client | Validation conditionnelle |
| `Vary` | Server → Client | `Authorization, Accept-Language` |

**UUID v7 plutot que v4** : UUID v7 (RFC 9562, 2024) encode un timestamp dans les premiers bits, ce qui les rend ordonnables temporellement. Utile pour le tri chronologique des logs et comme curseur de pagination naturel. Adopter partout ou un ID genere cote client est necessaire.

#### 6.1.2 HTTP Caching Headers — Strategie Complete

| Endpoint | Cache-Control | ETag | Rationale |
|----------|--------------|------|-----------|
| `GET /conversations` | `private, no-cache` | Oui (hash du body) | Donnee par utilisateur, change souvent. ETag permet 304. |
| `GET /conversations/:id/messages` | `private, no-cache` | Oui (hash du dernier message ID) | Messages recents changent. Anciens messages sont stables. |
| `GET /conversations/:id/messages?before=cursor` | `private, max-age=3600, immutable` | Non | Messages historiques ne changent jamais (sauf edit/delete). |
| `GET /posts/feed` | `private, max-age=30` | Non | Feed change frequemment, short TTL acceptable. |
| `GET /users/:id` | `private, max-age=60` | Oui | Profil change rarement. |
| `GET /attachments/:id` | `public, max-age=31536000, immutable` | Non | Content-addressed, deja en place. |
| `GET /stories` | `private, max-age=10` | Non | Stories expirent, court TTL. |
| Static assets (JS/CSS) | `public, max-age=31536000, immutable` | Non | Content-hashed par le bundler. |

**Pattern ETag Fastify :**

Eviter le hash MD5 du body complet (annule le benefice du caching — on serialise quand meme).
Utiliser un ETag composite base sur les timestamps et counts :

```typescript
// Conversations: ETag = hash(derniere updatedAt + count)
// Messages: ETag = hash(dernier message ID + count)
// Profils: ETag = hash(updatedAt)

fastify.addHook('onRequest', (request, reply, done) => {
  if (request.method === 'GET') {
    const ifNoneMatch = request.headers['if-none-match']
    if (ifNoneMatch) {
      request.ifNoneMatch = ifNoneMatch  // Stocker pour verification dans le handler
    }
  }
  done()
})

// Dans le handler de route :
const etag = `"${latestUpdatedAt.getTime()}-${totalCount}"`
if (request.ifNoneMatch === etag) {
  return reply.status(304).send()
}
reply.header('etag', etag)
return sendSuccess(reply, { data, meta })
```

**Vary header** : Toujours inclure `Vary: Authorization, Accept-Language` sur les endpoints qui changent selon l'utilisateur ou la langue.

#### 6.1.3 HTTP/2 et HTTP/3 (QUIC)

**HTTP/2** (a activer maintenant via Traefik) :
- Multiplexing : plusieurs requetes sur une seule connexion TCP
- Header compression (HPACK) : reduit la taille des headers repetitifs
- Server Push : le gateway peut pousser des ressources sans que le client les demande
- **Impact Meeshy** : Les connexions multiples (REST + images + attachments) beneficient du multiplexing. Traefik supporte HTTP/2 nativement.

**HTTP/3 (QUIC)** (a planifier pour 2027+) :
- Base sur UDP au lieu de TCP — elimine le head-of-line blocking
- Connexion 0-RTT : le handshake est quasi-instantane apres la premiere connexion
- Migration de connexion : pas de deconnexion quand l'utilisateur change de reseau (WiFi → 4G)
- **Impact Meeshy** : Critique pour mobile. Le switch WiFi→cellular ne coupera plus les connexions.
- **Prerequis** : Traefik support experimental HTTP/3 (activer via `--experimental.http3`). Node.js supporte HTTP/3 via le module `http3` (experimental). Pour production : utiliser un reverse proxy (Caddy, nginx) devant Fastify.

**Server-Sent Events (SSE) pour les traductions progressives :**

Actuellement les traductions arrivent via Socket.IO (`message:translated`). Pour les clients qui ne maintiennent pas de connexion WebSocket (CLI, integrations tierces, webhooks), SSE est une alternative legere :

```
GET /api/v1/conversations/:id/translations/stream
Accept: text/event-stream

data: {"messageId":"abc","targetLang":"fr","translatedContent":"Bonjour","status":"complete"}
data: {"messageId":"def","targetLang":"fr","translatedContent":"Comment...","status":"streaming"}
```

A implementer en Phase 3+ quand des clients non-WebSocket sont supportes.

### 6.2 Authentification Applicative (App-Level Auth)

Actuellement, seul l'utilisateur est authentifie (JWT). L'application elle-meme n'est pas identifiee — n'importe quel client HTTP peut envoyer des requetes si il a un JWT valide.

#### 6.2.1 App Signature (HMAC)

Chaque client officiel (iOS, Android, Web) signe ses requetes avec un secret embarque :

```
Headers envoyes par le client :
  X-App-ID: meeshy-ios | meeshy-android | meeshy-web
  X-App-Version: 2.1.0
  X-App-Timestamp: 1742000000 (unix seconds)
  X-App-Signature: HMAC-SHA256(secret, method + path + timestamp + body_hash)
```

**Gateway verification :**
```typescript
function verifyAppSignature(request: FastifyRequest): boolean {
  const appId = request.headers['x-app-id']
  const timestamp = parseInt(request.headers['x-app-timestamp'])
  const signature = request.headers['x-app-signature']

  // Rejeter si timestamp > 5 minutes
  if (Math.abs(Date.now() / 1000 - timestamp) > 300) return false

  const secret = APP_SECRETS[appId]
  if (!secret) return false

  const bodyHash = createHash('sha256').update(request.rawBody ?? '').digest('hex')
  const payload = `${request.method}${request.url}${timestamp}${bodyHash}`
  const expected = createHmac('sha256', secret).update(payload).digest('hex')

  return timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
}
```

**Rotation des secrets** : Chaque app supporte 2 secrets simultanement (current + previous) pour permettre une rotation sans downtime.

**Protection** : Empeche les bots/scrapers d'utiliser l'API meme avec un JWT vole. Ralentit le reverse engineering.

**Limitation** : Le secret est embarque dans l'app — un attaquant motive peut l'extraire. C'est une couche de defense en profondeur, pas une garantie absolue.

#### 6.2.2 Device Attestation (iOS App Attest / Android Play Integrity)

Pour une authentification applicative plus forte :

- **iOS** : `DCAppAttestService` (disponible iOS 14+) — Apple atteste que la requete vient bien de l'app Meeshy non modifiee
- **Android** : Play Integrity API — Google atteste que l'app est l'originale depuis un device non-root

```
Flow :
  1. Client obtient un attestation token de Apple/Google
  2. Client envoie le token dans X-Device-Attestation header
  3. Gateway verifie aupres d'Apple/Google
  4. Cache le resultat pour le device (24h)
```

**Quand l'activer** : Quand la plateforme a suffisamment d'utilisateurs pour justifier la protection contre les bots et les clients non officiels. Phase 2+.

#### 6.2.3 Streaming Headers pour WebSocket

Pour l'authentification des connexions Socket.IO, ajouter :

```
Socket.IO handshake auth:
  auth: {
    token: JWT,
    appId: 'meeshy-ios',
    appVersion: '2.1.0',
    appSignature: HMAC(secret, 'CONNECT' + timestamp),
    deviceId: UUID persistant par device (pour multi-device tracking)
  }
```

Le `deviceId` permet de :
- Limiter le nombre de devices simultanes par compte
- Identifier quel device a envoye quel message
- Revoquer l'acces d'un device specifique

### 6.3 Architecture VoIP — Evolution P2P → SFU → E2EE Group

#### 6.3.1 Etat actuel (Phase 1A — P2P)

```
[Client A] ←WebRTC P2P→ [Client B]
     |                        |
     +--Socket.IO signaling---+
              |
        [Gateway]
     (STUN/TURN credentials)
```

- Backend complet : CallService, TURNCredentialService, CallEventsHandler, CallCleanupService
- iOS : CallManager + CallKit integre, WebRTCService **stubbe** (framework WebRTC liste en SPM mais non implemente)
- Web : Aucune implementation
- Securite : Rate limiting, validation SDP/ICE, TURN time-limited credentials
- Limitation : Max 2 participants (P2P)

#### 6.3.2 Phase 1B — SFU pour Group Calls (3-50 participants)

```
[Client A]        [Client B]        [Client C]
     \                |                /
      \               |               /
       +--- SFU (mediasoup) ----------+
              |
        [Gateway]
```

**SFU (Selective Forwarding Unit)** : Chaque participant envoie UN flux media au serveur. Le serveur redistribue les flux aux autres participants sans les transcoder. Avantages :
- Scalable jusqu'a ~50 participants
- Latence faible (pas de transcodage)
- Le client controle sa bande passante (simulcast : envoie 3 qualites, le serveur choisit)

**Stack recommande** : **mediasoup** (Node.js natif, meme stack que le gateway)
- Worker C++ pour le traitement media, API Node.js
- Supporte simulcast, SVC, DataChannel
- Communaute active, utilise par des apps a grande echelle

**Architecture :**
```
services/
  media/                    → Nouveau service mediasoup
    src/
      workers/              → mediasoup Workers (1 par CPU core)
      rooms/                → Room management (call → mediasoup Room)
      transports/           → WebRTC transports (send/receive)
      producers-consumers/  → Media streams management
```

**Integration avec le gateway :**
- Le gateway reste le signaling server (Socket.IO)
- Le media server est un service separe communiquant via ZMQ ou gRPC avec le gateway
- Le client negociate les transports WebRTC directement avec le media server
- Le gateway orchestre la session (create room, join, leave, end)

#### 6.3.3 Phase 2 — E2EE Group Calls (MLS Protocol)

Le **Signal Protocol** est concu pour le messaging 1:1. Pour les appels de groupe chiffres, le standard moderne est **MLS (Messaging Layer Security)** — RFC 9420 (2023).

**Pourquoi MLS et pas Signal pour les groupes :**

| Aspect | Signal Protocol (groups) | MLS |
|--------|------------------------|-----|
| Complexite par ajout de membre | O(N) — un ratchet par membre | O(log N) — arbre binaire |
| Taille des commits | Lineaire | Logarithmique |
| Forward secrecy | Par paire | Par groupe entier |
| Post-compromise security | Complexe | Native (tree update) |
| Standard | Pas d'RFC formel | RFC 9420 (IETF) |
| Utilise par | Signal, WhatsApp (avec adaptations) | Apple iMessage, Cisco Webex, Wire |

**Architecture MLS pour Meeshy :**
```
Delivery Service (Gateway)
  - Stocke les KeyPackages des membres
  - Distribue les Welcome/Commit messages
  - NE VOIT PAS le contenu chiffre

Tree KEM (Key Encapsulation Mechanism)
  - Chaque membre a une feuille dans un arbre binaire
  - L'application key est derivee de la racine
  - Ajouter/retirer un membre = update d'une branche (log N operations)

Media Encryption
  - SFrame (RFC 9605) pour chiffrer les frames media individuellement
  - Chaque frame audio/video est chiffree avec la cle de groupe MLS
  - Le SFU voit les paquets SRTP mais NE PEUT PAS les dechiffrer
  - Le SFU peut toujours router les paquets (header non chiffre)
```

**Etapes d'implementation :**
1. Implementer MLS key management dans le gateway (KeyPackage storage, Welcome/Commit distribution)
2. Implementer MLS state machine dans les SDKs (iOS, Android, Web) — via `openmls` (Rust, WASM-compilable)
3. Integrer SFrame dans le pipeline WebRTC (encryptor/decryptor sur les media tracks)
4. Le SFU continue de fonctionner normalement — il route des paquets opaques

#### 6.3.4 Phase 3 — MCU pour Broadcast (50+ participants)

Pour les tres grands groupes (town halls, webinaires) :

```
[Speaker A] → SFU → MCU → [Viewers x1000]
```

**MCU (Multipoint Control Unit)** : Transcoding server qui compose les flux en un seul flux composite. Utile quand le nombre de viewers depasse la capacite du SFU.

### 6.4 Scalabilite 10-30 ans

#### 6.4.1 Event Sourcing + CQRS (Horizon 3-5 ans)

La base de donnees actuelle (MongoDB avec Prisma) utilise un modele CRUD classique. Pour une scalabilite a 100M+ utilisateurs, migrer vers Event Sourcing :

```
Au lieu de :
  UPDATE message SET content = 'edited' WHERE id = 'abc'

Event Sourcing :
  Event: { type: 'MessageEdited', messageId: 'abc', newContent: 'edited', editedAt: Date, editedBy: userId }

L'etat actuel d'un message = replay de tous ses events.
```

**Avantages :**
- Audit trail complet (qui a fait quoi, quand)
- Time-travel debugging
- Projections multiples (la meme donnee vue differemment par le feed, la recherche, l'analytics)
- Scalabilite horizontale native (append-only log)

**CQRS (Command Query Responsibility Segregation) :**
- **Write path** : Commands → Event Store (append-only)
- **Read path** : Materialized views optimisees par use case
- Le gateway actuel fait deja une version implicite de CQRS : Socket.IO ecrit (commands), REST lit (queries). Formaliser ce pattern.

**Stack recommande :** EventStoreDB ou Apache Kafka comme event store. MongoDB comme read model (projections materialisees).

#### 6.4.2 Federation (Horizon 5-10 ans)

Pour permettre a des instances Meeshy independantes de communiquer entre elles (comme email ou Matrix) :

```
meeshy.me ←Federation Protocol→ company.meeshy.cloud
     |                                    |
   Users A                             Users B
```

**Prerequis :**
- Identite decentralisee (DID - Decentralized Identifiers, W3C standard)
- Protocol de federation (ActivityPub ou Matrix, ou protocol custom)
- Resolution DNS pour la decouverte de serveurs (SRV records)
- E2EE obligatoire entre instances (le serveur relais ne peut pas lire)

**Conformite DMA (Digital Markets Act)** : Le dossier `docs/dma-interoperability/` montre que cette reflexion est deja entamee. Le DMA impose l'interoperabilite pour les "gatekeepers" — meme si Meeshy n'est pas encore concerne, preparer l'architecture est strategique.

#### 6.4.3 Edge Computing (Horizon 5-15 ans)

Deployer des noeud gateway en edge (CDN-like) pour reduire la latence :

```
[User Paris] → [Edge Paris] → [Core EU] → [MongoDB]
[User Tokyo] → [Edge Tokyo] → [Core Asia] → [MongoDB Replica]
```

**Ce qui peut aller en edge :**
- Cache conversation list (read)
- Cache messages (read)
- Optimisation images (resize, webp conversion)
- TURN/STUN relay
- WebSocket termination

**Ce qui reste centralise :**
- Write operations (message send, post create)
- Authentication
- Translation pipeline
- E2EE key management

**Stack** : Cloudflare Workers / Durable Objects, ou Fastly Compute. Le gateway Fastify peut etre deploye en edge avec des adaptations (remplacer les singletons in-memory par du Durable Object state).

#### 6.4.4 AI-Native Architecture (Horizon 10-30 ans)

La plateforme de messaging de 2035-2055 sera fondamentalement differente :

- **Traduction en temps reel des appels vocaux** (deja dans le pipeline Meeshy via Whisper + NLLB + TTS)
- **Avatars IA** qui representent l'utilisateur dans les conversations (participation asynchrone)
- **Agents IA** integres aux conversations (assistant, moderation, traduction, resume)
- **Compute at the edge** : Les modeles IA tourneront localement sur le device (Apple Neural Engine, NPU Android)
- **Memoire persistante** : L'IA se souvient du contexte de chaque conversation

**Impact architectural :**
- Le SDK doit abstraire "humain vs IA" — un participant est un participant, que ce soit un humain ou un agent
- Les modeles de domaine doivent supporter les participants non-humains (deja partiellement fait avec les bots)
- Le pipeline de traduction doit etre generalise en "pipeline de transformation" (traduction, resume, filtrage, enrichissement)
- Le cache doit supporter les contenus generes a la demande (pas seulement stockes)

---

## 7. Plan d'execution phase

### Immediate (Sprint courant)

#### Phase 1 : Correctness P0 — 1-2 jours
Corriger les 8 bugs P0 (resolution langue, dead code, stubs vides, Prisme violations).
Ce sont des bugs actifs qui produisent des resultats incorrects.

#### Phase 2 : Mise a jour CLAUDE.md — 0.5 jour
Integrer les sections 5.1-5.4 dans les fichiers respectifs.
Ajouter les Instant App Principles dans le CLAUDE.md racine.

### Court terme (1-3 sprints)

#### Phase 3 : Performance iOS critical path — 2-3 jours
- Ajouter stores `.feed` et `.stories` dans CacheCoordinator
- Souscrire CacheCoordinator aux events SocialSocket (actuellement non souscrit)
- Adopter pattern I1 dans FeedViewModel, StoryViewModel, BookmarksViewModel
- Migrer isDark:Bool dans ThemedMessageBubble, MeeshyAvatar (pattern I3)
- Stocker colorPalette comme `let` dans init
- Cacher ISO8601DateFormatter en `static let`
- Cabler OfflineQueue a sendMessage (pattern I5)

#### Phase 4 : Performance Gateway — 1-2 jours
- Auth user cache Redis 5min (pattern G1)
- ConversationId mapping cache in-memory (pattern G2)
- HTTP Cache-Control + ETag sur endpoints read-heavy (pattern G3)
- Eliminer read-after-write MESSAGE_SEND (pattern G6)
- Timeout ZMQ 30s + retry
- Request ID / Correlation ID middleware (section 6.1.1)

#### Phase 5 : Performance Web — 1-2 jours
- React Query persistence IndexedDB (pattern W1)
- Activer image optimization Next.js (pattern W3)
- Hover prefetch conversations (pattern W2)
- Translation cache LRU 500 (pattern W7)
- Error boundaries par feature (pattern W5)
- Offline banner + detection (pattern W6)
- Supprimer conversation-store.ts dead code (pattern W4)

### Moyen terme (1-3 mois)

#### Phase 6 : Incoherences P2 — 2-3 jours
Les 15 items P2, sprint par sprint.

#### Phase 7 : Auth Applicative — 1-2 jours
- App Signature HMAC (section 6.2.1)
- Device ID dans Socket.IO handshake (section 6.2.3)
- Response format unifie sendSuccess/sendError (pattern G4)
- RedisWrapper circuit breaker (pattern G5)

#### Phase 8 : HTTP/2 + Caching Avance — 1 jour
- Activer HTTP/2 dans Traefik
- Vary headers sur tous les endpoints
- Static asset caching headers (immutable)

### Long terme (3-12 mois)

#### Phase 9 : WebRTC Full Implementation
- Integrer le framework WebRTC reel dans iOS (remplacer les stubs)
- Implementer le client WebRTC dans le web (React)
- Tests bout-en-bout P2P voice + video

#### Phase 10 : SFU Group Calls (mediasoup)
- Deployer mediasoup comme service separe
- Integrer au gateway via ZMQ/gRPC
- Simulcast pour bandwidth adaptation
- Tests avec 3-10 participants

#### Phase 11 : Device Attestation
- iOS App Attest integration
- Android Play Integrity integration
- Cache attestation 24h cote gateway

#### Phase 12 : Migration Keychain (iOS/SDK)
- Migrer tokens JWT de UserDefaults vers Keychain
- kSecAttrAccessibleWhenUnlockedThisDeviceOnly

### Vision (1-5 ans)

#### Phase 13 : E2EE Group Calls (MLS)
- Implementer MLS key management (KeyPackages, Welcome/Commit)
- Integrer openmls (Rust/WASM) dans les SDKs
- SFrame encryption sur les media tracks WebRTC

#### Phase 14 : Event Sourcing + CQRS
- Migrer le write path vers un event store (Kafka ou EventStoreDB)
- Materialiser les read models dans MongoDB
- Audit trail complet

#### Phase 15 : HTTP/3 (QUIC)
- Deployer QUIC via reverse proxy (Caddy ou nginx)
- 0-RTT connection resumption
- Connection migration (WiFi → cellular)

#### Phase 16 : Edge Computing
- Deployer des noeud gateway en edge pour le cache read
- TURN relay en edge (latence appels)
- Image optimization en edge

#### Phase 17 : Federation
- Protocol de federation inter-instances
- Identite decentralisee (DID)
- Conformite DMA
