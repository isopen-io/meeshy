import Foundation
import MeeshySDK

// MARK: - Joindre des messages à un signalement (planche `Signaler`, #19609)
//
// La feuille « Signaler » joint, au plus dix, des messages que la personne signalée a écrits dans nos conversations.
// La source est le cache local (jamais d'attente réseau) et la section n'existe que si la passerelle annonce le champ
// `attachedMessageIds` (#19351) : sur une passerelle qui ne l'annonce pas, la feuille reste celle d'avant.

/// Les messages qu'un signalement de profil peut joindre, et ce que la passerelle en accepte.
@MainActor
public protocol ProfileReportMessagesProviding: AnyObject {
    /// Combien de messages la passerelle accepte d'un signalement ; `nil` tant qu'elle ne l'annonce pas.
    var attachableLimit: Int? { get }
    /// Les messages de `userId` dans nos conversations, lus du cache local, les plus récents d'abord. Jamais un
    /// message dont le contenu est protégé ; un message chiffré de bout en bout seulement si l'appareil en a le clair,
    /// et marqué `isEndToEnd`.
    func attachableMessages(from userId: String) async -> [ProfileReportAttachment]
}

/// Les règles de la section, pures.
nonisolated enum ProfileReportAttachmentsRule {
    /// La limite que la section applique : celle que la passerelle annonce, bornée à 10 ; `nil` (section absente)
    /// quand elle n'annonce rien ou une limite nulle.
    static func offeredLimit(_ announced: Int?) -> Int? {
        guard let announced, announced > 0 else { return nil }
        return min(announced, ProfileReportDraft.attachmentsLimit)
    }

    /// « + Ajouter » reste tant qu'on peut encore joindre.
    static func canAdd(_ draft: ProfileReportDraft, limit: Int) -> Bool {
        draft.attachments.count < min(limit, ProfileReportDraft.attachmentsLimit)
    }

    /// Le brouillon qui part : sans aucun message joint quand la section est absente, quoi que le brouillon tienne.
    static func sending(_ draft: ProfileReportDraft, limit: Int?) -> ProfileReportDraft {
        let kept = offeredLimit(limit).map { Array(draft.attachments.prefix($0)) } ?? []
        return ProfileReportDraft(reason: draft.reason, details: draft.details, alsoBlocks: draft.alsoBlocks, attachments: kept)
    }

    /// Ce que la feuille lit à l'ouverture du choix : rien sans source ni personne.
    @MainActor static func loader(_ source: (any ProfileReportMessagesProviding)?,
                                  userId: String?) -> () async -> [ProfileReportAttachment] {
        guard let source, let userId, !userId.isEmpty else { return { [] } }
        return { await source.attachableMessages(from: userId) }
    }

    /// Le pied de la vignette : « Aujourd'hui · 07:12 », « Hier · 23:41 », sinon la date courte et l'heure.
    @MainActor static func caption(for date: Date, now: Date = Date(), calendar: Calendar = .current) -> String {
        let time = date.formatted(date: .omitted, time: .shortened)
        if calendar.isDate(date, inSameDayAs: now) { return "\(ProfileReportAttachmentsCopy.today) · \(time)" }
        if let yesterday = calendar.date(byAdding: .day, value: -1, to: now), calendar.isDate(date, inSameDayAs: yesterday) {
            return "\(ProfileReportAttachmentsCopy.yesterday) · \(time)"
        }
        return "\(date.formatted(.dateTime.day().month(.abbreviated))) · \(time)"
    }
}

extension ProfileReportAttachment {
    /// Un extrait du cache local : jamais chiffré de bout en bout (la base n'en garde pas le clair).
    public nonisolated init(excerpt: ReportableMessageExcerpt) {
        self.init(id: excerpt.messageId, conversationId: excerpt.conversationId, excerpt: excerpt.text,
                  sentAt: excerpt.sentAt, isEndToEnd: false)
    }
}

enum ProfileReportAttachmentsCopy {
    static var title: String {
        String(localized: "profile.report.attach.title", defaultValue: "Joindre des messages", bundle: .module)
    }

    static func count(_ count: Int) -> String {
        String(localized: "profile.report.attach.count", defaultValue: "\(count) joints", bundle: .module)
    }

    static var add: String {
        String(localized: "profile.report.attach.add", defaultValue: "Ajouter", bundle: .module)
    }

    static var pickerTitle: String {
        String(localized: "profile.report.attach.pickerTitle", defaultValue: "Nos messages", bundle: .module)
    }

    static var empty: String {
        String(localized: "profile.report.attach.empty", defaultValue: "Aucun message à joindre", bundle: .module)
    }

    static var done: String {
        String(localized: "profile.report.attach.done", defaultValue: "Terminé", bundle: .module)
    }

    static func limitReached(_ count: Int) -> String {
        String(localized: "profile.report.attach.limit", defaultValue: "\(count) messages au plus", bundle: .module)
    }

    static var today: String {
        String(localized: "profile.report.attach.today", defaultValue: "Auj.", bundle: .module)
    }

    static var yesterday: String {
        String(localized: "profile.report.attach.yesterday", defaultValue: "Hier", bundle: .module)
    }

    static var encryptedConsentTitle: String {
        String(localized: "profile.report.attach.e2ee.title", defaultValue: "Joindre un message chiffré ?", bundle: .module)
    }

    static var encryptedConsentMessage: String {
        String(localized: "profile.report.attach.e2ee.message",
               defaultValue: "Chiffré de bout en bout : le joindre en confie le texte aux modérateurs.",
               bundle: .module)
    }

    static var encryptedConsentConfirm: String {
        String(localized: "profile.report.attach.e2ee.confirm", defaultValue: "Joindre quand même", bundle: .module)
    }

    static var encryptedBadge: String {
        String(localized: "profile.report.attach.e2ee.badge", defaultValue: "Chiffré", bundle: .module)
    }
}
