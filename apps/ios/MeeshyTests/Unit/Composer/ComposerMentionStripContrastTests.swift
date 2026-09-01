import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshyUI

/// **Le @pseudo de la bande des mentions se LIT, sur les trois teintes du
/// plateau** (#4122).
///
/// Le pseudo n'est pas décoratif : c'est lui qui désambiguïse deux contacts au
/// nom d'affichage proche, et c'est lui qu'on insère dans le texte.
///
/// ## Ce que la mesure a rendu, et qui contredit le remède intuitif
///
/// L'issue décrivait « une couleur CLAIRE sur le matériau de verre de la bande,
/// lui aussi clair sur ce plateau », et demandait un token plus contrasté. La
/// mesure dit l'inverse : le plateau est SOMBRE par doctrine — `PlateauTint`
/// n'offre que `noir`, `indigoProfond` et `violetProfond`, parce qu'« un fond
/// sombre laisse la scène être la seule source de lumière ». Le pseudo y tient
/// **6,62:1 au pire cas**, et le token plus discret qu'on aurait posé
/// (`textMuted`) y tomberait à **4,01:1**.
///
/// > Un remède intuitif se mesure avant d'être posé : celui-ci aurait dégradé
/// > sous le seuil ce qu'il prétendait réparer, et le témoin l'aurait laissé
/// > passer s'il avait vérifié l'usage d'un token plutôt que le CONTRASTE.
///
/// Ces témoins existent donc pour verrouiller une lecture juste, pas pour
/// garder un correctif : la prochaine main qui trouvera `isDark: true` « figé »
/// et le fera suivre le `colorScheme` peindra du texte sombre sur un fond
/// sombre en thème clair — et rougira ici.
///
/// Patron de `ComposerSendButtonContrastTests`, qui réutilise déjà
/// `CallBannerContrast.contrastRatio`.
final class ComposerMentionStripContrastTests: XCTestCase {

    /// AA texte normal. Le pseudo est petit (11 pt) : le seuil « grand texte »
    /// (3:1) ne s'applique pas.
    private let seuilAA: Double = 4.5

    /// Le fond RÉEL sous le texte : la capsule de l'entrée, `textPrimary` à
    /// 6 % par-dessus la teinte du plateau. Mesurer sur la teinte nue
    /// donnerait un chiffre plus favorable que ce que l'œil reçoit.
    private func capsule(sur plateau: PlateauTint) -> Color {
        Self.compose(MeeshyColors.textPrimary(isDark: true), sur: plateau.color, alpha: 0.06)
    }

    /// Composition alpha AVANT la luminance — même loi que `textMuted` (D-18) :
    /// mesurer une couleur translucide sans la composer sur son fond rend un
    /// ratio qui n'existe nulle part à l'écran.
    private static func compose(_ dessus: Color, sur dessous: Color, alpha: Double) -> Color {
        let a = UIColor(dessus).cgColor.components ?? [0, 0, 0, 1]
        let b = UIColor(dessous).cgColor.components ?? [0, 0, 0, 1]
        return Color(red: Double(a[0]) * alpha + Double(b[0]) * (1 - alpha),
                     green: Double(a[1]) * alpha + Double(b[1]) * (1 - alpha),
                     blue: Double(a[2]) * alpha + Double(b[2]) * (1 - alpha))
    }

    /// **Le ratio tel que l'ŒIL le reçoit** — la loi ci-dessus appliquée aux
    /// DEUX couleurs, pas seulement au fond.
    ///
    /// C'est le correctif du 2026-09-01, et il vaut d'être dit : la première
    /// version de ce fichier composait scrupuleusement la capsule et mesurait
    /// le TEXTE brut. Or `textMuted(isDark:)` vaut `indigo300.opacity(0.7)` et
    /// `textSecondary(isDark:)` vaut `indigo300` — mêmes composantes RVB. Comme
    /// `CallBannerContrast.contrastRatio` passe par `.luminance`, qui ignore le
    /// canal alpha, les deux tokens rendaient le MÊME chiffre : le témoin
    /// mesurait `textSecondary` en croyant mesurer `textMuted`, et concluait
    /// que le token discret tenait AA. Il tient 4,01:1.
    ///
    /// > Un témoin qui ÉNONCE une loi et ne l'applique qu'à une des deux
    /// > couleurs qu'il compare rend un ratio qui n'existe nulle part à
    /// > l'écran — et va jusqu'à CONTREDIRE le code juste qu'il garde. La loi
    /// > était écrite dans ce fichier, dix lignes au-dessus de l'endroit qui
    /// > la violait ; ce qui manquait n'était pas la connaissance, c'était son
    /// > application au second argument.
    ///
    /// Le token est donc APLATI sur son fond avec son propre alpha. Pour un
    /// token opaque le résultat est identique à la mesure directe, ce qui rend
    /// ce chemin sûr pour les trois témoins.
    private func ratioRendu(_ texte: Color, sur fond: Color) -> Double {
        let alpha = Double(UIColor(texte).cgColor.alpha)
        let aplati = alpha >= 1 ? texte : Self.compose(texte, sur: fond, alpha: alpha)
        return CallBannerContrast.contrastRatio(aplati, fond)
    }

