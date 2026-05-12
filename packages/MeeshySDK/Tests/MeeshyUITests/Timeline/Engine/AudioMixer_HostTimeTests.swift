import XCTest
import Darwin
@testable import MeeshyUI

@MainActor
final class AudioMixer_HostTimeTests: XCTestCase {

    // MARK: - Fixtures

    /// Apple Silicon: timebase is identity (1/1). Nanos == host ticks.
    private var appleSiliconTimebase: mach_timebase_info_data_t {
        mach_timebase_info_data_t(numer: 1, denom: 1)
    }

    /// Intel/older devices: numer=1, denom=3. host ticks = nanos * 3.
    /// This is the path where naive `UInt64` math can overflow.
    private var intelTimebase: mach_timebase_info_data_t {
        mach_timebase_info_data_t(numer: 1, denom: 3)
    }

    // MARK: - Correctness

    func test_hostTime_smallDelay_correct() {
        let host = AudioMixer.hostTime(forDelaySeconds: 1.0, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 1_000_000_000, "1s on a 1/1 timebase should yield exactly 1e9 ticks")
    }

    func test_hostTime_zeroDelay_returnsZero() {
        let host = AudioMixer.hostTime(forDelaySeconds: 0, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 0)
    }

    func test_hostTime_negativeDelay_returnsZero() {
        let host = AudioMixer.hostTime(forDelaySeconds: -5, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 0, "Negative delays must be clamped to 0 to avoid back-dated schedules")
    }

    func test_hostTime_nonFiniteDelay_returnsZero() {
        XCTAssertEqual(AudioMixer.hostTime(forDelaySeconds: .nan, timebase: appleSiliconTimebase), 0)
        XCTAssertEqual(AudioMixer.hostTime(forDelaySeconds: .infinity, timebase: appleSiliconTimebase), 0)
    }

    func test_hostTime_invalidTimebase_returnsZero() {
        let zeroNumer = mach_timebase_info_data_t(numer: 0, denom: 1)
        let zeroDenom = mach_timebase_info_data_t(numer: 1, denom: 0)
        XCTAssertEqual(AudioMixer.hostTime(forDelaySeconds: 1, timebase: zeroNumer), 0)
        XCTAssertEqual(AudioMixer.hostTime(forDelaySeconds: 1, timebase: zeroDenom), 0)
    }

    // MARK: - Overflow safety

    func test_hostTime_largeDelay_30s_doesNotOverflow() {
        // 30 s slides are a realistic upper bound. On any timebase the result
        // must be well below UInt64.max and proportional to the input.
        let appleHost = AudioMixer.hostTime(forDelaySeconds: 30, timebase: appleSiliconTimebase)
        let intelHost = AudioMixer.hostTime(forDelaySeconds: 30, timebase: intelTimebase)
        XCTAssertEqual(appleHost, 30_000_000_000)
        XCTAssertEqual(intelHost, 90_000_000_000, "30s × 3 (denom/numer) = 9e10 ticks, no overflow")
        XCTAssertLessThan(intelHost, UInt64.max)
    }

    func test_hostTime_intelTimebase_doesNotOverflow() {
        // A delay near the legacy overflow threshold (~9.22s × 1e9 ≈ 9.22e18
        // nanos, then × 3 = 2.77e19 which exceeds UInt64.max ≈ 1.84e19). With
        // Double-based arithmetic + clamp the function must return a finite,
        // non-wrapped value. We feed a delay deliberately past any realistic
        // ceiling to exercise the clamp path.
        let huge: Double = 1.0e10 // 10 billion seconds
        let host = AudioMixer.hostTime(forDelaySeconds: huge, timebase: intelTimebase)
        // 1e10 s × 1e9 ns/s × 3 = 3e28 — far above UInt64.max → must clamp.
        XCTAssertEqual(host, UInt64.max, "Beyond UInt64 range the result must saturate, not wrap")
    }

    func test_hostTime_appleSilicon_unchanged() {
        // On the (1, 1) timebase the function must remain a straight
        // nanoseconds passthrough for any sensible delay — proves we did not
        // regress the production fast path while hardening the slow path.
        for seconds in [0.001, 0.5, 1.0, 5.0, 9.22, 15.0] {
            let host = AudioMixer.hostTime(forDelaySeconds: seconds, timebase: appleSiliconTimebase)
            let expected = UInt64(seconds * 1_000_000_000)
            // Allow one tick of rounding error from Double truncation.
            XCTAssertLessThanOrEqual(
                host > expected ? host - expected : expected - host,
                1,
                "Apple-Silicon timebase must passthrough nanos for delay=\(seconds)s"
            )
        }
    }

    // MARK: - Cross-timebase scaling

    func test_hostTime_intelTimebase_isThreeTimesAppleSilicon() {
        let seconds: Double = 2.5
        let apple = AudioMixer.hostTime(forDelaySeconds: seconds, timebase: appleSiliconTimebase)
        let intel = AudioMixer.hostTime(forDelaySeconds: seconds, timebase: intelTimebase)
        XCTAssertEqual(intel, apple * 3, "Intel timebase (1/3) must produce exactly 3× the host ticks")
    }
}
