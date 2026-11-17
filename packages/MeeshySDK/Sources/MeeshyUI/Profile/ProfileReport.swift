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

    /// La phrase sous le motif : ce qu'il recouvre, pour choisir sans hésiter.
    @MainActor var detail: String {
        switch self {
        case .spam: return String(localized: "report.reason.spam.detail", defaultValue: "Pubs, liens en boucle, arnaques", bundle: .module)
        case .inappropriate:
            return String(localized: "report.reason.inappropriate.detail", defaultValue: "Images ou propos choquants", bundle: .module)
        case .harassment:
            return String(localized: "report.reason.harassment.detail", defaultValue: "Messages insistants, moqueries", bundle: .module)
        case .violence:
            return String(localized: "report.reason.violence.detail", defaultValue: "Menaces ou appels à faire du mal", bundle: .module)
        case .hateSpeech:
            return String(localized: "report.reason.hate_speech.detail", defaultValue: "Attaques sur l'origine, le genre, la foi", bundle: .module)
        case .fakeProfile:
            return String(localized: "report.reason.fake_profile.detail", defaultValue: "Un compte inventé de toutes pièces", bundle: .module)
        case .impersonation:
            return String(localized: "report.reason.impersonation.detail", defaultValue: "Se fait passer pour quelqu'un d'autre", bundle: .module)
        case .other: return String(localized: "report.reason.other.detail", defaultValue: "Raconte-le avec tes mots", bundle: .module)
        }
    }
}

/// Ce que la feuille « Signaler » tient : le motif choisi, le mot, et « Bloquer aussi ». Chaque geste rend une valeur
/// nouvelle ; rien ne se mute en place.
nonisolated struct ProfileReportDraft: Sendable, Equatable {
    static let detailsLimit = 500

    let reason: ProfileReportReason?
    let details: String
    let alsoBlocks: Bool

    init(reason: ProfileReportReason? = nil, details: String = "", alsoBlocks: Bool = false) {
        self.reason = reason
        self.details = String(details.prefix(Self.detailsLimit))
        self.alsoBlocks = alsoBlocks
    }

    /// Un toucher de tuile : l'identifiant d'un motif le choisit, un identifiant inconnu ne change rien.
    func choosing(_ id: String) -> ProfileReportDraft {
        guard let chosen = ProfileReportReason(rawValue: id) else { return self }
        return ProfileReportDraft(reason: chosen, details: details, alsoBlocks: alsoBlocks)
    }

    /// Le mot, coupé à 500 signes.
    func writing(_ text: String) -> ProfileReportDraft {
        ProfileReportDraft(reason: reason, details: text, alsoBlocks: alsoBlocks)
    }

    func togglingBlock() -> ProfileReportDraft {
        ProfileReportDraft(reason: reason, details: details, alsoBlocks: !alsoBlocks)
    }

    /// Rien ne part sans motif.
    var canSend: Bool { reason != nil }

    /// Le mot tel qu'il part : sans blancs autour, et rien du tout s'il est vide.
    var sentDetails: String? {
        let trimmed = details.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Ce que l'envoi a donné : parti ou non, et la personne bloquée ou non.
nonisolated struct ProfileReportOutcome: Sendable, Equatable {
    let isSent: Bool
    let isBlocked: Bool

    static let notSent = ProfileReportOutcome(isSent: false, isBlocked: false)
}
