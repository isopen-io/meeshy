import Foundation

/// **LES MÉDIAS D'UNE CARTE « IMAGINE »** (#8692) — ce qu'une image dit d'une
/// photo, d'une vidéo ou d'un son joints au message.
///
/// Premier jet assumé : une photo se peint, une vidéo se montre par sa
/// PREMIÈRE image (son poster), un son se REPRÉSENTE (onde, pastille, spectre,
/// fiche). La mise en page ne connaît que ces descripteurs — les pixels sont
/// chargés par l'application et remis au peintre, jamais à la loi.
public enum MessageCardMediaKind: String, CaseIterable, Sendable {
    case image, video, audio

    /// Un média qui se PEINT (photo, première image d'une vidéo) — un son se représente.
    public var isVisual: Bool { self != .audio }

    /// Un média qui a une DURÉE — il peut partir en GIF ou en vidéo.
    public var isTemporal: Bool { self != .image }
}

public struct MessageCardMedia: Equatable, Sendable {
    public let id: String
    public let kind: MessageCardMediaKind
    /// Largeur / hauteur — un rapport absurde retombe sur le carré.
    public let aspect: Double
    /// En secondes.
    public let duration: Double?
    /// Le nom lisible (la fiche d'un son) — jamais un chemin.
    public let name: String?
    /// L'amplitude du son, normalisée entre 0 et 1, du début à la fin — vide pour une image.
    public let samples: [Double]
    /// Ce que dit un son : la transcription de la piste SERVIE (#8979) — `nil` sans transcription.
    public let transcript: MessageCardTranscript?

    public init(id: String, kind: MessageCardMediaKind, aspect: Double = 1, duration: Double? = nil, name: String? = nil,
                samples: [Double] = [], transcript: MessageCardTranscript? = nil) {
        self.id = id
        self.kind = kind
        self.aspect = aspect.isFinite && aspect > 0.2 && aspect < 5 ? aspect : 1
        self.duration = duration.flatMap { $0.isFinite && $0 > 0 ? $0 : nil }
        self.name = MessageCardText.nonBlank(name)
        self.samples = samples.map { $0.isFinite ? min(1, max(0, $0)) : 0 }
        self.transcript = kind == .audio ? transcript : nil
    }

    public func with(samples: [Double]) -> MessageCardMedia {
        MessageCardMedia(id: id, kind: kind, aspect: aspect, duration: duration, name: name, samples: samples, transcript: transcript)
    }

    /// Le même média, sa durée lue dans le fichier quand le message ne la disait pas.
    public func with(duration: Double?) -> MessageCardMedia {
        MessageCardMedia(id: id, kind: kind, aspect: aspect, duration: duration ?? self.duration, name: name, samples: samples, transcript: transcript)
    }

    /// Les amplitudes de l'extrait `clip` — toutes, sans extrait ou sans durée connue.
    public func samples(in clip: MessageCardClip?) -> [Double] {
        guard let clip, let duration, !samples.isEmpty else { return samples }
        let count = Double(samples.count)
        let lower = min(samples.count - 1, max(0, Int((clip.start / duration * count).rounded(.down))))
        let upper = min(samples.count, max(lower + 1, Int(((clip.start + clip.duration) / duration * count).rounded(.up))))
        return Array(samples[lower..<upper])
    }

    /// « 0:12 », « 1:05 », « 12:00 ».
    public static func clock(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        return "\(total / 60):" + String(format: "%02d", total % 60)
    }

    /// Une onde STABLE quand le son n'a pas (encore) été lu : dérivée de son
    /// identifiant, elle ne change pas d'un aperçu à l'autre.
    public static func syntheticSamples(seed: String, count: Int) -> [Double] {
        guard count > 0 else { return [] }
        var state: UInt64 = 0xcbf2_9ce4_8422_2325
        for byte in seed.utf8 {
            state ^= UInt64(byte)
            state = state &* 0x0000_0100_0000_01b3
        }
        return (0..<count).map { index in
            state = state &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            let noise = Double((state >> 33) % 1000) / 1000
            let swell = 0.5 + 0.5 * sin(Double(index) / Double(max(count, 1)) * .pi)
            return 0.18 + 0.82 * (0.55 * noise + 0.45 * swell)
        }
    }

    /// Ramène une amplitude à `count` barres — la moyenne de chaque tranche.
    public static func resample(_ samples: [Double], count: Int) -> [Double] {
        guard count > 0, !samples.isEmpty else { return [] }
        return (0..<count).map { bar in
            let start = bar * samples.count / count
            let end = max(start + 1, (bar + 1) * samples.count / count)
            let slice = samples[start..<min(end, samples.count)]
            return slice.reduce(0, +) / Double(slice.count)
        }
    }
}

/// Ce que « Sauvegarder » et « Partager » peuvent produire.
public enum MessageCardOutput: String, CaseIterable, Sendable {
    case image, gif, video

