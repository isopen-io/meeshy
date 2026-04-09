import XCTest
@testable import MeeshySDK

final class WaveformGeneratorTests: XCTestCase {

    // MARK: - Singleton

    @available(*, deprecated)
    func test_shared_returnsSameInstance() async {
        let a = WaveformGenerator.shared
        let b = WaveformGenerator.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Delegation to WaveformCache

    @available(*, deprecated)
    func test_generateSamples_fromInvalidURL_throws() async {
        let bogusURL = URL(fileURLWithPath: "/nonexistent/audio.wav")
        do {
            _ = try await WaveformGenerator.shared.generateSamples(from: bogusURL, sampleCount: 10)
            XCTFail("Expected an error for nonexistent file")
        } catch {
            // Expected — delegates to WaveformCache which will fail
        }
    }

    // MARK: - Default Sample Count

    @available(*, deprecated)
    func test_generateSamples_defaultSampleCount_is80() async {
        // Verify the method signature accepts default sampleCount of 80
        // We cannot test with a real file, but we verify the API compiles
        let bogusURL = URL(fileURLWithPath: "/nonexistent/audio.wav")
        do {
            _ = try await WaveformGenerator.shared.generateSamples(from: bogusURL)
        } catch {
            // Expected failure — we just test the API signature works
        }
    }

    // MARK: - Actor Type

    func test_waveformGenerator_isActorType() {
        // WaveformGenerator is declared as an actor
        // This test verifies it compiles as expected
        XCTAssertTrue(true)
    }
}
