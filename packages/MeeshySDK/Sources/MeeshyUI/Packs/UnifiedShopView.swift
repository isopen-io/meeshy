import Combine
import SwiftUI
import MeeshySDK

// MARK: - La vitrine unique, filtrable par domaine (#10632)

/// **Le magasin de la vitrine** : lit `/packs/shop` (ou, sur un ancien serveur,
/// les boutiques par domaine), achète et installe À L'INSTANT, puis confirme ou
/// revient en arrière en le disant. Le calcul vit dans `PackShopState` (pur) ;
/// ce type ne fait que l'enchaîner au réseau.
@MainActor
public final class PackShopStore: ObservableObject {
    nonisolated deinit {}

    @Published public private(set) var state = PackShopState()
    @Published public private(set) var loadFailed = false

    private let service: any PackShopProviding
    private let makeRequestId: () -> String
    private let snapshots: any PackShopSnapshotStoring
    /// Les domaines de la dernière lecture : un refus relit la MÊME vitrine.
    private var shownDomains: [PackDomain]?

    public init(service: any PackShopProviding = PackShopService.shared,
                snapshots: any PackShopSnapshotStoring = PackShopSnapshotStore.shared,
                makeRequestId: @escaping () -> String = { UUID().uuidString }) {
        self.service = service
        self.snapshots = snapshots
        self.makeRequestId = makeRequestId
    }

    /// `domains` : ceux que la vitrine montre — une vitrine filtrée ne lit
    /// pas les autres (`nil` = tous les domaines servis).
    public func load(domains: [PackDomain]? = nil) async {
        shownDomains = domains
        if state.sections == nil {
            switch snapshots.read(domains: domains) {
            case .fresh(let cached, _):
                state = state.loaded(cached)
                return
            case .stale(let cached, _):
                state = state.loaded(cached)
            case .expired, .empty:
                break
            }
        }
        do {
            let response = try await service.shop(domains: domains)
            state = state.loaded(response)
            snapshots.write(state, domains: domains)
            loadFailed = false
        } catch {
            // Un échec ne vide rien : la vitrine déjà lue reste affichée.
            loadFailed = state.sections == nil
        }
    }

    /// Le geste du bouton d'un pack : acheter s'il est payant et pas encore à
    /// moi, installer ou retirer sinon.
    public func tap(domain: PackDomain, slug: String) async {
        if let purchase = state.purchasing(domain, slug, makeRequestId: makeRequestId) {
            await buy(domain: domain, slug: slug, optimistic: purchase.state, requestId: purchase.requestId)
        } else if let next = state.togglingInstall(domain, slug) {
            await toggle(domain: domain, slug: slug, optimistic: next)
        }
    }

    public func dismissFailure() {
        state.failure = nil
    }

    private func buy(domain: PackDomain, slug: String, optimistic: PackShopState, requestId: String) async {
        let previous = state
        state = optimistic
        do {
            let bought = try await service.purchase(domain: domain, slug: slug, requestId: requestId)
            state = state.purchaseSettled(domain, slug, bought)
            snapshots.write(state, domains: shownDomains)
        } catch {
            let insufficient = PackHTTPStatus.isInsufficientMeeshes(error)
            let definitive = PackHTTPStatus.isDefinitiveRefusal(error)
            state = state.purchaseRefused(domain, slug, restoring: previous,
                                          failure: insufficient ? .insufficientMeeshes : .generic,
                                          definitive: definitive)
            if definitive && !insufficient { await load(domains: shownDomains) }
        }
    }

    private func toggle(domain: PackDomain, slug: String, optimistic: PackShopState) async {
        let previous = state
        let wantsInstalled = optimistic.pack(domain, slug)?.installed ?? false
        state = optimistic
        do {
            let confirmed = try await service.setInstalled(wantsInstalled, domain: domain, slug: slug)
            state = state.installSettled(domain, slug, confirmed: confirmed)
            snapshots.write(state, domains: shownDomains)
        } catch {
            state = state.installRefused(domain, slug, restoring: previous)
            if PackHTTPStatus.code(of: error) == 403 { await load(domains: shownDomains) }
        }
    }
}

/// **La vitrine unique** : stickers, cadres, fonds, contours et bannières dans
/// un même écran, filtrés par domaine, avec le prix en Meeshes, la possession et
/// l'achat optimiste. `domains` borne les puces offertes ; `initialDomain`
/// ouvre la vitrine filtrée (lien profond, « Plus dans la boutique »).
public struct UnifiedShopView: View {
    @StateObject private var store: PackShopStore
    @State private var selected: PackDomain
    private let domains: [PackDomain]
    private let focusedSlug: String?
    private let language: String
    private let usageText: ((FrameUsage) -> String)?
    private let rankName: ((GloryRank) -> String)?

    /// `language` nomme les packs dans la langue du lecteur ; `usageText` traduit la loi d'usage
    /// d'un cadre (« Rang Ambassadeur uniquement ») — l'app la possède, la vitrine l'affiche (#10711).
    /// `rankName` nomme un rang du jeu pour « ce qui reste à débloquer » (#11306) ; sans lui, la ligne dit
    /// la Gloire manquante sans le rang.
    @MainActor
    public init(initialDomain: PackDomain? = nil, domains: [PackDomain] = PackDomain.allCases,
                focusedSlug: String? = nil, language: String = "fr",
                usageText: ((FrameUsage) -> String)? = nil, rankName: ((GloryRank) -> String)? = nil,
                store: PackShopStore? = nil) {
        self.focusedSlug = focusedSlug
        self.language = language
        self.usageText = usageText
        self.rankName = rankName
        let offered = domains.filter { $0 != .unknown }
        self.domains = offered
        _store = StateObject(wrappedValue: store ?? PackShopStore())
        _selected = State(initialValue: initialDomain.flatMap { offered.contains($0) ? $0 : nil } ?? offered.first ?? .wallpaper)
    }

