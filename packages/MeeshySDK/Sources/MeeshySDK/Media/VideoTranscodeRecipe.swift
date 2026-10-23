import AVFoundation
import CoreAudioTypes
import CoreMedia
import CoreVideo
import Foundation
import VideoToolbox

/// Ce qu'on sait d'une vidéo SOURCE avant de la ré-encoder.
///
/// `colorTags` est l'étiquette couleur lue sur sa description de format, sous les
/// clés `AVVideoColorPrimariesKey` / `AVVideoTransferFunctionKey` /
/// `AVVideoYCbCrMatrixKey` (`nil` : source muette). `audioChannelCount` vaut `nil`
/// quand la source n'a pas de son.
public struct VideoSourceTraits: Sendable, Equatable {
    public let colorTags: [String: String]?
    public let nominalFrameRate: Float
    public let audioChannelCount: Int?

    public init(colorTags: [String: String]?, nominalFrameRate: Float, audioChannelCount: Int?) {
        self.colorTags = colorTags
        self.nominalFrameRate = nominalFrameRate
        self.audioChannelCount = audioChannelCount
    }

    /// HLG ou PQ : la prise est en HDR.
    public var isHDR: Bool {
        guard let transfer = colorTags?[AVVideoTransferFunctionKey] else { return false }
        return transfer == AVVideoTransferFunction_ITU_R_2100_HLG || transfer == AVVideoTransferFunction_SMPTE_ST_2084_PQ
    }
}

public enum VideoTranscodeCodec: Sendable, Equatable {
    case hevc
    case h264

    public var avCodec: AVVideoCodecType {
        switch self {
        case .hevc: return .hevc
        case .h264: return .h264
        }
    }
}

/// **Les réglages d'un ré-encodage vidéo, dérivés de la SOURCE** (#11290).
///
/// Verdict porteur #11247 : une seule génération perceptuelle, profil couleur et
/// HDR conservés. Donc :
/// - le son garde ses canaux (stéréo au plus), en AAC 48 kHz à 128 kb/s ;
/// - l'encodeur vise une QUALITÉ (`perceptualQuality`), le débit du contexte n'est
///   qu'un plafond ; si l'encodeur refuse la clé de qualité, le débit seul sert ;
/// - une prise HLG ou PQ reste en 10 bits, HEVC Main10, avec son étiquette :
///   d'iPhone à iPhone le HDR survit, et c'est le serveur qui fabrique le SDR pour
///   le web ;
/// - une source SDR garde son étiquette (#9332) ; muette, elle est étiquetée
///   BT.709, ce que tout lecteur supposait déjà ;
/// - la cadence est gardée jusqu'à 30 i/s.
///
/// Paramètres opaques : l'hôte lit la source et dit si l'appareil encode le HEVC
/// (`VideoEncoderAvailability`).
public struct VideoTranscodeRecipe: Sendable, Equatable {
    public static let perceptualQuality = 0.6
    public static let audioSampleRate = 48_000
    public static let audioBitRate = 128_000
    public static let frameRateCeiling: Float = 30

    public static let bt709Tags: [String: String] = [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
    ]

    public let codec: VideoTranscodeCodec
    public let keepsTenBits: Bool
    public let colorTags: [String: String]
    public let frameRate: Float
    public let bitRateCeiling: Int
    public let audioChannels: Int?

    public init(source: VideoSourceTraits, bitRateCeiling: Int, encodesHEVC: Bool) {
        codec = encodesHEVC ? .hevc : .h264
        keepsTenBits = encodesHEVC && source.isHDR
        colorTags = source.colorTags ?? Self.bt709Tags
        frameRate = source.nominalFrameRate > 0 ? min(source.nominalFrameRate, Self.frameRateCeiling) : Self.frameRateCeiling
        self.bitRateCeiling = bitRateCeiling
        audioChannels = source.audioChannelCount.map { min(max($0, 1), 2) }
    }

    /// **Le plafond d'une copie GARDÉE** (galerie) : 0,15 bit par pixel et par
    /// image, soit ≈ 37 Mb/s pour une 4K à 30 i/s. La qualité visée gouverne ; ce
    /// plafond ne fait que borner un cas pathologique, il ne rabote jamais la
    /// définition ni ne vise un débit d'envoi.
    public static func archivalCeiling(width: Int, height: Int, frameRate: Float) -> Int {
        let cadence = frameRate > 0 ? Int(frameRate.rounded()) : Int(frameRateCeiling)
        return width * height * cadence * 15 / 100
    }

