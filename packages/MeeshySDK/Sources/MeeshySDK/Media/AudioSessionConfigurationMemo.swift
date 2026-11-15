#if os(iOS)
import AVFoundation
import Foundation
import os

/// La catégorie, le mode et les options d'une session audio.
public nonisolated struct AudioSessionConfiguration: Equatable, Sendable {
    public let category: AVAudioSession.Category
    public let mode: AVAudioSession.Mode
    public let options: AVAudioSession.CategoryOptions

    public init(category: AVAudioSession.Category, mode: AVAudioSession.Mode, options: AVAudioSession.CategoryOptions) {
        self.category = category
        self.mode = mode
        self.options = options
    }
}

/// **La configuration de session que le coordinateur connaît** (#18511).
/// Relire la session est un aller-retour synchrone vers le serveur audio
/// (`-[AVAudioSession categoryOptions]` : 0,51 s relevé sur le fil principal au
/// changement de story). La mémoire s'écrit aux écritures et aux lectures faites
/// sur la file de session, et s'oublie aux interruptions, aux changements de
/// route et aux appels ; un appelant ne lit qu'elle, jamais la session.
nonisolated final class AudioSessionConfigurationMemo: Sendable {
    private let state = OSAllocatedUnfairLock<AudioSessionConfiguration?>(initialState: nil)

    var known: AudioSessionConfiguration? { state.withLock { $0 } }

    func record(_ configuration: AudioSessionConfiguration) {
        state.withLock { $0 = configuration }
    }

    func invalidate() {
        state.withLock { $0 = nil }
    }
}

/// La session du coordinateur : chaque écriture de catégorie réussie devient
/// la configuration connue, un échec l'oublie.
nonisolated final class MemoizingAudioSession: AudioSessionProviding {
    private let base: any AudioSessionProviding
    let memo: AudioSessionConfigurationMemo

    init(base: any AudioSessionProviding, memo: AudioSessionConfigurationMemo) {
        self.base = base
        self.memo = memo
    }

    var category: AVAudioSession.Category { base.category }
    var mode: AVAudioSession.Mode { base.mode }
    var categoryOptions: AVAudioSession.CategoryOptions { base.categoryOptions }

    /// Lit la session et la retient — sur la file de session seulement.
    func readConfiguration() -> AudioSessionConfiguration {
        let configuration = AudioSessionConfiguration(category: base.category, mode: base.mode, options: base.categoryOptions)
        memo.record(configuration)
        return configuration
    }

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        do {
            try base.setCategory(category, mode: mode, options: options)
            memo.record(AudioSessionConfiguration(category: category, mode: mode, options: options))
        } catch {
            memo.invalidate()
            throw error
        }
    }

    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {
        try base.setActive(active, options: options)
    }
}
#endif
