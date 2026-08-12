import Foundation
import os

/// Axe « type de donnée » de la purge sélective.
public enum CacheDataKind: String, Sendable, CaseIterable, Codable {
    case images
    case videos
    case audio
    case documents
    case messages
    case reactions
    case payloads
}

/// Pourquoi une case du tableau n'est pas purgeable.
///
/// Chaque cas correspond à une limite STRUCTURELLE du cache, pas à une
/// fonctionnalité manquante. L'UI les affiche telles quelles : une case grisée
/// sans explication passerait pour un bug.
public enum CachePurgeLimitation: String, Sendable, Equatable, Codable {
    /// Aucun `DiskCacheStore` ne détient ce type. Le SDK n'en déclare que
    /// quatre — Images, Audio, Video, Thumbnails. Les documents ne sont
    /// jamais conservés localement : il n'y a rien à libérer.
    case noDedicatedStore

    /// La donnée n'a pas d'entrée propre : elle est un CHAMP du payload qui la
    /// porte (compteurs de likes d'un post, tableau `reactions` d'un message).
    /// La « purger » voudrait dire réécrire le payload pour en retirer un
    /// champ — ce qui ne libère rien et serait défait au premier rafraîchissement.
    case embeddedInPayload

    /// Publications et réels partagent le store GRDB `feed` ET les mêmes clés
    /// de liste (`main-feed`, `bookmarks`…). Aucune frontière ne les sépare
    /// côté payload : on ne peut pas vider l'un sans l'autre.
    case indivisibleFromPosts

    /// Le croisement n'a pas de sens (des « messages » dans le domaine stories).
    case notApplicable
}

/// État d'une case du tableau.
public enum CachePurgeAvailability: Sendable, Equatable {
    /// Purgeable, avec la taille RÉELLEMENT occupée, mesurée fichier par
    /// fichier (ou par `LENGTH()` en base). Jamais estimée.
    case purgeable(bytes: Int)
    case unavailable(CachePurgeLimitation)

    public var bytes: Int {
        if case .purgeable(let bytes) = self { return bytes }
        return 0
    }

    public var isPurgeable: Bool {
        if case .purgeable = self { return true }
        return false
    }
}

/// Identité d'une case : un type × un domaine.
public struct CachePurgeCellID: Sendable, Hashable, Codable {
    public let kind: CacheDataKind
    public let domain: CacheDomain

    public init(kind: CacheDataKind, domain: CacheDomain) {
        self.kind = kind
        self.domain = domain
    }
}

public struct CachePurgeCell: Sendable, Equatable, Identifiable {
    public let id: CachePurgeCellID
    public let availability: CachePurgeAvailability

    public var kind: CacheDataKind { id.kind }
    public var domain: CacheDomain { id.domain }
}

/// Photographie mesurée du cache, prête à afficher.
public struct CachePurgeReport: Sendable, Equatable {
    public let cells: [CachePurgeCell]
    /// Octets présents sur disque qu'aucun domaine ne revendique — l'entité
    /// porteuse a quitté le cache GRDB. Purgeable en bloc, jamais par domaine.
    public let unattributedBytes: Int
    /// Total réel des quatre stores disque, mesuré indépendamment de
    /// l'attribution. Sert de garde-fou : `somme(cases média) + résidu` doit
    /// l'égaler.
    public let totalDiskBytes: Int

    public func cell(_ kind: CacheDataKind, _ domain: CacheDomain) -> CachePurgeCell? {
        cells.first { $0.id.kind == kind && $0.id.domain == domain }
    }

    public func bytes(for kind: CacheDataKind) -> Int {
        cells.filter { $0.id.kind == kind }.reduce(0) { $0 + $1.availability.bytes }
    }

    public func bytes(for domain: CacheDomain) -> Int {
        cells.filter { $0.id.domain == domain }.reduce(0) { $0 + $1.availability.bytes }
    }
}

