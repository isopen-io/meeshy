import Combine
import Foundation
import os

extension MessageSocketRoutes {

    static func calls(_ m: MessageSocketManager) -> [SocketInboundRoute] {
        [
            .raw(.callSignal) { [weak m] data in m?.routeCallSignal(data) },
            m.route(.callEnded, CallEndData.self) { manager, event in
                // Le rejeu (apparié par callId) est inerte une fois l'appel fini ; on libère quand même
                // l'événement tamponné pour ne pas retenir le dernier participant à vie.
                manager.lastCallParticipantJoined = nil
                manager.callEnded.send(event)
            },
            // L'appelant n'abonne `callParticipantJoined` qu'APRÈS l'ACK de `call:initiate` ; si l'appelé était déjà
            // dans la room, l'événement part AVANT l'abonnement et un `PassthroughSubject` ne rejoue pas : on tamponne
            // le dernier, que l'écouteur rejoue par callId.
            m.route(.callParticipantJoined, CallParticipantData.self) { manager, event in
                manager.lastCallParticipantJoined = event
                manager.callParticipantJoined.send(event)
            },
            m.route(.callInitiated, CallOfferData.self) { $0.callOfferReceived.send($1) },
            m.route(.callMissed, CallMissedData.self) { $0.callMissed.send($1) },
            m.route(.callAlreadyAnswered, CallAlreadyAnsweredData.self) { $0.callAlreadyAnswered.send($1) },
            m.route(.callParticipantLeft, CallParticipantData.self) { $0.callParticipantLeft.send($1) },
            m.route(.callMediaToggled, CallMediaToggleData.self) { $0.callMediaToggled.send($1) },
            m.route(.callError, CallErrorData.self) { $0.callError.send($1) },
            m.route(.callIceServersRefreshed, CallIceServersRefreshedData.self) { $0.callIceServersRefreshed.send($1) },
            m.route(.callQualityAlert, CallQualityAlertData.self) { $0.callQualityAlert.send($1) },
            m.route(.callScreenCaptureAlert, CallScreenCaptureAlertData.self) { $0.callScreenCaptureAlert.send($1) },
            m.route(.callForceLeave, CallForcedLeaveData.self) { $0.callForcedLeave.send($1) },
            m.route(.callTranslatedSegment, CallTranslatedSegmentData.self) { $0.callTranslatedSegmentReceived.send($1) },
            m.route(.callTranscriptionActive, CallTranscriptionActiveData.self) { $0.callTranscriptionActiveReceived.send($1) },
        ]
    }
}

extension MessageSocketManager {

    func routeCallSignal(_ data: [Any]) {
        guard let first = data.first as? [String: Any],
              let signal = first["signal"] as? [String: Any],
              let signalType = signal["type"] as? String else { return }

        switch signalType {
        case "offer":
            decode(CallAnswerData.self, from: data) { [weak self] in self?.callSignalOfferReceived.send($0) }
        case "answer":
            decode(CallAnswerData.self, from: data) { [weak self] in self?.callAnswerReceived.send($0) }
        case "ice-candidate":
            decode(CallICECandidateData.self, from: data) { [weak self] in self?.callICECandidateReceived.send($0) }
        default:
            Logger.socket.info("Unknown call signal type: \(signalType)")
        }
    }
}
