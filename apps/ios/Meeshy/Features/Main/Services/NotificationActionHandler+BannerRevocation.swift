import UIKit
import Combine
import UserNotifications
import MeeshySDK
import os

extension NotificationActionHandler {
    // MARK: - Révocation (features 4/5)

    /// Retire les bannières déjà LIVRÉES des notifications révoquées — par le
    /// push de contrôle `notification_revoked` (AppDelegate) comme par le
    /// socket `notification:deleted` (`observeRevocations`). Un seul atome
    /// `UNUserNotificationCenter` derrière : `removeDeliveredNotifications`.
    func revokeDeliveredBanners(notificationIds: [String]) async {
        guard !notificationIds.isEmpty else { return }
        await removeDeliveredForNotificationIds(notificationIds)
    }

    /// **Le balayage local des bannières éphémères** (#7453).
    ///
    /// iOS n'offre aucune échéance native pour une notification délivrée : le
    /// seul retrait possible est ce balayage. Le retrait SERVEUR existe déjà
    /// (`notification_revoked`), mais il ne part qu'à la destruction du message
    /// — sans réseau, la bannière d'un éphémère survivait indéfiniment au
    /// message qu'elle annonce, sur l'écran verrouillé, avec le placeholder qui
    /// dit exactement qu'il y a quelque chose à cacher.
    ///
    /// Trois occasions l'appellent, et il en faut trois parce qu'aucune ne
    /// couvre les deux autres : la NSE (à chaque push reçu, la plus fréquente),
    /// le retour de l'application au premier plan (le seul moment où
    /// l'utilisateur REGARDE), et `message:expired` (le seul qui sache qu'un
    /// message précis vient de mourir, y compris pendant l'usage).
    ///
    /// La règle de sélection n'est pas réécrite ici : `EphemeralBannerDeadline`
    /// (SDK) la tient pour les trois cibles. Une bannière sans échéance n'est
    /// jamais retirée.
    nonisolated static func sweepExpiredEphemeralBanners(now: Date = Date()) async {
        await removeDeliveredNotificationsAwaiting(
            matching: { EphemeralBannerDeadline.isExpired(userInfo: $0, now: now) }
        )
    }

    /// Rejoue `sweepExpiredEphemeralBanners` à chaque retour au premier plan.
    func observeForegroundSweep() {
        foregroundSweepSubscription = NotificationCenter.default
            .publisher(for: UIApplication.willEnterForegroundNotification)
            .sink { _ in
                Task { await NotificationActionHandler.sweepExpiredEphemeralBanners() }
            }
    }

    /// Fenêtre de regroupement des révocations reçues par socket. Assez courte
    /// pour rester imperceptible (la bannière part dans le même geste), assez
    /// longue pour absorber une purge en lot.
    private static let revocationBatchWindow: DispatchQueue.SchedulerTimeType.Stride = .milliseconds(200)

    /// Abonne le retrait de bannières au flux des suppressions reçues par
    /// socket (`NotificationToastManager.notificationWasDeleted`). Un nouvel
    /// appel REMPLACE l'abonnement : la racine SwiftUI peut rejouer son câblage
    /// sans retirer deux fois.
    ///
    /// Les ids arrivent UN PAR UN — `handleNotificationDeletedBulk` republie
    /// ligne à ligne — alors que `revokeDeliveredBanners` prend DÉJÀ un
    /// tableau : sans regroupement, une purge des lues venue d'un autre
    /// appareil (deux cents lignes) enchaînait deux cents allers-retours
    /// `getDeliveredNotifications` sur le main thread, chacun suivi de sa
    /// boucle de confirmation. La rafale se replie ici en UN appel système.
    func observeRevocations(from deletions: AnyPublisher<String, Never>) {
        revocationSubscription = deletions
            .collect(.byTime(DispatchQueue.main, Self.revocationBatchWindow))
            .filter { !$0.isEmpty }
            .sink { [weak self] notificationIds in
                Task { @MainActor [weak self] in
                    await self?.revokeDeliveredBanners(notificationIds: notificationIds)
                }
            }
    }
}
