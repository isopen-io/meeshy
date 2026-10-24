import Foundation
import Testing
@testable import MeeshySDK

/// #11288 — la fenêtre LOINTAINE des réels (N±3 à N±10) ne charge que la tête
/// du fichier : `moov` et premier GOP, bornés par le tier de l'appareil. Le
/// reste arrive en flux quand le réel est élu (palier monté ou décode).
@Suite("ReelPreloadWindow.headBytes — la tête amorcée de la fenêtre lointaine")
struct ReelHeadBytesTests {

    typealias Law = ReelPreloadWindow

    private let open = Law.Network(effectiveType: .fourG)

    @Test("seul le palier « amorcé » prend une tête : les proches prennent le fichier entier")
    func onlyThePrimeTierTakesAHead() {
        #expect(Law.headBytes(tier: .play, distance: 0, network: open, device: .pro) == 0)
        #expect(Law.headBytes(tier: .decode, distance: 1, network: open, device: .pro) == 0)
        #expect(Law.headBytes(tier: .mount, distance: 2, network: open, device: .pro) == 0)
        #expect(Law.headBytes(tier: .idle, distance: 11, network: open, device: .pro) == 0)
        #expect(Law.headBytes(tier: .prime, distance: 3, network: open, device: .pro) > 0)
    }

    @Test("sans plafond d'appareil, la tête est l'amorce de la loi jumelle")
    func unboundedDevicesTakeTheTwinPrimeBytes() {
        for device in [DeviceMediaTier.high, .pro] {
            #expect(Law.headBytes(tier: .prime, distance: 3, network: open, device: device)
                    == Law.primeBytes(tier: .prime, distance: 3, network: open))
            #expect(Law.headBytes(tier: .prime, distance: 9, network: open, device: device)
                    == Law.primeBytes(tier: .prime, distance: 9, network: open))
        }
        #expect(Law.headBytes(tier: .prime, distance: 3, network: open, device: nil)
                == Law.primeBytes(tier: .prime, distance: 3, network: open))
    }

    @Test("le tier de l'appareil borne la tête : bas < moyen ≤ haut")
    func theDeviceTierBoundsTheHead() {
        let low = Law.headBytes(tier: .prime, distance: 3, network: open, device: .low)
        let mid = Law.headBytes(tier: .prime, distance: 3, network: open, device: .mid)
        let high = Law.headBytes(tier: .prime, distance: 3, network: open, device: .high)
        #expect(low < mid)
        #expect(mid < high)
        #expect(low >= Law.minimumHeadBytes, "la tête garde de quoi porter `moov` et la première image")
    }

    @Test("le plafond d'appareil ne relève jamais une amorce déjà petite")
    func theDeviceCapNeverRaisesTheTwin() {
        let saving = Law.Network(saveData: true)
        for device in DeviceMediaTier.allCases {
            #expect(Law.headBytes(tier: .prime, distance: 9, network: saving, device: device)
                    <= Law.primeBytes(tier: .prime, distance: 9, network: saving))
        }
    }

    @Test("une tête est toujours plus petite que l'amorce du réel monté")
    func aHeadIsSmallerThanTheMountedReelPrime() {
        let mount = Law.primeBytes(tier: .mount, distance: 2, network: open)
        for device in DeviceMediaTier.allCases {
            #expect(Law.headBytes(tier: .prime, distance: 3, network: open, device: device) < mount)
        }
    }
}
