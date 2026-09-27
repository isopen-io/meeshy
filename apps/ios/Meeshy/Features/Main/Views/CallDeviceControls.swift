import SwiftUI
import AVKit
import MeeshyUI

// MARK: - Camera Picker

struct CallCameraPickerControl: View {
    let cameras: [CameraDeviceOption]
    let selectedCameraId: String?
    let onSelect: (String) -> Void

    var body: some View {
        Menu {
            ForEach(cameras) { cam in
                Button {
                    onSelect(cam.id)
                } label: {
                    Label(cam.displayName, systemImage: selectedCameraId == cam.id ? "checkmark" : "camera")
                }
            }
        } label: {
            CallDeviceControlLabel(
                symbolName: "camera.badge.ellipsis",
                isActive: false,
                caption: String(localized: "call.control.camera.caption", defaultValue: "Caméra", bundle: .main)
            )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.control.camera", defaultValue: "Choisir la caméra", bundle: .main))
    }
}

// MARK: - Audio Route Controls

struct CallAudioRouteControls: View {
    @StateObject private var model: CallAudioRouteViewModel

    init(model: CallAudioRouteViewModel? = nil) {
        _model = StateObject(wrappedValue: model ?? CallAudioRouteViewModel())
    }

    var body: some View {
        HStack(spacing: 20) {
            CallAudioOutputControl(output: model.state.output)
            if model.state.offersInputChoice {
                CallAudioInputControl(
                    inputs: model.state.inputs,
                    selectedInput: model.state.selectedInput,
                    onSelect: model.selectInput(id:)
                )
            }
        }
        .onAppear { model.start() }
        .onDisappear { model.stop() }
    }
}

struct CallAudioOutputControl: View {
    let output: CallAudioPort?

    private var isExternal: Bool {
        output?.kind.isExternalOutput ?? false
    }

    var body: some View {
        VStack(spacing: 6) {
            ZStack {
                Image(systemName: output?.kind.symbolName ?? CallAudioPortKind.receiver.symbolName)
                    .font(.title2.weight(.medium))
                    .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                    .foregroundColor(isExternal ? MeeshyColors.info : .white.opacity(0.9))
                    .accessibilityHidden(true)
                CallAudioRoutePicker(
                    spokenLabel: String(localized: "call.control.output", defaultValue: "Choisir la sortie audio", bundle: .main),
                    spokenValue: output?.name
                )
            }
            .callControlGlass(diameter: 56, isActive: isExternal, tint: MeeshyColors.info)
            CallDeviceControlCaption(text: String(localized: "call.control.output.caption", defaultValue: "Sortie", bundle: .main))
        }
        .frame(width: 68)
    }
}

struct CallAudioInputControl: View {
    let inputs: [CallAudioPort]
    let selectedInput: CallAudioPort?
    let onSelect: (String) -> Void

    var body: some View {
        Menu {
            ForEach(inputs) { input in
                Button {
                    onSelect(input.id)
                } label: {
                    Label(input.name, systemImage: selectedInput?.id == input.id ? "checkmark" : input.kind.symbolName)
                }
            }
        } label: {
            CallDeviceControlLabel(
                symbolName: selectedInput?.kind.symbolName ?? CallAudioPortKind.builtInMicrophone.symbolName,
                isActive: selectedInput.map { $0.kind != .builtInMicrophone } ?? false,
                caption: String(localized: "call.control.input.caption", defaultValue: "Entrée", bundle: .main)
            )
        }
        .pressable()
        .accessibilityLabel(String(localized: "call.control.input", defaultValue: "Choisir le micro", bundle: .main))
        .accessibilityValue(selectedInput?.name ?? "")
    }
}

// MARK: - Shared Pieces

struct CallDeviceControlLabel: View {
    let symbolName: String
    let isActive: Bool
    let caption: String

    var body: some View {
        VStack(spacing: 6) {
            Image(systemName: symbolName)
                .font(.title2.weight(.medium))
                .dynamicTypeSize(...DynamicTypeSize.xxxLarge)
                .foregroundColor(isActive ? MeeshyColors.info : .white.opacity(0.9))
                .callControlGlass(diameter: 56, isActive: isActive, tint: MeeshyColors.info)
            CallDeviceControlCaption(text: caption)
        }
        .frame(width: 68)
    }
}

struct CallDeviceControlCaption: View {
    let text: String

    var body: some View {
        Text(text)
            .font(.caption2.weight(.medium))
            .foregroundColor(.white.opacity(0.7))
            .lineLimit(1)
            .minimumScaleFactor(0.7)
    }
}

struct CallAudioRoutePicker: UIViewRepresentable {
    let spokenLabel: String
    let spokenValue: String?

    func makeUIView(context: Context) -> AVRoutePickerView {
        let picker = AVRoutePickerView()
        picker.prioritizesVideoDevices = false
        picker.tintColor = .clear
        picker.activeTintColor = .clear
        picker.backgroundColor = .clear
        return picker
    }

    func updateUIView(_ picker: AVRoutePickerView, context: Context) {
        picker.accessibilityLabel = spokenLabel
        picker.accessibilityValue = spokenValue
        picker.subviews.compactMap { $0 as? UIButton }.forEach { button in
            button.accessibilityLabel = spokenLabel
            button.accessibilityValue = spokenValue
        }
    }
}
