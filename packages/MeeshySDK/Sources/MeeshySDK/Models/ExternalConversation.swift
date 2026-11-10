import Foundation

// MARK: - Écrire à un ami WhatsApp (#17118, chantier #17007)
//
// La passerelle ouvre, ou retrouve, une conversation externe par
// `POST /conversations/external` (#17117) : toujours chiffrée de bout en bout,
// adressée par le numéro E.164 de l'ami, réservée à un compte au numéro
// VÉRIFIÉ. Ce fichier porte ce que l'appareil en décide — où l'entrée existe,
// quelle forme part, quel état dire pour chaque réponse — sans rien rendre.
// Miroir web : `apps/web/src/lib/external-conversation/external-conversation.ts`.

/// Les réseaux tiers qu'une conversation externe peut joindre.
public enum ExternalNetwork: String, Sendable, Codable, CaseIterable {
    case whatsapp

    /// La valeur de `Conversation.type` d'une conversation externe (`EXTERNAL_CONVERSATION_TYPE`).
    public static let conversationType = "external"

    /// Le réseau d'une conversation servie avec ce `type` — `nil` pour toute
    /// conversation Meeshy-Meeshy. WhatsApp est le seul réseau de la v1 : la
    /// passerelle ne sert pas encore le réseau dans la conversation.
    public init?(conversationType: String) {
        guard conversationType.lowercased() == Self.conversationType else { return nil }
        self = .whatsapp
    }

    /// Le nom du réseau, langue-neutre : la passerelle ne sert ni le nom ni le
    /// numéro de l'ami, la conversation porte donc celui du réseau — jamais
    /// l'identifiant technique `ext_<id>`.
    public var displayName: String {
        switch self {
        case .whatsapp: return "WhatsApp"
        }
    }
}

/// Les codes stables des refus d'ouverture (`EXTERNAL_CONVERSATION_ERROR_CODES`,
/// `packages/shared/types/external-conversation.ts`).
public enum ExternalConversationErrorCode {
    public static let disabled = "EXTERNAL_CONVERSATIONS_DISABLED"
    public static let phoneUnverified = "EXTERNAL_CONVERSATION_PHONE_UNVERIFIED"
    public static let invalid = "EXTERNAL_CONVERSATION_INVALID"
    public static let endToEndReserved = "EXTERNAL_CONVERSATION_END_TO_END_RESERVED"
    public static let limitReached = "EXTERNAL_CONVERSATION_LIMIT_REACHED"
}

/// **L'ENTRÉE EST ÉTEINTE EN PRODUCTION** (design § 6, jusqu'à la signature
/// avec Meta). Le même binaire joint la production ou le staging selon
/// `MeeshyConfig.apiBaseURL` : l'entrée lit la passerelle jointe contre une
/// liste POSITIVE — le staging et le développement, miroir de
/// `isPreSignatureEnvironment` côté passerelle — et toute autre origine, celle
/// de la production comprise, reste fermée. Au staging, l'entrée n'est offerte
/// qu'à l'ÉQUIPE (`isPlatformTeam`). La passerelle garde son propre drapeau
/// (`EXTERNAL_CONVERSATIONS`) : une entrée visible contre un serveur éteint dit
/// « pas encore disponible ici », jamais un échec muet.
public enum ExternalConversationEntry {
    static let stagingGatewayHost = "gate.staging.meeshy.me"

    /// La passerelle jointe accepte-t-elle des conversations externes AVANT la signature ?
    public static func isReachable(apiBaseURL: String) -> Bool {
        guard let host = URL(string: apiBaseURL)?.host?.lowercased(), !host.isEmpty else { return false }
        return host == stagingGatewayHost || isLocalHost(host)
    }

    public static func isVisible(apiBaseURL: String, role: String?) -> Bool {
        isReachable(apiBaseURL: apiBaseURL) && PlatformRole(raw: role)?.isTeam == true
    }

    /// Le numéro saisi, en E.164 — ou `nil`. Les séparateurs usuels tombent et
    /// le préfixe international `00` vaut `+` ; rien n'est DEVINÉ (aucun
    /// indicatif ajouté à un numéro national) : écrire au mauvais pays
    /// adresserait un message à un inconnu.
    public static func normalizeHandle(_ raw: String) -> String? {
        let compact = String(raw.unicodeScalars.filter { !separators.contains($0) })
        let international = compact.hasPrefix("00") ? "+" + String(compact.dropFirst(2)) : compact
        return isE164(international) ? international : nil
    }

    private static let separators: Set<Unicode.Scalar> = Set(" \t\n().-\u{00A0}\u{2010}\u{2011}\u{2012}\u{2013}\u{2014}\u{2015}".unicodeScalars)

