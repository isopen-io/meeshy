import Foundation
import MeeshySDK

/// « En commun » en VALEURS (#19377, planche `Autre-Commun`) : ce que la Vitrine de l'autre montre, décidé hors de la
/// vue. Une partie ouverte donne son nombre et sa liste ; une partie verrouillée ne donne que le cercle qui l'ouvre,
/// jamais un nombre ni un nom ; une partie absente ne donne rien.
public nonisolated struct ProfileInCommonDigest: Equatable, Sendable {

    public enum Figure: Equatable, Sendable {
        case conversations(Int)
        case communities(Int)
        case friends(Int)
    }

    public enum Part: String, Equatable, Sendable, CaseIterable {
        case communities
        case friends
        case media
    }

    public struct LockedPart: Equatable, Sendable {
        public let part: Part
        public let opensAt: RelationLevel
    }

    public struct HistoryStep: Equatable, Sendable {
        public let kind: InCommonHistoryKind
        public let date: Date
    }

    /// La ligne de résumé : « 6 conversations · 3 communautés · 12 amis », sans zéro ni partie fermée.
    public let figures: [Figure]
    public let communities: [InCommonCommunity]
    public let communitiesTotal: Int
    public let friends: [InCommonFriend]
    public let friendsTotal: Int
    /// Les filtres de médias servis, dans l'ordre de la planche : un type que le serveur ne compte pas n'en a pas.
    public let mediaFilters: [InCommonMediaKind]
    public let mediaTotal: Int
    public let media: [InCommonMedia]
    public let locked: [LockedPart]
    public let history: [HistoryStep]
    /// Ni conversation, ni partie ouverte qui contienne quelque chose : le vide « Vous n'avez encore rien en commun ».
    public let isNothingInCommon: Bool

    public static func resolve(conversations: Int, inCommon: UserInCommon) -> ProfileInCommonDigest {
        let communitiesTotal = inCommon.communities?.shownTotal ?? 0
        let friendsTotal = inCommon.friends?.shownTotal ?? 0
        let mediaCounts = inCommon.media?.countsByKind ?? [:]
        let mediaTotal = inCommon.media?.shownTotal ?? 0
        let candidates: [Figure?] = [
            conversations > 0 ? Figure.conversations(conversations) : nil,
            communitiesTotal > 0 ? Figure.communities(communitiesTotal) : nil,
            friendsTotal > 0 ? Figure.friends(friendsTotal) : nil,
        ]
        return ProfileInCommonDigest(
            figures: candidates.compactMap { $0 },
            communities: inCommon.communities?.shownItems ?? [],
            communitiesTotal: communitiesTotal,
            friends: inCommon.friends?.shownItems ?? [],
            friendsTotal: friendsTotal,
            mediaFilters: InCommonMediaKind.allCases.filter { (mediaCounts[$0] ?? 0) > 0 },
            mediaTotal: mediaTotal,
            media: inCommon.media?.shownItems ?? [],
            locked: lockedParts(of: inCommon),
            history: historySteps(inCommon.history ?? []),
            isNothingInCommon: conversations == 0 && communitiesTotal == 0 && friendsTotal == 0 && mediaTotal == 0
        )
    }

    /// Les médias d'un type, dans l'ordre servi.
    public func media(of kind: InCommonMediaKind) -> [InCommonMedia] {
        media.filter { $0.mediaKind == kind }
    }

    /// Le dernier vocal partagé, joué sous la grille par le lecteur d'onde (K35).
    public var latestVoice: InCommonMedia? {
        media.first { $0.mediaKind == .audio && !($0.fileUrl ?? "").isEmpty }
    }

    /// Le filtre ouvert d'abord : le premier type servi.
    public var defaultFilter: InCommonMediaKind? { mediaFilters.first }

    /// La pile d'amis (K48) dit au plus deux prénoms, puis le reste en nombre : « Mina, Kwame et 10 autres ».
    public var friendLead: (names: [String], others: Int) {
        let names = friends.prefix(2).map { Self.firstName(of: $0) }
        return (names, max(friendsTotal - names.count, 0))
    }

    static func firstName(of friend: InCommonFriend) -> String {
        guard friend.displayName != nil else { return friend.username }
        return friend.shownName.split(separator: " ").first.map(String.init) ?? friend.shownName
    }

    private static func lockedParts(of inCommon: UserInCommon) -> [LockedPart] {
        let accesses: [(Part, InCommonAccess?)] = [
            (.communities, inCommon.communities?.access),
            (.friends, inCommon.friends?.access),
            (.media, inCommon.media?.access),
        ]
        return accesses.compactMap { part, access in
            guard case .locked(let level) = access else { return nil }
            return LockedPart(part: part, opensAt: level)
        }
    }

    /// Un jalon par sorte, le premier daté ; dans l'ordre du temps.
    private static func historySteps(_ steps: [InCommonHistoryStep]) -> [HistoryStep] {
        let dated = steps.compactMap { step -> HistoryStep? in
            guard let kind = step.historyKind, let date = step.date else { return nil }
            return HistoryStep(kind: kind, date: date)
        }
        let earliest = Dictionary(dated.map { ($0.kind, $0) }, uniquingKeysWith: { $0.date <= $1.date ? $0 : $1 })
        return earliest.values.sorted { $0.date < $1.date }
    }
}
