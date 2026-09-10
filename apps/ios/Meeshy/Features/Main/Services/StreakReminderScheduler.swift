import Foundation
import UserNotifications
import os

/// **Pose les rappels de série sur l'appareil** (#5902).
///
/// Ce type ne DÉCIDE rien : `StreakReminderPlan` le fait, purement et sans
/// horloge. Celui-ci ne fait que trois choses — lire l'autorisation, remplacer
/// le jeu précédent, poser le nouveau. La séparation est ce qui rend la règle
/// éprouvable : un planificateur qui lirait `Date()` et `UNUserNotificationCenter`
/// lui-même n'aurait aucun de ses six cas vides testable.
///
/// **Remplacer, jamais ajouter.** Les identifiants sont stables
/// (`streak-reminder.<moment>.<heure>`) et le jeu précédent est retiré avant
/// chaque pose : sans cela, chaque ouverture de l'app empilerait six rappels de
/// plus, et l'utilisateur en recevrait des dizaines le lendemain.
@MainActor
final class StreakReminderScheduler {

    static let shared = StreakReminderScheduler()

    private let centre: UNUserNotificationCenter
    private let calendrier: Calendar

    init(centre: UNUserNotificationCenter = .current(), calendrier: Calendar = .current) {
        self.centre = centre
        self.calendrier = calendrier
    }

    /// Tous les identifiants que ce planificateur peut avoir posés — c'est ce
    /// qui permet de retirer SON jeu sans toucher aux notifications des autres
    /// (appels manqués, rappels de story…).
    private var identifiantsPossibles: [String] {
        StreakReminderPlan.Moment.allCases.flatMap { moment in
            [moment.premiereHeure, moment.premiereHeure + StreakReminderPlan.ecartHeures]
                .map { "streak-reminder.\(moment.rawValue).\($0)" }
        }
    }

    /// Replanifie les rappels du jour depuis l'état de progression.
    ///
    /// Appelée à chaque fois que la progression est relue — ouverture de
    /// l'écran, retour en avant-plan. Idempotente par construction : elle
    /// retire puis repose, donc l'appeler dix fois de suite laisse exactement
    /// six rappels au plus.
    func replanifier(serieEnCours: Int, aAgiAujourdhui: Bool, maintenant: Date = Date()) async {
        // Le retrait est INCONDITIONNEL, et c'est le geste qui compte le plus :
        // quand la série vient d'être tenue, il n'y a rien à poser — mais il y
        // a tout à retirer. Sans lui, le geste du jour n'annulerait rien et les
        // rappels de l'après-midi tomberaient quand même.
        centre.removePendingNotificationRequests(withIdentifiers: identifiantsPossibles)

        let autorise = await notificationsAutorisees()
        let rappels = StreakReminderPlan.rappels(
            maintenant: maintenant,
            calendrier: calendrier,
            serieEnCours: serieEnCours,
            aAgiAujourdhui: aAgiAujourdhui,
            notificationsAutorisees: autorise
        )
        guard !rappels.isEmpty else { return }

        for rappel in rappels {
            let contenu = UNMutableNotificationContent()
            contenu.title = rappel.titre
            contenu.body = rappel.corps
            contenu.sound = .default
            // La route que le tap ouvre — la même que les notifications
            // d'engagement de la passerelle, pour que les deux mènent au même
            // écran plutôt qu'à deux endroits qui parlent de la même chose.
            contenu.userInfo = ["type": "streak_reminder", "route": "/progression"]

            // Déclencheur CALENDAIRE, jamais un intervalle : il suit le fuseau
            // de l'appareil. Un `UNTimeIntervalNotificationTrigger` calculé
            // depuis maintenant tomberait à la mauvaise heure dès que
            // l'utilisateur change de fuseau — c'est-à-dire précisément quand
            // sa série est la plus fragile.
            var quand = DateComponents()
            quand.hour = rappel.heure
            quand.minute = 0

            do {
                try await centre.add(UNNotificationRequest(
                    identifier: rappel.identifiant,
                    content: contenu,
                    trigger: UNCalendarNotificationTrigger(dateMatching: quand, repeats: false)
                ))
            } catch {
                // Un rappel qui ne se pose pas ne casse rien d'autre : les
                // suivants se posent, et la prochaine relecture réessaiera.
                Logger.messages.error("streak reminder \(rappel.identifiant) non posé: \(error.localizedDescription)")
            }
        }
    }

    /// L'autorisation DÉJÀ accordée — jamais demandée ici. Une demande surgie
    /// pour un rappel de série serait une intrusion : l'utilisateur accorde les
    /// notifications pour ses messages, pas pour être relancé.
    private func notificationsAutorisees() async -> Bool {
        let reglages = await centre.notificationSettings()
        switch reglages.authorizationStatus {
        case .authorized, .provisional, .ephemeral: return true
        case .notDetermined, .denied: return false
        @unknown default: return false
        }
    }
}
