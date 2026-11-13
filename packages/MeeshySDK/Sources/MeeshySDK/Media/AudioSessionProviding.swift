#if os(iOS)
import AVFoundation
import Foundation

/// Ce que `MediaSessionCoordinator` demande à la session audio partagée
/// (#17038). Chaque écriture est un aller-retour SYNCHRONE vers le serveur
/// audio : le coordinateur ne les appelle que depuis sa file série, jamais
/// depuis le fil principal.
public protocol AudioSessionProviding: AnyObject, Sendable {
    var category: AVAudioSession.Category { get }
    var mode: AVAudioSession.Mode { get }
    var categoryOptions: AVAudioSession.CategoryOptions { get }
    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws
    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws
}

/// La session réelle de l'app.
final class SystemAudioSession: AudioSessionProviding {
    private var session: AVAudioSession { AVAudioSession.sharedInstance() }

    var category: AVAudioSession.Category { session.category }
    var mode: AVAudioSession.Mode { session.mode }
    var categoryOptions: AVAudioSession.CategoryOptions { session.categoryOptions }

    func setCategory(
        _ category: AVAudioSession.Category,
        mode: AVAudioSession.Mode,
        options: AVAudioSession.CategoryOptions
    ) throws {
        try session.setCategory(category, mode: mode, options: options)
    }

    func setActive(_ active: Bool, options: AVAudioSession.SetActiveOptions) throws {
        try session.setActive(active, options: options)
    }
}
#endif
