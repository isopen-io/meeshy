import Foundation

/// Human-readable media figures — the single source for file sizes across the
/// app, its extensions and the SDK. `.file` is Finder's decimal convention, so
/// "870 KB" reads the same on a download badge, an audio label and an upload bar.
public enum MediaFormat {

    /// `locale` keeps a suite independent of the simulator's locale (Foundation's
    /// `ByteCountFormatter` exposes none). `allowedUnits` lets a caller showing two
    /// figures force them onto one scale (« 12,0 ko / 14,2 Mo » does not compare).
    /// `.memory` counts in powers of 1 024, for limits that must read « 5 Go ».
    public nonisolated static func bytes(
        _ bytes: Int64,
        countStyle: ByteCountFormatStyle.Style = .file,
        allowedUnits: ByteCountFormatStyle.Units = .default,
        locale: Locale = .current
    ) -> String {
        bytes.formatted(.byteCount(style: countStyle, allowedUnits: allowedUnits).locale(locale))
    }
}
