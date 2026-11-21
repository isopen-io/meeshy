import Foundation

/// Les mots du détail d'un lien de suivi (planche `Lien-Detail`, #18871), localisés dans les sept langues.
enum TrackingDetailCopy {
    static let copy = String(localized: "tracking.link.detail.copy", defaultValue: "Copier", bundle: .main)
    static let copied = String(localized: "tracking.link.detail.a11y.copied", defaultValue: "Lien copié", bundle: .main)
    static let qr = String(localized: "tracking.link.detail.qr", defaultValue: "QR code", bundle: .main)
    static let enlargeQR = String(localized: "tracking.link.sheet.qr.enlarge", defaultValue: "Agrandir le QR code", bundle: .main)
    static let share = String(localized: "tracking.link.detail.share", defaultValue: "Partager", bundle: .main)
    static let shareQR = String(localized: "tracking.link.qr.shareImage", defaultValue: "Partager le QR code", bundle: .main)
    static let clicksFailed = String(localized: "tracking.link.detail.clicksFailed", defaultValue: "Les clics de ce lien n'ont pas pu être lus", bundle: .main)
    static let active = String(localized: "common.active", defaultValue: "Actif", bundle: .main)
    static let inactive = String(localized: "common.inactive", defaultValue: "Inactif", bundle: .main)
    static let inactiveHint = String(localized: "tracking.link.sheet.inactiveState", defaultValue: "Le lien ne redirige plus personne", bundle: .main)
    static let deleteLink = String(localized: "tracking.link.sheet.deleteLink", defaultValue: "Supprimer ce lien", bundle: .main)

    static let clicksUnit = String(localized: "tracking.link.sheet.figure.clicks", defaultValue: "clics", bundle: .main)
    static let uniqueUnit = String(localized: "tracking.link.sheet.figure.unique", defaultValue: "visiteurs uniques", bundle: .main)
    static let countriesUnit = String(localized: "tracking.link.sheet.figure.countries", defaultValue: "pays", bundle: .main)
    static let noData = String(localized: "tracking.link.detail.noData", defaultValue: "Aucune donnée", bundle: .main)

    static let chartTitle = String(localized: "tracking.link.sheet.chart.title", defaultValue: "Les clics", bundle: .main)
    static let chartEmpty = String(localized: "tracking.link.sheet.chart.empty", defaultValue: "Aucun clic sur la période", bundle: .main)
    static let periodLabel = String(localized: "tracking.link.sheet.period.label", defaultValue: "Période", bundle: .main)
    static let week = String(localized: "tracking.link.sheet.period.week", defaultValue: "7 j", bundle: .main)
    static let month = String(localized: "tracking.link.sheet.period.month", defaultValue: "30 j", bundle: .main)
    static let all = String(localized: "tracking.link.sheet.period.all", defaultValue: "Tout", bundle: .main)
    static let weekSpoken = String(localized: "tracking.link.sheet.period.week.a11y", defaultValue: "7 derniers jours", bundle: .main)
    static let monthSpoken = String(localized: "tracking.link.sheet.period.month.a11y", defaultValue: "30 derniers jours", bundle: .main)
    static let allSpoken = String(localized: "tracking.link.sheet.period.all.a11y", defaultValue: "Depuis le premier clic", bundle: .main)

    static func chartSummary(_ total: Int) -> String {
        String(localized: "tracking.link.sheet.chart.summary", defaultValue: "\(total) clics sur la période", bundle: .main)
    }

    static func dayClicks(_ day: String, _ count: Int) -> String {
        String(localized: "tracking.link.sheet.chart.day", defaultValue: "\(day), \(count) clics", bundle: .main)
    }

    static func clicksCount(_ count: Int) -> String {
        String(localized: "tracking.link.sheet.chart.count", defaultValue: "\(count) clics", bundle: .main)
    }

