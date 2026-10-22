import Foundation
import AVFoundation
import os
import MeeshySDK

/// **Un `AVAudioFile` ouvert, qui traverse d'un fil à l'autre (#9878).**
///
/// `AVAudioFile(forReading:)` lit l'en-tête et l'index du conteneur sur le
/// disque : sur le fil principal, pendant le balayage d'une story ou d'un réel,
/// c'est une image perdue. On l'ouvre donc hors du fil principal, puis on remet
/// le fichier au mixer. Le fichier n'est lu ni écrit pendant le transfert : un
/// seul fil le tient à la fois, d'où `@unchecked Sendable`.
nonisolated struct ReaderOpenedAudioFile: @unchecked Sendable {
    let file: AVAudioFile

    static func load(_ url: URL) throws -> ReaderOpenedAudioFile {
        ReaderOpenedAudioFile(file: try AVAudioFile(forReading: url))
    }

    /// Ouvre chaque URL ; un fichier illisible est journalisé et SAUTÉ, comme le
    /// faisait `configure` avant (un clip manquant ne fait pas taire les autres).
    static func openAll(_ urls: [String: URL]) -> [String: ReaderOpenedAudioFile] {
        let logger = MeeshyLog.logger(.media)
        return urls.reduce(into: [:]) { opened, pair in
            // AVAudioFile(forReading:) rejects HTTPS URLs with OSStatus
            // 2003334207 ("not a file") — a silent skip must stay diagnosable.
            if !pair.value.isFileURL {
                logger.error("ReaderAudioMixer \(pair.key, privacy: .public) URL is not file:// scheme=\(pair.value.scheme ?? "nil", privacy: .public) — AVAudioFile will reject")
            }
            do {
                opened[pair.key] = try ReaderOpenedAudioFile.load(pair.value)
            } catch {
                logger.error("ReaderAudioMixer failed to load \(pair.key, privacy: .public): \(error.localizedDescription, privacy: .public)")
            }
        }
    }
}

// MARK: - Configuration hors du fil principal

extension ReaderAudioMixer {
    /// Les URL des seuls clips que la slide déclare.
    static func urls(_ urls: [String: URL], for audios: [StoryAudioPlayerObject]) -> [String: URL] {
        let wanted = Set(audios.map(\.id))
        return urls.filter { wanted.contains($0.key) }
    }

    /// `configure(audios:urls:)`, fichiers ouverts HORS du fil principal.
    ///
    /// Une configuration plus récente arrivée pendant l'ouverture (la slide a
    /// changé, un autre chargement a commencé) gagne : celle-ci se tait au lieu
    /// d'écraser la suivante avec les clips d'une slide quittée. `isStillWanted`
    /// est relu au retour de l'ouverture : l'hôte y dit si la slide est encore
    /// la sienne.
    public func loadAndConfigure(audios: [StoryAudioPlayerObject],
                                 urls: [String: URL],
                                 loopsEveryClip: Bool = false,
                                 isStillWanted: () -> Bool = { true }) async throws {
        let ticket = claimConfigurationTicket()
        let wanted = Self.urls(urls, for: audios)
        let files = await Task.detached(priority: .userInitiated) {
            ReaderOpenedAudioFile.openAll(wanted)
        }.value
        guard ticket == configurationTicket, isStillWanted() else { return }
        configure(audios: audios, files: files, loopsEveryClip: loopsEveryClip)
    }

    /// `configureBackground(audio:url:looping:loopsEveryClip:)`, fichier ouvert
    /// HORS du fil principal. Un fichier illisible jette ; le fond en place
    /// reste alors attaché.
    public func loadAndConfigureBackground(audio: StoryAudioPlayerObject,
                                           url: URL,
                                           looping: Bool,
                                           loopsEveryClip: Bool = false,
                                           isStillWanted: () -> Bool = { true }) async throws {
        let ticket = claimConfigurationTicket()
        let file = try await Task.detached(priority: .userInitiated) {
            try ReaderOpenedAudioFile.load(url)
        }.value
        guard ticket == configurationTicket, isStillWanted() else { return }
        configureBackground(audio: audio, file: file, looping: looping, loopsEveryClip: loopsEveryClip)
    }

    private func claimConfigurationTicket() -> UInt64 {
        configurationTicket &+= 1
        return configurationTicket
    }
}
