# Links Dashboard iOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ajouter une section "Mes Liens" dans le Tableau de bord iOS avec 4 types de liens (Parrainage, Partage, Tracking, Communauté), mettre à jour les Actions rapides, et créer une page de listing + détail riche pour chaque type de lien.

**Architecture:** SDK Swift fournit les modèles et services, l'app iOS fournit les vues MVVM. On suit le pattern existant d'`AffiliateView` + `AffiliateViewModel` pour tous les nouveaux types. Le gateway expose de nouveaux endpoints user-scoped pour lister les liens. Le Tableau de bord (`WidgetPreviewView`) reçoit une nouvelle section `linksOverviewSection` au-dessus des Actions rapides mises à jour.

**Tech Stack:** SwiftUI iOS 17+, MVVM (@MainActor ObservableObject), MeeshySDK (SPM local), Fastify 5 gateway (TypeScript), Prisma MongoDB.

---

## Contexte important

- **Dashboard iOS** : `apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift`
- **AffiliateView existante** : `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift` (modèle de référence)
- **Router** : `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`
- **SDK Models** : `packages/MeeshySDK/Sources/MeeshySDK/Models/`
- **SDK Services** : `packages/MeeshySDK/Sources/MeeshySDK/Services/`
- **Build** : toujours `./apps/ios/meeshy.sh build` depuis la racine du repo
- **Couleurs par type** :
  - Parrainage → `#2ECC71` (vert, existant)
  - Partage → `#08D9D6` (cyan)
  - Tracking → `#A855F7` (violet)
  - Communauté → `#F8B500` (ambre)
- **Pattern HapticFeedback** : `HapticFeedback.success()` après copie, `HapticFeedback.light()` après action légère
- **Pattern toast** : `ToastManager.shared.show(...)` ou bannière inline (voir ConversationView pour exemple)
- **Pattern surfaceGradient** : `ThemeManager.shared.surfaceGradient(tint: "HEXCOLOR")`

---

## Phase 1 — SDK : Nouveaux modèles + services

### Task 1 : SDK — TrackingLinkModels.swift

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/TrackingLinkModels.swift`

**Step 1: Créer le fichier**

```swift
import Foundation

// MARK: - TrackingLink Models

public struct TrackingLink: Decodable, Identifiable {
    public let id: String
    public let token: String
    public let name: String?
    public let campaign: String?
    public let source: String?
    public let medium: String?
    public let originalUrl: String
    public let shortUrl: String
    public let totalClicks: Int
    public let uniqueClicks: Int
    public let isActive: Bool
    public let expiresAt: Date?
    public let createdAt: Date
    public let lastClickedAt: Date?

    public var displayName: String { name ?? token }
}

public struct TrackingLinkClick: Decodable, Identifiable {
    public let id: String
    public let country: String?
    public let city: String?
    public let device: String?
    public let browser: String?
    public let os: String?
    public let referrer: String?
    public let socialSource: String?
    public let redirectStatus: String
    public let clickedAt: Date
}

public struct TrackingLinkDetail: Decodable {
    public let link: TrackingLink
    public let clicks: [TrackingLinkClick]
    public let total: Int
}

public struct TrackingLinkStats: Decodable {
    public let totalLinks: Int
    public let totalClicks: Int
    public let uniqueClicks: Int
    public let activeLinks: Int
}

public struct CreateTrackingLinkRequest: Encodable {
    public let name: String?
    public let originalUrl: String
    public let campaign: String?
    public let source: String?
    public let medium: String?
    public let token: String?
    public let expiresAt: String?

    public init(
        name: String? = nil,
        originalUrl: String,
        campaign: String? = nil,
        source: String? = nil,
        medium: String? = nil,
        token: String? = nil,
        expiresAt: String? = nil
    ) {
        self.name = name
        self.originalUrl = originalUrl
        self.campaign = campaign
        self.source = source
        self.medium = medium
        self.token = token
        self.expiresAt = expiresAt
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded` (aucune erreur de compilation)

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/TrackingLinkModels.swift
git commit -m "feat(sdk): add TrackingLink models"
```

---

### Task 2 : SDK — TrackingLinkService.swift

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift`

**Step 1: Créer le service**

```swift
import Foundation

// MARK: - TrackingLink Service

public final class TrackingLinkService {
    public static let shared = TrackingLinkService()
    private let api = APIClient.shared

    private init() {}

    /// Liste les liens de tracking de l'utilisateur connecté
    public func listLinks(offset: Int = 0, limit: Int = 50) async throws -> [TrackingLink] {
        let response: APIResponse<[TrackingLink]> = try await api.request(
            endpoint: "/tracking-links?offset=\(offset)&limit=\(limit)"
        )
        return response.data
    }

    /// Stats globales des liens de l'utilisateur
    public func fetchStats() async throws -> TrackingLinkStats {
        let response: APIResponse<TrackingLinkStats> = try await api.request(
            endpoint: "/tracking-links/stats"
        )
        return response.data
    }

    /// Crée un nouveau lien de tracking
    public func createLink(_ request: CreateTrackingLinkRequest) async throws -> TrackingLink {
        let response: APIResponse<TrackingLink> = try await api.post(
            endpoint: "/tracking-links",
            body: request
        )
        return response.data
    }

    /// Détails + liste des clics pour un lien
    public func fetchClicks(token: String, offset: Int = 0, limit: Int = 50) async throws -> TrackingLinkDetail {
        let response: APIResponse<TrackingLinkDetail> = try await api.request(
            endpoint: "/tracking-links/\(token)/clicks?offset=\(offset)&limit=\(limit)"
        )
        return response.data
    }

    /// Active/désactive un lien
    public func toggleLink(token: String) async throws {
        let _: APIResponse<TrackingLink> = try await api.patch(
            endpoint: "/tracking-links/\(token)/toggle",
            body: EmptyBody()
        )
    }

    /// Supprime un lien
    public func deleteLink(token: String) async throws {
        let _: APIResponse<EmptyBody> = try await api.delete(
            endpoint: "/tracking-links/\(token)"
        )
    }
}

private struct EmptyBody: Encodable {}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded`

**Step 3: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/TrackingLinkService.swift
git commit -m "feat(sdk): add TrackingLinkService"
```

---

### Task 3 : SDK — CommunityLinkModels.swift + CommunityLinkService.swift

Les "liens communauté" utilisent l'`identifier` existant des communautés comme URL de partage (`{serverOrigin}/join/{identifier}`). Pas de nouveau modèle DB nécessaire (YAGNI).

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityLinkModels.swift`
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift`

**Step 1: Créer les modèles**

```swift
// CommunityLinkModels.swift
import Foundation

// MARK: - CommunityLink Models
// Un CommunityLink est une vue sur les communautés de l'utilisateur
// exposant leur URL de partage. Pas de modèle DB supplémentaire.

public struct CommunityLink: Identifiable {
    public let id: String
    public let name: String
    public let identifier: String
    public let joinUrl: String
    public let memberCount: Int
    public let isActive: Bool
    public let createdAt: Date

    public init(id: String, name: String, identifier: String, baseUrl: String,
                memberCount: Int, isActive: Bool, createdAt: Date) {
        self.id = id
        self.name = name
        self.identifier = identifier
        self.joinUrl = "\(baseUrl)/join/\(identifier)"
        self.memberCount = memberCount
        self.isActive = isActive
        self.createdAt = createdAt
    }
}

public struct CommunityLinkStats {
    public let totalCommunities: Int
    public let totalMembers: Int
    public let activeCommunities: Int
}
```

**Step 2: Créer le service**

```swift
// CommunityLinkService.swift
import Foundation

public final class CommunityLinkService {
    public static let shared = CommunityLinkService()
    private let api = APIClient.shared

    private init() {}

    /// Retourne les communautés créées ou administrées par l'utilisateur,
    /// formatées comme des CommunityLinks (avec leur URL de partage).
    public func listCommunityLinks() async throws -> [CommunityLink] {
        let response: APIResponse<[APICommunityMini]> = try await api.request(
            endpoint: "/communities/mine?role=admin,moderator"
        )
        let baseUrl = MeeshyConfig.shared.serverOrigin
        return response.data.map { community in
            CommunityLink(
                id: community.id,
                name: community.name,
                identifier: community.identifier,
                baseUrl: baseUrl,
                memberCount: community.memberCount ?? 0,
                isActive: community.isActive,
                createdAt: community.createdAt
            )
        }
    }

    public func stats(links: [CommunityLink]) -> CommunityLinkStats {
        CommunityLinkStats(
            totalCommunities: links.count,
            totalMembers: links.reduce(0) { $0 + $1.memberCount },
            activeCommunities: links.filter(\.isActive).count
        )
    }
}

// Minimal Decodable pour la réponse communities/mine
struct APICommunityMini: Decodable {
    let id: String
    let name: String
    let identifier: String
    let isActive: Bool
    let memberCount: Int?
    let createdAt: Date
}
```

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded`

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityLinkModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Services/CommunityLinkService.swift
git commit -m "feat(sdk): add CommunityLink models + service"
```

---

### Task 4 : SDK — ShareLinkService.listMyLinks + AffiliateModels clickCount

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift`
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift`

**Step 1: Ajouter `listMyLinks` à ShareLinkService**

Cherche dans `ShareLinkService.swift` la ligne `public func createShareLink` et ajoute juste avant :

```swift
/// Liste les liens de partage créés par l'utilisateur connecté
public func listMyLinks(offset: Int = 0, limit: Int = 50) async throws -> [MyShareLink] {
    let response: APIResponse<[MyShareLink]> = try await api.request(
        endpoint: "/links?offset=\(offset)&limit=\(limit)"
    )
    return response.data
}

/// Stats globales pour les liens de l'utilisateur
public func fetchMyStats() async throws -> ShareLinkStats {
    let response: APIResponse<ShareLinkStats> = try await api.request(
        endpoint: "/links/stats"
    )
    return response.data
}
```

Ajoute aussi les modèles manquants en bas du fichier `ShareLinkModels.swift` :

```swift
// MARK: - User's own links (authenticated)

public struct MyShareLink: Decodable, Identifiable {
    public let id: String
    public let linkId: String
    public let identifier: String?
    public let name: String?
    public let isActive: Bool
    public let currentUses: Int
    public let maxUses: Int?
    public let expiresAt: Date?
    public let createdAt: Date
    public let conversationTitle: String?

    public var displayName: String { name ?? identifier ?? linkId }
    public var joinUrl: String { "\(MeeshyConfig.shared.serverOrigin)/join/\(identifier ?? linkId)" }
}

public struct ShareLinkStats: Decodable {
    public let totalLinks: Int
    public let activeLinks: Int
    public let totalUses: Int
}
```

**Step 2: Ajouter `clickCount` à AffiliateModels**

Dans `AffiliateModels.swift`, trouve `public struct AffiliateToken` et ajoute le champ :

```swift
public let clickCount: Int     // Visites du lien (avant inscription)
```

> Note : Le gateway doit aussi retourner ce champ (voir Task 5). Pour l'instant, `clickCount` aura une valeur par défaut de 0 si absent du JSON.

Ajoute `public let clickCount: Int` avec une valeur par défaut via un `init` custom ou via `@defaultValue`. La façon la plus simple en Swift est d'utiliser un custom `init` dans l'extension :

```swift
// Dans AffiliateModels.swift, après la struct AffiliateToken
extension AffiliateToken {
    // Rétrocompatibilité : clickCount absent de l'API = 0
    enum CodingKeys: String, CodingKey {
        case id, token, name, affiliateLink, maxUses, currentUses
        case isActive, expiresAt, createdAt
        case _count
        case clickCount
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        token = try c.decode(String.self, forKey: .token)
        name = try c.decode(String.self, forKey: .name)
        affiliateLink = try c.decodeIfPresent(String.self, forKey: .affiliateLink)
        maxUses = try c.decodeIfPresent(Int.self, forKey: .maxUses)
        currentUses = try c.decode(Int.self, forKey: .currentUses)
        isActive = try c.decode(Bool.self, forKey: .isActive)
        expiresAt = try c.decodeIfPresent(String.self, forKey: .expiresAt)
        createdAt = try c.decode(String.self, forKey: .createdAt)
        _count = try c.decodeIfPresent(AffiliateCount.self, forKey: ._count)
        clickCount = (try? c.decodeIfPresent(Int.self, forKey: .clickCount)) ?? 0
    }
}
```

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded`

**Step 4: Commit**

```bash
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/ShareLinkModels.swift \
        packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift
git commit -m "feat(sdk): listMyLinks for ShareLink, clickCount for AffiliateToken"
```

---

## Phase 2 — Gateway : Nouveaux endpoints

### Task 5 : Gateway — GET /tracking-links (user-scoped) + GET /links (user's share links)

**Files:**
- Modify: `services/gateway/src/routes/tracking-links/creation.ts`
- Modify: `services/gateway/src/routes/links.ts` (ou le fichier routes des share links — chercher avec `grep -r "POST /links" services/gateway/src/routes/`)

**Step 1: Chercher le fichier des routes share links**

```bash
grep -r "router.post.*\"/links\"" services/gateway/src/routes/ --include="*.ts" -l
```

Note le chemin exact du fichier retourné.

**Step 2: Ajouter GET /links (user's share links)**

Dans le fichier des routes de share links, ajoute avant la route POST :

```typescript
// GET /links — liste les liens de partage de l'utilisateur connecté
router.get("/", {
  preHandler: [fastify.authenticate],
  schema: {
    querystring: z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    tags: ["links"],
    summary: "List authenticated user's share links",
  },
  handler: async (request, reply) => {
    const user = request.user;
    const { offset, limit } = request.query;

    const [links, total] = await Promise.all([
      fastify.prisma.conversationShareLink.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
        include: { conversation: { select: { id: true, title: true, type: true } } },
      }),
      fastify.prisma.conversationShareLink.count({
        where: { createdById: user.id },
      }),
    ]);

    const mapped = links.map((l) => ({
      id: l.id,
      linkId: l.linkId,
      identifier: l.identifier,
      name: l.name,
      isActive: l.isActive,
      currentUses: l.currentUses,
      maxUses: l.maxUses,
      expiresAt: l.expiresAt,
      createdAt: l.createdAt,
      conversationTitle: l.conversation?.title ?? null,
    }));

    return reply.send({ success: true, data: mapped, pagination: { total, offset, limit } });
  },
});

