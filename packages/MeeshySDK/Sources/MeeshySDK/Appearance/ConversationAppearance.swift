import Foundation

// MARK: - ConversationAppearance (#10631, spec § 5.4)
//
// MIROIR de `packages/shared/types/conversation-appearance.ts` : le fond ET
// l'accent PERSONNELS d'une conversation, stockés sur la ligne de préférences
// du lecteur et synchronisés entre SES appareils. Le décodage est TOLÉRANT PAR
// CHAMP (`readConversationAppearance`) : un fond d'une passerelle plus récente
// retombe sur Signature SANS perdre l'accent, et inversement.

public enum ConversationBackground: Hashable, Sendable {
    case signature
    case design(pack: String, design: String)
    case solid(color: String)
    case photo(attachmentId: String, veil: Double, blur: Int)

    public static let photoVeilMax = 0.8
    public static let photoVeilStep = 0.05
    public static let photoBlurMax = 24
}

public struct ConversationAppearance: Codable, Hashable, Sendable {
    public static let currentVersion = 1

    public var background: ConversationBackground
    /// Clé de la gamme ; `nil` = l'accent calculé de la conversation.
    public var accent: String?
    /// La couche animée facultative ; ignorée sous « Réduire les animations ».
    public var animate: Bool

    public static let `default` = ConversationAppearance(background: .signature, accent: nil, animate: true)

    public init(background: ConversationBackground = .signature, accent: String? = nil, animate: Bool = true) {
        self.background = background
        self.accent = accent
        self.animate = animate
    }

    /// Signature + accent calculé : ce que voit un lecteur qui n'a rien choisi.
    public var isDefault: Bool { self == .default }

    // MARK: Codable (tolérant par champ)

    private enum CodingKeys: String, CodingKey {
        case v, background, accent, animate
    }

    public init(from decoder: Decoder) throws {
        // Une valeur qui n'est pas un objet ne rend jamais une conversation illisible.
        guard let c = try? decoder.container(keyedBy: CodingKeys.self) else {
            self = .default
            return
        }
        background = (try? c.decode(ConversationBackground.self, forKey: .background)) ?? .signature
        let accentKey = try? c.decodeIfPresent(String.self, forKey: .accent)
        accent = accentKey.flatMap { AppearanceCatalog.shared.gamut.contains($0) ? $0 : nil }
        animate = (try? c.decodeIfPresent(Bool.self, forKey: .animate)) ?? true
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(Self.currentVersion, forKey: .v)
        try c.encode(background, forKey: .background)
        // `null` explicite : le serveur valide `accent` en `nullable`, pas en optionnel.
        if let accent { try c.encode(accent, forKey: .accent) } else { try c.encodeNil(forKey: .accent) }
        try c.encode(animate, forKey: .animate)
    }
}

extension ConversationBackground: Codable {
    private enum CodingKeys: String, CodingKey {
        case kind, pack, design, color, attachmentId, veil, blur
    }

    /// Un `kind` inconnu ou un champ manquant LÈVE : l'appelant (`ConversationAppearance`) retombe sur Signature.
    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        switch try c.decode(String.self, forKey: .kind) {
        case "signature":
            self = .signature
        case "design":
            self = .design(pack: try c.decode(String.self, forKey: .pack), design: try c.decode(String.self, forKey: .design))
        case "solid":
            self = .solid(color: try c.decode(String.self, forKey: .color))
        case "photo":
            let veil = try c.decode(Double.self, forKey: .veil)
            let blur = try c.decode(Int.self, forKey: .blur)
            self = .photo(
                attachmentId: try c.decode(String.self, forKey: .attachmentId),
                veil: min(max(veil, 0), Self.photoVeilMax),
                blur: min(max(blur, 0), Self.photoBlurMax)
            )
        default:
            throw DecodingError.dataCorruptedError(forKey: .kind, in: c, debugDescription: "kind inconnu")
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case .signature:
            try c.encode("signature", forKey: .kind)
        case .design(let pack, let design):
            try c.encode("design", forKey: .kind)
            try c.encode(pack, forKey: .pack)
            try c.encode(design, forKey: .design)
        case .solid(let color):
            try c.encode("solid", forKey: .kind)
            try c.encode(color, forKey: .color)
        case .photo(let attachmentId, let veil, let blur):
            try c.encode("photo", forKey: .kind)
            try c.encode(attachmentId, forKey: .attachmentId)
            try c.encode(veil, forKey: .veil)
            try c.encode(blur, forKey: .blur)
        }
    }
}
