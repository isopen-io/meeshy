import Foundation

/// **Qui peut-on mentionner dans une conversation** (#14071) — miroir exact de
/// `mentionableScope` (`packages/shared/utils/mention-lookup.ts`), la table que la
/// passerelle applique à l'envoi :
///
/// | type | portée | qui |
/// |---|---|---|
/// | `direct` | `interlocutor` | l'autre participant, seul |
/// | `group` | `members` | tout membre actif |
/// | `public` · `global` · `broadcast` | `directory` | tout compte |
///
/// Un type inconnu n'a aucune portée : personne n'est mentionnable.
public nonisolated enum MentionableScope: String, Sendable, Equatable {
    case interlocutor
    case members
    case directory

    public init?(conversationType: String?) {
        switch conversationType {
        case "direct": self = .interlocutor
        case "group": self = .members
        case "public", "global", "broadcast": self = .directory
        default: return nil
        }
    }
}

/// **Ce que le lecteur peut citer ICI** — la portée du type, et les membres que
/// le client connaît. Un non-membre ne cite personne (#14066) : la passerelle lui
/// refuse la recherche et ignore ses mentions à l'envoi. Miroir de
/// `mentionReachOf` / `isMentionableIn`.
public nonisolated struct MentionReach: Sendable, Equatable {
    public let scope: MentionableScope?
    public let memberIds: Set<String>

    public init(scope: MentionableScope?, memberIds: Set<String>) {
        self.scope = scope
        self.memberIds = memberIds
    }

    /// `isMember == false` (dit par le serveur) ferme toute portée ; absent, le type décide.
    public init(conversationType: String?, isMember: Bool? = nil, memberIds: Set<String>) {
        self.init(scope: isMember == false ? nil : MentionableScope(conversationType: conversationType),
                  memberIds: memberIds)
    }

    /// Une mention de `candidateId` aurait-elle un effet ici ?
    public func admits(_ candidateId: String, selfId: String?) -> Bool {
        switch scope {
        case .directory: return true
        case .members: return memberIds.contains(candidateId)
        case .interlocutor: return candidateId != selfId && memberIds.contains(candidateId)
        case nil: return false
        }
    }
}
