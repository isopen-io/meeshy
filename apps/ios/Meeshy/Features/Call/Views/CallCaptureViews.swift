import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

// #16665 — ce que l'écran d'appel montre d'une capture d'écran : la capsule
// rouge R1 « Karim capture l'écran de l'appel », posée sous l'en-tête en audio
// comme en vidéo, et les mots des lignes datées du journal
// (`docs/product/appels-vue-finale.md` loi 13).

enum CallCaptureJournalCopy {
    static func who(_ name: String) -> String {
        name.isEmpty
            ? String(localized: "call.recording.someone", defaultValue: "Un participant", bundle: .main)
            : name
    }

    static func alert(name: String) -> String {
        String(format: String(localized: "call.capture.alert", defaultValue: "%@ capture l’écran de l’appel", bundle: .main), who(name))
    }

    static func phrase(_ kind: CallTranscriptCaptureKind) -> String {
        switch kind {
        case .screenshot:
            return String(localized: "call.capture.journal.screenshot", defaultValue: "a capturé l’écran", bundle: .main)
        case .recording:
            return String(localized: "call.capture.journal.recording", defaultValue: "enregistre l’écran", bundle: .main)
        case .callRecordingStarted:
            return String(localized: "call.capture.journal.callRecordingStarted", defaultValue: "L’enregistrement de l’appel a commencé", bundle: .main)
        case .callRecordingStopped:
            return String(localized: "call.capture.journal.callRecordingStopped", defaultValue: "L’enregistrement de l’appel s’est arrêté", bundle: .main)
        }
    }
}

/// « Karim · a capturé l'écran · 12:40 » : le pseudo (et son point) à la
/// couleur de l'auteur, le reste à l'encre secondaire. Sans pseudo, la phrase
/// est entière (borne de l'enregistrement de l'appel).
enum CallCaptureSentence {
    static func text(name: String, nameColor: Color, tail: String, tailColor: Color) -> Text {
        var lead = AttributedString(name.isEmpty ? "" : "\(name) · ")
        lead.foregroundColor = nameColor
        lead.font = Font.callout.weight(.semibold)
        var rest = AttributedString(tail)
        rest.foregroundColor = tailColor
        rest.font = Font.callout
        return Text(lead + rest)
    }
}

/// Le journal vivant : les phrases et, à leur heure, les captures (loi 7),
/// résolus pour le bandeau et le journal de la pilule. Chaque phrase y porte son
/// heure DANS l'appel (`CallJournalClock`), comme les captures.
struct CallJournalComposer {
    let segments: [CallTranscriptionSegment]
    let captures: [CallTranscriptCapture]
    let callStartedAt: Date?
    let speechLine: (CallTranscriptionSegment) -> CallCaptionLine

    var items: [CallJournalItem<CallTranscriptionSegment>] {
        CallJournalTimeline.merged(segments, time: \.capturedAt, captures: captures)
    }

    func line(for item: CallJournalItem<CallTranscriptionSegment>) -> CallCaptionLine {
        switch item {
        case .speech(let segment):
            var line = speechLine(segment)
            line.timeLabel = CallJournalClock.label(at: segment.capturedAt, since: callStartedAt)
            return line
        case .capture(let capture):
            let elapsed = capture.capturedAt.timeIntervalSince(callStartedAt ?? capture.capturedAt)
            return CallCaptionLine.capture(
                capture,
                displayName: CallCaptureJournalCopy.who(capture.displayName),
                phrase: CallCaptureJournalCopy.phrase(capture.kind),
                timeLabel: CallManager.formatDuration(max(0, elapsed))
            )
        }
    }
}

/// R1 — la place que la capsule prend sous l'en-tête : la vignette et ses
/// rangées descendent d'autant pendant qu'elle est montrée (la planche pose la
/// vignette à `top:130`, sous la puce). Pure, pour être testée seule.
enum CallCaptureAlertClearance {
    static let capsuleHeight: CGFloat = 44
    static let margin: CGFloat = 8

    static func top(isAlertShown: Bool) -> CGFloat {
        isAlertShown ? capsuleHeight + margin : 0
    }
}

/// La capsule R1 : rouge, centrée sous l'en-tête, un petit anneau blanc puis
/// la phrase. Une capture ponctuelle passe au bout de quelques secondes ; un
/// enregistrement d'écran reste tant qu'il dure. Paramètres primitifs.
struct CallCaptureAlertCapsule: View, Equatable {
    let alert: CallCaptureAlert?
    let onDismiss: (String) -> Void

    static let transientSeconds: Double = 4

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.alert == rhs.alert
    }

    var body: some View {
        if let alert {
            capsule(CallCaptureJournalCopy.alert(name: alert.displayName))
                .transition(.opacity)
                .task(id: alert.id) {
                    UIAccessibility.post(notification: .announcement, argument: CallCaptureJournalCopy.alert(name: alert.displayName))
                    guard alert.isTransient,
                          await cancellableSleep(for: .seconds(Self.transientSeconds)),
                          !Task.isCancelled else { return }
                    onDismiss(alert.id)
                }
        }
    }

    private func capsule(_ text: String) -> some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            Circle()
                .stroke(Color.white, lineWidth: MeeshyBorder.strong)
                .frame(width: 10, height: 10)
                .accessibilityHidden(true)
            Text(text)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(Color.white)
                .lineLimit(2)
                .minimumScaleFactor(0.8)
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .frame(minHeight: 44)
        .background(MeeshyColors.error.opacity(0.9), in: Capsule())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(text)
    }
}
