import AVFoundation

/// Coordonne l'accès à AVAudioSession entre tous les composants audio.
/// Actor = thread-safe garanti à la compilation.
public actor MediaSessionCoordinator {

    public static let shared = MediaSessionCoordinator()

    public enum AudioRole {
        case playback
        case record
        case playAndRecord
    }

    private var activationCount = 0

    private init() {}

    /// Active AVAudioSession pour le rôle demandé.
    public func request(role: AudioRole) async throws {
        let session = AVAudioSession.sharedInstance()
        switch role {
        case .playback:
            try session.setCategory(.playback, mode: .default)
        case .record:
            try session.setCategory(.record, mode: .default)
        case .playAndRecord:
            try session.setCategory(.playAndRecord, mode: .default,
                                    options: [.defaultToSpeaker, .allowBluetooth])
        }
        try session.setActive(true)
        activationCount += 1
    }

    /// Libère la session si personne d'autre ne l'utilise.
    public func release() async {
        guard activationCount > 0 else { return }
        activationCount -= 1
        if activationCount == 0 {
            try? AVAudioSession.sharedInstance().setActive(false,
                options: .notifyOthersOnDeactivation)
        }
    }
}
