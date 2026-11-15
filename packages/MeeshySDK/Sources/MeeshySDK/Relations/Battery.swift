import Foundation

// LA BATTERIE DES PROCHES ET DES SANGS (#14147) — la lecture Swift du contrat `packages/shared/types/battery.ts` et
// `battery-constants.ts`. Spec : la conception de la batterie des proches (#14147).
//
// JAMAIS un message de conversation. Le serveur fait avancer l'épisode (`batteryEpisodeStep`) et décide du canal de
// chaque lecteur : ce fichier ne porte que ce qui voyage. Les charges DESCENDANTES tolèrent un champ inconnu et une
// annonce d'un genre inconnu (un client plus ancien que le serveur ne casse pas) ; la charge MONTANTE est bornée ici,
// avant l'envoi, parce que le schéma serveur est strict.

public enum BatteryContract {
    /// `BATTERY_DEVICE_LABEL_MAX`.
    public static let deviceLabelMax = 60
    /// `BATTERY_CONFIG.lowThreshold` : au-dessus, un épisode ne s'ouvre pas.
    public static let lowThreshold = 30
    /// `BATTERY_CONFIG.criticalThreshold`.
    public static let criticalThreshold = 5
    /// `BATTERY_CONFIG.stateTtlSeconds` : aucun état ne vit plus longtemps, aucun historique.
    public static let stateTtl: TimeInterval = 86_400
    /// `BATTERY_CONFIG.pullCooldownMinutes`.
    public static let pullCooldown: TimeInterval = 300
    /// `BATTERY_NOTIFICATION_TYPE`.
    public static let notificationType = "device_battery"
    /// `BATTERY_PULL_PUSH_TYPE` : le `data.type` du push SILENCIEUX qui demande un relevé.
    public static let pullPushType = "battery_pull"
}

/// `BATTERY_SERVED_PHASES` — hors épisode (`normal`), rien n'est servi.
public enum BatteryServedPhase: String, Sendable, Equatable, CaseIterable {
    case low
    case critical
    case off
    case charging
}

/// `BATTERY_ANNOUNCEMENT_KINDS`.
public enum BatteryAnnouncementKind: String, Sendable, Equatable, CaseIterable {
    case low
    case threshold
    case critical
    case criticalDrop = "critical-drop"
    case probablyOff = "probably-off"
    case charging
    case backOn = "back-on"
    case recharged
    case ended
}

/// `BATTERY_RECEIVE_MODES` — ce qu'un LECTEUR veut recevoir de la batterie d'une personne.
public enum BatteryReceiveMode: String, Sendable, Equatable, CaseIterable, Codable {
    /// Le canal que le contexte décide (défaut).
    case all
    /// Seul le critique interrompt par push ; le reste devient SyncPill.
    case critical
    /// Jamais de push : la SyncPill seulement, app ouverte.
    case pill
    /// Rien : ni annonce, ni état.
    case none

    /// `BATTERY_DEFAULT_RECEIVE_MODE`.
    public static let defaultMode: BatteryReceiveMode = .all
}

/// `BatteryAnnouncement` — ce qui fait défiler la SyncPill, jamais un message.
public struct BatteryAnnouncement: Sendable, Equatable {
    public let kind: BatteryAnnouncementKind
    /// Le niveau au moment de l'annonce ; `nil` quand aucun relevé n'est connu.
    public let level: Int?
    /// Pour `threshold` seulement : le palier franchi.
    public let threshold: Int?
    public let at: Date

    public init(kind: BatteryAnnouncementKind, level: Int?, threshold: Int? = nil, at: Date) {
        self.kind = kind
        self.level = level.map(BatteryPercent.clamped)
        self.threshold = kind == .threshold ? threshold.map(BatteryPercent.clamped) : nil
        self.at = at
    }
}

extension BatteryAnnouncement: Decodable {
    private enum CodingKeys: String, CodingKey { case kind, level, threshold, at }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        guard let kind = BatteryAnnouncementKind(rawValue: try c.decode(String.self, forKey: .kind)) else {
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "annonce inconnue")
        }
        guard let at = WireDate.date(from: try c.decode(String.self, forKey: .at)) else {
            throw DecodingError.dataCorruptedError(forKey: .at, in: c, debugDescription: "instant illisible")
        }
        let level = (try? c.decodeIfPresent(Int.self, forKey: .level)) ?? nil
        let threshold = (try? c.decodeIfPresent(Int.self, forKey: .threshold)) ?? nil
        self.init(kind: kind, level: level, threshold: threshold, at: at)
    }
}

