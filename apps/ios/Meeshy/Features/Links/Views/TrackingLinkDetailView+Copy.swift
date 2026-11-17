import Foundation

/// Les mots du détail d'un lien de suivi (planche `Lien-Detail`, #18871), localisés dans les sept langues.
enum TrackingDetailCopy {
    static let copy = String(localized: "tracking.link.detail.copy", defaultValue: "Copier", bundle: .main)
    static let copied = String(localized: "tracking.link.detail.a11y.copied", defaultValue: "Lien copié", bundle: .main)
    static let qr = String(localized: "tracking.link.detail.qr", defaultValue: "QR code", bundle: .main)
    static let enlargeQR = String(localized: "tracking.link.detail.qr.enlarge", defaultValue: "Agrandir le QR code", bundle: .main)
    static let share = String(localized: "tracking.link.detail.share", defaultValue: "Partager", bundle: .main)
    static let active = String(localized: "common.active", defaultValue: "Actif", bundle: .main)
    static let inactive = String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main)
    static let inactiveHint = String(localized: "tracking.link.detail.inactiveHint", defaultValue: "Le lien ne redirige plus personne", bundle: .main)
    static let deleteLink = String(localized: "tracking.link.detail.deleteLink", defaultValue: "Supprimer ce lien", bundle: .main)

    static let clicksUnit = String(localized: "tracking.link.detail.figure.clicks", defaultValue: "clics", bundle: .main)
    static let uniqueUnit = String(localized: "tracking.link.detail.figure.unique", defaultValue: "visiteurs uniques", bundle: .main)
    static let countriesUnit = String(localized: "tracking.link.detail.figure.countries", defaultValue: "pays", bundle: .main)
    static let noData = String(localized: "tracking.link.detail.noData", defaultValue: "Aucune donnée", bundle: .main)

    static let chartTitle = String(localized: "tracking.link.detail.chart.title", defaultValue: "Les clics", bundle: .main)
    static let chartEmpty = String(localized: "tracking.link.detail.chart.empty", defaultValue: "Aucun clic sur la période", bundle: .main)
    static let periodLabel = String(localized: "tracking.link.detail.period.label", defaultValue: "Période", bundle: .main)
    static let week = String(localized: "tracking.link.detail.period.week", defaultValue: "7 j", bundle: .main)
    static let month = String(localized: "tracking.link.detail.period.month", defaultValue: "30 j", bundle: .main)
    static let all = String(localized: "tracking.link.detail.period.all", defaultValue: "Tout", bundle: .main)
    static let weekSpoken = String(localized: "tracking.link.detail.period.week.a11y", defaultValue: "7 derniers jours", bundle: .main)
    static let monthSpoken = String(localized: "tracking.link.detail.period.month.a11y", defaultValue: "30 derniers jours", bundle: .main)
    static let allSpoken = String(localized: "tracking.link.detail.period.all.a11y", defaultValue: "Depuis le premier clic", bundle: .main)

    static func chartSummary(_ total: Int) -> String {
        String(localized: "tracking.link.detail.chart.summary", defaultValue: "\(total) clics sur la période", bundle: .main)
    }

    static func dayClicks(_ day: String, _ count: Int) -> String {
        String(localized: "tracking.link.detail.chart.day", defaultValue: "\(day), \(count) clics", bundle: .main)
    }

    static func clicksCount(_ count: Int) -> String {
        String(localized: "tracking.link.detail.chart.count", defaultValue: "\(count) clics", bundle: .main)
    }

    static let originsTitle = String(localized: "tracking.link.detail.origins.title", defaultValue: "D'où ils viennent", bundle: .main)
    static let meansTitle = String(localized: "tracking.link.detail.means.title", defaultValue: "Avec quoi", bundle: .main)
    static let devicesTitle = String(localized: "tracking.link.detail.devices", defaultValue: "APPAREILS", bundle: .main)
    static let sourcesTitle = String(localized: "tracking.link.detail.sources", defaultValue: "Source", bundle: .main)
    static let phone = String(localized: "tracking.link.detail.device.phone", defaultValue: "Téléphone", bundle: .main)
    static let desktop = String(localized: "tracking.link.detail.device.desktop", defaultValue: "Ordinateur", bundle: .main)
    static let tablet = String(localized: "tracking.link.detail.device.tablet", defaultValue: "Tablette", bundle: .main)
    static let otherDevice = String(localized: "tracking.link.detail.device.other", defaultValue: "Autre", bundle: .main)
    static let direct = String(localized: "tracking.link.detail.source.direct", defaultValue: "Direct", bundle: .main)

    static let recentTitle = String(localized: "tracking.link.detail.recentClicks", defaultValue: "DERNIERS CLICS", bundle: .main)
    static let unknown = String(localized: "tracking.link.detail.unknown", defaultValue: "Inconnu", bundle: .main)
    static let redirectConfirmed = String(localized: "tracking.link.detail.a11y.redirectConfirmed", defaultValue: "Redirection confirmée", bundle: .main)
    static let redirectFailed = String(localized: "tracking.link.detail.a11y.redirectFailed", defaultValue: "Redirection échouée", bundle: .main)
    static let utmTitle = String(localized: "tracking.link.detail.utm.title", defaultValue: "CONFIGURATION UTM", bundle: .main)
    static let destination = String(localized: "tracking.link.detail.destinationUrl", defaultValue: "URL de destination", bundle: .main)
    static let createdAt = String(localized: "tracking.link.detail.createdAt", defaultValue: "Créé le", bundle: .main)
}
