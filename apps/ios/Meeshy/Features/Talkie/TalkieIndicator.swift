import Combine
import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// Une action du bandeau du talkie reçu (#18820).
nonisolated enum TalkieBannerAction: Equatable {
    case mute
    case talk
}

/// Le bandeau du talkie reçu, où qu'on soit dans l'app (#18820) : qui il montre, et ce qu'on peut y faire.
enum TalkieBannerLaw {
    /// La voix qui sonne ; sinon celui à qui l'on répond encore ; sinon rien.
    static func speaker(active: TalkieSpeaker?, replyingTo: TalkieSpeaker?) -> TalkieSpeaker? {
        active ?? replyingTo
    }

    /// « Couper » tant que la voix sonne ; « Parler » seulement si l'émission vers ce correspondant est ouverte
    /// (`TalkieOfferRule`, servie par `TalkieOfferModel`). Rien de grisé : ce qui n'agit pas n'est pas montré.
    static func actions(speakerIsLive: Bool, offered: Bool) -> [TalkieBannerAction] {
        (speakerIsLive ? [.mute] : []) + (offered ? [.talk] : [])
    }
}

/// L'indicateur d'un talkie reçu : qui parle, « Couper » pour le faire taire ICI, et « Parler » à maintenir pour lui
/// répondre sans ouvrir sa fiche ni la conversation (#18820). NON MODAL — le Bring prend l'écran, le talkie jamais : il
/// se pose en haut, sous la barre d'état, par-dessus les feuilles et le plein écran, et l'app reste utilisable dessous.
/// VoiceOver l'annonce ; son arrivée vibre, et sonne si Meeshy n'est pas en silence (#19732). Le nom tient sur deux
/// lignes plutôt que d'être tronqué.
struct TalkieIndicator: View {
    let speaker: TalkieSpeaker
    let isLive: Bool
    @ObservedObject var sender: TalkieSender
    @Binding var holding: Bool
    let onMute: () -> Void

    @StateObject private var offer: TalkieOfferModel
    @State private var withdrawn = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var systemReduceMotion
    @Environment(\.meeshyForceReduceMotion) private var forcedReduceMotion
    @State private var pulsing = false

    private var reduceMotion: Bool {
        MeeshyMotion.shouldReduce(system: systemReduceMotion, userForced: forcedReduceMotion)
    }

    init(speaker: TalkieSpeaker, isLive: Bool, sender: TalkieSender, holding: Binding<Bool>, onMute: @escaping () -> Void) {
        self.speaker = speaker
        self.isLive = isLive
        self.sender = sender
        _holding = holding
        self.onMute = onMute
        _offer = StateObject(wrappedValue: TalkieOfferModel(userId: speaker.fromUserId))
    }

    private var isDark: Bool { colorScheme == .dark }

    private var name: String {
        speaker.name ?? String(localized: "talkie.incoming.someone", defaultValue: "Quelqu’un", bundle: .main)
    }

    private var title: String {
        guard isLive else { return ProfileTalkieWording.talking(name: name) }
        return String(format: String(localized: "talkie.incoming.title", defaultValue: "%@ te parle", bundle: .main), name)
    }

    private var actions: [TalkieBannerAction] {
        TalkieBannerLaw.actions(speakerIsLive: isLive, offered: offer.offered && !withdrawn)
    }

