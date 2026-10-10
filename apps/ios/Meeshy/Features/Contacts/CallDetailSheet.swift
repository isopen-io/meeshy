import SwiftUI
import MeeshySDK
import MeeshyUI

/// Detail of a single call-journal entry: who, when, audio/video, duration,
/// data spent, and one-tap redial. Presented as a sheet from `CallsTab`.
struct CallDetailSheet: View {
    let record: APICallRecord

    @Environment(\.dismiss) private var dismiss
    @State private var networkJournal: CallNetworkJournalPresentation?
    @State private var transcript: CallTranscript?
    private var theme: ThemeManager { ThemeManager.shared }
    private var unknownCallerFallback: String {
        String(localized: "call.unknown", defaultValue: "Inconnu", bundle: .main)
    }
    /// No live `Conversation` here (call-journal entry, not an open conversation) — the
    /// documented fallback tier applies: deterministic per-caller color, shared by the
    /// header avatar, the redial buttons, and every `detailRow` icon (never a hardcoded
    /// brand color — see apps/ios/CLAUDE.md "Conversation Accent Color").
    private var accentHex: String {
        DynamicColorGenerator.colorForName(record.displayName(fallback: unknownCallerFallback))
    }
    private var accentColor: Color { Color(hex: accentHex) }

    var body: some View {
        ScrollView {
            VStack(spacing: MeeshySpacing.xl) {
                header
                if record.peer != nil {
                    redialButtons
                }
                details
                if !record.participants.isEmpty {
                    participantsSection
                }
                if let networkJournal {
                    CallNetworkJournalSection(presentation: networkJournal, accentColor: accentColor)
                }
                if let transcript {
                    CallTranscriptSection(transcript: transcript, accentHex: accentHex, tint: accentColor) {
                        self.transcript = nil
                    }
                }
            }
            .padding(MeeshySpacing.xl)
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
        .task(id: record.callId) {
            networkJournal = await CallNetworkJournalStore.shared.journal(for: record.callId)
                .map { CallNetworkJournalPresentation(journal: $0) }
                .flatMap { $0.isEmpty ? nil : $0 }
            transcript = await CallTranscriptLoader.load(callId: record.callId)
        }
    }

    // MARK: - Header

    private var header: some View {
        let name = record.displayName(fallback: unknownCallerFallback)
        return VStack(spacing: MeeshySpacing.smPlus) {
            MeeshyAvatar(
                name: name,
                context: .profileSheet,
                accentColor: accentHex,
                avatarURL: record.avatarURL,
                presenceState: PresenceManager.shared.resolvedState(userId: record.peer?.userId, isOnline: record.peer?.isOnline)
            )
            Text(name)
                .font(MeeshyFont.relative(MeeshyFont.title3Size, weight: .bold))
                .foregroundColor(theme.textPrimary)
            HStack(spacing: MeeshySpacing.xsPlus) {
                Image(systemName: record.isVideo ? "video.fill" : "phone.fill")
                    .font(.caption)
                    .accessibilityHidden(true)
                Text(statusLine)
                    .font(.subheadline.weight(.medium))
            }
            .foregroundColor(record.isMissed ? MeeshyColors.error : theme.textMuted)
            .accessibilityElement(children: .combine)
        }
        .padding(.top, MeeshySpacing.sm)
    }

    private var statusLine: String {
        "\(record.directionKind.localizedLabel) · \(record.startedAt.relativeTimeString)"
    }

    // MARK: - Redial

    private var redialButtons: some View {
        HStack(spacing: MeeshySpacing.md) {
            redialButton(isVideo: false, title: String(localized: "call.start.audio", defaultValue: "Appel vocal", bundle: .main), icon: "phone.fill")
            redialButton(isVideo: true, title: String(localized: "call.start.video", defaultValue: "Appel video", bundle: .main), icon: "video.fill")
        }
    }

    private func redialButton(isVideo: Bool, title: String, icon: String) -> some View {
        Button {
            guard let peer = record.peer else { return }
            CallStarter.start(
                userId: peer.userId,
                displayName: record.displayName(fallback: unknownCallerFallback),
                isVideo: isVideo,
                conversationId: record.conversationId
            )
            HapticFeedback.medium()
            dismiss()
        } label: {
            HStack(spacing: MeeshySpacing.sm) {
                Image(systemName: icon)
                Text(title).font(.subheadline.weight(.semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, MeeshySpacing.md)
            .background(Capsule().fill(accentColor))
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
                    label: String(localized: "calls.detail.duration", defaultValue: "Durée", bundle: .main),
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
                    label: String(localized: "calls.detail.phone", defaultValue: "Numéro", bundle: .main),
                    value: phone
                )
            }
            // #8439 — les réactions envoyées pendant l'appel, « 👍 × 3 ».
            if !record.reactionTally.isEmpty {
                detailRow(
                    icon: "face.smiling",
                    label: CallControlsCopy.reactionsTitle,
                    value: record.reactionTally.map { "\($0.emoji.rawValue) × \($0.count)" }.joined(separator: "  ")
                )
            }
        }
        .padding(.vertical, MeeshySpacing.xs)
        .background(theme.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    // MARK: - Participants (#8066)

    /// Who joined a group call, reader excluded — a name and a face, never a
    /// presence (the gateway serves none on this list).
    private var participantsSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(String(localized: "calls.detail.participants", defaultValue: "Participants", bundle: .main))
                .font(.footnote.weight(.semibold))
                .foregroundColor(theme.textMuted)
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.top, MeeshySpacing.md)
                .accessibilityAddTraits(.isHeader)
            ForEach(record.participants) { participant in
                HStack(spacing: MeeshySpacing.md) {
                    MeeshyAvatar(
                        name: participant.displayName,
                        context: .userListItem,
                        accentColor: DynamicColorGenerator.colorForName(participant.displayName),
                        avatarURL: participant.avatar
                    )
                    .accessibilityHidden(true)
                    Text(participant.displayName)
                        .font(.subheadline.weight(.medium))
                        .foregroundColor(theme.textPrimary)
                        .lineLimit(1)
                    Spacer()
                }
                .padding(.horizontal, MeeshySpacing.md)
                .padding(.vertical, MeeshySpacing.sm)
                .accessibilityElement(children: .combine)
            }
        }
        .padding(.bottom, MeeshySpacing.xs)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(theme.backgroundSecondary)
        .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.md))
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: icon)
                .font(.subheadline)
                .foregroundColor(accentColor)
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
