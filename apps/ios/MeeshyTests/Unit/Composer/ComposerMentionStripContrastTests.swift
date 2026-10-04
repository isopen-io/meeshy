import XCTest
import SwiftUI
@testable import Meeshy
@testable import MeeshyUI

/// **Le @pseudo de la bande des mentions se LIT, sur CHAQUE fond où la bande
/// apparaît** (#4122).
///
/// Le pseudo n'est pas décoratif : c'est lui qui désambiguïse deux contacts au
/// nom d'affichage proche, et c'est lui qu'on insère dans le texte.
///
/// ## Deux fonds, et le second a changé de nature
///
/// La bande a quatre hôtes, et ils posent DEUX fonds distincts :
///
/// - **le plateau** — le champ du document (`ComposerDocumentSurface`) et
///   l'éditeur d'objet (`ComposerObjectEditorView`). Ses trois teintes sont
///   sombres par doctrine (`PlateauTint`) ;
/// - **la scène** — le calque de description (`ComposerDescriptionLayer`),
///   monté par le volet de légende posé SUR la carte (#6126) et par l'éditeur
///   qui flotte sur elle (directive porteur 2026-09-28). Sa couleur est celle
///   que l'AUTEUR choisit : un pastel, une capture d'écran blanche.
///
/// Une première lecture (2026-09-01) n'a vu que le plateau, et a conclu que
/// `isDark: true` était juste — **6,31:1** au pire cas. C'était vrai le jour
/// où elle a été écrite. Depuis #6126/#6127, le calque se pose sur la scène
/// et épingle le `colorScheme` du FOND ; la bande, elle, peignait toujours
/// `indigo300` sur une capsule à 8 % d'`indigo50` — **1,98:1** sur une scène
/// blanche, **1,22:1** sur un média de luminance 0,35 (que `CanvasChromeScheme`
/// sert encore en chrome SOMBRE). Le défaut de l'issue était revenu, sur
/// l'hôte qu'elle ne mesurait pas.
///
/// > Un témoin de contraste mesure un HÔTE. Quand un composant partagé gagne
/// > un hôte, le témoin ne rougit pas : il continue de dire vrai sur ceux
/// > qu'il connaît.
///
/// D'où `ComposerMentionStripBackdrop` : l'hôte DÉCLARE ce qu'il y a derrière
/// la bande, et la bande en tire son encre et sa capsule. Sur la scène, la
/// capsule devient le fond PRIMAIRE du schéma, opaque — la seule base qui tient
/// sur une couleur qu'on ne connaît pas.
///
/// Patron de `ComposerSendButtonContrastTests`, qui réutilise déjà
/// `CallBannerContrast.contrastRatio`.
final class ComposerMentionStripContrastTests: XCTestCase {

    /// AA texte normal. Le pseudo est petit (footnote) : le seuil « grand
    /// texte » (3:1) ne s'applique pas.
    private let seuilAA: Double = 4.5

    /// Les scènes EXTRÊMES. Une scène est arbitraire et le verre qui la couvre
    /// ne se mesure pas : la capsule doit tenir sur les deux bouts de la
    /// gamme, quel que soit le schéma que `CanvasChromeScheme` a élu — une
    /// photo sombre EN MOYENNE porte des zones blanches.
    private let scenesExtremes: [(nom: String, couleur: Color)] = [
        ("blanche", .white), ("noire", .black), ("grise L 0,35", Color(white: 0.63))
    ]

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

    /// Une couleur APLATIE sur son fond avec son propre alpha. Pour une couleur
    /// opaque, elle-même.
    private static func aplatir(_ couleur: Color, sur fond: Color) -> Color {
        let alpha = Double(UIColor(couleur).cgColor.alpha)
        return alpha >= 1 ? couleur : compose(couleur, sur: fond, alpha: alpha)
    }

    /// Le fond RÉEL sous le texte : la capsule que la BANDE peint (son
    /// opacité vient de la bande, jamais d'une constante recopiée ici — la
    /// première version de ce fichier mesurait 6 % quand la bande peignait 8 %),
    /// aplatie sur ce que l'hôte pose derrière.
    private func capsule(_ fond: ComposerMentionStripBackdrop, sur derriere: Color) -> Color {
        Self.aplatir(ComposerMentionStrip.capsuleFill(on: fond), sur: derriere)
    }