    /// La forme que la passerelle exige (`e164Schema`, `external-peer-contract.ts`) : `^\+[1-9][0-9]{6,14}$`.
    private static func isE164(_ candidate: String) -> Bool {
        guard candidate.hasPrefix("+") else { return false }
        let digits = candidate.dropFirst()
        guard (7...15).contains(digits.count), digits.first != "0" else { return false }
        return digits.allSatisfy(isASCIIDigit)
    }

    private static func isASCIIDigit(_ character: Character) -> Bool {
        character.isASCII && character.isNumber
    }

    private static func isLocalHost(_ host: String) -> Bool {
        host == "localhost" || isIPv4(host) || !host.contains(".")
    }

    private static func isIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 4 && parts.allSatisfy { part in
            (1...3).contains(part.count) && part.allSatisfy(isASCIIDigit)
        }
    }
}

/// Ce que `POST /conversations/external` rend en cas de succès (201 ouverte,
/// 200 retrouvée). La réponse ne recopie jamais le numéro de l'ami.
public struct ExternalOpening: Decodable, Sendable, Equatable {
    public let conversationId: String
    public let type: String
    public let encryptionMode: String
    public let network: String
    public let created: Bool

    public init(conversationId: String, type: String, encryptionMode: String, network: String, created: Bool) {
        self.conversationId = conversationId
        self.type = type
        self.encryptionMode = encryptionMode
        self.network = network
        self.created = created
    }
}

/// Pourquoi une ouverture n'a pas abouti — chacun appelle une phrase différente.
public enum ExternalOpeningRefusal: String, Sendable, Equatable, CaseIterable {
    /// Drapeau serveur éteint, ou passerelle antérieure à #17117 : « pas encore disponible ici ».
    case disabled
    /// Le compte ne peut pas encore choisir le bout en bout.
    case reserved
    /// Trop d'amis d'autres réseaux gardés à la fois.
    case limit
    /// Réseau inconnu ou numéro hors E.164.
    case invalid
    /// Trop d'ouvertures dans l'heure.
    case rateLimited
    /// Aucun réseau : rien n'est parti.
    case offline
    /// Toute autre panne : on peut réessayer.
    case failed
}

/// L'état à dessiner après une ouverture.
public enum ExternalOpeningOutcome: Sendable, Equatable {
    case open(conversationId: String, created: Bool)
    /// L'utilisateur Meeshy doit vérifier son numéro avant d'écrire à un réseau tiers.
    case phoneUnverified
    case refused(ExternalOpeningRefusal)

    /// Une réponse « ouverte » qui ne dirait pas une conversation externe
    /// chiffrée de bout en bout n'ouvre RIEN : l'appareil ne s'engage jamais
    /// auprès d'un ami d'un réseau tiers sur la foi d'une réponse inattendue.
    public static func of(_ opening: ExternalOpening) -> ExternalOpeningOutcome {
        let sealed = opening.type == ExternalNetwork.conversationType && opening.encryptionMode == E2EEWire.mode && !opening.conversationId.isEmpty
        return sealed ? .open(conversationId: opening.conversationId, created: opening.created) : .refused(.failed)
    }

    /// Lit un échec de transport. Le CODE prime sur le statut : c'est lui que le contrat documente.
    public static func of(error: Error) -> ExternalOpeningOutcome {
        let failure = MeeshyError.from(error)
        if case .network(.noConnection) = failure { return .refused(.offline) }
        let (status, code) = statusAndCode(of: failure)
        if code == ExternalConversationErrorCode.phoneUnverified { return .phoneUnverified }
        if let code, let refusal = refusalOfCode[code] { return .refused(refusal) }
        return .refused(refusalOfStatus(status))
    }

    private static let refusalOfCode: [String: ExternalOpeningRefusal] = [
        ExternalConversationErrorCode.disabled: .disabled,
        ExternalConversationErrorCode.endToEndReserved: .reserved,
        ExternalConversationErrorCode.limitReached: .limit,
        ExternalConversationErrorCode.invalid: .invalid,
    ]

    private static func refusalOfStatus(_ status: Int?) -> ExternalOpeningRefusal {
        switch status {
        case 429: return .rateLimited
        case 404: return .disabled
        default: return .failed
        }
    }

    private static func statusAndCode(of failure: MeeshyError) -> (Int?, String?) {
        switch failure {
        case .rejected(let rejection):
            return (rejection.statusCode, rejection.code)
        case .forbidden(_, let body):
            let code = body.flatMap { try? JSONDecoder().decode(RefusalEnvelope.self, from: $0) }?.code
            return (403, code)
        case .server(let statusCode, _):
            return (statusCode, nil)
        default:
            return (nil, nil)
        }
    }

    private struct RefusalEnvelope: Decodable {
        let code: String?
    }
}
