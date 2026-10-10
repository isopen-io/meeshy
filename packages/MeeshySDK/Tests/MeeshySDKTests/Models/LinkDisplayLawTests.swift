import Foundation
import Testing
@testable import MeeshySDK

/// #9093 — un lien s'écrit de quatre façons, et UNE loi décide ce qu'on lit et
/// où il mène. Jumelle web : `resolveLinkDisplay` (`apps/web/src/lib/links/link-display.ts`).
struct LinkDisplayLawTests {

    private static let origin = "https://staging.meeshy.me"
    private static let adresse = "https://exemple.test/a"
    private static let carte = [adresse: "Tok123"]

    private func url(_ string: String) -> URL { URL(string: string)! }

    private func resolve(_ link: WrittenLink, _ map: [String: String]? = carte) -> LinkDisplay? {
        LinkDisplayLaw.resolve(link, trackedLinks: map, webOrigin: Self.origin)
    }

    @Test func verbatim_sAfficheTelQuel_etSOuvreEnDirect_memeSuiviParLaCarte() {
        let shown = resolve(.verbatim(text: Self.adresse, url: url(Self.adresse)))
        #expect(shown == LinkDisplay(text: Self.adresse, url: url(Self.adresse), isTracked: false))
    }

    @Test func libelle_suivi_montreLeLibelle_etPasseParL() {
        let shown = resolve(.labelled(label: "le doc", url: url(Self.adresse)))
        #expect(shown == LinkDisplay(text: "le doc", url: url("https://staging.meeshy.me/l/Tok123"), isTracked: true))
    }

    @Test func libelle_horsCarte_sOuvreEnDirect() {
        let shown = resolve(.labelled(label: "le doc", url: url("https://ailleurs.test")))
        #expect(shown == LinkDisplay(text: "le doc", url: url("https://ailleurs.test"), isTracked: false))
    }

    @Test func brut_suivi_sAfficheMPlusToken_etPasseParL() {
        let shown = resolve(.bare(text: Self.adresse, url: url(Self.adresse)))
        #expect(shown == LinkDisplay(text: "m+Tok123", url: url("https://staging.meeshy.me/l/Tok123"), isTracked: true))
    }

    @Test func brut_suiviAvecPonctuation_rendLaPonctuationAuTexte() {
        let shown = resolve(.bare(text: "\(Self.adresse).", url: url("\(Self.adresse).")))
        #expect(shown == LinkDisplay(text: "m+Tok123", url: url("https://staging.meeshy.me/l/Tok123"),
                                     isTracked: true, remainder: "."))
    }

    @Test func brut_horsCarte_gardeLAdresseAffichee_enDirect() {
        let shown = resolve(.bare(text: "https://ailleurs.test/x", url: url("https://ailleurs.test/x")))
        #expect(shown == LinkDisplay(text: "https://ailleurs.test/x", url: url("https://ailleurs.test/x"), isTracked: false))
    }

    @Test func codeCourt_resteLitteral_etPasseParL() {
        let shown = resolve(.shortCode(token: "Ab12cd"), nil)
        #expect(shown == LinkDisplay(text: "m+Ab12cd", url: url("https://staging.meeshy.me/l/Ab12cd"), isTracked: true))
    }

    @Test func jetonHostileDansLaCarte_neSePoseJamaisDansUneAdresse() {
        let shown = resolve(.bare(text: Self.adresse, url: url(Self.adresse)), [Self.adresse: "../admin"])
        #expect(shown?.isTracked == false)
        #expect(shown?.text == Self.adresse)
    }
}
