import Foundation
import MeeshySDK

/// **Qui répond à une frappe `@`** (directive porteur, #14053) —
/// miroir exact de `MentionLookupStage` (`packages/shared/utils/mention-lookup.ts`).
///
/// | étape | frappe | ce qui répond | réseau |
/// |---|---|---|---|
/// | `local` | `@`, `@a`, `@al` (s'il y a une correspondance locale) | contacts puis participants, filtrés | aucun |
/// | `remote` | `@al` (sans correspondance locale), `@ali…` | les mêmes, puis le SERVEUR dans son ordre | une recherche débattue |
public nonisolated enum MentionLookupStage: Sendable, Equatable {
    case local
    case remote
}

public extension MentionLookupRule {
    /// L'étape d'une requête (le fragment tapé APRÈS le `@`), sachant combien
    /// de personnes le cache local propose déjà pour elle. Les blancs ne
    /// comptent pas : un `@ ` n'ouvre pas un handle.
    nonisolated static func stage(for query: String, localMatchCount: Int) -> MentionLookupStage {
        let length = query.trimmingCharacters(in: .whitespacesAndNewlines).count
        if length >= remoteMinimumLength { return .remote }
        if length == remoteEarlyLength && localMatchCount == 0 { return .remote }
        return .local
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

/// **La liste `@`, écrite une fois pour toutes les surfaces** (#7847, #14053).
///
/// Ordre : les correspondances LOCALES d'abord — contacts, puis participants du
/// contexte connus localement —, puis la liste du SERVEUR dans SON ordre
/// (connaissances, contexte, contacts, annuaire). Une personne présente dans
/// plusieurs groupes n'apparaît qu'une fois, dans le PREMIER. L'auteur ne se
/// propose jamais lui-même. Miroir de `mergeMentionSuggestions`
/// (`packages/shared/utils/mention-lookup.ts`).
///
/// Les « autres » ne sont servis qu'à l'étape `remote` : à l'étape locale, un
/// reste d'une recherche précédente n'y a pas sa place.
///
/// `othersQuery` dit à quelle requête les « autres » RÉPONDENT. S'ils répondent
/// à la requête courante, ils sont servis TELS QUELS : le serveur trouve aussi
/// par prénom et nom, que `MentionIdentity` ne porte pas, et les refiltrer
/// ici retirerait des personnes qu'il a légitimement trouvées. S'ils répondent
/// à une requête antérieure (`nil` = inconnu), ils sont REFILTRÉS par la requête
/// courante — c'est ce qui permet d'affiner sans clignoter pendant que la
/// recherche suivante est en vol.
public nonisolated enum MentionSuggestionRule {

    public static func matches(_ identity: MentionIdentity, query: String) -> Bool {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return true }
        return identity.username.localizedCaseInsensitiveContains(trimmed)
            || identity.displayName.localizedCaseInsensitiveContains(trimmed)
    }

    /// Les correspondances LOCALES d'une requête — contacts puis participants,
    /// filtrés, sans doublon, sans soi. Leur nombre décide de l'étape.
    ///
    /// `reach` (une conversation, #14071) : un local qui n'y aurait aucun effet
    /// n'est pas une correspondance — ni affiché, ni compté pour l'étape.
    public static func localMatches<Person>(
        contacts: [Person],
        participants: [Person],
        query: String,
        excludingUserId: String?,
        reach: MentionReach? = nil,
        identity: (Person) -> MentionIdentity
    ) -> [Person] {
        let found = merged([(people: contacts, filtered: true), (people: participants, filtered: true)], query: query,
                           excludingUserId: excludingUserId, identity: identity)
        guard let reach else { return found }
        return found.filter { reach.admits(identity($0).id, selfId: excludingUserId) }
    }

    public static func localMatches(
        contacts: [MentionCandidate],
        participants: [MentionCandidate],
        query: String,
        excludingUserId: String?,
        reach: MentionReach? = nil
    ) -> [MentionCandidate] {
        localMatches(contacts: contacts, participants: participants, query: query,
                     excludingUserId: excludingUserId, reach: reach, identity: MentionIdentity.init(candidate:))
    }

    /// Avec une `reach` (#14071), une suggestion SANS EFFET n'est pas affichée :
    /// les locaux hors portée sont retirés ; la liste du serveur, déjà bornée à la
    /// même portée et qui connaît tous les membres, reste — sauf sans portée du
    /// tout (type inconnu, non-membre) : alors rien. Miroir de
    /// `mergeMentionSuggestions({ reach })`.
    public static func ordered<Person>(
        contacts: [Person],
        participants: [Person],
        others: [Person],
        othersQuery: String? = nil,
        query: String,
        excludingUserId: String?,
        reach: MentionReach? = nil,
        identity: (Person) -> MentionIdentity
    ) -> [Person] {
        if let reach, reach.scope == nil { return [] }
        let locals = localMatches(contacts: contacts, participants: participants, query: query,
                                  excludingUserId: excludingUserId, reach: reach, identity: identity)
        guard MentionLookupRule.stage(for: query, localMatchCount: locals.count) == .remote else {
            return locals
        }
        let answersQuery = othersQuery.map { normalized($0) == normalized(query) } ?? false
        return merged([(people: locals, filtered: false), (people: others, filtered: !answersQuery)], query: query,
                      excludingUserId: excludingUserId, identity: identity)
    }

    public static func ordered(
        contacts: [MentionCandidate],
        participants: [MentionCandidate],
        others: [MentionCandidate],
        othersQuery: String? = nil,
        query: String,
        excludingUserId: String?,
        reach: MentionReach? = nil
    ) -> [MentionCandidate] {
        ordered(contacts: contacts, participants: participants, others: others,
                othersQuery: othersQuery, query: query, excludingUserId: excludingUserId,
                reach: reach, identity: MentionIdentity.init(candidate:))
    }

    private static func normalized(_ query: String) -> String {
        query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    /// Concatène les groupes dans l'ordre, sans doublon (id ou pseudo) et sans
    /// soi ; un groupe `filtered` ne garde que ce qui correspond à la requête.
    private static func merged<Person>(
        _ groups: [(people: [Person], filtered: Bool)],
        query: String,
        excludingUserId: String?,
        identity: (Person) -> MentionIdentity
    ) -> [Person] {
        let entries: [(person: Person, filtered: Bool)] = groups.flatMap { group in
            group.people.map { (person: $0, filtered: group.filtered) }
        }
        let initial: (kept: [Person], ids: Set<String>, usernames: Set<String>) = ([], [], [])
        return entries.reduce(into: initial) { state, entry in
            let who = identity(entry.person)
            let handle = who.username.lowercased()
            guard who.id != excludingUserId,
                  !state.ids.contains(who.id),
                  !state.usernames.contains(handle),
                  !entry.filtered || matches(who, query: query) else { return }
            state.kept.append(entry.person)
            state.ids.insert(who.id)
            state.usernames.insert(handle)
        }.kept
    }
}
