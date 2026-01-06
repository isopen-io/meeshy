//
//  AudioSessionManager.swift
//  Meeshy
//
//  Complete audio session management for VoIP calls
//  Handles audio routing, Bluetooth, speaker, and interruptions
//

import Foundation
import AVFoundation
import CallKit

// MARK: - Audio Route

enum AudioRoute {
    case speaker
    case earpiece
    case bluetooth
    case headphones
    case carPlay
    case airPods

    var displayName: String {
        switch self {
        case .speaker: return "Speaker"
        case .earpiece: return "iPhone"
        case .bluetooth: return "Bluetooth"
        case .headphones: return "Headphones"
        case .carPlay: return "CarPlay"
        case .airPods: return "AirPods"
        }
    }

    var iconName: String {
        switch self {
        case .speaker: return "speaker.wave.3.fill"
        case .earpiece: return "iphone"
        case .bluetooth: return "beats.headphones"
        case .headphones: return "headphones"
        case .carPlay: return "car.fill"
        case .airPods: return "airpodspro"
        }
    }
}

// MARK: - Audio Session Delegate

@MainActor
protocol AudioSessionManagerDelegate: AnyObject {
    func audioSessionManager(_ manager: AudioSessionManager, didChangeRoute route: AudioRoute)
    func audioSessionManager(_ manager: AudioSessionManager, didInterruptWithReason reason: AVAudioSession.InterruptionType)
    func audioSessionManager(_ manager: AudioSessionManager, didEncounterError error: Error)
}

// MARK: - Audio Session Manager

@MainActor
final class AudioSessionManager: NSObject, ObservableObject {

    // MARK: - Singleton

    static let shared = AudioSessionManager()

    // MARK: - Published Properties

    @Published private(set) var currentRoute: AudioRoute = .earpiece
    @Published private(set) var availableRoutes: [AudioRoute] = [.earpiece, .speaker]
    @Published private(set) var isSpeakerEnabled: Bool = false
    @Published private(set) var isBluetoothConnected: Bool = false
    @Published private(set) var isHeadphonesConnected: Bool = false

    // MARK: - Properties

    weak var delegate: AudioSessionManagerDelegate?

    private let audioSession = AVAudioSession.sharedInstance()
    private let audioQueue = DispatchQueue(label: "com.meeshy.audio")

    private var isConfigured = false
    private var savedCategory: AVAudioSession.Category?
    private var savedMode: AVAudioSession.Mode?

    // MARK: - Initialization

    override private init() {
        super.init()
        setupNotifications()
        updateAvailableRoutes()
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: - Setup

    private func setupNotifications() {
        // Route change
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleRouteChange),
            name: AVAudioSession.routeChangeNotification,
            object: audioSession
        )

