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
