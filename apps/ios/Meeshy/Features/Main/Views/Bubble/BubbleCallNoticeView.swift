import SwiftUI
import MeeshySDK
import MeeshyUI

/// Compact, actionable call-summary notice — replaces the plain centered capsule
/// (`BubbleSystemNoticeView`) for system messages that carry structured call
/// metadata (`messageSource == .system` + `callSummary != nil`).
///
/// Design (2026-07, per product feedback):
/// - **Single left glyph carries all meaning**: the media type (video / phone)
///   plus a corner direction chip. Incoming arrow points **down** (`arrow.down.left`),
///   outgoing points up (`arrow.up.right`) — the trailing call-back badge was
///   removed so the bubble hugs its content instead of stretching wide.
/// - **Title + metrics row** in the bubble body: the title ("Appel vidéo entrant")
///   over a glyphed metrics line — clock glyph + duration · transfer glyph + data
///   spent ("⏱ 00:49 · ⇅ ~9.3 MB"). Network quality still lives in the detail sheet.
/// - **Call time bottom-right** like every other chat bubble ("18:41"), so the
///   metrics carry the "how much" and the corner carries the "when".
/// - **Long-press → detail sheet** (`CallSummaryDetailSheet`) surfaces the full
///   record: type, precise timestamp, duration, data, network quality (histogram
///   later) and a one-tap call-back.
/// - **Tap = quick call-back** (FaceTime/WhatsApp redial), re-using the same media.
///
/// Stateless leaf apart from its own sheet-presentation `@State`: all rendering
/// inputs are primitives / pre-resolved values (direction resolved per-viewer at
/// build time). The call-back closure is excluded from equality.
struct BubbleCallNoticeView: View, Equatable {
    let notice: BubbleContent.CallNotice
    let isDark: Bool
    var onCallBack: ((CallSummaryMetadata) -> Void)? = nil

    @State private var showDetails = false

    static func == (lhs: BubbleCallNoticeView, rhs: BubbleCallNoticeView) -> Bool {
        lhs.notice == rhs.notice && lhs.isDark == rhs.isDark
    }

    private var summary: CallSummaryMetadata { notice.summary }
    private var isOutgoing: Bool { notice.isOutgoing }

    var body: some View {
        // Aligned like a chat bubble (WhatsApp call-log treatment): outgoing
        // calls hug the trailing edge, incoming/missed/declined hug the leading
        // edge. The side + the glyph's direction chip encode the direction.
        HStack(spacing: 0) {
            if isOutgoing { Spacer(minLength: 48) }
            Button {
                onCallBack?(summary)
            } label: {
                card
            }
            .buttonStyle(.plain)
            // `.highPriorityGesture` (not `.simultaneousGesture`) so a held
            // press that recognizes the long-press pre-empts the Button's own
            // tap recognition — otherwise both fired on finger-lift and a
            // long-press-to-view-details also silently placed a call-back
            // (pocket-dial bug, found in audit 2026-07-03). A quick tap still
            // falls through to the Button action since the long-press gesture
            // fails to recognize before `minimumDuration` elapses.
            .highPriorityGesture(
                LongPressGesture(minimumDuration: 0.35).onEnded { _ in
                    HapticFeedback.medium()
                    showDetails = true
                }
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(accessibilityLabel)
            .accessibilityHint(Text(String(localized: "bubble.call.callback.hint", defaultValue: "Double-tapez pour rappeler", bundle: .main)))
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: Text(String(localized: "bubble.call.details.action", defaultValue: "Détails de l'appel", bundle: .main))) {
                showDetails = true
            }
            if !isOutgoing { Spacer(minLength: 48) }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 4)
        .sheet(isPresented: $showDetails) {
            CallSummaryDetailSheet(
                summary: summary,
                isOutgoing: isOutgoing,
                timestamp: notice.timestamp,
                onCallBack: onCallBack
            )
        }
    }

    private var card: some View {
        VStack(alignment: .trailing, spacing: 3) {
            HStack(spacing: 11) {
                leadingGlyph
                VStack(alignment: .leading, spacing: 3) {
                    Text(title)
                        .font(.subheadline.weight(.semibold))
                        .foregroundColor(ThemeManager.shared.textPrimary)
                        .lineLimit(1)
                    metricsRow
                }
            }
            Text(notice.timeString)
                .font(.caption2.weight(.medium))
                .foregroundColor(ThemeManager.shared.textMuted)
                .accessibilityHidden(true)
        }
        .padding(.horizontal, 13)
        .padding(.vertical, 9)
        .frame(minHeight: 44)
        .background(simpleContour)
        .contentShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
    }

    // MARK: - Metrics row (glyphed duration + data spent)

