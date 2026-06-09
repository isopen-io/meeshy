import Foundation
import MeeshySDK
import MeeshyUI

/// Conversation-side prefetcher for visible/recent media. Drops down to
/// `CacheCoordinator` (images / audio) and `StoryMediaLoader` (video
/// thumbnails + AVPlayer preroll) to warm the on-disk store ahead of any
/// user scroll so the bubble grid never blocks on a network round-trip.
///
/// Internal visibility: app-side orchestrator (per `[[sdk-purity]]`).
@MainActor
final class ConversationMediaHandler {
    private let state: ConversationStateStore
    private var inFlightTask: Task<Void, Never>?

    init(state: ConversationStateStore) {
        self.state = state
    }

    /// Prefetch image thumbs/full, audio bytes, video thumbnails for the
    /// last 30 messages that carry attachments. Cancels any in-flight
    /// prefetch so a rapid burst of socket updates only triggers the last
    /// snapshot. Caller is expected to debounce upstream (the legacy
    /// `ConversationViewModel` adds a 300 ms debounce).
    func prefetchRecentMedia() {
        inFlightTask?.cancel()
        let snapshot = Array(state.messages.suffix(30).filter { !$0.attachments.isEmpty })
        guard !snapshot.isEmpty else { return }
        // Respect the user's auto-download policy. The bubble views already gate
        // their network fetch on it; prefetching the full media regardless was
        // burning cellular data the user opted out of (and warming media the view
        // won't display). Read the policy once on the main actor and gate each
        // media kind below.
        let condition = NetworkConditionMonitor.shared.condition
        let prefs = MediaDownloadPreferencesStore.shared.preferences
        let allowImage = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .image, condition: condition, prefs: prefs)
        let allowVideo = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .video, condition: condition, prefs: prefs)
        let allowAudio = MediaDownloadPolicyEngine.shouldAutoDownload(kind: .audio, condition: condition, prefs: prefs)
        guard allowImage || allowVideo || allowAudio else { return }
        inFlightTask = Task(priority: .utility) {
            let imageStore = await CacheCoordinator.shared.images

            // Parallel prefetch: images / thumbnails / audio in a TaskGroup.
            await withTaskGroup(of: Void.self) { group in
                for message in snapshot {
                    for attachment in message.attachments {
                        guard !Task.isCancelled else { return }
                        switch attachment.type {
                        case .image:
                            guard allowImage else { continue }
                            if let thumbUrl = attachment.thumbnailUrl, !thumbUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                            if !attachment.fileUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            }
                        case .video:
                            guard allowVideo else { continue }
                            if let thumbUrl = attachment.thumbnailUrl, !thumbUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(thumbUrl)?.absoluteString {
                                group.addTask { _ = await imageStore.image(for: resolved) }
                            } else if !attachment.fileUrl.isEmpty,
                                      let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl) {
                                group.addTask { _ = await StoryMediaLoader.shared.videoThumbnail(url: resolved) }
                            }
                        case .audio:
                            guard allowAudio else { continue }
                            if !attachment.fileUrl.isEmpty,
                               let resolved = MeeshyConfig.resolveMediaURL(attachment.fileUrl)?.absoluteString {
                                group.addTask { _ = try? await CacheCoordinator.shared.audio.data(for: resolved) }
                            }
                        default:
                            break
                        }
                    }
                }
            }

            // Video preroll: fire-and-forget so the first video in the
            // current window starts as soon as the user taps play. Doesn't
            // delay this prefetch — runs in its own utility-priority Task.
            if allowVideo,
               let firstVideoAtt = snapshot.flatMap(\.attachments).first(where: { $0.type == .video }),
               !firstVideoAtt.fileUrl.isEmpty,
               let resolved = MeeshyConfig.resolveMediaURL(firstVideoAtt.fileUrl) {
                Task(priority: .utility) {
                    await StoryMediaLoader.shared.preloadAndCachePlayer(url: resolved)
                }
            }
        }
    }
}
