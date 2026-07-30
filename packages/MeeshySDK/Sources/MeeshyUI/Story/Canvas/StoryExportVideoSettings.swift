import AVFoundation
import CoreGraphics
import Foundation

/// Réglages d'encodage du MP4 de story — **le plafond de débit du pipeline**.
///
/// ## Pourquoi ce type existe
/// `AVAssetExportSession` ne sait pas plafonner un débit : ses presets bornent la
/// RÉSOLUTION, pas le bitrate. Mesuré sur une source à forte entropie
/// (1080×1920, 6 s de bruit) :
///
/// | Preset | Débit | Sortie | Extrapolé 1 min |
/// |---|---|---|---|
/// | `HighestQuality` | 58,8 Mbps | 1080×1920 | **441 Mo** |
/// | `1920x1080` | 58,8 Mbps | 1080×1920 | **441 Mo** — strictement identique |
/// | `HEVC1920x1080` | 23,6 Mbps | 1080×1920 | 177 Mo |
/// | `1280x720` | 11,1 Mbps | 720×1280 | 84 Mo — au prix de la définition |
///
/// Autrement dit : aucun preset ne plafonne le débit en pleine définition. Un
/// export d'une minute de contenu détaillé pesait 314 Mo (signalement user,
/// 2026-07-30). D'où le passage à `AVAssetReader` + `AVAssetWriter`, seul chemin
/// qui accepte un `AVVideoAverageBitRateKey`.
///
/// ## Le débit cible
/// Dérivé de la surface plutôt que fixé en dur : la story s'exporte en 1080×1920
/// (portrait) ou 1920×1080 (paysage), et un futur gabarit ne doit pas hériter
/// d'un débit calibré pour un autre. `bitsPerPixelPerFrame` à 0,12 est le point
/// de fonctionnement usuel de H.264 High pour du contenu social — au-dessus, le
/// gain visuel n'est plus perceptible sur un écran de téléphone ; en dessous, les
/// aplats et les dégradés commencent à bloquer.
///
/// ## H.264 et pas HEVC
/// L'export est destiné au partage EXTERNE (Photos, WhatsApp, AirDrop, Android,
/// Windows). HEVC diviserait encore le poids par ~2, mais reste refusé ou mal
/// décodé hors de l'écosystème Apple. Le plafond de débit apporte déjà l'essentiel
/// du gain (÷8) sans rien sacrifier de la compatibilité ; HEVC serait une option
/// à exposer, pas un défaut à imposer.
public nonisolated enum StoryExportVideoSettings {

    /// Bits par pixel et par image. Point de fonctionnement H.264 High.
    static let bitsPerPixelPerFrame: Double = 0.12

    /// Bornes de sécurité : un gabarit minuscule ne doit pas tomber sous le seuil
    /// de lisibilité, un gabarit géant ne doit pas rouvrir le problème d'origine.
    static let minimumBitRate = 2_500_000
    static let maximumBitRate = 12_000_000

    /// Débit vidéo moyen visé pour `size`, à la cadence du pipeline.
    static func averageBitRate(for size: CGSize) -> Int {
        let pixels = Double(max(1, Int(size.width))) * Double(max(1, Int(size.height)))
        let raw = pixels * StoryExportFrameRate.fps * bitsPerPixelPerFrame
        return min(maximumBitRate, max(minimumBitRate, Int(raw)))
    }

    /// Réglages de l'entrée vidéo de `AVAssetWriter`.
    ///
    /// - `AVVideoMaxKeyFrameIntervalKey` à 2 s : compromis habituel entre poids
    ///   et confort de navigation (une image-clé toutes les 2 s permet un seek
    ///   fluide sans multiplier les images coûteuses).
    /// - Profil `High` : meilleure compression que `Baseline` à qualité égale, et
    ///   décodé par tout appareil postérieur à ~2010 — la compatibilité qui
    ///   motive H.264 n'est pas entamée.
    static func video(for size: CGSize) -> [String: any Sendable] {
        [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: Int(size.width),
            AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: averageBitRate(for: size),
                AVVideoMaxKeyFrameIntervalKey: Int(StoryExportFrameRate.fps * 2),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoAllowFrameReorderingKey: true
            ] as [String: any Sendable]
        ]
    }

    /// Réglages de l'entrée audio. 128 kbps AAC stéréo : le palier au-delà duquel
    /// l'oreille ne distingue plus rien sur une story, et une fraction négligeable
    /// du poids total face à la vidéo.
    static let audio: [String: any Sendable] = [
        AVFormatIDKey: kAudioFormatMPEG4AAC,
        AVNumberOfChannelsKey: 2,
        AVSampleRateKey: 44_100.0,
        AVEncoderBitRateKey: 128_000
    ]

    /// Format décompressé demandé au lecteur pour que l'`AVAudioMix` (volumes,
    /// rampes, automation) soit réellement appliqué avant le ré-encodage.
    static let audioReaderSettings: [String: any Sendable] = [
        AVFormatIDKey: kAudioFormatLinearPCM,
        AVLinearPCMBitDepthKey: 32,
        AVLinearPCMIsFloatKey: true,
        AVLinearPCMIsBigEndianKey: false,
        AVLinearPCMIsNonInterleaved: false
    ]
}
