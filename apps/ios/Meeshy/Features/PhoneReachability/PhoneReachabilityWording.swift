import Foundation
import MeeshySDK

/// Les mots du téléphone injoignable (#18737) : l'annonce de la SyncPill, l'état durable (en-tête, fiche, profil) et
/// les réglages. Une seule source pour les sept langues — le catalogue. L'heure se lit dans le fuseau du LECTEUR.
enum PhoneReachabilityWording {

    /// L'annonce de la SyncPill. Sans nom connu, la phrase parle d'« un proche ».
    static func pillLabel(kind: PhoneReachabilityAnnouncementKind, name: String?, since: Date?, now: Date = Date()) -> String {
        switch kind {
        case .unreachable:
            let time = since.map { sinceTime($0, now: now) } ?? sinceTime(now, now: now)
            guard let name else {
                return String(format: String(localized: "phoneReachability.pill.unreachableSomeone", defaultValue: "Un proche a un téléphone injoignable depuis %@", bundle: .main), time)
            }
            return String(format: String(localized: "phoneReachability.pill.unreachable", defaultValue: "%1$@ a un téléphone injoignable depuis %2$@", bundle: .main), name, time)
        case .reachable:
            guard let name else {
                return String(localized: "phoneReachability.pill.reachableSomeone", defaultValue: "Un proche est de nouveau joignable", bundle: .main)
            }
            return String(format: String(localized: "phoneReachability.pill.reachable", defaultValue: "%@ est de nouveau joignable", bundle: .main), name)
        }
    }

    /// « Téléphone injoignable depuis 14:10 » — l'état durable.
    static func headline(_ state: PhoneReachabilityState, now: Date = Date()) -> String {
        String(format: String(localized: "phoneReachability.state.since", defaultValue: "Téléphone injoignable depuis %@", bundle: .main),
               sinceTime(state.unreachableSince, now: now))
    }

    /// La cause probable ; rien quand le serveur en sert une que ce client ne connaît pas.
    static func cause(_ cause: PhoneUnreachableCause) -> String? {
        switch cause {
        case .battery:
            return String(localized: "phoneReachability.cause.battery", defaultValue: "Batterie vide, probablement", bundle: .main)
        case .network:
            return String(localized: "phoneReachability.cause.network", defaultValue: "Sans réseau ou en mode avion, probablement", bundle: .main)
        case .unknown:
            return nil
        }
    }

    /// Ce que VoiceOver dit de l'état d'une personne : l'heure, puis la cause.
    static func spoken(_ state: PhoneReachabilityState, now: Date = Date()) -> String {
        [headline(state, now: now), cause(state.cause)].compactMap { $0 }.joined(separator: ", ")
    }

    /// L'heure locale du lecteur ; le jour s'ajoute quand ce n'est pas aujourd'hui, la date au-delà d'une semaine.
    static func sinceTime(_ date: Date, now: Date, calendar: Calendar = .current, locale: Locale = .current) -> String {
        let formatter = DateFormatter()
        formatter.locale = locale
        formatter.calendar = calendar
        formatter.timeZone = calendar.timeZone
        formatter.setLocalizedDateFormatFromTemplate(template(for: date, now: now, calendar: calendar))
        return formatter.string(from: date)
    }

    static func template(for date: Date, now: Date, calendar: Calendar) -> String {
        if calendar.isDate(date, inSameDayAs: now) { return "jm" }
        let days = calendar.dateComponents([.day], from: calendar.startOfDay(for: date), to: calendar.startOfDay(for: now)).day ?? 0
        return (0..<7).contains(days) ? "EEEEjm" : "dMMMjm"
    }

    static func iconName(for kind: PhoneReachabilityAnnouncementKind?) -> String {
        kind == .reachable ? "iphone" : "iphone.slash"
    }

    static func dotStyle(for kind: PhoneReachabilityAnnouncementKind?) -> SyncPillDotStyle {
        kind == .reachable ? .success : .warning
    }
}

/// Les mots du téléphone injoignable sur une fiche et dans les réglages.
enum PhoneReachabilitySettingsWording {
    /// « Me prévenir s'il devient injoignable » (#19433) : SON téléphone, MA notification.
    static var alertMe: String {
        String(localized: "phoneReachability.alert.me", defaultValue: "Me prévenir s'il devient injoignable", bundle: .main)
    }
    static func shareWith(name: String) -> String {
        String(format: String(localized: "phoneReachability.share.with", defaultValue: "Prévenir %@ si mon téléphone est injoignable", bundle: .main), name)
    }
    static var shareFootnote: String {
        String(localized: "phoneReachability.share.footnote", defaultValue: "Seulement quand ton téléphone ne répond plus, avec l'heure de son dernier signe de vie", bundle: .main)
    }
    static func consentTitle(name: String) -> String {
        String(format: String(localized: "phoneReachability.consent.title", defaultValue: "%@ est maintenant un Proche", bundle: .main), name)
    }
    static var consentBody: String {
        String(localized: "phoneReachability.consent.body", defaultValue: "Tu peux le prévenir quand ton téléphone ne répond plus (batterie vide, sans réseau), pour qu'il ne s'inquiète pas. Ce réglage reste modifiable ici.", bundle: .main)
    }
    static var consentConfirm: String {
        String(localized: "phoneReachability.consent.confirm", defaultValue: "Continuer", bundle: .main)
    }
    static var sectionTitle: String {
        String(localized: "phoneReachability.settings.section", defaultValue: "Téléphone injoignable", bundle: .main)
    }
    static var globalTitle: String {
        String(localized: "phoneReachability.settings.global", defaultValue: "Prévenir mes Proches si mon téléphone est injoignable", bundle: .main)
    }
    static var globalSubtitle: String {
        String(localized: "phoneReachability.settings.globalSubtitle", defaultValue: "Tes Proches et tes Sangs voient depuis quand ton téléphone ne répond plus. Tu règles chaque personne depuis sa fiche.", bundle: .main)
    }
    static var saveFailed: String {
        String(localized: "phoneReachability.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
    }
}
