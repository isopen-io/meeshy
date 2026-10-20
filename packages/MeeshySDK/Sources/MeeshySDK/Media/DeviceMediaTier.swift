import Foundation

/// **LE TIER MÉDIA D'UN APPAREIL (#11281)** — PURE. Chaque iPhone et chaque iPad
/// est rangé en bas / moyen / haut / pro, depuis ce qu'il DÉCLARE, et toutes les
/// lois de lecture lisent ce rang au lieu de réinventer chacune son seuil de
/// mémoire.
///
/// Jumelle de `apps/web/src/lib/device/capability-tier.ts` (lot W11) : mêmes
/// paliers, mêmes seuils, mêmes vecteurs (`DeviceMediaTierTests`).
///
/// Le tier est ASYMÉTRIQUE par construction : `high` est le comportement
/// historique de toutes les lois, `pro` ne le dépasse que là où c'est gratuit,
/// et seuls `low` et `mid` BAISSENT un plafond. Un appareil que la loi ne sait
/// pas ranger ne perd donc rien qu'il avait déjà.
///
/// Ce qui est lu, et pourquoi :
/// - **la famille de puce** (`AppleChip`, depuis `utsname.machine`) — la
///   puissance de calcul, que ni la mémoire ni l'écran ne disent ;
/// - **la mémoire physique** — ce que `ProcessInfo` RAPPORTE (un « 4 Go » rend
///   ~3,7 Gio), d'où des seuils à 2,5 / 3,5 / 5,5 Gio et non 3 / 4 / 6 ;
/// - **la cadence maximale de l'écran** — 120 Hz est ProMotion ;
/// - **le décodage matériel HEVC et AV1** — AV1 matériel n'existe que depuis
///   l'A17 Pro et le M3 : c'est une mesure de la puce quand l'identifiant manque.
///
/// La sonde de l'appareil vivant est `DeviceMediaTier+Live.swift` ; ce fichier
/// n'ouvre ni `utsname`, ni `UIScreen`, ni VideoToolbox.
public enum DeviceMediaTier: Int, Sendable, Comparable, CaseIterable {
    case low, mid, high, pro

    public static func < (lhs: DeviceMediaTier, rhs: DeviceMediaTier) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    static let midMemoryGb: Double = 2.5
    static let highMemoryGb: Double = 3.5
    static let proMemoryGb: Double = 5.5
    static let highChipClass = 5
    static let proChipClass = 7
    static let proFramesPerSecond = 120

    public static func classify(_ signals: DeviceMediaSignals) -> DeviceMediaTier {
        let memory = ReelPreloadWindow.gigabytes(physicalMemory: signals.physicalMemory)
        let chipClass = signals.chipClass
        guard signals.hardwareDecodesHEVC, memory >= midMemoryGb else { return .low }
        if chipClass >= proChipClass, signals.hardwareDecodesAV1, memory >= proMemoryGb,
           signals.maximumFramesPerSecond >= proFramesPerSecond {
            return .pro
        }
        if chipClass >= highChipClass, memory >= highMemoryGb { return .high }
        return .mid
    }
}

/// Ce qu'un appareil déclare de lui-même — l'ENTRÉE de la loi.
public struct DeviceMediaSignals: Sendable, Equatable {
    public let machine: String
    public let physicalMemory: UInt64
    public let maximumFramesPerSecond: Int
    public let hardwareDecodesHEVC: Bool
    public let hardwareDecodesAV1: Bool

    public init(
        machine: String,
        physicalMemory: UInt64,
        maximumFramesPerSecond: Int,
        hardwareDecodesHEVC: Bool,
        hardwareDecodesAV1: Bool
    ) {
        self.machine = machine
        self.physicalMemory = physicalMemory
        self.maximumFramesPerSecond = maximumFramesPerSecond
        self.hardwareDecodesHEVC = hardwareDecodesHEVC
        self.hardwareDecodesAV1 = hardwareDecodesAV1
    }

