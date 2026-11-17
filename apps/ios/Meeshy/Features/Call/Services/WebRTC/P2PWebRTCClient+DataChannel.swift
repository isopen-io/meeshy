import Foundation
import AVFoundation
import os

#if canImport(WebRTC)
@preconcurrency import WebRTC
import MeeshySDK

extension P2PWebRTCClient {

    func createDataChannel(label: String) -> Bool {
        // Idempotent : les re-négociations (ICE restart, escalade vidéo)
        // repassent par createOffer — ne jamais empiler un second channel
        // sur la même peer connection.
        if transcriptionDataChannel != nil { return true }
        guard let pc = peerConnection else { return false }
        let config = RTCDataChannelConfiguration()
        config.isOrdered = true
        guard let channel = pc.dataChannel(forLabel: label, configuration: config) else {
            Logger.webrtc.error("Failed to create DataChannel: \(label)")
            return false
        }
        channel.delegate = self
        transcriptionDataChannel = channel
        Logger.webrtc.info("DataChannel created: \(label)")
        return true
    }

    func sendDataChannelMessage(_ data: Data) {
        guard let channel = transcriptionDataChannel, channel.readyState == .open else { return }
        let buffer = RTCDataBuffer(data: data, isBinary: false)
        channel.sendData(buffer)
    }

    func sendDTMF(digits: String) {
        guard let sender = audioTransceiver?.sender.dtmfSender, sender.canInsertDtmf else {
            Logger.webrtc.warning("DTMF unavailable — no DTMF sender or not established")
            return
        }
        sender.insertDtmf(digits, duration: 100, interToneGap: 70)
        // Never log DTMF digits: they carry conference PINs, voicemail
        // passwords, and IVR/banking security codes typed on the in-call keypad.
        Logger.webrtc.info("DTMF: sending \(digits.count) digit(s)")
    }

    func startDataChannelPing() {
        stopDataChannelPing()
        // @MainActor: keeps every transcriptionDataChannel read/send serialized with
        // disconnect()'s synchronous teardown of the same property (see toggleVideo).
        dataChannelPingTask = Task { @MainActor [weak self] in
            while !Task.isCancelled {
                guard await cancellableSleep(for: .seconds(QualityThresholds.dataChannelPingIntervalSeconds)), !Task.isCancelled, let self else { break }
                self.sendDataChannelMessage(Data("{\"type\":\"ping\"}".utf8))
            }
        }
    }

    func stopDataChannelPing() {
        dataChannelPingTask?.cancel()
        dataChannelPingTask = nil
    }
}

#endif
