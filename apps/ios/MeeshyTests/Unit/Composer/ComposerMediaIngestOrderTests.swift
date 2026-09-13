import XCTest
@testable import Meeshy

/// **#4879 — une photo ajoutée par le rail de la scène n'y arrivait jamais.**
///
/// Reproduit deux fois au simulateur iPhone 16 Pro : rail gauche → porte média →
/// une photo → `Add`. Le canvas reste noir. La photo est pourtant bien INGÉRÉE
/// — basculer vers Post la montre dans la bande « Attached media » —, et elle
/// APPARAÎT sur la scène après un aller-retour Story → Post → Story.
///
/// ## La cause : un drapeau consommé APRÈS l'observateur qui le lit
///
/// `syncPostMediaIntoSlides` est branchée sur `documentLocalMedia` et choisit la
/// porte du média en lisant `railPosedMediaURLs` :
///
/// ```swift
/// let porte: ComposerMediaDoor =
///     railPosedMediaURLs.contains(media.sourceURL) ? .sceneRail : .documentRow
/// ```
///
/// Les quatre sites d'ingestion écrivaient dans `documentLocalMedia` PUIS
/// appelaient `consumeRailPosing`. Au moment où l'observateur tournait,
/// l'ensemble était encore VIDE : le média était classé « rangée du document »,
/// donc rangé dans une slide à lui au lieu d'être posé sur la scène courante.
///
/// Et le verdict est DÉFINITIF — la boucle ne considère que les médias dont
/// `mediaRoleByURL[url] == nil`. Un rôle mal attribué ne se rejoue jamais.
///
/// > **Un drapeau consommé après l'observateur qui le lit ne vaut rien**, et il
/// > échoue du côté silencieux : pas d'erreur, pas de log, un média correctement
/// > ingéré rangé au mauvais endroit.
///
/// ## Pourquoi un témoin de SOURCE, et pourquoi sur le COMPTE
///
/// L'état vit en `@State` d'une vue SwiftUI : l'ordre réel ne s'observe pas sans
/// monter le meuble. Ce qui se garde, en revanche, est la propriété qui rend
/// l'erreur IMPOSSIBLE — un seul écrivain, qui marque avant d'écrire. Quatre
/// sites écrivaient ; un cinquième aurait rejoué le défaut sans qu'aucun témoin
/// ne tombe.
final class ComposerMediaIngestOrderTests: XCTestCase {

    private static let composerDirectory = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Meeshy/Features/Main/Composer")

    private func intakeSource() throws -> String {
        try String(contentsOf: Self.composerDirectory
            .appendingPathComponent("MeeshyComposerHost+Intake.swift"), encoding: .utf8)
    }

    /// **Tout le composer, pas le seul fichier où la règle est ÉCRITE** (#6008).
    ///
    /// La mesure d'origine ne lisait que `+Intake.swift`. Elle a signalé DEUX
    /// écritures là où il y en avait QUATRE : les deux autres vivaient dans
    /// `+Sound.swift`, hors de sa portée. **Une garde qui sous-estime le défaut
    /// qu'elle signale envoie chercher au mauvais endroit** — on corrige les
    /// deux qu'elle nomme, elle passe au vert, et les deux autres restent.
    ///
    /// La portée est le RÉPERTOIRE : une extension de l'hôte qui naîtrait
    /// demain est couverte sans que personne ait à y penser.
    private func composerSources() throws -> [(nom: String, code: String)] {
        let fm = FileManager.default
        let urls = (try? fm.contentsOfDirectory(at: Self.composerDirectory,
                                                includingPropertiesForKeys: nil)) ?? []
        let sources = urls
            .filter { $0.pathExtension == "swift" }
            .sorted { $0.lastPathComponent < $1.lastPathComponent }
            .compactMap { url -> (nom: String, code: String)? in
                guard let brut = try? String(contentsOf: url, encoding: .utf8) else { return nil }
                return (nom: url.lastPathComponent, code: AppSourceGuard.stripComments(brut))
            }
        XCTAssertFalse(sources.isEmpty, "Le répertoire du composer est lu vide — la garde a perdu son chemin, pas le dépôt ses fichiers.")
        return sources
    }

