import Foundation

// MARK: - La présence d'un pack sur l'appareil (#10148, § 5.10.6)
//
// MIROIR de `packages/shared/types/pack-presence.ts` et de la machine
// `apps/web/src/lib/packs/presence.ts` : une machine PURE, sans horloge, sans
// réseau, sans disque. Elle rend l'état suivant et les effets ORDONNÉS que la
// file de téléchargement exécute (arrêter, supprimer, élaguer). Les vecteurs
// `packages/shared/design/packs/presence-vectors.json` sont rejoués par
// `PackPresenceVectorTests` (le même fichier, lu, jamais copié).

public enum PackQueueReason: String, CaseIterable, Codable, Sendable, Hashable {
    /// Attend le réseau ou son tour dans la file.
    case network
    /// Attend un réseau non restreint (données réduites, cellulaire).
    case wifi
    /// Attend un geste « Télécharger » (après une annulation).
    case user
}

public enum PackFailureCause: String, CaseIterable, Codable, Sendable, Hashable {
    case integrity
    case network
    case space
}

public enum PackRetryAt: String, CaseIterable, Codable, Sendable, Hashable {
    /// Intégrité fausse : jamais en boucle, la session suivante seulement.
    case nextSession = "next-session"
    /// Coupure réseau : au retour du réseau.
    case backoff
    /// Plus de place : quand la place est libérée.
    case spaceFreed = "space-freed"
}

public enum PackPresence: Sendable, Hashable {
    case absent
    case queued(PackQueueReason)
    case downloading(doneBytes: Int, totalBytes: Int)
    case ready(version: Int)
    case stale(version: Int, next: Int)
    case failed(PackFailureCause, retryAt: PackRetryAt)

    /// Un cadre de ce pack peut-il se peindre ? Sinon, la carte simple.
    public var isPaintable: Bool {
        switch self {
        case .ready, .stale: true
        case .absent, .queued, .downloading, .failed: false
        }
    }
}

public enum PackNetwork: String, CaseIterable, Codable, Sendable, Hashable {
    case unrestricted
    /// Données réduites, mode économie, cellulaire.
    case constrained
    case offline
}

public enum PackRemovalOrigin: String, CaseIterable, Codable, Sendable, Hashable {
    case local
    /// Reçu d'un autre appareil (`pack:installation-updated`).
    case remote
}

public enum PackPresenceEvent: Sendable, Hashable {
    /// La préférence d'installation est posée.
    case install
    /// La file donne son tour au pack.
    case start(totalBytes: Int)
    /// Le geste manuel « Télécharger maintenant ».
    case download(totalBytes: Int)
    case progress(doneBytes: Int)
    /// Le dernier fichier est vérifié.
    case complete(version: Int)
    case integrityError
    case networkError
    case noSpace
    /// Le geste « Annuler » de la rangée.
    case cancel
    case spaceFreed
    case sessionStart
    case retry
    case remove(PackRemovalOrigin)
    /// Le déroulé photo ou la reprise qui tenait le pack s'est fermé.
    case leaseReleased
    /// Le registre sert une version du pack.
    case versionServed(Int)
}

/// Ce que la file exécute, dans l'ordre rendu.
public enum PackPresenceEffect: String, CaseIterable, Codable, Sendable, Hashable {
    case abort
    case deleteFile = "delete-file"
    case discardPartial = "discard-partial"
    case prune
    case pruneDeferred = "prune-deferred"
    case prunePrevious = "prune-previous"
    case prunePreviousDeferred = "prune-previous-deferred"
}

public struct PackPresenceContext: Sendable, Hashable, Codable {
    public let network: PackNetwork
    /// Un déroulé photo ou une reprise OUVERTS tiennent le pack : aucun élagage immédiat.
    public let lease: Bool
    /// Pack embarqué non retirable (l'Afrique éternelle sur iOS).
    public let embedded: Bool

    public init(network: PackNetwork, lease: Bool = false, embedded: Bool = false) {
        self.network = network
        self.lease = lease
        self.embedded = embedded
    }
}

public struct PackPresenceTransition: Sendable, Hashable {
    public let presence: PackPresence
    public let effects: [PackPresenceEffect]

    public init(_ presence: PackPresence, _ effects: [PackPresenceEffect] = []) {
        self.presence = presence
        self.effects = effects
    }
}

public enum PackPresenceMachine {

