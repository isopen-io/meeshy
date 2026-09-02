import XCTest
@testable import Meeshy

/// **Aucun rappel du composer n'est déclaré sans être alimenté** (directive
/// porteur 2026-08-31 : « assure-toi que toutes les actions/boutons soient
/// branchés et de la cohérence de toutes les autres vues »).
///
/// ## Ce que cette garde attrape, et qu'aucune autre n'attrape
///
/// Le compilateur garantit qu'un paramètre NON optionnel est passé. Il ne dit
/// rien d'un `var onQuelqueChose: (() -> Void)?` — sa valeur par défaut est
/// `nil`, donc une vue peut le déclarer, peindre le bouton qui l'appelle, et
/// n'être jamais branchée par personne. Le bouton existe, il vibre, VoiceOver
/// l'annonce `.isButton`, et il n'ouvre rien.
///
/// Le dépôt a déjà payé ce motif plusieurs fois — les six capsules de
/// l'inspecteur (#4073), les quatre portes du rail (#4120), le contrôle inerte
/// de `PostCard` (cycle 123). À chaque fois, le contrat portait le rappel depuis
/// la livraison et AUCUN hôte ne le remplissait.
///
/// > **Suivre une donnée jusqu'à son consommateur s'arrête un cran trop tôt : il
/// > faut la suivre jusqu'au PIXEL, et demander ce que le doigt OBTIENT.**
///
/// ## Pourquoi la lecture est ÉQUILIBRÉE et non fenêtrée
///
/// La première version de cette mesure lisait 9 000 caractères après
/// `ComposerSceneSurface(` et déclarait quatre rappels non branchés. Le site de
/// montage en fait 13 562 : la fenêtre en coupait un tiers, et les quatre
/// « manquants » étaient tous passés dans la partie tronquée.
///
/// > **Une fenêtre de lecture fixe ne dit pas qu'elle coupe.** Elle rend un
/// > résultat plausible, faux, et d'autant plus convaincant qu'il nomme des
/// > choses précises. Le site se lit donc jusqu'à sa parenthèse ÉQUILIBRÉE.
final class ComposerCallbackWiringGuardTests: XCTestCase {

    private func source(_ nom: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/\(nom)")
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    /// Les rappels DÉCLARÉS par une vue — lus de la source, jamais recopiés :
    /// une liste écrite ici divergerait au premier rappel ajouté, et le témoin
    /// passerait au vert en cessant de le mesurer.
    private func declaredCallbacks(in code: String) -> Set<String> {
        var trouves: Set<String> = []
        for ligne in code.components(separatedBy: .newlines) {
            let t = ligne.trimmingCharacters(in: .whitespaces)
            guard t.hasPrefix("var on") || t.hasPrefix("let on") else { continue }
            let sansPrefixe = t.dropFirst(4)
            let nom = sansPrefixe.prefix { $0.isLetter || $0.isNumber }
            guard nom.count > 2 else { continue }
            trouves.insert(String(nom))
        }
        return trouves
    }

    /// Le site de montage, lu jusqu'à sa parenthèse ÉQUILIBRÉE — voir le
    /// doc-comment de la classe pour ce que coûte une fenêtre fixe.
    private func callSite(of type: String, in code: String) -> String? {
        guard let debut = code.range(of: "\(type)(")?.lowerBound else { return nil }
        var profondeur = 0
        for (offset, caractere) in code[debut...].enumerated() {
            if caractere == "(" { profondeur += 1 }
            if caractere == ")" {
                profondeur -= 1
                if profondeur == 0 {
                    return String(code[debut...][..<code.index(debut, offsetBy: offset)])
                }
            }
        }
        return nil
    }

    private func passedCallbacks(in site: String) -> Set<String> {
        var trouves: Set<String> = []
        for morceau in site.components(separatedBy: CharacterSet(charactersIn: " \n\t,(")) {
            guard morceau.hasPrefix("on"), morceau.hasSuffix(":") else { continue }
            trouves.insert(String(morceau.dropLast()))
        }
        return trouves
    }

    /// **Le fusible.** Zéro rappel lu passerait au vert sur deux ensembles
    /// vides — le mode d'échec le plus discret de ce dépôt.
    func test_laLecture_trouveDesRappels() throws {
        let scene = declaredCallbacks(in: try source("ComposerSceneSurface.swift"))
        XCTAssertGreaterThan(scene.count, 10,
                             "La lecture des rappels a cassé — elle ne mesurerait plus rien.")
    }

    /// **La scène : tout rappel déclaré est alimenté par le meuble.**
    func test_laSurfaceDeScene_aTousSesRappelsBranches() throws {
        try assertWired(surface: "ComposerSceneSurface",
                        fichierSurface: "ComposerSceneSurface.swift",
                        hote: "MeeshyComposerHost+Surfaces.swift")
    }

    /// **Le document, sa jumelle.** Le porteur demande la cohérence de TOUTES
    /// les vues : mesurer une seule surface laisserait les trois autres libres
    /// de déclarer des contrôles morts.
    func test_laSurfaceDeDocument_aTousSesRappelsBranches() throws {
        try assertWired(surface: "ComposerDocumentSurface",
                        fichierSurface: "ComposerDocumentSurface.swift",
                        hote: "MeeshyComposerHost+Surfaces.swift")
    }

    private func assertWired(surface: String, fichierSurface: String, hote: String) throws {
        let declares = declaredCallbacks(in: try source(fichierSurface))
        guard let site = callSite(of: surface, in: try source(hote)) else {
            return XCTFail("Le site de montage de `\(surface)` est introuvable dans \(hote) — "
                           + "la garde doit être re-pointée, sinon elle mesure le vide.")
        }
        let passes = passedCallbacks(in: site)
        let morts = declares.subtracting(passes).sorted()
        XCTAssertTrue(
            morts.isEmpty,
            "\(surface) déclare \(morts.count) rappel(s) que personne n'alimente : "
                + "\(morts.joined(separator: ", ")). Le contrôle qui les appelle est peint, "
                + "vibre sous le doigt, s'annonce `.isButton` à VoiceOver — et n'a AUCUN effet. "
                + "Soit l'hôte le branche, soit la vue cesse de le déclarer."
        )
    }
}