    /// Duration and data spent, each led by its glyph — clock for duration,
    /// up/down arrows for the data transferred — separated by a middot. Absent
    /// entirely when neither exists (missed / rejected / zero-length calls), so
    /// those bubbles collapse to just the title. Mirrors the detail sheet's
    /// `clock` / `arrow.up.arrow.down` glyphs for cross-surface consistency.
    @ViewBuilder private var metricsRow: some View {
        let duration = durationLabel
        let data = summary.dataSpentLabel
        if duration != nil || data != nil {
            HStack(spacing: 5) {
                if let duration { metric(icon: "clock", text: duration) }
                if duration != nil, data != nil {
                    Text("·")
                        .font(.caption.weight(.medium))
                        .foregroundColor(ThemeManager.shared.textMuted)
                }
                if let data { metric(icon: "arrow.up.arrow.down", text: data) }
            }
        }
    }

    private func metric(icon: String, text: String) -> some View {
        HStack(spacing: 4) {
            Image(systemName: icon)
                .font(.system(size: 11, weight: .semibold))
            Text(text)
                .font(.caption.weight(.medium))
                .lineLimit(1)
        }
        .foregroundColor(ThemeManager.shared.textMuted)
    }

    // MARK: - Leading media + direction glyph

    /// Media icon (video / phone) in a tinted disc, with a small corner chip that
    /// encodes direction: incoming arrow points **down** (`arrow.down.left`),
    /// outgoing points up. Both media types get the same direction treatment, so
    /// a video call's direction is now as legible as an audio call's.
    private var leadingGlyph: some View {
        ZStack {
            Circle()
                .fill(tint.opacity(isDark ? 0.14 : 0.09))
                .frame(width: 36, height: 36)
            Image(systemName: mediaGlyph)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(tint)
        }
        .overlay(alignment: .bottomTrailing) { directionChip }
        .accessibilityHidden(true)
    }

    private var directionChip: some View {
        ZStack {
            Circle()
                .fill(ThemeManager.shared.backgroundPrimary)
                .frame(width: 16, height: 16)
            Image(systemName: directionGlyph)
                .font(.system(size: 8, weight: .black))
                .foregroundColor(tint)
        }
        .offset(x: 3, y: 3)
    }

    // MARK: - Simple contour background

    private var simpleContour: some View {
        ZStack {
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .fill(tint.opacity(isDark ? 0.06 : 0.03))
            RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous)
                .stroke(tint.opacity(isDark ? 0.25 : 0.15), lineWidth: 0.5)
        }
    }

    // MARK: - Derived visuals

    private var presentation: CallNoticePresentation {
        CallNoticePresentation(summary: summary, isOutgoing: isOutgoing)
    }

    private var tint: Color { presentation.tint }

    /// Media type only — direction is carried by the corner chip.
    private var mediaGlyph: String { presentation.mediaGlyph }

    /// Direction arrow: incoming points down-left, outgoing points up-right.
    private var directionGlyph: String { presentation.directionGlyph }

    private var title: String { presentation.title }

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

    // MARK: - Accessibility

    private var accessibilityLabel: Text {
        var parts: [String] = [title, directionWord, notice.timeString]
        if let duration = durationLabel { parts.append(duration) }
        if let data = summary.dataSpentLabel { parts.append(data) }
        return Text(parts.joined(separator: ", "))
    }
}

// MARK: - Shared presentation

/// Shared presentation derivations for a call summary (tint, glyphs, title) — single
/// source of truth so the compact bubble and its long-press detail sheet can never
/// drift apart on how they describe the same call.
private struct CallNoticePresentation {
    let summary: CallSummaryMetadata
    let isOutgoing: Bool

    var tint: Color {
        switch summary.outcome {
        case .completed: return MeeshyColors.indigo500
        case .missed, .rejected: return MeeshyColors.error
        case .failed: return MeeshyColors.warning
        }
    }

    /// Media type only — direction is carried by the corner chip.
    var mediaGlyph: String {
        summary.callType == .video ? "video.fill" : "phone.fill"
    }

    /// Direction arrow: incoming points down-left, outgoing points up-right.
    var directionGlyph: String {
        isOutgoing ? "arrow.up.right" : "arrow.down.left"
    }

    var title: String {
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
}

// MARK: - Detail sheet

/// Full record for a single call-summary notice, presented on long-press of the
/// compact bubble: media type, precise timestamp, duration, data spent and
/// network quality — plus a one-tap call-back. A precise quality histogram can
/// slot into `qualitySection` later without touching the bubble.
struct CallSummaryDetailSheet: View {
    let summary: CallSummaryMetadata
    let isOutgoing: Bool
    let timestamp: Date
    var onCallBack: ((CallSummaryMetadata) -> Void)? = nil

