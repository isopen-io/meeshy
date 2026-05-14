import Foundation

/// Minimal abstraction over `Task.sleep` so EditProfileViewModel's
/// post-success delay can be controlled in tests. The Swift stdlib
/// `Clock` protocol has an `associatedtype Duration`, which complicates
/// mocking — this non-typed seam is intentionally simpler.
protocol Sleeping: Sendable {
    func sleep(milliseconds: UInt64) async
}

final class SystemSleeper: Sleeping {
    static let shared = SystemSleeper()

    func sleep(milliseconds: UInt64) async {
        try? await Task.sleep(nanoseconds: milliseconds * 1_000_000)
    }
}
