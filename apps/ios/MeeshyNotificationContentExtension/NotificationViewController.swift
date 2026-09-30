import SwiftUI
import UIKit
@preconcurrency import UserNotifications
@preconcurrency import UserNotificationsUI

/// **La notification DÉPLOYÉE** (appui long, écran verrouillé ou centre de
/// notifications) — #8859.
///
/// Toute la décision est dans `NotificationExpandedContent` (pure, témoignée) :
/// ce contrôleur ne fait que la rendre. Le texte de la notification (titre et
/// corps, où la passerelle a déjà posé la transcription servie par le Prisme)
/// reste affiché par le système sous la vue (`UNNotificationExtensionDefaultContentHidden`
/// à NO).
///
/// Rien pour un message protégé : `resolve` rend `nil`, la vue garde une hauteur
/// nulle, et seul le texte — déjà un placeholder — s'affiche.
final class NotificationViewController: UIViewController, UNNotificationContentExtension {

    private var content: NotificationExpandedContent?
    private var player: NotificationAudioPlayer?
    private var hosting: UIViewController?

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .clear
        preferredContentSize = CGSize(width: view.bounds.width, height: 0)
    }

    func didReceive(_ notification: UNNotification) {
        let request = notification.request.content
        let resolved = NotificationExpandedContent.resolve(userInfo: request.userInfo) { raw in
            NotificationPayloadHelpers.resolveRemoteMediaURL(raw, apiBaseURL: NSETrustedOrigin.apiBaseURL)
        }
        content = resolved
        guard let resolved else {
            preferredContentSize = CGSize(width: view.bounds.width, height: 0)
            return
        }
        mount(root(for: resolved, attachments: request.attachments.map(\.url)))
        preferredContentSize = CGSize(width: view.bounds.width, height: NotificationExpandedLayout.height(for: resolved))
    }

    func didReceive(
        _ response: UNNotificationResponse,
        completionHandler completion: @escaping (UNNotificationContentExtensionResponseOption) -> Void
    ) {
        player?.pause()
        completion(.dismissAndForwardAction)
    }

    // MARK: - Bouton natif de lecture

    var mediaPlayPauseButtonType: UNNotificationContentExtensionMediaPlayPauseButtonType {
        guard case .audio = content else { return .none }
        return .default
    }

    var mediaPlayPauseButtonFrame: CGRect { NotificationExpandedLayout.playButtonFrame }

    var mediaPlayPauseButtonTintColor: UIColor { UIColor(NotificationExpandedLayout.accent) }

    func mediaPlay() { player?.play() }

    func mediaPause() { player?.pause() }

    override func viewDidDisappear(_ animated: Bool) {
        super.viewDidDisappear(animated)
        player?.stop()
    }

    // MARK: - Rendu

    private func root(for content: NotificationExpandedContent, attachments: [URL]) -> NotificationExpandedRoot {
        if case .audio(let audio) = content {
            let player = NotificationAudioPlayer(
                url: NotificationExpandedContent.playableURL(attachmentURLs: attachments, remote: audio.remoteURL),
                declaredDurationMs: audio.durationMs
            )
            player.onFinish = { [weak self] in self?.extensionContext?.mediaPlayingPaused() }
            self.player = player
        }
        return NotificationExpandedRoot(content: content, player: player) { [weak self] url in
            self?.extensionContext?.open(url, completionHandler: nil)
        }
    }

    private func mount(_ rootView: NotificationExpandedRoot) {
        hosting?.view.removeFromSuperview()
        hosting?.removeFromParent()
        let controller = UIHostingController(rootView: rootView)
        controller.view.backgroundColor = .clear
        addChild(controller)
        controller.view.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(controller.view)
        NSLayoutConstraint.activate([
            controller.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            controller.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            controller.view.topAnchor.constraint(equalTo: view.topAnchor),
            controller.view.bottomAnchor.constraint(equalTo: view.bottomAnchor),
        ])
        controller.didMove(toParent: self)
        hosting = controller
    }
}
