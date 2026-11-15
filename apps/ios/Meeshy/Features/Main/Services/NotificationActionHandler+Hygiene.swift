import UIKit
import Combine
import MeeshySDK
import os

private nonisolated let logger = MeeshyLog.logger(.push)

extension NotificationActionHandler {
    // MARK: - Notification hygiene

    /// Remove already-delivered banners matching the predicate. Without this,
    /// after a lock-screen action the banner lingers in Notification Center
    /// while the coordinator's badge count says 0.
    ///
    /// La `completion` n'est appelée qu'une fois le retrait CONFIRMÉ par une
    /// relecture du centre — voir `removeDeliveredNotificationsAwaiting`.
    nonisolated static func removeDeliveredNotifications(
        matching predicate: @escaping @Sendable ([AnyHashable: Any]) -> Bool,
        center: DeliveredBannerCenter = .system(),
        confirmationTimeout: Duration = defaultRemovalConfirmationTimeout,
        completion: (@Sendable () -> Void)? = nil
    ) {
        removeDeliveredBanners(
            matching: { predicate($0.userInfo) },
            center: center,
            confirmationTimeout: confirmationTimeout,
            completion: completion
        )
    }

    /// La même chose, mais le prédicat voit la bannière ENTIÈRE — son
    /// `threadIdentifier` compris (#6999).
    ///
    /// La forme `userInfo` ci-dessus reste le point d'entrée des révocations,
    /// qui interrogent bien une clé de charge (`notificationId`). Le retrait
    /// par FIL, lui, ne peut pas s'exprimer sur la seule charge : ce qu'iOS a
    /// REGROUPÉ est dans le `threadIdentifier`, et une bannière peut y être
    /// rangée sans que sa charge porte la clé de contexte.
    nonisolated static func removeDeliveredBanners(
        matching predicate: @escaping @Sendable (DeliveredBanner) -> Bool,
        center: DeliveredBannerCenter = .system(),
        confirmationTimeout: Duration = defaultRemovalConfirmationTimeout,
        completion: (@Sendable () -> Void)? = nil
    ) {
        center.delivered { banners in
            let matching = banners
                .filter { predicate($0) }
                .map(\.identifier)
            guard !matching.isEmpty else {
                completion?()
                return
            }
            center.remove(matching)
            // Personne n'attend (nettoyage après action, fire-and-forget) :
            // relire en boucle ne servirait qu'à brûler des allers-retours
            // système. La confirmation n'a de sens que pour un appelant qui
            // s'apprête à rendre la main à iOS.
            guard let completion else { return }
            confirmRemoval(
                of: Set(matching),
                center: center,
                timeout: confirmationTimeout,
                completion: completion
            )
        }
    }

    /// Variante attendue : la révocation par push silencieux doit avoir RETIRÉ
    /// la bannière avant de rendre la main à iOS (`completionHandler`), sinon
    /// le processus peut être suspendu la bannière encore affichée.
    nonisolated static func removeDeliveredNotificationsAwaiting(
        matching predicate: @escaping @Sendable ([AnyHashable: Any]) -> Bool,
        center: DeliveredBannerCenter = .system(),
        confirmationTimeout: Duration = defaultRemovalConfirmationTimeout
    ) async {
        await withCheckedContinuation { (continuation: CheckedContinuation<Void, Never>) in
            removeDeliveredNotifications(
                matching: predicate,
                center: center,
                confirmationTimeout: confirmationTimeout
            ) { continuation.resume() }
        }
    }

    /// **Le fil consommé quitte le centre iOS (#6999).**
    ///
    /// Point d'entrée branché sur `NotificationToastManager.deliveredBannerPurger` :
    /// ouvrir une conversation ou un post, le marquer lu depuis une bannière,
    /// répondre, commenter — tout ce qui CONSOMME un fil retire ses bannières.
    /// Une référence qui ne désigne aucun fil (`.id`, `.types`, `.all`) ne
    /// retire RIEN : « toutes les bannières » est précisément le geste que
    /// #7000 vient de supprimer du retour au premier plan.
    nonisolated static func removeDeliveredBanners(
        forThreadOf ref: NotificationRef,
        center: DeliveredBannerCenter = .system()
    ) {
        guard NotificationThreadIdentifier.resolve(for: ref) != nil else { return }
        removeDeliveredBanners(
            matching: { NotificationActionHandler.bannerBelongs($0, to: ref) },
            center: center
        )
    }

    /// Le prédicat, PUR et testable : une bannière appartient au fil de `ref`
    /// si iOS l'y a rangée (`threadIdentifier`) **ou** si sa charge porte la
    /// clé de contexte. Les deux, jamais l'un seul — le `threadIdentifier`
    /// manque sur une bannière composée sans passer par la NSE (push non
    /// mutable, notification locale), et la clé de charge manque dès que le
    /// gateway ne l'a pas remplie.
    nonisolated static func bannerBelongs(_ banner: DeliveredBanner, to ref: NotificationRef) -> Bool {
        guard let thread = NotificationThreadIdentifier.resolve(for: ref) else { return false }
        if banner.threadIdentifier == thread { return true }
        switch ref {
        case .conversation(let id):
            return (banner.userInfo["conversationId"] as? String) == id
        case .post(let id):
            return (banner.userInfo["postId"] as? String) == id
        case .notification, .types, .all:
            return false
        }
    }

    /// Combien de temps on accepte d'attendre la CONFIRMATION du retrait. Le
    /// budget d'un push silencieux se compte en secondes : une confirmation qui
    /// n'arrive jamais ne doit pas le consommer entier.
    nonisolated static let defaultRemovalConfirmationTimeout: Duration = .seconds(3)

    /// Intervalle de relecture pendant la confirmation.
    private nonisolated static let removalConfirmationPollInterval: Duration = .milliseconds(50)

    /// `removeDeliveredNotifications(withIdentifiers:)` n'a AUCUN completion
    /// handler : l'appeler est une ÉMISSION, pas un effet. Rendre la main à iOS
    /// derrière elle laisse le système libre de suspendre le processus avant
    /// que le retrait soit traité — la bannière reste affichée, exactement ce
    /// que la révocation prétend empêcher. La RELECTURE est la seule preuve.
    private nonisolated static func confirmRemoval(
        of identifiers: Set<String>,
        center: DeliveredBannerCenter,
        timeout: Duration,
        completion: (@Sendable () -> Void)?
    ) {
        Task.detached {
            let deadline = ContinuousClock.now.advanced(by: timeout)
            while true {
                let stillDelivered = await center.deliveredIdentifiers()
                if stillDelivered.isDisjoint(with: identifiers) { break }
                guard ContinuousClock.now < deadline else {
                    logger.error("Retrait de bannières non confirmé avant expiration du délai (\(identifiers.count, privacy: .public) id(s))")
                    break
                }
                _ = await cancellableSleep(for: removalConfirmationPollInterval)
            }
            completion?()
        }
    }
}
