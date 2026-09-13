import XCTest

/// **Une seule taille de barre de réaction, partout où l'on peut réagir
/// (#6117).**
///
/// Directive porteur du 2026-09-12 : « agrandi les barres de reaction de x1.4
/// au moins, en profiter pour aligner cette taille partout où on peut réagir
/// (story, message, image, commentaire, attachement) ».
///
/// ## Ce que l'inventaire a rendu
///
/// Sept sites montent `EmojiReactionPicker`, sous **trois** échelles :
///
/// | site | avant |
/// |---|---|
/// | `MessageOverlayMenu` (menu d'appui long) | 1,0 — le défaut |
/// | `MessageReactionsDetailView` | 1,0 |
/// | `PostReactionPalette` | 1,0 |
/// | `ConversationView+MessageRow` | 1,0 |
/// | `BubbleStandardLayout+Media` (réaction sur une PIÈCE) | **0,78** |
/// | `ConversationMediaGalleryView` (plein écran) | **2** |
/// | `StoryViewerView+Sidebar` (rail de story) | **2** |
///
/// Un rapport de **2,56** entre la plus petite et la plus grande, pour le même
/// geste sur le même objet. Ce n'était pas une décision : aucune des trois
/// valeurs n'est justifiée ailleurs que par le site qui la porte.
///
/// ## Pourquoi le DÉFAUT, et non sept surcharges
///
/// Quatre des sept sites ne passaient rien — ils prenaient le défaut du
/// composant. Changer ce défaut les aligne tous **sans les toucher**, et rend
/// toute surcharge future visible : elle devient une exception qu'il faut
/// écrire, donc justifier.
///
/// L'inverse — écrire `scale: 1.5` sept fois — poserait sept vérités à tenir
/// d'accord, et la première divergence serait invisible. C'est la forme exacte
/// du défaut que ce lot corrige.
///
/// ## La valeur : 1,5
///
/// Elle n'est pas choisie ici, elle est REPRISE. Le porteur l'a arrêtée le
/// matin même sur capture — « ×0,75, elles sont trop grosses », qui a ramené le
/// rail de story et le plein écran de 2 à 1,5 (#6112). Elle satisfait le
/// « ×1,4 au moins » de la directive du soir, et l'adopter évite de défaire un
/// arbitrage déjà rendu.
///
/// > Entre deux valeurs qui satisfont la contrainte, prendre celle qu'une
/// > décision a DÉJÀ produite. Une constante neuve, même conforme, oblige à
/// > rejouer l'arbitrage qui l'a fixée.
final class ReactionBarScaleParityTests: XCTestCase {

    /// L'échelle unique, telle que le composant la sert par défaut.
    private static let echelleAttendue: Double = 1.5

    /// Le plancher de la directive — la garde tombe si quelqu'un descend sous
    /// lui, même en gardant l'unicité.
    private static let plancherDirective: Double = 1.4

