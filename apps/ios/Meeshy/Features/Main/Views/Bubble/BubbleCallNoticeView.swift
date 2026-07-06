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
        // Aligned like a chat bubble (WhatsApp call-log treatment): outgoing
        // calls hug the trailing edge, incoming/missed/declined hug the leading
        // edge. The side itself encodes the direction, so the detail line below
        // no longer repeats "Sortant"/"Entrant" — only stats remain.
        HStack(spacing: 0) {
            if isOutgoing { Spacer(minLength: 48) }
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
            if !isOutgoing { Spacer(minLength: 48) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
    }

    private var card: some View {
        HStack(spacing: 11) {
            leadingGlyph
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textPrimary)
                    .lineLimit(1)
                if hasDetailContent {
                    detailLine
                }
            }
            Spacer(minLength: 8)
            callBackBadge
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 10)
        .frame(minHeight: 44)
        .background(simpleContour)
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
    }

    // MARK: - Leading direction/media glyph

    private var leadingGlyph: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(isDark ? 0.12 : 0.08))
                .frame(width: 30, height: 30)
            Image(systemName: glyphName)
                .font(MeeshyFont.relative(14, weight: .medium))
                .foregroundColor(tint)
        }
        .accessibilityHidden(true)
    }

    // MARK: - Detail line (duration · data · quality)

    /// True when at least one stat segment is present. Drives whether the
    /// detail line is rendered at all — a missed/declined call with no duration,
    /// data, or quality shows just its title (no empty stats row).
    private var hasDetailContent: Bool {
        durationLabel != nil
            || summary.dataSpentLabel != nil
            || summary.networkQuality != nil
    }

    /// Stats only — direction is conveyed by the bubble side + the leading
    /// glyph + the title, so it is never repeated here.
    private var detailLine: some View {
        HStack(spacing: 5) {
            if let duration = durationLabel {
                Image(systemName: "clock")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(duration)
                    .font(.caption.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }

            if let data = summary.dataSpentLabel {
                if durationLabel != nil { dot }
                Image(systemName: "arrow.up.arrow.down")
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(ThemeManager.shared.textMuted)
                Text(data)
                    .font(.caption.weight(.medium))
                    .foregroundColor(ThemeManager.shared.textMuted)
            }

            if let quality = summary.networkQuality {
                if durationLabel != nil || summary.dataSpentLabel != nil { dot }
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
                .fill(tint.opacity(isDark ? 0.15 : 0.10))
                .frame(width: 30, height: 30)
            Image(systemName: "phone.arrow.up.right.fill")
                .font(MeeshyFont.relative(13, weight: .medium))
                .foregroundColor(tint)
        }
        .accessibilityHidden(true)
    }

    // MARK: - Simple contour background

    private var simpleContour: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(tint.opacity(isDark ? 0.06 : 0.03))
            // Thinner single border
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .stroke(tint.opacity(isDark ? 0.25 : 0.15), lineWidth: 0.5)
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
        let isVideo = summary.callType == .video
        switch summary.outcome {
        case .missed:
            return isVideo ? "video.slash.fill" : "phone.arrow.down.left.fill"
        case .rejected:
            if isVideo { return "video.slash.fill" }
            return isOutgoing ? "phone.arrow.up.right.fill" : "phone.arrow.down.left.fill"
        case .failed:
            return isVideo ? "video.slash.fill" : "phone.down.fill"
        case .completed:
            if isVideo {
                return isOutgoing ? "video.fill" : "video.fill"
            }
            return isOutgoing ? "phone.arrow.up.right.fill" : "phone.arrow.down.left.fill"
        }
    }

    private var title: String {
        let isVideo = summary.callType == .video
        switch summary.outcome {
        case .completed:
            let type = isVideo
                ? String(localized: "bubble.call.video", defaultValue: "Appel vidéo", bundle: .main)
                : String(localized: "bubble.call.audio", defaultValue: "Appel audio", bundle: .main)
            let direction = isOutgoing
                ? String(localized: "bubble.call.outgoing.suffix", defaultValue: "sortant", bundle: .main)
                : String(localized: "bubble.call.incoming.suffix", defaultValue: "entrant", bundle: .main)
            return "\(type) \(direction)"
        case .missed:
            return isVideo
                ? String(localized: "bubble.call.video.missed", defaultValue: "Appel vidéo manqué", bundle: .main)
                : String(localized: "bubble.call.audio.missed", defaultValue: "Appel audio manqué", bundle: .main)
        case .rejected:
            return isOutgoing
                ? String(localized: "bubble.call.rejected.sent", defaultValue: "Appel refusé", bundle: .main)
                : String(localized: "bubble.call.rejected.received", defaultValue: "Appel rejeté", bundle: .main)
        case .failed:
            return isVideo
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
