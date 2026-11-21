import Foundation
import MeeshySDK

/// Les mots de la chute détectée (#18748) : l'annonce de la SyncPill, l'état durable (en-tête, fiche, profil), la
/// bannière de l'émetteur, l'accord explicite et les réglages. Une seule source pour les langues de l'app — le
/// catalogue. Aucun mot de santé au-delà de « chute » ; l'heure se lit dans le fuseau du LECTEUR.
enum FallDetectionWording {

    /// L'annonce de la SyncPill. Sans nom connu, la phrase parle d'« un proche ».
    static func pillLabel(kind: FallAnnouncementKind, name: String?) -> String {
        switch kind {
        case .detected:
            guard let name else {
                return String(localized: "fall.pill.detectedSomeone", defaultValue: "Une chute a été détectée sur la montre d'un proche", bundle: .main)
            }
            return String(format: String(localized: "fall.pill.detected", defaultValue: "Une chute a été détectée sur la montre de %@", bundle: .main), name)
        case .responded:
            guard let name else {
                return String(localized: "fall.pill.respondedSomeone", defaultValue: "Un proche va bien", bundle: .main)
            }
            return String(format: String(localized: "fall.pill.responded", defaultValue: "%@ va bien", bundle: .main), name)
        }
    }

    /// « Chute détectée à 16:42 » — l'état durable, à l'heure locale du lecteur.
    static func headline(_ state: FallState, now: Date = Date()) -> String {
        String(format: String(localized: "fall.state.at", defaultValue: "Chute détectée à %@", bundle: .main),
               PhoneReachabilityWording.sinceTime(state.detectedAt, now: now))
    }

    /// « Batterie à 41 % » — seulement quand la dernière batterie est servie.
    static func battery(_ state: FallState) -> String? {
        guard let battery = state.lastBattery else { return nil }
        return String(format: String(localized: "fall.state.battery", defaultValue: "Batterie à %lld %%", bundle: .main), battery.level)
    }

    /// Ce que VoiceOver dit de l'état d'une personne : l'heure, puis la batterie.
    static func spoken(_ state: FallState, now: Date = Date()) -> String {
        [headline(state, now: now), battery(state)].compactMap { $0 }.joined(separator: ", ")
    }

    /// La dernière position ouverte dans Plans ; `nil` quand elle n'est pas servie.
    static func mapsURL(for state: FallState) -> URL? {
        guard let position = state.lastPosition else { return nil }
        var components = URLComponents(string: "https://maps.apple.com/")
        components?.queryItems = [URLQueryItem(name: "ll", value: "\(position.latitude),\(position.longitude)")]
        return components?.url
    }

    static var lastPosition: String {
        String(localized: "fall.state.lastPosition", defaultValue: "Voir sa dernière position", bundle: .main)
    }

    static let stateIconName = "figure.fall"

    static func iconName(for kind: FallAnnouncementKind) -> String {
        kind == .detected ? stateIconName : "checkmark.circle.fill"
    }

    // MARK: - La bannière de l'émetteur

    static var ownBannerTitle: String {
        String(localized: "fall.own.title", defaultValue: "Une chute a été détectée — tout va bien ?", bundle: .main)
    }
    static var ownBannerSubtitle: String {
        String(localized: "fall.own.subtitle", defaultValue: "Tes Sangs ont été prévenus.", bundle: .main)
    }
    static var imOk: String {
        String(localized: "fall.own.ok", defaultValue: "Je vais bien", bundle: .main)
    }
    static var imOkFailed: String {
        String(localized: "fall.own.okFailed", defaultValue: "Ta réponse n'est pas partie. Réessaie « Je vais bien ».", bundle: .main)
    }

    // MARK: - La notification

    /// Ce que l'écran verrouillé montre quand les aperçus sont masqués : rien de santé.
    static func hiddenPreviewPlaceholder(bundle: Bundle) -> String {
        String(localized: "fall.notification.hiddenPreview", defaultValue: "Alerte de sécurité", bundle: bundle)
    }

    // MARK: - L'accord et les réglages

