import AVFoundation
import CoreMedia
import CoreVideo
import VideoToolbox
import XCTest
@testable import MeeshySDK

/// #11290 — une vidéo ré-encodée sur iPhone garde sa stéréo, son 48 kHz et son
/// HDR, et vise une QUALITÉ plutôt qu'un débit. Verdict porteur #11247
/// (2026-10-22) : une génération perceptuelle, profil couleur et HDR conservés ;
/// le HDR HLG reste en 10 bits d'iPhone à iPhone, le serveur fabrique le SDR.
final class VideoTranscodeRecipeTests: XCTestCase {

    // MARK: - Le son

    func test_audio_aStereoSourceStaysStereoAt48kHzAnd128kbps() throws {
        let recipe = Self.recipe(audioChannels: 2)
        let writer = try XCTUnwrap(recipe.audioWriterSettings, "une source qui a du son en garde")
        XCTAssertEqual(writer[AVNumberOfChannelsKey] as? Int, 2, "la stéréo de la prise survit")
        XCTAssertEqual(writer[AVSampleRateKey] as? Int, 48_000)
        XCTAssertEqual(writer[AVEncoderBitRateKey] as? Int, 128_000)
        XCTAssertEqual(writer[AVFormatIDKey] as? AudioFormatID, kAudioFormatMPEG4AAC)
    }

    func test_audio_theReaderDecodesAtTheWriterLayout() throws {
        let recipe = Self.recipe(audioChannels: 2)
        let reader = try XCTUnwrap(recipe.audioReaderSettings)
        XCTAssertEqual(reader[AVNumberOfChannelsKey] as? Int, 2)
        XCTAssertEqual(reader[AVSampleRateKey] as? Int, 48_000)
        XCTAssertEqual(reader[AVFormatIDKey] as? AudioFormatID, kAudioFormatLinearPCM)
        XCTAssertEqual(reader[AVChannelLayoutKey] as? Data, recipe.audioWriterSettings?[AVChannelLayoutKey] as? Data,
                       "lecteur et écrivain parlent la même disposition de canaux")
    }

    func test_audio_aMonoSourceStaysMono() throws {
        let writer = try XCTUnwrap(Self.recipe(audioChannels: 1).audioWriterSettings)
        XCTAssertEqual(writer[AVNumberOfChannelsKey] as? Int, 1, "rien n'est inventé")
    }

    func test_audio_moreThanTwoChannelsFoldIntoStereo() throws {
        let writer = try XCTUnwrap(Self.recipe(audioChannels: 4).audioWriterSettings)
        XCTAssertEqual(writer[AVNumberOfChannelsKey] as? Int, 2, "l'AAC d'envoi est stéréo au plus")
    }

    func test_audio_aSilentSourceHasNoAudioTrack() {
        let recipe = Self.recipe(audioChannels: nil)
        XCTAssertNil(recipe.audioWriterSettings)
        XCTAssertNil(recipe.audioReaderSettings)
    }

    // MARK: - La qualité, le débit en plafond

    func test_video_targetsAQualityWithTheBitRateAsCeiling() throws {
        let settings = try XCTUnwrap(Self.recipe().videoSettingsCandidates(width: 720, height: 1280).first)
        let compression = try XCTUnwrap(settings[AVVideoCompressionPropertiesKey] as? [String: Any])
        XCTAssertEqual(compression[AVVideoQualityKey] as? Double, VideoTranscodeRecipe.perceptualQuality)
        XCTAssertEqual(VideoTranscodeRecipe.perceptualQuality, 0.6, accuracy: 0.05)
        XCTAssertEqual(compression[AVVideoAverageBitRateKey] as? Int, 2_500_000, "le débit du contexte borne")
    }

    func test_video_fallsBackToTheCeilingAloneWhenTheEncoderRefusesQuality() throws {
        let candidates = Self.recipe().videoSettingsCandidates(width: 720, height: 1280)
        XCTAssertEqual(candidates.count, 2, "la qualité d'abord, puis le débit seul")
        let fallback = try XCTUnwrap(candidates.last?[AVVideoCompressionPropertiesKey] as? [String: Any])
        XCTAssertNil(fallback[AVVideoQualityKey])
        XCTAssertEqual(fallback[AVVideoAverageBitRateKey] as? Int, 2_500_000)
    }

    func test_video_keepsAFrameRateUpTo30() {
        XCTAssertEqual(Self.recipe(frameRate: 24).frameRate, 24, "≤ 30 i/s conservé")
        XCTAssertEqual(Self.recipe(frameRate: 60).frameRate, 30)
        XCTAssertEqual(Self.recipe(frameRate: 0).frameRate, 30, "une cadence muette prend le plafond")
    }