// GET /links/stats
router.get("/stats", {
  preHandler: [fastify.authenticate],
  schema: { tags: ["links"], summary: "User's share link stats" },
  handler: async (request, reply) => {
    const user = request.user;
    const [totalLinks, activeLinks, totalUses] = await Promise.all([
      fastify.prisma.conversationShareLink.count({ where: { createdById: user.id } }),
      fastify.prisma.conversationShareLink.count({ where: { createdById: user.id, isActive: true } }),
      fastify.prisma.conversationShareLink.aggregate({
        where: { createdById: user.id },
        _sum: { currentUses: true },
      }),
    ]);
    return reply.send({
      success: true,
      data: {
        totalLinks,
        activeLinks,
        totalUses: totalUses._sum.currentUses ?? 0,
      },
    });
  },
});
```

**Step 3: Ajouter GET /tracking-links (user-scoped) dans creation.ts**

Dans `services/gateway/src/routes/tracking-links/creation.ts`, ajoute une route user-scoped :

```typescript
// GET /tracking-links — liste les liens de tracking de l'utilisateur connecté
router.get("/", {
  preHandler: [fastify.authenticate],
  schema: {
    querystring: z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    tags: ["tracking-links"],
    summary: "List user's tracking links",
  },
  handler: async (request, reply) => {
    const { offset, limit } = request.query;
    const user = request.user;

    const [links, total] = await Promise.all([
      fastify.prisma.trackingLink.findMany({
        where: { createdById: user.id },
        orderBy: { createdAt: "desc" },
        skip: offset,
        take: limit,
      }),
      fastify.prisma.trackingLink.count({ where: { createdById: user.id } }),
    ]);

    return reply.send({ success: true, data: links, pagination: { total, offset, limit } });
  },
});

// GET /tracking-links/stats
router.get("/stats", {
  preHandler: [fastify.authenticate],
  schema: { tags: ["tracking-links"], summary: "User's tracking link stats" },
  handler: async (request, reply) => {
    const user = request.user;
    const [totalLinks, activeLinks, clickAgg, uniqueAgg] = await Promise.all([
      fastify.prisma.trackingLink.count({ where: { createdById: user.id } }),
      fastify.prisma.trackingLink.count({ where: { createdById: user.id, isActive: true } }),
      fastify.prisma.trackingLink.aggregate({
        where: { createdById: user.id },
        _sum: { totalClicks: true },
      }),
      fastify.prisma.trackingLink.aggregate({
        where: { createdById: user.id },
        _sum: { uniqueClicks: true },
      }),
    ]);
    return reply.send({
      success: true,
      data: {
        totalLinks,
        activeLinks,
        totalClicks: clickAgg._sum.totalClicks ?? 0,
        uniqueClicks: uniqueAgg._sum.uniqueClicks ?? 0,
      },
    });
  },
});

// GET /tracking-links/:token/clicks — détails des clics
router.get("/:token/clicks", {
  preHandler: [fastify.authenticate],
  schema: {
    params: z.object({ token: z.string() }),
    querystring: z.object({
      offset: z.coerce.number().int().min(0).default(0),
      limit: z.coerce.number().int().min(1).max(100).default(50),
    }),
    tags: ["tracking-links"],
    summary: "Get click details for a tracking link",
  },
  handler: async (request, reply) => {
    const { token } = request.params;
    const { offset, limit } = request.query;
    const user = request.user;

    const link = await fastify.prisma.trackingLink.findFirst({
      where: { token, createdById: user.id },
    });
    if (!link) return reply.status(404).send({ success: false, error: { code: "NOT_FOUND" } });

    const [clicks, total] = await Promise.all([
      fastify.prisma.trackingLinkClick.findMany({
        where: { trackingLinkId: link.id },
        orderBy: { clickedAt: "desc" },
        skip: offset,
        take: limit,
      }),
      fastify.prisma.trackingLinkClick.count({ where: { trackingLinkId: link.id } }),
    ]);

    return reply.send({ success: true, data: { link, clicks, total }, pagination: { total, offset, limit } });
  },
});
```

**Step 4: Ajouter POST /affiliate/click/:token (click tracking)**

Dans `services/gateway/src/routes/affiliate.ts`, ajoute un endpoint de suivi de clic :

```typescript
// POST /affiliate/click/:token — enregistre un clic sur un lien de parrainage
// Appelé par la page signup/affiliate/[token] au chargement
router.post("/click/:token", {
  schema: {
    params: z.object({ token: z.string() }),
    tags: ["affiliate"],
    summary: "Track click on affiliate link",
  },
  handler: async (request, reply) => {
    const { token } = request.params;

    // Vérifie que le token existe et est actif
    const affiliateToken = await fastify.prisma.affiliateToken.findFirst({
      where: { token, isActive: true },
    });
    if (!affiliateToken) {
      return reply.status(404).send({ success: false, error: { code: "NOT_FOUND" } });
    }

    // Incrémente clickCount via update atomique
    await fastify.prisma.affiliateToken.update({
      where: { id: affiliateToken.id },
      data: { clickCount: { increment: 1 } },
    });

    return reply.send({ success: true, data: { tracked: true } });
  },
});
```

**Note** : `clickCount` n'existe peut-être pas encore dans le schéma Prisma. Si Prisma retourne une erreur de compilation, ajouter le champ dans `packages/shared/prisma/schema.prisma` :

```prisma
// Dans le modèle AffiliateToken, ajouter :
clickCount  Int      @default(0)
```

Puis lancer `cd packages/shared && npx prisma generate`.

**Step 5: Vérifier que les tests gateway passent**

```bash
cd services/gateway && npm test -- --testPathPattern="affiliate|tracking-links|links" 2>&1 | tail -20
```
Attendu : les suites concernées passent ou n'ont que des échecs pré-existants.

**Step 6: Commit**

```bash
git add services/gateway/src/routes/ packages/shared/prisma/schema.prisma
git commit -m "feat(gateway): user-scoped GET /tracking-links, GET /links, POST /affiliate/click"
```

---

## Phase 3 — iOS : Router + Dashboard

### Task 6 : Router — 4 nouvelles routes

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Navigation/Router.swift`

