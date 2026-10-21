import Combine
import Foundation
import os
import MeeshySDK
import MeeshyUI

// MARK: - Les cadres d'un pack installé, lus sur l'appareil (#10150)

/// Où lire les octets d'un pack officiel — `ContentAddressedStore` en
/// production, un double en test.
protocol PackAssetReading: Sendable {
    func data(for file: PackAssetFile) async throws -> Data
}

extension ContentAddressedStore: PackAssetReading {}

/// **L'onglet d'un pack de cadres installé** : son détail, son contrat (vérifié
/// par son empreinte), les chaînes de la langue du lecteur — sinon le français —
/// puis un cadre par vignette, chacun avec le libellé de SON usage.
///
/// Un contrat d'une version inconnue ne se lit pas : l'onglet dit « Mets à jour
/// Meeshy » et rien d'autre ne se télécharge. Ce qui est déjà affiché le reste
/// quand une relecture échoue.
@MainActor
final class FramePackShelfLoader: ObservableObject {
    nonisolated deinit {}

    static let shared = FramePackShelfLoader()

    @Published private(set) var contents: [String: FrameShelfContent] = [:]

    private let service: any PackServiceProviding<FramePack>
    private let assets: any PackAssetReading
    private let language: @MainActor () -> String
    private let usageText: @MainActor (FrameUsage) -> String
    private let index: PackFileIndex
    private var loaded: Set<String> = []
    private let logger = MeeshyLog.logger(.packs)

    init(service: any PackServiceProviding<FramePack> = FramePackService.shared,
         assets: any PackAssetReading = ContentAddressedStore.shared,
         language: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.systemLanguage ?? "fr" },
         usageText: @escaping @MainActor (FrameUsage) -> String = FrameUsageCopy.text,
         index: PackFileIndex = .shared) {
        self.service = service
        self.assets = assets
        self.language = language
        self.usageText = usageText
        self.index = index
    }

    /// Les cadres du pack `pack`, chargés une fois par version.
    func load(_ pack: FramePack) async {
        let key = "\(pack.slug)@\(pack.version)"
        guard !loaded.contains(key) else { return }
        if contents[pack.slug] == nil { contents[pack.slug] = .loading }
        do {
            let detail = try await service.detail(slug: pack.slug)
            guard detail.contractSchema.map({ $0 == GloryFramePackContract.schema }) ?? true else {
                contents[pack.slug] = .needsUpdate
                return
            }
            guard let contractRef = detail.contract else {
                contents[pack.slug] = .unavailable
                return
            }
            let contractData = try await assets.data(for: contractRef.file)
            guard let parsed = GloryFramePackContract.parse(contractData) else {
                contents[pack.slug] = .needsUpdate
                return
            }
            let stringsRef = detail.stringsRef(language: language())
            let strings = await readStrings(stringsRef)
            contents[pack.slug] = .frames(Self.tiles(parsed.contract, strings: strings, usageText: usageText))
            loaded.insert(key)
            await index.record(Self.manifest(of: detail, contract: parsed.contract, strings: stringsRef))
        } catch {
            logger.error("Frame pack shelf failed: \(error.localizedDescription, privacy: .public)")
            if case .frames? = contents[pack.slug] { return }
            contents[pack.slug] = .unavailable
        }
    }

    private func readStrings(_ ref: PackAssetRef?) async -> [String: String] {
        guard let ref, let data = try? await assets.data(for: ref.file) else { return [:] }
        return PackStringKey.parseStrings(data)
    }

    /// Ce que l'onglet de ce pack a rangé dans le magasin : de quoi l'élaguer
    /// quand plus personne ne le retient (§ 5.10.6).
    static func manifest(of detail: FramePack, contract: GloryFramePackContract, strings: PackAssetRef?) -> PackFileManifest {
        let shared = [detail.contract?.file.name, strings?.file.name, detail.coverFile?.name, detail.preview?.file.name]
        return PackFileManifest(
            slug: detail.slug,
            files: Set(shared.compactMap { $0 }),
            frames: Dictionary(contract.frames.map { ($0.id, Set([$0.thumb.file.name])) }, uniquingKeysWith: { $0.union($1) })
        )
    }

    /// Un cadre par vignette ; un nom sans traduction se lit par son identifiant.
    static func tiles(_ contract: GloryFramePackContract, strings: [String: String],
                      usageText: @MainActor (FrameUsage) -> String) -> [FrameTile] {
        contract.frames.map { frame in
            FrameTile(id: frame.id, name: strings[frame.nameKey] ?? frame.id,
                      usageText: usageText(frame.usage), thumb: frame.thumb.file)
        }
    }
}

// MARK: - Le libellé d'usage, nommé par le jeu

/// `describeFrameUsage` rendu avec les noms du jeu : « Rang Ambassadeur IV
/// uniquement ». Le format vit dans MeeshyUI ; les noms du rang, de la rareté et de
/// la famille de moment, dans l'app (jamais la valeur brute de la loi).
enum FrameUsageCopy {
    static func text(_ usage: FrameUsage) -> String {
        FrameUsageText.text(FrameUsageLaw.describeFrameUsage(usage), name: name)
    }

    static func name(_ parameter: String, _ value: String) -> String {
        switch parameter {
        case "rank": GloryRank(rawValue: value).map(GameCopy.rankName) ?? value
        case "rarity": GameGlory.AchievementRarity(rawValue: value).map(GameText.rarityName) ?? value
        case "family": FrameMomentFamily(rawValue: value).map(momentFamilyName) ?? value
        default: value
        }
    }

    static func momentFamilyKey(_ family: FrameMomentFamily) -> String {
        "game.frame.family.\(family.rawValue)"
    }

    static func momentFamilyName(_ family: FrameMomentFamily) -> String {
        switch family {
        case .tier: String(localized: "game.frame.family.tier", defaultValue: "État de lumière", bundle: .main)
        case .meesh: String(localized: "game.frame.family.meesh", defaultValue: "Meesh frappée", bundle: .main)
        case .treasury: String(localized: "game.frame.family.treasury", defaultValue: "Contenant de l’Héritage", bundle: .main)
        case .flame: String(localized: "game.frame.family.flame", defaultValue: "Flamme", bundle: .main)
        case .day: String(localized: "game.frame.family.day", defaultValue: "Rêve réalisé", bundle: .main)
        case .level100: String(localized: "game.frame.family.level-100", defaultValue: "Niveau 100", bundle: .main)
        }
    }
}