/// `BatteryReaderState` — l'état servi À MOI pendant un épisode.
public struct BatteryReaderState: Sendable, Equatable, Codable {
    public let userId: String
    public let phase: BatteryServedPhase
    public let level: Int
    public let charging: Bool
    public let lowPower: Bool
    /// Calculé par le serveur ; absent quand il ne l'est pas — jamais estimé ici.
    public let estimatedMinutes: Int?
    public let measuredAt: Date
    public let deviceLabel: String?

    public init(userId: String, phase: BatteryServedPhase, level: Int, charging: Bool, lowPower: Bool,
                estimatedMinutes: Int? = nil, measuredAt: Date, deviceLabel: String? = nil) {
        self.userId = userId
        self.phase = phase
        self.level = BatteryPercent.clamped(level)
        self.charging = charging
        self.lowPower = lowPower
        self.estimatedMinutes = estimatedMinutes.map { max(0, $0) }
        self.measuredAt = measuredAt
        self.deviceLabel = BatteryText.bounded(deviceLabel)
    }

    /// L'état ne survit jamais au TTL du contrat : un cache plus vieux ne s'affiche pas.
    public func isExpired(at now: Date) -> Bool {
        now.timeIntervalSince(measuredAt) > BatteryContract.stateTtl
    }

    private enum CodingKeys: String, CodingKey {
        case userId, phase, level, charging, lowPower, estimatedMinutes, measuredAt, deviceLabel
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        guard let phase = BatteryServedPhase(rawValue: try c.decode(String.self, forKey: .phase)) else {
            throw DecodingError.dataCorruptedError(forKey: .phase, in: c, debugDescription: "phase non servie")
        }
        guard let measuredAt = WireDate.date(from: try c.decode(String.self, forKey: .measuredAt)) else {
            throw DecodingError.dataCorruptedError(forKey: .measuredAt, in: c, debugDescription: "instant illisible")
        }
        self.init(
            userId: userId,
            phase: phase,
            level: try c.decode(Int.self, forKey: .level),
            charging: try c.decode(Bool.self, forKey: .charging),
            lowPower: try c.decode(Bool.self, forKey: .lowPower),
            estimatedMinutes: (try? c.decodeIfPresent(Int.self, forKey: .estimatedMinutes)) ?? nil,
            measuredAt: measuredAt,
            deviceLabel: (try? c.decodeIfPresent(String.self, forKey: .deviceLabel)) ?? nil
        )
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(userId, forKey: .userId)
        try c.encode(phase.rawValue, forKey: .phase)
        try c.encode(level, forKey: .level)
        try c.encode(charging, forKey: .charging)
        try c.encode(lowPower, forKey: .lowPower)
        try c.encodeIfPresent(estimatedMinutes, forKey: .estimatedMinutes)
        try c.encode(WireDate.string(from: measuredAt), forKey: .measuredAt)
        try c.encodeIfPresent(deviceLabel, forKey: .deviceLabel)
    }
}

/// `battery:changed` — l'état servi, et l'annonce quand le canal du lecteur est la SyncPill.
public struct BatteryChanged: Decodable, Sendable, Equatable {
    public let userId: String
    public let state: BatteryReaderState
    public let announcement: BatteryAnnouncement?

