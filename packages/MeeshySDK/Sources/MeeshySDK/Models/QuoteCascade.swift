import Foundation

/// **UNE RÉPONSE MEURT, POUR SON LECTEUR, AVEC CE QU'ELLE CITE** (#10433, la
/// moitié CLIENT de #8630) — décision porteur 2026-09-29 : « lorsqu'elle se
/// détruit, elle entraîne la destruction du message qui l'a cité ».
///
/// Miroir EXACT de la loi TS, et rien de plus :
/// - `inheritedExpiresAt` ↔ `inheritedEphemeralExpiresAt`
///   (`packages/shared/utils/ephemeral-countdown.ts`) : une réponse meurt à la
///   plus PROCHE des échéances de sa chaîne citée ;
/// - `isInheritedServable` ↔ `isInheritedEphemeralServable` : la même grâce
///   d'une heure que le message cité — la réponse ne survit pas à ce qu'elle
///   cite, et ne disparaît pas non plus avant lui. Côté client, cela se lit :
///   la réponse quitte le fil au MÊME instant que ce qu'elle cite ;
/// - `inheritedDeath(of:lookup:)` ↔ `inheritedQuoteDeathMs`
///   (`apps/web/src/lib/view/quote-cascade.ts`) : la remontée, bornée à
///   `maxDepth` maillons comme celle de la passerelle (`MAX_QUOTE_DEPTH`,
///   `services/gateway/src/services/messaging/quoteCascade.ts`), chaque maillon
///   lu dans le fil chargé ET dans la citation que porte celui qui le cite ;
/// - `deadline(of:lookup:)` ↔ `deadlineThroughQuotes` : l'échéance propre
///   rapprochée de celle héritée. N'allonge jamais une vie.
///
/// Ce que la loi ne sait pas, elle le REÇOIT : l'échéance de chaque maillon
/// POUR CET APPAREIL (réception locale d'un éphémère, consommation d'une
/// flamme-œil, citation scellée « expirée ») est l'affaire des constructeurs de
/// `Link` (`QuoteCascade+Links.swift`). La loi est pure : ni registre, ni
/// horloge, ni base.
public enum QuoteCascade {

    /// La même borne que la remontée de la passerelle (`MAX_QUOTE_DEPTH`).
    public static let maxDepth = 8

    /// La grâce de `isInheritedEphemeralServable` (`EPHEMERAL_UNAVAILABILITY_GRACE_MS`).
    public static let unavailabilityGrace: TimeInterval = 60 * 60

    /// Ce qu'un maillon dit de lui-même, pour ce lecteur.
    public struct Link: Equatable, Sendable {
        /// L'identifiant du maillon.
        public let id: String
        /// Ce qu'il cite, ou `nil`.
        public let quotedId: String?
        /// Sa propre échéance chez ce lecteur ; `nil` : il ne meurt pas.
        public let ownDeath: Date?
        /// L'échéance du message CITÉ, telle que la citation EMBARQUÉE la porte —
        /// ce qui fait encore mourir la réponse quand le cité n'est plus chargé.
        public let embeddedQuoteDeath: Date?

        public init(id: String, quotedId: String?, ownDeath: Date?, embeddedQuoteDeath: Date?) {
            self.id = id
            self.quotedId = quotedId
            self.ownDeath = ownDeath
            self.embeddedQuoteDeath = embeddedQuoteDeath
        }
    }

    /// La plus PROCHE des échéances connues — `nil` quand aucune n'est connue.
    public static func inheritedExpiresAt(_ deadlines: [Date?]) -> Date? {
        deadlines.compactMap { $0 }.min()
    }

    /// La réponse est-elle encore SERVABLE ? Même grâce d'une heure que le cité.
    public static func isInheritedServable(inheritedExpiresAt: Date?, now: Date) -> Bool {
        guard let inheritedExpiresAt else { return true }
        return now < inheritedExpiresAt.addingTimeInterval(unavailabilityGrace)
    }

    /// L'échéance HÉRITÉE de la chaîne citée depuis `start` (lui exclu) : chaque
    /// maillon se lit dans le fil chargé (`lookup`) ET dans la citation que
    /// porte celui qui le cite — un message sorti du fil se lit encore par
    /// elle. `nil` : rien de ce qu'il cite ne meurt.
    public static func inheritedDeath(of start: Link, lookup: (String) -> Link?) -> Date? {
        var deaths: [Date?] = []
        var seen: Set<String> = [start.id]
        var holder: Link? = start
        var depth = 0
        while let current = holder, depth < maxDepth {
            guard let quotedId = current.quotedId, !seen.contains(quotedId) else { break }
            seen.insert(quotedId)
            let row = lookup(quotedId)
            deaths.append(row?.ownDeath)
            deaths.append(current.embeddedQuoteDeath)
            holder = row
            depth += 1
        }
        return inheritedExpiresAt(deaths)
    }

    /// L'ÉCHÉANCE D'UN MAILLON POUR CE LECTEUR, citations comprises — la sienne
    /// rapprochée de celle qu'il hérite. `nil` : il ne meurt pas.
    public static func deadline(of link: Link, lookup: (String) -> Link?) -> Date? {
        guard link.quotedId != nil else { return link.ownDeath }
        return inheritedExpiresAt([link.ownDeath, inheritedDeath(of: link, lookup: lookup)])
    }

    /// L'échéance du message cité que porte une citation EMBARQUÉE.
    ///
    /// - SCELLÉE par une expiration (`quotedMessageDeletedAt` ET
    ///   `quotedExpiresAt`, la forme de `sealedQuotedMessage` côté passerelle
    ///   et de `tombstoned(at:expired:)` ici) : la mort est cette échéance. Une
    ///   SUPPRESSION n'a que `quotedMessageDeletedAt`, et ne tue rien.
    /// - VIVANTE, d'un éphémère (échéance servie, ou nature flamme) : la mort
    ///   gravée au registre de CET appareil (`destruction`), rapprochée de
    ///   l'échéance servie.
    /// - Une story, une humeur, un message ordinaire ou une vue unique non
    ///   éphémère n'emportent rien.
    public static func embeddedDeath(of quote: ReplyReference, destruction: (String) -> Date?) -> Date? {
        guard !quote.isStoryReply, quote.moodEmoji == nil, !quote.messageId.isEmpty else { return nil }
        if quote.isQuotedMessageDeleted { return quote.quotedExpiresAt }
        guard quote.declaresEphemeralQuote else { return nil }
        return inheritedExpiresAt([destruction(quote.messageId), quote.quotedExpiresAt])
    }
}

public extension ReplyReference {
    /// Le message cité est-il un éphémère — échéance servie, ou flamme ?
    var declaresEphemeralQuote: Bool {
        quotedExpiresAt != nil || quotedExitNature == .timedFlame || quotedExitNature == .afterReadFlame
    }
}
