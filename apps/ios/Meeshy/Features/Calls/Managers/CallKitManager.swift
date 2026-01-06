//
//  CallKitManager.swift
//  Meeshy
//
//  Created by Claude on 2025-11-22.
//

import Foundation
import CallKit
import AVFoundation
import UIKit

final class CallKitManager: NSObject {
    nonisolated(unsafe) static let shared = CallKitManager()

    private let callController = CXCallController()
    private let provider: CXProvider

    private var currentCallUUID: UUID?
    private var callCompletionHandlers: [UUID: () -> Void] = [:]

    // Callbacks
    var onAnswerCall: ((UUID) -> Void)?
    var onEndCall: ((UUID) -> Void)?
    var onSetMuted: ((UUID, Bool) -> Void)?
    var onSetHeld: ((UUID, Bool) -> Void)?

    private override init() {
        let configuration = CXProviderConfiguration()
        configuration.supportsVideo = true
        configuration.maximumCallsPerCallGroup = 1
        configuration.supportedHandleTypes = [.generic]

        if let iconImage = UIImage(named: "AppIcon") {
            configuration.iconTemplateImageData = iconImage.pngData()
        }

        configuration.ringtoneSound = "ringtone.caf"

        // iOS 16+ supports call directory
        if #available(iOS 16.0, *) {
            configuration.includesCallsInRecents = true
        }

        provider = CXProvider(configuration: configuration)
        super.init()

        provider.setDelegate(self, queue: nil)
    }

    // MARK: - Report Incoming Call

    func reportIncomingCall(
        uuid: UUID,
        handle: String,
        hasVideo: Bool,
        completion: @escaping (Error?) -> Void
    ) {
        let update = CXCallUpdate()
        update.remoteHandle = CXHandle(type: .generic, value: handle)
        update.hasVideo = hasVideo
        update.localizedCallerName = handle

        provider.reportNewIncomingCall(with: uuid, update: update) { error in
            if let error = error {
                print("Failed to report incoming call: \(error.localizedDescription)")
                completion(error)
            } else {
                print("Successfully reported incoming call: \(uuid)")
                self.currentCallUUID = uuid
                completion(nil)
            }
        }
    }

    // MARK: - Start Outgoing Call

    func startCall(uuid: UUID, handle: String, hasVideo: Bool) {
        currentCallUUID = uuid

        let handle = CXHandle(type: .generic, value: handle)
        let startCallAction = CXStartCallAction(call: uuid, handle: handle)
        startCallAction.isVideo = hasVideo

        let transaction = CXTransaction(action: startCallAction)

        callController.request(transaction) { error in
            if let error = error {
                print("Failed to start call: \(error.localizedDescription)")
            } else {
                print("Successfully started call: \(uuid)")
            }
        }
    }

    // MARK: - Answer Call

    func answerCall(uuid: UUID) {
        let answerAction = CXAnswerCallAction(call: uuid)
        let transaction = CXTransaction(action: answerAction)

        callController.request(transaction) { error in
            if let error = error {
                print("Failed to answer call: \(error.localizedDescription)")
            } else {
                print("Successfully answered call: \(uuid)")
            }
        }
    }

    // MARK: - End Call

    func endCall(uuid: UUID, completion: (() -> Void)? = nil) {
        let endCallAction = CXEndCallAction(call: uuid)
        let transaction = CXTransaction(action: endCallAction)

        if let completion = completion {
            callCompletionHandlers[uuid] = completion
        }

        callController.request(transaction) { error in
            if let error = error {
                print("Failed to end call: \(error.localizedDescription)")
                self.callCompletionHandlers.removeValue(forKey: uuid)
                completion?()
            } else {
                print("Successfully ended call: \(uuid)")
            }
        }
    }

    // MARK: - Decline Call

    func declineCall(uuid: UUID) {
        endCall(uuid: uuid)
    }

    // MARK: - Set Muted

    func setMuted(uuid: UUID, isMuted: Bool) {
        let muteAction = CXSetMutedCallAction(call: uuid, muted: isMuted)
        let transaction = CXTransaction(action: muteAction)

        callController.request(transaction) { error in
            if let error = error {
                print("Failed to set muted: \(error.localizedDescription)")
            } else {
                print("Successfully set muted to \(isMuted)")
            }
        }
    }

    // MARK: - Set Held

    func setHeld(uuid: UUID, onHold: Bool) {
        let holdAction = CXSetHeldCallAction(call: uuid, onHold: onHold)
        let transaction = CXTransaction(action: holdAction)

        callController.request(transaction) { error in
            if let error = error {
                print("Failed to set held: \(error.localizedDescription)")
            } else {
                print("Successfully set held to \(onHold)")
            }
        }
    }

    // MARK: - Update Call

    func updateCall(uuid: UUID, hasVideo: Bool) {
        let update = CXCallUpdate()
        update.hasVideo = hasVideo
        provider.reportCall(with: uuid, updated: update)
    }

    // MARK: - Report Call Ended

    func reportCallEnded(uuid: UUID, reason: CXCallEndedReason) {
        provider.reportCall(with: uuid, endedAt: Date(), reason: reason)
        currentCallUUID = nil

        if let completion = callCompletionHandlers.removeValue(forKey: uuid) {
            completion()
        }
    }

    // MARK: - Audio Session

    func configureAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setCategory(.playAndRecord, mode: .voiceChat, options: [])
            try audioSession.setActive(true)
        } catch {
            print("Failed to configure audio session: \(error.localizedDescription)")
        }
    }

    func deactivateAudioSession() {
        let audioSession = AVAudioSession.sharedInstance()
        do {
            try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
        } catch {
            print("Failed to deactivate audio session: \(error.localizedDescription)")
        }
    }
}

// MARK: - CXProviderDelegate

extension CallKitManager: CXProviderDelegate {
    func providerDidReset(_ provider: CXProvider) {
        print("Provider did reset")
        currentCallUUID = nil
        callCompletionHandlers.removeAll()
        onEndCall?(UUID())
    }

    func provider(_ provider: CXProvider, perform action: CXStartCallAction) {
        print("Perform start call action")

        configureAudioSession()

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXAnswerCallAction) {
        print("Perform answer call action")

        configureAudioSession()

        onAnswerCall?(action.callUUID)

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXEndCallAction) {
        print("Perform end call action")

        onEndCall?(action.callUUID)

        deactivateAudioSession()

        action.fulfill()

        if let completion = callCompletionHandlers.removeValue(forKey: action.callUUID) {
            completion()
        }
    }

    func provider(_ provider: CXProvider, perform action: CXSetMutedCallAction) {
        print("Perform set muted action: \(action.isMuted)")

        onSetMuted?(action.callUUID, action.isMuted)

        action.fulfill()
    }

    func provider(_ provider: CXProvider, perform action: CXSetHeldCallAction) {
        print("Perform set held action: \(action.isOnHold)")

        onSetHeld?(action.callUUID, action.isOnHold)

        action.fulfill()
    }

    func provider(_ provider: CXProvider, didActivate audioSession: AVAudioSession) {
        print("Audio session activated")
        // Start audio processing here
    }

    func provider(_ provider: CXProvider, didDeactivate audioSession: AVAudioSession) {
        print("Audio session deactivated")
        // Stop audio processing here
    }

    func provider(_ provider: CXProvider, timedOutPerforming action: CXAction) {
        print("Action timed out: \(action)")
        action.fail()
    }
}
