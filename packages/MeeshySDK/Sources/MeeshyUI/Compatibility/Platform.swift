import Foundation

/// Centralised OS-version capability checks for the multi-version support layer
/// (iOS 16 / 17 / 18).
///
/// IMPORTANT — these flags drive *logic* decisions only. They CANNOT be used to
/// gate the use of a version-restricted API: the Swift compiler requires a real
/// `if #available` / `@available` to unlock a newer symbol. A runtime `Bool`
/// does not satisfy that requirement.
///
/// To call a newer API, use the dedicated wrapper in `Compatibility/` — each
/// wrapper holds the real `#available` check internally and keeps the modern
/// (iOS 17+) branch byte-for-byte identical to the pre-existing code, so no
/// behaviour ever regresses on current OS versions.
public enum Platform {
    /// `true` when running on iOS 17.0 or later.
    public nonisolated static var isIOS17OrLater: Bool {
        if #available(iOS 17.0, *) { return true } else { return false }
    }

    /// `true` when running on iOS 18.0 or later.
    public nonisolated static var isIOS18OrLater: Bool {
        if #available(iOS 18.0, *) { return true } else { return false }
    }

    /// `true` when running on iOS 26.0 or later (Liquid Glass design system).
    public nonisolated static var isIOS26OrLater: Bool {
        if #available(iOS 26.0, *) { return true } else { return false }
    }
}
