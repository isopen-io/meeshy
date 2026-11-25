import SwiftUI
import MeeshySDK
import MeeshyUI

/// L'appel et, dans un direct, le Bring (#17442, dès Ami, même chiffré) puis le talkie à sa gauche (#17093) : proposé dès Proche (`TalkieOfferModel`), jamais dans
/// un direct chiffré ni dans un aperçu. Le doigt posé enfonce et vibre ; la voix qui part, ou celle du pair qui arrive,
/// vit en orbe sur le bouton même, bornée à la rangée (#20531) : l'en-tête ne s'étend pas, le nom, le retour et les
/// actions restent visibles ; un `TALKIE_NOT_ALLOWED` le retire, comme sur la fiche. Le (i) du talkie ne vit que sur
/// la fiche profil.
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
            if case .peer(let userId)? = entry?.callee {
                ConversationHeaderBringButton(userId: userId, peerName: peerName)
                    .id(userId)
            }
            if let peer = talkiePeer {
                ConversationHeaderTalkieButton(userId: peer, peerName: peerName, accentColor: accentColor, secondaryColor: secondaryColor)
                    .id(peer)
                    .zIndex(-1)
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
    @ObservedObject private var voices: TalkieVoiceStageObserver
    private let headers: TalkieHeaderPresence
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var pressed = false
    @State private var withdrawn = false
    /// Le téléphone du pair est injoignable depuis plusieurs minutes (#20241) : le geste laisse un message vocal.
    @State private var unreachableLasting = false

    private var delivery: TalkieDelivery { TalkieDelivery.of(lasting: unreachableLasting) }

    init(userId: String, peerName: String, accentColor: String, secondaryColor: String,
         voices: TalkieVoiceStageObserver = .shared, headers: TalkieHeaderPresence = .shared) {
        self.userId = userId
        self.peerName = peerName
        self.accentColor = accentColor
        self.secondaryColor = secondaryColor
        _offer = StateObject(wrappedValue: TalkieOfferModel(userId: userId))
        _voices = ObservedObject(wrappedValue: voices)
        self.headers = headers
    }

    private var look: TalkieHoldLook { TalkieHoldLook.resolve(pressed: pressed, phase: sender.phase) }

    /// Le bouton quand le talkie est proposé ; sinon, la voix du pair qui arrive se montre quand même, dans une fente
    /// d'écoute sans geste, le temps qu'elle dure.
    private var slot: TalkieHeaderSlot {
        TalkieVoiceHostLaw.headerSlot(offered: offer.offered, withdrawn: withdrawn,
                                      incoming: TalkieVoiceHostLaw.incoming(userId: userId, voices: voices.voices))
    }

    /// Une voix vers le pair ou venant de lui : l'orbe se montre.
    private var orbShows: Bool { TalkieVoiceHostLaw.shows(userId: userId, voices: voices.voices) }

    private var reduceMotion: Bool { MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion) }

    /// Le sort de ma voix tant qu'elle part ; `nil` au repos.
    private var liveDelivery: TalkieHeaderDelivery? {
        look == .live ? TalkieHeaderDelivery.resolve(phase: sender.phase, waking: sender.waking) : nil
    }

    /// Une pile, jamais un `Group` : vide tant que le talkie n'est pas proposé et que le pair se tait, elle existe quand même, et c'est elle
    /// qui porte le chargement de l'offre (#17247). Sans largeur ni espacement, la mise en page de l'en-tête ne bouge pas.
    var body: some View {
        HStack(spacing: 0) {
            switch slot {
            case .button:
                glyph(look)
                    .background { TalkieHoldOrb(userId: userId, shows: orbShows) }
                    .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $pressed, delivery: delivery))
                    .meeshyTapTarget()
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(ProfileTalkieWording.holdA11y(name: peerName, delivery: delivery))
                    .accessibilityValue(look == .live ? liveValue : "")
                    .accessibilityHint(ProfileTalkieWording.holdHint)
                    .accessibilityAddTraits([.isButton, .updatesFrequently])
                    .accessibilityIdentifier("conversation.header.talkie")
            case .listeningSlot:
                glyph(.live)
                    .background { TalkieHoldOrb(userId: userId, shows: orbShows) }
                    .meeshyTapTarget()
                    .allowsHitTesting(false)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel(TalkieHeaderWording.peerSpeaking(name: peerName))
                    .accessibilityAddTraits(.updatesFrequently)
                    .accessibilityIdentifier("conversation.header.talkie.listening")
            case .none:
                EmptyView()
            }
        }
        .animation(MeeshyMotion.animation(.rise, reduce: reduceMotion), value: slot)
        .onAppear { headers.appear(userId) }
        .onDisappear { headers.disappear(userId) }
        .task(id: userId) { await offer.load() }
        .modifier(PhoneUnreachableLastingReader(userId: userId, lasting: $unreachableLasting))
        .adaptiveOnChange(of: sender.waking) { _, waking in
            // L'en-tête n'a pas de libellé : le réveil d'un destinataire hors ligne se dit dans un bandeau neutre.
            guard waking else { return }
            FeedbackToastManager.shared.show(ProfileTalkieWording.waking(name: peerName), type: .info)
        }
        .adaptiveOnChange(of: liveDelivery) { previous, current in
            guard let announced = TalkieVoiceHostLaw.announcement(previous: previous, current: current) else { return }
            UIAccessibility.post(notification: .announcement, argument: TalkieHeaderWording.announcement(announced))
        }
        .adaptiveOnChange(of: sender.notice) { _, new in
            guard let new else { return }
            sender.notice = nil
            guard new != .notAllowed else {
                withdrawn = true
                return
            }
            ProfileTalkieWording.present(new, delivery: delivery)
        }
    }

    private var accent: Color { Color(hex: accentColor) }
    private var secondary: Color { Color(hex: secondaryColor) }
    private var gradient: LinearGradient { LinearGradient(colors: [accent, secondary], startPoint: .topLeading, endPoint: .bottomTrailing) }

    private var liveValue: String {
        switch sender.phase {
        case .recordingCopy: ProfileTalkieWording.recordingCopy
        case .talking where sender.waking: ProfileTalkieWording.waking(name: peerName)
        default: ProfileTalkieWording.talking(name: peerName)
        }
    }

    private func glyph(_ look: TalkieHoldLook) -> some View {
        ZStack {
            Circle()
                .fill(
                    gradient
                )
                .opacity(look == .idle ? 0 : 1)
            symbol(look)
        }
        .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
        .adaptiveGlass(in: Circle(), tint: accent.opacity(0.4),
                       interactive: TalkieVoiceHostLaw.headerGlassInteractive(look: look))
        .animation(.easeOut(duration: 0.15), value: look)
    }

    @ViewBuilder
    private func symbol(_ look: TalkieHoldLook) -> some View {
        let image = Image(systemName: look == .live ? "waveform" : "antenna.radiowaves.left.and.right")
            .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
        if look == .idle {
            image.foregroundStyle(
                gradient
            )
        } else {
            image
                .foregroundStyle(Color.white)
        }
    }
}