    /// **Le ratio tel que l'ŒIL le reçoit** — la loi de composition appliquée
    /// aux DEUX couleurs : `textSecondary(isDark: false)` est translucide, et
    /// `CallBannerContrast.contrastRatio` ignore l'alpha.
    private func ratioRendu(_ texte: Color, sur fond: Color) -> Double {
        CallBannerContrast.contrastRatio(Self.aplatir(texte, sur: fond), fond)
    }

    // MARK: - Le plateau

    func test_lePseudo_tientAA_surLesTroisTeintesDuPlateau() {
        for teinte in PlateauTint.allCases {
            let fond = capsule(.plateau, sur: teinte.color)
            let ratio = ratioRendu(ComposerMentionStrip.pseudoColor(on: .plateau), sur: fond)
            XCTAssertGreaterThanOrEqual(
                ratio, seuilAA,
                "le @pseudo sur le plateau \(teinte.rawValue) : \(ratio):1 — "
                + "c'est lui qui désambiguïse deux contacts au nom proche")
        }
    }

    func test_leNomDAffichage_tientAA_surLesTroisTeintes() {
        for teinte in PlateauTint.allCases {
            let fond = capsule(.plateau, sur: teinte.color)
            let ratio = ratioRendu(ComposerMentionStrip.nameColor(on: .plateau), sur: fond)
            XCTAssertGreaterThanOrEqual(ratio, seuilAA, "\(teinte.rawValue) : \(ratio):1")
        }
    }

    // MARK: - La scène

    /// **LE témoin du défaut retrouvé.** Les deux schémas que
    /// `CanvasChromeScheme` peut épingler, chacun sur les scènes extrêmes.
    func test_lePseudo_tientAA_surLaScene_quelQueSoitSonFond() {
        for schema in [ColorScheme.dark, .light] {
            let backdrop = ComposerMentionStripBackdrop.scene(schema)
            for scene in scenesExtremes {
                let fond = capsule(backdrop, sur: scene.couleur)
                let ratio = ratioRendu(ComposerMentionStrip.pseudoColor(on: backdrop), sur: fond)
                XCTAssertGreaterThanOrEqual(
                    ratio, seuilAA,
                    "le @pseudo, chrome \(schema), sur une scène \(scene.nom) : \(ratio):1")
            }
        }
    }

    func test_leNomDAffichage_tientAA_surLaScene_quelQueSoitSonFond() {
        for schema in [ColorScheme.dark, .light] {
            let backdrop = ComposerMentionStripBackdrop.scene(schema)
            for scene in scenesExtremes {
                let fond = capsule(backdrop, sur: scene.couleur)
                let ratio = ratioRendu(ComposerMentionStrip.nameColor(on: backdrop), sur: fond)
                XCTAssertGreaterThanOrEqual(ratio, seuilAA,
                                            "chrome \(schema), scène \(scene.nom) : \(ratio):1")
            }
        }
    }

    /// **Pourquoi la capsule de scène est OPAQUE.** La capsule du plateau — un
    /// voile de 8 % — posée sur une scène claire rendait le défaut de l'issue.
    /// Ce témoin garde la RAISON du choix : sans lui, la prochaine main qui
    /// trouvera la capsule de scène « lourde » reviendrait au voile.
    func test_leVoileDuPlateau_surUneSceneBlanche_estIllisible() {
        let fond = capsule(.plateau, sur: .white)
        let ratio = ratioRendu(ComposerMentionStrip.pseudoColor(on: .plateau), sur: fond)
        XCTAssertLessThan(ratio, seuilAA,
                          "mesuré \(ratio):1 — le voile du plateau ne tient que sur un fond sombre")
    }

    /// L'encre suit le schéma ÉPINGLÉ par l'hôte sur la scène — et reste
    /// claire sur le plateau, qui est sombre par construction.
    func test_lEncre_suitLeFondDeclare() {
        XCTAssertTrue(ComposerMentionStrip.inkIsDark(on: .plateau))
        XCTAssertTrue(ComposerMentionStrip.inkIsDark(on: .scene(.dark)))
        XCTAssertFalse(ComposerMentionStrip.inkIsDark(on: .scene(.light)))
    }

    // MARK: - Ce qui reste vrai depuis la première lecture