/// Purge sélective du cache, croisant type de donnée et domaine métier.
///
/// ## Pourquoi l'attribution est dérivée et non stockée
///
/// Les stores disque sont indexés par `SHA256(url)` : aucun domaine n'y est
/// inscrit. Étiqueter au moment de l'écriture aurait supposé de propager un
/// domaine à travers la trentaine de points d'écriture ET à travers les
/// téléchargements implicites de `DiskCacheStore.data(for:)`, qui n'ont aucun
/// contexte métier. Toute lacune y aurait produit un fichier impurgeable en
/// silence. On dérive donc l'attribution à la demande, en relisant les payloads
/// GRDB (`CacheMediaAttribution`).
///
/// ## La limite assumée
///
/// Un fichier dont l'entité porteuse a quitté le cache GRDB n'est plus
/// attribuable. Ces octets sont comptés à part (`unattributedBytes`) et
/// purgeables en bloc — jamais silencieusement oubliés.
public actor CachePurgeService {
    public static let shared = CachePurgeService()

    private let coordinator: CacheCoordinator
    private let logger = Logger(subsystem: "com.meeshy.sdk", category: "cache-purge")

    public init(coordinator: CacheCoordinator = .shared) {
        self.coordinator = coordinator
    }

    // MARK: - Mesure

    public func report() async -> CachePurgeReport {
        let indices = await attributions()
        var cells: [CachePurgeCell] = []

        for kind in CacheDataKind.allCases {
            for domain in CacheDomain.allCases {
                let availability = await measure(kind: kind, domain: domain, indices: indices)
                cells.append(CachePurgeCell(id: CachePurgeCellID(kind: kind, domain: domain),
                                            availability: availability))
            }
        }

        let allAttributed = indices.values.reduce(into: CacheMediaIndex()) { $0.formUnion($1) }
        let unattributed = await unattributedBytes(excluding: allAttributed)
        let total = await totalDiskBytes()

        return CachePurgeReport(cells: cells,
                                unattributedBytes: unattributed,
                                totalDiskBytes: total)
    }

    private func measure(
        kind: CacheDataKind,
        domain: CacheDomain,
        indices: [CacheDomain: CacheMediaIndex]
    ) async -> CachePurgeAvailability {
        switch kind {
        case .documents:
            return .unavailable(.noDedicatedStore)

        case .reactions:
            return .unavailable(.embeddedInPayload)

        case .messages:
            guard domain == .conversations else { return .unavailable(.notApplicable) }
            return .purgeable(bytes: await coordinator.messages.l2ByteSize())

        case .payloads:
            switch domain {
            case .posts:
                return .purgeable(bytes: await coordinator.feed.l2ByteSize())
            case .reels:
                return .unavailable(.indivisibleFromPosts)
            case .conversations:
                return .purgeable(bytes: await coordinator.conversations.l2ByteSize())
            case .stories:
                return .purgeable(bytes: await coordinator.stories.l2ByteSize())
            }

        case .images, .videos, .audio:
            let index = indices[domain] ?? CacheMediaIndex()
            guard let mediaKind = Self.mediaKind(for: kind) else { return .unavailable(.notApplicable) }
            let urls = index.urls(for: mediaKind)
            return .purgeable(bytes: await diskBytes(mediaKind: mediaKind, urls: urls))
        }
    }

    private static func mediaKind(for kind: CacheDataKind) -> CacheMediaKind? {
        switch kind {
        case .images: return .images
        case .videos: return .videos
        case .audio: return .audio
        default: return nil
        }
    }

    /// Une URL d'image peut avoir atterri dans le store `images` OU dans
    /// `thumbnails` selon le chemin qui l'a demandée. On interroge les deux :
    /// un fichier absent d'un store compte pour zéro, donc la somme reste
    /// exacte et il n'y a pas de double comptage.
    private func diskBytes(mediaKind: CacheMediaKind, urls: Set<String>) async -> Int {
        guard !urls.isEmpty else { return 0 }
        switch mediaKind {
        case .videos:
            return await coordinator.video.diskBytes(forURLs: urls)
        case .audio:
            return await coordinator.audio.diskBytes(forURLs: urls)
        case .images:
            let images = await coordinator.images.diskBytes(forURLs: urls)
            let thumbs = await coordinator.thumbnails.diskBytes(forURLs: urls)
            return images + thumbs
        }
    }

    private func unattributedBytes(excluding index: CacheMediaIndex) async -> Int {
        let images = await coordinator.images.unattributedDiskBytes(excluding: index.images)
        let thumbs = await coordinator.thumbnails.unattributedDiskBytes(excluding: index.images)
        let videos = await coordinator.video.unattributedDiskBytes(excluding: index.videos)
        let audio = await coordinator.audio.unattributedDiskBytes(excluding: index.audio)
        return images + thumbs + videos + audio
    }

    private func totalDiskBytes() async -> Int {
        var total = 0
        total += await coordinator.images.estimatedDiskBytes()
        total += await coordinator.thumbnails.estimatedDiskBytes()
        total += await coordinator.video.estimatedDiskBytes()
        total += await coordinator.audio.estimatedDiskBytes()
        return total
    }

    // MARK: - Attribution

    /// Reconstruit la carte « domaine → URLs » depuis les payloads en cache.
    private func attributions() async -> [CacheDomain: CacheMediaIndex] {
        var indices: [CacheDomain: CacheMediaIndex] = [:]

        let posts = await coordinator.feed.allCachedValues()
        let feedIndices = CacheMediaAttribution.index(feedPosts: posts)
        indices[.posts] = feedIndices[.posts] ?? CacheMediaIndex()
        indices[.reels] = feedIndices[.reels] ?? CacheMediaIndex()

        let storyGroups = await coordinator.stories.allCachedValues()
        indices[.stories] = CacheMediaAttribution.index(storyGroups: storyGroups)

        let messages = await coordinator.messages.allCachedValues()
        indices[.conversations] = CacheMediaAttribution.index(messages: messages)

        return indices
    }

    // MARK: - Purge

    /// Exécute la purge des cases sélectionnées et retourne les octets libérés.
    ///
    /// Les cases non purgeables présentes dans la sélection sont ignorées —
    /// l'UI les grise, mais l'appelant n'a pas à en dépendre.
    ///
    /// Attention à un effet de bord INHÉRENT au cache : les fichiers sont
    /// indexés par URL. Si la même URL est référencée par deux domaines (une
    /// story republiée en post, par exemple), purger l'un retire le fichier
    /// pour l'autre. Le cache ne stocke pas de compteur de références, donc
    /// rien ne permet de l'éviter ; le média sera simplement re-téléchargé à
    /// la demande, ce qui est le comportement attendu d'une purge.
    @discardableResult
    public func purge(_ selection: Set<CachePurgeCellID>) async -> Int {
        guard !selection.isEmpty else { return 0 }
        let indices = await attributions()
        var freed = 0

        for cell in selection {
            switch cell.kind {
            case .documents, .reactions:
                continue

            case .messages:
                guard cell.domain == .conversations else { continue }
                freed += await coordinator.messages.l2ByteSize()
                await coordinator.messages.invalidateAll()

            case .payloads:
                switch cell.domain {
                case .posts:
                    freed += await coordinator.feed.l2ByteSize()
                    await coordinator.feed.invalidateAll()
                case .reels:
                    continue
                case .conversations:
                    freed += await coordinator.conversations.l2ByteSize()
                    await coordinator.conversations.invalidateAll()
                case .stories:
                    freed += await coordinator.stories.l2ByteSize()
                    await coordinator.stories.invalidateAll()
                }

            case .images, .videos, .audio:
                guard let mediaKind = Self.mediaKind(for: cell.kind) else { continue }
                let urls = (indices[cell.domain] ?? CacheMediaIndex()).urls(for: mediaKind)
                freed += await purgeDisk(mediaKind: mediaKind, urls: urls)
            }
        }

        logger.info("Purge sélective : \(selection.count) case(s), \(freed) octets libérés")
        return freed
    }

    private func purgeDisk(mediaKind: CacheMediaKind, urls: Set<String>) async -> Int {
        guard !urls.isEmpty else { return 0 }
        switch mediaKind {
        case .videos:
            return await coordinator.video.purge(urls: urls)
        case .audio:
            return await coordinator.audio.purge(urls: urls)
        case .images:
            let images = await coordinator.images.purge(urls: urls)
            let thumbs = await coordinator.thumbnails.purge(urls: urls)
            return images + thumbs
        }
    }

    /// Purge le résidu non attribuable (fichiers dont l'entité porteuse a
    /// quitté le cache GRDB).
    @discardableResult
    public func purgeUnattributed() async -> Int {
        let indices = await attributions()
        let all = indices.values.reduce(into: CacheMediaIndex()) { $0.formUnion($1) }
        var freed = 0
        freed += await coordinator.images.purgeUnattributed(excluding: all.images)
        freed += await coordinator.thumbnails.purgeUnattributed(excluding: all.images)
        freed += await coordinator.video.purgeUnattributed(excluding: all.videos)
        freed += await coordinator.audio.purgeUnattributed(excluding: all.audio)
        return freed
    }
}