    static let originsTitle = String(localized: "tracking.link.sheet.origins.title", defaultValue: "D'où ils viennent", bundle: .main)
    static let meansTitle = String(localized: "tracking.link.sheet.means.title", defaultValue: "Avec quoi", bundle: .main)
    static let devicesTitle = String(localized: "tracking.link.detail.devices", defaultValue: "APPAREILS", bundle: .main)
    static let sourcesTitle = String(localized: "tracking.link.sheet.sources", defaultValue: "Source", bundle: .main)
    static let phone = String(localized: "tracking.link.sheet.device.phone", defaultValue: "Téléphone", bundle: .main)
    static let desktop = String(localized: "tracking.link.sheet.device.desktop", defaultValue: "Ordinateur", bundle: .main)
    static let tablet = String(localized: "tracking.link.sheet.device.tablet", defaultValue: "Tablette", bundle: .main)
    static let otherDevice = String(localized: "tracking.link.sheet.device.other", defaultValue: "Autre", bundle: .main)
    static let direct = String(localized: "tracking.link.sheet.source.direct", defaultValue: "Direct", bundle: .main)

    static let recentTitle = String(localized: "tracking.link.detail.recentClicks", defaultValue: "DERNIERS CLICS", bundle: .main)
    static let unknown = String(localized: "tracking.link.detail.unknown", defaultValue: "Inconnu", bundle: .main)
    static let redirectConfirmed = String(localized: "tracking.link.detail.a11y.redirectConfirmed", defaultValue: "Redirection confirmée", bundle: .main)
    static let redirectFailed = String(localized: "tracking.link.detail.a11y.redirectFailed", defaultValue: "Redirection échouée", bundle: .main)
    static let utmTitle = String(localized: "tracking.link.detail.utm.title", defaultValue: "CONFIGURATION UTM", bundle: .main)
    static let destination = String(localized: "tracking.link.detail.destinationUrl", defaultValue: "URL de destination", bundle: .main)
    static let createdAt = String(localized: "tracking.link.detail.createdAt", defaultValue: "Créé le", bundle: .main)

    // MARK: - Modifier (#19499)

    static let edit = String(localized: "tracking.link.detail.edit", defaultValue: "Modifier", bundle: .main)
    static let editTitle = String(localized: "tracking.link.edit.title", defaultValue: "Modifier le lien", bundle: .main)
    static let nameField = String(localized: "tracking.link.create.field.name", defaultValue: "Nom interne", bundle: .main)
    static let namePrompt = String(localized: "tracking.link.create.field.name.placeholder", defaultValue: "ex. : Campagne Instagram", bundle: .main)
    static let campaignField = String(localized: "tracking.link.create.utm.campaign", defaultValue: "Campagne", bundle: .main)
    static let sourceField = String(localized: "tracking.link.create.utm.source", defaultValue: "Source", bundle: .main)
    static let mediumField = String(localized: "tracking.link.create.utm.medium", defaultValue: "Moyen", bundle: .main)
    static let nothingChanged = String(localized: "tracking.link.edit.nothingChanged", defaultValue: "Rien n'a changé", bundle: .main)
    static let notRetained = String(localized: "tracking.link.edit.notRetained", defaultValue: "Le serveur n'a pas encore retenu le nom ni les UTM", bundle: .main)

    // MARK: - La carte des visiteurs (#19499)

    static let mapTitle = String(localized: "tracking.link.map.title", defaultValue: "Carte des visiteurs", bundle: .main)
    static let enlargeMap = String(localized: "tracking.link.map.enlarge", defaultValue: "Agrandir", bundle: .main)

    static func mapWindow(countries: Int, days: Int) -> String {
        String(localized: "tracking.link.map.window", defaultValue: "\(countries) pays · \(days) j", bundle: .main)
    }

    static func mapSummary(_ zones: Int) -> String {
        String(localized: "tracking.link.map.summary", defaultValue: "Carte des visiteurs, \(zones) zones", bundle: .main)
    }

    static func zoneClicks(_ place: String, _ count: Int) -> String {
        String(localized: "tracking.link.map.zone", defaultValue: "\(place), \(count) clics", bundle: .main)
    }
}
