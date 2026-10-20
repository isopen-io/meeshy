import Foundation
import os
import MeeshySDK

// MARK: - Retirer un pack efface ses fichiers, sauf ce qui sert encore (§ 5.10.6, #10150)

/// Ce qui efface des fichiers du magasin des packs — `ContentAddressedStore` en
/// production, un double en test.
protocol PackFilePruning: Sendable {
    func prune(_ names: Set<String>) async -> Set<String>
}

extension ContentAddressedStore: PackFilePruning {}

/// **Ce que chaque pack a rangé dans le magasin**, gardé HORS du magasin qu'il
/// décrit : le magasin ne sait que des empreintes, l'index sait à qui elles sont.
/// Relire un pack REMPLACE son manifeste ; les fichiers que la nouvelle version
/// n'emploie plus restent connus (sans propriétaire) jusqu'au prochain élagage —
/// un fichier inconnu n'est jamais effacé, donc rien ne doit sortir de l'index
/// sans être passé par l'élagage.
actor PackFileIndex {
    static let shared = PackFileIndex()

    private struct Stored: Codable {
        var manifests: [String: PackFileManifest] = [:]
        var superseded: Set<String> = []
    }

    /// Le pseudo-pack des fichiers qu'une nouvelle version n'emploie plus : jamais retenu.
    static let supersededSlug = "\u{0}superseded"

    private let url: URL
    private var stored: Stored?

    init(url: URL = PackFileIndex.defaultURL) {
        self.url = url
    }

    static var defaultURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("meeshy-packs-index.json")
    }

    func record(_ manifest: PackFileManifest) {
        var current = load()
        let dropped = current.manifests[manifest.slug].map { previous in
            previous.files.union(previous.frames.values.reduce(Set<String>()) { $0.union($1) })
        } ?? []
        let kept = manifest.files.union(manifest.frames.values.reduce(Set<String>()) { $0.union($1) })
        current.manifests[manifest.slug] = manifest
        current.superseded = current.superseded.union(dropped.subtracting(kept)).subtracting(kept)
        save(current)
    }

    func all() -> [PackFileManifest] {
        let current = load()
        let packs = current.manifests.values.sorted { $0.slug < $1.slug }
        guard !current.superseded.isEmpty else { return packs }
        return packs + [PackFileManifest(slug: Self.supersededSlug, files: current.superseded)]
    }

    func forget(_ slugs: Set<String>) {
        var current = load()
        slugs.forEach { current.manifests[$0] = nil }
        if slugs.contains(Self.supersededSlug) { current.superseded = [] }
        save(current)
    }

    private func load() -> Stored {
        if let stored { return stored }
        let read = (try? Data(contentsOf: url)).flatMap { try? JSONDecoder().decode(Stored.self, from: $0) } ?? Stored()
        stored = read
        return read
    }

    private func save(_ value: Stored) {
        stored = value
        guard let data = try? JSONEncoder().encode(value) else { return }
        try? data.write(to: url, options: .atomic)
    }
}

/// **L'élagage du magasin des packs** : un retrait (local, ou reçu d'un autre
/// appareil à la revalidation) le demande ; il efface ce qu'AUCUN pack retenu par
/// l'un des comptes connus sur l'appareil ni aucun cadre gardé dans un carnet ne
/// référence. Un bail ouvert (déroulé photo, reprise) le DIFFÈRE à sa fin. Une
/// étagère ou un carnet illisible l'annule : dans le doute, on garde.
@MainActor
final class PackFilePruner {
    nonisolated deinit {}

    static let frames = PackFilePruner(
        index: .shared,
        store: ContentAddressedStore.shared,
        retainedPacks: { await PackDiskCache<FramePack>.installedSlugsOfEveryAccount(domain: .gloryFrame) },
        referencedFrames: { await GamePhotoNotebook.referencedFrameIdsOfEveryAccount() }
    )

    private let index: PackFileIndex
    private let store: any PackFilePruning
    private let retainedPacks: @concurrent @Sendable () async -> Set<String>?
    private let referencedFrames: @concurrent @Sendable () async -> Set<String>?
    private var leases: [String: Int] = [:]
    private var deferred = false
    private let logger = MeeshyLog.logger(.packs)

    init(index: PackFileIndex,
         store: any PackFilePruning,
         retainedPacks: @escaping @concurrent @Sendable () async -> Set<String>?,
         referencedFrames: @escaping @concurrent @Sendable () async -> Set<String>?) {
        self.index = index
        self.store = store
        self.retainedPacks = retainedPacks
        self.referencedFrames = referencedFrames
    }

    func requestPrune() async {
        guard leases.isEmpty else {
            deferred = true
            return
        }
        await prune()
    }

    func acquireLease(slug: String) {
        leases[slug, default: 0] += 1
    }

    func releaseLease(slug: String) async {
        guard let count = leases[slug] else { return }
        leases[slug] = count > 1 ? count - 1 : nil
        guard leases.isEmpty, deferred else { return }
        deferred = false
        await prune()
    }

    private func prune() async {
        guard let retained = await retainedPacks(), let frames = await referencedFrames() else {
            logger.info("Pack prune skipped: shelf or notebook unreadable")
            return
        }
        let plan = PackFileRetention.plan(manifests: await index.all(), retainedPacks: retained, referencedFrames: frames)
        guard !plan.files.isEmpty || !plan.forgottenPacks.isEmpty else { return }
        let removed = await store.prune(plan.files)
        await index.forget(plan.forgottenPacks)
        logger.info("Pack prune removed \(removed.count, privacy: .public) files")
    }
}