**Step 1: Ajouter les cases dans l'enum Route**

Trouve `case affiliate` dans `Router.swift` et ajoute juste après :

```swift
case trackingLinks
case shareLinks
case communityLinks
```

**Step 2: Ajouter les navigationDestination dans RootView.swift**

Trouve dans `RootView.swift` (ou le fichier qui déclare `.navigationDestination`) la ligne `case .affiliate: AffiliateView()` et ajoute juste après :

```swift
case .trackingLinks: TrackingLinksView()
case .shareLinks: ShareLinksView()
case .communityLinks: CommunityLinksView()
```

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : erreurs attendues sur `TrackingLinksView`, `ShareLinksView`, `CommunityLinksView` (pas encore créées) — c'est normal, on les ajoutera dans les prochaines tâches. Si tu veux que le build passe dès maintenant, crée 3 stubs :

```swift
// TrackingLinksView.swift (stub temporaire)
import SwiftUI
struct TrackingLinksView: View {
    var body: some View { Text("TrackingLinks") }
}
```

Idem pour `ShareLinksView` et `CommunityLinksView`. Le build doit alors passer.

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Navigation/Router.swift \
        apps/ios/Meeshy/Features/Main/Views/RootView.swift \
        apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift \
        apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift \
        apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift
git commit -m "feat(ios): add router routes for trackingLinks, shareLinks, communityLinks"
```

---

### Task 7 : Dashboard — linksOverviewSection + Actions rapides

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift`

**Context:**
`WidgetPreviewView` a 3 cards dans son VStack : `unreadCountCard` (index 0), `recentConversationsCard` (index 1), `quickActionsCard` (index 2). On insère `linksOverviewSection` entre (index 1) et (index 2), puis on met à jour `quickActionsCard`.

**Step 1: Ajouter les @StateObject ViewModels en haut de WidgetPreviewView**

Cherche les `@State` existants et ajoute :

```swift
@StateObject private var affiliateVM = AffiliateViewModel()
@State private var trackingStats: TrackingLinkStats? = nil
@State private var shareStats: ShareLinkStats? = nil
@State private var communityLinks: [CommunityLink] = []
```

**Step 2: Ajouter linksOverviewSection dans le VStack**

Après `recentConversationsCard` et avant `quickActionsCard`, insère :

```swift
linksOverviewSection
    .staggeredAppear(index: 2, baseDelay: 0.08)
```

