import Foundation
import MeeshySDK

/// **Où en est une frappe `@`** (#7847, directive porteur 2026-09-24).
///
/// | étape | frappe | ce qui répond | réseau |
/// |---|---|---|---|
/// | `bare` | `@` | contacts puis participants, en entier | aucun |
/// | `localFilter` | `@a` | les mêmes, filtrés | aucun |
/// | `remote` | `@al…` | les mêmes filtrés, puis les AUTRES | une recherche débattue |
public nonisolated enum MentionLookupStage: Sendable, Equatable {
    case bare
    case localFilter
    case remote
}

public extension MentionLookupRule {
    /// L'étape d'une requête (le fragment tapé APRÈS le `@`). Les blancs ne
    /// comptent pas, comme dans `queriesRemote`.
    nonisolated static func stage(for query: String) -> MentionLookupStage {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return .bare }
        return trimmed.count >= minimumRemoteQueryLength ? .remote : .localFilter
    }
}

/// Ce que la règle a besoin de savoir d'une personne, quel que soit le type
/// qui la porte (`MentionCandidate` côté app, `UserSearchResult` côté SDK).
public nonisolated struct MentionIdentity: Sendable, Equatable {
    public let id: String
    public let username: String
    public let displayName: String

    public init(id: String, username: String, displayName: String) {
        self.id = id
        self.username = username
        self.displayName = displayName
    }

    public init(candidate: MentionCandidate) {
        self.init(id: candidate.id, username: candidate.username, displayName: candidate.displayName)
    }

    public init(userSearchResult user: UserSearchResult) {
        self.init(id: user.id, username: user.username, displayName: user.displayName ?? user.username)
    }
}

/// **La liste `@`, écrite une fois pour toutes les surfaces** (#7847).
///
/// Ordre : contacts → participants du contexte → autres personnes trouvées par
/// le réseau. Une personne présente dans plusieurs groupes n'apparaît qu'une
/// fois, dans le PREMIER. L'auteur ne se propose jamais lui-même.
///
/// Les « autres » ne sont servis qu'à l'étape `remote` : à une lettre, la liste
/// est locale, et un reste d'une recherche précédente n'y a pas sa place. Au-delà,
/// ils sont REFILTRÉS par la requête courante — c'est ce qui permet d'affiner
/// sans clignoter pendant que la recherche suivante est en vol.
public nonisolated enum MentionSuggestionRule {

    public static func matches(_ identity: MentionIdentity, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        return identity.username.localizedCaseInsensitiveContains(trimmed)
            || identity.displayName.localizedCaseInsensitiveContains(trimmed)
    }

    public static func ordered<Person>(
        contacts: [Person],
        participants: [Person],
        others: [Person],
        query: String,
        excludingUserId: String?,
        identity: (Person) -> MentionIdentity
    ) -> [Person] {
        let servedOthers = MentionLookupRule.stage(for: query) == .remote ? others : []
        let groups = [contacts, participants, servedOthers]
        let initial: (kept: [Person], ids: Set<String>, usernames: Set<String>) = ([], [], [])
        return groups.joined().reduce(into: initial) { state, person in
            let who = identity(person)
            let handle = who.username.lowercased()
            guard who.id != excludingUserId,
                  !state.ids.contains(who.id),
                  !state.usernames.contains(handle),
                  matches(who, query: query) else { return }
            state.kept.append(person)
            state.ids.insert(who.id)
            state.usernames.insert(handle)
        }.kept
    }

    public static func ordered(
        contacts: [MentionCandidate],
        participants: [MentionCandidate],
        others: [MentionCandidate],
        query: String,
        excludingUserId: String?
    ) -> [MentionCandidate] {
        ordered(contacts: contacts, participants: participants, others: others,
                query: query, excludingUserId: excludingUserId,
                identity: MentionIdentity.init(candidate:))
    }
}
