import Foundation
import MeeshySDK
import UserNotifications
import os

/// Applique les préférences de notification au moment de la LIVRAISON (app
/// tuée ou backgroundée) — la NSE tourne dans son propre process et lit le
/// miroir App Group écrit par `UserPreferencesManager.persist`.
///
/// Défense en profondeur par rapport au gating serveur : couvre le lag de
/// sync (préférence changée offline, PATCH encore en outbox) et le fail-open
/// serveur. Sans l'entitlement `com.apple.developer.usernotifications.filtering`
/// la NSE ne peut pas SUPPRIMER une notification — le mieux possible est la
/// livraison passive (`interruptionLevel = .passive`) : pas de bannière, pas
/// de son, pas d'allumage d'écran ; la notification atterrit silencieusement
/// dans la liste.
enum NSEPreferencesGate {

    /// Miroir absent (première installation, jamais de sync) → `nil` ; les
    /// appelants retombent sur `.defaults` (tout activé = comportement
    /// historique).
    nonisolated static func loadPreferences(
        defaults: UserDefaults? = UserDefaults(suiteName: UserPreferencesManager.appGroupSuiteName)
    ) -> UserNotificationPreferences? {
        guard let data = defaults?.data(forKey: UserPreferencesManager.appGroupNotificationPrefsKey) else {
            return nil
        }
        // Sans préférences lisibles, la gate laisse passer la notification
        // (comportement par défaut) : mieux vaut une notif de trop qu'une notif
        // manquée, mais l'incident doit être traçable.
        //
        // Le `do`/`catch` est inline plutôt que factorisé : ce fichier est aussi
        // compilé dans le bundle de tests (cf. project.yml), qui n'embarque pas
        // les helpers de `NSEDataSync`.
        do {
            return try JSONDecoder().decode(UserNotificationPreferences.self, from: data)
        } catch {
            Logger(subsystem: "me.meeshy.app", category: "nse-prefs-gate")
                .error("Notification preferences unreadable, delivering with defaults: \(error.localizedDescription, privacy: .public)")
            return nil
        }
    }

    nonisolated static func apply(
        preferences: UserNotificationPreferences,
        to content: UNMutableNotificationContent,
        rawType: String?,
        now: Date = Date()
    ) {
        if !preferences.soundEnabled {
            content.sound = nil
        }
        if !preferences.notificationBadgeEnabled {
            // 0 (et non nil) : efface aussi un badge résiduel — même règle que
            // le serveur (aps.badge → 0) et que NotificationCoordinator.
            content.badge = 0
        }
        if !preferences.groupNotifications {
            // applyThreading (re-dérivé de conversationId) tourne AVANT cette
            // porte : on annule ici pour que « Group notifications » off soit
            // effectif même quand le serveur a laissé passer un threadId.
            content.threadIdentifier = ""
        }

        // Même coercition que le décodage SDK : type inconnu → `.system`.
        let type = rawType.flatMap(MeeshyNotificationType.init(rawValue:)) ?? .system
        let allowed = preferences.pushEnabled
            && !preferences.isInDoNotDisturbWindow(now: now)
            && preferences.isTypeEnabled(type)
        if !allowed {
            content.interruptionLevel = .passive
            content.sound = nil
        }
    }
}
