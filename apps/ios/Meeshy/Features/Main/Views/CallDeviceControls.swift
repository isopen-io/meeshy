import SwiftUI
import AVKit
import UIKit
import MeeshyUI

// #8394 — les boutons de la vue d'appel « C adapté ». #8459 — ils vivent
// DANS le bloc de verre de la pilule (`callControlsGlass`) : chacun est un
// disque plat (`CallButtonFill`), jamais un verre posé sur le verre.

/// L'état visuel d'un bouton de la pilule : actif = disque blanc plein et
/// glyphe sombre, Fin = disque rouge, pause automatique = glyphe ambre.
enum CallPillButtonKind: Equatable {
    case normal
    case active
    case destructive
    case warning
}

/// Le glyphe rond d'un bouton de la pilule, sur son disque plat.
/// Doctrine 86i : un glyphe dans un cercle de taille fixe garde une taille
/// figée ; c'est la légende, dessous, qui porte le Dynamic Type.
struct CallPillGlyph: View {
    let symbol: String
    let kind: CallPillButtonKind
    let diameter: CGFloat

    @Environment(\.callButtonIsPressed) private var isPressed

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: diameter * 0.4, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: diameter, height: diameter)
            .background(Circle().fill(CallButtonFill.color(for: kind)))
            .background(Circle().fill(CallButtonFill.pressedHighlight(isPressed: isPressed)))
            .accessibilityHidden(true)
    }

    private var foreground: Color {
        switch kind {
        case .normal, .destructive: return .white
        case .active: return MeeshyColors.indigo950
        case .warning: return MeeshyColors.warning
        }
    }
}

/// Glyphe + légende facultative (les rangées légendées d'un appel de groupe).
/// La cible reste de 44 pt au moins, quel que soit le diamètre dessiné.
struct CallPillButtonLabel: View {
    let symbol: String
    let kind: CallPillButtonKind
    let caption: String?
    let diameter: CGFloat

    var body: some View {
        VStack(spacing: MeeshySpacing.xs) {
            CallPillGlyph(symbol: symbol, kind: kind, diameter: diameter)
            if let caption {
                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(minWidth: MeeshyControlSize.tapTarget, minHeight: MeeshyControlSize.tapTarget)
        .contentShape(Rectangle())
    }
}

struct CallPillButton: View {
    let symbol: String
    let kind: CallPillButtonKind
    let label: String
    var caption: String? = nil
    var hint: String? = nil
    /// `nil` : le bouton n'est pas une bascule (Fin, Retourner…).
    var toggleState: Bool? = nil
    var diameter: CGFloat = 48
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            CallPillButtonLabel(symbol: symbol, kind: kind, caption: caption, diameter: diameter)
        }
        .buttonStyle(CallPressButtonStyle())
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .toggleStateAccessibility(isToggle: toggleState != nil, isActive: toggleState ?? false)
    }
}

struct CallPressButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        CallPressLabel(isPressed: configuration.isPressed) { configuration.label }
    }
}

/// #8735 — l'enfoncement se VOIT au premier toucher, comme la flèche et le
/// bouton Conversation de l'en-tête : aucun ressort à l'enfoncement (le
/// ressort ne sert qu'au relâchement), un disque qui s'éclaircit, et —
/// Réduire les animations — un disque qui s'éclaircit sans rétrécir.
enum CallPressFeedback {
    static let pressedScale: CGFloat = 0.88

    static func scale(isPressed: Bool, reduceMotion: Bool) -> CGFloat {
        isPressed && !reduceMotion ? pressedScale : 1
    }

    static func animation(isPressed: Bool, reduceMotion: Bool) -> Animation? {
        guard !isPressed, !reduceMotion else { return nil }
        return .spring(response: 0.25, dampingFraction: 0.7)
    }
}

