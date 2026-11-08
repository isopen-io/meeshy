import Combine
import Foundation
import MeeshySDK

// MARK: - Fiche et plein écran d'un pack : l'état (#16268)

/// Le zoom du plein écran : ×1 à ×4 au pincement, le double toucher bascule entre l'ajustement et ×2.
/// Tant que l'élément est agrandi, le glissement déplace l'élément et ne change pas de page.
public struct PackZoom: Equatable, Sendable {
    public static let range: ClosedRange<CGFloat> = 1...4
    public static let doubleTapScale: CGFloat = 2

    public private(set) var scale: CGFloat
    /// L'échelle à la fin du dernier geste : le pincement suivant repart d'elle.
    private var base: CGFloat

    public init() {
        scale = 1
        base = 1
    }

    public var allowsPaging: Bool { scale <= Self.range.lowerBound }

    public func pinching(_ magnification: CGFloat) -> PackZoom {
        var next = self
        next.scale = min(max(base * magnification, Self.range.lowerBound), Self.range.upperBound)
        return next
    }

    public func settled() -> PackZoom {
        var next = self
        next.base = scale
        return next
    }

    public func doubleTapped() -> PackZoom {
        var next = self
        next.scale = scale > Self.range.lowerBound ? Self.range.lowerBound : Self.doubleTapScale
        next.base = next.scale
        return next
    }
}

/// La position dans un pack : « n / N », bornée aux éléments du pack.
public struct PackViewerPager: Equatable, Sendable {
    public let index: Int
    public let count: Int

    public init(index: Int, count: Int) {
        self.count = max(count, 0)
        self.index = min(max(index, 0), max(count - 1, 0))
    }

    public var position: String { "\(index + 1) / \(count)" }
    public var hasNext: Bool { index + 1 < count }
    public var hasPrevious: Bool { index > 0 }

    public func next() -> PackViewerPager { PackViewerPager(index: index + 1, count: count) }
    public func previous() -> PackViewerPager { PackViewerPager(index: index - 1, count: count) }
}

/// Ce que la fiche d'un pack dit de lui.
public enum PackAvailability: Equatable, Sendable {
    case bundled
    case installed
    case toDownload
}

public enum PackDetailFacts {
    public static func availability(_ row: PackRow) -> PackAvailability {
        if row.bundled { return .bundled }
        return row.installed ? .installed : .toDownload
    }

    /// Le prix en Meeshes ; tout est gratuit pour le moment, et la fiche se tait alors.
    public static func priceText(_ row: PackRow) -> String? {
        row.price.map {
            String(format: String(localized: "shop.detail.price", defaultValue: "%lld Meeshes", bundle: .module), $0)
        }
    }

    public static func weightText(_ row: PackRow) -> String? {
        row.downloadBytes.map { MediaFormat.bytes(Int64($0)) }
    }

    /// « Autres propositions » : les autres packs de la même étagère, dans son ordre.
    public static func alternatives(to slug: String, among rows: [PackRow]) -> [PackRow] {
        rows.filter { $0.slug != slug }
    }

    /// On n'équipe que ce que le serveur accepterait : un décor de profil d'un pack installé, possédé et débloqué.
    public static func canEquip(_ element: PackElement, in row: PackRow) -> Bool {
        element.equipSide != nil && row.installed && !row.needsPurchase && !row.locked
    }
}

public struct PackDetailTarget: Identifiable, Hashable, Sendable {
    public let domain: PackDomain
    public let slug: String
    public var id: String { domain.rawValue + "/" + slug }
}

/// Le plein écran ouvert. Son identité ne dépend que du domaine : passer à une autre proposition
/// garde la même présentation, au lieu de la refermer puis la rouvrir.
public struct PackViewerTarget: Identifiable, Hashable, Sendable {
    public let domain: PackDomain
    public let slug: String
    public let index: Int
    public var id: String { domain.rawValue }
}

/// **L'équipement existant**, injecté : le service du décor de profil, le décor porté, et qui le publie.
public struct PackDecorEquipment {
    let service: any ProfileDecorProviding
    let currentDecor: () -> ServedProfileDecor?
    let publish: (ServedProfileDecor) -> Void
    /// Ce que porte le choix optimiste : l'adresse du contrat d'un pack servi, pour qu'il se peigne au toucher.
    let item: (ProfileDecorRef, ProfileDecorSide) -> ServedProfileDecorItem

    public init(service: any ProfileDecorProviding, currentDecor: @escaping () -> ServedProfileDecor?,
                publish: @escaping (ServedProfileDecor) -> Void,
                item: @escaping (ProfileDecorRef, ProfileDecorSide) -> ServedProfileDecorItem = {
                    ServedAppearanceStore.shared.servedItem($0, side: $1)
                }) {
        self.service = service
        self.currentDecor = currentDecor
        self.publish = publish
        self.item = item
    }