    var body: some View {
        HStack(spacing: MeeshySpacing.md) {
            Image(systemName: "waveform")
                .font(.headline)
                .foregroundStyle(MeeshyColors.brandPrimary)
                .opacity(pulsing ? 0.45 : 1)
                .accessibilityHidden(true)
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: MeeshySpacing.sm)
            if actions.contains(.mute) { muteButton }
            if actions.contains(.talk) {
                TalkieBannerTalkButton(sender: sender, userId: speaker.fromUserId, name: name, holding: $holding)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xs)
        .background(RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous).fill(.ultraThinMaterial))
        .padding(.horizontal, MeeshySpacing.lg)
        .accessibilityElement(children: .contain)
        .task(id: speaker.fromUserId) { await offer.load() }
        .adaptiveOnChange(of: sender.notice) { _, new in
            guard let new else { return }
            sender.notice = nil
            guard new != .notAllowed else {
                withdrawn = true
                return
            }
            ProfileTalkieWording.present(new)
        }
        .onAppear {
            UIAccessibility.post(notification: .announcement, argument: title)
            if isLive { TalkieCuePlayer.incoming() }
            guard !reduceMotion else { return }
            withAnimation(.easeInOut(duration: 0.6).repeatForever(autoreverses: true)) { pulsing = true }
        }
    }

    private var muteButton: some View {
        Button(action: onMute) {
            Text(String(localized: "talkie.incoming.mute", defaultValue: "Couper", bundle: .main))
                .font(.subheadline.weight(.bold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
        }
        .accessibilityLabel(String(
            format: String(localized: "talkie.incoming.muteNamed", defaultValue: "Couper la voix de %@", bundle: .main), name
        ))
        .accessibilityIdentifier("talkie.incoming.mute")
    }
}

/// « Parler », à maintenir : le micro du geste de la fiche et de l'en-tête (`TalkieHoldModifier`), posé dans le bandeau.
/// VoiceOver le dit « Maintenir pour parler à … ».
private struct TalkieBannerTalkButton: View {
    @ObservedObject var sender: TalkieSender
    let userId: String
    let name: String
    @Binding var holding: Bool

    private var live: Bool { holding || sender.isActive }

    var body: some View {
        Image(systemName: live ? "waveform" : "mic.fill")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(live ? Color.white : MeeshyColors.brandPrimary)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .background(Capsule().fill(live ? MeeshyColors.brandPrimary : Color.clear))
            .overlay(Capsule().stroke(MeeshyColors.brandPrimary, lineWidth: 1.5))
            .contentShape(Capsule())
            .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileTalkieWording.holdA11y(name: name))
            .accessibilityHint(ProfileTalkieWording.holdHint)
            .accessibilityAddTraits([.isButton, .updatesFrequently])
            .accessibilityIdentifier("talkie.incoming.talk")
    }
}

/// Ce que le bandeau montre : la voix qui sonne, ou celle à qui l'on répond. Répondre prend la parole : la voix reçue se
/// tait ici (sans quoi le micro la renverrait), et le bandeau reste jusqu'à ce que la réponse soit partie.
struct TalkieBannerRoot: View {
    @ObservedObject var center: TalkieCenter
    @ObservedObject var presenter: TalkieBannerPresenter
    @StateObject private var sender = TalkieSender()
    @State private var holding = false

    private var live: TalkieSpeaker? { center.active.first }

    var body: some View {
        VStack(spacing: 0) {
            if let speaker = TalkieBannerLaw.speaker(active: live, replyingTo: presenter.replyingTo) {
                TalkieIndicator(
                    speaker: speaker,
                    isLive: live?.id == speaker.id,
                    sender: sender,
                    holding: $holding,
                    onMute: { center.mute(speaker.talkieId) }
                )
                .id(speaker.id)
                .transition(.move(edge: .top).combined(with: .opacity))
                .background(GeometryReader { proxy in
                    Color.clear.preference(key: TalkieBannerFrameKey.self, value: proxy.frame(in: .global))
                })
            }
            Spacer(minLength: 0)
        }
        .animation(.easeOut(duration: 0.2), value: TalkieBannerLaw.speaker(active: live, replyingTo: presenter.replyingTo)?.id)
        .onPreferenceChange(TalkieBannerFrameKey.self) { presenter.interactiveFrame = $0 }
        .adaptiveOnChange(of: holding) { _, pressed in
            guard pressed else {
                if !sender.isActive { presenter.replyingTo = nil }
                return
            }
            guard let speaker = live else { return }
            presenter.replyingTo = speaker
            center.mute(speaker.talkieId)
        }
        .adaptiveOnChange(of: sender.isActive) { _, active in
            guard !active, !holding else { return }
            presenter.replyingTo = nil
        }
    }
}

