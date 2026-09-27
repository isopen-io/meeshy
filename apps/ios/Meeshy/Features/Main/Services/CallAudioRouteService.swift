import AVFoundation
import Combine

// MARK: - Call Audio Port Kind

enum CallAudioPortKind: Equatable, Sendable {
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

struct CallAudioPort: Equatable, Identifiable, Sendable {
    let id: String
    let name: String
    let kind: CallAudioPortKind
}

extension CallAudioPort {
    init(description: AVAudioSessionPortDescription) {
        self.init(id: description.uid, name: description.portName, kind: CallAudioPortKind(portType: description.portType))
    }
}

// MARK: - Call Audio Route State

struct CallAudioRouteState: Equatable, Sendable {
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
}

enum CallAudioRouteError: Error, Equatable {
    case inputUnavailable
}

// MARK: - Call Audio Route Service

protocol CallAudioRouteProviding: AnyObject {
    var routeChanges: AnyPublisher<Void, Never> { get }
    func currentRoute() -> CallAudioRouteState
    func selectInput(id: String) throws
}

final class CallAudioRouteService: CallAudioRouteProviding {
    static let shared = CallAudioRouteService()

    private let session: AVAudioSession

    init(session: AVAudioSession = .sharedInstance()) {
        self.session = session
    }

    nonisolated deinit {}

    var routeChanges: AnyPublisher<Void, Never> {
        NotificationCenter.default.publisher(for: AVAudioSession.routeChangeNotification, object: nil)
            .receive(on: DispatchQueue.main)
            .map { _ in () }
            .eraseToAnyPublisher()
    }

    func currentRoute() -> CallAudioRouteState {
        let route = session.currentRoute
        return CallAudioRouteState(
            inputs: (session.availableInputs ?? []).map(CallAudioPort.init(description:)),
            selectedInputId: session.preferredInput?.uid ?? route.inputs.first?.uid,
            output: route.outputs.first.map(CallAudioPort.init(description:))
        )
    }

    func selectInput(id: String) throws {
        guard let port = session.availableInputs?.first(where: { $0.uid == id }) else {
            throw CallAudioRouteError.inputUnavailable
        }
        try session.setPreferredInput(port)
    }
}
