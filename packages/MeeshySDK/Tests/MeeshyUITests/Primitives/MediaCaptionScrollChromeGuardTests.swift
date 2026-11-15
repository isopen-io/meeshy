import XCTest
@testable import MeeshyUI

/// **Une légende dépliée n'a pas de chrome de défilement** (directive porteur
/// 2026-09-03, capture du lecteur de réel à l'appui : « il faut enlever le fond
/// noir et **la barre de défilement** »).
///
/// La barre est une décision du COMPOSANT, pas de l'hôte — et c'est ce qui la
/// distingue du voile, gardé juste à côté par
/// `MediaCaptionExpandedReadingGuardTests` comme un paramètre. Un indicateur de
/// défilement blanc posé sur une photo ou une vidéo n'est jamais ce qu'un hôte
/// veut : les trois surfaces le portaient, les trois avaient tort. Il n'y a donc
/// rien à paramétrer, seulement à retirer.
///
/// > La question « faut-il un paramètre ? » se répond en demandant si un hôte
/// > pourrait légitimement vouloir l'autre valeur. Pour le voile, oui — la story
/// > efface sa scène, le plein écran média non. Pour la barre, non.
///
/// **Ce que le lecteur perd, et ce qui le lui rend.** L'indicateur disait « il
/// en reste ». Deux choses le disent encore sans peindre sur le média : le texte
/// se COUPE net au plafond de `maxExpandedHeight` (une phrase tranchée est le
/// signal le plus ancien qu'il y a une suite), et l'invite « voir moins » est
/// posée SOUS la fenêtre défilante, hors du défilement — elle ne bouge pas, donc
/// elle ne peut pas se faire prendre pour la fin du corpus.
final class MediaCaptionScrollChromeGuardTests: XCTestCase {

    private func source() throws -> String {
        let url = ComposerSourceGuard.packageRoot
            .appendingPathComponent("Sources/MeeshyUI/Primitives/MediaCaptionOverlay.swift")
        return ComposerSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Le corps d'une déclaration, accolades appariées.
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

    private func compact(_ code: String) -> String {
        code.replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "\n", with: "")
            .replacingOccurrences(of: "\t", with: "")
    }

    // MARK: - Non-vacuité

    /// **Ce témoin s'ancre sur `expandedCaption`.** Si la propriété est
    /// renommée, les deux gardes ci-dessous deviendraient vertes en ne mesurant
    /// plus rien — le mode d'extinction habituel d'une garde de source. Celle-ci
    /// tombe à la place.
    func test_laFenetreDefilante_estBienLaOuLaGardeRegarde() throws {
        let code = try source()
        guard let corpus = corps("private var expandedCaption: some View {", dans: code) else {
            return XCTFail("`expandedCaption` introuvable — les gardes de ce fichier ne mesureraient plus rien.")
        }
        XCTAssertTrue(corpus.contains("ScrollView("),
                      "Le corpus déplié DÉFILE : c'est la prémisse de tout ce fichier.")
    }

    // MARK: - 1 · Aucun indicateur

    func test_leCorpusDeplie_nAffichePasDeBarreDeDefilement() throws {
        let code = try source()
        guard let corpus = corps("private var expandedCaption: some View {", dans: code) else {
            return XCTFail("`expandedCaption` introuvable.")
        }
        XCTAssertFalse(compact(corpus).contains("showsIndicators:true"),
                       "Aucune barre de défilement sur une légende posée sur un média "
                           + "(directive porteur 2026-09-03).")
        XCTAssertTrue(compact(corpus).contains("showsIndicators:false"),
                      "Et le dire EXPLICITEMENT : `showsIndicators` a pour défaut `true`, "
                          + "donc l'omettre repeindrait la barre en silence.")
    }

    // MARK: - 2 · L'invite reste hors du défilement

    /// La contrepartie de la barre retirée. Si l'invite retombait DANS la
    /// `ScrollView`, il faudrait défiler jusqu'au bout du corpus pour la voir —
    /// le défaut exact que la directive du 2026-09-02 a soldé, et que le retrait
    /// de l'indicateur rendrait cette fois invisible au lecteur.
    func test_lInvite_resteSousLaFenetre_jamaisDedans() throws {
        let code = try source()
        guard let corpus = corps("private var expandedCaption: some View {", dans: code),
              let fenetre = corps("ScrollViewReader { proxy in", dans: corpus)
        else {
            return XCTFail("`expandedCaption` ou sa fenêtre défilante introuvable.")
        }
        XCTAssertTrue(corpus.contains("affordance(Self.seeLessLabel"),
                      "L'invite « voir moins » appartient au corpus déplié.")
        XCTAssertFalse(fenetre.contains("affordance(Self.seeLessLabel"),
                       "Mais pas à la fenêtre défilante : dedans, elle ne serait atteignable "
                           + "qu'après avoir tout lu.")
    }
}
