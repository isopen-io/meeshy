import XCTest
@testable import MeeshyUI

/// **La légende repliée se pose SUR l'image, sans cartouche** (directive
/// porteur 2026-09-01).
///
/// > « sans dégradé noir transparent, mais posé correctement sur l'image et
/// > correctement aligné exactement comme sur la card des réels — il faut
/// > appliquer la même approche pour les story aussi »
///
/// Deux affirmations, deux gardes, et la seconde est celle qui s'est révélée en
/// retirant la première : le voile MASQUAIT un débordement.
final class MediaCaptionOverlayLayoutGuardTests: XCTestCase {

    /// **La racine vient de `ComposerSourceGuard`, jamais d'un comptage de
    /// `deleteLastPathComponent` recopié.** Ce fichier vit un niveau plus haut
    /// que les gardes du composer ; recopier leur « 5 » remontait un cran trop
    /// loin et cherchait la source dans `packages/Sources/…` — une garde qui
    /// échoue sur son propre chemin ne mesure rien du code qu'elle protège.
    private func source() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    private func corps(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "{" { profondeur += 1 }
            if caractere == "}" {
                profondeur -= 1
                if profondeur == 0 { return resultat }
            }
        }
        return nil
    }

    /// **Garde NÉGATIVE.** Les deux hôtes peignent déjà un voile de bas de page
    /// (`ReelsPlayerView`, la story) ; un second posé sur la seule bande du
    /// texte n'assombrit pas un fond, il dessine un cartouche autour d'une
    /// ligne — que ni le nom de l'auteur ni la rangée de méta ne portent.
    /// Ce qui rend le texte lisible est `legibleOverCanvas()`, la manière de
    /// `ReelFeedCard`.
    func test_laLégendeRepliée_neDessinePasDeCartouche() throws {
        guard let repliee = corps("private var collapsedCaption: some View {", dans: try source()) else {
            return XCTFail("`collapsedCaption` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertFalse(repliee.contains("LinearGradient"),
                       "La légende repliée ne porte plus de voile à elle.")
        XCTAssertFalse(repliee.contains(".background("),
                       "Aucun fond sous la légende repliée : elle se pose sur l'image.")
        XCTAssertTrue(repliee.contains("legibleOverCanvas()"),
                      "C'est l'ombre portée qui la rend lisible, et rien d'autre.")
    }

    /// **Le retrait vient AVANT le cadre, dans les deux états.**
    ///
    /// Posé après un `frame(maxWidth: .infinity)`, un `padding` n'ampute pas la
    /// vue : il l'élargit de `2 × inset`, elle se centre, et le texte sort par
    /// la gauche. Mesuré sur la story au simulateur `Meeshy-iOS26` — « Le »
    /// disparaissait hors écran. Le voile retiré, le défaut s'est vu ; il était
    /// là avant.
    func test_leRetrait_estPoséAVANTLeCadre_dansLesDeuxÉtats() throws {
        let code = try source()
        for ancre in ["private var collapsedCaption: some View {",
                      "private var expandedCaption: some View {"] {
            guard let bloc = corps(ancre, dans: code) else {
                return XCTFail("`\(ancre)` introuvable.")
            }
            guard let retrait = bloc.range(of: ".padding(.horizontal, horizontalInset)"),
                  let cadre = bloc.range(of: ".frame(maxWidth: .infinity") else {
                return XCTFail("Retrait ou cadre absent de `\(ancre)`.")
            }
            XCTAssertLessThan(
                retrait.lowerBound, cadre.lowerBound,
                "Dans `\(ancre)`, le `padding` doit précéder le `frame(maxWidth: .infinity)` — posé "
                    + "après, il fait DÉBORDER la vue et le texte sort par la gauche."
            )
        }
    }

    /// Le retrait est DIT par l'hôte : le lecteur de réel aligne sa légende sur
    /// sa colonne (16 pt, déjà posés), la story sur la sienne (20 pt).
    func test_leRetrait_estUnParamètre_pasUnLittéral() throws {
        let code = try source()
        XCTAssertTrue(code.contains("horizontalInset: CGFloat"),
                      "Le retrait doit rester paramétrable — sinon aucun hôte ne peut aligner.")
        XCTAssertFalse(code.contains(".padding(.horizontal, 20)"),
                       "Plus aucun retrait EN DUR : c'est lui qui indentait la légende de 36 pt "
                           + "dans un lecteur dont la colonne est à 16.")
    }
}
