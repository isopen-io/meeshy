import XCTest
@testable import Meeshy

/// **Le prisme n'affiche que ce dont on a besoin, au moment où on en a besoin
/// (directive porteur, 2026-08-30) — et « c'est très important de maintenir
/// pour TOUS ».**
///
/// Le porteur l'a énoncée sur le `⋯` : *« le menu ⋯ apparaît quand il y a du
/// contenu pour appliquer des options »*. Ce n'est pas une règle du menu, c'est
/// une règle du composer entier, et cette garde existe pour qu'elle ne se perde
/// pas au prochain contrôle ajouté.
///
/// **Elle est la JUMELLE TEMPORELLE de la loi 4.** La loi 4 dit : un contrôle
/// sans effet est ABSENT, jamais grisé. Celle-ci ajoute le *quand* : un contrôle
/// dont l'objet n'existe pas ENCORE est absent lui aussi, et il paraît à
/// l'instant où son objet apparaît. Les deux se répondent — la première juge la
/// capacité, la seconde le moment.
///
/// Deux exceptions, et elles sont NOMMÉES, jamais implicites :
/// - **l'action terminale** (`Publier`) reste peinte et grisée, avec sa raison
///   en indice d'accessibilité : la masquer laisserait l'auteur sans savoir par
///   où sortir ;
/// - **les FORMATS impossibles** restent au menu, éteints avec leur raison
///   (#4030) — parce qu'un format enseigne une règle du produit, quand un
///   contrôle ne fait qu'agir. C'est `ComposerFormatAvailabilityTests` qui la
///   porte.
///
/// La garde lit la SOURCE parce que le montage conditionnel d'une vue ne
/// s'observe pas autrement sans hôte SwiftUI : ce qui compte est qu'un `if`
/// existe, et qu'il interroge le CONTENU.
final class ComposerProgressiveDisclosureGuardTests: XCTestCase {

    // MARK: - La règle, énoncée sur le cas du porteur

    /// **Le cas d'origine** : un composer vierge n'a rien sur quoi appliquer une
    /// option, donc pas de `⋯`.
    func test_unComposerVierge_nOffreAucuneEntreeDeMenu() {
        XCTAssertTrue(
            ComposerOverflowPolicy.entries(hasBackground: false, hasMedia: false,
                                           hasText: false, hasLocation: false).isEmpty,
            "sans contenu, le `⋯` n'a rien à proposer — et un menu à zéro entrée "
            + "est un bouton qui n'ouvre rien"
        )
    }

    /// Le témoin s'écrit sur les DEUX verdicts : n'éprouver que le vide
    /// laisserait passer une règle qui ne rend jamais rien.
    func test_desQuUnContenuExiste_leMenuParait() {
        for contenu in ["fond", "média", "texte", "lieu"] {
            let entrees = ComposerOverflowPolicy.entries(
                hasBackground: contenu == "fond",
                hasMedia: contenu == "média",
                hasText: contenu == "texte",
                hasLocation: contenu == "lieu")
            XCTAssertFalse(entrees.isEmpty, "un composer qui porte un \(contenu) a de quoi ouvrir le `⋯`")
        }
    }

    // MARK: - Le cliquet : chaque chrome optionnel reste derrière SA condition

    /// **Quatre sites, quatre conditions.** Ils obéissent tous aujourd'hui ; la
    /// garde existe pour que le CINQUIÈME contrôle ajouté ne soit pas peint sans
    /// condition, ce qu'aucun test ne signalerait autrement.
    func test_chaqueChromeOptionnel_resteDerriereSaCondition() throws {
        let surfaces = try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        let rail = try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/ComposerTrailingRail.swift")

        // Le `⋯` — le cas du porteur, sur ses DEUX sites de montage.
        XCTAssertEqual(
            occurrences(of: "documentOverflowEntries.isEmpty", in: surfaces), 2,
            "les deux montages du `⋯` interrogent les entrées servies : un menu vide n'est pas monté"
        )
        // Annuler / rétablir — rien à défaire, rien à peindre.
        XCTAssertTrue(
            surfaces.contains("if canUndoHistory || canRedoHistory"),
            "la capsule d'historique ne paraît que s'il y a un geste à défaire ou à refaire"
        )
        // La bande de rognage — pas d'objet rognable, pas de bande.
        XCTAssertTrue(
            surfaces.contains("canTrimSelection: trimmableSelection != nil"),
            "la bande `timeline` n'est servie que pour une sélection qui a une source à rogner"
        )
        // Le rail des contrôleurs — pas de sélection, pas de rail.
        XCTAssertTrue(
            rail.contains("if !isEmpty"),
            "le rail *trailing* ne se peint pas quand il n'a aucune action à porter"
        )
    }

    /// **Le fusible.** Sans lui, la garde ci-dessus passerait au vert le jour où
    /// la lecture de source casse — elle chercherait des sous-chaînes dans une
    /// chaîne vide et n'en trouverait aucune, ce qui ne rougit que si on l'a
    /// prévu.
    func test_laLectureDeSourceVoitBienLeMeuble() throws {
        let surfaces = try AppSourceGuard.unit(
            "Meeshy/Features/Main/Composer/MeeshyComposerHost.swift")
        XCTAssertGreaterThan(surfaces.count, 20_000,
                             "l'unité du meuble doit être lue en entier — \(surfaces.count) caractères lus")
        XCTAssertTrue(surfaces.contains("struct MeeshyComposerHost"),
                      "extraction cassée : le type du meuble est introuvable")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        guard !needle.isEmpty else { return 0 }
        var total = 0
        var index = haystack.startIndex
        while let found = haystack.range(of: needle, range: index..<haystack.endIndex) {
            total += 1
            index = found.upperBound
        }
        return total
    }
}
