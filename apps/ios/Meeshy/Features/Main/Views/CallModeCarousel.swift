import SwiftUI
import CoreGraphics
import MeeshyUI

enum CallModeCopy {
    static var quit: String {
        String(localized: "call.mode.quit", defaultValue: "Quitter", bundle: .main)
    }

    static var quitEffectsHint: String {
        String(localized: "call.mode.quit.effects.hint", defaultValue: "Rend votre image telle qu'elle était et revient à l'appel", bundle: .main)
    }

    static var quitMontageHint: String {
        String(localized: "call.mode.quit.montage.hint", defaultValue: "Revient à l'appel", bundle: .main)
    }

    static var carouselHint: String {
        String(localized: "call.mode.carousel.hint", defaultValue: "Balayez vers le haut ou le bas pour choisir", bundle: .main)
    }

    static var effectsTitle: String {
        String(localized: "call.mode.effects.title", defaultValue: "Effets de ma caméra", bundle: .main)
    }

    static let gestureHintSeenKey = "call.mode.gestureHint.seen"

    static var gestureHint: String {
        String(localized: "call.mode.gesture.hint", defaultValue: "Deux tapes : photo · Appui long : vidéo", bundle: .main)
    }

    static var takePhoto: String {
        String(localized: "call.mode.photo", defaultValue: "Prendre une photo", bundle: .main)
    }

    static var startRecording: String {
        String(localized: "call.mode.record", defaultValue: "Filmer", bundle: .main)
    }

    static var stopRecording: String {
        String(localized: "call.mode.record.stop", defaultValue: "Arrêter l'enregistrement", bundle: .main)
    }

    static var stopRecordingHint: String {
        String(localized: "call.mode.record.stop.hint", defaultValue: "Enregistre la vidéo dans Photos", bundle: .main)
    }

    static var recording: String {
        String(localized: "call.mode.recording", defaultValue: "Enregistrement en cours", bundle: .main)
    }

    static var montageTitle: String {
        String(localized: "call.mode.montage.title", defaultValue: "Montage de l'appel", bundle: .main)
    }

    static var validate: String {
        String(localized: "call.mode.effects.validate", defaultValue: "Valider", bundle: .main)
    }

    static var validateHint: String {
        String(localized: "call.mode.effects.validate.hint", defaultValue: "Garde cet effet et revient à l'appel", bundle: .main)
    }

    static var settings: String {
        String(localized: "call.mode.effects.settings", defaultValue: "Réglages", bundle: .main)
    }

    static var settingsHint: String {
        String(localized: "call.mode.effects.settings.hint", defaultValue: "Affiche la luminosité et le flou du fond à la place des effets", bundle: .main)
    }

    static func categoryName(_ category: CallEffectsCategory) -> String {
        switch category {
        case .face: return String(localized: "call.mode.effects.category.face", defaultValue: "Visage", bundle: .main)
        case .color: return String(localized: "call.mode.effects.category.color", defaultValue: "Couleur", bundle: .main)
        }
    }

    static func title(_ mode: CallScreenMode) -> String {
        switch mode {
        case .effects: return effectsTitle
        case .montage: return montageTitle
        }
    }
}

