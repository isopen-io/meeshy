import XCTest
@testable import MeeshySDK

final class WaveformCacheTests: XCTestCase {

    // MARK: - Singleton

    func test_shared_returnsSameInstance() async {
        let a = WaveformCache.shared
        let b = WaveformCache.shared
        XCTAssertTrue(a === b)
    }

    // MARK: - Clear Memory Cache

    func test_clearMemoryCache_doesNotCrash() async {
        await WaveformCache.shared.clearMemoryCache()
    }

    // MARK: - Clear All Caches

    func test_clearAllCaches_doesNotCrash() async {
        await WaveformCache.shared.clearAllCaches()
    }

    // MARK: - Samples from Invalid URL

    func test_samples_fromInvalidURL_throws() async {
        let bogusURL = URL(fileURLWithPath: "/nonexistent/audio.wav")
        do {
            _ = try await WaveformCache.shared.samples(from: bogusURL, count: 10)
            XCTFail("Expected an error for nonexistent file")
        } catch {
            // Expected
        }
    }

    // MARK: - Samples from Empty Data

    func test_samples_fromEmptyData_throws() async {
        let emptyData = Data()
        do {
            _ = try await WaveformCache.shared.samples(from: emptyData, count: 10)
            XCTFail("Expected an error for empty data")
        } catch {
            // Expected — empty data cannot be read as audio
        }
    }

    // MARK: - Waveform Image from Invalid URL

    func test_waveformImageData_fromInvalidURL_throws() async {
        let bogusURL = URL(fileURLWithPath: "/nonexistent/audio.wav")
        do {
            _ = try await WaveformCache.shared.waveformImageData(from: bogusURL)
            XCTFail("Expected an error for nonexistent file")
        } catch {
            // Expected
        }
    }
}
