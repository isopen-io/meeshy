import XCTest
import AVFoundation
import Combine
@testable import Meeshy

@MainActor
final class MockCallAudioRouteService: CallAudioRouteProviding {
    var currentRouteResult: CallAudioRouteState = .empty
    var selectInputResult: Result<Void, Error> = .success(())
    private(set) var currentRouteCallCount = 0
    private(set) var selectInputCallCount = 0
    private(set) var lastSelectedInputId: String?
    let routeChangeSubject = PassthroughSubject<Void, Never>()

    var routeChanges: AnyPublisher<Void, Never> { routeChangeSubject.eraseToAnyPublisher() }

    func currentRoute() async -> CallAudioRouteState {
        currentRouteCallCount += 1
        return currentRouteResult
    }

    func selectInput(id: String) async throws {
        selectInputCallCount += 1
        lastSelectedInputId = id
        try selectInputResult.get()
    }

    func reset() {
        currentRouteResult = .empty
        selectInputResult = .success(())
        currentRouteCallCount = 0
        selectInputCallCount = 0
        lastSelectedInputId = nil
    }
}

@MainActor
final class CallAudioPortKindTests: XCTestCase {

    func test_kind_bluetoothPortsAreBluetooth() {
        XCTAssertEqual(CallAudioPortKind(portType: .bluetoothHFP), .bluetooth)
        XCTAssertEqual(CallAudioPortKind(portType: .bluetoothA2DP), .bluetooth)
        XCTAssertEqual(CallAudioPortKind(portType: .bluetoothLE), .bluetooth)
    }

    func test_kind_builtInPorts() {
        XCTAssertEqual(CallAudioPortKind(portType: .builtInMic), .builtInMicrophone)
        XCTAssertEqual(CallAudioPortKind(portType: .builtInReceiver), .receiver)
        XCTAssertEqual(CallAudioPortKind(portType: .builtInSpeaker), .speaker)
    }

    func test_kind_wiredAirPlayCarUsb() {
        XCTAssertEqual(CallAudioPortKind(portType: .headphones), .wired)
        XCTAssertEqual(CallAudioPortKind(portType: .headsetMic), .wired)
        XCTAssertEqual(CallAudioPortKind(portType: .airPlay), .airPlay)
        XCTAssertEqual(CallAudioPortKind(portType: .carAudio), .carAudio)
        XCTAssertEqual(CallAudioPortKind(portType: .usbAudio), .usb)
        XCTAssertEqual(CallAudioPortKind(portType: AVAudioSession.Port(rawValue: "Unknown")), .other)
    }

    func test_isExternalOutput_onlyForAccessories() {
        XCTAssertTrue(CallAudioPortKind.bluetooth.isExternalOutput)
        XCTAssertTrue(CallAudioPortKind.airPlay.isExternalOutput)
        XCTAssertTrue(CallAudioPortKind.wired.isExternalOutput)
        XCTAssertTrue(CallAudioPortKind.carAudio.isExternalOutput)
        XCTAssertTrue(CallAudioPortKind.usb.isExternalOutput)
        XCTAssertFalse(CallAudioPortKind.speaker.isExternalOutput)
        XCTAssertFalse(CallAudioPortKind.receiver.isExternalOutput)
        XCTAssertFalse(CallAudioPortKind.other.isExternalOutput)
    }
}

@MainActor
final class CallSpeakerRouteReconciliationTests: XCTestCase {

    func test_speakerFlag_pickerChoseBluetooth_clearsSpeaker() {
        XCTAssertFalse(CallManager.speakerFlag(afterOverrideTo: .bluetooth, current: true))
    }

    func test_speakerFlag_pickerChoseAirPlay_clearsSpeaker() {
        XCTAssertFalse(CallManager.speakerFlag(afterOverrideTo: .airPlay, current: true))
    }

    func test_speakerFlag_pickerChoseReceiver_clearsSpeaker() {
        XCTAssertFalse(CallManager.speakerFlag(afterOverrideTo: .receiver, current: true))
    }

    func test_speakerFlag_speakerOutput_keepsCurrentPreference() {
        XCTAssertTrue(CallManager.speakerFlag(afterOverrideTo: .speaker, current: true))
        XCTAssertFalse(CallManager.speakerFlag(afterOverrideTo: .speaker, current: false))
    }

    func test_speakerFlag_unknownRoute_keepsCurrentPreference() {
        XCTAssertTrue(CallManager.speakerFlag(afterOverrideTo: nil, current: true))
    }
}

@MainActor
final class CallAudioRouteStateTests: XCTestCase {

    private let iphoneMic = CallAudioPort(id: "mic", name: "iPhone Microphone", kind: .builtInMicrophone)
    private let airpods = CallAudioPort(id: "bt", name: "AirPods Pro", kind: .bluetooth)