    /// Le compte connecté : le même chemin que la feuille « Contour et bannière » du profil.
    public static var live: PackDecorEquipment {
        PackDecorEquipment(
            service: ProfileDecorService.shared,
            currentDecor: { AuthManager.shared.currentUser?.profileDecor },
            publish: { decor in
                guard let user = AuthManager.shared.currentUser else { return }
                AuthManager.shared.currentUser = user.withProfileDecor(decor)
            }
        )
    }
}

/// **La vitrine d'un domaine** : quelle fiche est ouverte, quel élément est en plein écran, et
/// l'équipement optimiste — appliqué au toucher, confirmé par le serveur, rétabli sur un refus.
@MainActor
public final class PackShowcaseModel: ObservableObject {
    nonisolated deinit {}

    @Published public var detail: PackDetailTarget?
    @Published public var viewer: PackViewerTarget?
    @Published public private(set) var decor: ProfileDecorState
    @Published public private(set) var equipFailed = false
    /// Les packs déjà demandés et ceux en route : avant et pendant, un pack se dit EN CHARGEMENT.
    @Published private var attempted: Set<String> = []
    @Published private var inFlight: Set<String> = []

    private let designs: any PackElementDesignProviding
    private let equipment: PackDecorEquipment
    private let language: String
    private var accepted: ServedProfileDecor
    /// Le numéro du DERNIER choix de chaque côté : une réponse plus ancienne ne l'écrase ni ne le rétablit.
    private var latestChoice: [ProfileDecorSide: Int] = [:]
    private var choices = 0

    public init(designs: (any PackElementDesignProviding)? = nil,
                equipment: PackDecorEquipment = .live, language: String = "fr") {
        self.designs = designs ?? ServedPackElementDesigns()
        self.equipment = equipment
        self.language = language
        let worn = equipment.currentDecor() ?? .empty
        self.decor = ProfileDecorState(decor: worn)
        self.accepted = worn
    }

    public func elements(domain: PackDomain, pack: String) -> PackElementsResolution {
        let resolution = designs.elements(domain: domain, pack: pack, language: language)
        let key = Self.key(domain, pack)
        guard case .downloadRequired = resolution, !attempted.contains(key) || inFlight.contains(key) else { return resolution }
        return .loading
    }

    /// Fait venir un pack que l'appareil ne sait pas encore peindre — une fois par pack.
    public func prepare(domain: PackDomain, pack: String) async {
        let key = Self.key(domain, pack)
        guard !attempted.contains(key) else { return }
        attempted.insert(key)
        guard case .downloadRequired = designs.elements(domain: domain, pack: pack, language: language) else { return }
        inFlight.insert(key)
        await designs.prepare(domain: domain, pack: pack)
        inFlight.remove(key)
    }

    public func seed(stickerPacks: [StickerPack]) {
        designs.seed(stickerPacks: stickerPacks)
    }

    private static func key(_ domain: PackDomain, _ pack: String) -> String {
        domain.rawValue + "/" + pack
    }

    public func openDetail(domain: PackDomain, slug: String) {
        detail = PackDetailTarget(domain: domain, slug: slug)
    }

    public func openViewer(domain: PackDomain, slug: String, index: Int = 0) {
        equipFailed = false
        if latestChoice.isEmpty, let worn = equipment.currentDecor() {
            decor = ProfileDecorState(decor: worn)
            accepted = worn
        }
        viewer = PackViewerTarget(domain: domain, slug: slug, index: index)
    }

    public func showAlternative(_ slug: String) {
        guard let viewer else { return }
        self.viewer = PackViewerTarget(domain: viewer.domain, slug: slug, index: 0)
    }

    public func select(index: Int) {
        guard let viewer, viewer.index != index else { return }
        self.viewer = PackViewerTarget(domain: viewer.domain, slug: viewer.slug, index: index)
    }

    public func isEquipped(_ element: PackElement) -> Bool {
        guard let side = element.equipSide else { return false }
        return decor.decor[side]?.ref == element.ref
    }

    public func equip(_ element: PackElement) async {
        guard let side = element.equipSide, !isEquipped(element) else { return }
        equipFailed = false
        choices += 1
        let choice = choices
        latestChoice[side] = choice
        decor.equip(equipment.item(element.ref, side), side: side)
        equipment.publish(decor.decor)
        do {
            let served = try await equipment.service.update(ProfileDecorWrite(side: side, choice: element.ref))
            guard latestChoice[side] == choice else { return }
            accepted = served
            decor.confirm(served)
        } catch {
            guard latestChoice[side] == choice else { return }
            decor.rollback(side: side, to: accepted[side])
            equipFailed = true
        }
        latestChoice[side] = nil
        equipment.publish(decor.decor)
    }
}
