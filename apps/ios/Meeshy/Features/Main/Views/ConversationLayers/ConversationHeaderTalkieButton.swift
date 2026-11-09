import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'appel et, dans un direct, le talkie à sa gauche (#17093) : proposé dès Proche (`TalkieOfferModel`), jamais dans
/// un direct chiffré ni dans un aperçu. Le doigt posé enfonce et vibre, la voix qui part allume le bouton et fait battre
/// ses ondes ; un `TALKIE_NOT_ALLOWED` le retire, comme sur la fiche.
struct ConversationHeaderCallCluster: View {
    let entry: HeaderCallEntry?
    let conversationId: String
    let calleeName: String
    let peerName: String
    let talkieAllowed: Bool
    let encryptionMode: String?
    let accentColor: String
    let secondaryColor: String
    let engagementConversationId: String?

    var body: some View {
        HStack(spacing: 0) {
            if let peer = talkiePeer {
                ConversationHeaderTalkieButton(userId: peer, peerName: peerName, accentColor: accentColor, secondaryColor: secondaryColor)
                    .id(peer)
            }
            ConversationHeaderCallSlot(
                entry: entry,
                conversationId: conversationId,
                calleeName: calleeName,
                accentColor: accentColor,
                secondaryColor: secondaryColor,
                engagementConversationId: engagementConversationId
            )
        }
    }

    private var talkiePeer: String? {
        guard talkieAllowed, TalkieOfferRule.mayShowInHeader(encryptionMode: encryptionMode),
              case .peer(let userId)? = entry?.callee else { return nil }
        return userId
    }
}

struct ConversationHeaderTalkieButton: View {
    let userId: String
    let peerName: String
    let accentColor: String
    let secondaryColor: String

    @StateObject private var offer: TalkieOfferModel
    @StateObject private var sender = TalkieSender()
    @State private var pressed = false
    @State private var withdrawn = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    init(userId: String, peerName: String, accentColor: String, secondaryColor: String) {
        self.userId = userId
        self.peerName = peerName
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        _offer = StateObject(wrappedValue: TalkieOfferModel(userId: userId))
    }

    private var look: TalkieHoldLook { TalkieHoldLook.resolve(pressed: pressed, phase: sender.phase) }

    /// Une pile, jamais un `Group` : vide tant que le talkie n'est pas proposé, elle existe quand même, et c'est elle
    /// qui porte le chargement de l'offre (#17247). Sans largeur ni espacement, la mise en page de l'en-tête ne bouge pas.
    var body: some View {
        HStack(spacing: 0) {
            if offer.offered && !withdrawn {
                glyph
                    .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $pressed))
                    .meeshyTapTarget()
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(ProfileTalkieWording.holdA11y(name: peerName))
                    .accessibilityValue(look == .live ? liveValue : "")
                    .accessibilityHint(ProfileTalkieWording.holdHint)
                    .accessibilityAddTraits([.isButton, .updatesFrequently])
                    .accessibilityIdentifier("conversation.header.talkie")
                TalkieInfoButton(tint: accent)
                    .transition(.opacity)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: offer.offered)
        .task(id: userId) { await offer.load() }
        .adaptiveOnChange(of: sender.waking) { _, waking in
            // L'en-tête n'a pas de libellé : le réveil d'un destinataire hors ligne se dit dans un bandeau neutre.
            guard waking else { return }
            FeedbackToastManager.shared.show(ProfileTalkieWording.waking(name: peerName), type: .info)
        }
        .adaptiveOnChange(of: sender.notice) { _, new in
            guard let new else { return }
            sender.notice = nil
            guard new != .notAllowed else {
                withdrawn = true
                return
            }
            ProfileTalkieWording.present(new)
        }
    }

    private var accent: Color { Color(hex: accentColor) }
    private var gradient: LinearGradient { LinearGradient(colors: [accent, Color(hex: secondaryColor)], startPoint: .topLeading, endPoint: .bottomTrailing) }

    private var liveValue: String {
        switch sender.phase {
        case .recordingCopy: ProfileTalkieWording.recordingCopy
        case .talking where sender.waking: ProfileTalkieWording.waking(name: peerName)
        default: ProfileTalkieWording.talking(name: peerName)
        }
    }

    private var glyph: some View {
        ZStack {
            if look == .live && !reduceMotion {
                TalkieHeaderWaves(color: accent)
            }
            Circle()
                .fill(
                    gradient
                )
                .opacity(look == .idle ? 0 : 1)
            symbol
        }
        .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
        .adaptiveGlass(in: Circle(), tint: accent.opacity(0.4), interactive: true)
        .animation(.easeOut(duration: 0.15), value: look)
    }

    @ViewBuilder
    private var symbol: some View {
        let image = Image(systemName: look == .live ? "waveform" : "antenna.radiowaves.left.and.right")
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
        if look == .idle {
            image.foregroundStyle(
                gradient
            )
        } else {
            image
                .foregroundStyle(Color.white)
                .modifier(TalkieWaveformPulse(active: look == .live && !reduceMotion))
        }
    }
}

/// Deux ondes qui s'élargissent autour du bouton pendant que la voix part.
private struct TalkieHeaderWaves: View {
    let color: Color
    @State private var spread = false

    var body: some View {
        ZStack {
            wave(delay: 0)
            wave(delay: 0.45)
        }
        .onAppear { spread = true }
        .accessibilityHidden(true)
    }

    private func wave(delay: Double) -> some View {
        Circle()
            .stroke(color, lineWidth: 2)
            .scaleEffect(spread ? 1.9 : 1)
            .opacity(spread ? 0 : 0.7)
            .animation(.easeOut(duration: 0.9).repeatForever(autoreverses: false).delay(delay), value: spread)
    }
}

private struct TalkieWaveformPulse: ViewModifier {
    let active: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.symbolEffect(.variableColor.iterative, isActive: active)
        } else {
            content
        }
    }
}
