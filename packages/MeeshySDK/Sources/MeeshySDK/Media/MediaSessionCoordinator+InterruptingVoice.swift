#if os(iOS)
import AVFoundation
import Foundation
import os

private let voiceLogger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

/// La voix du talkie (#16673, #18820) : elle INTERROMPT ce qu'on écoutait —
/// les lecteurs Meeshy par les événements de la session, les autres apps par
/// une catégorie qui ne se mélange pas — puis le rend. Sur `sessionQueue`, à
/// son rang (#17038). La loi : `InterruptingVoiceSessionLaw`.
extension MediaSessionCoordinator {

    /// Pose la catégorie de la loi (sans mélange), puis active la session.
    /// Pendant un appel ou un enregistrement, la session n'est pas touchée.
    public nonisolated func activateInterruptingVoicePlayback() {
        onSessionQueue { [self] in
            guard InterruptingVoiceSessionLaw.mayManageSession(
                callActive: isCallActive, recordingHoldsSession: recordingHoldsSession
            ) else { return }
            if let plan = InterruptingVoiceSessionLaw.activation(
                category: audioSession.category,
                options: audioSession.categoryOptions,
                otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying
            ) {
                do {
                    try audioSession.setCategory(plan.category, mode: .default, options: plan.options)
                } catch {
                    voiceLogger.error("activateInterruptingVoicePlayback: setCategory failed — \(error.localizedDescription, privacy: .public)")
                }
            }
            do {
                try audioSession.setActive(true, options: InterruptingVoiceSessionLaw.activationOptions)
            } catch {
                voiceLogger.error("activateInterruptingVoicePlayback: setActive failed — \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Le micro s'arrête pendant que la voix sonne (#20579) : la session quitte
    /// `.playAndRecord` pour la catégorie que la voix aurait prise seule, à son
    /// rang, après que l'enregistrement l'a lâchée. Une session qu'un autre
    /// composant a reprise entre-temps n'est pas touchée.
    nonisolated func returnToInterruptingVoicePlayback() {
        onSessionQueue { [self] in
            guard InterruptingVoiceSessionLaw.mayManageSession(
                callActive: isCallActive, recordingHoldsSession: recordingHoldsSession
            ), RecordingSessionLaw.mayReleaseSession(currentCategory: audioSession.category) else { return }
            let plan = InterruptingVoiceSessionLaw.afterRecording(
                otherAudioPlaying: AVAudioSession.sharedInstance().isOtherAudioPlaying
            )
            do {
                try audioSession.setCategory(plan.category, mode: .default, options: plan.options)
                try audioSession.setActive(true, options: InterruptingVoiceSessionLaw.activationOptions)
            } catch {
                voiceLogger.error("returnToInterruptingVoicePlayback failed — \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Rend la session en prévenant les autres apps, qui reprennent.
    public nonisolated func releaseInterruptingVoicePlayback() {
        onSessionQueue { [self] in
            guard InterruptingVoiceSessionLaw.mayManageSession(
                callActive: isCallActive, recordingHoldsSession: recordingHoldsSession
            ) else { return }
            do {
                try audioSession.setActive(false, options: InterruptingVoiceSessionLaw.deactivationOptions)
            } catch {
                voiceLogger.error("releaseInterruptingVoicePlayback failed — \(error.localizedDescription, privacy: .public)")
            }
        }
    }

    /// Les lecteurs Meeshy (vocal, vidéo, réel, story, aperçu) reçoivent le
    /// signal d'une interruption : ceux qui jouent se mettent en pause, marqués
    /// « interrompus » (`InterruptionResumeLedger`).
    public nonisolated func interruptMeeshyPlayback() {
        emit(.interruptionBegan)
    }

    /// Fin de l'interruption : chaque lecteur interrompu reprend, sauf si
    /// l'utilisateur l'a mis en pause entre-temps.
    public nonisolated func resumeMeeshyPlayback() {
        emit(.interruptionEndedShouldResume)
    }

    /// Le réveil PushToTalk du talkie (#17143) : le système n'active la session
    /// — et n'appelle `didActivate` — que si elle est en `.playAndRecord`. Le
    /// délégué du framework l'appelle hors du fil principal, avant de rendre
    /// son résultat : il attend alors la pose sur la file, pour que la
    /// catégorie soit en place quand le système lève la session. Depuis le fil
    /// principal, la pose se met en file sans l'attendre (#17038). Pendant un
    /// appel, la session appartient à l'appel et n'est pas touchée.
    public nonisolated func preparePushToTalkPlayAndRecord() {
        let work: @Sendable () -> Void = { [self] in
            guard Self.shouldManageSession(callActive: isCallActive) else { return }
            let configuration = Self.pushToTalkConfiguration
            guard Self.recordingConfigurationDiffers(
                currentCategory: audioSession.category, currentMode: audioSession.mode,
                currentOptions: audioSession.categoryOptions, configuration: configuration
            ) else { return }
            do {
                try audioSession.setCategory(configuration.category, mode: configuration.mode, options: configuration.options)
            } catch {
                voiceLogger.error("preparePushToTalkPlayAndRecord failed — \(error.localizedDescription, privacy: .public)")
            }
        }
        if Thread.isMainThread {
            onSessionQueue(work)
        } else {
            sessionQueue.sync(execute: work)
        }
    }

    nonisolated static let pushToTalkConfiguration = RecordingSessionConfiguration(
        category: .playAndRecord, mode: .default, options: [.defaultToSpeaker, .allowBluetoothHFP]
    )
}
#endif
