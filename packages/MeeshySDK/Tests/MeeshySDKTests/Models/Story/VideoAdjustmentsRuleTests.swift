import Testing
import Foundation
@testable import MeeshySDK

/// **Une vidéo posée se règle avec la MÊME chaîne qu'une image, restreinte par
/// une règle écrite** (#9169). Netteté et flou ne sont pas servis à une vidéo :
/// accentuer une trame compressée fait scintiller ses blocs d'une image à
/// l'autre, et le flou gaussien est l'étage le plus coûteux de la chaîne, à
/// payer trente fois par seconde.
struct VideoAdjustmentsRuleTests {

    @Test func uneImage_recoitTousLesReglages() {
        #expect(AdjustmentKind.served(for: .image) == AdjustmentKind.allCases)
    }

    @Test func uneVideo_neRecoitNiNetteteNiFlou() {
        let servis = AdjustmentKind.served(for: .video)
        #expect(!servis.contains(.sharpness))
        #expect(!servis.contains(.blur))
        #expect(servis == [.exposure, .brightness, .contrast, .saturation, .vibrance, .temperature, .vignette])
    }

    @Test func lesTroisReglagesDeLAncienEditeurVideo_sontServis() {
        let servis = AdjustmentKind.served(for: .video)
        #expect(servis.contains(.brightness) && servis.contains(.contrast) && servis.contains(.saturation))
    }

    @Test func laProjectionVideo_neutraliseCeQuUneVideoNePeintPas() {
        let reglages = ImageAdjustments(exposure: 0.5, contrast: 1.2, sharpness: 0.8, blur: 0.6)
        let video = reglages.served(for: .video)
        #expect(video == ImageAdjustments(exposure: 0.5, contrast: 1.2))
        #expect(reglages.served(for: .image) == reglages)
    }

    @Test func uneChargeQuiNePorteQueDuFlou_estNeutrePourUneVideo() {
        #expect(ImageAdjustments(blur: 1).served(for: .video).isNeutral,
                "La charge ne décide jamais du coût d'un rendu vidéo.")
    }
}
