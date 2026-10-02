import AVFoundation
import Combine

// MARK: - Call Audio Port Kind

nonisolated enum CallAudioPortKind: Equatable, Sendable {
    case builtInMicrophone
    case receiver
    case speaker
    case bluetooth
    case airPlay
    case wired
    case carAudio
    case usb
    case other

    init(portType: AVAudioSession.Port) {
        switch portType {
        case .builtInMic: self = .builtInMicrophone
        case .builtInReceiver: self = .receiver
        case .builtInSpeaker: self = .speaker
        case .bluetoothHFP, .bluetoothA2DP, .bluetoothLE: self = .bluetooth
        case .airPlay: self = .airPlay
        case .headphones, .headsetMic, .lineIn, .lineOut: self = .wired
        case .carAudio: self = .carAudio
        case .usbAudio: self = .usb
        default: self = .other
        }
    }

    var isExternalOutput: Bool {
        switch self {
        case .bluetooth, .airPlay, .wired, .carAudio, .usb: return true
        case .builtInMicrophone, .receiver, .speaker, .other: return false
        }
    }

    var symbolName: String {
        switch self {
        case .builtInMicrophone: return "mic.fill"
        case .receiver: return "iphone"
        case .speaker: return "speaker.wave.3.fill"
        case .bluetooth, .wired: return "headphones"
        case .airPlay: return "airplayaudio"
        case .carAudio: return "car.fill"
        case .usb, .other: return "hifispeaker.fill"
        }
    }
}

// MARK: - Call Audio Port

nonisolated struct CallAudioPort: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let kind: CallAudioPortKind
}

nonisolated extension CallAudioPort {
    init(description: AVAudioSessionPortDescription) {
        self.init(id: description.uid, name: description.portName, kind: CallAudioPortKind(portType: description.portType))
    }
}

// MARK: - Call Audio Route State

nonisolated struct CallAudioRouteState: Equatable, Sendable {
    let inputs: [CallAudioPort]
    let selectedInputId: String?
    let output: CallAudioPort?

    static let empty = CallAudioRouteState(inputs: [], selectedInputId: nil, output: nil)

    var offersInputChoice: Bool {
        inputs.count > 1
    }

    var selectedInput: CallAudioPort? {
        inputs.first { $0.id == selectedInputId }
    }

    func selecting(inputId: String) -> CallAudioRouteState {
        guard inputs.contains(where: { $0.id == inputId }) else { return self }
        return CallAudioRouteState(inputs: inputs, selectedInputId: inputId, output: output)
    }

    var routesExternally: Bool {
        output?.kind.isExternalOutput ?? false
    }

    func outputSymbol(isSpeaker: Bool) -> String {
        if routesExternally, let output { return output.kind.symbolName }
        return isSpeaker ? "speaker.wave.3.fill" : "speaker.fill"
    }
}

nonisolated enum CallAudioRouteError: Error, Equatable {
    case inputUnavailable
}

// MARK: - Call Audio Route Service

/// #8989 — lire ou changer la route audio touche `AVAudioSession`, qui peut
/// bloquer : jamais sur le fil principal, ni au toucher ni à la réapparition
/// du bouton « Sortie ».
protocol CallAudioRouteProviding: AnyObject {
    var routeChanges: AnyPublisher<Void, Never> { get }
    func currentRoute() async -> CallAudioRouteState
    func selectInput(id: String) async throws
}

final class CallAudioRouteService: CallAudioRouteProviding {
    static let shared = CallAudioRouteService()

    nonisolated deinit {}

    var routeChanges: AnyPublisher<Void, Never> {
        NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification, object: nil)
            .receive(on: DispatchQueue.main)
            .map { _ in () }
            .eraseToAnyPublisher()
    }

    func currentRoute() async -> CallAudioRouteState {
        await Self.readRoute()
    }

    func selectInput(id: String) async throws {
        try await Self.applyPreferredInput(id: id)
    }

    @concurrent nonisolated static func readRoute() async -> CallAudioRouteState {
        let session = AVAudioSession.sharedInstance()
        let route = session.currentRoute
        return CallAudioRouteState(
            inputs: (session.availableInputs ?? []).map(CallAudioPort.init(description:)),
            selectedInputId: session.preferredInput?.uid ?? route.inputs.first?.uid,
            output: route.outputs.first.map(CallAudioPort.init(description:))
        )
    }

    @concurrent nonisolated static func applyPreferredInput(id: String) async throws {
        let session = AVAudioSession.sharedInstance()
        guard let port = session.availableInputs?.first(where: { $0.uid == id }) else {
            throw CallAudioRouteError.inputUnavailable
        }
        try session.setPreferredInput(port)
    }
}
