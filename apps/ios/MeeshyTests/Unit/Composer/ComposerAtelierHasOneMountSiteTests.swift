import XCTest
@testable import Meeshy

/// **L'atelier de story a quitté le dépôt, et rien ne peut le rouvrir**
/// (#5054, #15629).
///
/// Le #5054 l'avait réduit à UN site de montage, le meuble ; le #15629 retire ce
/// dernier site : reprendre un brouillon et modifier une story se composent sur
/// la scène du meuble, comme la création. `StoryComposerView` et sa coquille
/// (`ComposerControlsLayer`, `ComposerBottomBand`, `ComposerToolPanelHost`,
/// `ComposerPublishTrigger`) ne sont plus cités nulle part, hors commentaires.
///
/// Le balayage est RÉCURSIF et ne connaît aucune liste : il attrape un montage
/// rouvert dans un fichier qui n'existe pas encore.
final class ComposerAtelierHasOneMountSiteTests: XCTestCase {

    /// La racine des sources de l'app, calculée depuis CE fichier — jamais
    /// depuis le répertoire courant du runner, qui n'est pas le dépôt.
    /// Quatre remontées, pas trois : la PREMIÈRE retire le nom du fichier, pas
    /// un répertoire. L'écrire à trois rendait `MeeshyTests/Meeshy`, un chemin
    /// inexistant — donc zéro fichier balayé, donc les trois gardes de ce
    /// fichier vertes en ne mesurant RIEN. C'est le témoin de non-vacuité
    /// ci-dessous qui l'a attrapé, et c'est exactement ce pour quoi il existe.
    private static var racineApp: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // …/Unit/Composer  (retire le FICHIER)
            .deletingLastPathComponent()   // …/Unit
            .deletingLastPathComponent()   // …/MeeshyTests
            .deletingLastPathComponent()   // …/apps/ios
            .appendingPathComponent("Meeshy")
    }

    /// Tous les `.swift` de la cible app.
    ///
    /// Le balayage est RÉCURSIF et ne connaît aucune liste : c'est ce qui lui
    /// permet d'attraper un montage rouvert dans un fichier qui n'existe pas
    /// encore. Une liste de chemins se périmerait au premier fichier ajouté, et
    /// se périmerait en silence — le résultat resterait non vide.
    private func sourcesDeLApp() -> [URL] {
        guard let marcheur = FileManager.default.enumerator(
            at: Self.racineApp,
            includingPropertiesForKeys: nil
        ) else { return [] }
        return marcheur.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Les fichiers où un motif de MONTAGE apparaît hors commentaires.
    private func fichiersMontant(_ motif: String) -> [String] {
        sourcesDeLApp().compactMap { url in
            guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            return AppSourceGuard.stripComments(brut).contains(motif) ? url.lastPathComponent : nil
        }.sorted()
    }

    // MARK: - Non-vacuité

    /// **Le balayage voit-il quelque chose ?** Une garde qui énumère un arbre
    /// peut naître morte sur un chemin faux : elle rendrait alors zéro fichier
    /// et TOUTES ses assertions passeraient au vert en ne mesurant rien.
    func test_leBalayage_voitBienLesSourcesDeLApp() {
        XCTAssertGreaterThan(sourcesDeLApp().count, 200,
                             "Le balayage ne trouve presque aucun fichier — les gardes de ce "
                                 + "fichier ne mesureraient plus rien.")
        XCTAssertTrue(fichiersMontant("MeeshyComposerHost(").contains { $0.hasSuffix(".swift") },
                      "Et il doit voir au moins un montage du MEUBLE : c'est la preuve qu'il "
                          + "sait lire un motif de montage.")
    }

    // MARK: - 1 · Plus aucun site ne monte l'atelier

    func test_lAtelierDeStory_nEstPlusMonteNullePart() {
        let sites = fichiersMontant("StoryComposerView(")
        XCTAssertEqual(sites, [],
                       "L'atelier de story est revenu : la story, le post et le réel se composent sur la "
                           + "scène du meuble, quelle que soit la porte (#15629). Sites trouvés : \(sites)")
    }

    // MARK: - 2 · L'ancien atelier a quitté le dépôt

    /// Les sources du SDK, balayées comme celles de l'app : un ancien type
    /// rouvert DANS le moteur se verrait autrement nulle part.
    private func sourcesDuSDK() -> [URL] {
        let racine = Self.racineApp
            .deletingLastPathComponent()   // …/apps/ios
            .deletingLastPathComponent()   // …/apps
            .deletingLastPathComponent()   // racine du dépôt
            .appendingPathComponent("packages/MeeshySDK/Sources")
        guard let marcheur = FileManager.default.enumerator(at: racine, includingPropertiesForKeys: nil) else {
            return []
        }
        return marcheur.compactMap { $0 as? URL }.filter { $0.pathExtension == "swift" }
    }

    /// Les fichiers de l'app ET du SDK où un identifiant apparaît hors commentaires.
    private func fichiersCitant(_ identifiant: String) -> [String] {
        (sourcesDeLApp() + sourcesDuSDK()).compactMap { url in
            guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
            return AppSourceGuard.occurrences(ofIdentifier: identifiant, in: AppSourceGuard.stripComments(brut)) > 0 ? url.lastPathComponent : nil
        }.sorted()
    }

    func test_leBalayageDuSDK_voitBienSesSources() {
        XCTAssertGreaterThan(sourcesDuSDK().count, 200)
        XCTAssertFalse(fichiersCitant("StoryComposerViewModel").isEmpty)
    }

    /// **Une seule capture, une seule édition — la scène** (#9166, directive
    /// porteur « Nettoie l'ancien ! »). Le composer unifié n'avait plus de porte
    /// depuis #5055 ; l'éditeur vidéo plein écran n'en a plus depuis que la
    /// citation, la conversation (#9124), les commentaires (#9127) et la vidéo
    /// de premier plan de l'atelier ouvrent la scène. Ils quittent le dépôt, et
    /// rien ne les y ramène.
    func test_lAncienAtelier_aQuitteLeDepot() {
        for ancien in ["MeeshyVideoEditorView", "UnifiedPostComposer", "VideoPreviewView", "VideoEditorViewModel",
                       "StoryComposerView", "ComposerControlsLayer", "ComposerBottomBand", "ComposerToolPanelHost",
                       "ComposerPublishTrigger", "ComposerChromeOwner"] {
            let sites = fichiersCitant(ancien)
            XCTAssertEqual(sites, [], "`\(ancien)` est revenu : \(sites)")
        }
    }

    /// **L'ancien éditeur d'image plein écran a quitté le dépôt** (#17251,
    /// directive porteur 2026-11-09). Avatar et bannière — « Montre-toi », le
    /// profil, les groupes et les communautés — s'éditent avec la retouche de la
    /// capture caméra. Les noms se composent ici pour qu'aucune recherche ne les
    /// retrouve dans le dépôt : seule cette garde les connaît.
    static let ancienEditeurDImage = [
        "Meeshy" + "ImageEditorView", "ImageEditor" + "ViewModel", "ImageEditor" + "ModeSwitcher",
        "ImageEditor" + "Mode", "ImageEditor" + "CropGeometry", "ImageEditor" + "HistoryOverlay",
        "ImageEdit" + "History", "ImageEdit" + "State", "ImageFilter" + "Engine", "Crop" + "OverlayView",
        "Crop" + "Geometry", "Editor" + "Tool", "Crop" + "Ratio", "preferred" + "CropRatio",
        "ImageEditor" + "AdjustPanel", "ImageEditor" + "ControllerPanel", "ImageEditor" + "CropPanel",
        "ImageEditor" + "EffectsPanel", "ImageEditor" + "FiltersPanel",
    ]

    func test_lAncienEditeurDImage_aQuitteLeDepot() {
        for ancien in Self.ancienEditeurDImage {
            let sites = fichiersCitant(ancien)
            XCTAssertEqual(sites, [], "`\(ancien)` est revenu : \(sites)")
        }
    }

    /// Chaque image d'identité passe par `EntityImageRetouch` : les deux écrans
    /// le montent, et l'app le remet au SDK, qui n'a plus d'éditeur à lui.
    func test_lesImagesDIdentite_ouvrentLaRetoucheDeLaCamera() throws {
        XCTAssertEqual(fichiersMontant("EntityImageRetouch("),
                       ["EntityImageRetouch.swift", "OnboardingProfileCard.swift", "ProfileView.swift"])
        XCTAssertEqual(fichiersMontant(".environment(\\.entityImageEditor, EntityImageRetouch.editor)"),
                       ["SessionContent.swift"], "le choix d'image d'un groupe ou d'une communauté l'ouvre aussi")
        let flux = Self.racineApp.deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("packages/MeeshySDK/Sources/MeeshyUI/Utilities/EntityImagePickerFlow.swift")
        let code = AppSourceGuard.stripComments(try String(contentsOf: flux, encoding: .utf8))
        XCTAssertTrue(code.contains("@Environment(\\.entityImageEditor)"))
        XCTAssertFalse(code.contains("ImageEditor" + "View("))
    }

    // MARK: - 3 · Le meuble reste atteignable

    /// **La moitié qui empêche de « réussir » en cassant tout.** Les deux
    /// assertions ci-dessus passeraient au vert si plus aucun composer n'était
    /// monté nulle part. Celle-ci exige que les portes existent.
    func test_leMeuble_estMonteParPlusieursPortes() {
        let portes = fichiersMontant("MeeshyComposerHost(")
        XCTAssertGreaterThanOrEqual(portes.count, 4,
                                    "Le meuble doit rester monté par ses portes — tray, mood, "
                                        + "document, média de conversation, republication, "
                                        + "édition. Trouvées : \(portes)")
        for attendue in ["StoryRepublishComposer.swift", "StoryEditComposer.swift"] {
            XCTAssertTrue(portes.contains(attendue),
                          "\(attendue) doit monter le meuble : c'est la bascule de #5053.")
        }
    }
}
