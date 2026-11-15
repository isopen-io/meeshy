import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le disque rogné, aimanté au bord** (#18458) : l'avatar (ou la vidéo) de
/// l'autre au palier cercle de l'appel réduit, les cercles concentriques qui
/// disent la LIGNE (à la couleur de la personne, francs quand elle parle,
/// ambre ou rouge quand le réseau se dégrade), l'indicateur réseau posé du
/// côté visible seulement s'il se dégrade, et la durée qui continue sur la
/// partie visible du disque.
///
/// Il ne prend aucun toucher lui-même : la bulle qui le monte garde ses
/// gestes (toucher = revenir à l'appel, glisser = changer de bord).
struct CallEdgeDisk: View {
    @ObservedObject var callManager: CallManager
    let edge: BubbleHorizontalEdge
    let strength: CallSignalStrength
    /// La parole relevée par le maillage d'un groupe ; `nil` ⇒ relevée ici.
    var relayedSpeaking: Bool? = nil

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var sampledSpeaking = false

    private var isSpeaking: Bool { relayedSpeaking ?? sampledSpeaking }
    private var diameter: CGFloat { CallEdgeDiskLaw.diameter }
    private var visibleSide: CallEdgeDiskLaw.VisibleSide { CallEdgeDiskLaw.visibleSide(edge: edge) }

    private var tone: CallEdgeDiskLaw.RingTone {
        CallEdgeDiskLaw.ringTone(isSpeaking: isSpeaking, strength: strength)
    }

    private var ringColor: Color {
        switch tone {
        case .resting, .speaking:
            return Color(uiColor: HexColor(hex: CallPeerSpeech.colorHex(forPeer: callManager.remoteUserId))?.uiColor ?? .white)
        case .degraded:
            return MeeshyColors.warning
        case .poor:
            return MeeshyColors.error
        }
    }

    var body: some View {
        ZStack {
            rings
            CallParticipantVisual(diameter: diameter, callManager: callManager)
                .shadow(color: Color.black.opacity(MeeshyOpacity.medium), radius: 8, y: 4)
        }
        .frame(width: diameter, height: diameter)
        .overlay(alignment: visibleSide == .leading ? .bottomLeading : .bottomTrailing) { durationChip }
        .overlay(alignment: visibleSide == .leading ? .topLeading : .topTrailing) { signal }
        .meeshyAnimation(.easeInOut(duration: CallRemoteVideoFade.duration(reduceMotion: reduceMotion)), value: tone)
        .task(id: relayedSpeaking == nil) {
            guard relayedSpeaking == nil else { return }
            await followSpeech()
        }
        .accessibilityElement(children: .ignore)
    }

    /// Les cercles de la ligne : deux, concentriques, le plus proche le plus franc.
    private var rings: some View {
        ForEach(0..<CallEdgeDiskLaw.ringCount, id: \.self) { index in
            let radius = CallEdgeDiskLaw.ringRadius(index: index, diameter: diameter)
            Circle()
                .stroke(ringColor.opacity(CallEdgeDiskLaw.ringOpacity(tone: tone, index: index)), lineWidth: CallEdgeDiskLaw.ringLineWidth)
                .frame(width: radius * 2, height: radius * 2)
        }
        .allowsHitTesting(false)
    }

    /// La durée continue sur la partie visible du disque.
    private var durationChip: some View {
        CallDurationClock {
            Text(callManager.formattedDuration)
                .font(MeeshyFont.relative(MeeshyFont.microSize, weight: .semibold, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(MeeshyColors.onMedia)
                .padding(.horizontal, MeeshySpacing.xs)
                .padding(.vertical, MeeshySpacing.xxs)
                .meeshyGlass(in: Capsule(), tone: .deep, density: .dense)
        }
        .offset(x: visibleSide == .leading ? -MeeshySpacing.xs : MeeshySpacing.xs, y: MeeshySpacing.xs)
        .allowsHitTesting(false)
    }

    @ViewBuilder
    private var signal: some View {
        if CallEdgeDiskLaw.showsSignal(strength: strength) {
            TransientCallSignalGlyph(strength: strength)
                .padding(MeeshySpacing.xxs)
                .background(Circle().fill(Color.black.opacity(MeeshyOpacity.strong)))
                .offset(x: visibleSide == .leading ? -MeeshySpacing.sm : MeeshySpacing.sm, y: -MeeshySpacing.xs)
                .allowsHitTesting(false)
        }
    }

    /// Même relevé que l'anneau de parole de l'écran d'appel (`CallPeerSpeechRing`).
    private func followSpeech() async {
        var speech = CallPeerSpeech()
        while !Task.isCancelled {
            speech = speech.recording(level: await callManager.primaryAudioLevels()?.primary, at: Date())
            if speech.isSpeaking != sampledSpeaking { sampledSpeaking = speech.isSpeaking }
            guard await cancellableSleep(for: .milliseconds(400)) else { return }
        }
    }
}
