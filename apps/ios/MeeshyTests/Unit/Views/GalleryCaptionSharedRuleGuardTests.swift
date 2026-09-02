import XCTest

/// **La galerie plein écran replie sa légende avec la MÊME règle que la story
/// et le réel** (#4768, vue `3e`).
///
/// Elle était la troisième façon de replier la même chose : `Text` brut,
/// `lineLimit(4)`, aucune bascule — la forme INERTE que la story avait quittée
/// en #4474 et le réel en #4484. Une légende de cinq lignes s'y arrêtait au
/// milieu d'une phrase, sans que rien n'indique qu'il en restait.
///
/// > Deux surfaces converties sur trois, c'est une règle qui a l'air partagée.
/// > La troisième ne rougit pas : elle affiche un texte, tronqué proprement, et
/// > seule la comparaison avec ses sœurs le révèle.
///
/// Ce témoin garde **l'absence d'un troisième repli** autant que la présence de
/// la couche : c'est la moitié qui se perd, parce qu'un repli maison réintroduit
/// est fonctionnel et silencieux.
final class GalleryCaptionSharedRuleGuardTests: XCTestCase {

    private static let galleryPath = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.galleryPath))
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

    func test_laGalerieMonteLaCouchePartagee() throws {
        let code = try source()
        guard let couche = corps("private func captionOverlay(_ text: String) -> some View {", dans: code) else {
            return XCTFail("`captionOverlay` introuvable — la garde ne mesurerait rien.")
        }
        XCTAssertTrue(couche.contains("MediaCaptionOverlay("),
                      "La galerie doit monter la couche partagée, pas réécrire le repli.")
        XCTAssertTrue(couche.contains("isExpanded: captionExpanded"),
                      "Et lui passer un état DÉPLIABLE — c'est l'absence de bascule qui la rendait inerte.")
    }

    /// **Garde NÉGATIVE — elle porte le défaut d'origine.** `lineLimit(4)` sur
    /// la légende, c'est la troncature par LIGNES que la règle partagée a
    /// remplacée par un compte de MOTS : deux appareils ne montrent pas la même
    /// légende quand le seuil dépend de la largeur et de la taille de police
    /// choisie par le lecteur.
    func test_laGalerieNeReplieJamaisParElleMeme() throws {
        let code = try source()
        guard let couche = corps("private func captionOverlay(_ text: String) -> some View {", dans: code) else {
            return XCTFail("`captionOverlay` introuvable.")
        }
        XCTAssertFalse(couche.contains("lineLimit("),
                       "Aucune troncature par lignes dans la légende : la règle se compte en MOTS, "
                           + "et elle vit dans `MediaCaptionOverlay` (#4768).")
        XCTAssertFalse(couche.contains("prefix("),
                       "Ni de découpe maison — le seuil et la tête sont ceux de `MediaCaptionRule`.")
    }

    /// **Le retrait est celui de sa colonne, dit par l'HÔTE.** La galerie aligne
    /// sa légende sur `bottomMetadataOverlay` juste au-dessus ; le laisser au
    /// défaut de la couche (20, celui de la story) l'indenterait de 4 pt de plus
    /// que le nom de l'auteur — deux alignements pour une même colonne.
    func test_leRetraitEstCeluiDeSaColonne() throws {
        let code = try source()
        guard let couche = corps("private func captionOverlay(_ text: String) -> some View {", dans: code) else {
            return XCTFail("`captionOverlay` introuvable.")
        }
        XCTAssertTrue(couche.contains("horizontalInset:"),
                      "L'hôte doit DIRE son retrait — c'est ce qui permet à trois surfaces de partager "
                          + "la règle sans partager leur colonne (directive porteur 2026-09-01).")
    }
}