        // Interruption
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleInterruption),
            name: AVAudioSession.interruptionNotification,
            object: audioSession
        )

        // Media services reset
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleMediaServicesReset),
            name: AVAudioSession.mediaServicesWereResetNotification,
            object: audioSession
        )

        // Silence secondary audio hint
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(handleSilenceSecondaryAudioHint),
            name: AVAudioSession.silenceSecondaryAudioHintNotification,
            object: audioSession
        )

        callLogger.info("AudioSessionManager notifications configured")
    }

    // MARK: - Configuration

    func configureForVoIPCall() {
        audioQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                // Save current configuration
                Task { @MainActor in
                    self.savedCategory = self.audioSession.category
                    self.savedMode = self.audioSession.mode
                }

                // Configure for VoIP
                try self.audioSession.setCategory(
                    .playAndRecord,
                    mode: .voiceChat,
                    options: [
                        .allowBluetooth,
                        .allowBluetoothA2DP,
                        .defaultToSpeaker,
                        .mixWithOthers
                    ]
                )

                // Set preferred sample rate
                try self.audioSession.setPreferredSampleRate(48000)

                // Set preferred IO buffer duration (lower latency)
                try self.audioSession.setPreferredIOBufferDuration(0.01) // 10ms

                // Activate audio session
                try self.audioSession.setActive(true, options: [])

                Task { @MainActor in
                    self.isConfigured = true
                    self.updateAvailableRoutes()
                    self.updateCurrentRoute()
                }

                callLogger.info("Audio session configured for VoIP")

            } catch {
                callLogger.error("Failed to configure audio session: \(error.localizedDescription)")
                Task { @MainActor in
                    self.delegate?.audioSessionManager(self, didEncounterError: error)
                }
            }
        }
    }

    func configureForVideoCall() {
        audioQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                // Save current configuration
                Task { @MainActor in
                    self.savedCategory = self.audioSession.category
                    self.savedMode = self.audioSession.mode
                }

                // Configure for video
                try self.audioSession.setCategory(
                    .playAndRecord,
                    mode: .videoChat,
                    options: [
                        .allowBluetooth,
                        .allowBluetoothA2DP,
                        .defaultToSpeaker
                    ]
                )

                // Set preferred sample rate
                try self.audioSession.setPreferredSampleRate(48000)

                // Set preferred IO buffer duration
                try self.audioSession.setPreferredIOBufferDuration(0.01)

                // Activate audio session
                try self.audioSession.setActive(true, options: [])

                Task { @MainActor in
                    self.isConfigured = true
                    self.isSpeakerEnabled = true // Video calls default to speaker
                    self.updateAvailableRoutes()
                    self.updateCurrentRoute()
                }

                callLogger.info("Audio session configured for video")

            } catch {
                callLogger.error("Failed to configure audio session: \(error.localizedDescription)")
                Task { @MainActor in
                    self.delegate?.audioSessionManager(self, didEncounterError: error)
                }
            }
        }
    }

    func deactivate() {
        audioQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                try self.audioSession.setActive(false, options: .notifyOthersOnDeactivation)

                // Restore previous configuration if available
                if let savedCategory = self.savedCategory, let savedMode = self.savedMode {
                    try self.audioSession.setCategory(savedCategory, mode: savedMode)
                }

                Task { @MainActor in
                    self.isConfigured = false
                    self.isSpeakerEnabled = false
                }

                callLogger.info("Audio session deactivated")

            } catch {
                callLogger.error("Failed to deactivate audio session: \(error.localizedDescription)")
            }
        }
    }

    // MARK: - Audio Routing

    func toggleSpeaker() {
        let speakerEnabled = !isSpeakerEnabled
        isSpeakerEnabled = speakerEnabled

        audioQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                if speakerEnabled {
                    try self.audioSession.overrideOutputAudioPort(.speaker)
                } else {
                    try self.audioSession.overrideOutputAudioPort(.none)
                }

                Task { @MainActor in
                    self.updateCurrentRoute()
                }

                callLogger.info("Speaker toggled: \(speakerEnabled)")

            } catch {
                callLogger.error("Failed to toggle speaker: \(error.localizedDescription)")
                Task { @MainActor in
                    self.delegate?.audioSessionManager(self, didEncounterError: error)
                }
            }
        }
    }

    func setRoute(_ route: AudioRoute) {
        audioQueue.async { [weak self] in
            guard let self = self else { return }

            do {
                switch route {
                case .speaker:
                    try self.audioSession.overrideOutputAudioPort(.speaker)
                    Task { @MainActor in
                        self.isSpeakerEnabled = true
                    }

                case .earpiece:
                    try self.audioSession.overrideOutputAudioPort(.none)
                    Task { @MainActor in
                        self.isSpeakerEnabled = false
                    }

                case .bluetooth, .headphones, .airPods, .carPlay:
                    // These are automatically selected by the system
                    try self.audioSession.overrideOutputAudioPort(.none)
                    Task { @MainActor in
                        self.isSpeakerEnabled = false
                    }
                }

                Task { @MainActor in
                    self.currentRoute = route
                    self.delegate?.audioSessionManager(self, didChangeRoute: route)
                }

                callLogger.info("Audio route set to: \(route.displayName)")

            } catch {
                callLogger.error("Failed to set audio route: \(error.localizedDescription)")
                Task { @MainActor in
                    self.delegate?.audioSessionManager(self, didEncounterError: error)
                }
            }
        }
    }

    // MARK: - Route Updates

    private func updateAvailableRoutes() {
        var routes: [AudioRoute] = [.earpiece, .speaker]

        let currentRoute = audioSession.currentRoute

        // Check for Bluetooth
        let bluetoothRoutes = currentRoute.outputs.filter {
            $0.portType == .bluetoothA2DP ||
            $0.portType == .bluetoothHFP ||
            $0.portType == .bluetoothLE
        }

        if !bluetoothRoutes.isEmpty {
            isBluetoothConnected = true

            // Check for AirPods
            if let portName = bluetoothRoutes.first?.portName,
               portName.lowercased().contains("airpods") {
                routes.append(.airPods)
            } else {
                routes.append(.bluetooth)
            }
        } else {
            isBluetoothConnected = false
        }

        // Check for headphones
        let headphoneRoutes = currentRoute.outputs.filter {
            $0.portType == .headphones ||
            $0.portType == .headsetMic
        }

        if !headphoneRoutes.isEmpty {
            routes.append(.headphones)
            isHeadphonesConnected = true
        } else {
            isHeadphonesConnected = false
        }

        // Check for CarPlay
        let carPlayRoutes = currentRoute.outputs.filter {
            $0.portType == .carAudio
        }

        if !carPlayRoutes.isEmpty {
            routes.append(.carPlay)
        }

        availableRoutes = routes

        callLogger.debug("Available audio routes updated: \(routes.map { $0.displayName })")
    }

    private func updateCurrentRoute() {
        let route = audioSession.currentRoute
        guard let output = route.outputs.first else { return }

        let newRoute: AudioRoute

        switch output.portType {
        case .builtInSpeaker:
            newRoute = .speaker

        case .builtInReceiver:
            newRoute = .earpiece

        case .bluetoothA2DP, .bluetoothHFP, .bluetoothLE:
            if output.portName.lowercased().contains("airpods") {
                newRoute = .airPods
            } else {
                newRoute = .bluetooth
            }

        case .headphones, .headsetMic:
            newRoute = .headphones

        case .carAudio:
            newRoute = .carPlay

        default:
            newRoute = .earpiece
        }

        if currentRoute != newRoute {
            currentRoute = newRoute
            delegate?.audioSessionManager(self, didChangeRoute: newRoute)
            callLogger.info("Current audio route: \(newRoute.displayName)")
        }
    }

    // MARK: - Notification Handlers

    @objc private func handleRouteChange(_ notification: Notification) {
        Task { @MainActor in
            guard let userInfo = notification.userInfo,
                  let reasonValue = userInfo[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: reasonValue) else {
                return
            }

            callLogger.info("Audio route changed: \(reason)")

            switch reason {
            case .newDeviceAvailable:
                callLogger.info("New audio device available")

            case .oldDeviceUnavailable:
                callLogger.info("Audio device unavailable")
                // If Bluetooth disconnects, fall back to speaker or earpiece
                if !isBluetoothConnected && !isHeadphonesConnected {
                    if isSpeakerEnabled {
                        setRoute(.speaker)
                    } else {
                        setRoute(.earpiece)
                    }
                }

            case .categoryChange:
                callLogger.debug("Audio category changed")

            case .override:
                callLogger.debug("Audio route overridden")

            case .wakeFromSleep:
                callLogger.debug("Audio session wake from sleep")

            case .noSuitableRouteForCategory:
                callLogger.warn("No suitable route for category")

            case .routeConfigurationChange:
                callLogger.debug("Route configuration changed")

            @unknown default:
                callLogger.warn("Unknown route change reason")
            }

            updateAvailableRoutes()
            updateCurrentRoute()
        }
    }

    @objc private func handleInterruption(_ notification: Notification) {
        Task { @MainActor in
            guard let userInfo = notification.userInfo,
                  let typeValue = userInfo[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: typeValue) else {
                return
            }

            callLogger.info("Audio interruption: \(type == .began ? "began" : "ended")")

            switch type {
            case .began:
                // Audio session interrupted (e.g., phone call)
                delegate?.audioSessionManager(self, didInterruptWithReason: .began)

            case .ended:
                // Audio session interruption ended
                guard let optionsValue = userInfo[AVAudioSessionInterruptionOptionKey] as? UInt else {
                    return
                }

                let options = AVAudioSession.InterruptionOptions(rawValue: optionsValue)

                if options.contains(.shouldResume) {
                    // Resume audio session
                    audioQueue.async { [weak self] in
                        guard let self = self else { return }
                        do {
                            try self.audioSession.setActive(true)
                            callLogger.info("Audio session resumed after interruption")
                        } catch {
                            callLogger.error("Failed to resume audio session: \(error.localizedDescription)")
                        }
                    }
                }

                delegate?.audioSessionManager(self, didInterruptWithReason: .ended)

            @unknown default:
                callLogger.warn("Unknown interruption type")
            }
        }
    }

    @objc private func handleMediaServicesReset(_ notification: Notification) {
        Task { @MainActor in
            callLogger.warn("Media services were reset - reconfiguring audio session")

            // Reconfigure audio session
            if isConfigured {
                configureForVoIPCall()
            }
        }
    }

    @objc private func handleSilenceSecondaryAudioHint(_ notification: Notification) {
        Task { @MainActor in
            guard let userInfo = notification.userInfo,
                  let typeValue = userInfo[AVAudioSessionSilenceSecondaryAudioHintTypeKey] as? UInt,
                  let type = AVAudioSession.SilenceSecondaryAudioHintType(rawValue: typeValue) else {
                return
            }

            callLogger.debug("Silence secondary audio hint: \(type == .begin ? "begin" : "end")")
        }
    }

    // MARK: - Audio Info

    func getAudioSessionInfo() -> [String: Any] {
        return [
            "category": audioSession.category.rawValue,
            "mode": audioSession.mode.rawValue,
            "sampleRate": audioSession.sampleRate,
            "ioBufferDuration": audioSession.ioBufferDuration,
            "inputLatency": audioSession.inputLatency,
            "outputLatency": audioSession.outputLatency,
            "inputNumberOfChannels": audioSession.inputNumberOfChannels,
            "outputNumberOfChannels": audioSession.outputNumberOfChannels,
            "currentRoute": currentRoute.displayName,
            "availableRoutes": availableRoutes.map { $0.displayName }
        ]
    }

    func logAudioSessionInfo() {
        let info = getAudioSessionInfo()
        callLogger.debug("Audio Session Info:")
        for (key, value) in info {
            callLogger.debug("  \(key): \(value)")
        }
    }
}

// MARK: - AVAudioSession.RouteChangeReason Extension

extension AVAudioSession.RouteChangeReason: CustomStringConvertible {
    public var description: String {
        switch self {
        case .unknown: return "unknown"
        case .newDeviceAvailable: return "newDeviceAvailable"
        case .oldDeviceUnavailable: return "oldDeviceUnavailable"
        case .categoryChange: return "categoryChange"
        case .override: return "override"
        case .wakeFromSleep: return "wakeFromSleep"
        case .noSuitableRouteForCategory: return "noSuitableRouteForCategory"
        case .routeConfigurationChange: return "routeConfigurationChange"
        @unknown default: return "unknown(\(rawValue))"
        }
    }
}