    /// **LE témoin de l'issue.** Sur les TROIS teintes, jamais sur celle qui a
    /// révélé le défaut : une bande qui ne tiendrait que sur le noir serait
    /// illisible pour quiconque garde le réglage par défaut.
    func test_lePseudo_tientAA_surLesTroisTeintesDuPlateau() {
        for teinte in PlateauTint.allCases {
            let ratio = ratioRendu(MeeshyColors.textSecondary(isDark: true),
                                   sur: capsule(sur: teinte))
            XCTAssertGreaterThanOrEqual(
                ratio, seuilAA,
                "le @pseudo sur le plateau \(teinte.rawValue) : \(ratio):1 — "
                + "c'est lui qui désambiguïse deux contacts au nom proche")
        }
    }

    /// Le nom d'affichage aussi — il est plus contrasté, mais un témoin qui ne
    /// garderait que la ligne fautive laisserait l'autre dériver seule.
    func test_leNomDAffichage_tientAA_surLesTroisTeintes() {
        for teinte in PlateauTint.allCases {
            let ratio = ratioRendu(MeeshyColors.textPrimary(isDark: true),
                                   sur: capsule(sur: teinte))
            XCTAssertGreaterThanOrEqual(ratio, seuilAA, "\(teinte.rawValue) : \(ratio):1")
        }
    }

    /// **Le remède intuitif, mesuré.** `textMuted` est le token AA du dépôt pour
    /// du texte secondaire — mais il a été calibré contre `backgroundSecondary`,
    /// pas contre une capsule posée sur un plateau. Ce témoin garde la RAISON
    /// pour laquelle il n'a pas été retenu ici ; sans elle, le prochain lecteur
    /// referait le raisonnement et poserait le token.
    func test_leTokenPlusDiscret_tomberaitSOUSLeSeuil() {
        let pire = ratioRendu(MeeshyColors.textMuted(isDark: true),
                              sur: capsule(sur: .violetProfond))
        XCTAssertLessThan(pire, seuilAA,
                          "mesuré \(pire):1 — si ce ratio repassait au-dessus, `textMuted` "
                          + "redeviendrait un candidat et ce témoin devrait être relu, pas supprimé")
    }

    /// **La loi de composition se garde ELLE-MÊME.** Sans ce témoin, quelqu'un
    /// pourrait remplacer `ratioRendu` par un appel direct à `contrastRatio` :
    /// les trois témoins ci-dessus resteraient VERTS (leurs tokens sont
    /// opaques) et celui de `textMuted` rougirait sans dire pourquoi.
    ///
    /// Il affirme la seule chose qui distingue les deux chemins : un token
    /// TRANSLUCIDE mesuré sans composition rend un ratio plus favorable que ce
    /// que l'œil reçoit. Ici l'écart sépare un token qui passe AA d'un token
    /// qui n'y est pas — 6,62:1 contre 4,01:1.
    func test_ignorerLAlpha_rendUnRatioQuiNExistePasALEcran() {
        let fond = capsule(sur: .violetProfond)
        let muted = MeeshyColors.textMuted(isDark: true)

        let brut = CallBannerContrast.contrastRatio(muted, fond)
        let rendu = ratioRendu(muted, sur: fond)

        XCTAssertGreaterThan(
            brut, rendu + 1.0,
            "mesurer un token à 70 % sans le composer FLATTE le contraste — "
            + "brut \(brut):1 contre rendu \(rendu):1")
        XCTAssertGreaterThanOrEqual(brut, seuilAA, "et le chiffre flatté passerait le seuil…")
        XCTAssertLessThan(rendu, seuilAA, "…que le vrai ne passe pas.")
    }

    /// **Le plateau est sombre PAR CONSTRUCTION**, et c'est ce qui rend
    /// `isDark: true` juste plutôt que figé. Ce témoin tombe si une quatrième
    /// teinte claire arrive — auquel cas la bande devra bel et bien suivre son
    /// fond, et les trois témoins ci-dessus le diront.
    func test_toutesLesTeintesDuPlateau_sontSOMBRES() {
        for teinte in PlateauTint.allCases {
            let surBlanc = CallBannerContrast.contrastRatio(teinte.color, .white)
            XCTAssertGreaterThan(surBlanc, 7,
                                 "\(teinte.rawValue) doit rester un fond sombre")
        }
    }
}
