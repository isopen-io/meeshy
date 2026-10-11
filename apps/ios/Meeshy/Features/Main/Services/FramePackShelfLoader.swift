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
    private var loaded: Set<String> = []
    private let logger = Logger(subsystem: "me.meeshy.app", category: "packs")

    init(service: any PackServiceProviding<FramePack> = FramePackService.shared,
         assets: any PackAssetReading = ContentAddressedStore.shared,
         language: @escaping @MainActor () -> String = { AuthManager.shared.currentUser?.systemLanguage ?? "fr" },
         usageText: @escaping @MainActor (FrameUsage) -> String = FrameUsageCopy.text) {
        self.service = service
        self.assets = assets
        self.language = language
        self.usageText = usageText
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
            let strings = await readStrings(detail)
            contents[pack.slug] = .frames(Self.tiles(parsed.contract, strings: strings, usageText: usageText))
            loaded.insert(key)
        } catch {
            logger.error("Frame pack shelf failed: \(error.localizedDescription, privacy: .public)")
            if case .frames? = contents[pack.slug] { return }
            contents[pack.slug] = .unavailable
        }
    }

    private func readStrings(_ detail: FramePack) async -> [String: String] {
        guard let ref = detail.stringsRef(language: language()),
              let data = try? await assets.data(for: ref.file) else { return [:] }
        return PackStringKey.parseStrings(data)
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
/// uniquement ». Le format vit dans MeeshyUI, le nom du rang dans l'app.
enum FrameUsageCopy {
    static func text(_ usage: FrameUsage) -> String {
        FrameUsageText.text(FrameUsageLaw.describeFrameUsage(usage)) { parameter, value in
            switch parameter {
            case "rank": GloryRank(rawValue: value).map(GameCopy.rankName) ?? value
            default: value
            }
        }
    }
}