    public static func transition(
        _ presence: PackPresence,
        on event: PackPresenceEvent,
        in context: PackPresenceContext
    ) -> PackPresenceTransition {
        let unchanged = PackPresenceTransition(presence)
        switch event {
        case .install:
            return presence == .absent ? PackPresenceTransition(.queued(waiting(context.network))) : unchanged
        case .start(let totalBytes):
            return start(presence, totalBytes: totalBytes, context: context)
        case .download(let totalBytes):
            return download(presence, totalBytes: totalBytes, context: context)
        case .progress(let doneBytes):
            guard case .downloading(_, let totalBytes) = presence else { return unchanged }
            return PackPresenceTransition(.downloading(doneBytes: min(max(doneBytes, 0), totalBytes), totalBytes: totalBytes))
        case .complete(let version):
            return complete(presence, version: version, context: context)
        case .integrityError:
            return failure(presence, cause: .integrity, retryAt: .nextSession, effects: [.deleteFile])
        case .networkError:
            return failure(presence, cause: .network, retryAt: .backoff, effects: [])
        case .noSpace:
            return failure(presence, cause: .space, retryAt: .spaceFreed, effects: [.discardPartial])
        case .cancel:
            guard case .downloading = presence else { return unchanged }
            return PackPresenceTransition(.queued(.user), [.abort, .discardPartial])
        case .spaceFreed:
            return requeue(presence, when: .space, context: context)
        case .sessionStart:
            return requeue(presence, when: .integrity, context: context)
        case .retry:
            return context.network == .offline ? unchanged : requeue(presence, when: .network, context: context)
        case .remove:
            return remove(presence, context: context)
        case .leaseReleased:
            return presence == .absent ? PackPresenceTransition(.absent, [.prune]) : unchanged
        case .versionServed(let served):
            return versionServed(presence, served: served)
        }
    }

    private static func waiting(_ network: PackNetwork) -> PackQueueReason {
        network == .constrained ? .wifi : .network
    }

    /// La file ne démarre rien hors ligne, ni sur réseau restreint sans geste, ni après une annulation.
    private static func start(_ presence: PackPresence, totalBytes: Int, context: PackPresenceContext) -> PackPresenceTransition {
        guard case .queued(let reason) = presence, reason != .user else { return PackPresenceTransition(presence) }
        switch context.network {
        case .offline: return PackPresenceTransition(presence)
        case .constrained: return PackPresenceTransition(.queued(.wifi))
        case .unrestricted: return PackPresenceTransition(.downloading(doneBytes: 0, totalBytes: totalBytes))
        }
    }

    /// Le geste manuel passe outre les données réduites et une annulation ; hors ligne, il attend le réseau.
    private static func download(_ presence: PackPresence, totalBytes: Int, context: PackPresenceContext) -> PackPresenceTransition {
        switch presence {
        case .absent, .queued, .failed:
            return context.network == .offline
                ? PackPresenceTransition(.queued(.network))
                : PackPresenceTransition(.downloading(doneBytes: 0, totalBytes: totalBytes))
        case .downloading, .ready, .stale:
            return PackPresenceTransition(presence)
        }
    }

    private static func complete(_ presence: PackPresence, version: Int, context: PackPresenceContext) -> PackPresenceTransition {
        switch presence {
        case .downloading:
            return PackPresenceTransition(.ready(version: version))
        case .stale:
            if context.embedded { return PackPresenceTransition(.ready(version: version)) }
            return PackPresenceTransition(.ready(version: version), [context.lease ? .prunePreviousDeferred : .prunePrevious])
        case .absent, .queued, .ready, .failed:
            return PackPresenceTransition(presence)
        }
    }

    /// Un échec pendant une mise à jour garde la version prête, toujours peinte.
    private static func failure(
        _ presence: PackPresence,
        cause: PackFailureCause,
        retryAt: PackRetryAt,
        effects: [PackPresenceEffect]
    ) -> PackPresenceTransition {
        switch presence {
        case .downloading:
            return PackPresenceTransition(.failed(cause, retryAt: retryAt), effects)
        case .stale:
            return PackPresenceTransition(presence, effects)
        case .absent, .queued, .ready, .failed:
            return PackPresenceTransition(presence)
        }
    }

    private static func requeue(_ presence: PackPresence, when cause: PackFailureCause, context: PackPresenceContext) -> PackPresenceTransition {
        guard case .failed(let failedCause, _) = presence, failedCause == cause else { return PackPresenceTransition(presence) }
        return PackPresenceTransition(.queued(waiting(context.network)))
    }

    /// Un pack embarqué ne se retire pas ; sous bail, l'élagage attend la fin du déroulé.
    private static func remove(_ presence: PackPresence, context: PackPresenceContext) -> PackPresenceTransition {
        if context.embedded || presence == .absent { return PackPresenceTransition(presence) }
        let prune: PackPresenceEffect = context.lease ? .pruneDeferred : .prune
        if case .downloading = presence {
            return PackPresenceTransition(.absent, [.abort, .discardPartial, prune])
        }
        return PackPresenceTransition(.absent, [prune])
    }

