import XCTest
@testable import Meeshy

/// **#4611 — une porte déclarée que personne ne peut ouvrir.**
///
/// `ComposerOrigin` déclare HUIT portes. Cinq sont construites par un site de
/// production (mesuré le 2026-08-31) :
///
/// | vivante | site |
/// |---|---|
/// | `.storyTray` | `StoryTrayActions.swift` |
/// | `.feedComposer` | `RootViewComponents.swift` |
/// | `.moodChip` | `RootViewComponents.swift`, `ConversationListView.swift` |
/// | `.repost` | `RootView.swift`, `iPadRootView.swift` |
/// | `.conversationMedia` | `ConversationMediaComposerDoor.swift` |
///
/// Les trois autres — `.edit`, `.draft`, `.share` — n'ont aucun appelant. Elles
/// ont pourtant un profil complet.
///
/// > **Onze témoins verts décrivaient `.reelTab`, une porte que personne ne
/// > pouvait ouvrir.** Un témoin qui épingle une route ne prouve que la
/// > cohérence du code AVEC LUI-MÊME : il dit qu'une intention est bien
/// > profilée, jamais qu'on peut la former.
///
/// **`.reelTab` a été RETIRÉE le 2026-08-31** (décision porteur, #4623) : le
/// produit ne veut pas de porte par FORMAT — on entre par le fil ou par le
/// « + » des stories, et le format se choisit DANS le composer. C'est le
/// troisième état que cette garde admet, et le seul qui fasse RÉTRÉCIR
/// l'inventaire : **une porte se monte, se retire, ou porte sa raison.**
///
/// ## Ce que cette garde fait, et qu'aucune autre ne faisait
///
/// La loi 4 — « un contrôle sans effet est ABSENT » — était appliquée aux
/// boutons, aux jetons, aux bandes. Pas aux ROUTES. Une porte morte ne rougit
/// nulle part : elle compile, elle est testée, et rien ne dit qu'aucun doigt ne
/// l'atteint.
///
/// La garde a **deux moitiés, et la seconde est celle qui pourrit** :
///
/// 1. une porte sans appelant doit figurer à l'inventaire, avec sa raison ;
/// 2. une porte de l'inventaire qui a GAGNÉ un appelant doit en sortir.
///
/// Sans la seconde, l'inventaire deviendrait une amnistie permanente : le jour
/// où une porte reçoit enfin son bouton, plus rien ne dirait qu'elle n'est plus
/// morte, et la liste mentirait en restant verte.
///
/// ## Pourquoi la raison vit dans le CODE, pas ici
///
/// Chaque entrée porte un fragment que la garde va chercher dans
/// `ComposerIntent.swift`. Une raison écrite seulement dans un test ne se lit
/// pas quand on ouvre la porte pour la monter — et c'est exactement à ce
/// moment-là qu'elle sert.
final class ComposerDoorInventoryGuardTests: XCTestCase {

    // MARK: - L'inventaire

    /// Porte sans appelant → le fragment de sa RAISON, tel qu'il doit se lire
    /// dans `ComposerIntent.swift`.
    ///
    /// **Le fragment ne doit pas enjamber un retour à la ligne** : la recherche
    /// porte sur la source BRUTE, où un commentaire long est coupé par des
    /// `///` ou des `//`. Un fragment à cheval sur deux lignes ne matche jamais
    /// — et la garde rougirait en accusant une raison absente qui, elle, est
    /// bien là.
    private static let declareesSansAppelant: [String: String] = [
        "edit": "zéro occurrence, mesurée",
        "draft": "c'est elle qui n'a pas d'appelant",
        "share": "ne fait aujourd'hui que",
    ]

    // MARK: - Lecture des sources

    private static let racine = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()   // Composer
        .deletingLastPathComponent()   // Unit
        .deletingLastPathComponent()   // MeeshyTests
        .deletingLastPathComponent()   // apps/ios