    /// **LA règle de l'offre** : une vidéo s'anime en GIF comme en vidéo ; un
    /// son n'a de sens qu'avec sa piste, donc en vidéo seulement ; une photo
    /// ne bouge pas. L'image fixe est toujours offerte, et toujours en tête.
    public static func offered(for kinds: [MessageCardMediaKind]) -> [MessageCardOutput] {
        if kinds.contains(.video) { return [.image, .gif, .video] }
        if kinds.contains(.audio) { return [.image, .video] }
        return [.image]
    }

    public var fileExtension: String {
        switch self {
        case .image: return "png"
        case .gif: return "gif"
        case .video: return "mp4"
        }
    }
}

/// **L'EXTRAIT** d'un son ou d'une vidéo (#8979) — la fenêtre que la carte
/// animée montre et fait entendre, en secondes depuis le début du média.
public struct MessageCardClip: Equatable, Sendable {
    public let start: Double
    public let duration: Double

    public init(start: Double, duration: Double) {
        self.start = start.isFinite ? max(0, start) : 0
        self.duration = duration.isFinite ? max(0, duration) : 0
    }

    public var end: Double { start + duration }

    /// La fenêtre de `length` secondes qui commence en `start` — glissée pour
    /// tenir dans un média de `mediaDuration` secondes (inconnue : elle part de `start`).
    public static func window(length: Double, start: Double, in mediaDuration: Double?) -> MessageCardClip {
        guard let mediaDuration, mediaDuration.isFinite, mediaDuration > 0 else { return MessageCardClip(start: start, duration: length) }
        let duration = min(length, mediaDuration)
        return MessageCardClip(start: min(max(0, start), mediaDuration - duration), duration: duration)
    }
}

/// **LE PLAN D'UNE CARTE ANIMÉE** — combien d'images, à quelle cadence, à
/// quelle taille, et QUEL extrait. Un GIF est court et réduit de moitié (il
/// pèse vite) ; une vidéo garde la pleine taille ; un son part sur la durée
/// choisie (15 s, 30 s, une minute — bornée par le son), à partir du point
/// choisi (#8979).
public struct MessageCardMotionPlan: Equatable, Sendable {
    public let output: MessageCardOutput
    public let fps: Double
    public let duration: Double
    public let frameCount: Int
    /// Le facteur appliqué à la carte — les dimensions sont ramenées au pair (H.264).
    public let scale: Double
    /// Où l'extrait commence dans le média, en secondes.
    public let start: Double

    public static let gifMaxDuration: Double = 6
    public static let videoMaxDuration: Double = 15

    /// `nil` pour une image fixe, ou pour une sortie que le contenu n'offre pas.
    /// - Parameters:
    ///   - length: la durée choisie pour un son.
    ///   - start: le point de départ choisi — glissé pour que l'extrait tienne dans le média.
    public static func of(_ output: MessageCardOutput, media: [MessageCardMedia],
                          length: MessageCardClipLength = .oneMinute, start: Double = 0) -> MessageCardMotionPlan? {
        guard output != .image, MessageCardOutput.offered(for: media.map(\.kind)).contains(output) else { return nil }
        let video = media.first { $0.kind == .video }
        let audio = media.first { $0.kind == .audio }
        switch (output, video, audio) {
        case (.gif, .some(let clip), _):
            return plan(output, fps: 10, window: .window(length: gifMaxDuration, start: start, in: clip.duration ?? 3), scale: 0.5)
        case (.video, .some(let clip), _):
            return plan(output, fps: 15, window: .window(length: videoMaxDuration, start: start, in: clip.duration ?? 3), scale: 1)
        case (.video, nil, .some(let sound)):
            return plan(output, fps: 10, window: .window(length: length.seconds, start: start, in: sound.duration ?? 5), scale: 1)
        default:
            return nil
        }
    }

    private static func plan(_ output: MessageCardOutput, fps: Double, window: MessageCardClip, scale: Double) -> MessageCardMotionPlan {
        let seconds = max(1 / fps, window.duration)
        return MessageCardMotionPlan(output: output, fps: fps, duration: seconds, frameCount: max(1, Int((seconds * fps).rounded(.up))),
                                     scale: scale, start: window.start)
    }

    /// L'extrait que la carte animée montre — celui que la carte reçoit (`MessageCardInput.clip`).
    public var clip: MessageCardClip { MessageCardClip(start: start, duration: duration) }

    /// Les pixels d'une image du plan — au pair, qu'un encodeur vidéo exige.
    public func pixelSize(width: Double, height: Double) -> (width: Int, height: Int) {
        let even: (Double) -> Int = { value in max(2, Int((value * scale).rounded(.down)) / 2 * 2) }
        return (even(width), even(height))
    }

    /// L'instant (en secondes depuis le début de l'extrait) de l'image `index` —
    /// celui où elle s'affiche dans la vidéo, donc celui qu'on y ENTEND.
    public func time(ofFrame index: Int) -> Double { Double(index) / fps }
}
