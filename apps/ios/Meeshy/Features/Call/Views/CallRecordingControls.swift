import SwiftUI
import MeeshySDK
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

    static var someone: String {
        String(localized: "call.recording.someone", defaultValue: "Un participant", bundle: .main)
    }

    static func ask(name: String, kind: CallRecordingKind = .audio) -> String {
        let who = name.isEmpty ? someone : name
        let format = kind == .video
            ? String(localized: "call.recording.ask.video", defaultValue: "%@ veut enregistrer l’appel en vidéo", bundle: .main)
            : String(localized: "call.recording.ask", defaultValue: "%@ veut enregistrer l’appel", bundle: .main)
        return String(format: format, who)
    }

    /// #8437 — les deux choix du bouton Enregistrer.
    static func kindLabel(_ kind: CallRecordingKind) -> String {
        kind == .video
            ? String(localized: "call.recording.kind.video", defaultValue: "Vidéo", bundle: .main)
            : String(localized: "call.recording.kind.audio", defaultValue: "Audio", bundle: .main)
    }

    /// G3.2 — ce que l'option dit avant les deux choix.
    static var consent: String {
        String(localized: "call.recording.consent", defaultValue: "Tout le monde doit accepter. L’enregistrement s’arrête si quelqu’un rejoint.", bundle: .main)
    }

    static var kindHint: String {
        String(localized: "call.recording.kind.hint", defaultValue: "Choisissez ce qui sera enregistré ; chaque participant doit ensuite accepter", bundle: .main)
    }

    static var accept: String {
        String(localized: "call.recording.accept", defaultValue: "Accepter", bundle: .main)
    }

    static var refuse: String {
        String(localized: "call.recording.refuse", defaultValue: "Refuser", bundle: .main)
    }

    /// R3.3 — le mot du bouton blanc de la capsule (le libellé accessible garde la phrase entière).
    static var stopWord: String {
        String(localized: "call.recording.stop.word", defaultValue: "Arrêter", bundle: .main)
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

/// G3.2 — un choix de l'option Enregistrer : une puce large de verre, qui lance aussitôt la demande.
struct CallRecordingChoiceChip: View {
    let title: String
    let hint: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            Text(title)
                .font(.subheadline.weight(.bold))
                .foregroundStyle(Color.white)
                .lineLimit(1)
                .frame(maxWidth: .infinity, minHeight: 44)
                .contentShape(Capsule())
                .callChipGlass(isActive: false, tint: .white)
        }
        .buttonStyle(CallPressButtonStyle(glassPressesItself: true))
        .accessibilityLabel(title)
        .accessibilityHint(hint)
    }
}

/// G3.2 — l'option Enregistrer, DANS la pilule : le titre centré, la phrase d'accord,
/// puis deux puces larges Audio | Vidéo qui lancent aussitôt la demande.
struct CallRecordingPanel: View {
    let onBack: () -> Void
    let onClose: () -> Void
    let onChoose: (CallRecordingKind) -> Void

    private var kindChips: [AsyncRenderRow<CallRecordingKind, CallRecordingChoiceChip>] {
        [CallRecordingKind.audio, .video].map { kind in
            AsyncRenderRow(id: kind, content: CallRecordingChoiceChip(title: CallRecordingCopy.kindLabel(kind), hint: CallRecordingCopy.kindHint) {
                onChoose(kind)
            })
        }
    }

    var body: some View {
        VStack(spacing: MeeshySpacing.sm) {
            CallPanelHeader(title: CallRecordingCopy.label(isActive: false), onBack: onBack, onClose: onClose)
            Text(CallRecordingCopy.consent)
                .font(.footnote)
                .foregroundStyle(MeeshyColors.mediaChromeSecondary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, MeeshySpacing.lg)
            AdaptiveGlassContainer(spacing: CallControlGlassMetrics.containerSpacing) {
                HStack(spacing: MeeshySpacing.sm) {
                    ForEach(kindChips, content: asyncRenderRowContent)
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.sm)
        }
    }
}

/// #17790 — ce que le bandeau d'enregistrement montre : une carte d'accord, une capsule
/// (attente ou enregistrement en cours), l'avis de fin, ou rien. Un changement d'étape est
/// un départ vers le haut puis une arrivée par le haut, jamais un remplacement sur place.
enum CallRecordingBannerStage: Equatable, Sendable {
    case none
    case consent
    case status
    case notice