(et met à jour l'index de `quickActionsCard` de 2 à 3)

**Step 3: Implémenter linksOverviewSection**

```swift
private var linksOverviewSection: some View {
    let theme = ThemeManager.shared
    return VStack(alignment: .leading, spacing: 12) {
        // Header
        HStack {
            Image(systemName: "link")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textSecondary)
            Text("MES LIENS")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary)
                .kerning(0.8)
            Spacer()
        }

        // 4 cartes scrollables horizontalement
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                linkTypeCard(
                    title: "Parrainage",
                    icon: "person.badge.plus",
                    color: "2ECC71",
                    stat1: "\(affiliateVM.tokens.count) liens",
                    stat2: "\(affiliateVM.tokens.reduce(0) { $0 + $1.referralCount }) inscrits"
                ) {
                    dismiss()
                    router.push(.affiliate)
                }

                linkTypeCard(
                    title: "Partage",
                    icon: "link.badge.plus",
                    color: "08D9D6",
                    stat1: "\(shareStats?.totalLinks ?? 0) liens",
                    stat2: "\(shareStats?.totalUses ?? 0) rejoints"
                ) {
                    dismiss()
                    router.push(.shareLinks)
                }

                linkTypeCard(
                    title: "Tracking",
                    icon: "chart.bar.fill",
                    color: "A855F7",
                    stat1: "\(trackingStats?.totalLinks ?? 0) liens",
                    stat2: "\(trackingStats?.totalClicks ?? 0) clics"
                ) {
                    dismiss()
                    router.push(.trackingLinks)
                }

                linkTypeCard(
                    title: "Communauté",
                    icon: "person.3.fill",
                    color: "F8B500",
                    stat1: "\(communityLinks.count) groupes",
                    stat2: "\(communityLinks.reduce(0) { $0 + $1.memberCount }) membres"
                ) {
                    dismiss()
                    router.push(.communityLinks)
                }
            }
            .padding(.horizontal, 1) // évite le clipping des ombres
        }
    }
    .padding(16)
    .background(
        RoundedRectangle(cornerRadius: 20)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    )
}

@ViewBuilder
private func linkTypeCard(
    title: String, icon: String, color: String,
    stat1: String, stat2: String,
    onTap: @escaping () -> Void
) -> some View {
    let theme = ThemeManager.shared
    Button(action: onTap) {
        VStack(alignment: .leading, spacing: 8) {
            // Icône
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(Color(hex: color).opacity(0.15))
                    .frame(width: 36, height: 36)
                Image(systemName: icon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Color(hex: color))
            }

            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textPrimary)

            VStack(alignment: .leading, spacing: 2) {
                Text(stat1)
                    .font(.system(size: 11))
                    .foregroundColor(theme.textMuted)
                Text(stat2)
                    .font(.system(size: 11))
                    .foregroundColor(Color(hex: color))
            }
        }
        .padding(12)
        .frame(width: 110)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: color))
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color(hex: color).opacity(0.2), lineWidth: 1)
                )
        )
    }
    .buttonStyle(.plain)
}
```

**Step 4: Mettre à jour quickActionsCard (4 boutons en grille 2×2)**

Remplace le `LazyVGrid` existant (3 colonnes) par :

```swift
private var quickActionsCard: some View {
    let theme = ThemeManager.shared
    return VStack(alignment: .leading, spacing: 12) {
        HStack {
            Image(systemName: "bolt.fill")
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(theme.textSecondary)
            Text("ACTIONS RAPIDES")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary)
                .kerning(0.8)
            Spacer()
        }

        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            spacing: 12
        ) {
            // (a) Nouveau — nouvelle conversation
            quickActionButton("Nouveau", icon: "square.and.pencil",
                              gradient: [Color(hex: "08D9D6"), Color(hex: "4ECDC4")]) {
                dismiss()
                router.push(.newConversation)
            }

            // (b) Partager — nouveau lien de partage de conversation
            quickActionButton("Partager", icon: "link.badge.plus",
                              gradient: [Color(hex: "08D9D6"), Color(hex: "2ECC71")]) {
                showCreateShareLink = true
            }

            // (c) Post — nouveau post dans le feed
            quickActionButton("Post", icon: "megaphone.fill",
                              gradient: [Color(hex: "A855F7"), Color(hex: "6366F1")]) {
                dismiss()
                NotificationCenter.default.post(name: .openFeedComposer, object: nil)
            }

            // (d) Réglages
            quickActionButton("Réglages", icon: "gearshape.fill",
                              gradient: [Color(hex: "FF6B6B"), Color(hex: "FF2E63")]) {
                dismiss()
                router.push(.settings)
            }
        }
    }
    .padding(16)
    .background(
        RoundedRectangle(cornerRadius: 20)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(
                RoundedRectangle(cornerRadius: 20)
                    .stroke(Color.white.opacity(0.1), lineWidth: 1)
            )
    )
}
```

Ajoute `@State private var showCreateShareLink = false` avec les autres `@State`.

Ajoute en bas du body :
```swift
.sheet(isPresented: $showCreateShareLink) {
    CreateShareLinkView { link in
        // refresh shareStats
    }
}
```

Définis la notification dans le fichier ou dans un fichier de constantes existant :
```swift
extension Notification.Name {
    static let openFeedComposer = Notification.Name("openFeedComposer")
}
```

**Step 5: Charger les stats dans .task / .onAppear**

Dans la vue, ajoute `.task` pour charger les stats :

```swift
.task {
    await affiliateVM.load()
    async let t = TrackingLinkService.shared.fetchStats()
    async let s = ShareLinkService.shared.fetchMyStats()
    async let c = CommunityLinkService.shared.listCommunityLinks()
    trackingStats = try? await t
    shareStats = try? await s
    communityLinks = (try? await c) ?? []
}
```

**Step 6: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded`

**Step 7: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/WidgetPreviewView.swift
git commit -m "feat(ios): links overview section + updated quick actions in dashboard"
```

---

## Phase 4 — iOS : Pages de listing

### Task 8 : AffiliateView — distinction clics vs inscrits

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift`

**Step 1: Mettre à jour statsOverview**

Trouve `statsOverview` dans `AffiliateView.swift`. Remplace la card "Utilisations" par "Clics" :

```swift
private var statsOverview: some View {
    HStack(spacing: 12) {
        statCard(
            value: "\(viewModel.tokens.count)",
            label: "Liens",
            icon: "link",
            color: "2ECC71"
        )
        statCard(
            value: "\(viewModel.tokens.reduce(0) { $0 + $1.referralCount })",
            label: "Inscrits",
            icon: "person.fill.checkmark",
            color: "2ECC71"
        )
        statCard(
            value: "\(viewModel.tokens.reduce(0) { $0 + $1.clickCount })",
            label: "Clics",
            icon: "cursorarrow.click",
            color: "2ECC71"
        )
    }
}
```

**Step 2: Mettre à jour tokenRow**

Trouve la ligne affichant `"{referralCount} parrainages - {currentUses} clics"` et remplace par :

```swift
HStack(spacing: 8) {
    Label("\(token.clickCount) clics", systemImage: "cursorarrow.click")
        .font(.system(size: 12))
        .foregroundColor(theme.textMuted)
    Text("·")
        .foregroundColor(theme.textMuted)
    Label("\(token.referralCount) inscrit(s)", systemImage: "person.fill.checkmark")
        .font(.system(size: 12))
        .foregroundColor(Color(hex: "2ECC71"))
}
```

**Step 3: Ajouter bouton Partager à côté de Copier**

Dans `tokenRow`, après le bouton Copier, ajoute :

```swift
// Partager
Button {
    guard let link = token.affiliateLink, let url = URL(string: link) else { return }
    let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
    if let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
       let window = scene.windows.first,
       let root = window.rootViewController {
        root.present(av, animated: true)
    }
} label: {
    Image(systemName: "square.and.arrow.up")
        .font(.system(size: 16))
        .foregroundColor(Color(hex: "2ECC71"))
}
```

**Step 4: Build**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded`

**Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/AffiliateView.swift
git commit -m "feat(ios): distinguish clicks vs registrations in AffiliateView, add share button"
```

---

### Task 9 : ShareLinksView.swift — listing + création

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift` (remplace le stub)

**Step 1: Remplacer le stub par l'implémentation complète**

```swift
import SwiftUI
import MeeshySDK

// MARK: - ShareLinksView

struct ShareLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = ShareLinksViewModel()
    @State private var showCreate = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()

            ScrollView {
                VStack(spacing: 20) {
                    // Stats overview
                    if let stats = viewModel.stats {
                        shareLinkStatsOverview(stats)
                            .padding(.horizontal, 16)
                    }

                    // Liste des liens
                    linksSection
                        .padding(.horizontal, 16)
                }
                .padding(.top, 16)
                .padding(.bottom, 40)
            }
            .refreshable {
                await viewModel.load()
            }
        }
        .navigationTitle("Liens de partage")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button {
                    showCreate = true
                } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "08D9D6"))
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateShareLinkView { link in
                viewModel.links.insert(link, at: 0)
                Task { await viewModel.loadStats() }
            }
        }
    }

    // MARK: - Stats overview

    private func shareLinkStatsOverview(_ stats: ShareLinkStats) -> some View {
        HStack(spacing: 12) {
            shareLinkStatCard("\(stats.totalLinks)", label: "Liens", icon: "link")
            shareLinkStatCard("\(stats.activeLinks)", label: "Actifs", icon: "checkmark.circle.fill")
            shareLinkStatCard("\(stats.totalUses)", label: "Rejoints", icon: "person.fill.badge.plus")
        }
    }

    private func shareLinkStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Color(hex: "08D9D6"))
            Text(value)
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.system(size: 11))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(hex: "08D9D6").opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Links list

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES LIENS")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary)
                .kerning(0.8)

            if viewModel.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(40)
            } else if viewModel.links.isEmpty {
                emptyState
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: ShareLinkDetailView(link: link)) {
                            shareLinkRow(link)
                        }
                        .buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "link.badge.plus")
                .font(.system(size: 40))
                .foregroundColor(Color(hex: "08D9D6").opacity(0.6))
            Text("Aucun lien de partage")
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            Text("Créez un lien pour inviter des personnes dans une conversation")
                .font(.system(size: 13))
                .foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40)
        .frame(maxWidth: .infinity)
    }

    private func shareLinkRow(_ link: MyShareLink) -> some View {
        HStack(spacing: 12) {
            // Icône statut
            ZStack {
                Circle()
                    .fill(Color(hex: link.isActive ? "08D9D6" : "888888").opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: link.isActive ? "link" : "link.badge.minus")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: link.isActive ? "08D9D6" : "888888"))
            }

            // Infos
            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary)
                    .lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(link.currentUses) rejoints")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "08D9D6"))
                    if let conv = link.conversationTitle {
                        Text("· \(conv)")
                            .font(.system(size: 12))
                            .foregroundColor(theme.textMuted)
                            .lineLimit(1)
                    }
                }
            }

            Spacer()

            // Copier
            Button {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: "08D9D6"))
            }
            .padding(.horizontal, 4)

            Image(systemName: "chevron.right")
                .font(.system(size: 12))
                .foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "08D9D6").opacity(0.15), lineWidth: 1))
        )
    }
}

// MARK: - ViewModel

@MainActor
class ShareLinksViewModel: ObservableObject {
    @Published var links: [MyShareLink] = []
    @Published var stats: ShareLinkStats? = nil
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        async let l = ShareLinkService.shared.listMyLinks()
        async let s = ShareLinkService.shared.fetchMyStats()
        links = (try? await l) ?? []
        stats = try? await s
    }

    func loadStats() async {
        stats = try? await ShareLinkService.shared.fetchMyStats()
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/ShareLinksView.swift
git commit -m "feat(ios): ShareLinksView — listing + stats"
```

---

### Task 10 : CreateShareLinkView.swift — sheet avec choix de conversation

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift`

**Step 1: Créer la vue**

```swift
import SwiftUI
import MeeshySDK

// MARK: - CreateShareLinkView

struct CreateShareLinkView: View {
    let onCreate: (MyShareLink) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @EnvironmentObject private var conversationListViewModel: ConversationListViewModel
    @State private var selectedConversation: Conversation? = nil
    @State private var linkName: String = ""
    @State private var showConversationPicker = false
    @State private var isCreating = false
    @State private var errorMessage: String? = nil
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 20) {
                        // Choix ou création de conversation
                        conversationSection

                        // Nom du lien (optionnel)
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Nom du lien (optionnel)")
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(theme.textSecondary)
                            TextField("ex: Partage Twitter", text: $linkName)
                                .padding(12)
                                .background(
                                    RoundedRectangle(cornerRadius: 10)
                                        .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                                )
                                .foregroundColor(theme.textPrimary)
                        }
                        .padding(.horizontal, 20)

                        if let error = errorMessage {
                            Text(error)
                                .font(.system(size: 13))
                                .foregroundColor(.red)
                                .padding(.horizontal, 20)
                        }

                        // Bouton créer
                        Button(action: create) {
                            if isCreating {
                                ProgressView().tint(.white)
                            } else {
                                Text("Créer le lien")
                                    .font(.system(size: 16, weight: .bold))
                                    .foregroundColor(.white)
                            }
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(
                            Capsule()
                                .fill(
                                    LinearGradient(
                                        colors: [Color(hex: "08D9D6"), Color(hex: "4ECDC4")],
                                        startPoint: .leading, endPoint: .trailing
                                    )
                                )
                        )
                        .disabled(selectedConversation == nil || isCreating)
                        .opacity((selectedConversation == nil || isCreating) ? 0.5 : 1)
                        .padding(.horizontal, 20)
                    }
                    .padding(.top, 20)
                }
            }
            .navigationTitle("Nouveau lien de partage")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }
                        .foregroundColor(theme.textSecondary)
                }
            }
            .sheet(isPresented: $showConversationPicker) {
                conversationPickerSheet
            }
        }
    }

    // MARK: - Conversation section

    private var conversationSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Conversation")
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(theme.textSecondary)
                .padding(.horizontal, 20)

            Button {
                showConversationPicker = true
            } label: {
                HStack {
                    Image(systemName: "bubble.left.and.bubble.right.fill")
                        .foregroundColor(Color(hex: "08D9D6"))
                    if let conv = selectedConversation {
                        Text(conv.title ?? conv.id)
                            .foregroundColor(theme.textPrimary)
                    } else {
                        Text("Choisir une conversation")
                            .foregroundColor(theme.textMuted)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 12))
                        .foregroundColor(theme.textMuted)
                }
                .padding(14)
                .background(
                    RoundedRectangle(cornerRadius: 12)
                        .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04))
                )
            }
            .buttonStyle(.plain)
            .padding(.horizontal, 20)
        }
    }

    // MARK: - Conversation picker

    private var conversationPickerSheet: some View {
        NavigationStack {
            List(conversationListViewModel.conversations, id: \.id) { conv in
                Button {
                    selectedConversation = conv
                    showConversationPicker = false
                } label: {
                    HStack {
                        Text(conv.title ?? conv.id)
                            .foregroundColor(.primary)
                        Spacer()
                        if selectedConversation?.id == conv.id {
                            Image(systemName: "checkmark")
                                .foregroundColor(Color(hex: "08D9D6"))
                        }
                    }
                }
            }
            .navigationTitle("Choisir une conversation")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Fermer") { showConversationPicker = false }
                }
            }
        }
    }

    // MARK: - Create

    private func create() {
        guard let conv = selectedConversation else { return }
        isCreating = true
        errorMessage = nil
        Task {
            do {
                let req = CreateShareLinkRequest(
                    conversationId: conv.id,
                    name: linkName.isEmpty ? nil : linkName,
                    allowAnonymousMessages: true,
                    allowAnonymousFiles: false,
                    allowAnonymousImages: true,
                    allowViewHistory: true,
                    requireAccount: false,
                    requireNickname: true,
                    requireEmail: false,
                    requireBirthday: false
                )
                let created = try await ShareLinkService.shared.createShareLink(request: req)
                let myLink = MyShareLink(
                    id: created.id,
                    linkId: created.linkId,
                    identifier: created.identifier,
                    name: created.name,
                    isActive: created.isActive,
                    currentUses: 0,
                    maxUses: nil,
                    expiresAt: nil,
                    createdAt: created.createdAt,
                    conversationTitle: conv.title
                )
                await MainActor.run {
                    HapticFeedback.success()
                    onCreate(myLink)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CreateShareLinkView.swift
git commit -m "feat(ios): CreateShareLinkView with conversation picker"
```

---

### Task 11 : TrackingLinksView.swift — listing + création

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift` (remplace le stub)
- Create: `apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift`

**Step 1: TrackingLinksView**

```swift
import SwiftUI
import MeeshySDK

struct TrackingLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = TrackingLinksViewModel()
    @State private var showCreate = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    if let stats = viewModel.stats {
                        trackingStatsOverview(stats).padding(.horizontal, 16)
                    }
                    linksSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 40)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Liens de tracking")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button { showCreate = true } label: {
                    Image(systemName: "plus.circle.fill")
                        .font(.system(size: 20))
                        .foregroundColor(Color(hex: "A855F7"))
                }
            }
        }
        .task { await viewModel.load() }
        .sheet(isPresented: $showCreate) {
            CreateTrackingLinkView { link in
                viewModel.links.insert(link, at: 0)
                Task { await viewModel.loadStats() }
            }
        }
    }

    // Stats overview (4 métriques)
    private func trackingStatsOverview(_ stats: TrackingLinkStats) -> some View {
        HStack(spacing: 10) {
            trackingStatCard("\(stats.totalLinks)", label: "Liens", icon: "link")
            trackingStatCard("\(stats.totalClicks)", label: "Clics", icon: "cursorarrow.click")
            trackingStatCard("\(stats.uniqueClicks)", label: "Uniques", icon: "person.fill")
            trackingStatCard("\(stats.activeLinks)", label: "Actifs", icon: "checkmark.circle")
        }
    }

    private func trackingStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(Color(hex: "A855F7"))
            Text(value)
                .font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)
            Text(label)
                .font(.system(size: 10))
                .foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity)
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "A855F7"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "A855F7").opacity(0.2), lineWidth: 1))
        )
    }

    private var linksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES LIENS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)

            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(40)
            } else if viewModel.links.isEmpty {
                trackingEmptyState
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: TrackingLinkDetailView(link: link)) {
                            trackingLinkRow(link)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private var trackingEmptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "chart.bar.fill")
                .font(.system(size: 40)).foregroundColor(Color(hex: "A855F7").opacity(0.6))
            Text("Aucun lien de tracking").font(.system(size: 15, weight: .semibold))
                .foregroundColor(theme.textPrimary)
            Text("Créez un lien pour suivre vos clics et campagnes")
                .font(.system(size: 13)).foregroundColor(theme.textSecondary)
                .multilineTextAlignment(.center)
        }
        .padding(40).frame(maxWidth: .infinity)
    }

    private func trackingLinkRow(_ link: TrackingLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: link.isActive ? "A855F7" : "888888").opacity(0.15))
                    .frame(width: 40, height: 40)
                Image(systemName: "chart.bar.fill")
                    .font(.system(size: 16))
                    .foregroundColor(Color(hex: link.isActive ? "A855F7" : "888888"))
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(link.displayName).font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                HStack(spacing: 6) {
                    Text("\(link.totalClicks) clics")
                        .font(.system(size: 12)).foregroundColor(Color(hex: "A855F7"))
                    Text("· \(link.uniqueClicks) uniques")
                        .font(.system(size: 12)).foregroundColor(theme.textMuted)
                    if let c = link.campaign {
                        Text("· \(c)").font(.system(size: 12)).foregroundColor(theme.textMuted).lineLimit(1)
                    }
                }
            }

            Spacer()

            Button {
                UIPasteboard.general.string = link.shortUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc").font(.system(size: 16))
                    .foregroundColor(Color(hex: "A855F7"))
            }.padding(.horizontal, 4)

            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "A855F7"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "A855F7").opacity(0.15), lineWidth: 1))
        )
    }
}

@MainActor
class TrackingLinksViewModel: ObservableObject {
    @Published var links: [TrackingLink] = []
    @Published var stats: TrackingLinkStats? = nil
    @Published var isLoading = false

    func load() async {
        isLoading = true
        defer { isLoading = false }
        async let l = TrackingLinkService.shared.listLinks()
        async let s = TrackingLinkService.shared.fetchStats()
        links = (try? await l) ?? []
        stats = try? await s
    }

    func loadStats() async {
        stats = try? await TrackingLinkService.shared.fetchStats()
    }
}
```

**Step 2: CreateTrackingLinkView**

```swift
import SwiftUI
import MeeshySDK

struct CreateTrackingLinkView: View {
    let onCreate: (TrackingLink) -> Void

    @ObservedObject private var theme = ThemeManager.shared
    @State private var name: String = ""
    @State private var destinationUrl: String = ""
    @State private var campaign: String = ""
    @State private var source: String = ""
    @State private var medium: String = ""
    @State private var customToken: String = ""
    @State private var showUtmFields = false
    @State private var isCreating = false
    @State private var errorMessage: String? = nil
    @Environment(\.dismiss) private var dismiss

    private var isValid: Bool { !destinationUrl.isEmpty && URL(string: destinationUrl) != nil }

    var body: some View {
        NavigationStack {
            ZStack {
                theme.backgroundGradient.ignoresSafeArea()
                ScrollView {
                    VStack(spacing: 20) {
                        formSection
                        utmSection
                        tokenSection
                        if let error = errorMessage {
                            Text(error).font(.system(size: 13)).foregroundColor(.red)
                                .padding(.horizontal, 20)
                        }
                        createButton
                    }
                    .padding(.top, 20).padding(.bottom, 40)
                }
            }
            .navigationTitle("Nouveau lien de tracking")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Annuler") { dismiss() }.foregroundColor(theme.textSecondary)
                }
            }
        }
    }

    private var formSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            formField("URL de destination *", placeholder: "https://meeshy.me", text: $destinationUrl)
                .keyboardType(.URL).textInputAutocapitalization(.never)
            formField("Nom interne", placeholder: "ex: Campagne Instagram", text: $name)
        }
        .padding(.horizontal, 20)
    }

    private var utmSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    showUtmFields.toggle()
                }
            } label: {
                HStack {
                    Text("Paramètres UTM").font(.system(size: 14, weight: .medium))
                        .foregroundColor(theme.textPrimary)
                    Spacer()
                    Image(systemName: showUtmFields ? "chevron.up" : "chevron.down")
                        .font(.system(size: 12)).foregroundColor(theme.textMuted)
                }
            }
            .padding(.horizontal, 20)

            if showUtmFields {
                VStack(spacing: 10) {
                    formField("Campaign", placeholder: "ex: summer_sale", text: $campaign)
                    formField("Source", placeholder: "ex: instagram, email", text: $source)
                    formField("Medium", placeholder: "ex: social, cpc, email", text: $medium)
                }
                .padding(.horizontal, 20)
                .transition(.move(edge: .top).combined(with: .opacity))
            }
        }
    }

    private var tokenSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Token personnalisé (optionnel)")
                .font(.system(size: 13, weight: .medium)).foregroundColor(theme.textSecondary)
            TextField("ex: summer24 (6 chars min)", text: $customToken)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
            Text("Laissez vide pour un token aléatoire")
                .font(.system(size: 11)).foregroundColor(theme.textMuted)
        }
        .padding(.horizontal, 20)
    }

    private var createButton: some View {
        Button(action: create) {
            if isCreating {
                ProgressView().tint(.white)
            } else {
                Text("Créer le lien").font(.system(size: 16, weight: .bold)).foregroundColor(.white)
            }
        }
        .frame(maxWidth: .infinity).padding(.vertical, 14)
        .background(
            Capsule().fill(LinearGradient(
                colors: [Color(hex: "A855F7"), Color(hex: "6366F1")],
                startPoint: .leading, endPoint: .trailing
            ))
        )
        .disabled(!isValid || isCreating).opacity(!isValid || isCreating ? 0.5 : 1)
        .padding(.horizontal, 20)
    }

    @ViewBuilder
    private func formField(_ label: String, placeholder: String, text: Binding<String>) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(.system(size: 12, weight: .medium))
                .foregroundColor(theme.textSecondary)
            TextField(placeholder, text: text)
                .padding(12)
                .background(RoundedRectangle(cornerRadius: 10)
                    .fill(theme.mode.isDark ? Color.white.opacity(0.08) : Color.black.opacity(0.04)))
                .foregroundColor(theme.textPrimary)
        }
    }

    private func create() {
        isCreating = true
        errorMessage = nil
        Task {
            do {
                let req = CreateTrackingLinkRequest(
                    name: name.isEmpty ? nil : name,
                    originalUrl: destinationUrl,
                    campaign: campaign.isEmpty ? nil : campaign,
                    source: source.isEmpty ? nil : source,
                    medium: medium.isEmpty ? nil : medium,
                    token: customToken.isEmpty ? nil : customToken
                )
                let link = try await TrackingLinkService.shared.createLink(req)
                await MainActor.run {
                    HapticFeedback.success()
                    onCreate(link)
                    dismiss()
                }
            } catch {
                await MainActor.run {
                    errorMessage = error.localizedDescription
                    isCreating = false
                }
            }
        }
    }
}
```

**Step 3: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 4: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/TrackingLinksView.swift \
        apps/ios/Meeshy/Features/Main/Views/CreateTrackingLinkView.swift
git commit -m "feat(ios): TrackingLinksView + CreateTrackingLinkView"
```

---

### Task 12 : CommunityLinksView.swift

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift` (remplace le stub)

**Step 1: Remplacer le stub**

```swift
import SwiftUI
import MeeshySDK

struct CommunityLinksView: View {
    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel = CommunityLinksViewModel()

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    communityStatsOverview.padding(.horizontal, 16)
                    communityLinksSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 40)
            }
            .refreshable { await viewModel.load() }
        }
        .navigationTitle("Liens communauté")
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
    }

    private var communityStatsOverview: some View {
        HStack(spacing: 12) {
            communityStatCard("\(viewModel.stats.totalCommunities)", label: "Groupes", icon: "person.3.fill")
            communityStatCard("\(viewModel.stats.activeCommunities)", label: "Actifs", icon: "checkmark.circle.fill")
            communityStatCard("\(viewModel.stats.totalMembers)", label: "Membres", icon: "person.fill")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String) -> some View {
        VStack(spacing: 6) {
            Image(systemName: icon).font(.system(size: 20))
                .foregroundColor(Color(hex: "F8B500"))
            Text(value).font(.system(size: 24, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(label).font(.system(size: 11)).foregroundColor(theme.textSecondary)
        }
        .frame(maxWidth: .infinity).padding(14)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(theme.surfaceGradient(tint: "F8B500"))
                .overlay(RoundedRectangle(cornerRadius: 16)
                    .stroke(Color(hex: "F8B500").opacity(0.2), lineWidth: 1))
        )
    }

    private var communityLinksSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("MES COMMUNAUTÉS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)

            if viewModel.isLoading {
                ProgressView().frame(maxWidth: .infinity).padding(40)
            } else if viewModel.links.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "person.3.fill").font(.system(size: 40))
                        .foregroundColor(Color(hex: "F8B500").opacity(0.6))
                    Text("Aucune communauté administrée")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(theme.textPrimary)
                    Text("Les communautés que vous gérez apparaîtront ici avec leur lien de partage")
                        .font(.system(size: 13)).foregroundColor(theme.textSecondary)
                        .multilineTextAlignment(.center)
                }.padding(40).frame(maxWidth: .infinity)
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.links) { link in
                        NavigationLink(destination: CommunityLinkDetailView(link: link)) {
                            communityLinkRow(link)
                        }.buttonStyle(.plain)
                    }
                }
            }
        }
    }

    private func communityLinkRow(_ link: CommunityLink) -> some View {
        HStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: "F8B500").opacity(0.15)).frame(width: 40, height: 40)
                Image(systemName: "person.3.fill").font(.system(size: 14))
                    .foregroundColor(Color(hex: "F8B500"))
            }
            VStack(alignment: .leading, spacing: 3) {
                Text(link.name).font(.system(size: 15, weight: .semibold))
                    .foregroundColor(theme.textPrimary).lineLimit(1)
                Text("\(link.memberCount) membres · \(link.identifier)")
                    .font(.system(size: 12)).foregroundColor(theme.textMuted).lineLimit(1)
            }
            Spacer()
            Button {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
            } label: {
                Image(systemName: "doc.on.doc").font(.system(size: 16))
                    .foregroundColor(Color(hex: "F8B500"))
            }.padding(.horizontal, 4)
            Image(systemName: "chevron.right").font(.system(size: 12)).foregroundColor(theme.textMuted)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(theme.surfaceGradient(tint: "F8B500"))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: "F8B500").opacity(0.15), lineWidth: 1))
        )
    }
}

@MainActor
class CommunityLinksViewModel: ObservableObject {
    @Published var links: [CommunityLink] = []
    @Published var isLoading = false

    var stats: CommunityLinkStats { CommunityLinkService.shared.stats(links: links) }

    func load() async {
        isLoading = true
        defer { isLoading = false }
        links = (try? await CommunityLinkService.shared.listCommunityLinks()) ?? []
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CommunityLinksView.swift
git commit -m "feat(ios): CommunityLinksView — community join links listing"
```

---

## Phase 5 — iOS : Detail pages

### Task 13 : ShareLinkDetailView.swift

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift`

**Step 1: Créer la vue**

```swift
import SwiftUI
import MeeshySDK

struct ShareLinkDetailView: View {
    let link: MyShareLink

    @ObservedObject private var theme = ThemeManager.shared
    @State private var isActive: Bool
    @State private var showDeleteConfirm = false
    @State private var copiedFeedback = false
    @Environment(\.dismiss) private var dismiss

    init(link: MyShareLink) {
        self.link = link
        _isActive = State(initialValue: link.isActive)
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    // Header card
                    headerCard.padding(.horizontal, 16)

                    // Barre d'actions
                    actionsBar.padding(.horizontal, 16)

                    // Stats
                    statsSection.padding(.horizontal, 16)

                    // Infos techniques
                    infoSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .confirmationDialog("Supprimer ce lien ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { deleteLink() }
            Button("Annuler", role: .cancel) {}
        } message: {
            Text("Cette action est irréversible. Le lien ne sera plus accessible.")
        }
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle().fill(Color(hex: isActive ? "08D9D6" : "888888").opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: isActive ? "link" : "link.badge.minus").font(.system(size: 28))
                    .foregroundColor(Color(hex: isActive ? "08D9D6" : "888888"))
            }
            Text(link.displayName).font(.system(size: 20, weight: .bold))
                .foregroundColor(theme.textPrimary)
            HStack(spacing: 8) {
                statusBadge
                if let conv = link.conversationTitle {
                    Text(conv).font(.system(size: 13)).foregroundColor(theme.textMuted).lineLimit(1)
                }
            }
            Text(link.joinUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(theme.surfaceGradient(tint: "08D9D6"))
                .overlay(RoundedRectangle(cornerRadius: 20)
                    .stroke(Color(hex: "08D9D6").opacity(0.2), lineWidth: 1))
        )
    }

    private var statusBadge: some View {
        Text(isActive ? "Actif" : "Inactif")
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(isActive ? Color(hex: "08D9D6") : .secondary)
            .padding(.horizontal, 10).padding(.vertical, 4)
            .background(Capsule().fill(isActive ? Color(hex: "08D9D6").opacity(0.15) : Color.gray.opacity(0.15)))
    }

    // MARK: - Actions bar

    private var actionsBar: some View {
        HStack(spacing: 12) {
            // Copier
            actionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                         color: copiedFeedback ? "2ECC71" : "08D9D6") {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                    withAnimation { copiedFeedback = false }
                }
            }

            // Partager
            actionButton("Partager", icon: "square.and.arrow.up", color: "08D9D6") {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                presentSheet(av)
            }

            // Activer/Désactiver
            actionButton(isActive ? "Désactiver" : "Activer",
                         icon: isActive ? "pause.circle" : "play.circle",
                         color: isActive ? "FF6B6B" : "2ECC71") {
                toggleActive()
            }

            // Supprimer
            actionButton("Supprimer", icon: "trash", color: "FF2E63") {
                showDeleteConfirm = true
            }
        }
    }

    private func actionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 48, height: 48)
                    Image(systemName: icon).font(.system(size: 20))
                        .foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 10, weight: .medium))
                    .foregroundColor(theme.textSecondary)
            }
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Stats

    private var statsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("STATISTIQUES")
            HStack(spacing: 12) {
                statCard("\(link.currentUses)", label: "Utilisations", icon: "person.fill.badge.plus", color: "08D9D6")
                statCard(link.maxUses.map { "\($0)" } ?? "∞", label: "Maximum", icon: "infinity", color: "A855F7")
            }
        }
    }

    private func statCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 22, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14)
        .frame(maxWidth: .infinity)
        .background(
            RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
                .overlay(RoundedRectangle(cornerRadius: 14)
                    .stroke(Color(hex: color).opacity(0.2), lineWidth: 1))
        )
    }

    // MARK: - Info section

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            sectionTitle("INFORMATIONS")
            VStack(spacing: 0) {
                infoRow("Identifiant", value: link.identifier ?? link.linkId)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
                if let expires = link.expiresAt {
                    Divider().padding(.leading, 16)
                    infoRow("Expire le", value: expires.formatted(date: .abbreviated, time: .shortened))
                }
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 14, weight: .medium)).foregroundColor(theme.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold))
            .foregroundColor(theme.textSecondary).kerning(0.8)
    }

    // MARK: - Actions

    private func toggleActive() {
        Task {
            do {
                try await ShareLinkService.shared.toggleLink(linkId: link.linkId)
                await MainActor.run {
                    withAnimation { isActive.toggle() }
                    HapticFeedback.light()
                }
            } catch { /* silently ignore */ }
        }
    }

    private func deleteLink() {
        Task {
            do {
                try await ShareLinkService.shared.deleteLink(linkId: link.linkId)
                await MainActor.run { dismiss() }
            } catch { /* show error if needed */ }
        }
    }

    private func presentSheet(_ vc: UIViewController) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first,
              let root = window.rootViewController else { return }
        root.present(vc, animated: true)
    }
}
```

**Step 2: Build + commit**

```bash
./apps/ios/meeshy.sh build
git add apps/ios/Meeshy/Features/Main/Views/ShareLinkDetailView.swift
git commit -m "feat(ios): ShareLinkDetailView — stats, copy, share, toggle, delete"
```

---

### Task 14 : TrackingLinkDetailView.swift — page riche

C'est la page la plus complète — elle affiche les clics individuels avec géo, device, browser, OS, source sociale, et une barre de répartition.

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift`

