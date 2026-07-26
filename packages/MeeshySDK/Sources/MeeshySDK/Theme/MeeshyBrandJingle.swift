import Foundation
import AVFoundation

/// Signature sonore de Meeshy — 2,2 s, jouée sous l'interlude d'identité en tête
/// de chaque export de story.
///
/// Elle est **synthétisée**, pas chargée depuis un fichier : la marque garde une
/// signature identique au sample près sur tous les appareils, sans binaire à
/// versionner ni asset à retrouver au moment du rendu. Elle rejoint ici les
/// autres porteurs d'identité (`MeeshyColors`, `brandGradient`).
///
/// **Motif** : un arpège de La majeur ascendant — A4, C♯5, E5 — puis la
/// résolution à l'octave (A5). Trois notes qui montent, comme les trois traits
/// du logo, et une quatrième qui referme. Chaque note continue de résonner
/// pendant que la suivante entre : le recouvrement produit un carillon plutôt
/// qu'une suite de bips, ce qui rend la signature douce tout en la gardant
/// reconnaissable même à faible volume.
///
/// **Douceur** : sinusoïdes (aucun harmonique agressif), un seul partiel à
/// l'octave à −18 dB pour la chaleur, attaque de 25 ms pour supprimer le clic
/// initial, décroissance exponentielle et fondu final jusqu'au silence exact.
public enum MeeshyBrandJingle {

    /// Durée totale, en secondes. Cadre l'interlude de l'export.
    public static let duration: TimeInterval = 2.2

    /// Durée de la signature de FERMETURE, calée sur la carte de fin (2 s).
    public static let outroDuration: TimeInterval = 2.0

    /// Format de rendu — 48 kHz mono, aligné sur le format canonique du mixer
    /// reader (`ReaderAudioMixer`) pour éviter toute conversion à la volée.
    public static let sampleRate: Double = 48_000

    /// Une note du motif : sa fréquence et l'instant où elle entre.
    private struct Note {
        let frequency: Double
        let onset: TimeInterval
    }

    /// A4 · C♯5 · E5 · A5 — La majeur arpégé puis résolu à l'octave.
    private static let motif: [Note] = [
        Note(frequency: 440.00, onset: 0.00),
        Note(frequency: 554.37, onset: 0.28),
        Note(frequency: 659.25, onset: 0.56),
        Note(frequency: 880.00, onset: 0.84)
    ]

    /// A5 · E5 · C♯5 · A4 — le MIROIR descendant de l'entrée : l'arpège
    /// redescend depuis l'octave et se pose sur la tonique. Cadence résolutive
    /// qui signale une fin, tout en restant la même signature de La majeur —
    /// reconnaissable comme « Meeshy » mais distincte de l'ouverture.
    private static let outroMotif: [Note] = [
        Note(frequency: 880.00, onset: 0.00),
        Note(frequency: 659.25, onset: 0.26),
        Note(frequency: 554.37, onset: 0.52),
        Note(frequency: 440.00, onset: 0.78)
    ]

    private static let attack: TimeInterval = 0.025
    private static let decayHalfLife: TimeInterval = 0.62
    private static let releaseTail: TimeInterval = 0.35
    private static let peakAmplitude: Float = 0.62
    private static let octavePartialGain: Double = 0.126   // ≈ −18 dB

    /// Échantillons PCM mono du jingle, dans `[-1, 1]`.
    ///
    /// Fonction pure : c'est elle qui porte la signature, et c'est elle qu'on
    /// teste (durée, absence de clipping, silence aux deux bords). Le rendu
    /// fichier n'en est qu'un emballage.
    public static func samples(sampleRate: Double = MeeshyBrandJingle.sampleRate) -> [Float] {
        render(motif: motif, duration: duration, sampleRate: sampleRate)
    }

    /// Échantillons PCM de la signature de FERMETURE (cadence descendante).
    /// Même synthèse, motif inversé — voir `outroMotif`.
    public static func outroSamples(sampleRate: Double = MeeshyBrandJingle.sampleRate) -> [Float] {
        render(motif: outroMotif, duration: outroDuration, sampleRate: sampleRate)
    }

