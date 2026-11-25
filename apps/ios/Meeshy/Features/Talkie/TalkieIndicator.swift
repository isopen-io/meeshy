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

    /// La première voix qui sonne hors des correspondants dont l'en-tête de conversation est à l'écran ; sinon celui à
    /// qui l'on répond, sous la même règle. L'en-tête porte déjà l'orbe de leur voix : rien ne le recouvre (#20531).
    static func speaker(active: [TalkieSpeaker], replyingTo: TalkieSpeaker?, onScreenHeaders: Set<String>) -> TalkieSpeaker? {
        let live = liveSpeaker(active: active, onScreenHeaders: onScreenHeaders)
        let answered = replyingTo.flatMap { onScreenHeaders.contains($0.fromUserId) ? nil : $0 }
        return speaker(active: live, replyingTo: answered)
    }

    /// La voix qui sonne et que le bandeau montre.
    static func liveSpeaker(active: [TalkieSpeaker], onScreenHeaders: Set<String>) -> TalkieSpeaker? {
        active.first { !onScreenHeaders.contains($0.fromUserId) }
    }

    /// « Couper » tant que la voix sonne ; « Parler » seulement si l'émission vers ce correspondant est ouverte
    /// (`TalkieOfferRule`, servie par `TalkieOfferModel`). Rien de grisé : ce qui n'agit pas n'est pas montré.
    static func actions(speakerIsLive: Bool, offered: Bool) -> [TalkieBannerAction] {
        (speakerIsLive ? [.mute] : []) + (offered ? [.talk] : [])
    }
}

/// Les correspondants dont l'en-tête de conversation est à l'écran (#20531) : leur voix vit en orbe sur le bouton
/// talkie de l'en-tête, et le bandeau du talkie reçu ne s'y pose pas. Chaque en-tête compte, jusqu'au dernier parti.
@MainActor
final class TalkieHeaderPresence: ObservableObject {
    static let shared = TalkieHeaderPresence()

    @Published private(set) var peers: Set<String> = []
    private var counts: [String: Int] = [:]

    nonisolated deinit {}

    func appear(_ userId: String) {
        counts[userId, default: 0] += 1
        peers.insert(userId)
    }

    func disappear(_ userId: String) {
        guard let count = counts[userId] else { return }
        guard count > 1 else {
            counts[userId] = nil
            peers.remove(userId)
            return
        }
        counts[userId] = count - 1
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
            Text(title)
                .font(.subheadline.weight(.semibold))
                .foregroundStyle(MeeshyColors.textPrimary(isDark: isDark))
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .layoutPriority(1)
            voiceSpace
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
        }
    }

    /// La place libre entre le libellé et les boutons : le spectre de la voix du pair tant qu'elle sonne (#20531),
    /// vide sinon. Les deux prennent la même place : rien ne bouge quand la voix s'arrête.
    @ViewBuilder
    private var voiceSpace: some View {
        if isLive {
            TalkieVoiceRibbon(userId: speaker.fromUserId, direction: .incoming)
                .frame(minWidth: MeeshySpacing.sm, maxWidth: .infinity)
                .frame(height: Self.ribbonHeight)
        } else {
            Spacer(minLength: MeeshySpacing.sm)
        }
    }

    static let ribbonHeight: CGFloat = MeeshyControlSize.small

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
    @ObservedObject private var voices: TalkieVoiceStageObserver
    @State private var unreachableLasting = false

    init(sender: TalkieSender, userId: String, name: String, holding: Binding<Bool>,
         voices: TalkieVoiceStageObserver = .shared) {
        self.sender = sender
        self.userId = userId
        self.name = name
        _holding = holding
        _voices = ObservedObject(wrappedValue: voices)
    }

    private var live: Bool { holding || sender.isActive }
    private var delivery: TalkieDelivery { TalkieDelivery.of(lasting: unreachableLasting) }

    /// L'orbe CIRCULAIRE de ma voix qui part vers lui (#20531) ; la sienne vit dans le spectre du bandeau.
    private var orbShows: Bool {
        voices.voices.contains(TalkieVoiceKey(userId: userId, direction: .outgoing))
    }

    static let orb = TalkieVoiceHostLaw.holdOrb(buttonSize: MeeshyControlSize.tapTarget, room: MeeshySpacing.md)

    var body: some View {
        Image(systemName: live ? "waveform" : "mic.fill")
            .font(.subheadline.weight(.bold))
            .foregroundStyle(live ? Color.white : MeeshyColors.brandPrimary)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .background(Capsule().fill(live ? MeeshyColors.brandPrimary : Color.clear))
            .overlay(Capsule().stroke(MeeshyColors.brandPrimary, lineWidth: 1.5))
            .background { TalkieHoldOrb(userId: userId, shows: orbShows, geometry: Self.orb, direction: .outgoing) }
            .contentShape(Capsule())
            .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding, delivery: delivery))
            .modifier(PhoneUnreachableLastingReader(userId: userId, lasting: $unreachableLasting))
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileTalkieWording.holdA11y(name: name, delivery: delivery))
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
    @ObservedObject var headers: TalkieHeaderPresence
    @StateObject private var sender = TalkieSender()
    @State private var holding = false

    private var live: TalkieSpeaker? { TalkieBannerLaw.liveSpeaker(active: center.active, onScreenHeaders: headers.peers) }

    private var shown: TalkieSpeaker? {
        TalkieBannerLaw.speaker(active: center.active, replyingTo: presenter.replyingTo, onScreenHeaders: headers.peers)
    }

    var body: some View {
        VStack(spacing: 0) {
            if let speaker = shown {
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
        .animation(.easeOut(duration: 0.2), value: shown?.id)
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
    private var headers: TalkieHeaderPresence = .shared
    private var subscription: AnyCancellable?
    private var hideTask: Task<Void, Never>?

    nonisolated deinit {}

    func bind(_ center: TalkieCenter, headers: TalkieHeaderPresence = .shared) {
        guard subscription == nil else { return }
        self.headers = headers
        subscription = center.$active
            .combineLatest($replyingTo, headers.$peers)
            .map { active, replying, peers in
                TalkieBannerLaw.speaker(active: active, replyingTo: replying, onScreenHeaders: peers) != nil
            }
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
        let root = TalkieBannerRoot(center: center, presenter: self, headers: headers)
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