**Step 1: Créer la vue**

```swift
import SwiftUI
import MeeshySDK

struct TrackingLinkDetailView: View {
    let link: TrackingLink

    @ObservedObject private var theme = ThemeManager.shared
    @StateObject private var viewModel: TrackingDetailViewModel
    @State private var copiedFeedback = false
    @State private var showDeleteConfirm = false
    @Environment(\.dismiss) private var dismiss

    init(link: TrackingLink) {
        self.link = link
        _viewModel = StateObject(wrappedValue: TrackingDetailViewModel(token: link.token))
    }

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    headerCard.padding(.horizontal, 16)
                    actionsBar.padding(.horizontal, 16)
                    mainStatsSection.padding(.horizontal, 16)
                    if !viewModel.clicks.isEmpty {
                        geoBreakdown.padding(.horizontal, 16)
                        deviceBreakdown.padding(.horizontal, 16)
                        clicksTimeline.padding(.horizontal, 16)
                    }
                    utmInfoSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.displayName)
        .navigationBarTitleDisplayMode(.inline)
        .task { await viewModel.load() }
        .confirmationDialog("Supprimer ce lien ?", isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button("Supprimer", role: .destructive) { deleteLink() }
            Button("Annuler", role: .cancel) {}
        }
    }

    // MARK: - Header card

    private var headerCard: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Color(hex: link.isActive ? "A855F7" : "888888").opacity(0.15))
                    .frame(width: 60, height: 60)
                Image(systemName: "chart.bar.fill").font(.system(size: 26))
                    .foregroundColor(Color(hex: link.isActive ? "A855F7" : "888888"))
            }
            Text(link.displayName).font(.system(size: 18, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.shortUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(1)
            HStack(spacing: 6) {
                if let c = link.campaign { utmTag(c, color: "A855F7") }
                if let s = link.source { utmTag(s, color: "6366F1") }
                if let m = link.medium { utmTag(m, color: "08D9D6") }
            }
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.surfaceGradient(tint: "A855F7"))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(Color(hex: "A855F7").opacity(0.2), lineWidth: 1)))
    }

    private func utmTag(_ value: String, color: String) -> some View {
        Text(value).font(.system(size: 11, weight: .medium))
            .foregroundColor(Color(hex: color))
            .padding(.horizontal, 8).padding(.vertical, 3)
            .background(Capsule().fill(Color(hex: color).opacity(0.12)))
    }

    // MARK: - Actions bar

    private var actionsBar: some View {
        HStack(spacing: 10) {
            detailActionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                               color: copiedFeedback ? "2ECC71" : "A855F7") {
                UIPasteboard.general.string = link.shortUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            detailActionButton("Partager", icon: "square.and.arrow.up", color: "A855F7") {
                guard let url = URL(string: link.shortUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                presentVC(av)
            }
            detailActionButton("QR Code", icon: "qrcode", color: "6366F1") {
                // QR Code generation in next iteration
                generateQRAndShare()
            }
            detailActionButton("Supprimer", icon: "trash", color: "FF2E63") {
                showDeleteConfirm = true
            }
        }
    }

    private func detailActionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 5) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 46, height: 46)
                    Image(systemName: icon).font(.system(size: 18))
                        .foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 9, weight: .medium)).foregroundColor(theme.textSecondary)
            }
        }.frame(maxWidth: .infinity)
    }

    // MARK: - Main stats

    private var mainStatsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("STATISTIQUES")
            HStack(spacing: 12) {
                bigStatCard("\(link.totalClicks)", label: "Total clics", icon: "cursorarrow.click", color: "A855F7")
                bigStatCard("\(link.uniqueClicks)", label: "Clics uniques", icon: "person.fill", color: "6366F1")
            }
            if let last = link.lastClickedAt {
                HStack {
                    Image(systemName: "clock").foregroundColor(theme.textMuted)
                    Text("Dernier clic : \(last.formatted(date: .abbreviated, time: .shortened))")
                        .font(.system(size: 13)).foregroundColor(theme.textMuted)
                }
                .padding(.horizontal, 4)
            }
        }
    }

    private func bigStatCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 24)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 26, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: color).opacity(0.2), lineWidth: 1)))
    }

    // MARK: - Geo breakdown

    private var geoBreakdown: some View {
        breakdownCard(
            title: "PAYS",
            icon: "globe",
            color: "08D9D6",
            items: viewModel.topCountries
        )
    }

    // MARK: - Device breakdown

    private var deviceBreakdown: some View {
        VStack(spacing: 12) {
            breakdownCard(title: "APPAREILS", icon: "iphone", color: "6366F1", items: viewModel.topDevices)
            breakdownCard(title: "NAVIGATEURS", icon: "safari.fill", color: "2ECC71", items: viewModel.topBrowsers)
        }
    }

    private func breakdownCard(title: String, icon: String, color: String, items: [(String, Int)]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: icon).font(.system(size: 13)).foregroundColor(Color(hex: color))
                sectionTitle(title)
            }
            if items.isEmpty {
                Text("Aucune donnée").font(.system(size: 13)).foregroundColor(theme.textMuted)
                    .frame(maxWidth: .infinity, alignment: .center).padding(.vertical, 8)
            } else {
                VStack(spacing: 8) {
                    ForEach(items.prefix(5), id: \.0) { item in
                        breakdownRow(item.0, count: item.1, total: link.totalClicks, color: color)
                    }
                }
            }
        }
        .padding(16)
        .background(RoundedRectangle(cornerRadius: 16)
            .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03))
            .overlay(RoundedRectangle(cornerRadius: 16).stroke(Color.white.opacity(0.08), lineWidth: 1)))
    }

    private func breakdownRow(_ label: String, count: Int, total: Int, color: String) -> some View {
        let pct = total > 0 ? CGFloat(count) / CGFloat(total) : 0
        return HStack(spacing: 8) {
            Text(label).font(.system(size: 13)).foregroundColor(theme.textPrimary).frame(width: 80, alignment: .leading)
            GeometryReader { geo in
                ZStack(alignment: .leading) {
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: color).opacity(0.15))
                        .frame(height: 8)
                    RoundedRectangle(cornerRadius: 4).fill(Color(hex: color).opacity(0.7))
                        .frame(width: geo.size.width * pct, height: 8)
                }
            }
            .frame(height: 8)
            Text("\(count)").font(.system(size: 12, weight: .semibold)).foregroundColor(theme.textSecondary)
                .frame(width: 30, alignment: .trailing)
        }
    }

    // MARK: - Timeline des clics

    private var clicksTimeline: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Image(systemName: "list.bullet.clipboard").font(.system(size: 13))
                    .foregroundColor(Color(hex: "A855F7"))
                sectionTitle("DERNIERS CLICS")
                Spacer()
                if viewModel.isLoadingMore {
                    ProgressView().scaleEffect(0.7)
                }
            }
            VStack(spacing: 0) {
                ForEach(Array(viewModel.clicks.prefix(20).enumerated()), id: \.element.id) { idx, click in
                    clickRow(click)
                    if idx < min(viewModel.clicks.count, 20) - 1 {
                        Divider().padding(.leading, 52)
                    }
                }
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func clickRow(_ click: TrackingLinkClick) -> some View {
        HStack(spacing: 12) {
            // Icône device
            ZStack {
                Circle().fill(deviceColor(click.device).opacity(0.12)).frame(width: 36, height: 36)
                Image(systemName: deviceIcon(click.device)).font(.system(size: 14))
                    .foregroundColor(deviceColor(click.device))
            }

            VStack(alignment: .leading, spacing: 2) {
                HStack(spacing: 6) {
                    if let country = click.country { Text(countryFlag(country)).font(.system(size: 16)) }
                    Text(click.city ?? click.country ?? "Inconnu")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(theme.textPrimary)
                    if let social = click.socialSource {
                        Text("· \(social)").font(.system(size: 12)).foregroundColor(Color(hex: "A855F7"))
                    }
                }
                HStack(spacing: 4) {
                    if let browser = click.browser {
                        Text(browser).font(.system(size: 11)).foregroundColor(theme.textMuted)
                    }
                    if let os = click.os {
                        Text("· \(os)").font(.system(size: 11)).foregroundColor(theme.textMuted)
                    }
                }
            }

            Spacer()

            VStack(alignment: .trailing, spacing: 2) {
                Text(click.clickedAt.formatted(.relative(presentation: .named)))
                    .font(.system(size: 11)).foregroundColor(theme.textMuted)
                Circle().fill(click.redirectStatus == "confirmed" ? Color.green : Color.red)
                    .frame(width: 6, height: 6)
            }
        }
        .padding(.horizontal, 12).padding(.vertical, 10)
    }

    // MARK: - UTM info

    private var utmInfoSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            sectionTitle("CONFIGURATION UTM")
            VStack(spacing: 0) {
                if let c = link.campaign { infoRow("Campaign", value: c) }
                if link.campaign != nil && link.source != nil { Divider().padding(.leading, 16) }
                if let s = link.source { infoRow("Source", value: s) }
                if link.source != nil && link.medium != nil { Divider().padding(.leading, 16) }
                if let m = link.medium { infoRow("Medium", value: m) }
                Divider().padding(.leading, 16)
                infoRow("URL destination", value: link.originalUrl)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    // MARK: - Helpers

    private func sectionTitle(_ text: String) -> some View {
        Text(text).font(.system(size: 12, weight: .semibold)).foregroundColor(theme.textSecondary).kerning(0.8)
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 14, weight: .medium)).foregroundColor(theme.textPrimary)
                .lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }

    private func deviceIcon(_ device: String?) -> String {
        switch device?.lowercased() {
        case "mobile", "phone": return "iphone"
        case "tablet": return "ipad"
        case "desktop": return "desktopcomputer"
        default: return "globe"
        }
    }

    private func deviceColor(_ device: String?) -> Color {
        switch device?.lowercased() {
        case "mobile", "phone": return Color(hex: "A855F7")
        case "tablet": return Color(hex: "6366F1")
        case "desktop": return Color(hex: "08D9D6")
        default: return Color(hex: "888888")
        }
    }

    private func countryFlag(_ countryCode: String) -> String {
        let base: UInt32 = 127397
        return countryCode.uppercased().unicodeScalars
            .compactMap { Unicode.Scalar(base + $0.value) }.map { String($0) }.joined()
    }

    private func generateQRAndShare() {
        guard let url = URL(string: link.shortUrl),
              let filter = CIFilter(name: "CIQRCodeGenerator") else { return }
        filter.setValue(url.absoluteString.data(using: .utf8), forKey: "inputMessage")
        filter.setValue("H", forKey: "inputCorrectionLevel")
        guard let ciImage = filter.outputImage else { return }
        let scaled = ciImage.transformed(by: CGAffineTransform(scaleX: 10, y: 10))
        let context = CIContext()
        guard let cgImage = context.createCGImage(scaled, from: scaled.extent) else { return }
        let uiImage = UIImage(cgImage: cgImage)
        let av = UIActivityViewController(activityItems: [uiImage], applicationActivities: nil)
        presentVC(av)
    }

    private func presentVC(_ vc: UIViewController) {
        guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let window = scene.windows.first,
              let root = window.rootViewController else { return }
        root.present(vc, animated: true)
    }

    private func deleteLink() {
        Task {
            do {
                try await TrackingLinkService.shared.deleteLink(token: link.token)
                await MainActor.run { dismiss() }
            } catch { /* handle if needed */ }
        }
    }
}

// MARK: - ViewModel

@MainActor
class TrackingDetailViewModel: ObservableObject {
    @Published var clicks: [TrackingLinkClick] = []
    @Published var isLoadingMore = false

    let token: String

    init(token: String) { self.token = token }

    func load() async {
        isLoadingMore = true
        defer { isLoadingMore = false }
        if let detail = try? await TrackingLinkService.shared.fetchClicks(token: token) {
            clicks = detail.clicks
        }
    }

    // Répartitions calculées depuis les clics
    var topCountries: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.country), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    var topDevices: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.device), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }

    var topBrowsers: [(String, Int)] {
        Dictionary(grouping: clicks.compactMap(\.browser), by: { $0 })
            .map { ($0.key, $0.value.count) }
            .sorted { $0.1 > $1.1 }
    }
}
```