    private static func render(motif: [Note], duration: TimeInterval, sampleRate: Double) -> [Float] {
        let frameCount = Int(duration * sampleRate)
        guard frameCount > 0 else { return [] }
        var buffer = [Float](repeating: 0, count: frameCount)

        for note in motif {
            let onsetFrame = Int(note.onset * sampleRate)
            guard onsetFrame < frameCount else { continue }
            // Pulsation en radians par SECONDE — `t` ci-dessous est en secondes.
            // Diviser en plus par `sampleRate` ici donnerait f/48000 Hz, soit un
            // bourdonnement inaudible au lieu de la note.
            let omega = 2.0 * Double.pi * note.frequency
            let octaveOmega = omega * 2.0

            for frame in onsetFrame..<frameCount {
                let t = Double(frame - onsetFrame) / sampleRate
                // Attaque linéaire courte puis décroissance exponentielle : une
                // note qui s'ouvre sans clic et s'éteint comme une corde pincée.
                let attackGain = t < attack ? t / attack : 1.0
                let decayGain = pow(0.5, t / decayHalfLife)
                let value = sin(omega * t) + octavePartialGain * sin(octaveOmega * t)
                buffer[frame] += Float(value * attackGain * decayGain)
            }
        }

        // Normalisation : le recouvrement des quatre notes fait varier le pic
        // selon le motif. On ramène au niveau cible plutôt que de doser chaque
        // note à la main — la signature reste identique si le motif évolue.
        let peak = buffer.reduce(Float(0)) { max($0, abs($1)) }
        if peak > 0 {
            let scale = peakAmplitude / peak
            for index in buffer.indices { buffer[index] *= scale }
        }

        // Fondu final jusqu'au silence EXACT : une coupure nette produirait un
        // claquement en fin d'export, juste avant la story.
        let releaseFrames = min(Int(releaseTail * sampleRate), frameCount)
        if releaseFrames > 0 {
            let start = frameCount - releaseFrames
            for frame in start..<frameCount {
                let progress = Float(frame - start) / Float(releaseFrames)
                buffer[frame] *= (1 - progress)
            }
        }
        return buffer
    }

    /// Écrit le jingle dans un fichier `.m4a` temporaire, prêt à être inséré
    /// dans une composition d'export. L'appelant est responsable du nettoyage.
    public static func renderToTemporaryFile() throws -> URL {
        try writeM4A(samples())
    }

    /// Écrit la signature de FERMETURE dans un `.m4a` temporaire, prête à être
    /// mixée sur la carte de fin de l'export. L'appelant nettoie.
    public static func renderOutroToTemporaryFile() throws -> URL {
        try writeM4A(outroSamples())
    }

    private static func writeM4A(_ pcm: [Float]) throws -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("meeshy-jingle-\(UUID().uuidString).m4a")

        guard let format = AVAudioFormat(standardFormatWithSampleRate: sampleRate, channels: 1) else {
            throw JingleError.unsupportedFormat
        }
        guard !pcm.isEmpty,
              let buffer = AVAudioPCMBuffer(pcmFormat: format,
                                            frameCapacity: AVAudioFrameCount(pcm.count)),
              let channel = buffer.floatChannelData?[0] else {
            throw JingleError.bufferAllocationFailed
        }
        pcm.withUnsafeBufferPointer { source in
            channel.update(from: source.baseAddress!, count: pcm.count)
        }
        buffer.frameLength = AVAudioFrameCount(pcm.count)

        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: sampleRate,
            AVNumberOfChannelsKey: 1,
            AVEncoderBitRateKey: 128_000
        ]
        let file = try AVAudioFile(forWriting: url, settings: settings)
        try file.write(from: buffer)
        return url
    }

    public enum JingleError: Error {
        case unsupportedFormat
        case bufferAllocationFailed
    }
}