    /// **Le remède intuitif, mesuré.** `textMuted` est le token AA du dépôt pour
    /// du texte secondaire — mais il a été calibré contre `backgroundSecondary`,
    /// pas contre une capsule posée sur un plateau.
    func test_leTokenPlusDiscret_tomberaitSOUSLeSeuil() {
        let fond = capsule(.plateau, sur: PlateauTint.violetProfond.color)
        let pire = ratioRendu(MeeshyColors.textMuted(isDark: true), sur: fond)
        XCTAssertLessThan(pire, seuilAA,
                          "mesuré \(pire):1 — si ce ratio repassait au-dessus, `textMuted` "
                          + "redeviendrait un candidat et ce témoin devrait être relu, pas supprimé")
    }

    /// **La loi de composition se garde ELLE-MÊME** : un token TRANSLUCIDE
    /// mesuré sans composition rend un ratio plus favorable que ce que l'œil
    /// reçoit.
    func test_ignorerLAlpha_rendUnRatioQuiNExistePasALEcran() {
        let fond = capsule(.plateau, sur: PlateauTint.violetProfond.color)
        let muted = MeeshyColors.textMuted(isDark: true)

        let brut = CallBannerContrast.contrastRatio(muted, fond)
        let rendu = ratioRendu(muted, sur: fond)

        XCTAssertGreaterThan(brut, rendu + 1.0,
                             "brut \(brut):1 contre rendu \(rendu):1")
        XCTAssertGreaterThanOrEqual(brut, seuilAA, "et le chiffre flatté passerait le seuil…")
        XCTAssertLessThan(rendu, seuilAA, "…que le vrai ne passe pas.")
    }

    /// **Le plateau est sombre PAR CONSTRUCTION**, et c'est ce qui rend
    /// `.plateau` juste. Ce témoin tombe si une teinte claire arrive.
    func test_toutesLesTeintesDuPlateau_sontSOMBRES() {
        for teinte in PlateauTint.allCases {
            let surBlanc = CallBannerContrast.contrastRatio(teinte.color, .white)
            XCTAssertGreaterThan(surBlanc, 7,
                                 "\(teinte.rawValue) doit rester un fond sombre")
        }
    }

    // MARK: - Les hôtes déclarent leur fond

    private func code(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try MyStoriesSourceCorpus.text(of: chemin))
            .components(separatedBy: .whitespacesAndNewlines).joined()
    }

    /// **Chaque hôte DIT ce qu'il pose derrière la bande.** Un hôte qui
    /// oublierait le paramètre ne compilerait pas ; un hôte qui mentirait —
    /// un calque de SCÈNE déclarant `.plateau` — rouvrirait l'issue. Le calque
    /// relaie le schéma qu'il lit déjà (`CanvasChromeScheme`, épinglé par son
    /// volet) : une seule source pour son encre et celle de sa bande.
    func test_chaqueHote_declareLeFondQuIlPoseDerriereLaBande() throws {
        XCTAssertTrue(try code("Meeshy/Features/Main/Composer/ComposerDescriptionLayer.swift")
                        .contains("backdrop:.scene(colorScheme)"),
                      "le calque de description vit sur la SCÈNE : il relaie le schéma qu'il lit")
        XCTAssertTrue(try code("Meeshy/Features/Main/Composer/ComposerDocumentSurface.swift")
                        .contains("backdrop:.plateau"),
                      "le champ du document vit sur le plateau")
        XCTAssertTrue(try code("Meeshy/Features/Main/Composer/ComposerObjectEditorView+Mentions.swift")
                        .contains("backdrop:.plateau"),
                      "l'éditeur d'objet vit sur le plateau")
    }

    /// **La bande ne fige plus son encre.** `isDark: true` en dur était la
    /// forme exacte du défaut : une encre décidée sans regarder le fond.
    func test_laBande_neFigePasSonEncre() throws {
        let source = try code("Meeshy/Features/Main/Components/ComposerMentionStrip.swift")
        XCTAssertFalse(source.contains("isDark:true"),
                       "l'encre de la bande se dérive du fond déclaré par l'hôte, jamais d'une constante")
    }

    /// **La bande n'a PAS de fond à elle** (directive porteur 2026-09-05) : un
    /// verre y peignait une barre pâle en travers de la scène. Les CAPSULES des
    /// entrées portent le leur — c'est celui que les témoins ci-dessus mesurent.
    func test_laBande_neSePeintAucunFond() throws {
        let source = try code("Meeshy/Features/Main/Components/ComposerMentionStrip.swift")
        XCTAssertFalse(source.contains(".adaptiveGlass("),
                       "La bande doit laisser voir son fond : un verre y peint une barre pâle.")
        XCTAssertFalse(source.contains(".background(Color"),
                       "…et aucun fond opaque de bande ne doit le remplacer.")
    }
}
