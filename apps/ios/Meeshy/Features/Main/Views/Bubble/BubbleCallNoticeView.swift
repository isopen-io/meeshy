import SwiftUI
import MeeshySDK
import MeeshyUI

/// Rich, actionable call-summary notice — replaces the plain centered capsule
/// (`BubbleSystemNoticeView`) for system messages that carry structured call
/// metadata (`messageSource == .system` + `callSummary != nil`).
///
/// State-of-the-art treatment (researched against iMessage/FaceTime, WhatsApp,
/// Telegram, Signal):
/// - **Double contour** + outcome-driven tint so it reads as distinct from a
///   chat bubble (red = missed/declined, amber = interrupted, indigo = normal).
/// - **Direction-aware glyph**: outgoing = `phone.arrow.up.right`, incoming =
///   `phone.arrow.down.left`, missed/declined = `phone.down.fill` (red), video
///   uses the camera family with the same semantics.
/// - A "duration · data spent · network quality" detail line.
/// - The whole card is a **call-back button** (FaceTime/WhatsApp redial),
///   exposed as one combined VoiceOver element with an action hint.
///
/// Stateless leaf: all inputs are primitives / pre-resolved values (direction is
/// resolved per-viewer at build time). The call-back closure is excluded from
/// equality — it never affects the rendering.
struct BubbleCallNoticeView: View, Equatable {
    let notice: BubbleContent.CallNotice
    let isDark: Bool
    var onCallBack: ((CallSummaryMetadata) -> Void)? = nil

    static func == (lhs: BubbleCallNoticeView, rhs: BubbleCallNoticeView) -> Bool {
        lhs.notice == rhs.notice && lhs.isDark == rhs.isDark
    }

    private var summary: CallSummaryMetadata { notice.summary }
    private var isOutgoing: Bool { notice.isOutgoing }

    var body: some View {
        HStack(spacing: 0) {
            Spacer(minLength: 16)
            Button {
                onCallBack?(summary)
            } label: {
                card
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
            .accessibilityHint(Text(String(localized: "bubble.call.callback.hint", defaultValue: "Double-tapez pour rappeler", bundle: .main)))
            .accessibilityAddTraits(.isButton)
            Spacer(minLength: 16)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    private var card: some View {
        HStack(spacing: 11) {
            leadingGlyph
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .lineLimit(2)
                detailLine
            }
            Spacer(minLength: 8)
            callBackBadge
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .background(doubleContour)
        .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }

    // MARK: - Leading direction/media glyph

    private var leadingGlyph: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(isDark ? 0.20 : 0.14))
                .frame(width: 34, height: 34)
            Image(systemName: glyphName)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(tint)
        }
        .accessibilityHidden(true)
    }

    // MARK: - Detail line (direction · duration · data · quality)

    private var detailLine: some View {
        HStack(spacing: 5) {
            // Direction (emitted vs received) — always shown so the user knows
            // whether they placed or received the call.
            Image(systemName: isOutgoing ? "arrow.up.right" : "arrow.down.left")
                .font(.caption2.weight(.bold))
                .foregroundColor(ThemeManager.shared.textMuted)
            Text(directionWord)
                .font(.caption.weight(.medium))
                .foregroundColor(ThemeManager.shared.textMuted)

            if let duration = durationLabel {
                dot
                Image(systemName: "clock")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(duration)
                    .font(.caption.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }

            if let data = summary.dataSpentLabel {
                dot
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(data)
                    .font(.caption.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }

            if let quality = summary.networkQuality {
                dot
                Circle()
                    .fill(qualityColor(quality))
                    .frame(width: 6, height: 6)
                Text(qualityWord(quality))
                    .font(.caption.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }
        }
        .lineLimit(1)
    }

    private var dot: some View {
        Text("·")
            .font(.caption.weight(.bold))
            .foregroundColor(ThemeManager.shared.textMuted.opacity(0.6))
    }

    // MARK: - Call-back affordance

    private var callBackBadge: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(isDark ? 0.22 : 0.16))
                .frame(width: 34, height: 34)
            Image(systemName: "phone.arrow.up.right.fill")
                .font(.footnote.weight(.semibold))
                .foregroundColor(tint)
        }
        .accessibilityHidden(true)
    }

