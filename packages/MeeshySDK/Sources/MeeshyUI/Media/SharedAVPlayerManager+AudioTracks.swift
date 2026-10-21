import AVFoundation

// MARK: - Pistes audio d'un lecteur muet (#11282)

extension SharedAVPlayerManager {
    /// Pose sur le lecteur le drapeau de sortie ET l'état de ses pistes audio
    /// (`AudioTrackActivationLaw`), puis les suit élément par élément.
    func bindAudioTracks(to player: AVPlayer) {
        audioTracks.bind(to: player) { [weak self] in self?.effectiveMuted ?? true }
    }
}