    private static let declaration = "Meeshy/Features/Main/Composer/ComposerIntent.swift"

    private func sourceDeLaDeclaration(commentairesGardes: Bool = false) throws -> String {
        let brut = try String(contentsOf: Self.racine.appendingPathComponent(Self.declaration),
                              encoding: .utf8)
        return commentairesGardes ? brut : AppSourceGuard.stripComments(brut)
    }

    /// TOUTES les sources de production de l'app et de ses extensions —
    /// commentaires retirés, sinon une porte CITÉE dans un doc-comment passerait
    /// pour construite. C'est le cas de `.feedComposer` (deux citations) et de
    /// `.edit` (une citation qui dit précisément qu'elle n'a aucun appelant).
    private func sourcesDeProduction() throws -> [String] {
        var codes: [String] = []
        for cible in ["Meeshy", "MeeshyShareExtension", "MeeshyNotificationExtension",
                      "MeeshyWidgets", "MeeshyContextMenu"] {
            let dossier = Self.racine.appendingPathComponent(cible)
            guard let enumerateur = FileManager.default.enumerator(at: dossier,
                                                                   includingPropertiesForKeys: nil)
            else { continue }
            for case let url as URL in enumerateur where url.pathExtension == "swift" {
                let brut = try String(contentsOf: url, encoding: .utf8)
                codes.append(AppSourceGuard.stripComments(brut))
            }
        }
        return codes
    }

    /// Les cas de `ComposerOrigin`, LUS dans l'énumération — jamais recopiés.
    /// Une liste écrite à la main ne verrait pas la dixième porte, c'est-à-dire
    /// exactement celle contre laquelle cette garde existe.
    private func portesDeclarees() throws -> Set<String> {
        let source = try sourceDeLaDeclaration()
        guard let debut = source.range(of: "enum ComposerOrigin") else { return [] }
        let apres = source[debut.upperBound...]
        guard let ouvrante = apres.firstIndex(of: "{") else { return [] }

        var profondeur = 0
        var corps = ""
        var curseur = ouvrante
        boucle: while curseur < apres.endIndex {
            let c = apres[curseur]
            if c == "{" { profondeur += 1 }
            if c == "}" {
                profondeur -= 1
                if profondeur == 0 { break boucle }
            }
            if profondeur >= 1 { corps.append(c) }
            curseur = apres.index(after: curseur)
        }

        var portes: Set<String> = []
        for ligne in corps.components(separatedBy: "\n") {
            let nette = ligne.trimmingCharacters(in: .whitespaces)
            guard nette.hasPrefix("case ") else { continue }
            for nom in Self.decoupeALaVirguleHorsParentheses(String(nette.dropFirst(5))) {
                let identifiant = nom.prefix { $0.isLetter || $0.isNumber || $0 == "_" }
                if !identifiant.isEmpty { portes.insert(String(identifiant)) }
            }
        }
        return portes
    }

    /// `case draft(id: String), share` doit rendre `draft` ET `share` — une
    /// découpe naïve sur la virgule couperait aussi
    /// `repost(ofPostId: String, sourceFormat: ComposerFormat)` en deux.
    private static func decoupeALaVirguleHorsParentheses(_ texte: String) -> [String] {
        var morceaux: [String] = []
        var courant = ""
        var profondeur = 0
        for c in texte {
            if c == "(" { profondeur += 1 }
            if c == ")" { profondeur -= 1 }
            if c == ",", profondeur == 0 {
                morceaux.append(courant.trimmingCharacters(in: .whitespaces))
                courant = ""
            } else {
                courant.append(c)
            }
        }
        morceaux.append(courant.trimmingCharacters(in: .whitespaces))
        return morceaux.filter { !$0.isEmpty }
    }

    private func aUnAppelant(_ porte: String, dans codes: [String]) -> Bool {
        codes.contains { $0.contains("origin: .\(porte)") }
    }

    // MARK: - Le fusible