struct CallModeCarousel<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    let title: String
    let name: (Item) -> String
    var itemSize = CGSize(width: 60, height: 60)
    var spacing: CGFloat = 14
    var isRecording = false
    var hint: String?
    var onCapturePhoto: (() -> Void)?
    var onStartRecording: (() -> Void)?
    @ViewBuilder let cell: (Item, Bool) -> Cell

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    /// #8736 — l'élément au centre, qui suit le doigt ; `selection` n'est
    /// posée qu'au repos.
    @State private var centred: Item? = nil

    var body: some View {
        VStack(spacing: 8) {
            Text(name(centred ?? selection))
                .font(.footnote.weight(.semibold))
                .foregroundColor(.white)
                .lineLimit(1)
                .shadow(color: .black.opacity(0.5), radius: 3)
            if let hint {
                Text(hint)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.75))
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
                    .shadow(color: .black.opacity(0.5), radius: 3)
                    .accessibilityHidden(true)
                    .transition(.opacity)
            }
            GeometryReader { geo in
                track(inset: CallModeCarouselRule.sideInset(containerWidth: geo.size.width, itemWidth: itemSize.width))
            }
            .frame(height: CallModeCarouselRule.trackHeight(itemHeight: itemSize.height))
        }
        .animation(reduceMotion ? nil : .easeInOut(duration: 0.25), value: hint)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(title)
        .accessibilityValue(isRecording ? CallModeCopy.recording : name(selection))
        .accessibilityHint(CallModeCopy.carouselHint)
        .accessibilityAdjustableAction { direction in
            switch direction {
            case .increment: step(1)
            case .decrement: step(-1)
            @unknown default: return
            }
        }
        .modifier(CallModeShotActions(
            isEnabled: !isRecording,
            onCapturePhoto: onCapturePhoto,
            onStartRecording: onStartRecording
        ))
    }

    @ViewBuilder
    private func track(inset: CGFloat) -> some View {
        let layout = CallModeTrackLayout(itemSize: itemSize, spacing: spacing, inset: inset, reduceMotion: reduceMotion, isRecording: isRecording)
        if #available(iOS 17.0, *) {
            CallModeSnappingTrack(items: items, selection: $selection, live: $centred, layout: layout, onGesture: handle, cell: cell)
        } else {
            CallModeLegacyTrack(items: items, selection: $selection, live: $centred, layout: layout, onGesture: handle, cell: cell)
        }
    }

    /// #8625 — la règle décide ; la vue n'exécute que ce qu'elle rend.
    private func handle(_ item: Item, _ gesture: CallModeGesture) {
        switch CallModeGestureRule.outcome(of: gesture, isSelected: item == selection, isRecording: isRecording) {
        case .select:
            guard item != selection else { return }
            selection = item
            HapticFeedback.light()
        case .capturePhoto:
            onCapturePhoto?()
        case .startRecording:
            onStartRecording?()
        case .none:
            return
        }
    }

    private func step(_ offset: Int) {
        let next = CallModeCarouselRule.stepping(selection, in: items, by: offset)
        guard next != selection else { return }
        selection = next
        HapticFeedback.light()
    }
}

private struct CallModeTrackLayout {
    let itemSize: CGSize
    let spacing: CGFloat
    let inset: CGFloat
    let reduceMotion: Bool
    let isRecording: Bool

    var verticalMargin: CGFloat {
        CallModeCarouselRule.verticalMargin(itemHeight: itemSize.height)
    }

    var followAnimation: Animation? {
        reduceMotion ? nil : .spring(response: 0.3, dampingFraction: 0.85)
    }

    /// Deux tapes et l'appui long n'écoutent que sur le style CHOISI, et
    /// seulement quand il est au centre : un élément qui défile ne porte
    /// qu'un toucher.
    func listens(isSelected: Bool, isCentred: Bool) -> Bool {
        isCentred && CallModeGestureRule.listensForShots(isSelected: isSelected, isRecording: isRecording)
    }
}

/// #8736 — iOS 17+ : l'accroche laisse le lancer aller aussi loin qu'il
/// porte (`limitBehavior: .never`), le centre suit le doigt, et le choix ne
/// part qu'au repos — jamais un effet par élément traversé, jamais un
/// défilement programmé contre le doigt.
@available(iOS 17.0, *)
private struct CallModeSnappingTrack<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    @Binding var live: Item?
    let layout: CallModeTrackLayout
    let onGesture: (Item, CallModeGesture) -> Void
    let cell: (Item, Bool) -> Cell

    @State private var centred: Item?
    @State private var motion = CallModeCarouselMotion<Item>()

    init(items: [Item], selection: Binding<Item>, live: Binding<Item?>, layout: CallModeTrackLayout, onGesture: @escaping (Item, CallModeGesture) -> Void, cell: @escaping (Item, Bool) -> Cell) {
        self.items = items
        self._selection = selection
        self._live = live
        self.layout = layout
        self.onGesture = onGesture
        self.cell = cell
        self._centred = State(initialValue: selection.wrappedValue)
    }

    var body: some View {
        let shown = centred ?? selection
        ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: layout.spacing) {
                ForEach(items, id: \.self) { item in
                    CallModeCarouselItem(
                        isSelected: item == shown,
                        listens: layout.listens(isSelected: item == selection, isCentred: item == shown),
                        size: layout.itemSize,
                        reduceMotion: layout.reduceMotion
                    ) {
                        cell(item, item == shown)
                    } onGesture: { gesture in
                        motion.tapped()
                        onGesture(item, gesture)
                    }
                    .id(item)
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(.horizontal, layout.inset, for: .scrollContent)
        .contentMargins(.vertical, layout.verticalMargin, for: .scrollContent)
        .scrollTargetBehavior(.viewAligned(limitBehavior: .never))
        .scrollPosition(id: $centred, anchor: .center)
        .modifier(CallModeScrollRest(centred: centred, onUserScrolling: userScrolling, onRest: rest))
        .adaptiveOnChange(of: centred) { _, newValue in
            live = newValue
            motion.moved(to: newValue, infersInteraction: !CallModeScrollRestReader.readsPhases)
            if motion.isInteracting { HapticFeedback.light() }
        }
        .adaptiveOnChange(of: selection) { _, newValue in
            follow(newValue)
        }
    }

    private func userScrolling(_ scrolling: Bool) {
        motion.userScrolling(scrolling)
    }

    private func rest() {
        guard let chosen = motion.rests(on: centred, selection: selection) else {
            follow(selection)
            return
        }
        selection = chosen
    }

    private func follow(_ target: Item) {
        guard motion.follows(target, from: centred) else { return }
        withAnimation(layout.followAnimation) {
            centred = target
        }
    }
}

