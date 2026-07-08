import SwiftUI
import MeeshySDK
import MeeshyUI

/// Detail of a single call-journal entry: who, when, audio/video, duration,
/// data spent, and one-tap redial. Presented as a sheet from `CallsTab`.
struct CallDetailSheet: View {
    let record: APICallRecord

    @Environment(\.dismiss) private var dismiss
    @Environment(\.colorScheme) private var colorScheme
    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ScrollView {
            VStack(spacing: 20) {
                header
                if record.peer != nil {
                    redialButtons
                }
                details
            }
            .padding(20)
            // iPad/Mac width cap — mirrors FloatingCallPillView's established
            // 560pt ceiling: without it, `redialButtons`/`detailRow`'s Spacer()
            // stretch edge-to-edge on a wide sheet instead of reading as a
            // centered, compact record. Full width on iPhone (<560pt).
            .frame(maxWidth: 560)
            .frame(maxWidth: .infinity)
        }
        .background(theme.backgroundPrimary.ignoresSafeArea())
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    // MARK: - Header

    private var header: some View {
        let name = record.displayName
        let color = DynamicColorGenerator.colorForName(name)
        return VStack(spacing: 10) {
            MeeshyAvatar(
                name: name,
                context: .profileSheet,
                accentColor: color,
                avatarURL: record.avatarURL,
                presenceState: PresenceManager.shared.resolvedState(userId: record.peer?.userId, isOnline: record.peer?.isOnline)
            )
            Text(name)
                .font(MeeshyFont.relative(20, weight: .bold))
                .foregroundColor(theme.textPrimary)
            HStack(spacing: 6) {
                Image(systemName: record.isVideo ? "video.fill" : "phone.fill")
                    .font(.caption)
                    .accessibilityHidden(true)
                Text(statusLine)
                    .font(.subheadline.weight(.medium))
            }
            .foregroundColor(record.isMissed ? MeeshyColors.error : theme.textMuted)
            .accessibilityElement(children: .combine)
        }
        .padding(.top, 8)
    }

    private var statusLine: String {
        let direction: String
        switch record.directionKind {
        case .outgoing: direction = String(localized: "calls.direction.outgoing", defaultValue: "Appel emis", bundle: .main)
        case .incoming: direction = String(localized: "calls.direction.incoming", defaultValue: "Appel recu", bundle: .main)
        case .missed: direction = String(localized: "calls.direction.missed", defaultValue: "Appel manque", bundle: .main)
        }
        return "\(direction) · \(record.startedAt.relativeTimeString)"
    }

    // MARK: - Redial

    private var redialButtons: some View {
        HStack(spacing: 12) {
            redialButton(isVideo: false, title: String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), icon: "phone.fill")
            redialButton(isVideo: true, title: String(localized: "call.start.video", defaultValue: "Appel video", bundle: .main), icon: "video.fill")
        }
    }

    private func redialButton(isVideo: Bool, title: String, icon: String) -> some View {
        Button {
            guard let peer = record.peer else { return }
            CallStarter.start(
                userId: peer.userId,
                displayName: record.displayName,
                isVideo: isVideo,
                conversationId: record.conversationId
            )
            HapticFeedback.medium()
            dismiss()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: icon)
                Text(title).font(.subheadline.weight(.semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 12)
            .background(Capsule().fill(MeeshyColors.indigo500))
        }
        .accessibilityLabel(title)
    }

    // MARK: - Details

    private var details: some View {
        VStack(spacing: 0) {
            detailRow(
                icon: record.isVideo ? "video.fill" : "phone.fill",
                label: String(localized: "calls.detail.type", defaultValue: "Type", bundle: .main),
                value: record.isVideo
                    ? String(localized: "calls.type.video", defaultValue: "Appel video", bundle: .main)
                    : String(localized: "calls.type.audio", defaultValue: "Appel vocal", bundle: .main)
            )
            detailRow(
                icon: "calendar",
                label: String(localized: "calls.detail.date", defaultValue: "Date", bundle: .main),
                value: record.startedAt.formatted(date: .abbreviated, time: .shortened)
            )
            if !record.durationLabel.isEmpty {
                detailRow(
                    icon: "clock",
                    label: String(localized: "calls.detail.duration", defaultValue: "Duree", bundle: .main),
                    value: record.durationLabel
                )
            }
            if let data = record.dataLabel {
                detailRow(
                    icon: "arrow.up.arrow.down",
                    label: String(localized: "calls.detail.data", defaultValue: "Donnees", bundle: .main),
                    value: data
                )
            }
            if let phone = record.peer?.phoneNumber, !phone.isEmpty {
                detailRow(
                    icon: "number",
                    label: String(localized: "calls.detail.phone", defaultValue: "Numero", bundle: .main),
                    value: phone
                )
            }
        }
        .padding(.vertical, 4)
        .background(theme.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(MeeshyColors.indigo500)
                .frame(width: 24)
                .accessibilityHidden(true)
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
        .accessibilityElement(children: .combine)
    }
}