    static func of(phase: CallRecordingPhase, notice: CallRecordingNotice?) -> CallRecordingBannerStage {
        switch phase {
        case .pending(_, _, _, _, true): return .consent
        case .asking, .pending, .recording: return .status
        case .idle: return notice == nil ? .none : .notice
        }
    }
}

/// La couche d'enregistrement de l'écran d'appel. Paramètres primitifs : elle
/// ne se réévalue que si l'un d'eux change.
struct CallRecordingOverlay: View, Equatable {
    let phase: CallRecordingPhase
    let notice: CallRecordingNotice?
    let kind: CallRecordingKind
    let requesterName: String
    let onAnswer: (Bool) -> Void
    let onStop: () -> Void
    let onDismiss: () -> Void
    var showsStatus = true
    var topInset: CGFloat = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.phase == rhs.phase && lhs.notice == rhs.notice && lhs.kind == rhs.kind && lhs.requesterName == rhs.requesterName
            && lhs.showsStatus == rhs.showsStatus && lhs.topInset == rhs.topInset
    }

    private var stage: CallRecordingBannerStage { .of(phase: phase, notice: notice) }

    private var presence: AnyTransition {
        reduceMotion ? .opacity : .move(edge: .top).combined(with: .opacity)
    }

    /// #17791 (R3.10) — la couche rend sa hauteur réelle (carte d'accord, capsule, avis à deux
    /// lignes) : ma vignette descend sous elle, jamais à côté.
    var body: some View {
        content
            .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: stage)
            .modifier(CallTopBannerHeightReporter(banner: .recording))
    }

    @ViewBuilder
    private var content: some View {
        switch phase {
        case .pending(_, _, _, _, true):
            consentCard.transition(presence)
        case .asking, .pending, .recording:
            stowable(statusPill(isRecording: phase.isRecording))
                .animation(CallChromeStow.animation(reduceMotion: reduceMotion), value: phase.isRecording)
                .transition(presence)
        case .idle:
            if let notice {
                stowable(noticePill(notice)).transition(presence)
            }
        }
    }

    /// R3.6 — la capsule monte avec l'en-tête et revient avec lui, comme le bandeau de partage.
    private func stowable<V: View>(_ capsule: V) -> some View {
        capsule
            .modifier(CallEdgeStow(edge: .top, margin: topInset, isVisible: showsStatus, reduceMotion: reduceMotion))
            .callChromeVisibility(showsStatus)
    }

    private var consentCard: some View {
        VStack(alignment: .leading, spacing: MeeshySpacing.md) {
            HStack(spacing: MeeshySpacing.sm) {
                recordingDot
                Text(CallRecordingCopy.ask(name: requesterName, kind: kind))
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(Color.white)
            }
            HStack(spacing: MeeshySpacing.smPlus) {
                answerButton(CallRecordingCopy.refuse, accepted: false)
                answerButton(CallRecordingCopy.accept, accepted: true)
            }
        }
        .padding(MeeshySpacing.lg)
        .modifier(CallRecordingGlass(shape: RoundedRectangle(cornerRadius: MeeshyRadius.xl, style: .continuous)))
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .accessibilityAddTraits(.isModal)
    }

    /// Refuser est un verre, Accepter un blanc plein au texte sombre : deux boutons de même largeur.
    @ViewBuilder
    private func answerButton(_ title: String, accepted: Bool) -> some View {
        let label = Text(title)
            .font(.subheadline.weight(.semibold))
            .frame(maxWidth: .infinity, minHeight: 44)
            .contentShape(Capsule())
        Button {
            HapticFeedback.light()
            onAnswer(accepted)
        } label: {
            if accepted {
                label.foregroundStyle(Color.black).background(Color.white, in: Capsule())
            } else {
                label.foregroundStyle(Color.white).callChipGlass(isActive: false, tint: .white)
            }
        }
        .buttonStyle(.plain)
    }

    /// L'attente puis l'enregistrement : la même capsule, dont seuls les mots changent.
    private func statusPill(isRecording: Bool) -> some View {
        HStack(spacing: MeeshySpacing.smPlus) {
            recordingDot
            Text(isRecording ? CallRecordingCopy.active : CallRecordingCopy.waiting)
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.white)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            stopButton(
                word: isRecording ? CallRecordingCopy.stopWord : CallRecordingCopy.cancel,
                label: isRecording ? CallRecordingCopy.label(isActive: true) : CallRecordingCopy.cancel
            )
        }
        .padding(.leading, MeeshySpacing.mdPlus)
        .padding(.trailing, MeeshySpacing.xs)
        .modifier(CallRecordingGlass(shape: Capsule()))
        .accessibilityElement(children: .contain)
    }

    /// R3.3 — « Arrêter » : un bouton qui dit le mot, blanc plein, texte rouge ; 44 pt de cible.
    private func stopButton(word: String, label: String) -> some View {
        Button(action: onStop) {
            Text(word)
                .font(.footnote.weight(.bold))
                .foregroundStyle(MeeshyColors.error)
                .lineLimit(1)
                .padding(.horizontal, MeeshySpacing.mdPlus)
                .frame(minHeight: 32)
                .background(Color.white, in: Capsule())
                .frame(minHeight: 44)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }

    private func noticePill(_ notice: CallRecordingNotice) -> some View {
        HStack(spacing: MeeshySpacing.xsPlus) {
            Text(CallRecordingCopy.notice(notice))
                .font(.footnote.weight(.medium))
                .foregroundStyle(Color.white)
                .lineLimit(2)
            Button(action: onDismiss) {
                Image(systemName: "xmark")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(MeeshyColors.mediaChromeSecondary)
                    .frame(width: 44, height: 44)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(CallRecordingCopy.close)
        }
        .padding(.leading, MeeshySpacing.mdPlus)
        .modifier(CallRecordingGlass(shape: Capsule()))
        .task(id: notice) {
            guard await cancellableSleep(for: .seconds(4)), !Task.isCancelled else { return }
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
        media
            .frame(maxWidth: 280)
        .accessibilityElement(children: .contain)
        .accessibilityLabel(CallRecordingCopy.bubbleLabel)
    }

    @ViewBuilder
    private var media: some View {
        if recording.isVideo {
            VideoAvailabilityResolver(attachment: recording.attachment) { availability, onDownload in
                MeeshyVideoPlayer(
                    attachment: recording.attachment,
                    style: .inline,
                    controls: .inlineMinimal,
                    accentColor: accentHex,
                    frame: .bubble,
                    availability: availability,
                    onDownload: onDownload
                )
            }
        } else {
            AudioPlayerView(
                attachment: recording.attachment,
                context: .messageBubble,
                accentColor: accentHex
            )
        }
    }
}

/// Loi 18 · R2.11 · R3.12 — le verre adaptatif d'`adaptiveLiquidGlass`, par son entrée du kit
/// (`meeshyGlass`, ton `theme`) : Liquid Glass sur iOS 26, verre dessiné avant, plein sous
/// « Réduire la transparence » ; sous le voile d'appel qui l'assombrit sur un contenu clair (loi 3).
struct CallRecordingGlass<S: Shape>: ViewModifier {
    let shape: S

    func body(content: Content) -> some View {
        content
            .modifier(CallGlassVeil(shape: shape, resting: 0.22))
            .meeshyGlass(in: shape, tone: .theme)
    }
}
