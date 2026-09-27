import Foundation
import MeeshySDK

struct CallFeedbackPrompt: Equatable {
    let callId: String
    let peerName: String?
    let isVideo: Bool
}

/// #8072 — la note d'après-appel. Suit l'appel (reprise, lien dégradé), tire
/// la demande à la fin selon `CallFeedbackPolicy`, et envoie la note en un
/// geste : 4 ou 5 étoiles partent d'un toucher, en dessous on choisit ce qui
/// a gêné. « Plus tard » et l'expiration ferment sans rien envoyer.
@MainActor
final class CallFeedbackViewModel: ObservableObject {
    nonisolated deinit {}

    static let idleTimeout: Duration = .seconds(20)

    @Published private(set) var prompt: CallFeedbackPrompt?
    @Published private(set) var pendingRating: Int?
    @Published private(set) var selectedIssues: [CallFeedbackIssue] = []

    private let service: CallFeedbackServiceProviding
    private let random: () -> Double
    private let now: () -> Date
    private var troubled = false

    init(
        service: CallFeedbackServiceProviding = CallFeedbackService.shared,
        random: @escaping () -> Double = { Double.random(in: 0..<1) },
        now: @escaping () -> Date = Date.init
    ) {
        self.service = service
        self.random = random
        self.now = now
    }

    var availableIssues: [CallFeedbackIssue] {
        CallFeedbackPolicy.issues(isVideo: prompt?.isVideo ?? false)
    }

    func callStarted() {
        troubled = false
        close()
    }

    func noteTrouble() {
        troubled = true
    }

    func callEnded(callId: String?, peerName: String?, duration: TimeInterval, reason: CallEndReason, isVideo: Bool) {
        let wasTroubled = troubled
        troubled = false
        guard let callId, !callId.isEmpty else { return }
        guard CallFeedbackPolicy.shouldAsk(duration: duration, reason: reason, troubled: wasTroubled, random: random()) else { return }
        let date = now()
        guard CallFeedbackPolicy.cooldownAllows(lastPromptAt: service.lastPromptDate(), now: date) else { return }
        service.recordPrompt(at: date)
        pendingRating = nil
        selectedIssues = []
        prompt = CallFeedbackPrompt(callId: callId, peerName: peerName, isVideo: isVideo)
    }

    func rate(_ rating: Int) {
        guard prompt != nil, CallQualityFeedback.ratingRange.contains(rating) else { return }
        guard rating < CallFeedbackPolicy.goodRating else {
            submit(rating: rating, issues: [])
            return
        }
        pendingRating = rating
    }

    func toggle(_ issue: CallFeedbackIssue) {
        selectedIssues = selectedIssues.contains(issue)
            ? selectedIssues.filter { $0 != issue }
            : selectedIssues + [issue]
    }

    func send() {
        guard let pendingRating else { return }
        submit(rating: pendingRating, issues: selectedIssues)
    }

    func dismiss() {
        close()
    }

    func expire() {
        guard pendingRating == nil else { return }
        close()
    }

    private func submit(rating: Int, issues: [CallFeedbackIssue]) {
        guard let prompt,
              let feedback = CallFeedbackPolicy.feedback(callId: prompt.callId, rating: rating, issues: issues)
        else { return }
        service.submit(feedback)
        close()
    }

    private func close() {
        prompt = nil
        pendingRating = nil
        selectedIssues = []
    }
}