    func test_offersInputChoice_onlyWithSeveralInputs() {
        XCTAssertFalse(CallAudioRouteState(inputs: [iphoneMic], selectedInputId: "mic", output: nil).offersInputChoice)
        XCTAssertTrue(CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "mic", output: nil).offersInputChoice)
    }

    func test_selecting_knownInput_movesSelection() {
        let state = CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "mic", output: nil)

        XCTAssertEqual(state.selecting(inputId: "bt").selectedInputId, "bt")
    }

    func test_selecting_unknownInput_keepsSelection() {
        let state = CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "mic", output: nil)

        XCTAssertEqual(state.selecting(inputId: "gone").selectedInputId, "mic")
    }

    func test_selectedInput_resolvesThePort() {
        let state = CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "bt", output: nil)

        XCTAssertEqual(state.selectedInput, airpods)
    }

    func test_outputSymbol_bluetoothOutput_showsTheAccessory_whateverTheSpeakerFlag() {
        let state = CallAudioRouteState(inputs: [], selectedInputId: nil, output: airpods)

        XCTAssertEqual(state.outputSymbol(isSpeaker: false), "headphones")
        XCTAssertEqual(state.outputSymbol(isSpeaker: true), "headphones")
        XCTAssertTrue(state.routesExternally)
    }

    func test_outputSymbol_builtInOutput_followsTheSpeakerFlag() {
        let receiver = CallAudioPort(id: "rcv", name: "Receiver", kind: .receiver)
        let state = CallAudioRouteState(inputs: [], selectedInputId: nil, output: receiver)

        XCTAssertEqual(state.outputSymbol(isSpeaker: true), "speaker.wave.3.fill")
        XCTAssertEqual(state.outputSymbol(isSpeaker: false), "speaker.fill")
        XCTAssertFalse(state.routesExternally)
    }

    func test_outputSymbol_unknownRoute_followsTheSpeakerFlag() {
        XCTAssertEqual(CallAudioRouteState.empty.outputSymbol(isSpeaker: false), "speaker.fill")
        XCTAssertFalse(CallAudioRouteState.empty.routesExternally)
    }
}

@MainActor
final class CallAudioRouteViewModelTests: XCTestCase {

    private let iphoneMic = CallAudioPort(id: "mic", name: "iPhone Microphone", kind: .builtInMicrophone)
    private let airpods = CallAudioPort(id: "bt", name: "AirPods Pro", kind: .bluetooth)
    private let receiver = CallAudioPort(id: "rcv", name: "Receiver", kind: .receiver)

    private func makeSUT() -> (sut: CallAudioRouteViewModel, service: MockCallAudioRouteService) {
        let service = MockCallAudioRouteService()
        service.currentRouteResult = CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "mic", output: receiver)
        let sut = CallAudioRouteViewModel(service: service)
        return (sut, service)
    }

    func test_start_readsTheCurrentRoute() async {
        let (sut, _) = makeSUT()

        sut.start()
        await sut.refreshTask?.value

        XCTAssertEqual(sut.state.selectedInputId, "mic")
        XCTAssertEqual(sut.state.output, receiver)
    }

    func test_routeChange_refreshesTheState() async {
        let (sut, service) = makeSUT()
        sut.start()
        await sut.refreshTask?.value
        service.currentRouteResult = CallAudioRouteState(inputs: [iphoneMic, airpods], selectedInputId: "bt", output: airpods)

        service.routeChangeSubject.send(())
        await sut.refreshTask?.value

        XCTAssertEqual(sut.state.output, airpods)
        XCTAssertEqual(sut.state.selectedInputId, "bt")
    }

    func test_selectInput_success_appliesAndForwardsToService() async {
        let (sut, service) = makeSUT()
        sut.start()
        await sut.refreshTask?.value

        sut.selectInput(id: "bt")
        XCTAssertEqual(sut.state.selectedInputId, "bt", "le choix s'affiche avant que la session audio ne réponde")
        await sut.selectionTask?.value

        XCTAssertEqual(service.selectInputCallCount, 1)
        XCTAssertEqual(service.lastSelectedInputId, "bt")
        XCTAssertEqual(sut.state.selectedInputId, "bt")
    }

    func test_selectInput_failure_rollsBack() async {
        let (sut, service) = makeSUT()
        sut.start()
        await sut.refreshTask?.value
        service.selectInputResult = .failure(CallAudioRouteError.inputUnavailable)

        sut.selectInput(id: "bt")
        await sut.selectionTask?.value

        XCTAssertEqual(sut.state.selectedInputId, "mic")
    }

    func test_stop_ignoresLaterRouteChanges() async {
        let (sut, service) = makeSUT()
        sut.start()
        await sut.refreshTask?.value
        sut.stop()
        service.currentRouteResult = CallAudioRouteState(inputs: [iphoneMic], selectedInputId: "mic", output: airpods)

        service.routeChangeSubject.send(())
        await sut.refreshTask?.value

        XCTAssertEqual(sut.state.output, receiver)
    }

    func test_viewModel_isReleasedWhileListening() {
        let service = MockCallAudioRouteService()
        weak var released: CallAudioRouteViewModel?

        do {
            let sut = CallAudioRouteViewModel(service: service)
            sut.start()
            released = sut
        }

        XCTAssertNil(released)
    }
}
