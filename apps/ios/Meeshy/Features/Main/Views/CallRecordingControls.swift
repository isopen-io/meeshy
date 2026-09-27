import SwiftUI
import MeeshyUI

// #8064 — ce que l'écran d'appel montre d'un enregistrement : la question
// posée à ceux qui doivent consentir, l'indicateur PERSISTANT « Enregistrement
// en cours » (chez tous, pas seulement chez l'enregistreur), et le mot de fin.
// Hors de `CallView.swift`, qui est hors budget de taille.

enum CallRecordingCopy {
    static var caption: String {
        String(localized: "call.recording.caption", defaultValue: "Enregistrer", bundle: .main)
    }

    static func label(isActive: Bool) -> String {
        isActive
            ? String(localized: "call.recording.stop", defaultValue: "Arrêter l’enregistrement", bundle: .main)
            : String(localized: "call.recording.start", defaultValue: "Enregistrer l’appel", bundle: .main)
    }

    static var hint: String {
        String(localized: "call.recording.hint", defaultValue: "Demande l’accord de chaque participant avant d’enregistrer", bundle: .main)
    }

    static var active: String {
        String(localized: "call.recording.active", defaultValue: "Enregistrement en cours", bundle: .main)
    }

    static var waiting: String {
        String(localized: "call.recording.waiting", defaultValue: "En attente de l’accord de tous…", bundle: .main)
    }

    static func ask(name: String) -> String {
        let who = name.isEmpty
            ? String(localized: "call.recording.someone", defaultValue: "Un participant", bundle: .main)
            : name
        return String(format: String(localized: "call.recording.ask", defaultValue: "%@ veut enregistrer l’appel", bundle: .main), who)
    }

    static var askDetail: String {
        String(localized: "call.recording.askDetail", defaultValue: "L’enregistrement ne commence que si tout le monde accepte, puis il est ajouté à la conversation.", bundle: .main)
    }

    static var accept: String {
        String(localized: "call.recording.accept", defaultValue: "Accepter", bundle: .main)
    }

    static var refuse: String {
        String(localized: "call.recording.refuse", defaultValue: "Refuser", bundle: .main)
    }

    static var cancel: String {
        String(localized: "call.recording.cancel", defaultValue: "Annuler", bundle: .main)
    }

    static var close: String {
        String(localized: "call.recording.close", defaultValue: "Fermer", bundle: .main)
    }

    static func notice(_ notice: CallRecordingNotice) -> String {
        switch notice {
        case .stopped(let reason, _):
            switch reason {
            case "refused":
                return String(localized: "call.recording.stopped.refused", defaultValue: "Enregistrement refusé", bundle: .main)
            case "timeout":
                return String(localized: "call.recording.stopped.timeout", defaultValue: "Tout le monde n’a pas répondu : pas d’enregistrement", bundle: .main)
            case "participant-joined":
                return String(localized: "call.recording.stopped.joined", defaultValue: "Quelqu’un a rejoint l’appel : enregistrement arrêté", bundle: .main)
            default:
                return String(localized: "call.recording.stopped.other", defaultValue: "Enregistrement arrêté", bundle: .main)
            }
        case .unavailable:
            return String(localized: "call.recording.unavailable", defaultValue: "Enregistrement impossible pour le moment", bundle: .main)
        case .saved:
            return String(localized: "call.recording.saved", defaultValue: "L’enregistrement a été ajouté à la conversation", bundle: .main)
        case .saveFailed:
            return String(localized: "call.recording.saveFailed", defaultValue: "L’enregistrement n’a pas pu être ajouté", bundle: .main)
        }
    }

    static var bubbleLabel: String {
        String(localized: "bubble.call.recording.label", defaultValue: "Enregistrement de l’appel", bundle: .main)
    }
}

/// La couche d'enregistrement de l'écran d'appel. Paramètres primitifs : elle
/// ne se réévalue que si l'un d'eux change.
struct CallRecordingOverlay: View, Equatable {
    let phase: CallRecordingPhase
    let notice: CallRecordingNotice?
    let requesterName: String
    let onAnswer: (Bool) -> Void
    let onStop: () -> Void
    let onDismiss: () -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.phase == rhs.phase && lhs.notice == rhs.notice && lhs.requesterName == rhs.requesterName
    }

    var body: some View {
        switch phase {
        case .pending(_, _, _, _, true):
            consentCard
        case .asking, .pending:
            statusPill(text: CallRecordingCopy.waiting, stopLabel: CallRecordingCopy.cancel)
        case .recording:
            statusPill(text: CallRecordingCopy.active, stopLabel: CallRecordingCopy.label(isActive: true))
        case .idle:
            if let notice {
                noticePill(notice)
            }
        }
    }

    private var consentCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 8) {
                recordingDot
                Text(CallRecordingCopy.ask(name: requesterName))
                    .font(.subheadline.weight(.semibold))
                    .foregroundColor(.white)
            }
            Text(CallRecordingCopy.askDetail)
                .font(.footnote)
                .foregroundColor(.white.opacity(0.8))
                .fixedSize(horizontal: false, vertical: true)
            HStack(spacing: 10) {
                answerButton(CallRecordingCopy.refuse, accepted: false, tint: .white.opacity(0.18))
                answerButton(CallRecordingCopy.accept, accepted: true, tint: MeeshyColors.indigo500)
            }
        }
        .padding(16)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .padding(.horizontal, 16)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    private func answerButton(_ title: String, accepted: Bool, tint: Color) -> some View {
        Button {
            HapticFeedback.light()
            onAnswer(accepted)
        } label: {
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.white)
                .frame(maxWidth: .infinity, minHeight: 44)
                .background(tint, in: Capsule())
        }
        .buttonStyle(.plain)
    }

    private func statusPill(text: String, stopLabel: String) -> some View {
        HStack(spacing: 10) {
            recordingDot
            Text(text)
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            Button(action: onStop) {
                Image(systemName: "stop.fill")
                    .font(.footnote.weight(.bold))
                    .foregroundColor(.white)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(stopLabel)
        }
        .padding(.leading, 14)
        .background(.ultraThinMaterial, in: Capsule())
        .accessibilityElement(children: .contain)
    }

    private func noticePill(_ notice: CallRecordingNotice) -> some View {
        HStack(spacing: 6) {
            Text(CallRecordingCopy.notice(notice))
                .font(.footnote.weight(.medium))
                .foregroundColor(.white)
                .lineLimit(2)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundColor(.white.opacity(0.8))
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CallRecordingCopy.close)
        }
        .padding(.leading, 14)
        .background(.ultraThinMaterial, in: Capsule())
        .task(id: notice) {
            try? await Task.sleep(nanoseconds: 4_000_000_000)
            guard !Task.isCancelled else { return }
            onDismiss()
        }
    }

    private var recordingDot: some View {
        Circle()
            .fill(MeeshyColors.error)
            .frame(width: 10, height: 10)
            .accessibilityHidden(true)
    }
}

/// La piste d'un appel enregistré, sous la bulle de l'appel : le lecteur audio
/// commun des messages, rien de plus.
struct CallRecordingPlayback: View {
    let recording: BubbleContent.CallRecording
    let accentHex: String

    var body: some View {
        AudioPlayerView(
            attachment: recording.attachment,
            context: .messageBubble,
            accentColor: accentHex
        )
        .frame(maxWidth: 280)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallRecordingCopy.bubbleLabel)
    }
}