/// Le cadre touchable du bandeau, remonté par la mise en page.
private struct TalkieBannerFrameKey: PreferenceKey {
    static let defaultValue: CGRect = .zero
    static func reduce(value: inout CGRect, nextValue: () -> CGRect) {
        let next = nextValue()
        guard !next.isEmpty else { return }
        value = next
    }
}

/// Le bandeau vit dans sa propre fenêtre passe-plat, AU-DESSUS de la fenêtre principale et de ses présentations
/// (feuilles, plein écran) : il reste joignable partout, sans être modal — seules les touches posées sur lui lui
/// reviennent, et il ne prend jamais le clavier. La fenêtre n'existe que le temps du bandeau.
@MainActor
final class TalkieBannerPresenter: ObservableObject {
    static let shared = TalkieBannerPresenter()

    /// Sous le point de retour d'un appel et sa vue plein écran.
    static let windowLevel = UIWindow.Level(rawValue: CallReturnPoint.windowLevel.rawValue - 1)
    /// Le temps de la transition de sortie avant que la fenêtre ne parte.
    private static let hideDelay: TimeInterval = 0.35

    @Published var replyingTo: TalkieSpeaker?
    var interactiveFrame: CGRect = .zero {
        didSet { window?.interactiveFrame = interactiveFrame }
    }

    private var window: CallPassthroughWindow?
    private var subscription: AnyCancellable?
    private var hideTask: Task<Void, Never>?

    nonisolated deinit {}

    func bind(_ center: TalkieCenter) {
        guard subscription == nil else { return }
        subscription = center.$active
            .combineLatest($replyingTo)
            .map { active, replying in TalkieBannerLaw.speaker(active: active.first, replyingTo: replying) != nil }
            .removeDuplicates()
            .sink { [weak self] shown in
                guard let self else { return }
                if shown { self.show(center) } else { self.scheduleHide() }
            }
    }

    private func show(_ center: TalkieCenter) {
        hideTask?.cancel()
        hideTask = nil
        guard window == nil, let scene = CallWindowScene.target() else { return }
        let overlay = CallPassthroughWindow(windowScene: scene)
        // Sa propre fenêtre, hors de la racine de l'app : la préférence « Réduire les animations » de Meeshy s'y pose ici.
        let root = TalkieBannerRoot(center: center, presenter: self)
            .environment(\.meeshyForceReduceMotion, MeeshyAccessibilityPreferences.shared.reduceMotion)
        let controller = UIHostingController(rootView: root)
        controller.view.backgroundColor = .clear
        overlay.windowLevel = Self.windowLevel
        overlay.overrideUserInterfaceStyle = DeviceLayout.measurementWindow?.overrideUserInterfaceStyle ?? .unspecified
        overlay.rootViewController = controller
        overlay.interactiveFrame = interactiveFrame
        overlay.isHidden = false
        window = overlay
    }

    private func scheduleHide() {
        hideTask?.cancel()
        hideTask = Task { [weak self] in
            do {
                try await Task.sleep(for: .seconds(Self.hideDelay))
            } catch {
                return
            }
            self?.hide()
        }
    }

    private func hide() {
        guard let overlay = window else { return }
        window = nil
        interactiveFrame = .zero
        overlay.isHidden = true
        overlay.rootViewController = nil
    }
}

/// Monté une fois pour toute l'app par `OverlayHost` : le bandeau suit les voix reçues, dans sa propre fenêtre.
struct TalkieOverlay: ViewModifier {
    let center: TalkieCenter

    func body(content: Content) -> some View {
        content.onAppear { TalkieBannerPresenter.shared.bind(center) }
    }
}

extension TalkieCenter {
    /// Le câblage de production : le seul endroit qui nomme les singletons.
    static let shared = TalkieCenter(
        sink: TalkieVoicePlayer(),
        people: CirclePeopleDirectory.shared,
        viewerId: { AuthManager.shared.currentUser?.id }
    )
}