    public var body: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            balanceLine
            if domains.count > 1 { domainChips }
            shelf
        }
        .task { await store.load(domains: domains) }
    }

    private var failureText: String? {
        switch store.state.failure {
        case .insufficientMeeshes:
            String(localized: "shop.error.insufficient", defaultValue: "Il te manque des Meeshes pour ce pack.", bundle: .module)
        case .generic:
            nil
        case nil:
            nil
        }
    }

    @ViewBuilder
    private var balanceLine: some View {
        if let balance = store.state.balance {
            Text(String(format: String(localized: "shop.balance", defaultValue: "Meeshes : %lld", bundle: .module), balance))
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("shop.balance")
        }
    }

    private var domainChips: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: MeeshySpacing.sm) {
                ForEach(domains, id: \.self) { domain in
                    chip(domain)
                }
            }
        }
    }

    private func chip(_ domain: PackDomain) -> some View {
        let isSelected = domain == selected
        return Button {
            HapticFeedback.light()
            selected = domain
            store.dismissFailure()
        } label: {
            Text(Self.title(of: domain))
                .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                .foregroundStyle(isSelected ? Color.white : Color.primary)
                .padding(.horizontal, 14)
                .frame(minHeight: 36)
                .background {
                    if isSelected {
                        Capsule().fill(MeeshyColors.brandGradient)
                    } else {
                        Capsule().fill(Color.primary.opacity(0.08))
                    }
                }
                .frame(minHeight: 44)
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    @ViewBuilder
    private var shelf: some View {
        if store.loadFailed {
            VStack(alignment: .leading, spacing: MeeshySpacing.sm) {
                Text(String(localized: "shop.error.load", defaultValue: "La boutique n’a pas pu se charger. Réessaie.", bundle: .module))
                    .font(MeeshyFont.relative(13, weight: .medium))
                    .foregroundStyle(MeeshyColors.error)
                Button {
                    HapticFeedback.light()
                    Task { await store.load(domains: domains) }
                } label: {
                    Text(String(localized: "common.retry", defaultValue: "Réessayer", bundle: .module))
                        .font(MeeshyFont.relative(13, weight: .semibold, design: .rounded))
                        .padding(.horizontal, 14)
                        .frame(minHeight: 44)
                        .contentShape(Capsule())
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("shop.retry")
            }
        } else if let packs = store.state.packs(in: selected), packs.isEmpty {
            Text(String(localized: "shop.empty", defaultValue: "Rien à découvrir ici pour l’instant.", bundle: .module))
                .font(MeeshyFont.relative(13))
                .foregroundStyle(.secondary)
        } else {
            let domain = selected
            PackShopView(rows: store.state.packs(in: domain)?.map { Self.row($0, language: language, usageText: usageText, rankName: rankName) },
                         pending: pendingSlugs(in: domain),
                         showsFailure: store.state.failure != nil,
                         failureText: failureText,
                         focusedSlug: focusedSlug) { slug in
                Task { await store.tap(domain: domain, slug: slug) }
            }
        }
    }

    private func pendingSlugs(in domain: PackDomain) -> Set<String> {
        let prefix = "\(domain.rawValue)."
        return Set(store.state.pending.filter { $0.hasPrefix(prefix) }.map { String($0.dropFirst(prefix.count)) })
    }

    /// Un pack de la vitrine en rangée de Boutique : nommé dans la langue du lecteur, avec la loi
    /// d'usage d'un cadre quand l'app sait la dire.
    public static func row(_ pack: ShopPack, language: String = "fr",
                           usageText: ((FrameUsage) -> String)? = nil,
                           rankName: ((GloryRank) -> String)? = nil) -> PackRow {
        let cover: PackCover
        if MeeStickerCatalog.cast(forPackSlug: pack.slug) != nil {
            cover = .mee(slug: pack.slug)
        } else if let file = pack.coverFile {
            cover = .stored(file)
        } else {
            cover = .remote(pack.coverUrl)
        }
        return PackRow(slug: pack.slug, name: pack.localizedName(language: language), author: pack.author,
                       description: pack.localizedDescription(language: language),
                       installed: pack.installed, removable: pack.removable, cover: cover,
                       usageText: pack.usage.flatMap { usage in usageText.map { $0(usage) } },
                       price: pack.price, owned: pack.isOwned, locked: pack.isLocked,
                       unlockText: pack.requirementPreview.flatMap {
                           PackUnlockCopy.line($0, language: language, rankName: rankName)
                       })
    }

    /// Le nom d'un domaine, tel que les puces et les réglages le disent.
    public static func title(of domain: PackDomain) -> String {
        switch domain {
        case .sticker:
            String(localized: "shop.domain.sticker", defaultValue: "Stickers", bundle: .module)
        case .gloryFrame:
            String(localized: "shop.domain.glory_frame", defaultValue: "Cadres du jeu", bundle: .module)
        case .wallpaper:
            String(localized: "shop.domain.wallpaper", defaultValue: "Fonds", bundle: .module)
        case .avatarRing:
            String(localized: "shop.domain.avatar_ring", defaultValue: "Contours", bundle: .module)
        case .banner:
            String(localized: "shop.domain.banner", defaultValue: "Bannières", bundle: .module)
        case .bannerFrame:
            String(localized: "shop.domain.banner_frame", defaultValue: "Cadres de bannière", bundle: .module)
        case .unknown:
            ""
        }
    }
}
