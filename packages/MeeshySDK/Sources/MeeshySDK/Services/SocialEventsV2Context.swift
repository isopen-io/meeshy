import Foundation

// MARK: - Le contexte d'un lot v2, envoyé UNE fois par requête (#10500)
//
// Un serveur antérieur le retire en silence (`z.object` non strict). Jamais
// l'identifiant d'appareil, jamais le modèle exact : une classe d'appareil,
// la version MAJEURE.mineure de l'OS.

public struct SocialEventContext: Encodable, Sendable, Equatable {
    public enum Platform: String, Encodable, Sendable { case ios, web, androidShell = "android_shell", pwa }
    public enum DeviceClass: String, Encodable, Sendable { case phone, tablet, desktop }
    public enum Consent: String, Encodable, Sendable { case granted, denied, unknown }
    public enum Capability: String, Encodable, Sendable, CaseIterable {
        case screenshot
        case screenRecording = "screen_recording"
        case scroll
        case playbackQoE = "playback_qoe"
    }

    public struct OS: Encodable, Sendable, Equatable {
        public let name: String
        public let version: String

        /// MAJEURE.mineure seulement — le correctif affinerait l'empreinte.
        public init(name: String, version: String) {
            self.name = name
            self.version = version.split(separator: ".").prefix(2).joined(separator: ".")
        }
    }

    public struct Network: Encodable, Sendable, Equatable {
        public enum Kind: String, Encodable, Sendable { case wifi, cellular, ethernet, offline, unknown }
        public enum Subtype: String, Encodable, Sendable { case g2 = "2g", g3 = "3g", g4 = "4g", g5 = "5g" }

        public let type: Kind
        public let subtype: Subtype?

        public init(type: Kind, subtype: Subtype? = nil) {
            self.type = type
            self.subtype = type == .cellular ? subtype : nil
        }

        public init(snapshot: NetworkPathSnapshot) {
            let kind: Kind = !snapshot.isSatisfied ? .offline
                : snapshot.usesWiFi ? .wifi
                : snapshot.usesCellular ? .cellular
                : snapshot.usesWired ? .ethernet
                : .unknown
            self.init(type: kind)
        }
    }

    public let schemaVersion: Int
    public let sentAt: Date?
    public let appSessionId: String?
    public let platform: Platform
    public let appVersion: String?
    public let build: String?
    public let os: OS?
    public let deviceClass: DeviceClass?
    public let network: Network?
    public let uiLanguage: String?
    public let deviceLocale: String?
    public let consent: Consent?
    public let capabilities: [Capability]?
    public let sampling: [String: Double]?

    public init(
        sentAt: Date? = nil,
        appSessionId: String?,
        platform: Platform = .ios,
        appVersion: String? = nil,
        build: String? = nil,
        os: OS? = nil,
        deviceClass: DeviceClass? = nil,
        network: Network? = nil,
        uiLanguage: String? = nil,
        deviceLocale: String? = nil,
        consent: Consent? = nil,
        capabilities: [Capability]? = nil,
        sampling: [String: Double]? = nil
    ) {
        self.schemaVersion = 2
        self.sentAt = sentAt
        self.appSessionId = appSessionId
        self.platform = platform
        self.appVersion = appVersion.map { String($0.prefix(20)) }
        self.build = build.map { String($0.prefix(20)) }
        self.os = os
        self.deviceClass = deviceClass
        self.network = network
        self.uiLanguage = uiLanguage
        self.deviceLocale = deviceLocale
        self.consent = consent
        self.capabilities = capabilities
        self.sampling = sampling
    }

    /// L'heure de l'ENVOI, posée au moment où la requête part (correction
    /// d'horloge Snowplow côté passerelle).
    public func sent(at date: Date) -> SocialEventContext {
        SocialEventContext(sentAt: date, appSessionId: appSessionId, platform: platform, appVersion: appVersion,
                           build: build, os: os, deviceClass: deviceClass, network: network, uiLanguage: uiLanguage,
                           deviceLocale: deviceLocale, consent: consent, capabilities: capabilities, sampling: sampling)
    }

    /// Ce qui part RÉELLEMENT sous une identité donnée (revue de conformité
    /// O2, O4, R4) : un lecteur sans compte, ou un compte qui a REFUSÉ
    /// l'analyse, n'envoie ni identifiant de session, ni locale d'appareil, ni
    /// version fine — seulement la plateforme et la langue de l'interface.
    public func restricted(for credential: SocialEventsCredential) -> SocialEventContext {
        let reduced = credential != .account || consent == .denied
        guard reduced else { return self }
        return SocialEventContext(sentAt: sentAt, appSessionId: nil, platform: platform, appVersion: nil, build: nil,
                                  os: nil, deviceClass: nil, network: nil, uiLanguage: uiLanguage, deviceLocale: nil,
                                  consent: consent, capabilities: capabilities, sampling: sampling)
    }

    private enum CodingKeys: String, CodingKey {
        case schemaVersion, sentAt, appSessionId, platform, appVersion, build, os, deviceClass, network
        case uiLanguage, deviceLocale, consent, capabilities, sampling
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(schemaVersion, forKey: .schemaVersion)
        try c.encodeIfPresent(sentAt.map(SocialEventsV2Wire.isoString), forKey: .sentAt)
        try c.encodeIfPresent(appSessionId, forKey: .appSessionId)
        try c.encode(platform, forKey: .platform)
        try c.encodeIfPresent(appVersion, forKey: .appVersion)
        try c.encodeIfPresent(build, forKey: .build)
        try c.encodeIfPresent(os, forKey: .os)
        try c.encodeIfPresent(deviceClass, forKey: .deviceClass)
        try c.encodeIfPresent(network, forKey: .network)
        try c.encodeIfPresent(uiLanguage, forKey: .uiLanguage)
        try c.encodeIfPresent(deviceLocale, forKey: .deviceLocale)
        try c.encodeIfPresent(consent, forKey: .consent)
        try c.encodeIfPresent(capabilities, forKey: .capabilities)
        try c.encodeIfPresent(sampling, forKey: .sampling)
    }
}

// MARK: - La session d'application

/// Une session d'application : nouvelle au démarrage à froid et après 30 min
/// d'inactivité (règle Segment / Firebase). Jamais l'identifiant d'appareil,
/// jamais persistée : un démarrage à froid repart de zéro.
public struct AppSessionClock: Sendable, Equatable {
    public static let inactivityTimeout: TimeInterval = 30 * 60

    public private(set) var sessionId: String?
    private var lastActivity: Date?

    public init() {}

    /// L'identifiant de la session à `now`, renouvelé si la précédente a expiré.
    public mutating func touch(at now: Date, newId: () -> String = { UUID().uuidString.lowercased() }) -> String {
        if let id = sessionId, let last = lastActivity, now.timeIntervalSince(last) < Self.inactivityTimeout {
            lastActivity = now
            return id
        }
        let id = newId()
        sessionId = id
        lastActivity = now
        return id
    }
}

// MARK: - L'échantillonnage

/// Le tirage au sort d'une session : UNE fois par `appSessionId` et par type,
/// stable (même session, même verdict), sans aléa à stocker.
public enum SocialEventsSampling {
    public static func keeps(type: String, rate: Double, appSessionId: String) -> Bool {
        guard rate < 1 else { return true }
        guard rate > 0 else { return false }
        let seed = (appSessionId + "|" + type).utf8.reduce(UInt64(14_695_981_039_346_656_037)) { hash, byte in
            (hash ^ UInt64(byte)) &* 1_099_511_628_211
        }
        return Double(seed % 10_000) / 10_000 < rate
    }
}