    /// Un identifiant que la loi ne sait pas ranger se juge sur ce que
    /// l'appareil MESURE : un décodeur AV1 matériel est une puce de classe A17.
    var chipClass: Int {
        let chip = AppleChip(machine: machine)
        guard chip == .unknown else { return chip.performanceClass }
        return hardwareDecodesAV1 ? DeviceMediaTier.proChipClass : chip.performanceClass
    }

    /// `utsname.machine` rend « arm64 » ou « x86_64 » sur simulateur : le
    /// modèle simulé est dans l'environnement.
    public static func machine(raw: String, environment: [String: String]) -> String {
        if let simulated = environment["SIMULATOR_MODEL_IDENTIFIER"], !simulated.isEmpty { return simulated }
        return raw.isEmpty ? "unknown" : raw
    }
}

/// **La famille de puce d'un identifiant matériel.** Les puces Mac de la série M
/// des iPad sont rangées à la classe de l'A-series de même génération de cœur :
/// M1 ≈ A15, M2 ≈ A16, M3 ≈ A17, M4 ≈ A18, M5 ≈ A19.
public enum AppleChip: Sendable, Equatable {
    case legacy
    case a11, a12, a13, a14, a15, a16, a17, a18, a19
    case m1, m2, m3, m4, m5
    /// Un identifiant plus récent que ceux que la table connaît : au moins
    /// aussi puissant que le plus récent connu.
    case future
    case unknown

    /// 0 pour `legacy` (A10 et avant) et `unknown`, 1 (A11) à 9 (A19, M5), 10
    /// pour `future`.
    public var performanceClass: Int {
        switch self {
        case .legacy, .unknown: return 0
        case .a11: return 1
        case .a12: return 2
        case .a13: return 3
        case .a14: return 4
        case .a15, .m1: return 5
        case .a16, .m2: return 6
        case .a17, .m3: return 7
        case .a18, .m4: return 8
        case .a19, .m5: return 9
        case .future: return 10
        }
    }

    public init(machine: String) {
        guard let identifier = Identifier(machine) else {
            self = .unknown
            return
        }
        switch identifier.family {
        case "iPhone": self = Self.iPhone(major: identifier.major)
        case "iPad": self = Self.iPad(major: identifier.major, minor: identifier.minor)
        case "iPod": self = .legacy
        default: self = .unknown
        }
    }

    private struct Identifier {
        let family: String
        let major: Int
        let minor: Int

        init?(_ machine: String) {
            let halves = machine.split(separator: ",", omittingEmptySubsequences: false)
            guard halves.count == 2, let minor = Int(halves[1]) else { return nil }
            let family = String(halves[0].prefix { $0.isLetter })
            guard let major = Int(halves[0].dropFirst(family.count)) else { return nil }
            self.family = family
            self.major = major
            self.minor = minor
        }
    }

    private static func iPhone(major: Int) -> AppleChip {
        let generations: [AppleChip] = [.a11, .a12, .a13, .a14, .a15, .a16, .a17, .a18, .a19]
        switch major {
        case ...9: return .legacy
        case 10...18: return generations[major - 10]
        default: return .future
        }
    }

    /// Les iPad mêlent A-series et M-series dans une même génération
    /// d'identifiant : la table nomme les sous-ensembles, et un sous-ensemble
    /// qu'elle ne connaît pas reste `unknown` plutôt que deviné.
    private static func iPad(major: Int, minor: Int) -> AppleChip {
        func pick(_ table: [(ClosedRange<Int>, AppleChip)]) -> AppleChip {
            table.first { $0.0.contains(minor) }?.1 ?? .unknown
        }
        switch major {
        case ...7: return .legacy
        case 8, 11: return .a12
        case 12: return .a13
        case 13: return pick([(1...2, .a14), (4...11, .m1), (16...17, .m1), (18...19, .a14)])
        case 14: return pick([(1...2, .a15), (3...6, .m2), (8...11, .m2)])
        case 15: return pick([(3...6, .m3), (7...8, .a16)])
        case 16: return pick([(1...2, .a17), (3...6, .m4)])
        case 17: return pick([(1...4, .m5)])
        case 9, 10: return .unknown
        default: return .future
        }
    }
}
