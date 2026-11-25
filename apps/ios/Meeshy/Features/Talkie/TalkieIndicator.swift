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
                .multilineTextAlignment(.center)
                .lineLimit(2)
                .fixedSize(horizontal: false, vertical: true)
                .modifier(TalkieBannerScrim(isDark: isDark))
                .frame(maxWidth: .infinity)
                .anchorPreference(key: TalkieRibbonRegionKey.self, value: .bounds) { $0 }
            if actions.contains(.mute) { muteButton }
            if actions.contains(.talk) {
                TalkieBannerTalkButton(sender: sender, userId: speaker.fromUserId, name: name, holding: $holding)
            }
        }
        .padding(.horizontal, MeeshySpacing.lg)
        .padding(.vertical, MeeshySpacing.xs)
        .backgroundPreferenceValue(TalkieRibbonRegionKey.self) { region in
            GeometryReader { proxy in voiceBackground(ribbonEnd: region.map { proxy[$0].maxX }) }
        }
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

    /// Le fond du bandeau : le verre, et par-dessus, tant que la voix du pair sonne, son spectre du bord avant jusqu'à
    /// la fin de la zone du nom (#20531) — l'espacement de la rangée le sépare de « Couper », il ne passe jamais sous
    /// « Couper » ni sous le micro. Le nom se pose dessus ; le fond ne change jamais la taille du bandeau.
    private func voiceBackground(ribbonEnd: CGFloat?) -> some View {
        let shape = RoundedRectangle(cornerRadius: MeeshyRadius.xxl, style: .continuous)
        return ZStack(alignment: .leading) {
            shape.fill(.ultraThinMaterial)
            if isLive, let ribbonEnd, ribbonEnd > 0 {
                TalkieVoiceRibbon(userId: speaker.fromUserId, direction: .incoming)
                    .frame(width: ribbonEnd)
            }
        }
        .clipShape(shape)
    }

    private var muteButton: some View {
        Button(action: onMute) {
            Image(systemName: "speaker.slash.fill")
                .font(.body.weight(.semibold))
                .foregroundStyle(MeeshyColors.brandPrimary)
                .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(String(
            format: String(localized: "talkie.incoming.muteNamed", defaultValue: "Couper la voix de %@", bundle: .main), name
        ))
        .accessibilityInputLabels([String(localized: "talkie.incoming.mute", defaultValue: "Couper", bundle: .main)])
        .accessibilityIdentifier("talkie.incoming.mute")
    }
}

/// Où finit la zone du nom dans la rangée du bandeau : le spectre s'arrête là.
private struct TalkieRibbonRegionKey: PreferenceKey {
    static var defaultValue: Anchor<CGRect>? { nil }

    static func reduce(value: inout Anchor<CGRect>?, nextValue: () -> Anchor<CGRect>?) {
        value = value ?? nextValue()
    }
}

/// Le voile qui garde un texte lisible sur le spectre du bandeau : une capsule du fond de l'app, derrière le texte seul.
private struct TalkieBannerScrim: ViewModifier {
    let isDark: Bool

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, MeeshySpacing.sm)
            .padding(.vertical, MeeshySpacing.xxs)
            .background(Capsule().fill(MeeshyColors.backgroundPrimary(isDark: isDark).opacity(MeeshyOpacity.heavy)))
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

    /// Le symbole commun à la fiche et à l'en-tête (#20579) : « connexion » avant l'accusé, jamais l'onde du direct.
    private var glyph: TalkieHoldGlyph {
        TalkieHoldGlyph.resolve(phase: sender.phase, waking: sender.waking, aftermath: nil, delivery: delivery)
    }

    /// Le sort de ma réponse tant qu'elle part : le bandeau annonce un réveil ou un repli quand il commence.
    private var liveDelivery: TalkieHeaderDelivery? {
        sender.isActive ? TalkieHeaderDelivery.resolve(phase: sender.phase, waking: sender.waking) : nil
    }

    /// L'orbe CIRCULAIRE de ma voix qui part vers lui (#20531) ; la sienne vit dans le spectre du bandeau.
    private var orbShows: Bool {
        voices.voices.contains(TalkieVoiceKey(userId: userId, direction: .outgoing))
    }

    static let orb = TalkieVoiceHostLaw.holdOrb(buttonSize: MeeshyControlSize.tapTarget, room: MeeshySpacing.md)

    var body: some View {
        Image(systemName: glyph.symbol(rest: "mic.fill"))
            .font(.subheadline.weight(.bold))
            .foregroundStyle(live ? Color.white : MeeshyColors.brandPrimary)
            .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
            .background {
                Capsule()
                    .fill(live ? MeeshyColors.brandPrimary : Color.clear)
                    .overlay { TalkieHoldOrb(userId: userId, shows: orbShows, geometry: Self.orb, direction: .outgoing) }
            }
            .overlay(Capsule().stroke(MeeshyColors.brandPrimary, lineWidth: 1.5))
            .contentShape(Capsule())
            .modifier(TalkieHoldModifier(sender: sender, userId: userId, pressed: $holding, delivery: delivery))
            .modifier(PhoneUnreachableLastingReader(userId: userId, lasting: $unreachableLasting))
            .adaptiveOnChange(of: liveDelivery) { previous, current in
                guard let notice = TalkieLiveNotice.on(previous: previous, current: current, delivery: delivery) else { return }
                FeedbackToastManager.shared.show(notice.text(name: name), type: .info)
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(ProfileTalkieWording.holdA11y(name: name, delivery: delivery))
            .accessibilityHint(ProfileTalkieWording.holdHint)
            .accessibilityAddTraits([.isButton, .updatesFrequently])
            .accessibilityIdentifier("talkie.incoming.talk")
    }
}

/// Ce que le bandeau montre : la voix qui sonne, ou celle à qui l'on répond. Répondre prend la parole SANS faire taire la
/// voix reçue (#20579) : on parle et on s'entend à deux, son spectre continue dans le bandeau pendant que l'orbe de ma
/// voix vit sur le micro, et le bandeau reste jusqu'à ce que la réponse soit partie.
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
            presenter.replyingTo = TalkieBannerLaw.replyingTo(pressed: pressed, live: live, current: presenter.replyingTo,
                                                              sending: sender.isActive)
        }
        .adaptiveOnChange(of: sender.isActive) { _, active in
            presenter.replyingTo = TalkieBannerLaw.replyingTo(pressed: holding, live: live, current: presenter.replyingTo,
                                                              sending: active)
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
