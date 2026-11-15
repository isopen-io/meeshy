import Accelerate
import Foundation

// MARK: - La mesure d'une forme d'onde

/// **La mesure, en fonctions pures.** Un RMS par compartiment, calculé par
/// `vDSP_rmsqv` : aucun fichier, aucun cache, aucune échelle d'affichage.
///
/// La valeur est ABSOLUE (jamais divisée par le pic) : deux pistes de niveaux
/// différents se distinguent, et c'est ce qui permet de régler un volume à l'œil.
/// L'échelle qui la rend lisible est `WaveformScale`.
public enum WaveformMath {

    /// `count` RMS, un par tranche égale de `samples`. Vide si l'un ou l'autre est vide.
    public static func rmsBuckets(of samples: [Float], count: Int) -> [Float] {
        guard count > 0, !samples.isEmpty else { return [] }
        var accumulator = WaveformAccumulator(count: count, totalFrames: Int64(samples.count))
        accumulator.append(samples)
        return accumulator.result()
    }

    /// La moyenne des canaux, échantillon par échantillon. Vide si aucun canal,
    /// ou si les canaux n'ont pas la même longueur.
    public static func monoMix(_ channels: [[Float]]) -> [Float] {
        guard let first = channels.first, !first.isEmpty,
              channels.allSatisfy({ $0.count == first.count }) else { return [] }
        guard channels.count > 1 else { return first }
        let sum = channels.dropFirst().reduce(first) { vDSP.add($0, $1) }
        return vDSP.multiply(1 / Float(channels.count), sum)
    }

    /// La moyenne des canaux déjà posés en mémoire (la voie de l'extracteur,
    /// sans recopie intermédiaire). `output` reçoit `frames` valeurs.
    static func mixToMono(_ channels: [UnsafePointer<Float>], frames: Int, into output: UnsafeMutablePointer<Float>) {
        guard let first = channels.first, frames > 0 else { return }
        output.update(from: first, count: frames)
        guard channels.count > 1 else { return }
        channels.dropFirst().forEach { vDSP_vadd(output, 1, $0, 1, output, 1, vDSP_Length(frames)) }
        var gain = 1 / Float(channels.count)
        vDSP_vsmul(output, 1, &gain, output, 1, vDSP_Length(frames))
    }
}

// MARK: - Le flux

/// **Le même RMS, par blocs.** L'audio se lit par morceaux : l'accumulateur
/// découpe chaque morceau aux bornes des compartiments, mesure chaque segment
/// par `vDSP_rmsqv` et cumule la somme des carrés en double précision. Lu par
/// blocs ou d'un coup, le résultat est le même.
///
/// Le compartiment d'une trame `f` est `f * count / totalFrames` ; les trames
/// au-delà de l'estimation (durée approchée d'un décodeur) se replient dans le
/// dernier compartiment.
public struct WaveformAccumulator {

    public let count: Int
    public let totalFrames: Int64
    private var sumSquares: [Double]
    private var frameCounts: [Int64]
    private var cursor: Int64 = 0

    public init(count: Int, totalFrames: Int64) {
        self.count = max(0, count)
        self.totalFrames = max(0, totalFrames)
        self.sumSquares = [Double](repeating: 0, count: max(0, count))
        self.frameCounts = [Int64](repeating: 0, count: max(0, count))
    }

    public mutating func append(_ chunk: [Float]) {
        chunk.withUnsafeBufferPointer { append($0) }
    }

    public mutating func append(_ chunk: UnsafeBufferPointer<Float>) {
        guard count > 0, totalFrames > 0, let base = chunk.baseAddress else { return }
        var offset = 0
        while offset < chunk.count {
            let frame = cursor + Int64(offset)
            let bucket = bucketIndex(of: frame)
            let take = Int(min(Int64(chunk.count - offset), bucketEnd(of: bucket) - frame))
            guard take > 0 else { break }
            var rms: Float = 0
            vDSP_rmsqv(base + offset, 1, &rms, vDSP_Length(take))
            sumSquares[bucket] += Double(rms) * Double(rms) * Double(take)
            frameCounts[bucket] += Int64(take)
            offset += take
        }
        cursor += Int64(chunk.count)
    }

    public func result() -> [Float] {
        guard cursor > 0 else { return [] }
        return zip(sumSquares, frameCounts).map { sum, frames in
            frames > 0 ? Float((sum / Double(frames)).squareRoot()) : 0
        }
    }

    private func bucketIndex(of frame: Int64) -> Int {
        min(count - 1, Int(frame * Int64(count) / totalFrames))
    }

    /// La première trame du compartiment suivant : `ceil((bucket + 1) * total / count)`.
    private func bucketEnd(of bucket: Int) -> Int64 {
        guard bucket < count - 1 else { return Int64.max }
        return (Int64(bucket + 1) * totalFrames + Int64(count) - 1) / Int64(count)
    }
}
