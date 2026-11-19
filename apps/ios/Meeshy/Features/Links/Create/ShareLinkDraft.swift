import Foundation
import MeeshySDK

/// Le brouillon d'un lien de partage (planche `Lien-Creer`, étape 2) : la conversation, le nom, l'adresse, l'expiration,
/// le nombre d'entrées, ce qu'on demande aux invités, ce qu'ils peuvent faire et les langues autorisées. Pur : la vue
/// le tient, il dit ce qui part et ce que le billet montre.
nonisolated struct ShareLinkDraft: Equatable, Sendable {
    static let entriesRange = 1...10_000
    static let defaultEntries = 50

    var conversationId: String?
    var conversationName: String?
    var name = ""
    var description = ""
    var slug = ""
    var expiry: LinkExpiryNotch = .days7
    var limitsEntries = true
    var maxEntries = ShareLinkDraft.defaultEntries
    var acceptsGuests = true
    var asksNickname = true
    var asksEmail = false
    var asksBirthday = false
    var allowsMessages = true
    var allowsImages = true
    var allowsFiles = false
    var guestsSeeHistory = false
    /// Les langues autorisées ; vide = toutes.
    var languages: [String] = []

    var slugIsAcceptable: Bool { LinkSlugRules.isAcceptable(slug) }

    var canCreate: Bool { conversationId != nil && slugIsAcceptable }

    /// Le pas du nombre d'entrées : 1 jusqu'à 100, 10 jusqu'à 1 000, 100 au-delà.
    var entriesStep: Int { maxEntries < 100 ? 1 : (maxEntries < 1_000 ? 10 : 100) }

    /// `meeshy.me/chat/<adresse>` tel que le billet l'écrit ; « … » tant que l'adresse sera tirée au hasard.
    var shortAddress: String { "meeshy.me/chat/\(slug.isEmpty ? "…" : slug)" }

    /// « Toutes » rouvre toutes les langues ; la décocher présélectionne `fallback` pour que la restriction se voie.
    mutating func setAllLanguages(_ all: Bool, fallback: String) {
        languages = all ? [] : [fallback]
    }

    /// La dernière langue ne se retire pas : une liste vide voudrait dire « toutes », l'inverse de ce qu'on restreint.
    mutating func toggleLanguage(_ code: String) {
        guard languages.contains(code) else {
            languages.append(code)
            return
        }
        guard languages.count > 1 else { return }
        languages.removeAll { $0 == code }
    }

    private func trimmed(_ value: String) -> String? {
        let clean = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return clean.isEmpty ? nil : clean
    }

    /// Ce qui part vers `POST /links` ; `nil` sans conversation ou avec une adresse refusée.
    func request(now: Date) -> CreateShareLinkRequest? {
        guard canCreate, let conversationId else { return nil }
        return CreateShareLinkRequest(
            conversationId: conversationId,
            name: trimmed(name),
            description: trimmed(description),
            identifier: slug.isEmpty ? nil : slug,
            maxUses: limitsEntries ? min(max(maxEntries, Self.entriesRange.lowerBound), Self.entriesRange.upperBound) : nil,
            expiresAt: expiry.wireDeadline(from: now),
            allowAnonymousMessages: allowsMessages,
            allowAnonymousFiles: allowsFiles,
            allowAnonymousImages: allowsImages,
            allowViewHistory: guestsSeeHistory,
            requireAccount: !acceptsGuests,
            requireNickname: asksNickname && acceptsGuests,
            requireEmail: asksEmail && acceptsGuests,
            requireBirthday: asksBirthday && acceptsGuests,
            allowedLanguages: languages.isEmpty ? nil : languages
        )
    }

    /// Le billet d'aperçu : « Studio — invités », `meeshy.me/chat/…`, « 0 / 50 entrées · 7 j avant la fin · Ouvert
    /// sans compte ».
    var ticket: LinkTicketPreview {
        let typed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let title = typed.isEmpty ? (conversationName ?? LinkCreationCopy.shareKind) : typed
        let entries = limitsEntries
            ? LinkTicketFigure(value: "0 / \(maxEntries)", unit: LinkCreationCopy.entriesUnit)
            : LinkTicketFigure(value: "0", unit: LinkCreationCopy.entriesUnit)
        return LinkTicketPreview(kindLabel: LinkCreationCopy.shareKind, title: title, code: shortAddress,
                                 figures: [entries, LinkCreationCopy.expiryFigure(expiry), LinkCreationCopy.guestsFigure(acceptsGuests)])
    }
}
