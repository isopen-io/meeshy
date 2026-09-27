import SwiftUI
import AVKit
import UIKit
import MeeshyUI

// #8394 — les boutons de la vue d'appel « C adapté ». #8432 — chacun est un
// bouton de VERRE interactif (`CallButtonGlass`) ; le groupe qui les porte
// (la pilule, les actions déployées) n'a qu'un voile non vitré dessous : pas
// de verre sur verre.

/// L'état visuel d'un bouton de la pilule : actif = verre blanc plein et glyphe
/// sombre, Fin = verre rouge, pause automatique = glyphe ambre.
enum CallPillButtonKind: Equatable {
    case normal
    case active
    case destructive
    case warning
}

/// Le glyphe rond d'un bouton de la pilule, dans son propre cercle de verre.
/// Doctrine 86i : un glyphe dans un cercle de taille fixe garde une taille
/// figée ; c'est la légende, dessous, qui porte le Dynamic Type.
struct CallPillGlyph: View {
    let symbol: String
    let kind: CallPillButtonKind
    let diameter: CGFloat

    @Environment(\.callGlassMorph) private var morph
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        Image(systemName: symbol)
            .font(.system(size: diameter * 0.4, weight: .semibold))
            .foregroundStyle(foreground)
            .frame(width: diameter, height: diameter)
            .modifier(CallButtonGlass(kind: kind))
            .modifier(CallGlassMorphModifier(tag: morph, reduceMotion: reduceMotion))
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
        VStack(spacing: 4) {
            CallPillGlyph(symbol: symbol, kind: kind, diameter: diameter)
            if let caption {
                Text(caption)
                    .font(.caption2.weight(.medium))
                    .foregroundColor(.white.opacity(0.85))
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)
            }
        }
        .frame(minWidth: 44, minHeight: 44)
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
        .pressable()
        .accessibilityLabel(label)
        .optionalAccessibilityHint(hint)
        .toggleStateAccessibility(isToggle: toggleState != nil, isActive: toggleState ?? false)
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

    @StateObject private var model: CallAudioRouteViewModel
    @State private var routePicker = CallAudioRoutePickerLauncher()

    init(isSpeaker: Bool, caption: String? = nil, diameter: CGFloat = 50, onToggleSpeaker: @escaping () -> Void, model: CallAudioRouteViewModel? = nil) {
        self.isSpeaker = isSpeaker
        self.caption = caption
        self.diameter = diameter
        self.onToggleSpeaker = onToggleSpeaker
        _model = StateObject(wrappedValue: model ?? CallAudioRouteViewModel())
    }

    private var isExternal: Bool {
        model.state.output?.kind.isExternalOutput ?? false
    }

    private var symbol: String {
        if isExternal, let output = model.state.output { return output.kind.symbolName }
        return isSpeaker ? "speaker.wave.3.fill" : "speaker.fill"
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
            CallPillButtonLabel(symbol: symbol, kind: isSpeaker || isExternal ? .active : .normal, caption: caption, diameter: diameter)
        } primaryAction: {
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
