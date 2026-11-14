import SwiftUI
import MeeshySDK
import MeeshyUI

/// Le Bring dans l'en-tête d'un direct (#17442) : on le trouve depuis la conversation, sans passer par la fiche. Un
/// toucher ouvre la MÊME confirmation que la fiche (« Faire sonner »), un second envoie : deux gestes. Mêmes règles que
/// `ProfileBringRow`, dont il réutilise le modèle : le bouton n'existe que si la passerelle sert `available: true`
/// (elle juge le niveau, dès Ami, le blocage et le service coupé) ; tant que ça sonne, il ANNULE sans confirmation ;
/// quota épuisé, il reste et le dit dans un bandeau.
struct ConversationHeaderBringButton: View {
    @StateObject private var bring: ProfileBringViewModel
    let peerName: String
    @State private var confirming = false

    init(userId: String, peerName: String) {
        _bring = StateObject(wrappedValue: ProfileBringViewModel(userId: userId))
        self.peerName = peerName
    }

    private var state: BringHeaderState {
        BringHeaderState.resolve(availability: bring.availability, ringing: bring.ringing != nil)
    }

    /// Une pile, jamais un `Group` : vide tant que le Bring n'est pas proposé, elle existe quand même et porte le
    /// chargement de l'offre et la confirmation. Sans largeur, la mise en page de l'en-tête ne bouge pas.
    var body: some View {
        HStack(spacing: 0) {
            if state != .hidden {
                Button(action: press) { glyph }
                    .buttonStyle(.plain)
                    .meeshyTapTarget()
                    .disabled(bring.isSending)
                    .transition(.scale.combined(with: .opacity))
                    .accessibilityLabel(label)
                    .accessibilityAddTraits(state == .ringing ? [.isButton, .updatesFrequently] : .isButton)
                    .accessibilityIdentifier("conversation.header.bring")
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.75), value: state)
        .task(id: bring.userId) { await bring.load() }
        .confirmationDialog(
            ProfileBringWording.confirmTitle(name: peerName),
            isPresented: $confirming,
            titleVisibility: .visible
        ) {
            Button(ProfileBringWording.confirmSend, role: .destructive) {
                Task { await bring.send(name: peerName) }
            }
            Button(String(localized: "common.cancel", defaultValue: "Annuler", bundle: .main), role: .cancel) {}
        } message: {
            Text(ProfileBringWording.confirmBody(name: peerName))
        }
        .adaptiveOnChange(of: bring.notice) { _, new in
            guard let new else { return }
            FeedbackToastManager.shared.showError(new)
            bring.notice = nil
        }
    }

    private func press() {
        HapticFeedback.medium()
        switch state {
        case .ringing: bring.cancel()
        case .exhausted: FeedbackToastManager.shared.showError(ProfileBringWording.quota(name: peerName))
        case .send: confirming = true
        case .hidden: break
        }
    }

    private var label: String {
        switch state {
        case .ringing: ProfileBringWording.cancel + " · " + ProfileBringWording.ringing(name: peerName)
        case .exhausted: ProfileBringWording.quota(name: peerName)
        case .send, .hidden: ProfileBringWording.confirmTitle(name: peerName)
        }
    }

    private var glyph: some View {
        let ringing = state == .ringing
        return ZStack {
            Circle().fill(MeeshyColors.error).opacity(ringing ? 1 : 0)
            Image(systemName: ringing ? "bell.slash.fill" : "bell.fill")
                .font(MeeshyFont.relative(MeeshyIconSize.xs, weight: .semibold))
                .foregroundStyle(ringing ? Color.white : MeeshyColors.error)
        }
        .frame(width: MeeshyControlSize.small, height: MeeshyControlSize.small)
        .meeshyGlass(in: Circle(), tint: MeeshyColors.error.opacity(0.4), isInteractive: true)
        .opacity(state == .exhausted ? 0.55 : 1)
    }
}

/// Ce que montre le bouton du Bring de l'en-tête — la loi pure, miroir de `bringHeaderState` (web).
enum BringHeaderState: Equatable {
    case hidden, send, exhausted, ringing

    static func resolve(availability: BringAvailability?, ringing: Bool) -> BringHeaderState {
        guard let availability, availability.available else { return .hidden }
        if ringing { return .ringing }
        return availability.isExhausted ? .exhausted : .send
    }
}
