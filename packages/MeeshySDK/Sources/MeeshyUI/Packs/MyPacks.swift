import Foundation
import MeeshySDK
import os

// MARK: - Mes packs : les packs installés, rangés et triés (#16433)

/// L'ordre dans lequel « Mes packs » range une catégorie.
public enum MyPacksSort: String, CaseIterable, Sendable {
    case recent
    case name
    case publisher
}

/// Une catégorie de « Mes packs » : son domaine et ses packs installés, dans l'ordre choisi.
public struct MyPacksSection: Equatable, Sendable, Identifiable {
    public let domain: PackDomain
    public let packs: [ShopPack]
    public var id: String { domain.rawValue }
}

public enum MyPacks {
    /// `nil` tant que la vitrine n'a jamais été lue ; sinon les catégories qui ont au moins un pack
    /// installé, dans l'ordre de la vitrine. `recency` : la date d'installation par « domaine/slug ».
    public static func sections(of state: PackShopState, sort: MyPacksSort, recency: [String: Date],
                                language: String) -> [MyPacksSection]? {
        guard let sections = state.sections else { return nil }
        return sections.compactMap { section in
            let installed = section.packs.filter(\.installed)
            guard !installed.isEmpty else { return nil }
            return MyPacksSection(domain: section.domain,
                                  packs: sorted(installed, domain: section.domain, by: sort, recency: recency, language: language))
        }
    }

    static func sorted(_ packs: [ShopPack], domain: PackDomain, by sort: MyPacksSort,
                       recency: [String: Date], language: String) -> [ShopPack] {
        let indexed = Array(packs.enumerated())
        let name: (ShopPack) -> String = { $0.localizedName(language: language) }
        let ordered = indexed.sorted { lhs, rhs in
            switch sort {
            case .name:
                return precedes(name(lhs.element), name(rhs.element), lhs.offset, rhs.offset)
            case .publisher:
                let left = lhs.element.publisher?.name ?? "\u{10FFFF}"
                let right = rhs.element.publisher?.name ?? "\u{10FFFF}"
                guard compare(left, right) == .orderedSame else { return compare(left, right) == .orderedAscending }
                return precedes(name(lhs.element), name(rhs.element), lhs.offset, rhs.offset)
            case .recent:
                let left = recency[key(domain, lhs.element.slug)]
                let right = recency[key(domain, rhs.element.slug)]
                switch (left, right) {
                case let (l?, r?): return l == r ? lhs.offset < rhs.offset : l > r
                case (.some, nil): return true
                case (nil, .some): return false
                case (nil, nil): return lhs.offset < rhs.offset
                }
            }
        }
        return ordered.map(\.element)
    }

    static func key(_ domain: PackDomain, _ slug: String) -> String { domain.rawValue + "/" + slug }

    private static func compare(_ lhs: String, _ rhs: String) -> ComparisonResult {
        lhs.compare(rhs, options: [.caseInsensitive, .diacriticInsensitive], locale: nil)
    }

    private static func precedes(_ lhs: String, _ rhs: String, _ lhsOffset: Int, _ rhsOffset: Int) -> Bool {
        let order = compare(lhs, rhs)
        return order == .orderedSame ? lhsOffset < rhsOffset : order == .orderedAscending
    }
}

// MARK: - Quand un pack a été installé, sur cet appareil

/// La date d'installation d'un pack : la passerelle ne la sert pas pour tous les domaines,
/// l'appareil la garde au geste confirmé. Un pack installé ailleurs se range après, dans
/// l'ordre de la vitrine.
public protocol PackInstallRecording: Sendable {
    func recordInstall(domain: PackDomain, slug: String, at date: Date)
    func forget(domain: PackDomain, slug: String)
    func installDates() -> [String: Date]
}

public final class PackInstallRecency: PackInstallRecording, Sendable {
    public static let shared = PackInstallRecency()

    private static let key = "meeshy.packs.install-recency.v1"
    private let defaults: OSAllocatedUnfairLock<UserDefaults>

    public init(defaults: UserDefaults = .standard) {
        self.defaults = OSAllocatedUnfairLock(uncheckedState: defaults)
    }

    nonisolated deinit {}

    public func recordInstall(domain: PackDomain, slug: String, at date: Date) {
        update { $0[MyPacks.key(domain, slug)] = date.timeIntervalSince1970 }
    }

    public func forget(domain: PackDomain, slug: String) {
        update { $0[MyPacks.key(domain, slug)] = nil }
    }

    public func installDates() -> [String: Date] {
        defaults.withLockUnchecked { Self.stored(in: $0) }.mapValues { Date(timeIntervalSince1970: $0) }
    }

    private static func stored(in defaults: UserDefaults) -> [String: Double] {
        defaults.dictionary(forKey: key) as? [String: Double] ?? [:]
    }

    private func update(_ change: (inout [String: Double]) -> Void) {
        defaults.withLockUnchecked { defaults in
            var current = Self.stored(in: defaults)
            change(&current)
            defaults.set(current, forKey: Self.key)
        }
    }
}

// MARK: - Le catalogue d'un éditeur (#16433)

/// Un pack de la vitrine, désigné par son domaine et son adresse.
public struct PackCatalogueEntry: Hashable, Sendable, Identifiable {
    public let domain: PackDomain
    public let slug: String
    public var id: String { domain.rawValue + "/" + slug }

    public init(domain: PackDomain, slug: String) {
        self.domain = domain
        self.slug = slug
    }
}

/// **Tout le catalogue d'un éditeur**, lu dans la vitrine : chaque pack y porte `publisher.slug`.
/// La passerelle n'a pas de liste à part — la vitrine applique déjà verrou, possession et statut.
public enum PublisherCatalogue {
    public static func sections(of publisher: String, in state: PackShopState) -> [MyPacksSection] {
        (state.sections ?? []).compactMap { section in
            let packs = section.packs.filter { $0.publisher?.slug == publisher }
            return packs.isEmpty ? nil : MyPacksSection(domain: section.domain, packs: packs)
        }
    }

    /// « Du même éditeur » : ses autres packs, toutes catégories confondues, dans l'ordre de la vitrine.
    public static func entries(of publisher: String, in state: PackShopState,
                               excluding current: PackCatalogueEntry) -> [PackCatalogueEntry] {
        sections(of: publisher, in: state).flatMap { section in
            section.packs.map { PackCatalogueEntry(domain: section.domain, slug: $0.slug) }
        }
        .filter { $0 != current }
    }
}
