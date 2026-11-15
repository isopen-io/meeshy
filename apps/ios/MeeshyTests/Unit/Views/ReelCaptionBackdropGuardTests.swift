import XCTest

/// **La légende d'un réel se lit SUR la vidéo, sans voile** (directive porteur
/// 2026-09-03, capture à l'appui : « il faut enlever le fond noir »).
///
/// `MediaCaptionOverlay` peint un dégradé noir 0,2 → 0,82 sous le corpus déplié
/// quand `dimsBackgroundWhenExpanded` vaut `true` — son défaut. La story l'a
/// refusé dès le 2026-09-02 ; le lecteur de réel l'a gardé, pour une raison
/// alors juste : il ne peint qu'un voile de BAS DE PAGE, calibré pour une
/// légende REPLIÉE, presque transparent là où un corpus déplié monte (420 pt).
/// Le porteur regarde aujourd'hui cet hôte-là et tranche l'inverse.
///
/// **Ce qui rend le retrait sûr est mesurable, pas espéré.** Le texte déplié
/// passe par `legibleOverCanvas()` — deux ombres portées (noir 0,75 à r=2 ;
/// noir 0,35 à r=7) appliquées dans le composant lui-même. C'est EXACTEMENT ce
/// qui tient la lisibilité de la story sans voile depuis le 2026-09-02. Le réel
/// hérite donc d'une propriété déjà éprouvée sur un hôte jumeau, pas d'un pari.
///
/// **Pourquoi un paramètre d'hôte et non une suppression.** La garde jumelle
/// `MediaCaptionExpandedReadingGuardTests` exige que le voile reste
/// PARAMÉTRABLE avec `true` pour défaut : une directive formulée sur un hôte ne
/// se code pas dans le composant partagé. Le plein écran média d'une
/// conversation (`ConversationMediaGalleryView`) n'est pas visé et garde le
/// sien — il n'a ni la scène effaçable de la story, ni la colonne
/// d'informations du réel.
final class ReelCaptionBackdropGuardTests: XCTestCase {

    private static let reelPath = "Meeshy/Features/Main/Views/ReelPageView+Info.swift"

    private func source() throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(Self.reelPath))
    }

    /// Le corps d'un appel, parenthèses appariées.
    private func appel(_ ancre: String, dans code: String) -> String? {
        guard let debut = code.range(of: ancre) else { return nil }
        var profondeur = 0
        var resultat = ""
        for caractere in code[debut.lowerBound...] {
            resultat.append(caractere)
            if caractere == "(" { profondeur += 1 }
            if caractere == ")" {
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

    /// **Non-vacuité.** Ancrée sur l'appel lui-même : le jour où le réel
    /// cesserait de monter la couche partagée, cette garde tomberait au lieu de
    /// devenir verte en ne mesurant rien.
    func test_leReel_monteBienLaCouchePartagee() throws {
        let code = try source()
        XCTAssertNotNil(appel("MediaCaptionOverlay(", dans: code),
                        "Le lecteur de réel monte `MediaCaptionOverlay` — prémisse de cette garde.")
    }

    func test_leCorpusDeplieDUnReel_nEstPasVoile() throws {
        let code = try source()
        guard let appelCouche = appel("MediaCaptionOverlay(", dans: code) else {
            return XCTFail("`MediaCaptionOverlay(` introuvable dans le lecteur de réel.")
        }
        XCTAssertTrue(compact(appelCouche).contains("dimsBackgroundWhenExpanded:false"),
                      "Le réel refuse le voile (directive porteur 2026-09-03). "
                          + "Le défaut du composant étant `true`, l'OMETTRE le repeindrait en silence.")
    }
}
