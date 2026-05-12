import XCTest
import Darwin
@testable import MeeshyUI

/// Mirrors `AudioMixer_HostTimeTests` for `ReaderAudioMixer.hostTime(forDelaySeconds:)`.
/// `ReaderAudioMixer` previously had its own UInt64-based implementation that
/// silently overflowed on non-Apple-Silicon timebases for delays > 9.22s — a
/// realistic value for a 30s slide. The fix routes the helper through the
/// already-hardened `AudioMixer.hostTime` (P3-#5, commit `841a528a`), so the
/// tests here both lock the public behavior of `ReaderAudioMixer.hostTime` and
/// guarantee the wiring stays consistent with the source-of-truth helper.
@MainActor
final class ReaderAudioMixer_HostTimeTests: XCTestCase {

    // MARK: - Fixtures

    /// Apple Silicon: timebase is identity (1/1). Nanos == host ticks.
    private var appleSiliconTimebase: mach_timebase_info_data_t {
        mach_timebase_info_data_t(numer: 1, denom: 1)
    }

    /// Intel/older devices: numer=1, denom=3. host ticks = nanos * 3.
    /// This is the path where naive UInt64 math can overflow.
    private var intelTimebase: mach_timebase_info_data_t {
        mach_timebase_info_data_t(numer: 1, denom: 3)
    }

    // MARK: - Correctness

    func test_hostTime_smallDelay_correct() {
        let host = ReaderAudioMixer.hostTime(forDelaySeconds: 1.0, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 1_000_000_000, "1s on a 1/1 timebase should yield exactly 1e9 ticks")
    }

    func test_hostTime_zeroDelay_returnsZero() {
        let host = ReaderAudioMixer.hostTime(forDelaySeconds: 0, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 0)
    }

    func test_hostTime_negativeDelay_returnsZero() {
        let host = ReaderAudioMixer.hostTime(forDelaySeconds: -5, timebase: appleSiliconTimebase)
        XCTAssertEqual(host, 0, "Negative delays must be clamped to 0 to avoid back-dated schedules")
    }

    func test_hostTime_nonFiniteDelay_returnsZero() {
        XCTAssertEqual(ReaderAudioMixer.hostTime(forDelaySeconds: .nan, timebase: appleSiliconTimebase), 0)
        XCTAssertEqual(ReaderAudioMixer.hostTime(forDelaySeconds: .infinity, timebase: appleSiliconTimebase), 0)
    }

    func test_hostTime_invalidTimebase_returnsZero() {
        let zeroNumer = mach_timebase_info_data_t(numer: 0, denom: 1)
        let zeroDenom = mach_timebase_info_data_t(numer: 1, denom: 0)
        XCTAssertEqual(ReaderAudioMixer.hostTime(forDelaySeconds: 1, timebase: zeroNumer), 0)
        XCTAssertEqual(ReaderAudioMixer.hostTime(forDelaySeconds: 1, timebase: zeroDenom), 0)
    }

    // MARK: - Overflow safety

    func test_hostTime_largeDelay_30s_doesNotOverflow() {
        // 30 s slides are a realistic upper bound. The legacy ReaderAudioMixer
        // helper truncated `30 * 1e9` into UInt64 and then multiplied by denom
        // (Intel: 3) which still fit, but the boundary above this where the
        // intermediate UInt64 multiplied product exceeded the type capacity
        // started corrupting the schedule — the new implementation must keep
        // both Apple Silicon and Intel within safe range.
        let appleHost = ReaderAudioMixer.hostTime(forDelaySeconds: 30, timebase: appleSiliconTimebase)
        let intelHost = ReaderAudioMixer.hostTime(forDelaySeconds: 30, timebase: intelTimebase)
        XCTAssertEqual(appleHost, 30_000_000_000)
        XCTAssertEqual(intelHost, 90_000_000_000, "30s × 3 (denom/numer) = 9e10 ticks, no overflow")
        XCTAssertLessThan(intelHost, UInt64.max)
    }

    func test_hostTime_intelTimebase_doesNotOverflow() {
        // A delay way past the legacy overflow threshold: 1e10 s × 1e9 ns/s × 3
        // = 3e28 — far above UInt64.max ≈ 1.84e19. With Double-based arithmetic
        // and the saturating clamp the function must return a finite, non-
        // wrapped value rather than silently produce a tiny number that would
        // schedule audio in the past.
        let huge: Double = 1.0e10
        let host = ReaderAudioMixer.hostTime(forDelaySeconds: huge, timebase: intelTimebase)
        XCTAssertEqual(host, UInt64.max, "Beyond UInt64 range the result must saturate, not wrap")
    }

    func test_hostTime_appleSilicon_unchanged() {
        // On the (1, 1) timebase the function must remain a straight
        // nanoseconds passthrough for any sensible delay — proves we did not
        // regress the production fast path while hardening the slow path.
        for seconds in [0.001, 0.5, 1.0, 5.0, 9.22, 15.0] {
            let host = ReaderAudioMixer.hostTime(forDelaySeconds: seconds, timebase: appleSiliconTimebase)
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
        let apple = ReaderAudioMixer.hostTime(forDelaySeconds: seconds, timebase: appleSiliconTimebase)
        let intel = ReaderAudioMixer.hostTime(forDelaySeconds: seconds, timebase: intelTimebase)
        XCTAssertEqual(intel, apple * 3, "Intel timebase (1/3) must produce exactly 3× the host ticks")
    }

    // MARK: - Delegation contract

    /// Locks the wiring between `ReaderAudioMixer.hostTime` and the canonical
    /// `AudioMixer.hostTime`. If anyone re-introduces a local UInt64-based
    /// implementation in `ReaderAudioMixer`, this test fails because the two
    /// helpers will diverge on the Intel overflow path.
    func test_hostTime_delegatesToAudioMixer_acrossTimebases() {
        for timebase in [appleSiliconTimebase, intelTimebase] {
            for seconds in [0.0, 0.001, 1.0, 9.22, 30.0, 1.0e10] {
                let reader = ReaderAudioMixer.hostTime(forDelaySeconds: seconds, timebase: timebase)
                let audio = AudioMixer.hostTime(forDelaySeconds: seconds, timebase: timebase)
                XCTAssertEqual(
                    reader, audio,
                    "ReaderAudioMixer.hostTime must forward to AudioMixer.hostTime — diverged at seconds=\(seconds), timebase=(\(timebase.numer)/\(timebase.denom))"
                )
            }
        }
    }
}
