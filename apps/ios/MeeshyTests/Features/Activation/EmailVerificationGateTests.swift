import XCTest
import MeeshySDK
@testable import Meeshy

/// **Un refus `EMAIL_NOT_VERIFIED` mène à la validation, puis l'action repart**
/// (#8365). La garde serveur de #6437 reste : `POST /posts`,
/// `/posts/from-attachment`, `/invitations/email`, `/links`,
/// `/conversations/:id/new-link`. `APIClient` — seul site par lequel ces cinq
/// routes passent — ouvre la validation et REJOUE la même requête : rien du
/// brouillon n'est perdu.
final class EmailVerificationGateTests: XCTestCase {

    private final class FakeGate: EmailVerificationGating, @unchecked Sendable {
        let knownUnproven: Bool
        let answer: Bool
        private(set) var asked: [EmailGateReason] = []

        init(knownUnproven: Bool = false, answer: Bool) {
            self.knownUnproven = knownUnproven
            self.answer = answer
        }

        func emailKnownUnproven() async -> Bool { knownUnproven }

        func verifyEmail(for reason: EmailGateReason) async -> Bool {
            asked.append(reason)
            return answer
        }
    }

    private final class Requests: @unchecked Sendable {
        private(set) var count = 0
        private var outcomes: [Result<String, Error>]

        init(_ outcomes: [Result<String, Error>]) { self.outcomes = outcomes }

        func perform() throws -> String {
            count += 1
            return try (outcomes.isEmpty ? .success("created") : outcomes.removeFirst()).get()
        }
    }

    private static let refused = EmailVerificationGate.localRefusal()
    private static let postBody = Data(#"{"type":"POST","content":"Mon brouillon"}"#.utf8)
    private static let storyBody = Data(#"{"type":"STORY","mediaIds":["m-1"]}"#.utf8)

    // MARK: - Les cinq routes, et elles seules

    func test_reason_theFiveGuardedRoutes_areRecognised() {
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/api/v1/posts"), .publish)
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/api/v1/posts/from-attachment"), .publish)
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/api/v1/invitations/email"), .invite)
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/api/v1/links"), .link)
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/api/v1/conversations/c-1/new-link"), .link)
        XCTAssertEqual(EmailVerificationGate.reason(method: "POST", path: "/posts"), .publish)
    }

    func test_reason_otherRoutesOrVerbs_areNotGuarded() {
        XCTAssertNil(EmailVerificationGate.reason(method: "GET", path: "/api/v1/posts"))
        XCTAssertNil(EmailVerificationGate.reason(method: "POST", path: "/api/v1/posts/p-1/like"))
        XCTAssertNil(EmailVerificationGate.reason(method: "PATCH", path: "/api/v1/links/l-1"))
        XCTAssertNil(EmailVerificationGate.reason(method: "POST", path: "/api/v1/links/l-1/extend"))
    }

    // MARK: - Le refus mène à la validation, la requête repart

    func test_run_refusedThenVerified_replaysTheSameRequest() async throws {
        let gate = FakeGate(answer: true)
        let requests = Requests([.failure(Self.refused), .success("created")])

        let result = try await EmailVerificationGate.run(method: "POST", path: "/api/v1/posts", body: Self.postBody, gate: gate) {
            try requests.perform()
        }

        XCTAssertEqual(result, "created")
        XCTAssertEqual(gate.asked, [.publish])
        XCTAssertEqual(requests.count, 2)
    }

    func test_run_refusedThenDismissed_rethrowsTheRefusal() async {
        let gate = FakeGate(answer: false)
        let requests = Requests([.failure(Self.refused)])

        do {
            _ = try await EmailVerificationGate.run(method: "POST", path: "/api/v1/invitations/email", body: nil, gate: gate) {
                try requests.perform()
            }
            XCTFail("le refus d’origine doit remonter")
        } catch {
            XCTAssertTrue(EmailVerificationGate.isRefusal(error))
        }
        XCTAssertEqual(gate.asked, [.invite])
        XCTAssertEqual(requests.count, 1)
    }

    func test_run_otherForbidden_asksNothing() async {
        let gate = FakeGate(answer: true)
        let other = MeeshyError.forbidden(reason: "no", body: Data(#"{"code":"PERMISSION_DENIED"}"#.utf8))
        let requests = Requests([.failure(other)])

        _ = try? await EmailVerificationGate.run(method: "POST", path: "/api/v1/links", body: nil, gate: gate) {
            try requests.perform()
        }

        XCTAssertEqual(gate.asked, [])
        XCTAssertEqual(requests.count, 1)
    }

    // MARK: - Prévenir plutôt que guérir

    func test_run_knownUnproven_verifiesBeforeAnySend() async throws {
        let gate = FakeGate(knownUnproven: true, answer: true)
        let requests = Requests([.success("created")])

        let result = try await EmailVerificationGate.run(method: "POST", path: "/api/v1/links", body: nil, gate: gate) {
            try requests.perform()
        }

        XCTAssertEqual(result, "created")
        XCTAssertEqual(gate.asked, [.link])
        XCTAssertEqual(requests.count, 1)
    }

    func test_run_knownUnprovenAndDismissed_sendsNothing() async {
        let gate = FakeGate(knownUnproven: true, answer: false)
        let requests = Requests([])

        do {
            _ = try await EmailVerificationGate.run(method: "POST", path: "/api/v1/posts", body: Self.postBody, gate: gate) {
                try requests.perform()
            }
            XCTFail("aucun envoi sans adresse prouvée")
        } catch {
            XCTAssertTrue(EmailVerificationGate.isRefusal(error))
        }
        XCTAssertEqual(requests.count, 0)
    }

    func test_run_story_isNeverHeldBack_firstStoryStaysAllowed() async throws {
        let gate = FakeGate(knownUnproven: true, answer: false)
        let requests = Requests([.success("story")])

        let result = try await EmailVerificationGate.run(method: "POST", path: "/api/v1/posts", body: Self.storyBody, gate: gate) {
            try requests.perform()
        }

        XCTAssertEqual(result, "story")
        XCTAssertEqual(gate.asked, [])
    }

    func test_run_withoutGate_passesThrough() async {
        let requests = Requests([.failure(Self.refused)])

        _ = try? await EmailVerificationGate.run(method: "POST", path: "/api/v1/posts", body: Self.postBody, gate: nil) {
            try requests.perform()
        }

        XCTAssertEqual(requests.count, 1)
    }
}
