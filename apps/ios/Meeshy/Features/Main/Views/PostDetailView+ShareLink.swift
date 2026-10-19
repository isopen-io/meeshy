import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **Le lien de partage d'un post** — « Copier le lien » et « Partager » du
/// menu « … » frappent le même lien suivi. Extrait de `PostDetailView.swift`
/// (#10956) ; la feuille système se présente depuis
/// `PostDetailView+Presentations.swift`.
extension PostDetailView {

    /// Which post action the user just triggered from the `…` menu. Both
    /// "Copier le lien" and "Partager" call the same gateway endpoint;
    /// only the post-success behaviour differs (pasteboard vs share sheet).
    enum ShareLinkAction { case copyToPasteboard, presentShareSheet }

    /// Calls `POST /posts/:id/share?generateLink=true`, then dispatches the
    /// short URL to either the pasteboard or the system share sheet.
    /// `medium=share` UTM is attached by the gateway so analytics can split
    /// "share via copy-link" from "share via system sheet" later. If the
    /// mint fails (offline, rate-limit, gateway error) the call still
    /// surfaces the raw post URL so the user is never stuck with nothing to
    /// share — only the attribution analytics are skipped.
    func mintShareLink(action: ShareLinkAction) async {
        guard let post = viewModel.post else { return }
        let trackingShortUrl: String? = await {
            do {
                let result = try await PostService.shared.share(
                    postId: post.id,
                    platform: action == .copyToPasteboard ? "copy" : "system",
                    generateLink: true
                )
                return result.shortUrl
            } catch {
                return nil
            }
        }()

        let fallbackUrlString = "\(ShareableLink.webBaseURL)/feeds/post/\(post.id)"
        let resolvedString = trackingShortUrl ?? fallbackUrlString
        guard let resolvedUrl = URL(string: resolvedString) else {
            FeedbackToastManager.shared.showError(String(localized: "post.link.unavailable", defaultValue: "Lien indisponible", bundle: .main))
            return
        }

        await MainActor.run {
            switch action {
            case .copyToPasteboard:
                UIPasteboard.general.string = resolvedString
                HapticFeedback.success()
                FeedbackToastManager.shared.show(
                    String(localized: "feed.post.detail.copy_link.success", defaultValue: "Lien copié", bundle: .main)
                )
            case .presentShareSheet:
                shareableLink = ShareableLink(url: resolvedUrl, fileSource: .post(post))
                HapticFeedback.light()
            }
        }
    }
}