/// #8736 — iOS 16 : ni accroche, ni position, ni phase. L'élément au
/// centre se déduit du décalage de la piste, et il est choisi quand le
/// centre ne bouge plus.
private struct CallModeLegacyTrack<Item: Hashable, Cell: View>: View {
    let items: [Item]
    @Binding var selection: Item
    @Binding var live: Item?
    let layout: CallModeTrackLayout
    let onGesture: (Item, CallModeGesture) -> Void
    let cell: (Item, Bool) -> Cell

    @State private var centred: Item? = nil
    @State private var motion = CallModeCarouselMotion<Item>()
    @State private var journey = 0

    var body: some View {
        let shown = centred ?? selection
        ScrollViewReader { proxy in
            ScrollView(.horizontal, showsIndicators: false) {
                LazyHStack(spacing: layout.spacing) {
                    ForEach(items, id: \.self) { item in
                        CallModeCarouselItem(
                            isSelected: item == shown,
                            listens: layout.listens(isSelected: item == selection, isCentred: item == shown),
                            size: layout.itemSize,
                            reduceMotion: layout.reduceMotion
                        ) {
                            cell(item, item == shown)
                        } onGesture: { gesture in
                            motion.tapped()
                            onGesture(item, gesture)
                        }
                        .id(item)
                    }
                }
                .padding(.horizontal, layout.inset)
                .padding(.vertical, layout.verticalMargin)
                .background(
                    GeometryReader { content in
                        Color.clear.preference(
                            key: CallModeLegacyOffsetKey.self,
                            value: -content.frame(in: .named(CallModeLegacyOffsetKey.space)).minX
                        )
                    }
                )
            }
            .coordinateSpace(name: CallModeLegacyOffsetKey.space)
            .onPreferenceChange(CallModeLegacyOffsetKey.self) { moved(offset: $0) }
            .modifier(CallModeScrollRest(centred: centred, onUserScrolling: userScrolling, onRest: rest))
            .onAppear {
                guard motion.follows(selection, from: centred) else { return }
                proxy.scrollTo(selection, anchor: .center)
            }
            .adaptiveOnChange(of: centred) { _, newValue in
                live = newValue
                motion.moved(to: newValue, infersInteraction: true)
                if motion.isInteracting { HapticFeedback.light() }
            }
            .adaptiveOnChange(of: selection) { _, newValue in
                follow(newValue)
            }
            .adaptiveOnChange(of: journey) { _, _ in
                withAnimation(layout.followAnimation) {
                    proxy.scrollTo(selection, anchor: .center)
                }
            }
        }
    }

    private func moved(offset: CGFloat) {
        guard let index = CallModeCarouselRule.nearestIndex(offset: offset, itemWidth: layout.itemSize.width, spacing: layout.spacing, count: items.count),
              items[index] != centred else { return }
        centred = items[index]
    }

