import Foundation
import MeeshySDK

/// Les mots de la carte des positions (#18872, planches Carte-Personne, Carte-Proches, Carte-Partage, Carte-Sang),
/// une clé par sens, sept langues dans `Localizable.xcstrings`. Les précisions et les durées reprennent celles du
/// partage (`ShareLocationWording`) : l'émetteur et le lecteur lisent le même mot.
enum LocationMapCopy {

    // MARK: - Commun

    static var close: String { String(localized: "locationMap.close", defaultValue: "Fermer la carte", bundle: .main) }
    static var back: String { String(localized: "locationMap.back", defaultValue: "Retour", bundle: .main) }
    static var layers: String { String(localized: "locationMap.layers", defaultValue: "Changer le fond de carte", bundle: .main) }
    static var recenter: String { String(localized: "locationMap.recenter", defaultValue: "Recentrer la carte", bundle: .main) }
    static var someone: String { String(localized: "circles.locations.someone", defaultValue: "Quelqu'un", bundle: .main) }
    static func myPosition(_ share: LocationMapOwnShare, name: String?) -> String {
        switch share {
        case .notShared:
            return String(localized: "locationMap.me.notShared", defaultValue: "Ma position — non partagée", bundle: .main)
        case .shared:
            return String(localized: "locationMap.me.shared", defaultValue: "Ma position — partagée", bundle: .main)
        case .sharedWithThem:
            return String(format: String(localized: "locationMap.me.sharedWith", defaultValue: "Ma position — partagée avec %@",
                                         bundle: .main), name ?? someone)
        }
    }

    /// La pilule de précision, en légende de la carte : « Précision quartier ».
    static func precisionPill(_ precision: SharedLocationPrecision) -> String {
        String(format: String(localized: "locationMap.precision.pill", defaultValue: "Précision %@", bundle: .main),
               precisionWord(precision))
    }

    /// La pilule de voyage (#19560) : « De passage à Lisbonne », quand ma position est loin de ma ville déclarée.
    static func passingThrough(_ city: String) -> String {
        String(format: String(localized: "locationMap.travel.passingThrough", defaultValue: "De passage à %@", bundle: .main),
               city)
    }

    static func view(_ precision: SharedLocationPrecision) -> String {
        switch precision {
        case .exact: return String(localized: "locationMap.view.exact", defaultValue: "Vue exacte", bundle: .main)
        case .neighborhood: return String(localized: "locationMap.view.neighborhood", defaultValue: "Vue quartier", bundle: .main)
        case .city: return String(localized: "locationMap.view.city", defaultValue: "Vue ville", bundle: .main)
        }
    }

    /// Le mot court de la précision, sous une épingle ou dans une rangée : « quartier ».
    static func precisionWord(_ precision: SharedLocationPrecision) -> String {
        switch precision {
        case .exact: return String(localized: "locationMap.precision.exact", defaultValue: "point exact", bundle: .main)
        case .neighborhood: return String(localized: "locationMap.precision.neighborhood", defaultValue: "quartier", bundle: .main)
        case .city: return String(localized: "locationMap.precision.city", defaultValue: "ville", bundle: .main)
        }
    }

