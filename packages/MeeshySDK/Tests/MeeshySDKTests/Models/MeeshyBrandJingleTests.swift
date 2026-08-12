import XCTest
import AVFoundation
@testable import MeeshySDK

/// Signature sonore de la marque, jouée sous l'interlude en tête de chaque
/// export de story. Elle est synthétisée : ces tests sont donc la seule
/// définition exécutable de « à quoi elle doit ressembler ».
final class MeeshyBrandJingleTests: XCTestCase {

    private let sampleRate: Double = 48_000

    func test_samples_lastExactlyTheAdvertisedDuration() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        XCTAssertEqual(Double(pcm.count) / sampleRate,
                       MeeshyBrandJingle.duration, accuracy: 0.001)
    }

    /// Le recouvrement des quatre notes fait facilement dépasser 1.0 : un
    /// jingle saturé grésillerait sur tous les exports.
    func test_samples_neverClip() {
        let peak = MeeshyBrandJingle.samples(sampleRate: sampleRate)
            .reduce(Float(0)) { max($0, abs($1)) }
        XCTAssertLessThanOrEqual(peak, 1.0)
        XCTAssertGreaterThan(peak, 0.3, "un jingle audible, pas un souffle")
    }

    /// Attaque douce : démarrer à pleine amplitude produit un clic sec, ce qui
    /// est exactement le contraire de « doux ».
    func test_samples_startFromSilence() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        XCTAssertEqual(pcm[0], 0, accuracy: 0.001)
        // 5 ms après le début, on est encore loin du pic (attaque de 25 ms).
        let atFiveMs = abs(pcm[Int(0.005 * sampleRate)])
        XCTAssertLessThan(atFiveMs, 0.35)
    }

    /// Fin au silence EXACT : une coupure nette claquerait juste avant que la
    /// story ne commence.
    func test_samples_endInSilence() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        XCTAssertEqual(pcm[pcm.count - 1], 0, accuracy: 0.0001)
        let lastTenth = pcm.suffix(Int(0.1 * sampleRate))
        let tailPeak = lastTenth.reduce(Float(0)) { max($0, abs($1)) }
        XCTAssertLessThan(tailPeak, 0.2, "la queue doit être en extinction")
    }

    /// Le motif monte : les quatre notes entrent l'une après l'autre, donc
    /// l'énergie du premier tiers ne peut pas être nulle et le milieu porte le
    /// corps du son.
    func test_samples_carryEnergyAcrossTheMotif() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        func rms(_ slice: ArraySlice<Float>) -> Float {
            sqrt(slice.reduce(Float(0)) { $0 + $1 * $1 } / Float(slice.count))
        }
        let third = pcm.count / 3
        XCTAssertGreaterThan(rms(pcm[0..<third]), 0.05)
        XCTAssertGreaterThan(rms(pcm[third..<(2 * third)]), 0.05)
    }

    /// Déterminisme : la signature doit être identique d'un rendu à l'autre,
    /// sinon deux exports de la même story auraient un son différent.
    func test_samples_areDeterministic() {
        XCTAssertEqual(MeeshyBrandJingle.samples(sampleRate: sampleRate),
                       MeeshyBrandJingle.samples(sampleRate: sampleRate))
    }

    /// Le générateur suit la fréquence d'échantillonnage demandée — l'export
    /// peut composer à 44,1 kHz.
    func test_samples_followRequestedSampleRate() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: 44_100)
        XCTAssertEqual(Double(pcm.count) / 44_100, MeeshyBrandJingle.duration, accuracy: 0.001)
    }

    func test_renderToTemporaryFile_producesAPlayableAsset() async throws {
        let url = try MeeshyBrandJingle.renderToTemporaryFile()
        defer { try? FileManager.default.removeItem(at: url) }

        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertEqual(tracks.count, 1)

        let duration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(duration),
                       MeeshyBrandJingle.duration, accuracy: 0.15)
    }

    /// LE test qui manquait — et son absence a laissé passer une signature
    /// inaudible : `omega` divisé deux fois par la fréquence d'échantillonnage
    /// donnait 440/48000 Hz, un bourdonnement sous 20 Hz. Durée, crête, silences
    /// et énergie étaient tous verts pendant ce temps.
    ///
    /// Mesure par passages par zéro : sur les 250 ms qui précèdent l'entrée de
    /// la deuxième note, seule A4 sonne, et une sinusoïde de fréquence `f`
    /// traverse zéro `2f` fois par seconde.
    func test_samples_soundAtTheIntendedPitch() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        let window = 0.25
        let slice = Array(pcm[Int(0.01 * sampleRate)..<Int(window * sampleRate)])

        var crossings = 0
        for index in 1..<slice.count where slice[index - 1] < 0 && slice[index] >= 0 {
            crossings += 1
        }
        let measured = Double(crossings) / (window - 0.01)

        XCTAssertEqual(measured, 440, accuracy: 25,
                       "la première note doit sonner un La 440, pas un grave inaudible")
    }

    /// Corollaire : la signature vit dans le registre médium, là où un haut-parleur
    /// de téléphone la restitue. Presque aucune énergie ne doit rester sous 200 Hz.
    func test_samples_liveInTheAudibleMidRange() {
        let pcm = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        // Moyenne glissante sur 5 ms : elle ne conserve que le très grave.
        let window = Int(0.005 * sampleRate)
        var lowEnergy: Float = 0
        var index = 0
        while index + window < pcm.count {
            let mean = pcm[index..<(index + window)].reduce(Float(0), +) / Float(window)
            lowEnergy = max(lowEnergy, abs(mean))
            index += window
        }
        let peak = pcm.reduce(Float(0)) { max($0, abs($1)) }

        XCTAssertLessThan(lowEnergy, peak * 0.25,
                          "l'énergie ne doit pas se concentrer sous 200 Hz")
    }

    // MARK: - Signature de FERMETURE (cadence descendante)

    func test_outroSamples_lastExactlyTheOutroDuration() {
        let pcm = MeeshyBrandJingle.outroSamples(sampleRate: sampleRate)
        XCTAssertEqual(Double(pcm.count) / sampleRate,
                       MeeshyBrandJingle.outroDuration, accuracy: 0.001)
    }

    func test_outroSamples_neverClipAndStayAudible() {
        let peak = MeeshyBrandJingle.outroSamples(sampleRate: sampleRate)
            .reduce(Float(0)) { max($0, abs($1)) }
        XCTAssertLessThanOrEqual(peak, 1.0)
        XCTAssertGreaterThan(peak, 0.3, "une fermeture audible, pas un souffle")
    }

    func test_outroSamples_startAndEndInSilence() {
        let pcm = MeeshyBrandJingle.outroSamples(sampleRate: sampleRate)
        XCTAssertEqual(pcm[0], 0, accuracy: 0.001)
        XCTAssertEqual(pcm[pcm.count - 1], 0, accuracy: 0.0001)
    }

    func test_outroSamples_areDeterministic() {
        XCTAssertEqual(MeeshyBrandJingle.outroSamples(sampleRate: sampleRate),
                       MeeshyBrandJingle.outroSamples(sampleRate: sampleRate))
    }

    /// Miroir descendant : la fermeture DÉMARRE sur l'octave haute (A5, 880 Hz),
    /// là où l'ouverture démarre sur la fondamentale (A4, 440 Hz). Mesure par
    /// passages par zéro sur les 220 ms qui précèdent l'entrée de la 2e note.
    func test_outroSamples_openOnTheHighOctave() {
        let pcm = MeeshyBrandJingle.outroSamples(sampleRate: sampleRate)
        let window = 0.22
        let slice = Array(pcm[Int(0.01 * sampleRate)..<Int(window * sampleRate)])
        var crossings = 0
        for index in 1..<slice.count where slice[index - 1] < 0 && slice[index] >= 0 {
            crossings += 1
        }
        let measured = Double(crossings) / (window - 0.01)
        XCTAssertEqual(measured, 880, accuracy: 60,
                       "la fermeture doit ouvrir sur un La aigu (A5), miroir de l'entrée")
    }

    /// La fermeture doit SONNER autrement que l'ouverture — sinon « différent »
    /// n'est pas tenu. Les 200 premières ms (A5 vs A4) diffèrent.
    func test_outroSamples_differFromOpening() {
        let intro = MeeshyBrandJingle.samples(sampleRate: sampleRate)
        let outro = MeeshyBrandJingle.outroSamples(sampleRate: sampleRate)
        let n = Int(0.20 * sampleRate)
        XCTAssertNotEqual(Array(intro.prefix(n)), Array(outro.prefix(n)))
    }

    func test_renderOutroToTemporaryFile_producesAPlayableAsset() async throws {
        let url = try MeeshyBrandJingle.renderOutroToTemporaryFile()
        defer { try? FileManager.default.removeItem(at: url) }
        let asset = AVURLAsset(url: url)
        let tracks = try await asset.loadTracks(withMediaType: .audio)
        XCTAssertEqual(tracks.count, 1)
        let duration = try await asset.load(.duration)
        XCTAssertEqual(CMTimeGetSeconds(duration),
                       MeeshyBrandJingle.outroDuration, accuracy: 0.15)
    }
}