**Step 2: Build**

```bash
./apps/ios/meeshy.sh build
```

**Step 3: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Views/TrackingLinkDetailView.swift
git commit -m "feat(ios): TrackingLinkDetailView — rich stats, geo, device, QR, clicks timeline"
```

---

### Task 15 : CommunityLinkDetailView.swift

**Files:**
- Create: `apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift`

**Step 1: Créer la vue**

```swift
import SwiftUI
import MeeshySDK

struct CommunityLinkDetailView: View {
    let link: CommunityLink

    @ObservedObject private var theme = ThemeManager.shared
    @State private var copiedFeedback = false

    var body: some View {
        ZStack {
            theme.backgroundGradient.ignoresSafeArea()
            ScrollView {
                VStack(spacing: 20) {
                    headerCard.padding(.horizontal, 16)
                    actionsBar.padding(.horizontal, 16)
                    statsSection.padding(.horizontal, 16)
                    infoSection.padding(.horizontal, 16)
                }
                .padding(.top, 16).padding(.bottom, 60)
            }
        }
        .navigationTitle(link.name)
        .navigationBarTitleDisplayMode(.inline)
    }

    private var headerCard: some View {
        VStack(spacing: 10) {
            ZStack {
                Circle().fill(Color(hex: "F8B500").opacity(0.15)).frame(width: 60, height: 60)
                Image(systemName: "person.3.fill").font(.system(size: 26))
                    .foregroundColor(Color(hex: "F8B500"))
            }
            Text(link.name).font(.system(size: 20, weight: .bold)).foregroundColor(theme.textPrimary)
            Text(link.joinUrl).font(.system(size: 12, design: .monospaced))
                .foregroundColor(theme.textSecondary).lineLimit(2).multilineTextAlignment(.center)
        }
        .padding(20).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 20).fill(theme.surfaceGradient(tint: "F8B500"))
            .overlay(RoundedRectangle(cornerRadius: 20)
                .stroke(Color(hex: "F8B500").opacity(0.2), lineWidth: 1)))
    }

    private var actionsBar: some View {
        HStack(spacing: 12) {
            communityActionButton("Copier", icon: copiedFeedback ? "checkmark" : "doc.on.doc",
                                  color: copiedFeedback ? "2ECC71" : "F8B500") {
                UIPasteboard.general.string = link.joinUrl
                HapticFeedback.success()
                withAnimation { copiedFeedback = true }
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { withAnimation { copiedFeedback = false } }
            }
            communityActionButton("Partager", icon: "square.and.arrow.up", color: "F8B500") {
                guard let url = URL(string: link.joinUrl) else { return }
                let av = UIActivityViewController(activityItems: [url], applicationActivities: nil)
                guard let scene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
                      let window = scene.windows.first,
                      let root = window.rootViewController else { return }
                root.present(av, animated: true)
            }
            communityActionButton("Identifier", icon: "doc.plaintext", color: "6366F1") {
                UIPasteboard.general.string = link.identifier
                HapticFeedback.light()
            }
        }
    }

    private func communityActionButton(_ label: String, icon: String, color: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            VStack(spacing: 6) {
                ZStack {
                    RoundedRectangle(cornerRadius: 12).fill(Color(hex: color).opacity(0.15))
                        .frame(width: 52, height: 52)
                    Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
                }
                Text(label).font(.system(size: 10, weight: .medium)).foregroundColor(theme.textSecondary)
            }
        }.frame(maxWidth: .infinity)
    }

    private var statsSection: some View {
        HStack(spacing: 12) {
            communityStatCard("\(link.memberCount)", label: "Membres", icon: "person.fill", color: "F8B500")
            communityStatCard(link.isActive ? "Actif" : "Inactif",
                              label: "Statut", icon: "checkmark.circle.fill",
                              color: link.isActive ? "2ECC71" : "888888")
        }
    }

    private func communityStatCard(_ value: String, label: String, icon: String, color: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon).font(.system(size: 22)).foregroundColor(Color(hex: color))
            VStack(alignment: .leading, spacing: 2) {
                Text(value).font(.system(size: 22, weight: .bold)).foregroundColor(theme.textPrimary)
                Text(label).font(.system(size: 12)).foregroundColor(theme.textSecondary)
            }
            Spacer()
        }
        .padding(14).frame(maxWidth: .infinity)
        .background(RoundedRectangle(cornerRadius: 14).fill(theme.surfaceGradient(tint: color))
            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Color(hex: color).opacity(0.2), lineWidth: 1)))
    }

    private var infoSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("INFORMATIONS").font(.system(size: 12, weight: .semibold))
                .foregroundColor(theme.textSecondary).kerning(0.8)
            VStack(spacing: 0) {
                infoRow("Identifiant", value: link.identifier)
                Divider().padding(.leading, 16)
                infoRow("Lien complet", value: link.joinUrl)
                Divider().padding(.leading, 16)
                infoRow("Créé le", value: link.createdAt.formatted(date: .abbreviated, time: .shortened))
            }
            .background(RoundedRectangle(cornerRadius: 14)
                .fill(theme.mode.isDark ? Color.white.opacity(0.05) : Color.black.opacity(0.03)))
        }
    }

    private func infoRow(_ label: String, value: String) -> some View {
        HStack {
            Text(label).font(.system(size: 14)).foregroundColor(theme.textSecondary)
            Spacer()
            Text(value).font(.system(size: 13, weight: .medium)).foregroundColor(theme.textPrimary).lineLimit(1)
        }
        .padding(.horizontal, 16).padding(.vertical, 12)
    }
}
```

**Step 2: Build final**

```bash
./apps/ios/meeshy.sh build
```
Attendu : `Build succeeded` sans erreurs.

**Step 3: Commit final**

```bash
git add apps/ios/Meeshy/Features/Main/Views/CommunityLinkDetailView.swift
git commit -m "feat(ios): CommunityLinkDetailView — copy, share, info"
```

---

## Récapitulatif des fichiers touchés

| Fichier | Action | Phase |
|---------|--------|-------|
| `MeeshySDK/Models/TrackingLinkModels.swift` | Créer | 1 |
| `MeeshySDK/Services/TrackingLinkService.swift` | Créer | 1 |
| `MeeshySDK/Models/CommunityLinkModels.swift` | Créer | 1 |
| `MeeshySDK/Services/CommunityLinkService.swift` | Créer | 1 |
| `MeeshySDK/Services/ShareLinkService.swift` | Modifier | 1 |
| `MeeshySDK/Models/ShareLinkModels.swift` | Modifier | 1 |
| `MeeshySDK/Models/AffiliateModels.swift` | Modifier | 1 |
| `gateway/src/routes/tracking-links/creation.ts` | Modifier | 2 |
| `gateway/src/routes/links.ts` | Modifier | 2 |
| `gateway/src/routes/affiliate.ts` | Modifier | 2 |
| `shared/prisma/schema.prisma` | Modifier (si besoin) | 2 |
| `Router.swift` | Modifier | 3 |
| `RootView.swift` | Modifier | 3 |
| `WidgetPreviewView.swift` | Modifier | 3 |
| `AffiliateView.swift` | Modifier | 4 |
| `ShareLinksView.swift` | Créer | 4 |
| `CreateShareLinkView.swift` | Créer | 4 |
| `TrackingLinksView.swift` | Créer | 4 |
| `CreateTrackingLinkView.swift` | Créer | 4 |
| `CommunityLinksView.swift` | Créer | 4 |
| `ShareLinkDetailView.swift` | Créer | 5 |
| `TrackingLinkDetailView.swift` | Créer | 5 |
| `CommunityLinkDetailView.swift` | Créer | 5 |