    /// Sans lui, un renommage de l'énumération rendrait toute la garde verte sur
    /// zéro porte — le mode d'extinction propre aux gardes qui comptent.
    func test_laGarde_litVraimentLesPortes() throws {
        let portes = try portesDeclarees()
        XCTAssertGreaterThanOrEqual(
            portes.count, 8,
            "Moins de huit portes lues — l'analyse de `ComposerOrigin` a cessé de fonctionner."
        )
        XCTAssertTrue(portes.contains("storyTray") && portes.contains("conversationMedia"),
                      "Portes attendues absentes de la lecture : \(portes.sorted())")
    }

    // MARK: - Les deux moitiés de la règle

    /// **Première moitié : une porte sans appelant doit être DÉCLARÉE telle.**
    ///
    /// Le jour où une dixième porte arrive sans son bouton, cette assertion
    /// tombe — c'est le seul signal qui dise « personne ne peut l'ouvrir ».
    func test_toutePorteSansAppelant_figureALInventaire_avecSaRaison() throws {
        let codes = try sourcesDeProduction()
        let orphelines = try portesDeclarees()
            .filter { !aUnAppelant($0, dans: codes) }
            .sorted()

        XCTAssertEqual(
            orphelines.filter { Self.declareesSansAppelant[$0] == nil }, [],
            "Ces portes sont déclarées et AUCUN site de production ne les construit. Une route "
                + "morte ne rougit nulle part : elle compile, elle se teste, et rien ne dit qu'aucun "
                + "doigt ne l'atteint. Soit un site la monte, soit elle est retirée, soit elle entre "
                + "à l'inventaire de cette garde AVEC sa raison, écrite dans `ComposerIntent.swift`."
        )
    }

    /// **Seconde moitié : l'inventaire ne survit pas à la porte qu'il amnistie.**
    ///
    /// C'est la moitié qui pourrit. Sans elle, la liste resterait verte le jour
    /// où une porte de l'inventaire reçoit son bouton, et une amnistie
    /// deviendrait permanente.
    func test_unePorteDeLInventaire_quiGagneUnAppelant_enSort() throws {
        let codes = try sourcesDeProduction()
        let ressuscitees = Self.declareesSansAppelant.keys
            .filter { aUnAppelant($0, dans: codes) }
            .sorted()

        XCTAssertEqual(
            ressuscitees, [],
            "Ces portes ont GAGNÉ un site de production : elles ne sont plus mortes et doivent "
                + "quitter l'inventaire, raison comprise. Une amnistie qu'on ne retire pas devient "
                + "une amnistie permanente."
        )
    }

    /// **La raison vit dans le CODE.** Une raison écrite seulement ici ne se lit
    /// pas quand on ouvre `ComposerIntent.swift` pour monter la porte — et c'est
    /// exactement à ce moment-là qu'elle sert.
    func test_chaqueRaison_estEcriteDansLaDeclaration() throws {
        let source = try sourceDeLaDeclaration(commentairesGardes: true)
        let muettes = Self.declareesSansAppelant
            .filter { !source.contains($0.value) }
            .keys.sorted()

        XCTAssertEqual(
            muettes, [],
            "La raison de ces portes a disparu de `ComposerIntent.swift`. Un inventaire dont la "
                + "raison ne vit que dans un test laisse la session suivante monter la porte en "
                + "confiance."
        )
    }

    /// L'inventaire ne peut pas amnistier une porte qui n'existe plus : une
    /// entrée orpheline se périmerait en silence, verte, en gardant un nom que
    /// l'énumération a retiré.
    func test_lInventaire_neNommeQueDesPortesExistantes() throws {
        let portes = try portesDeclarees()
        XCTAssertEqual(
            Self.declareesSansAppelant.keys.filter { !portes.contains($0) }.sorted(), [],
            "L'inventaire nomme une porte absente de `ComposerOrigin`."
        )
    }
}