    public var readerPixelFormat: OSType {
        keepsTenBits ? kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange : kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
    }

    public var profileLevel: String {
        switch codec {
        case .hevc: return keepsTenBits ? kVTProfileLevel_HEVC_Main10_AutoLevel as String : kVTProfileLevel_HEVC_Main_AutoLevel as String
        case .h264: return AVVideoProfileLevelH264HighAutoLevel
        }
    }

    /// La qualité visée d'abord, puis le débit seul pour un encodeur qui refuse
    /// `AVVideoQualityKey` (l'hôte garde le premier que `canApply` accepte).
    public func videoSettingsCandidates(width: Int, height: Int) -> [[String: Any]] {
        [videoSettings(width: width, height: height, targetsQuality: true),
         videoSettings(width: width, height: height, targetsQuality: false)]
    }

    private func videoSettings(width: Int, height: Int, targetsQuality: Bool) -> [String: Any] {
        let ceiling: [String: Any] = [
            AVVideoAverageBitRateKey: bitRateCeiling,
            AVVideoExpectedSourceFrameRateKey: frameRate,
            AVVideoProfileLevelKey: profileLevel,
            AVVideoMaxKeyFrameIntervalKey: Int(frameRate) * 2,
        ]
        let quality: [String: Any] = targetsQuality ? [AVVideoQualityKey: Self.perceptualQuality] : [:]
        return [
            AVVideoCodecKey: codec.avCodec,
            AVVideoWidthKey: width,
            AVVideoHeightKey: height,
            AVVideoCompressionPropertiesKey: ceiling.merging(quality) { garde, _ in garde },
            AVVideoColorPropertiesKey: colorTags,
        ]
    }

    public var audioWriterSettings: [String: Any]? {
        audioChannels.map { channels in
            [
                AVFormatIDKey: kAudioFormatMPEG4AAC,
                AVSampleRateKey: Self.audioSampleRate,
                AVNumberOfChannelsKey: channels,
                AVChannelLayoutKey: Self.channelLayout(channels),
                AVEncoderBitRateKey: Self.audioBitRate,
            ]
        }
    }

    public var audioReaderSettings: [String: Any]? {
        audioChannels.map { channels in
            [
                AVFormatIDKey: kAudioFormatLinearPCM,
                AVSampleRateKey: Self.audioSampleRate,
                AVNumberOfChannelsKey: channels,
                AVChannelLayoutKey: Self.channelLayout(channels),
                AVLinearPCMBitDepthKey: 16,
                AVLinearPCMIsFloatKey: false,
                AVLinearPCMIsBigEndianKey: false,
                AVLinearPCMIsNonInterleaved: false,
            ]
        }
    }

    private static func channelLayout(_ channels: Int) -> Data {
        var layout = AudioChannelLayout()
        layout.mChannelLayoutTag = channels == 1 ? kAudioChannelLayoutTag_Mono : kAudioChannelLayoutTag_Stereo
        return withUnsafeBytes(of: layout) { Data($0) }
    }
}

/// **Ce que l'appareil sait ENCODER** — pas décoder (#11290).
///
/// `VTIsHardwareDecodeSupported` répondait à une autre question : un appareil
/// peut lire du HEVC sans savoir en écrire. La liste des encodeurs de
/// VideoToolbox, elle, ne nomme que ce qui encode. Sur iOS ses entrées H.264 et
/// HEVC sont matérielles, et la clé `IsHardwareAccelerated` y est absente : la
/// présence du codec suffit.
public enum VideoEncoderAvailability {
    public static let encodesHEVC: Bool = encodes(kCMVideoCodecType_HEVC)

    public static func encodes(_ codec: CMVideoCodecType) -> Bool {
        var list: CFArray?
        guard VTCopyVideoEncoderList(nil, &list) == noErr,
              let encoders = list as? [[String: Any]] else { return false }
        return encoders.contains { encoder in
            (encoder[kVTVideoEncoderList_CodecType as String] as? NSNumber)?.uint32Value == codec
        }
    }
}