    private static func versionServed(_ presence: PackPresence, served: Int) -> PackPresenceTransition {
        switch presence {
        case .ready(let version) where served > version:
            return PackPresenceTransition(.stale(version: version, next: served))
        case .stale(let version, let next) where served > next:
            return PackPresenceTransition(.stale(version: version, next: served))
        default:
            return PackPresenceTransition(presence)
        }
    }
}

// MARK: - Codable : la forme du fil, fail-closed (`PackPresenceSchema`)

public enum PackPresenceDecodingError: Error, Equatable {
    case negativeBytes
    case progressBeyondTotal
    case versionBelowOne
    case nextNotAboveVersion
}

private enum PackPresenceCodingKeys: String, CodingKey {
    case state, reason, doneBytes, totalBytes, version, next, cause, retryAt
}

extension PackPresence: Codable {

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: PackPresenceCodingKeys.self)
        let state = try container.decode(String.self, forKey: .state)
        switch state {
        case "absent":
            self = .absent
        case "queued":
            self = .queued(try container.decode(PackQueueReason.self, forKey: .reason))
        case "downloading":
            let done = try container.decode(Int.self, forKey: .doneBytes)
            let total = try container.decode(Int.self, forKey: .totalBytes)
            guard done >= 0, total >= 0 else { throw PackPresenceDecodingError.negativeBytes }
            guard done <= total else { throw PackPresenceDecodingError.progressBeyondTotal }
            self = .downloading(doneBytes: done, totalBytes: total)
        case "ready":
            let version = try container.decode(Int.self, forKey: .version)
            guard version >= 1 else { throw PackPresenceDecodingError.versionBelowOne }
            self = .ready(version: version)
        case "stale":
            let version = try container.decode(Int.self, forKey: .version)
            let next = try container.decode(Int.self, forKey: .next)
            guard version >= 1, next >= 1 else { throw PackPresenceDecodingError.versionBelowOne }
            guard next > version else { throw PackPresenceDecodingError.nextNotAboveVersion }
            self = .stale(version: version, next: next)
        case "failed":
            self = .failed(
                try container.decode(PackFailureCause.self, forKey: .cause),
                retryAt: try container.decode(PackRetryAt.self, forKey: .retryAt)
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .state, in: container, debugDescription: "présence inconnue : \(state)")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: PackPresenceCodingKeys.self)
        switch self {
        case .absent:
            try container.encode("absent", forKey: .state)
        case .queued(let reason):
            try container.encode("queued", forKey: .state)
            try container.encode(reason, forKey: .reason)
        case .downloading(let done, let total):
            try container.encode("downloading", forKey: .state)
            try container.encode(done, forKey: .doneBytes)
            try container.encode(total, forKey: .totalBytes)
        case .ready(let version):
            try container.encode("ready", forKey: .state)
            try container.encode(version, forKey: .version)
        case .stale(let version, let next):
            try container.encode("stale", forKey: .state)
            try container.encode(version, forKey: .version)
            try container.encode(next, forKey: .next)
        case .failed(let cause, let retryAt):
            try container.encode("failed", forKey: .state)
            try container.encode(cause, forKey: .cause)
            try container.encode(retryAt, forKey: .retryAt)
        }
    }
}

private enum PackPresenceEventCodingKeys: String, CodingKey {
    case type, totalBytes, doneBytes, version, origin
}

extension PackPresenceEvent: Decodable {

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: PackPresenceEventCodingKeys.self)
        let type = try container.decode(String.self, forKey: .type)
        switch type {
        case "install": self = .install
        case "start": self = .start(totalBytes: try container.decode(Int.self, forKey: .totalBytes))
        case "download": self = .download(totalBytes: try container.decode(Int.self, forKey: .totalBytes))
        case "progress": self = .progress(doneBytes: try container.decode(Int.self, forKey: .doneBytes))
        case "complete": self = .complete(version: try container.decode(Int.self, forKey: .version))
        case "integrity-error": self = .integrityError
        case "network-error": self = .networkError
        case "no-space": self = .noSpace
        case "cancel": self = .cancel
        case "space-freed": self = .spaceFreed
        case "session-start": self = .sessionStart
        case "retry": self = .retry
        case "remove": self = .remove(try container.decode(PackRemovalOrigin.self, forKey: .origin))
        case "lease-released": self = .leaseReleased
        case "version-served": self = .versionServed(try container.decode(Int.self, forKey: .version))
        default:
            throw DecodingError.dataCorruptedError(forKey: .type, in: container, debugDescription: "événement inconnu : \(type)")
        }
    }
}
