import Foundation

// MARK: - Signaler (planche `Signaler`, #18873)
//
// Le signalement d'un profil : un motif parmi huit, un mot facultatif de 500 signes au plus, et « Bloquer aussi ».
// La valeur est pure : la feuille la tient, la fiche l'envoie.

/// Les huit motifs d'un signalement, à la valeur de l'énumération de la passerelle.
nonisolated enum ProfileReportReason: String, CaseIterable, Sendable {
    case spam
    case inappropriate
    case harassment
    case violence
    case hateSpeech = "hate_speech"
    case fakeProfile = "fake_profile"
    case impersonation
    case other

    /// Le glyphe de la tuile (K47).
    var systemImage: String {
        switch self {
        case .spam: return "megaphone"
        case .inappropriate: return "eye.slash"
        case .harassment: return "exclamationmark.shield"
        case .violence: return "exclamationmark.triangle"
        case .hateSpeech: return "hand.raised"
        case .fakeProfile: return "theatermasks"
        case .impersonation: return "person.text.rectangle"
        case .other: return "ellipsis"
        }
    }

    /// `@MainActor` malgré le type `nonisolated` : `Bundle.module`.
    @MainActor var label: String {
        switch self {
        case .spam: return String(localized: "report.reason.spam", defaultValue: "Spam", bundle: .module)
        case .inappropriate: return String(localized: "report.reason.inappropriate", defaultValue: "Contenu inapproprié", bundle: .module)
        case .harassment: return String(localized: "report.reason.harassment", defaultValue: "Harcèlement", bundle: .module)
        case .violence: return String(localized: "report.reason.violence", defaultValue: "Violence", bundle: .module)
        case .hateSpeech: return String(localized: "report.reason.hate_speech", defaultValue: "Discours haineux", bundle: .module)
        case .fakeProfile: return String(localized: "report.reason.fake_profile", defaultValue: "Faux profil", bundle: .module)
        case .impersonation: return String(localized: "report.reason.impersonation", defaultValue: "Usurpation d'identité", bundle: .module)
        case .other: return String(localized: "report.reason.other", defaultValue: "Autre", bundle: .module)
        }
    }

}

/// Ce que la feuille « Signaler » tient : le motif choisi, le mot, « Bloquer aussi » et les messages joints. Chaque
/// geste rend une valeur nouvelle ; rien ne se mute en place.
nonisolated struct ProfileReportDraft: Sendable, Equatable {
    static let detailsLimit = 500
    /// Ce qu'un signalement joint au plus, quoi que la passerelle annonce (#19609).
    static let attachmentsLimit = 10

    let reason: ProfileReportReason?
    let details: String
    let alsoBlocks: Bool
    /// Les messages joints, dans l'ordre où on les a cochés, sans doublon et 10 au plus.
    let attachments: [ProfileReportAttachment]

    init(reason: ProfileReportReason? = nil, details: String = "", alsoBlocks: Bool = false,
         attachments: [ProfileReportAttachment] = []) {
        self.reason = reason
        self.details = String(details.prefix(Self.detailsLimit))
        self.alsoBlocks = alsoBlocks
        self.attachments = Self.bounded(attachments)
    }

    /// Un toucher de tuile : l'identifiant d'un motif le choisit, un identifiant inconnu ne change rien.
    func choosing(_ id: String) -> ProfileReportDraft {
        guard let chosen = ProfileReportReason(rawValue: id) else { return self }
        return with(reason: chosen)
    }

    /// Le mot, coupé à 500 signes.
    func writing(_ text: String) -> ProfileReportDraft {
        with(details: text)
    }

    func togglingBlock() -> ProfileReportDraft {
        with(alsoBlocks: !alsoBlocks)
    }

    /// Cocher un message le joint, le recocher le retire. Au-delà de `limit` (bornée à 10), rien ne change ; un
    /// message chiffré de bout en bout ne se joint qu'avec le consentement explicite de la personne qui signale.
    func toggling(_ attachment: ProfileReportAttachment, limit: Int = ProfileReportDraft.attachmentsLimit,
                  consented: Bool = false) -> ProfileReportDraft {
        if isAttached(attachment.id) {
            return with(attachments: attachments.filter { $0.id != attachment.id })
        }
        guard attachments.count < min(limit, Self.attachmentsLimit) else { return self }
        guard !attachment.isEndToEnd || consented else { return self }
        return with(attachments: attachments + [attachment])
    }

    func isAttached(_ id: String) -> Bool {
        attachments.contains { $0.id == id }
    }

    /// Les identifiants qui partent avec le signalement.
    var sentMessageIds: [String] { attachments.map(\.id) }

    private func with(reason: ProfileReportReason? = nil, details: String? = nil, alsoBlocks: Bool? = nil,
                      attachments: [ProfileReportAttachment]? = nil) -> ProfileReportDraft {
        ProfileReportDraft(reason: reason ?? self.reason, details: details ?? self.details,
                           alsoBlocks: alsoBlocks ?? self.alsoBlocks, attachments: attachments ?? self.attachments)
    }

    private static func bounded(_ attachments: [ProfileReportAttachment]) -> [ProfileReportAttachment] {
        let unique = attachments.enumerated().filter { index, item in
            !attachments.prefix(index).contains { $0.id == item.id }
        }.map(\.element)
        return Array(unique.prefix(attachmentsLimit))
    }

    /// Rien ne part sans motif.
    var canSend: Bool { reason != nil }

    /// Le mot tel qu'il part : sans blancs autour, et rien du tout s'il est vide.
    var sentDetails: String? {
        let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Un message qu'un signalement de profil peut joindre (#19609) : son identifiant serveur, sa conversation, l'extrait
/// que la vignette montre et sa date. `isEndToEnd` : sa conversation est chiffrée de bout en bout, l'extrait vient du
/// clair que l'appareil tient, et il ne se joint qu'avec un consentement explicite.
public nonisolated struct ProfileReportAttachment: Sendable, Equatable, Identifiable {
    public let id: String
    public let conversationId: String
    public let excerpt: String
    public let sentAt: Date
    public let isEndToEnd: Bool

    public init(id: String, conversationId: String, excerpt: String, sentAt: Date, isEndToEnd: Bool = false) {
        self.id = id
        self.conversationId = conversationId
        self.excerpt = excerpt
        self.sentAt = sentAt
        self.isEndToEnd = isEndToEnd
    }
}

/// Ce que l'envoi a donné : parti ou non, et la personne bloquée ou non.
nonisolated struct ProfileReportOutcome: Sendable, Equatable {
    let isSent: Bool
    let isBlocked: Bool

    static let notSent = ProfileReportOutcome(isSent: false, isBlocked: false)
}