    /// **Un seul écrivain.** C'est la moitié qui empêche le défaut de revenir :
    /// tant que quatre sites écrivent, l'ordre est une discipline ; avec un
    /// seul, c'est une propriété.
    func test_uneSeuleEcriture_dansLaListeMediaDuDocument() throws {
        let ecrivains = try composerSources()
            .filter { $0.code.contains("documentLocalMedia.append") }
            .map(\.nom)

        XCTAssertEqual(
            ecrivains, ["MeeshyComposerHost+Intake.swift"],
            "Un fichier de plus écrit dans `documentLocalMedia`. Ce n'est PAS « le marquage a "
                + "bougé » — c'est un ÉCRIVAIN qui est apparu, et les deux se corrigent "
                + "différemment : le premier se remet en place, le second doit passer par "
                + "`ecrireDansLaListeDuDocument(_:rail:)` et DIRE ce qu'il fait de l'intention "
                + "du rail (#6008). Écrire en direct la laisse armée pour le média d'après."
        )

        let ecritures = try intakeSource()
            .components(separatedBy: "documentLocalMedia.append").count - 1
        XCTAssertEqual(
            ecritures, 1,
            "Il n'y a qu'UN site d'écriture, et c'est `ecrireDansLaListeDuDocument`. Deux "
                + "écritures dans le même fichier, c'est deux occasions de marquer trop tard "
                + "(#4879) — l'observateur de `documentLocalMedia` lit `railPosedMediaURLs`."
        )
    }

    /// **Chaque écriture DIT ce qu'elle fait de l'intention du rail** (#6008).
    ///
    /// L'entonnoir ne vaut que si son aiguillage reste exhaustif : un `default`
    /// y rendrait le silence légal, et une porte neuve hériterait d'une
    /// intention qu'elle n'a pas posée — exactement ce que les deux portes son
    /// faisaient avant ce lot, sans avoir rien écrit de faux.
    func test_lAiguillageDuRail_estExhaustif_sansDefault() throws {
        let code = try intakeSource()
        guard let debut = code.range(of: "func ecrireDansLaListeDuDocument"),
              let fin = code.range(of: "documentLocalMedia.append",
                                   range: debut.upperBound..<code.endIndex) else {
            return XCTFail("Le site unique d'écriture a changé de forme.")
        }
        let corps = String(code[debut.lowerBound..<fin.lowerBound])
        for cas in ["case .consomme", "case .abandonne", "case .roleDejaPose"] {
            XCTAssertTrue(corps.contains(cas),
                          "L'aiguillage ne traite plus `\(cas)`. Les trois cas de "
                              + "`ComposerRailPosing` sont la QUESTION que le compilateur pose à "
                              + "toute porte neuve ; en retirer un rouvre le silence.")
        }
        XCTAssertFalse(corps.contains("default:"),
                       "Un `default` dans cet aiguillage rend le silence légal : une porte "
                           + "ajoutée demain n'aurait plus à dire ce qu'elle fait de l'intention.")
    }

    /// **L'intention du rail ne se pose que si un sélecteur PARAÎT** (#6008).
    ///
    /// Elle était armée d'abord, présentée ensuite — deux instructions, donc un
    /// cas où la première réussit et la seconde ne fait rien : la règle des
    /// sources peut n'en offrir aucune, et son propre doc-comment déclare ce cas
    /// « traitable plutôt qu'impossible à écrire ». L'intention n'avait alors
    /// AUCUNE sortie : ni consommation (rien ne revient), ni annulation (aucune
    /// feuille à annuler). Elle attendait le média suivant, quelle que soit sa
    /// porte.
    ///
    /// > Une branche défensive dans le cas vide aurait fermé le trou sans que
    /// > rien ne l'exécute jamais. Faire DÉPENDRE l'armement de la présentation
    /// > supprime le cas.
    func test_lIntentionDuRail_neSArmeQueSiUnSelecteurParait() throws {
        let nu = AppSourceGuard.stripComments(try intakeSource())
        XCTAssertTrue(
            nu.contains("railPosesNextMedia = presentMediaSources()"),
            "La porte du rail doit tirer son armement du RETOUR de la présentation. "
                + "`railPosesNextMedia = true` suivi de `presentMediaSources()` rearme "
                + "inconditionnellement, y compris devant une feuille qui n'apparaît pas."
        )
        XCTAssertTrue(
            nu.contains("func presentMediaSources() -> Bool"),
            "`presentMediaSources` doit DIRE si un sélecteur est à l'écran ; sans ce retour, "
                + "l'appelant ne peut pas distinguer « présenté » de « rien à présenter »."
        )
    }