    static var sectionTitle: String {
        String(localized: "fall.settings.section", defaultValue: "Détection de chute", bundle: .main)
    }
    static var globalTitle: String {
        String(localized: "fall.settings.global", defaultValue: "Prévenir mes Sangs si ma montre détecte une chute", bundle: .main)
    }
    static var globalSubtitle: String {
        String(localized: "fall.settings.globalSubtitle", defaultValue: "Avec ton Apple Watch. Désactivée tant que tu ne l'as pas acceptée.", bundle: .main)
    }
    static var consentTitle: String {
        String(localized: "fall.consent.title", defaultValue: "Prévenir tes Sangs en cas de chute", bundle: .main)
    }
    static var consentWhat: String {
        String(localized: "fall.consent.what", defaultValue: "Ce qui part : l'heure de la chute que ton Apple Watch a détectée — puis ta dernière position et ta batterie, seulement si tu les partages déjà avec eux. Aucune autre donnée de santé.", bundle: .main)
    }
    static var consentWho: String {
        String(localized: "fall.consent.who", defaultValue: "À qui : tes Sangs. Tu retires chacun depuis sa fiche.", bundle: .main)
    }
    static var consentHowLong: String {
        String(localized: "fall.consent.howLong", defaultValue: "Combien de temps : 6 heures au plus, ou jusqu'à ce que tu répondes « Je vais bien ». Rien n'est gardé ensuite.", bundle: .main)
    }
    static var consentNotEmergency: String {
        String(localized: "fall.consent.notEmergency", defaultValue: "Ce n'est pas un service d'urgence : ton Apple Watch appelle déjà les secours.", bundle: .main)
    }
    static var consentLockedLimit: String {
        String(localized: "fall.consent.lockedLimit", defaultValue: "Si ton iPhone reste verrouillé plus de 30 minutes après la chute, l'alerte ne part pas — ton Apple Watch appelle déjà les secours.", bundle: .main)
    }
    static var consentWithdraw: String {
        String(localized: "fall.consent.withdraw", defaultValue: "Pour retirer ton accord : coupe ce réglage. La collecte s'arrête et l'alerte en cours s'efface chez tes Sangs.", bundle: .main)
    }
    static var consentAccept: String {
        String(localized: "fall.consent.accept", defaultValue: "J'accepte", bundle: .main)
    }
    static var consentCancel: String {
        String(localized: "fall.consent.cancel", defaultValue: "Pas maintenant", bundle: .main)
    }
    static var consentMinor: String {
        String(localized: "fall.consent.minor", defaultValue: "Ce réglage est réservé aux 15 ans et plus.", bundle: .main)
    }
    static var healthDenied: String {
        String(localized: "fall.consent.healthDenied", defaultValue: "Autorise Meeshy à lire les chutes dans Santé pour que tes Sangs soient prévenus.", bundle: .main)
    }
    static var healthUnavailable: String {
        String(localized: "fall.consent.healthUnavailable", defaultValue: "Santé n'a pas donné accès aux chutes : la détection reste désactivée et ton accord a été retiré.", bundle: .main)
    }
    static var detectionInactive: String {
        String(localized: "fall.settings.inactive", defaultValue: "Détection inactive — autorise Santé", bundle: .main)
    }
    static var authorizeHealth: String {
        String(localized: "fall.settings.authorizeHealth", defaultValue: "Autoriser", bundle: .main)
    }
    static var shareTitle: String {
        String(localized: "fall.share.person", defaultValue: "Prévenir si ma montre détecte une chute", bundle: .main)
    }
    static var shareFootnote: String {
        String(localized: "fall.share.footnote", defaultValue: "Quand ton Apple Watch détecte une chute", bundle: .main)
    }
    static var saveFailed: String {
        String(localized: "fall.settings.saveFailed", defaultValue: "Réglage non enregistré, réessaie", bundle: .main)
    }
}

/// Ce que la SyncPill annonce d'une chute : la chute détectée, ou « va bien ».
nonisolated enum FallAnnouncementKind: Sendable, Equatable {
    case detected
    case responded
}
