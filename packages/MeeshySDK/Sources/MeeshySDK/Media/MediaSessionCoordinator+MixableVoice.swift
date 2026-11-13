#if os(iOS)
import AVFoundation
import Foundation
import os

private let mixableLogger = MeeshyLog.logger(.audioSession, subsystem: .legacySDK)

/// La voix du talkie (#16673) : elle respecte le bouton silencieux et se mêle
/// aux sons des autres apps. Sur `sessionQueue`, à son rang (#17038).
extension MediaSessionCoordinator {

    /// `.ambient` quand rien d'autre ne joue dans l'app (catégorie par défaut),
    /// sinon la catégorie en place est gardée ; puis la session s'active.
    public nonisolated func activateMixableVoicePlayback() {
        onSessionQueue { [self] in
            if audioSession.category == .soloAmbient {
                do {
                    try audioSession.setCategory(.ambient, mode: .default, options: [])
                } catch {
                    mixableLogger.error("activateMixableVoicePlayback: setCategory failed — \(error.localizedDescription, privacy: .public)")
                }
            }
            do {
                try audioSession.setActive(true, options: [])
            } catch {
                mixableLogger.error("activateMixableVoicePlayback: setActive failed — \(error.localizedDescription, privacy: .public)")
            }
        }
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
                mixableLogger.error("preparePushToTalkPlayAndRecord failed — \(error.localizedDescription, privacy: .public)")
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

    /// Rend la session si elle est restée `.ambient` : ce qui a pris une autre
    /// catégorie depuis la garde.
    public nonisolated func releaseMixableVoicePlayback() {
        onSessionQueue { [self] in
            guard audioSession.category == .ambient else { return }
            do {
                try audioSession.setActive(false, options: .notifyOthersOnDeactivation)
            } catch {
                mixableLogger.error("releaseMixableVoicePlayback failed — \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}
#endif