    /// **L'intention se JETTE aussi**, pas seulement se pose (#6008).
    ///
    /// `consumeRailPosing` avait une jumelle manquante. Le viseur l'avait déjà,
    /// sans le mot — `disarmSceneCamera` écrit `railPosesNextMedia = false` avec
    /// le bon commentaire (« quitter sans prendre RETIRE la marque ») ; le
    /// chemin du SÉLECTEUR n'avait pas son équivalent, et son bouton
    /// d'annulation avait un corps VIDE.
    func test_lIntentionDuRail_seJette_quandLeSelecteurPartSansRienRendre() throws {
        let intake = try intakeSource()
        XCTAssertTrue(intake.contains("func abandonRailPosing()"),
                      "La jumelle de `consumeRailPosing` doit exister et porter un NOM : sans "
                          + "elle, chaque site qui désarme réécrit `railPosesNextMedia = false` "
                          + "et aucun témoin négatif ne peut se poser dessus.")

        let portails = try String(contentsOf: Self.composerDirectory
            .appendingPathComponent("MeeshyComposerHost+Portals.swift"), encoding: .utf8)
        XCTAssertFalse(
            AppSourceGuard.stripComments(portails).contains("role: .cancel) { }"),
            "Le bouton d'annulation de la feuille de choix a de nouveau un corps VIDE. "
                + "L'intention posée par la porte du rail survit alors à la feuille qu'elle "
                + "vient d'ouvrir, et se pose sur le média suivant — quelle que soit sa porte."
        )

        // La porte de la RANGÉE désarme AVANT de présenter — l'assertion porte
        // sur l'ORDRE dans son propre `case`, pas sur la présence des deux
        // appels quelque part dans le fichier.
        let nu = AppSourceGuard.stripComments(intake)
        guard let porte = nu.range(of: "case .attachesLocalMedia(let intake):"),
              let presentation = nu.range(of: "presentMediaIntake(intake)",
                                          range: porte.upperBound..<nu.endIndex) else {
            return XCTFail("La porte média de la rangée du document a changé de forme.")
        }
        let corpsDeLaPorte = String(nu[porte.upperBound..<presentation.lowerBound])
        XCTAssertTrue(
            corpsDeLaPorte.contains("abandonRailPosing()"),
            "La porte de la RANGÉE du document doit désarmer avant de présenter son sélecteur : "
                + "elle n'est PAS le rail, et hériter d'une intention abandonnée poserait sur la "
                + "scène courante ce que l'auteur vient de demander à la rangée."
        )
    }

    /// **Le marquage PRÉCÈDE l'écriture.** L'assertion porte sur les POSITIONS,
    /// pas sur la présence des deux appels : les avoir tous les deux est
    /// exactement ce que faisait le code fautif.
    func test_leDrapeauDuRail_estMarqueAVANT_lEcriture() throws {
        let code = try intakeSource()
        guard let marquage = code.range(of: "consumeRailPosing(medias.map"),
              let ecriture = code.range(of: "documentLocalMedia.append") else {
            return XCTFail("Le site unique d'ingestion a changé de forme.")
        }
        XCTAssertLessThan(
            marquage.lowerBound, ecriture.lowerBound,
            "L'observateur de `documentLocalMedia` LIT `railPosedMediaURLs` : le marquer après "
                + "l'écriture le laisse vide au moment du verdict, et le média part dans une "
                + "slide à lui au lieu de se poser sur la scène courante.\n\n"
                + "Ce message a été TROMPEUR une fois, et c'est pourquoi il le dit (#6008) : il "
                + "accuse un marquage DÉPLACÉ, alors que la cause peut être un ÉCRIVAIN APPARU "
                + "plus haut dans le fichier — `range(of:)` rend la PREMIÈRE occurrence, donc un "
                + "second `documentLocalMedia.append` en amont fait rougir ce témoin sans que "
                + "personne n'ait touché à l'ordre. Lire d'abord le verdict de "
                + "`test_uneSeuleEcriture_dansLaListeMediaDuDocument` : s'il est rouge lui aussi, "
                + "c'est un écrivain, pas un ordre."
        )
    }

    /// **Une seule notification, pas une par média.** La boucle d'origine
    /// appelait `append` par item, donc rejouait l'observateur à chaque passe
    /// avec un ensemble différent — la place d'un média dépendait de son RANG
    /// dans la sélection.
    func test_lesMedias_arriventEnUNE_fois() throws {
        let code = try intakeSource()
        XCTAssertTrue(code.contains("documentLocalMedia.append(contentsOf: medias)"),
                      "Un `append` par média rejoue la dérivation autant de fois qu'il y "
                      + "a de fichiers, chaque fois sur un état différent.")
    }

    /// Les quatre portes passent par le site unique — la photothèque, les deux
    /// branches de la caméra, l'importateur de fichiers.
    func test_lesQuatrePortes_passentParLeSiteUnique() throws {
        let code = try intakeSource()
        let appels = code.components(separatedBy: "ingestIntoDocument(").count - 1
        XCTAssertGreaterThanOrEqual(appels, 5,
                                    "Quatre appels (photothèque, photo caméra, vidéo caméra, "
                                    + "fichiers) plus la déclaration — une porte qui écrirait "
                                    + "en direct rouvrirait #4879.")
    }
}
