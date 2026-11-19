import Foundation
import MeeshySDK

/// Les mots d'« en appel » (#18753) : l'annonce de la SyncPill, l'état durable (en-tête, fiche, profil) et les
/// réglages. Une seule source pour les langues de l'app — le catalogue. JAMAIS l'interlocuteur.
enum PhoneCallWording {

    /// L'annonce de la SyncPill. Sans nom connu, la phrase parle d'« un proche ».
    static func pillLabel(kind: PhoneCallAnnouncementKind, name: String?) -> String {
        switch kind {
        case .started:
            guard let name else {
                return String(localized: "phoneCall.pill.startedSomeone", defaultValue: "Un proche est en appel", bundle: .main)
            }
            return String(format: String(localized: "phoneCall.pill.started", defaultValue: "%@ est en appel", bundle: .main), name)
        case .ended:
            guard let name else {
                return String(localized: "phoneCall.pill.endedSomeone", defaultValue: "Un proche a raccroché", bundle: .main)
            }
            return String(format: String(localized: "phoneCall.pill.ended", defaultValue: "%@ a raccroché", bundle: .main), name)
        }
    }

    /// « En appel depuis 12 min » pendant la première heure, puis « En appel depuis 14:00 », à l'heure locale du lecteur.
    static func headline(_ state: PhoneCallState, now: Date = Date()) -> String {
        let minutes = Int(now.timeIntervalSince(state.since) / 60)
        guard minutes >= 60 else {
            return String(format: String(localized: "phoneCall.state.sinceMinutes", defaultValue: "En appel depuis %lld min", bundle: .main),
                          max(1, minutes))
        }
        return String(format: String(localized: "phoneCall.state.since", defaultValue: "En appel depuis %@", bundle: .main),
                      PhoneReachabilityWording.sinceTime(state.since, now: now))
    }

    static func iconName(for kind: PhoneCallAnnouncementKind) -> String {
        kind == .started ? "phone.fill" : "phone.down.fill"
    }

    static let stateIconName = "phone.fill"

    // MARK: - Les réglages

    static var sectionTitle: String {
        String(localized: "phoneCall.settings.section", defaultValue: "En appel", bundle: .main)
    }
    static var globalTitle: String {
        String(localized: "phoneCall.settings.global", defaultValue: "Montrer à mes Sangs que je suis en appel", bundle: .main)
    }
    static var globalSubtitle: String {
        String(localized: "phoneCall.settings.globalSubtitle", defaultValue: "Jamais avec qui. Tu règles chaque personne depuis sa fiche.", bundle: .main)
    }
    static var shareTitle: String {
        String(localized: "phoneCall.share.person", defaultValue: "Montrer quand je suis en appel", bundle: .main)
    }
    static var shareFootnote: String {
        String(localized: "phoneCall.share.footnote", defaultValue: "Jamais avec qui", bundle: .main)
    }
    static var saveFailed: String {
        String(localized: "phoneCall.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
    }
}
