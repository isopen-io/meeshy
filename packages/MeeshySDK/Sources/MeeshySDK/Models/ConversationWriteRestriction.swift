import Foundation

// MARK: - Ce que le LECTEUR ne peut pas écrire dans une conversation (#9927, #9929)
//
// La passerelle CALCULE la restriction depuis `User.birthDate` et la sert sur
// la liste, le détail et l'état d'onboarding (`viewerWriteRestriction`). Aucun
// état n'est stocké, ni chez elle ni ici : à ses 18 ans, l'utilisateur reçoit
// `null` et Global s'ouvre d'elle-même.
//
// Deux règles de décodage :
// 1. **Une valeur inconnue est GARDÉE, jamais fatale.** Une passerelle plus
//    récente peut nommer une autre restriction ; la conversation entière ne
//    doit pas tomber pour un mot que ce binaire ne connaît pas.
// 2. **Seule `minor-global` ferme le composeur ici.** Une restriction inconnue
//    laisse écrire : c'est la passerelle qui refuse, et le refus dit pourquoi.

/// Pourquoi le lecteur ne peut pas écrire dans cette conversation.
public enum ConversationWriteRestriction: Hashable, Sendable, Codable {
    /// Global n'admet l'écriture qu'à partir de 18 ans.
    case minorGlobal
    /// Une restriction qu'une passerelle plus récente sait nommer.
    case unknown(String)

    public static let minorGlobalWireValue = "minor-global"
    /// Le code du 403 qu'une écriture d'un mineur dans Global reçoit.
    public static let globalAdultsOnlyCode = "GLOBAL_ADULTS_ONLY"

    public init(wireValue: String) {
        self = wireValue == Self.minorGlobalWireValue ? .minorGlobal : .unknown(wireValue)
    }

    public var wireValue: String {
        switch self {
        case .minorGlobal: return Self.minorGlobalWireValue
        case .unknown(let raw): return raw
        }
    }

    /// Le composeur cède la place à un bandeau de lecture seule.
    public var closesComposer: Bool { self == .minorGlobal }

    /// La conversation est rangée dans les archives, et ne s'en sort pas.
    public var imposesArchive: Bool { self == .minorGlobal }

    public init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        self.init(wireValue: (try? container.decode(String.self)) ?? "")
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        try container.encode(wireValue)
    }

    /// La restriction qu'un REFUS d'écriture révèle : un 403 portant
    /// `GLOBAL_ADULTS_ONLY`. `nil` pour tout autre échec.
    public init?(refusal error: Error) {
        guard let meeshy = error as? MeeshyError,
              case let .forbidden(_, body) = meeshy,
              let body,
              let envelope = try? JSONDecoder().decode(RefusalEnvelope.self, from: body),
              envelope.code == Self.globalAdultsOnlyCode else { return nil }
        self = .minorGlobal
    }

    private struct RefusalEnvelope: Decodable {
        let code: String?
    }
}

public extension MeeshyConversation {
    /// La conversation est-elle rangée d'office dans les archives du lecteur ?
    var isArchiveImposed: Bool { viewerWriteRestriction?.imposesArchive ?? false }

    /// La même conversation, rangée dans les archives quand la restriction
    /// servie l'impose — quoi que dise la préférence locale. Une préférence en
    /// vol, un instantané plus ancien greffé ou un événement d'un autre appareil
    /// ne peuvent pas ressortir Global des archives d'un mineur.
    func imposingServedArchive() -> MeeshyConversation {
        guard isArchiveImposed, !userState.isArchived else { return self }
        var imposed = self
        imposed.userState.isArchived = true
        return imposed
    }
}