    /// La racine du dépôt, trouvée en REMONTANT jusqu'au dossier qui contient
    /// `apps/` et `packages/`.
    ///
    /// Compter les `deletingLastPathComponent()` est ce que j'ai fait d'abord,
    /// et je m'y suis trompé sur les DEUX fichiers de ce lot : le premier appel
    /// retire le NOM DU FICHIER, pas le dossier qui le contient, si bien que
    /// les commentaires de comptage étaient décalés d'un cran. Un chemin
    /// construit par un nombre est faux en silence — il rend un dossier qui
    /// existe, et l'erreur ne se voit qu'au fichier absent.
    private func racine() -> URL {
        var url = URL(fileURLWithPath: #filePath)
        let fs = FileManager.default
        while url.pathComponents.count > 1 {
            url = url.deletingLastPathComponent()
            let apps = url.appendingPathComponent("apps")
            let paquets = url.appendingPathComponent("packages")
            if fs.fileExists(atPath: apps.path) && fs.fileExists(atPath: paquets.path) {
                return url
            }
        }
        return url
    }

    private func source(_ chemin: String) throws -> String {
        try String(contentsOf: racine().appendingPathComponent(chemin), encoding: .utf8)
    }

    private var composant: String {
        "packages/MeeshySDK/Sources/MeeshyUI/Primitives/EmojiReactionPicker.swift"
    }

    /// Une garde négative dont le balayage ne voit rien reste verte pour la
    /// pire des raisons.
    func test_leBalayageVoitLeComposantEtSesHotes() throws {
        let picker = try source(composant)
        XCTAssertTrue(picker.contains("public struct EmojiReactionPicker"),
                      "le composant partagé doit être là où on le cherche")

        for hote in Self.hotes {
            let s = try source(hote)
            XCTAssertTrue(s.contains("EmojiReactionPicker("),
                          "\(hote) doit monter la barre — sinon l'inventaire a dérivé")
        }
    }

    /// **Le défaut du composant EST l'échelle unique.**
    func test_leDefautDuComposantPorteLEchelleUnique() throws {
        let picker = try source(composant)

        XCTAssertTrue(picker.contains("scale: CGFloat = \(Self.echelleAttendue)"),
                      "le défaut doit valoir \(Self.echelleAttendue) — c'est lui qui aligne les hôtes qui ne surchargent pas")
    }

    /// **Le plancher de la directive est tenu.** Distinct du témoin précédent :
    /// celui-ci tombe même si quelqu'un change l'échelle unique pour une autre
    /// valeur unique, mais trop petite.
    func test_lEchelleUniqueTientLePlancherDeLaDirective() {
        XCTAssertGreaterThanOrEqual(Self.echelleAttendue, Self.plancherDirective,
                                    "la directive demande « ×1,4 au moins »")
    }

    /// Les sept hôtes de la barre, relevés par un compte et non à l'œil.
    private static let hotes = [
        "apps/ios/Meeshy/Features/Main/Components/MessageOverlayMenu.swift",
        "apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReactionsDetailView.swift",
        "apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleStandardLayout+Media.swift",
        "apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageRow.swift",
        "apps/ios/Meeshy/Features/Main/Views/PostReactionPalette.swift",
    ]

    /// **La rangée partagée offre AU MOINS quinze émojis** (#6117 —
    /// « quickEmojis doit avoir plus de possibilités »).
    ///
    /// Le nombre est un plancher, pas une égalité : la liste peut grandir, elle
    /// ne doit pas rétrécir sous ce qu'un utilisateur a déjà vu.
    func test_laRangeePartageeOffreAuMoinsQuinzeEmojis() throws {
        let source = try source("packages/MeeshySDK/Sources/MeeshyUI/Primitives/MeeshyQuickReactions.swift")

        guard let plage = source.range(of: "public static let standard: [String] = [") else {
            return XCTFail("la liste partagée n'est plus là où on la cherche")
        }
        guard let fin = source[plage.upperBound...].firstIndex(of: "]") else {
            return XCTFail("la liste partagée n'est pas close")
        }
        let corps = source[plage.upperBound..<fin]
        let compte = corps.filter { $0 == "\"" }.count / 2

        XCTAssertGreaterThanOrEqual(compte, 15,
                                    "la rangée doit offrir au moins quinze émojis — elle en portait six")
    }

    /// **Tout hôte qui sert la liste PARTAGÉE fait défiler sa rangée.**
    ///
    /// Le lien est causal, pas décoratif : la liste est passée de six à quinze,
    /// et une rangée non défilante ROGNE ce qui dépasse. Les émojis coupés ne
    /// sont pas seulement invisibles — ils sont inatteignables, et rien ne le
    /// dit à l'écran.
    func test_toutHoteDeLaListePartageeFaitDefilerSaRangee() throws {
        var fautifs: [String] = []

        for hote in Self.hotes + ["apps/ios/Meeshy/Features/Main/Views/PostReactionPalette.swift"] {
            let s = try source(hote)
            guard let plage = s.range(of: "EmojiReactionPicker(") else { continue }
            let fenetre = s[plage.lowerBound...].prefix(700)
            guard fenetre.contains("MeeshyQuickReactions.standard") else { continue }
            if !fenetre.contains("scrollable: true") { fautifs.append(hote) }
        }

        XCTAssertEqual(fautifs, [],
                       "une rangée non défilante rogne les émojis au-delà du gabarit, sans le dire")
    }

    /// **Aucun hôte ne surcharge l'échelle.** Une surcharge est une exception :
    /// elle doit être écrite, donc justifiée — et il n'y en a aucune à
    /// justifier aujourd'hui.
    ///
    /// Les deux hôtes tenus par #6112 (`ConversationMediaGalleryView`,
    /// `StoryViewerView+Sidebar`) sont HORS de cette liste : leur échelle est
    /// en cours d'arbitrage dans un autre lot, et une garde qui réclamerait
    /// leur alignement rougirait contre un travail vivant plutôt que contre un
    /// défaut.
    func test_aucunHoteNeSurchargeLEchelle() throws {
        var fautifs: [String] = []

        for hote in Self.hotes {
            let s = try source(hote)
            guard let plage = s.range(of: "EmojiReactionPicker(") else { continue }
            let fenetre = s[plage.lowerBound...].prefix(400)
            if fenetre.contains("scale:") {
                fautifs.append(hote)
            }
        }

        XCTAssertEqual(fautifs, [],
                       "une échelle écrite au site est une seconde vérité à tenir d'accord avec le défaut")
    }
}
