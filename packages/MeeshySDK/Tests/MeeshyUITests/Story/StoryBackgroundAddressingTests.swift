import XCTest
@testable import MeeshyUI

/// **Une story vidéo doit pouvoir se LIRE** (#5419).
///
/// ## Le défaut, mesuré au simulateur le 2026-09-06
///
/// Ouvrir une story publiée avec une vidéo laisse le lecteur sur « Chargement
/// de la story… », puis il se referme. Le journal le dit à chaque passe :
///
///     [story-media] bg video configure id=6a9daaba2b4a21192c9492c8 resolved=nil
///
/// La passerelle sert pourtant le canvas COMPLET — mesuré avec
/// `X-Canvas-Caps: 3` : `mediaURL = "2026/09/<auteur>/<fichier>.mp4"`. C'est la
/// **clé de stockage** (#4324), la forme sans barre initiale que
/// `MeeshyConfig.resolveMediaURL` sait résoudre depuis toujours.
///
/// Deux filtres au-dessus l'empêchaient d'y arriver, chacun avec sa propre
/// liste de préfixes :
///
/// | site | acceptait | manquait |
/// |---|---|---|
/// | `StoryRenderer.backgroundRoutingKey` | `http` | tout le reste |
/// | `StoryBackgroundLayer.directURLIfAny` | `file://`, `http(s)://`, `/…` | la clé de stockage |
///
/// Faute d'adresse, la clé de routage retombait sur le `postMediaId` — que le
/// résolveur de l'hôte ne trouve pas, **une story ne portant aucun `PostMedia`**
/// (mesuré : `media = 0` sur les six stories du compte). Le `nil` était donc
/// DÉFINITIF, pas transitoire.
///
/// > **La capacité existait au bas de la chaîne ; deux gardes au-dessus
/// > l'empêchaient d'être atteinte.** Le défaut n'est pas une fonction
/// > manquante mais une énumération de préfixes — écrite deux fois, et
/// > incomplète les deux fois.
final class StoryBackgroundAddressingTests: XCTestCase {

    // MARK: - Le prédicat, sur les formes réelles

    /// **Le rang qui compte.** C'est la seule forme que les deux gardes
    /// rataient, et c'est celle que la production sert.
    func test_laCleDeStockage_estUneAdresse() {
        XCTAssertTrue(StoryBackgroundLayer.isAddressable(
            "2026/09/68f2a81417a557e8ce4ddfc1/57396DFF-FB8E-4F4A-8FCD-625618E6F69E_777416b0.mp4"))
    }

    func test_lesFormesDejaAcceptees_leRestent() {
        XCTAssertTrue(StoryBackgroundLayer.isAddressable("https://cdn.meeshy.me/a.mp4"))
        XCTAssertTrue(StoryBackgroundLayer.isAddressable("http://cdn.meeshy.me/a.mp4"))
        XCTAssertTrue(StoryBackgroundLayer.isAddressable("file:///tmp/clip.mov"))
        XCTAssertTrue(StoryBackgroundLayer.isAddressable("/api/v1/attachments/abc"))
    }

    /// **Un identifiant n'est PAS une adresse**, et c'est ce que le prédicat
    /// doit continuer de dire : un ObjectId part chez le résolveur de l'hôte,
    /// jamais chez `resolveMediaURL`.
    func test_unPostMediaId_nEstPasUneAdresse() {
        XCTAssertFalse(StoryBackgroundLayer.isAddressable("6a9daaba2b4a21192c9492c8"))
        XCTAssertFalse(StoryBackgroundLayer.isAddressable(""))
    }

    // MARK: - La clé de routage, qui décide de tout

    /// Le cas de production, de bout en bout : une adresse gagne sur
    /// l'identifiant, sinon la couche vidéo ne résout rien.
    func test_laCleDeRoutage_preferelAdresseALIdentifiant() {
        let cle = StoryRenderer.backgroundRoutingKey(
            postMediaId: "6a9daaba2b4a21192c9492c8",
            mediaURL: "2026/09/68f2a814/57396DFF.mp4")
        XCTAssertEqual(cle, "2026/09/68f2a814/57396DFF.mp4",
                       "sans l'adresse, la couche retombe sur un id qu'aucun résolveur ne trouve")
    }

    /// **Sans adresse, l'identifiant reste la clé** — le chemin d'une story qui
    /// porte vraiment un `PostMedia` ne change pas.
    func test_sansAdresse_lIdentifiantResteLaCle() {
        XCTAssertEqual(
            StoryRenderer.backgroundRoutingKey(postMediaId: "6a9daaba2b4a21192c9492c8",
                                               mediaURL: nil),
            "6a9daaba2b4a21192c9492c8")
    }

    /// Le composer local : la vidéo n'a pas encore d'id serveur, et son
    /// `file://` doit gagner — c'est le cas que l'ancienne règle servait, et
    /// qu'il ne faut pas casser en l'élargissant.
    func test_leFichierLocalDuComposer_gagneToujours() {
        XCTAssertEqual(
            StoryRenderer.backgroundRoutingKey(postMediaId: "",
                                               mediaURL: "file:///tmp/clip.mov"),
            "file:///tmp/clip.mov")
    }

    // MARK: - La résolution effective

    /// Le témoin qui relie les deux étages : une clé de stockage doit sortir de
    /// `directURLIfAny` en URL absolue, pas en `nil`.
    func test_laCleDeStockage_seResoutEnURL() {
        let url = StoryBackgroundLayer.directURLIfAny(from: "2026/09/68f2a814/57396DFF.mp4")
        XCTAssertNotNil(url, "resolveMediaURL sait la résoudre depuis #4324 — encore faut-il l'appeler")
        XCTAssertTrue(url?.absoluteString.contains("57396DFF.mp4") ?? false)
    }

    func test_unIdentifiantNeSeResoutPasEnURL() {
        XCTAssertNil(StoryBackgroundLayer.directURLIfAny(from: "6a9daaba2b4a21192c9492c8"),
                     "un ObjectId doit partir chez le résolveur de l'hôte, jamais être transformé en URL")
    }
}
