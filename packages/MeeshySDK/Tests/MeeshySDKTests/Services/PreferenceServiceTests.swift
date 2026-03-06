import XCTest
@testable import MeeshySDK

final class PreferenceServiceTests: XCTestCase {
    private var mock: MockAPIClient!
    private var service: PreferenceService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = PreferenceService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - Helpers

    private func makeCategory(id: String = "cat1", name: String = "Work") -> ConversationCategory {
        ConversationCategory(
            id: id, name: name, color: "#FF0000",
            icon: "briefcase", order: 0, isExpanded: true
        )
    }

    private func makeConversationPreferences() -> APIConversationPreferences {
        APIConversationPreferences(
            isPinned: true, isMuted: false, isArchived: false,
            deletedForUserAt: nil, tags: ["important"],
            categoryId: "cat1", reaction: nil
        )
    }

    private func makeUserPreferences() -> UserPreferences {
        UserPreferences(
            privacy: .defaults,
            audio: .defaults,
            message: .defaults,
            notification: .defaults,
            video: .defaults,
            document: .defaults,
            application: .defaults
        )
    }

    // MARK: - getCategories

    func testGetCategoriesReturnsCategories() async throws {
        let categories = [makeCategory(), makeCategory(id: "cat2", name: "Personal")]
        let response = APIResponse(success: true, data: categories, error: nil)
        mock.stub("/me/preferences/categories", result: response)

        let result = try await service.getCategories()

        XCTAssertEqual(result.count, 2)
        XCTAssertEqual(result[0].id, "cat1")
        XCTAssertEqual(result[0].name, "Work")
        XCTAssertEqual(result[0].color, "#FF0000")
        XCTAssertEqual(result[0].icon, "briefcase")
        XCTAssertEqual(result[1].id, "cat2")
        XCTAssertEqual(result[1].name, "Personal")
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/categories")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testGetCategoriesReturnsEmptyList() async throws {
        let response = APIResponse<[ConversationCategory]>(success: true, data: [], error: nil)
        mock.stub("/me/preferences/categories", result: response)

        let result = try await service.getCategories()

        XCTAssertTrue(result.isEmpty)
    }

    // MARK: - getConversationPreferences

    func testGetConversationPreferencesReturnsPreferences() async throws {
        let prefs = makeConversationPreferences()
        let response = APIResponse(success: true, data: prefs, error: nil)
        mock.stub("/user-preferences/conversations/conv123", result: response)

        let result = try await service.getConversationPreferences(conversationId: "conv123")

        XCTAssertEqual(result.isPinned, true)
        XCTAssertEqual(result.isMuted, false)
        XCTAssertEqual(result.isArchived, false)
        XCTAssertEqual(result.tags, ["important"])
        XCTAssertEqual(result.categoryId, "cat1")
        XCTAssertNil(result.reaction)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/user-preferences/conversations/conv123")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testGetConversationPreferencesThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 404, message: "Not found")

        do {
            _ = try await service.getConversationPreferences(conversationId: "missing")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 404)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - updateConversationPreferences

    func testUpdateConversationPreferencesCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/user-preferences/conversations/conv123", result: response)

        let request = UpdateConversationPreferencesRequest(isPinned: true, isMuted: false)
        try await service.updateConversationPreferences(conversationId: "conv123", request: request)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/user-preferences/conversations/conv123")
        XCTAssertEqual(mock.lastRequest?.method, "PUT")
    }

    func testUpdateConversationPreferencesThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "Invalid request")

        let request = UpdateConversationPreferencesRequest(isPinned: true)

        do {
            try await service.updateConversationPreferences(conversationId: "conv1", request: request)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 400)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - patchCategory

    func testPatchCategoryCallsCorrectEndpoint() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/categories/cat1", result: response)

        try await service.patchCategory(id: "cat1", isExpanded: false)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/categories/cat1")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    func testPatchCategoryWithExpandedTrue() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/categories/cat2", result: response)

        try await service.patchCategory(id: "cat2", isExpanded: true)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/categories/cat2")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    // MARK: - getAllPreferences

    func testGetAllPreferencesReturnsDefaults() async throws {
        let prefs = makeUserPreferences()
        let response = APIResponse(success: true, data: prefs, error: nil)
        mock.stub("/me/preferences", result: response)

        let result = try await service.getAllPreferences()

        XCTAssertEqual(result.privacy.showOnlineStatus, true)
        XCTAssertEqual(result.audio.audioQuality, .high)
        XCTAssertEqual(result.message.sendOnEnter, true)
        XCTAssertEqual(result.notification.pushEnabled, true)
        XCTAssertEqual(result.video.videoQuality, .auto)
        XCTAssertEqual(result.document.autoDownloadEnabled, false)
        XCTAssertEqual(result.application.theme, .auto)
        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences")
        XCTAssertEqual(mock.lastRequest?.method, "GET")
    }

    func testGetAllPreferencesWithCustomValues() async throws {
        var prefs = makeUserPreferences()
        prefs.privacy.showOnlineStatus = false
        prefs.audio.audioQuality = .lossless
        prefs.application.theme = .dark
        let response = APIResponse(success: true, data: prefs, error: nil)
        mock.stub("/me/preferences", result: response)

        let result = try await service.getAllPreferences()

        XCTAssertEqual(result.privacy.showOnlineStatus, false)
        XCTAssertEqual(result.audio.audioQuality, .lossless)
        XCTAssertEqual(result.application.theme, .dark)
    }

    func testGetAllPreferencesThrowsOnError() async {
        mock.errorToThrow = MeeshyError.auth(.sessionExpired)

        do {
            _ = try await service.getAllPreferences()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .auth(.sessionExpired) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.auth(.sessionExpired), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - patchPreferences

    func testPatchPreferencesPrivacy() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/privacy", result: response)

        let body = ["showOnlineStatus": false]
        try await service.patchPreferences(category: .privacy, body: body)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/privacy")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    func testPatchPreferencesAudio() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/audio", result: response)

        let body = ["transcriptionEnabled": true]
        try await service.patchPreferences(category: .audio, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/audio")
        XCTAssertEqual(mock.lastRequest?.method, "PATCH")
    }

    func testPatchPreferencesMessage() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/message", result: response)

        let body = ["sendOnEnter": false]
        try await service.patchPreferences(category: .message, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/message")
    }

    func testPatchPreferencesNotification() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/notification", result: response)

        let body = ["pushEnabled": false]
        try await service.patchPreferences(category: .notification, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/notification")
    }

    func testPatchPreferencesVideo() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/video", result: response)

        let body = ["mirrorLocalVideo": false]
        try await service.patchPreferences(category: .video, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/video")
    }

    func testPatchPreferencesDocument() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/document", result: response)

        let body = ["autoDownloadEnabled": true]
        try await service.patchPreferences(category: .document, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/document")
    }

    func testPatchPreferencesApplication() async throws {
        let response = APIResponse(success: true, data: ["status": "ok"], error: nil)
        mock.stub("/me/preferences/application", result: response)

        let body = ["compactMode": true]
        try await service.patchPreferences(category: .application, body: body)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/application")
    }

    func testPatchPreferencesThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 400, message: "Invalid body")

        do {
            let body = ["invalid": true]
            try await service.patchPreferences(category: .privacy, body: body)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, _) = error {
                XCTAssertEqual(code, 400)
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - resetPreferences

    func testResetPreferencesPrivacy() async throws {
        let response = APIResponse(success: true, data: ["reset": true], error: nil)
        mock.stub("/me/preferences/privacy", result: response)

        try await service.resetPreferences(category: .privacy)

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/privacy")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func testResetPreferencesAudio() async throws {
        let response = APIResponse(success: true, data: ["reset": true], error: nil)
        mock.stub("/me/preferences/audio", result: response)

        try await service.resetPreferences(category: .audio)

        XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/audio")
        XCTAssertEqual(mock.lastRequest?.method, "DELETE")
    }

    func testResetPreferencesAllCategories() async throws {
        for category in PreferenceCategory.allCases {
            mock.reset()
            let response = APIResponse(success: true, data: ["reset": true], error: nil)
            mock.stub("/me/preferences/\(category.rawValue)", result: response)

            try await service.resetPreferences(category: category)

            XCTAssertEqual(mock.lastRequest?.endpoint, "/me/preferences/\(category.rawValue)")
            XCTAssertEqual(mock.lastRequest?.method, "DELETE")
        }
    }

    func testResetPreferencesThrowsOnError() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 500, message: "Internal error")

        do {
            try await service.resetPreferences(category: .privacy)
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, let msg) = error {
                XCTAssertEqual(code, 500)
                XCTAssertEqual(msg, "Internal error")
            } else {
                XCTFail("Expected MeeshyError.server, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }
    }

    // MARK: - Network error propagation

    func testGetCategoriesThrowsOnNetworkError() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.getCategories()
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {
                // expected
            } else {
                XCTFail("Expected MeeshyError.network(.noConnection), got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(error)")
        }

        XCTAssertEqual(mock.requestCount, 1)
    }
}