/// L'étiquette de TOUT bouton `CallPressButtonStyle` — pilule, rangées du
/// (…), puces, barre d'un mode. Elle signale chaque doigt posé et levé au
/// chrome d'appel (`callChromeInteraction`) : c'est ce qui réarme le masquage
/// automatique, et ce qui l'empêche tant qu'un doigt est posé.
private struct CallPressLabel<Content: View>: View {
    let isPressed: Bool
    @ViewBuilder let label: () -> Content

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.callChromeInteraction) private var reportInteraction

    var body: some View {
        label()
            .environment(\.callButtonIsPressed, isPressed)
            .scaleEffect(CallPressFeedback.scale(isPressed: isPressed, reduceMotion: reduceMotion))
            .animation(CallPressFeedback.animation(isPressed: isPressed, reduceMotion: reduceMotion), value: isPressed)
            .modifier(CallPressHaptic(isPressed: isPressed))
            .adaptiveOnChange(of: isPressed) { _, pressed in
                reportInteraction?(pressed ? .touchBegan : .touchEnded)
            }
            .onDisappear {
                guard isPressed else { return }
                reportInteraction?(.touchEnded)
            }
    }
}

/// Un léger choc au doigt posé (iOS 17+) ; l'action garde son propre retour
/// au relâchement.
private struct CallPressHaptic: ViewModifier {
    let isPressed: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if #available(iOS 17.0, *) {
            content.sensoryFeedback(.impact(weight: .light), trigger: isPressed) { _, pressed in pressed }
        } else {
            content
        }
    }
}

private struct CallButtonIsPressedKey: EnvironmentKey {
    static let defaultValue = false
}

private struct CallChromeInteractionKey: EnvironmentKey {
    static let defaultValue: ((CallChromeInteraction) -> Void)? = nil
}

extension EnvironmentValues {
    /// Vrai sous le doigt : le disque du bouton s'éclaircit (`CallPillGlyph`).
    var callButtonIsPressed: Bool {
        get { self[CallButtonIsPressedKey.self] }
        set { self[CallButtonIsPressedKey.self] = newValue }
    }

    /// #8735 — UNE porte par laquelle chaque contrôle de l'écran d'appel dit
    /// qu'il est touché. `nil` hors de l'écran d'appel (pastille réduite).
    var callChromeInteraction: ((CallChromeInteraction) -> Void)? {
        get { self[CallChromeInteractionKey.self] }
        set { self[CallChromeInteractionKey.self] = newValue }
    }
}

// MARK: - Sortie

/// « Sortie » dans la pilule : TOUCHER bascule le haut-parleur (le geste le
/// plus fréquent), MAINTENIR ouvre le menu — le sélecteur système de sortie
/// (AirPods, Bluetooth, AirPlay) et, quand il y en a plusieurs, le choix du
/// micro. `Menu(primaryAction:)` porte exactement ce partage, sans geste
/// maison ; VoiceOver y accède aussi par une action nommée.
struct CallOutputPillButton: View {
    let isSpeaker: Bool
    let caption: String?
    let diameter: CGFloat
    let onToggleSpeaker: () -> Void
    let model: CallAudioRouteViewModel?

    init(isSpeaker: Bool, caption: String? = nil, diameter: CGFloat = 50, onToggleSpeaker: @escaping () -> Void, model: CallAudioRouteViewModel? = nil) {
        self.isSpeaker = isSpeaker
        self.caption = caption
        self.diameter = diameter
        self.onToggleSpeaker = onToggleSpeaker
        self.model = model
    }

    var body: some View {
        CallOutputMenu(isSpeaker: isSpeaker, onToggleSpeaker: onToggleSpeaker, model: model) { route in
            CallPillButtonLabel(
                symbol: route.outputSymbol(isSpeaker: isSpeaker),
                kind: isSpeaker || route.routesExternally ? .active : .normal,
                caption: caption,
                diameter: diameter
            )
        }
    }
}

/// Le menu « Sortie » lui-même, habillé par chaque surface d'appel : l'écran
/// d'appel y pose son disque de pilule, la pastille réduite (#8208) son rond
/// sur l'aplat indigo. Le geste, le sélecteur système, le choix du micro et ce
/// que VoiceOver en dit ne vivent qu'ici.
struct CallOutputMenu<Face: View>: View {
    let isSpeaker: Bool
    let onToggleSpeaker: () -> Void
    let label: (CallAudioRouteState) -> Face

