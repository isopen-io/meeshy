import Foundation

/// Le groupe d'apps que l'app partage avec ses extensions, et la clé où l'app
/// recopie les préférences de notification. La NSE les lit sans lier
/// `UserPreferencesManager`, qui les ré-expose sous ses anciens noms.
public enum AppGroupPreferences {
    public static let suiteName = "group.me.meeshy.apps"
    public static let notificationPreferencesKey = "meeshy_prefs_" + PreferenceCategory.notification.rawValue
}