    // MARK: - Double contour background

    private var doubleContour: some View {
        ZStack {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(tint.opacity(isDark ? 0.12 : 0.07))
            // Outer stroke
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(tint.opacity(isDark ? 0.55 : 0.45), lineWidth: 1.5)
            // Inner stroke, inset → the "double contour"
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(tint.opacity(isDark ? 0.28 : 0.22), lineWidth: 1)
                .padding(3.5)
        }
    }

    // MARK: - Derived visuals

    private var tint: Color {
        switch summary.outcome {
        case .completed: return MeeshyColors.indigo500
        case .missed, .rejected: return MeeshyColors.error
        case .failed: return MeeshyColors.warning
        }
    }

    private var glyphName: String {
        switch summary.outcome {
        case .missed:
            return summary.callType == .video ? "video.slash.fill" : "phone.down.fill"
        case .rejected:
            return "phone.down.fill"
        case .failed:
            return summary.callType == .video ? "video.slash.fill" : "phone.down.fill"
        case .completed:
            if summary.callType == .video { return "video.fill" }
            return isOutgoing ? "phone.arrow.up.right.fill" : "phone.arrow.down.left.fill"
        }
    }

    private var title: String {
        switch summary.outcome {
        case .completed:
            return summary.callType == .video
                ? String(localized: "bubble.call.video", defaultValue: "Appel vidéo", bundle: .main)
                : String(localized: "bubble.call.audio", defaultValue: "Appel audio", bundle: .main)
        case .missed:
            return summary.callType == .video
                ? String(localized: "bubble.call.video.missed", defaultValue: "Appel vidéo manqué", bundle: .main)
                : String(localized: "bubble.call.audio.missed", defaultValue: "Appel audio manqué", bundle: .main)
        case .rejected:
            return String(localized: "bubble.call.rejected", defaultValue: "Appel refusé", bundle: .main)
        case .failed:
            return summary.callType == .video
                ? String(localized: "bubble.call.video.failed", defaultValue: "Appel vidéo interrompu", bundle: .main)
                : String(localized: "bubble.call.audio.failed", defaultValue: "Appel audio interrompu", bundle: .main)
        }
    }

    /// Duration chip only for connected calls that actually lasted.
    private var durationLabel: String? {
        guard summary.outcome == .completed, summary.durationSeconds > 0 else { return nil }
        return summary.durationLabel
    }

    private var directionWord: String {
        isOutgoing
            ? String(localized: "bubble.call.outgoing", defaultValue: "Sortant", bundle: .main)
            : String(localized: "bubble.call.incoming", defaultValue: "Entrant", bundle: .main)
    }

    private func qualityColor(_ quality: CallSummaryMetadata.NetworkQuality) -> Color {
        switch quality {
        case .excellent: return MeeshyColors.success
        case .good: return MeeshyColors.indigo400
        case .fair: return MeeshyColors.warning
        case .poor: return MeeshyColors.error
        }
    }

    private func qualityWord(_ quality: CallSummaryMetadata.NetworkQuality) -> String {
        switch quality {
        case .excellent: return String(localized: "bubble.call.quality.excellent", defaultValue: "Excellent", bundle: .main)
        case .good: return String(localized: "bubble.call.quality.good", defaultValue: "Bonne", bundle: .main)
        case .fair: return String(localized: "bubble.call.quality.fair", defaultValue: "Moyenne", bundle: .main)
        case .poor: return String(localized: "bubble.call.quality.poor", defaultValue: "Faible", bundle: .main)
        }
    }

    // MARK: - Accessibility

    private var accessibilityLabel: Text {
        var parts: [String] = [title, directionWord]
        if let duration = durationLabel { parts.append(duration) }
        if let data = summary.dataSpentLabel { parts.append(data) }
        if let quality = summary.networkQuality { parts.append(qualityWord(quality)) }
        return Text(parts.joined(separator: ", "))
    }
}
