import Foundation

/// Le flux d'UNE voix découpé en fenêtres consécutives de 1024 échantillons (#20531), chacune analysée et datée :
/// un tampon de tap de 4800 trames rend quatre spectres, et non un. Ce qui reste en fin de tampon est REPORTÉ et
/// complété par le début du suivant, à condition que celui-ci le suive dans le temps (à 10 ms près) et à la même
/// fréquence ; sinon le reste est abandonné.
///
/// Sur le fil d'un seul flux, sans verrou : l'appelant le garde. N'alloue rien en régime établi, tant que
/// l'appelant lâche les bandes d'une fenêtre avant de demander la suivante (contrat de `TalkieSpectrumAnalyzer`).
nonisolated final class TalkieSpectrumWindows {
    static let length = 1024
    private static let continuityTolerance: TimeInterval = 0.010

    private var sampleRate: Double
    private var analyzer: TalkieSpectrumAnalyzer
    private let carry: UnsafeMutablePointer<Float>
    private var carried = 0
    private var carryTime: TimeInterval = 0
    private var source = UnsafeBufferPointer<Float>(start: nil, count: 0)
    private var sourceTime: TimeInterval = 0
    private var cursor = 0

    init(sampleRate: Double) {
        self.sampleRate = sampleRate
        analyzer = TalkieSpectrumAnalyzer(sampleRate: sampleRate, fftSize: Self.length)
        carry = .allocate(capacity: Self.length)
    }

    deinit {
        carry.deallocate()
    }

    /// Un nouveau tampon, dont le premier échantillon sonne à `time` ; ses fenêtres sortent par `next()`.
    func feed(_ samples: UnsafeBufferPointer<Float>, sampleRate rate: Double, at time: TimeInterval) {
        if rate.isFinite, rate > 0, rate != sampleRate {
            sampleRate = rate
            analyzer = TalkieSpectrumAnalyzer(sampleRate: rate, fftSize: Self.length)
            carried = 0
        }
        if carried > 0, abs(carryTime + Double(carried) / sampleRate - time) > Self.continuityTolerance {
            carried = 0
        }
        source = samples
        sourceTime = time
        cursor = 0
    }

    /// La fenêtre pleine suivante et l'heure de son premier échantillon ; `nil` quand le tampon est épuisé (son reste
    /// est alors reporté).
    func next() -> (bands: [Float], time: TimeInterval)? {
        if carried > 0 { return completeCarry() }
        guard source.count - cursor >= Self.length, let base = source.baseAddress else {
            keepRemainder()
            return nil
        }
        let time = sourceTime + Double(cursor) / sampleRate
        let window = UnsafeBufferPointer(start: base + cursor, count: Self.length)
        cursor += Self.length
        return (analyzer.bands(window), time)
    }

    private func completeCarry() -> (bands: [Float], time: TimeInterval)? {
        let needed = Self.length - carried
        let available = source.count - cursor
        guard let base = source.baseAddress, available > 0 else { return nil }
        let taken = min(needed, available)
        (carry + carried).update(from: base + cursor, count: taken)
        carried += taken
        cursor += taken
        guard carried == Self.length else { return nil }
        carried = 0
        return (analyzer.bands(UnsafeBufferPointer(start: carry, count: Self.length)), carryTime)
    }

    private func keepRemainder() {
        let rest = source.count - cursor
        if rest > 0, let base = source.baseAddress {
            carry.update(from: base + cursor, count: rest)
            carried = rest
            carryTime = sourceTime + Double(cursor) / sampleRate
        }
        source = UnsafeBufferPointer(start: nil, count: 0)
        cursor = 0
    }
}