    // MARK: - Le HDR et l'étiquette couleur

    func test_hdr_anHLGSourceStaysTenBitHEVCMain10WithItsTags() throws {
        let recipe = Self.recipe(colorTags: Self.hlg)
        XCTAssertEqual(recipe.codec, .hevc)
        XCTAssertTrue(recipe.keepsTenBits)
        XCTAssertEqual(recipe.readerPixelFormat, kCVPixelFormatType_420YpCbCr10BiPlanarVideoRange)
        let settings = try XCTUnwrap(recipe.videoSettingsCandidates(width: 720, height: 1280).first)
        let compression = try XCTUnwrap(settings[AVVideoCompressionPropertiesKey] as? [String: Any])
        XCTAssertEqual(compression[AVVideoProfileLevelKey] as? String, kVTProfileLevel_HEVC_Main10_AutoLevel as String)
        XCTAssertEqual(settings[AVVideoColorPropertiesKey] as? [String: String], Self.hlg)
    }

    func test_hdr_aPQSourceStaysTenBitToo() {
        let recipe = Self.recipe(colorTags: Self.pq)
        XCTAssertTrue(recipe.keepsTenBits)
        XCTAssertEqual(recipe.profileLevel, kVTProfileLevel_HEVC_Main10_AutoLevel as String)
    }

    func test_sdr_anUntaggedSourceIsTaggedBT709Explicitly() throws {
        let recipe = Self.recipe(colorTags: nil)
        XCTAssertFalse(recipe.keepsTenBits)
        XCTAssertEqual(recipe.readerPixelFormat, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
        XCTAssertEqual(recipe.profileLevel, kVTProfileLevel_HEVC_Main_AutoLevel as String)
        XCTAssertEqual(recipe.colorTags, [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ])
    }

    func test_sdr_aDisplayP3SourceKeepsItsTags() {
        let p3 = [
            AVVideoColorPrimariesKey: AVVideoColorPrimaries_P3_D65,
            AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
            AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
        ]
        let recipe = Self.recipe(colorTags: p3)
        XCTAssertEqual(recipe.colorTags, p3, "#9332 : une prise P3 ne ressort pas délavée")
        XCTAssertFalse(recipe.keepsTenBits)
    }

    // MARK: - L'encodeur, pas le décodeur

    func test_codec_followsTheEncoderAvailability() {
        XCTAssertEqual(Self.recipe(encodesHEVC: false).codec, .h264)
        XCTAssertEqual(Self.recipe(encodesHEVC: false).profileLevel, AVVideoProfileLevelH264HighAutoLevel)
    }

    func test_hdr_withoutAnHEVCEncoder_neverClaimsTenBits() {
        let recipe = Self.recipe(colorTags: Self.hlg, encodesHEVC: false)
        XCTAssertFalse(recipe.keepsTenBits, "H.264 matériel n'écrit pas de 10 bits")
        XCTAssertEqual(recipe.readerPixelFormat, kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange)
    }

    // MARK: - Le plafond d'une copie gardée (galerie)

    func test_archivalCeiling_growsWithTheDefinitionAndStaysAQualityGuard() {
        let uhd = VideoTranscodeRecipe.archivalCeiling(width: 2160, height: 3840, frameRate: 30)
        let hd = VideoTranscodeRecipe.archivalCeiling(width: 1080, height: 1920, frameRate: 30)
        XCTAssertEqual(uhd, hd * 4, "quatre fois les pixels, quatre fois le plafond")
        XCTAssertGreaterThanOrEqual(uhd, 30_000_000, "une 4K gardée n'est jamais affamée par son plafond")
        XCTAssertEqual(VideoTranscodeRecipe.archivalCeiling(width: 1080, height: 1920, frameRate: 0), hd,
                       "une cadence muette compte 30 i/s")
    }

    // MARK: - Fabriques

    private static let hlg = [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_2100_HLG,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020,
    ]

    private static let pq = [
        AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_2020,
        AVVideoTransferFunctionKey: AVVideoTransferFunction_SMPTE_ST_2084_PQ,
        AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_2020,
    ]

    private static func recipe(colorTags: [String: String]? = nil, frameRate: Float = 30,
                               audioChannels: Int? = 2, encodesHEVC: Bool = true) -> VideoTranscodeRecipe {
        VideoTranscodeRecipe(source: VideoSourceTraits(colorTags: colorTags, nominalFrameRate: frameRate,
                                                       audioChannelCount: audioChannels),
                             bitRateCeiling: 2_500_000, encodesHEVC: encodesHEVC)
    }
}
