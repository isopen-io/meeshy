import Foundation
import Combine
import MeeshySDK

// MARK: - « Faire connaissance » sur la fiche d'un inconnu (#19456, planche `Autre-Inconnu`)
//
// Sous Connaissance, écrire part en DEMANDE de message : le premier message arrive dans ses demandes. La fiche la
// rédige sur place (300 signes), dit dans quelle langue la personne la lira, et l'envoie de façon optimiste. L'app dit
// si écrire part en demande et envoie le message ; sans elle, ou tant qu'elle ne sait pas, la fiche reste celle d'avant.

/// Ce que l'app fait pour un inconnu : juger si écrire part en demande, et envoyer la demande.
@MainActor
public protocol ProfileAcquaintanceProviding: AnyObject, Sendable {
    /// `true` : le cercle commun est sous Connaissance, écrire part en demande ; `false` : on s'écrit déjà ;
    /// `nil` : on ne sait pas (réseau, passerelle) — la fiche ne pose alors rien.
    func writesARequest(to userId: String) async -> Bool?
    /// Envoie la demande de message ; `false` si elle n'est pas partie (ni envoyée, ni mise en file).
    func sendMessageRequest(to userId: String, text: String) async -> Bool
}

/// Le brouillon de la demande : 300 signes au plus, le surplus tombe.
public nonisolated struct ProfileMessageRequestDraft: Equatable, Sendable {
    public static let limit = 300

    public let text: String

    public init(_ text: String = "") {
        self.text = String(text.prefix(Self.limit))
    }

    public var count: Int { text.count }

    /// Le message qui part, sans les blancs du bord ; `nil` s'il n'y a rien à dire.
    public var message: String? {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

/// Où en est la demande : en rédaction, envoyée (aussitôt, optimiste), ou pas partie (le brouillon revient).
public nonisolated enum ProfileMessageRequestStage: Equatable, Sendable {
    case composing
    case sent
    case unsent
}

/// La rédaction puis l'envoi optimiste de la demande.
public nonisolated struct ProfileMessageRequestFlow: Equatable, Sendable {
    public private(set) var draft = ProfileMessageRequestDraft()
    public private(set) var stage: ProfileMessageRequestStage = .composing

    public init() {}

    public var canSend: Bool {
        stage != .sent && draft.message != nil
    }

    public mutating func edit(_ text: String) {
        guard stage != .sent else { return }
        draft = ProfileMessageRequestDraft(text)
        stage = .composing
    }

    /// Optimiste : la demande est « envoyée » tout de suite, et le message qui part est rendu ; rien sans texte ou
    /// si elle est déjà partie.
    public mutating func submit() -> String? {
        guard canSend, let message = draft.message else { return nil }
        stage = .sent
        return message
    }

    /// Le verdict de l'envoi : un refus défait l'optimisme, le brouillon reste pour réessayer.
    public mutating func settle(delivered: Bool) {
        guard stage == .sent, !delivered else { return }
        stage = .unsent
    }
}

/// L'état de « Faire connaissance » sur une fiche : le verdict de l'app et la demande en cours.
@MainActor
final class ProfileAcquaintanceModel: ObservableObject {
    nonisolated deinit {}

    @Published private(set) var writesARequest = false
    @Published private(set) var flow = ProfileMessageRequestFlow()

    private var judgedUserId: String?

    /// Une fois par personne : le verdict de l'app. Sans app ou sans verdict, rien ne change sur la fiche.
    func resolve(userId: String?, host: (any ProfileAcquaintanceProviding)?) async {
        guard let host, let userId, !userId.isEmpty, judgedUserId != userId else { return }
        guard let verdict = await host.writesARequest(to: userId) else { return }
        judgedUserId = userId
        writesARequest = verdict
    }

    func edit(_ text: String) {
        flow.edit(text)
    }

    func send(to userId: String?, host: (any ProfileAcquaintanceProviding)?) async {
        guard let host, let userId, !userId.isEmpty else { return }
        var next = flow
        guard let message = next.submit() else { return }
        flow = next
        let delivered = await host.sendMessageRequest(to: userId, text: message)
        var settled = flow
        settled.settle(delivered: delivered)
        flow = settled
    }
}

/// La langue dans laquelle la personne lira la demande : sa langue principale servie, nommée dans la langue de
/// l'interface (« portugais »). Sans langue servie, rien ne se dit.
nonisolated enum ProfileReadingLanguage {
    static func name(of code: String?, in locale: Locale) -> String? {
        let trimmed = (code ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard let base = trimmed.split(whereSeparator: { $0 == "-" || $0 == "_" }).first else { return nil }
        let name = locale.localizedString(forLanguageCode: base.lowercased()) ?? ""
        return name.isEmpty || name.lowercased() == base.lowercased() ? nil : name
    }
}
