import Foundation

// MARK: - Les mots des blocs de la Vitrine d'un autre (#19416, planche `Autre-Vitrine`)
//
// « Avec Léo », « En direct · Entre Proches », « Dernières infos », « Son jeu » et le fuseau « UTC+0 · 16:42 chez Léo » :
// une seule source, testée, pour les trois blocs et le fuseau d'« À propos ». Isolé au MainActor comme `Bundle.module`
// dans MeeshyUI ; ce qui ne lit aucun catalogue reste `nonisolated`.

enum ProfileVitrineCopy {

    /// Le prénom qui nomme la personne dans un titre court : « Avec Léo », « 16:42 chez Léo ».
    nonisolated static func firstName(_ displayName: String) -> String {
        let trimmed = displayName.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.split(whereSeparator: \.isWhitespace).first.map(String.init) ?? trimmed
    }

    // MARK: Le fuseau

    /// « UTC+0 · 16:42 chez Léo » : le décalage et l'heure qu'il est CHEZ LUI, calculés ici. Un fuseau que l'appareil
    /// ne connaît pas garde la chaîne servie, comme avant.
    static func localTime(timezone: String, name: String, now: Date, locale: Locale = .current) -> String {
        guard let zone = TimeZone(identifier: timezone) else { return timezone }
        let format = String(localized: "profile.vitrine.localTime", defaultValue: "%1$@ · %2$@ chez %3$@",
                            bundle: .module, locale: locale)
        return String(format: format, utcOffset(zone.secondsFromGMT(for: now)), clock(now, in: zone, locale: locale),
                      firstName(name))
    }

    /// « UTC+0 », « UTC+5:30 », « UTC-3 ».
    nonisolated static func utcOffset(_ seconds: Int) -> String {
        let sign = seconds < 0 ? "-" : "+"
        let magnitude = abs(seconds)
        let hours = magnitude / 3600
        let minutes = (magnitude % 3600) / 60
        guard minutes > 0 else { return "UTC\(sign)\(hours)" }
        return String(format: "UTC%@%d:%02d", sign, hours, minutes)
    }

    nonisolated static func clock(_ date: Date, in zone: TimeZone, locale: Locale) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = zone
        let style = Date.FormatStyle(date: .omitted, time: .shortened, locale: locale, calendar: calendar, timeZone: zone)
        return date.formatted(style)
    }

    // MARK: Avec lui

    static func withThemTitle(_ name: String) -> String {
        String(format: String(localized: "profile.vitrine.withThem.title", defaultValue: "Avec %@", bundle: .module),
               firstName(name))
    }

    static var seeAll: String {
        String(localized: "profile.vitrine.withThem.seeAll", defaultValue: "Tout voir", bundle: .module)
    }

    static var seeAllHint: String {
        String(localized: "profile.vitrine.withThem.seeAll.hint", defaultValue: "Ouvre la face Actions", bundle: .module)
    }

    static var withoutNetwork: String {
        String(localized: "profile.vitrine.withThem.offline", defaultValue: "Sans réseau", bundle: .module)
    }

    // MARK: En direct

    static var liveTitle: String {
        String(localized: "profile.vitrine.live.title", defaultValue: "En direct", bundle: .module)
    }

    static var staleTitle: String {
        String(localized: "profile.vitrine.live.staleTitle", defaultValue: "Dernières infos", bundle: .module)
    }

    static var betweenClose: String {
        String(localized: "profile.vitrine.live.circle", defaultValue: "Entre Proches", bundle: .module)
    }

    static var position: String {
        String(localized: "profile.vitrine.live.position", defaultValue: "Position", bundle: .module)
    }

    static var lastPosition: String {
        String(localized: "profile.vitrine.live.lastPosition", defaultValue: "Dernière position connue", bundle: .module)
    }

    static var openMapHint: String {
        String(localized: "profile.vitrine.live.openMap", defaultValue: "Ouvre la carte", bundle: .module)
    }

    static var battery: String {
        String(localized: "profile.vitrine.live.battery", defaultValue: "Batterie", bundle: .module)
    }

    static var charging: String {
        String(localized: "profile.vitrine.live.charging", defaultValue: "En charge", bundle: .module)
    }

    static var mayHaveChanged: String {
        String(localized: "profile.vitrine.live.mayHaveChanged", defaultValue: "Peut avoir changé", bundle: .module)
    }

    static var phone: String {
        String(localized: "profile.vitrine.live.phone", defaultValue: "Téléphone", bundle: .module)
    }

    static var reachable: String {
        String(localized: "profile.vitrine.live.reachable", defaultValue: "Joignable", bundle: .module)
    }

    static var networkAvailable: String {
        String(localized: "profile.vitrine.live.network", defaultValue: "Réseau disponible", bundle: .module)
    }

    static var unreachable: String {
        String(localized: "profile.vitrine.live.unreachable", defaultValue: "Injoignable", bundle: .module)
    }

    /// « relevé il y a 3 h ».
    static func measured(_ ago: String) -> String {
        String(format: String(localized: "profile.vitrine.live.measured", defaultValue: "relevé %@", bundle: .module), ago)
    }

    /// « il y a 3 h » : l'âge de ce qu'on lit, à la manière du bandeau hors ligne de la fiche.
    nonisolated static func ago(_ age: TimeInterval, now: Date = Date(), locale: Locale = .current) -> String {
        let formatter = RelativeDateTimeFormatter()
        formatter.locale = locale
        formatter.unitsStyle = .short
        formatter.dateTimeStyle = .named
        return formatter.localizedString(for: now.addingTimeInterval(-max(0, age)), relativeTo: now)
    }

    /// « 64 % », à la manière de la langue.
    nonisolated static func percent(_ level: Int, locale: Locale = .current) -> String {
        (Double(level) / 100).formatted(.percent.precision(.fractionLength(0)).locale(locale))
    }

    // MARK: Son jeu

    static var gameTitle: String {
        String(localized: "profile.vitrine.game.title", defaultValue: "Son jeu", bundle: .module)
    }

    /// « Niveau 31 · rang ».
    static func levelAndRank(_ level: Int) -> String {
        String(format: String(localized: "profile.vitrine.game.levelRank", defaultValue: "Niveau %@ · rang", bundle: .module),
               String(level))
    }

    /// « Niveau 31 », ce que lit le médaillon.
    static func level(_ level: Int) -> String {
        String(format: String(localized: "profile.vitrine.game.level", defaultValue: "Niveau %@", bundle: .module),
               String(level))
    }

    /// « 2 410 étincelles ».
    static func sparks(_ amount: String) -> String {
        String(format: String(localized: "profile.vitrine.game.sparks", defaultValue: "%@ étincelles", bundle: .module),
               amount)
    }

    /// « 3 trophées sur 5 », « 1 trophée sur 5 ».
    static func trophies(earned: Int, total: Int) -> String {
        let format = earned == 1
            ? String(localized: "profile.vitrine.game.trophies.one", defaultValue: "%1$@ trophée sur %2$@", bundle: .module)
            : String(localized: "profile.vitrine.game.trophies.other", defaultValue: "%1$@ trophées sur %2$@", bundle: .module)
        return String(format: format, String(earned), String(total))
    }
}