    @Environment(\.dismiss) private var dismiss
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                if onCallBack != nil {
                    callBackButton
                }
                details
            }
            .padding(20)
        }
        // Liquid Glass (iOS 26) : la conversation transparaît derrière la
        // feuille au lieu d'un aplat opaque — même traitement que
        // FeedCommentsSheet / MessageMoreSheet.
        .adaptiveSheetGlassBackground()
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Header

    private var header: some View {
        VStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(tint.opacity(0.12))
                    .frame(width: 64, height: 64)
                Image(systemName: mediaGlyph)
                    .font(.system(size: 26, weight: .semibold))
                    .foregroundColor(tint)
            }
            .overlay(alignment: .bottomTrailing) {
                ZStack {
                    Circle().fill(theme.backgroundPrimary).frame(width: 26, height: 26)
                    Image(systemName: directionGlyph)
                        .font(.system(size: 12, weight: .black))
                        .foregroundColor(tint)
                }
                .offset(x: 4, y: 4)
            }
            Text(title)
                .font(MeeshyFont.relative(20, weight: .bold))
                .foregroundColor(theme.textPrimary)
                .multilineTextAlignment(.center)
            Text(timestamp.formatted(date: .abbreviated, time: .shortened))
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textMuted)
        }
        .padding(.top, 8)
    }

    // MARK: - Call back

    private var callBackButton: some View {
        Button {
            onCallBack?(summary)
            HapticFeedback.medium()
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: mediaGlyph)
                Text(callBackTitle).font(.subheadline.weight(.semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .adaptiveGlassProminent(in: Capsule(), tint: MeeshyColors.indigo500)
        }
        .accessibilityLabel(callBackTitle)
    }

    private var callBackTitle: String {
        summary.callType == .video
            ? String(localized: "call.start.video", defaultValue: "Appel vidéo", bundle: .main)
            : String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main)
    }

    // MARK: - Details

    private var details: some View {
        VStack(spacing: 0) {
            detailRow(
                icon: mediaGlyph,
                label: String(localized: "calls.detail.type", defaultValue: "Type", bundle: .main),
                value: summary.callType == .video
                    ? String(localized: "calls.type.video", defaultValue: "Appel vidéo", bundle: .main)
                    : String(localized: "calls.type.audio", defaultValue: "Appel vocal", bundle: .main)
            )
            detailRow(
                icon: "calendar",
                label: String(localized: "calls.detail.date", defaultValue: "Date", bundle: .main),
                value: timestamp.formatted(date: .abbreviated, time: .shortened)
            )
            if summary.outcome == .completed, summary.durationSeconds > 0 {
                detailRow(
                    icon: "clock",
                    label: String(localized: "calls.detail.duration", defaultValue: "Durée", bundle: .main),
                    value: summary.durationLabel
                )
            }
            if let data = summary.dataSpentLabel {
                detailRow(
                    icon: "arrow.up.arrow.down",
                    label: String(localized: "calls.detail.data", defaultValue: "Données", bundle: .main),
                    value: data
                )
            }
            if let quality = summary.networkQuality {
                qualityRow(quality)
            }
        }
        .padding(.vertical, 4)
        .adaptiveGlass(
            in: RoundedRectangle(cornerRadius: MeeshyRadius.md, style: .continuous),
            tint: tint.opacity(0.14)
        )
    }

    /// Network-quality row. A per-second quality histogram can render here later
    /// (the metadata already exposes an ordered `NetworkQuality` scale).
    private func qualityRow(_ quality: CallSummaryMetadata.NetworkQuality) -> some View {
        HStack(spacing: 12) {
            Image(systemName: "waveform")
                .font(.subheadline)
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 24)
            Text(String(localized: "calls.detail.quality", defaultValue: "Qualité", bundle: .main))
                .font(.subheadline)
                .foregroundColor(theme.textMuted)
            Spacer()
            Circle()
                .fill(qualityColor(quality))
                .frame(width: 8, height: 8)
            Text(qualityWord(quality))
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.md)
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 24)
            Text(label)
                .font(.subheadline)
                .foregroundColor(theme.textMuted)
            Spacer()
            Text(value)
                .font(.subheadline.weight(.medium))
                .foregroundColor(theme.textPrimary)
        }
        .padding(.horizontal, MeeshySpacing.md)
        .padding(.vertical, MeeshySpacing.md)
    }

    // MARK: - Derived visuals

    private var presentation: CallNoticePresentation {
        CallNoticePresentation(summary: summary, isOutgoing: isOutgoing)
    }

    private var tint: Color { presentation.tint }

    private var mediaGlyph: String { presentation.mediaGlyph }

    private var directionGlyph: String { presentation.directionGlyph }

    private var title: String { presentation.title }

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
}