    private func userScrolling(_ scrolling: Bool) {
        motion.userScrolling(scrolling)
    }

    private func rest() {
        guard let chosen = motion.rests(on: centred, selection: selection) else {
            follow(selection)
            return
        }
        selection = chosen
    }

    private func follow(_ target: Item) {
        guard motion.follows(target, from: centred) else { return }
        journey += 1
    }
}

private nonisolated struct CallModeLegacyOffsetKey: PreferenceKey {
    static let space = "call-mode-legacy-track"
    static let defaultValue: CGFloat = 0

    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = nextValue()
    }
}

private enum CallModeScrollRestReader {
    static var readsPhases: Bool {
        if #available(iOS 18.0, *) { return true }
        return false
    }
}

/// #8736 — le repos du défilement : la phase sous iOS 18 (un doigt qui
/// glisse ou un élan qui décélère = l'utilisateur ; `idle` = le repos) ;
/// avant, un centre qui ne bouge plus depuis 150 ms.
private struct CallModeScrollRest<Item: Equatable>: ViewModifier {
    let centred: Item?
    let onUserScrolling: (Bool) -> Void
    let onRest: () -> Void

    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.onScrollPhaseChange { _, phase in
                switch phase {
                case .interacting, .decelerating:
                    onUserScrolling(true)
                case .idle:
                    onUserScrolling(false)
                    onRest()
                case .tracking, .animating:
                    return
                @unknown default:
                    return
                }
            }
        } else {
            content.task(id: centred) {
                try? await Task.sleep(nanoseconds: CallModeCarouselRule.restDelayNanoseconds)
                guard !Task.isCancelled else { return }
                onUserScrolling(false)
                onRest()
            }
        }
    }
}

/// #8625 — un élément du carrousel. Un simple toucher choisit un autre style ;
/// sur le style choisi, au centre, deux tapes et l'appui long se déclenchent —
/// et seulement là, pour qu'un toucher sur un voisin ne patiente jamais. #8736 —
/// aucun geste de glissé : l'enfoncement ne vit que quand l'élément écoute.
private struct CallModeCarouselItem<Content: View>: View {
    let isSelected: Bool
    let listens: Bool
    let size: CGSize
    let reduceMotion: Bool
    @ViewBuilder let content: () -> Content
    let onGesture: (CallModeGesture) -> Void

    @GestureState private var isPressed = false

    var body: some View {
        content()
            .frame(width: size.width, height: size.height)
            .scaleEffect(CallModeCarouselRule.scale(isSelected: isSelected) * (isPressed && listens ? 0.94 : 1))
            .opacity(CallModeCarouselRule.opacity(isSelected: isSelected))
            .animation(reduceMotion ? nil : .spring(response: 0.25, dampingFraction: 0.8), value: isSelected)
            .animation(reduceMotion ? nil : .easeOut(duration: 0.15), value: isPressed)
            .contentShape(Rectangle())
            .highPriorityGesture(
                TapGesture(count: 2).onEnded { onGesture(.doubleTap) },
                including: listens ? .all : .subviews
            )
            .onTapGesture { onGesture(.tap) }
            .simultaneousGesture(
                LongPressGesture(minimumDuration: CallModeGestureRule.longPressDuration)
                    .updating($isPressed) { value, state, _ in state = value }
                    .onEnded { _ in onGesture(.longPress) },
                including: listens ? .all : .subviews
            )
            .accessibilityAddTraits(.isButton)
    }
}

struct CallModeGlyph: View {
    let art: CallPillChipArt
    let isSelected: Bool

    var body: some View {
        ZStack {
            Circle()
                .fill(isSelected ? Color.white.opacity(0.95) : Color.black.opacity(0.35))
            artwork
        }
        .overlay(
            Circle().stroke(Color.white.opacity(isSelected ? 1 : 0.35), lineWidth: isSelected ? 3 : 1)
        )
        .accessibilityHidden(true)
    }

    @ViewBuilder
    private var artwork: some View {
        switch art {
        case .symbol(let symbol):
            Image(systemName: symbol)
                .font(MeeshyFont.relative(22, weight: .semibold))
                .foregroundColor(isSelected ? .black : .white)
        case .emoji(let emoji):
            Text(emoji)
                .font(.title)
        case .image(let image):
            Image(decorative: image, scale: 1)
                .resizable()
                .aspectRatio(contentMode: .fill)
                .clipShape(Circle())
        }
    }
}

