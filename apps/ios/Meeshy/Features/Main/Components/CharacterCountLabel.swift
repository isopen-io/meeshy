import SwiftUI
import MeeshyUI

/// Locale-aware, VoiceOver-friendly character counter shown under text inputs.
///
/// Consolidates the hand-rolled `"\(text.count)/LIMIT"` labels that were
/// duplicated — with divergent styling, ad-hoc warning thresholds and zero
/// accessibility — in `ReportUserView` and `StatusComposerView`.
///
/// - Numbers are rendered with `Int.formatted()` so they respect the user's
///   locale (grouping separators, Eastern-Arabic digits, …) instead of raw
///   ASCII interpolation.
/// - Digits are monospaced so the label never reflows as the count changes.
/// - The label turns red once `count` reaches `warningThreshold`
///   (defaults to 80% of `limit`).
/// - VoiceOver reads a full "N of M characters" sentence instead of the
///   ambiguous "158 500" that the raw `"158/500"` string produced.
///
/// Callers own visibility (e.g. only showing it while the field is non-empty).
struct CharacterCountLabel: View {
    let count: Int
    let limit: Int
    var warningThreshold: Int? = nil
    var font: Font = MeeshyFont.relative(11, weight: .medium)

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        Text(verbatim: "\(count.formatted())/\(limit.formatted())")
            .font(font.monospacedDigit())
            .foregroundColor(
                Self.isNearLimit(count: count, limit: limit, warningThreshold: warningThreshold)
                    ? MeeshyColors.error
                    : theme.textMuted
            )
            .accessibilityLabel(Self.accessibilityLabel(count: count, limit: limit))
    }

    // MARK: - Pure helpers (testable)

    /// Resolves the count at which the label switches to the warning color.
    /// Defaults to 80% of `limit`, rounded up, when no explicit threshold is given.
    static func resolvedThreshold(limit: Int, warningThreshold: Int?) -> Int {
        if let warningThreshold { return warningThreshold }
        return Int((Double(limit) * 0.8).rounded(.up))
    }

    static func isNearLimit(count: Int, limit: Int, warningThreshold: Int?) -> Bool {
        count >= resolvedThreshold(limit: limit, warningThreshold: warningThreshold)
    }

    /// "158 of 500 characters" — a full VoiceOver sentence. Positional format
    /// specifiers keep word order correct across localizations.
    static func accessibilityLabel(count: Int, limit: Int) -> String {
        String(
            format: String(
                localized: "components.characterCount.a11y",
                defaultValue: "%1$lld of %2$lld characters",
                bundle: .main
            ),
            count,
            limit
        )
    }
}
