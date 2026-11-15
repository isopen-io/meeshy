import Foundation
import MeeshySDK

/// Les mots de la batterie des proches (#14147) : l'annonce de la SyncPill, le détail d'état et les réglages.
/// Une seule source pour les sept langues — le catalogue.
enum BatteryAnnouncementWording {

    /// L'annonce d'un épisode, nommée par la personne. Sans niveau connu, la phrase se dit sans chiffre.
    static func label(kind: BatteryAnnouncementKind, name: String, level: Int?, threshold: Int?) -> String {
        switch kind {
        case .low:
            return withLevel(level, name: name,
                             leveled: String(localized: "battery.pill.low", defaultValue: "%1$@ · batterie faible (%2$lld %%)", bundle: .main),
                             bare: String(localized: "battery.pill.lowBare", defaultValue: "%@ · batterie faible", bundle: .main))
        case .threshold:
            return withLevel(threshold ?? level, name: name,
                             leveled: String(localized: "battery.pill.threshold", defaultValue: "%1$@ · batterie à %2$lld %%", bundle: .main),
                             bare: String(localized: "battery.pill.lowBare", defaultValue: "%@ · batterie faible", bundle: .main))
        case .critical:
            return withLevel(level, name: name,
                             leveled: String(localized: "battery.pill.critical", defaultValue: "%1$@ · batterie critique (%2$lld %%)", bundle: .main),
                             bare: String(localized: "battery.pill.criticalBare", defaultValue: "%@ · batterie critique", bundle: .main))
        case .criticalDrop:
            return withLevel(level, name: name,
                             leveled: String(localized: "battery.pill.criticalDrop", defaultValue: "%1$@ · batterie presque vide (%2$lld %%)", bundle: .main),
                             bare: String(localized: "battery.pill.criticalBare", defaultValue: "%@ · batterie critique", bundle: .main))
        case .probablyOff:
            return String(format: String(localized: "battery.pill.probablyOff", defaultValue: "%@ · téléphone probablement éteint", bundle: .main), name)
        case .charging:
            return String(format: String(localized: "battery.pill.charging", defaultValue: "%@ · en charge", bundle: .main), name)
        case .backOn:
            return String(format: String(localized: "battery.pill.backOn", defaultValue: "%@ · téléphone rallumé", bundle: .main), name)
        case .recharged:
            return String(format: String(localized: "battery.pill.recharged", defaultValue: "%@ · batterie rechargée", bundle: .main), name)
        case .ended:
            return String(format: String(localized: "battery.pill.ended", defaultValue: "%@ · batterie de nouveau normale", bundle: .main), name)
        }
    }

    /// Le nom quand aucune conversation ne le connaît encore.
    static var someoneClose: String {
        String(localized: "battery.someoneClose", defaultValue: "Un proche", bundle: .main)
    }

    static func iconName(for kind: BatteryAnnouncementKind?) -> String {
        switch kind {
        case .critical, .criticalDrop: return "battery.0"
        case .probablyOff: return "iphone.slash"
        case .charging: return "battery.100.bolt"
        case .backOn: return "iphone"
        case .recharged, .ended: return "battery.100"
        case .low, .threshold, nil: return "battery.25"
        }
    }

    static func dotStyle(for kind: BatteryAnnouncementKind?) -> SyncPillDotStyle {
        switch kind {
        case .critical, .criticalDrop, .probablyOff: return .error
        case .charging, .backOn, .recharged, .ended: return .success
        case .low, .threshold, nil: return .warning
        }
    }

    /// Le glyphe d'état (en-tête, avatar) : la phase servie, jamais un niveau inventé.
    static func iconName(for state: BatteryReaderState) -> String {
        switch state.phase {
        case .charging: return "battery.100.bolt"
        case .off: return "iphone.slash"
        case .critical: return "battery.0"
        case .low: return "battery.25"
        }
    }

    /// Ce que VoiceOver dit de l'état d'une personne.
    static func spoken(_ state: BatteryReaderState) -> String {
        switch state.phase {
        case .off:
            return String(localized: "battery.state.off", defaultValue: "Téléphone probablement éteint", bundle: .main)
        case .charging:
            return String(format: String(localized: "battery.state.charging", defaultValue: "Batterie en charge, %lld %%", bundle: .main), state.level)
        case .critical, .low:
            return String(format: String(localized: "battery.state.level", defaultValue: "Batterie à %lld %%", bundle: .main), state.level)
        }
    }

    /// « Environ 40 min d'autonomie » — seulement quand la passerelle l'a estimée.
    static func autonomy(minutes: Int) -> String {
        if minutes >= 60 {
            let hours = minutes / 60
            let rest = minutes % 60
            return String(format: String(localized: "battery.detail.autonomyHours", defaultValue: "Environ %1$lld h %2$lld min d'autonomie", bundle: .main), hours, rest)
        }
        return String(format: String(localized: "battery.detail.autonomyMinutes", defaultValue: "Environ %lld min d'autonomie", bundle: .main), minutes)
    }

    private static func withLevel(_ level: Int?, name: String, leveled: String, bare: String) -> String {
        guard let level else { return String(format: bare, name) }
        return String(format: leveled, name, level)
    }
}
