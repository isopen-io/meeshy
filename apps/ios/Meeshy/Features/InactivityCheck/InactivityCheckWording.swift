import Foundation
import MeeshySDK

/// Les mots de la vérification d'inactivité (#18738) : l'annonce de la SyncPill, l'état durable (en-tête, fiche,
/// profil), la notification et les réglages. Une seule source pour les langues de l'app — le catalogue. L'heure se lit
/// dans le fuseau du LECTEUR.
enum InactivityCheckWording {

    /// L'annonce de la SyncPill. Sans nom connu, la phrase parle d'« un proche ».
    static func pillLabel(kind: InactivityAnnouncementKind, name: String?) -> String {
        switch kind {
        case .alert:
            guard let name else {
                return String(localized: "inactivity.pill.alertSomeone", defaultValue: "Un proche n'a pas répondu à « Tout va bien ? »", bundle: .main)
            }
            return String(format: String(localized: "inactivity.pill.alert", defaultValue: "%@ n'a pas répondu à « Tout va bien ? »", bundle: .main), name)
        case .responded:
            guard let name else {
                return String(localized: "inactivity.pill.respondedSomeone", defaultValue: "Un proche va bien", bundle: .main)
            }
            return String(format: String(localized: "inactivity.pill.responded", defaultValue: "%@ va bien", bundle: .main), name)
        }
    }

    /// « Aucune activité depuis 8:00 » — l'état durable, à l'heure locale du lecteur.
    static func headline(_ state: InactivityAlertState, now: Date = Date()) -> String {
        String(format: String(localized: "inactivity.state.since", defaultValue: "Aucune activité depuis %@", bundle: .main),
               PhoneReachabilityWording.sinceTime(state.inactiveSince, now: now))
    }

    /// « Batterie à 9 % » — seulement quand la dernière batterie est servie.
    static func battery(_ state: InactivityAlertState) -> String? {
        guard let battery = state.lastBattery else { return nil }
        return String(format: String(localized: "inactivity.state.battery", defaultValue: "Batterie à %lld %%", bundle: .main), battery.level)
    }

    /// Ce que VoiceOver dit de l'état d'une personne : l'heure, puis la batterie.
    static func spoken(_ state: InactivityAlertState, now: Date = Date()) -> String {
        [headline(state, now: now), battery(state)].compactMap { $0 }.joined(separator: ", ")
    }

    /// La dernière position ouverte dans Plans ; `nil` quand elle n'est pas servie.
    static func mapsURL(for state: InactivityAlertState) -> URL? {
        guard let position = state.lastPosition else { return nil }
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "ll", value: "\(position.latitude),\(position.longitude)")]
        return components?.url
    }

    static var lastPosition: String {
        String(localized: "inactivity.state.lastPosition", defaultValue: "Voir sa dernière position", bundle: .main)
    }

    static func iconName(for kind: InactivityAnnouncementKind) -> String {
        kind == .alert ? "person.fill.questionmark" : "checkmark.circle.fill"
    }

    // MARK: - La notification

    static func wellnessOkAction(bundle: Bundle) -> String {
        String(localized: "notifications.action.wellnessOk", defaultValue: "Je vais bien", bundle: bundle)
    }

    // MARK: - Les réglages

    static var sectionTitle: String {
        String(localized: "inactivity.settings.section", defaultValue: "Vérification d'inactivité", bundle: .main)
    }
    static var delayTitle: String {
        String(localized: "inactivity.settings.delay", defaultValue: "Demander « Tout va bien ? » après", bundle: .main)
    }
    static var delaySubtitle: String {
        String(localized: "inactivity.settings.delaySubtitle", defaultValue: "Sans réponse en 30 minutes, tes Sangs sont prévenus. Tu règles chaque personne depuis sa fiche.", bundle: .main)
    }
    static func delayLabel(_ delay: InactivityCheckDelay) -> String {
        switch delay {
        case .sixHours: return String(localized: "inactivity.settings.delay6", defaultValue: "6 h", bundle: .main)
        case .twelveHours: return String(localized: "inactivity.settings.delay12", defaultValue: "12 h", bundle: .main)
        case .twentyFourHours: return String(localized: "inactivity.settings.delay24", defaultValue: "24 h", bundle: .main)
        case .off: return String(localized: "inactivity.settings.off", defaultValue: "Désactivée", bundle: .main)
        }
    }
    static var shareTitle: String {
        String(localized: "inactivity.share.person", defaultValue: "Prévenir si je ne réponds pas", bundle: .main)
    }
    static var shareFootnote: String {
        String(localized: "inactivity.share.footnote", defaultValue: "Quand « Tout va bien ? » reste sans réponse", bundle: .main)
    }
    static var saveFailed: String {
        String(localized: "inactivity.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
    }
}