    public init(userId: String, state: BatteryReaderState, announcement: BatteryAnnouncement? = nil) {
        self.userId = userId
        self.state = state
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, state, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let state = try c.decode(BatteryReaderState.self, forKey: .state)
        let userId = (try? c.decode(String.self, forKey: .userId)) ?? state.userId
        guard userId == state.userId else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "état d'une autre personne")
        }
        self.init(userId: userId, state: state,
                  announcement: (try? c.decodeIfPresent(BatteryAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `battery:cleared` — l'épisode est clos, ou ne m'est plus servi : l'icône disparaît.
public struct BatteryCleared: Decodable, Sendable, Equatable {
    public let userId: String
    public let announcement: BatteryAnnouncement?

    public init(userId: String, announcement: BatteryAnnouncement? = nil) {
        self.userId = userId
        self.announcement = announcement
    }

    private enum CodingKeys: String, CodingKey { case userId, announcement }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let userId = try c.decode(String.self, forKey: .userId).trimmingCharacters(in: .whitespacesAndNewlines)
        guard !userId.isEmpty else {
            throw DecodingError.dataCorruptedError(forKey: .userId, in: c, debugDescription: "userId vide")
        }
        self.init(userId: userId,
                  announcement: (try? c.decodeIfPresent(BatteryAnnouncement.self, forKey: .announcement)) ?? nil)
    }
}

/// `battery:pull-requested` — à MON téléphone : relever maintenant. Qui l'a demandé n'est pas dit.
public struct BatteryPullRequested: Decodable, Sendable, Equatable {
    public let requestedAt: Date

    public init(requestedAt: Date) {
        self.requestedAt = requestedAt
    }

    private enum CodingKeys: String, CodingKey { case requestedAt }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let raw = (try? c.decodeIfPresent(String.self, forKey: .requestedAt)) ?? nil
        self.init(requestedAt: raw.flatMap(WireDate.date(from:)) ?? Date())
    }
}

/// `GET /relations/battery` — les épisodes servis à moi. Un élément illisible est écarté.
public struct BatterySnapshot: Decodable, Sendable, Equatable {
    public let items: [BatteryReaderState]

    public init(items: [BatteryReaderState]) {
        self.items = items
    }

    private enum CodingKeys: String, CodingKey { case items }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let lenient = (try? c.decodeIfPresent([Lenient].self, forKey: .items)) ?? nil
        items = (lenient ?? []).compactMap(\.value)
    }

    private struct Lenient: Decodable {
        let value: BatteryReaderState?

        init(from decoder: Decoder) throws {
            value = try? BatteryReaderState(from: decoder)
        }
    }
}

/// `GET /relations/:userId/battery` — `state` est nul hors épisode ou quand rien n'est partagé.
public struct BatteryStateEnvelope: Decodable, Sendable, Equatable {
    public let state: BatteryReaderState?

    private enum CodingKeys: String, CodingKey { case state }

    public init(state: BatteryReaderState?) {
        self.state = state
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        state = (try? c.decodeIfPresent(BatteryReaderState.self, forKey: .state)) ?? nil
    }
}

/// `BatteryReport` — MON relevé, borné comme le serveur le borne (schéma strict : un champ en trop est refusé).
public struct BatteryReport: Sendable, Equatable {
    public let level: Int
    public let charging: Bool
    public let lowPower: Bool
    public let measuredAt: Date
    public let deviceLabel: String?

    public init(level: Int, charging: Bool, lowPower: Bool, measuredAt: Date, deviceLabel: String? = nil) {
        self.level = BatteryPercent.clamped(level)
        self.charging = charging
        self.lowPower = lowPower
        self.measuredAt = measuredAt
        self.deviceLabel = BatteryText.clipped(deviceLabel)
    }

    /// La charge de la socket et du corps REST : les clés absentes n'existent pas.
    public var wirePayload: [String: Any] {
        var payload: [String: Any] = [
            "level": level,
            "charging": charging,
            "lowPower": lowPower,
            "measuredAt": WireDate.string(from: measuredAt),
        ]
        if let deviceLabel { payload["deviceLabel"] = deviceLabel }
        return payload
    }
}

extension BatteryReport: Encodable {
    private enum CodingKeys: String, CodingKey { case level, charging, lowPower, measuredAt, deviceLabel }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(level, forKey: .level)
        try c.encode(charging, forKey: .charging)
        try c.encode(lowPower, forKey: .lowPower)
        try c.encode(WireDate.string(from: measuredAt), forKey: .measuredAt)
        try c.encodeIfPresent(deviceLabel, forKey: .deviceLabel)
    }
}

