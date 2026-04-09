import XCTest
@testable import MeeshySDK

final class TranslationServiceTests: XCTestCase {

    private var mock: MockAPIClient!
    private var service: TranslationService!

    override func setUp() {
        super.setUp()
        mock = MockAPIClient()
        service = TranslationService(api: mock)
    }

    override func tearDown() {
        mock.reset()
        super.tearDown()
    }

    // MARK: - translate

    func test_translate_callsCorrectEndpoint() async throws {
        let translateResponse = TranslateResponse(translatedText: "Bonjour", detectedLanguage: "en")
        let response = APIResponse<TranslateResponse>(success: true, data: translateResponse, error: nil)
        mock.stub("/translate-blocking", result: response)

        _ = try await service.translate(text: "Hello", sourceLanguage: "en", targetLanguage: "fr")

        XCTAssertEqual(mock.requestCount, 1)
        XCTAssertEqual(mock.lastRequest?.endpoint, "/translate-blocking")
        XCTAssertEqual(mock.lastRequest?.method, "POST")
    }

    func test_translate_returnsParsedResponse() async throws {
        let translateResponse = TranslateResponse(translatedText: "Hola mundo", detectedLanguage: "en")
        let response = APIResponse<TranslateResponse>(success: true, data: translateResponse, error: nil)
        mock.stub("/translate-blocking", result: response)

        let result = try await service.translate(text: "Hello world", sourceLanguage: "en", targetLanguage: "es")

        XCTAssertEqual(result.translatedText, "Hola mundo")
        XCTAssertEqual(result.detectedLanguage, "en")
    }

    func test_translate_nilDetectedLanguage() async throws {
        let translateResponse = TranslateResponse(translatedText: "Bonjour", detectedLanguage: nil)
        let response = APIResponse<TranslateResponse>(success: true, data: translateResponse, error: nil)
        mock.stub("/translate-blocking", result: response)

        let result = try await service.translate(text: "Hello", sourceLanguage: "en", targetLanguage: "fr")

        XCTAssertEqual(result.translatedText, "Bonjour")
        XCTAssertNil(result.detectedLanguage)
    }

    func test_translate_networkError_propagates() async {
        mock.errorToThrow = MeeshyError.network(.noConnection)

        do {
            _ = try await service.translate(text: "Hello", sourceLanguage: "en", targetLanguage: "fr")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .network(.noConnection) = error {} else {
                XCTFail("Expected network noConnection, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_translate_serverError_propagates() async {
        mock.errorToThrow = MeeshyError.server(statusCode: 503, message: "Service Unavailable")

        do {
            _ = try await service.translate(text: "Hello", sourceLanguage: "en", targetLanguage: "fr")
            XCTFail("Expected error to be thrown")
        } catch let error as MeeshyError {
            if case .server(let code, let message) = error {
                XCTAssertEqual(code, 503)
                XCTAssertEqual(message, "Service Unavailable")
            } else {
                XCTFail("Expected server error, got \(error)")
            }
        } catch {
            XCTFail("Expected MeeshyError, got \(type(of: error))")
        }
    }

    func test_translate_multipleCallsTrackRequestCount() async throws {
        let translateResponse = TranslateResponse(translatedText: "Bonjour", detectedLanguage: nil)
        let response = APIResponse<TranslateResponse>(success: true, data: translateResponse, error: nil)
        mock.stub("/translate-blocking", result: response)

        _ = try await service.translate(text: "Hello", sourceLanguage: "en", targetLanguage: "fr")
        _ = try await service.translate(text: "World", sourceLanguage: "en", targetLanguage: "fr")

        XCTAssertEqual(mock.requestCount, 2)
    }
}