    @StateObject private var model: CallAudioRouteViewModel
    @State private var routePicker = CallAudioRoutePickerLauncher()
    @Environment(\.callChromeInteraction) private var reportInteraction

    init(
        isSpeaker: Bool,
        onToggleSpeaker: @escaping () -> Void,
        model: CallAudioRouteViewModel? = nil,
        @ViewBuilder label: @escaping (CallAudioRouteState) -> Face
    ) {
        self.isSpeaker = isSpeaker
        self.onToggleSpeaker = onToggleSpeaker
        self.label = label
        _model = StateObject(wrappedValue: model ?? CallAudioRouteViewModel())
    }

    private var chooseOutputLabel: String {
        String(localized: "call.control.output", defaultValue: "Choisir la sortie audio", bundle: .main)
    }

    private var spokenValue: String {
        let state = ToggleStateLabel.text(isActive: isSpeaker)
        guard let route = model.state.output?.name, !route.isEmpty else { return state }
        return "\(state), \(route)"
    }

    var body: some View {
        Menu {
            Button {
                routePicker.open()
            } label: {
                Label(chooseOutputLabel, systemImage: "airplayaudio")
            }
            if model.state.offersInputChoice {
                Section {
                    ForEach(model.state.inputs) { input in
                        Button {
                            model.selectInput(id: input.id)
                        } label: {
                            Label(input.name, systemImage: model.state.selectedInput?.id == input.id ? "checkmark" : input.kind.symbolName)
                        }
                    }
                } header: {
                    Text(String(localized: "call.control.input", defaultValue: "Choisir le micro", bundle: .main))
                }
            }
        } label: {
            label(model.state)
        } primaryAction: {
            reportInteraction?(.tap)
            onToggleSpeaker()
        }
        .menuIndicator(.hidden)
        .background(routePicker.host.frame(width: 1, height: 1).opacity(0.02).accessibilityHidden(true))
        .accessibilityLabel(String(localized: "call.control.output.caption", defaultValue: "Sortie", bundle: .main))
        // UNE valeur : l'état du haut-parleur, puis la sortie courante — deux
        // `accessibilityValue` empilés se masqueraient l'un l'autre.
        .accessibilityValue(spokenValue)
        .accessibilityHint(String(localized: "call.control.output.hint", defaultValue: "Touchez pour basculer le haut-parleur, maintenez pour choisir la sortie", bundle: .main))
        .accessibilityAction(named: Text(chooseOutputLabel)) { routePicker.open() }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }
}

/// Ouvre le sélecteur système de sortie audio. `AVRoutePickerView` n'a pas
/// d'API d'ouverture : on actionne le bouton qu'elle porte — même motif que
/// `ScreenSharePickerLauncher`. La vue vit dans la hiérarchie (`host`).
final class CallAudioRoutePickerLauncher {
    private(set) lazy var picker: AVRoutePickerView = {
        let view = AVRoutePickerView(frame: CGRect(x: 0, y: 0, width: 1, height: 1))
        view.prioritizesVideoDevices = false
        view.tintColor = .clear
        view.activeTintColor = .clear
        view.isAccessibilityElement = false
        view.accessibilityElementsHidden = true
        return view
    }()

    nonisolated deinit {}

    func open() {
        HapticFeedback.light()
        picker.subviews
            .compactMap { $0 as? UIButton }
            .first?
            .sendActions(for: .touchUpInside)
    }

    var host: some View { CallAudioRoutePickerHost(picker: picker) }
}

private struct CallAudioRoutePickerHost: UIViewRepresentable {
    let picker: AVRoutePickerView

    func makeUIView(context: Context) -> AVRoutePickerView { picker }
    func updateUIView(_ uiView: AVRoutePickerView, context: Context) {}
}