    static func distance(_ meters: Double, locale: Locale) -> String {
        Measurement(value: meters, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road).locale(locale))
    }

    static func walk(_ meters: Double, locale: Locale) -> String {
        let span = distance(meters, locale: locale)
        guard let minutes = LocationMapRules.walkingMinutes(meters: meters) else { return span }
        return String(format: String(localized: "locationMap.walk", defaultValue: "%1$@ · %2$lld min à pied", bundle: .main),
                      span, minutes)
    }

    static func remaining(_ window: SharedLocationWindow) -> String {
        let minutes = window.remainingMinutes
        guard minutes >= 60 else {
            return String(format: String(localized: "locationMap.remaining.minutes", defaultValue: "encore %lld min", bundle: .main), minutes)
        }
        return String(format: String(localized: "locationMap.remaining.hours", defaultValue: "encore %1$lld h %2$02lld", bundle: .main),
                      minutes / 60, minutes % 60)
    }

    /// La durée restante, brève, en fin de rangée : « 42 min », « 7 h 05 ».
    static func remainingShort(_ window: SharedLocationWindow) -> String {
        let minutes = window.remainingMinutes
        guard minutes >= 60 else {
            return String(format: String(localized: "locationMap.remainingShort.minutes", defaultValue: "%lld min", bundle: .main), minutes)
        }
        return String(format: String(localized: "locationMap.remainingShort.hours", defaultValue: "%1$lld h %2$02lld", bundle: .main),
                      minutes / 60, minutes % 60)
    }

    static func sharedFor(_ window: SharedLocationWindow) -> String {
        window.total > SharedLocationShareDuration.oneHour.interval
            ? String(localized: "locationMap.sharedFor.eightHours", defaultValue: "Partage pour 8 h", bundle: .main)
            : String(localized: "locationMap.sharedFor.oneHour", defaultValue: "Partage pour 1 h", bundle: .main)
    }

    static func freshness(_ freshness: SharedLocationFreshness) -> String {
        switch freshness {
        case .live(let seconds):
            return String(format: String(localized: "locationMap.fresh.live", defaultValue: "Position en direct · mise à jour il y a %lld s", bundle: .main), seconds)
        case .stale(let minutes):
            return String(format: String(localized: "locationMap.fresh.stale", defaultValue: "Mise à jour il y a %lld min", bundle: .main), minutes)
        }
    }

    // MARK: - Carte d'une personne

    static var directions: String { String(localized: "locationMap.action.directions", defaultValue: "Itinéraire", bundle: .main) }
    static var write: String { String(localized: "locationMap.action.write", defaultValue: "Écrire", bundle: .main) }
    static var call: String { String(localized: "locationMap.action.call", defaultValue: "Appeler", bundle: .main) }
    static var shareMine: String { String(localized: "locationMap.action.shareMine", defaultValue: "Partager la mienne", bundle: .main) }
    static var history: String { String(localized: "locationMap.action.history", defaultValue: "Historique", bundle: .main) }
    static var mapShortcut: String { String(localized: "locationMap.shortcut.map", defaultValue: "Carte", bundle: .main) }

    static func notSharingTitle(name: String) -> String {
        String(format: String(localized: "locationMap.person.notSharing", defaultValue: "%@ ne partage pas sa position", bundle: .main), name)
    }

    static var notSharingMessage: String {
        String(localized: "locationMap.person.notSharing.message", defaultValue: "Tu la verras ici dès qu'elle te la partagera.", bundle: .main)
    }

    static func pinLabel(name: String, precision: SharedLocationPrecision) -> String {
        String(format: String(localized: "locationMap.pin.label", defaultValue: "%1$@, %2$@", bundle: .main), name, precisionWord(precision))
    }

    // MARK: - « Où il est », sur la fiche

    static var openMap: String { String(localized: "locationMap.where.open", defaultValue: "Voir sur la carte", bundle: .main) }

    /// Sous le lieu : « Précision quartier · encore 42 min ». Un partage échu ne dit plus de durée.
    static func whereDetail(_ precision: SharedLocationPrecision, window: SharedLocationWindow) -> String {
        guard !window.isOver else { return precisionPill(precision) }
        return String(format: String(localized: "locationMap.where.detail", defaultValue: "%1$@ · %2$@", bundle: .main),
                      precisionPill(precision), remaining(window))
    }

    static func shareMineWith(_ name: String) -> String {
        String(format: String(localized: "locationMap.where.shareWith", defaultValue: "Partager ma position avec %@", bundle: .main), name)
    }

    static func whereLabel(name: String, place: String, detail: String) -> String {
        String(format: String(localized: "locationMap.where.label", defaultValue: "%1$@ est à %2$@, %3$@", bundle: .main),
               name, place, detail)
    }

    // MARK: - Mes proches

    static var nearbyTitle: String { String(localized: "locationMap.nearby.title", defaultValue: "Mes proches", bundle: .main) }
    static var nearbyOpen: String { String(localized: "locationMap.nearby.open", defaultValue: "Carte de mes proches", bundle: .main) }

    static func nearbySubtitle(_ count: Int) -> String {
        String(format: String(localized: "locationMap.nearby.subtitle", defaultValue: "%lld partagent leur position", bundle: .main), count)
    }

    static var around: String { String(localized: "locationMap.nearby.around", defaultValue: "Autour de toi", bundle: .main) }
    static var nearestFirst: String { String(localized: "locationMap.nearby.nearestFirst", defaultValue: "Du plus près", bundle: .main) }
    static var sortLabel: String { String(localized: "locationMap.nearby.sort", defaultValue: "Trier", bundle: .main) }

    static func sort(_ sort: NearbySort) -> String {
        switch sort {
        case .nearest: return nearestFirst
        case .endingSoon: return String(localized: "locationMap.nearby.endingSoon", defaultValue: "Fin la plus proche", bundle: .main)
        case .byCircle: return String(localized: "locationMap.nearby.byCircle", defaultValue: "Par cercle", bundle: .main)
        }
    }
    static var notOnMap: String { String(localized: "locationMap.nearby.notOnMap", defaultValue: "Pas sur la carte", bundle: .main) }
    /// Un proche en pause par son fantôme (#19562) : aucune heure, aucun lieu, aucune précision.
    static var ghostPaused: String {
        String(localized: "locationMap.ghost.paused", defaultValue: "En mode fantôme · position en pause", bundle: .main)
    }
    static func ghostPinLabel(name: String) -> String {
        String(format: String(localized: "locationMap.ghost.pin", defaultValue: "%@, en mode fantôme · position en pause",
                              bundle: .main), name)
    }
    /// Hors ligne, l'épingle servie n'est plus que la dernière position connue (K36 `stale`).
    static var lastKnownPosition: String {
        String(localized: "locationMap.lastKnown", defaultValue: "dernière position connue", bundle: .main)
    }
    static var filtersLabel: String { String(localized: "locationMap.nearby.filters", defaultValue: "Cercles montrés", bundle: .main) }
    static var all: String { String(localized: "locationMap.nearby.all", defaultValue: "Tous", bundle: .main) }
    static var shareMyPosition: String { String(localized: "sharedLocation.share.action", defaultValue: "Partager ma position", bundle: .main) }
    static var nobodySeesMe: String { String(localized: "locationMap.nearby.nobody", defaultValue: "Tu n'es visible par personne", bundle: .main) }

    static func seenBy(_ count: Int) -> String {
        String(format: String(localized: "locationMap.nearby.seenBy", defaultValue: "Visible par %lld personne(s)", bundle: .main), count)
    }

    static var emptyTitle: String {
        String(localized: "locationMap.nearby.empty", defaultValue: "Personne ne te partage sa position", bundle: .main)
    }

    static var emptyMessage: String {
        String(localized: "locationMap.nearby.empty.message", defaultValue: "Les positions que tes proches te partagent apparaissent ici, à la précision qu'ils choisissent.", bundle: .main)
    }

    static var emptyFilter: String {
        String(localized: "locationMap.nearby.emptyFilter", defaultValue: "Personne de ce cercle sur la carte", bundle: .main)
    }

    static func endedAgo(_ endedAt: Date, locale: Locale) -> String {
        let style = Date.RelativeFormatStyle(presentation: .numeric, unitsStyle: .wide, locale: locale,
                                             capitalizationContext: .middleOfSentence)
        return String(format: String(localized: "locationMap.nearby.ended", defaultValue: "Partage terminé %@", bundle: .main),
                      endedAt.formatted(style))
    }



    // MARK: - Pendant le partage

    static func sharingWith(_ names: [String], locale: Locale) -> String {
        let formatter = ListFormatter()
        formatter.locale = locale
        let joined = formatter.string(from: names) ?? names.joined(separator: ", ")
        return String(format: String(localized: "locationMap.sharing.with", defaultValue: "Position partagée avec %@", bundle: .main), joined)
    }

    static var stop: String { String(localized: "sharedLocation.share.stop", defaultValue: "Arrêter", bundle: .main) }
}
