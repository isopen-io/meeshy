import Foundation
import MeeshySDK

/// **The identity interlude between two authors' groups** (#13135): whether
/// it is shown, the identity it shows, its hold, and the identities of the
/// neighbouring groups resolved ahead of the switch.
///
/// The presenter only WAITS: when the hold elapses it hands the withdrawal
/// back (`elapsed`), and the reader arms the revealed slide's entrance and
/// animates both in one transaction (`dismissGroupIntro`). Nothing here
/// touches an appearance driver, so a cancellation can never leave a slide
/// armed and unrevealed (a permanent black slide).
@MainActor
final class StoryGroupIntroPresenter: ObservableObject {
    typealias Intro = StoryViewModel.StoryGroupIntro

    nonisolated deinit {}

    /// Written `false` by the reader inside its withdrawal animation.
    @Published var isShown = false
    @Published private(set) var intro: Intro?
    /// Identities resolved ahead (neighbours) or while shown: an interlude
    /// whose identity is here is complete from its first frame.
    @Published private(set) var resolved: [String: Intro] = [:]
    private var pending: Task<Void, Never>?

    func resolvedIntro(for userId: String) -> Intro? { resolved[userId] }

    /// Shown INSTANTLY (no fade-in: the opaque interlude takes the screen in
    /// the same transaction as the group swap), with the pre-resolved
    /// identity or the placeholder, enriched while shown. ONE sleep, then
    /// `elapsed` — never « arm, sleep, animate ».
    func present(_ placeholder: Intro, hold: TimeInterval,
                 resolve: @escaping @MainActor () async -> Intro,
                 elapsed: @escaping @MainActor () -> Void) {
        let userId = placeholder.userId
        intro = resolved[userId] ?? placeholder
        isShown = true
        pending = Task { @MainActor [weak self] in
            let enrich = Task { @MainActor [weak self] in
                let identity = await resolve()
                self?.resolved[userId] = identity
                guard !Task.isCancelled, let self, self.isShown, self.intro?.userId == userId else { return }
                self.intro = identity
            }
            try? await Task.sleep(for: .seconds(hold))
            enrich.cancel()
            guard !Task.isCancelled, self != nil else { return }
            elapsed()
        }
    }

    /// The pending hold (and its enrichment) no longer applies.
    func cancelPending() {
        pending?.cancel()
        pending = nil
    }

    /// Resolves the identities of the given groups not resolved yet.
    func prefetch(_ groups: [StoryGroup], resolve: @escaping @MainActor (StoryGroup) async -> Intro) {
        for group in groups where resolved[group.id] == nil {
            Task { @MainActor [weak self] in
                let identity = await resolve(group)
                self?.resolved[group.id] = identity
            }
        }
    }
}