/// Ce que la passerelle a répondu à un relevé. Un relevé refusé n'est jamais rejoué tel quel : la cadence en
/// produira un autre au prochain changement.
public enum BatteryReportOutcome: Sendable, Equatable {
    /// `tracked: true` — ce téléphone est celui qui est suivi.
    case tracked
    /// `tracked: false` — un autre appareil est suivi, ou le partage est coupé pour tous : rien n'est rangé.
    case ignored
    case rateLimited
    case refused
    case offline
    /// L'appareil ne sait pas lire sa batterie (tablette, simulateur, niveau inconnu) : rien n'est envoyé.
    case unavailable
}

/// L'accusé du relevé à la demande : le relevé ne revient que s'il ouvre ou poursuit un épisode (`episodeOnly`).
public enum BatteryPullOutcome: Sendable, Equatable {
    case requested(at: Date)
    /// `BATTERY_PULL_TOO_SOON` : déjà demandé il y a moins de 5 minutes pour cette paire.
    case tooSoon
    /// `BATTERY_PULL_FORBIDDEN` : sous Sang, bloqué, ou soi.
    case forbidden
    case rateLimited
    case failed
}

/// `BATTERY_ERROR_CODES`.
public enum BatteryErrorCode {
    public static let invalid = "BATTERY_INVALID"
    public static let rateLimited = "BATTERY_RATE_LIMITED"
    public static let unavailable = "BATTERY_UNAVAILABLE"
    public static let pullForbidden = "BATTERY_PULL_FORBIDDEN"
    public static let pullTooSoon = "BATTERY_PULL_TOO_SOON"
}

/// `BatteryEmitterSettings` — partager ma batterie, pour tous (vrai par défaut).
public struct BatteryEmitterSettings: Codable, Sendable, Equatable {
    public let sharingEnabled: Bool

    public init(sharingEnabled: Bool) {
        self.sharingEnabled = sharingEnabled
    }
}

/// `BatteryPersonSettings` — `isShared` (clé `shared`) : l'autre reçoit-il MA batterie, selon la loi maintenant ; `receive` : ce que
/// je reçois de LA SIENNE.
public struct BatteryPersonSettings: Sendable, Equatable, Codable {
    public let userId: String
    public let isShared: Bool
    public let receive: BatteryReceiveMode

    public init(userId: String, isShared: Bool, receive: BatteryReceiveMode) {
        self.userId = userId
        self.isShared = isShared
        self.receive = receive
    }

    private enum CodingKeys: String, CodingKey {
        case userId, receive
        case isShared = "shared"
    }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        userId = try c.decode(String.self, forKey: .userId)
        isShared = (try? c.decodeIfPresent(Bool.self, forKey: .isShared)) ?? false
        let raw = (try? c.decodeIfPresent(String.self, forKey: .receive)) ?? nil
        receive = raw.flatMap(BatteryReceiveMode.init(rawValue:)) ?? .defaultMode
    }
}

/// `batteryPersonSettingsUpdateSchema` — au moins un des deux champs.
public struct BatteryPersonSettingsUpdate: Encodable, Sendable, Equatable {
    public let isShared: Bool?
    public let receive: BatteryReceiveMode?

    public init?(isShared: Bool? = nil, receive: BatteryReceiveMode? = nil) {
        guard isShared != nil || receive != nil else { return nil }
        self.isShared = isShared
        self.receive = receive
    }

    private enum CodingKeys: String, CodingKey {
        case receive
        case isShared = "shared"
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encodeIfPresent(isShared, forKey: .isShared)
        try c.encodeIfPresent(receive?.rawValue, forKey: .receive)
    }
}

enum BatteryPercent {
    static func clamped(_ value: Int) -> Int { min(100, max(0, value)) }
}

enum BatteryText {
    /// Une étiquette servie hors contrat (vide, trop longue) ne traverse pas jusqu'à l'écran.
    static func bounded(_ value: String?) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty,
              text.count <= BatteryContract.deviceLabelMax else { return nil }
        return text
    }

    /// Une étiquette envoyée est raccourcie plutôt que refusée.
    static func clipped(_ value: String?) -> String? {
        guard let text = value?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        let cut = String(text.prefix(BatteryContract.deviceLabelMax)).trimmingCharacters(in: .whitespacesAndNewlines)
        return cut.isEmpty ? nil : cut
    }
}
