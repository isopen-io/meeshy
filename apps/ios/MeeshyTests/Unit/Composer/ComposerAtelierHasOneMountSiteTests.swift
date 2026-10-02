import XCTest
@testable import Meeshy

/// **L'atelier de story n'a plus qu'UN site de montage, et rien ne peut en
/// rouvrir un second** (#5054).
///
/// ## Ce que ce fichier garde, et pourquoi ce n'est pas ce qu'on avait demandé
///
/// La directive porteur du 2026-09-03 disait « décommissionner l'ancien composer
/// de story […] certains agents travaillent sur l'ancien tant que les codes
/// sources seront encore dans le repo ». La lecture littérale — effacer les 33
/// fichiers `StoryComposer*` — **aurait effacé le composer NEUF** :
/// `MeeshyComposerHost+Surfaces` les monte comme MOTEUR de sa scène.
///
/// Ce qui se supprime vraiment est l'ATTEIGNABILITÉ. Un agent qui ouvrira
/// `StoryComposerView.swift` demain verra un fichier monté par un seul site, et
/// ce site est le meuble : il saura qu'il travaille sur le moteur du composer
/// ACTUEL, pas sur un ancêtre. C'est le motif de la directive, satisfait en
/// entier — là où « supprimer les fichiers » ne se livre pas.
///
/// > Quand une demande de suppression bute sur une dépendance, relire le MOTIF
/// > plutôt que l'objet.
///
/// ## Pourquoi la garde COMPTE au lieu de vérifier une présence
///
/// « `StoryComposerView(` apparaît dans `+Surfaces` » resterait vrai avec dix
/// autres sites à côté. C'est le NOMBRE qui porte la règle, et c'est lui qui
/// tombe quand une porte se rouvre — y compris dans un fichier qui n'existe pas
/// encore, puisque le balayage est récursif et ne connaît aucune liste.
final class ComposerAtelierHasOneMountSiteTests: XCTestCase {

    /// Le seul site autorisé à MONTER l'atelier.
    private static let siteUnique = "MeeshyComposerHost+Surfaces.swift"

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

    // MARK: - 1 · L'atelier n'est monté que par le meuble

    func test_lAtelierDeStory_nEstMonteQueParLeMeuble() {
        let sites = fichiersMontant("StoryComposerView(")
        XCTAssertEqual(sites, [Self.siteUnique],
                       "L'atelier de story ne se monte QUE par `MeeshyComposerHost+Surfaces`. "
                           + "Un second site le présenterait sans éventail de format, sans "
                           + "plateau et sans socle — c'est-à-dire le composer d'avant #5053, "
                           + "sous un nom neuf. Sites trouvés : \(sites)")
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
        for ancien in ["MeeshyVideoEditorView", "UnifiedPostComposer", "VideoPreviewView", "VideoEditorViewModel"] {
            let sites = fichiersCitant(ancien)
            XCTAssertEqual(sites, [], "`\(ancien)` est revenu : \(sites)")
        }
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