struct CallModeThumbnail: View {
    let image: CGImage?
    let symbol: String
    let isSelected: Bool

    private static let shape = RoundedRectangle(cornerRadius: 10, style: .continuous)

    var body: some View {
        ZStack {
            Self.shape.fill(Color.white.opacity(0.12))
            if let image {
                Image(decorative: image, scale: 1)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
            } else {
                Image(systemName: symbol)
                    .font(MeeshyFont.relative(20, weight: .semibold))
                    .foregroundColor(.white)
            }
        }
        .clipShape(Self.shape)
        .overlay(Self.shape.stroke(isSelected ? Color.white : Color.white.opacity(0.3), lineWidth: isSelected ? 3 : 1))
        .accessibilityHidden(true)
    }
}

struct CallModeOption: Identifiable {
    let id: String
    let symbol: String
    let label: String
    let caption: String
    var hint: String? = nil
    var isOn: Bool? = nil
    var isEnabled = true
    let action: () -> Void
}

struct CallModeActionBar: View {
    let exitHint: String
    let onExit: () -> Void
    let options: [CallModeOption]

    private static let sideDiameter: CGFloat = 44

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            CallPillButton(
                symbol: "xmark",
                kind: .normal,
                label: CallModeCopy.quit,
                caption: CallModeCopy.quit,
                hint: exitHint,
                diameter: Self.sideDiameter,
                action: onExit
            )
            Spacer(minLength: 0)
            ForEach(options) { option in
                CallPillButton(
                    symbol: option.symbol,
                    kind: option.isOn == true ? .active : .normal,
                    label: option.label,
                    caption: option.caption,
                    hint: option.hint,
                    toggleState: option.isOn,
                    diameter: Self.sideDiameter,
                    action: option.action
                )
                .disabled(!option.isEnabled)
            }
        }
        .padding(.horizontal, 24)
    }
}

/// VoiceOver ne voit pas les deux tapes ni l'appui long d'un carrousel
/// ajustable : la photo et le film lui sont offerts en actions nommées.
private struct CallModeShotActions: ViewModifier {
    let isEnabled: Bool
    let onCapturePhoto: (() -> Void)?
    let onStartRecording: (() -> Void)?

    func body(content: Content) -> some View {
        content
            .accessibilityAction(named: Text(CallModeCopy.takePhoto)) {
                guard isEnabled else { return }
                onCapturePhoto?()
            }
            .accessibilityAction(named: Text(CallModeCopy.startRecording)) {
                guard isEnabled else { return }
                onStartRecording?()
            }
    }
}

/// #8625 — pendant le film : un bouton stop rond au centre du gabarit, et le
/// chrono, discret, au-dessus.
struct CallModeRecordingStop: View {
    static let diameter: CGFloat = 76

    let startedAt: Date
    let onStop: () -> Void

    var body: some View {
        VStack(spacing: 12) {
            TimelineView(.periodic(from: startedAt, by: 1)) { context in
                HStack(spacing: 6) {
                    Circle()
                        .fill(MeeshyColors.error)
                        .frame(width: 8, height: 8)
                    Text(CallModeGestureRule.clock(context.date.timeIntervalSince(startedAt)))
                        .font(.footnote.weight(.semibold).monospacedDigit())
                        .foregroundColor(.white)
                }
                .padding(.horizontal, 10)
                .padding(.vertical, 4)
                .background(Capsule().fill(Color.black.opacity(0.45)))
                .accessibilityHidden(true)
            }
            Button(action: onStop) {
                ZStack {
                    Circle()
                        .stroke(Color.white, lineWidth: 4)
                    Circle()
                        .fill(Color.black.opacity(0.35))
                        .padding(4)
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .fill(MeeshyColors.error)
                        .frame(width: 28, height: 28)
                }
                .frame(width: Self.diameter, height: Self.diameter)
                .contentShape(Circle())
            }
            .buttonStyle(CallPressButtonStyle())
            .accessibilityLabel(CallModeCopy.stopRecording)
            .accessibilityHint(CallModeCopy.stopRecordingHint)
        }
        .transition(.opacity.combined(with: .scale(scale: 0.9)))
    }
}
