import XCTest
@testable import Meeshy

/// #5013 — **« Tout effacer » efface TOUT, et l'inventaire est testé.**
///
/// ## Le défaut, et pourquoi le corriger d'une ligne n'aurait rien réglé
///
/// `perform(.clearAll)` remettait onze champs à zéro et en oubliait trois :
/// les personnes NOMMÉES (`composerReferences`), les LÉGENDES des médias
/// (`documentMediaCaptions`) et l'index des durées sources
/// (`trimSourceDurations`). Le premier est celui que le porteur a vu — la
/// publication suivante mentionnait des gens que plus rien à l'écran ne
/// montrait, notification comprise.
///
/// > La question n'est pas « quel champ manque » mais **« qu'est-ce qui tient
/// > cette liste à jour ? »**. Un effacement écrit en ÉNUMÉRATION perd le
/// > prochain champ comme il a perdu ceux-là, et rien ne rougit — c'est le
/// > motif que le dépôt nomme déjà pour `createMentionNotificationsBatch`
/// > (« un relais qui RECOPIE champ par champ est un inventaire à tenir à
/// > jour »), rejoué sur un effacement plutôt que sur un envoi.
///
/// ## Ce que cette garde fait, et ce qu'elle ne peut pas faire
///
/// Elle ne DÉDUIT pas l'inventaire — aucune règle ne peut dire, depuis la
/// source, lesquels des quarante `@State` du meuble portent de la COMPOSITION
/// et lesquels portent de la présentation. Elle l'épingle, et c'est son
/// message d'échec qui fait le travail : il dit quoi ajouter et où.
///
/// C'est une garde de RATCHET, pas de dérivation. Elle vaut ce que vaut la
/// discipline de la mettre à jour — mais elle transforme un oubli SILENCIEUX
/// en un rouge qui nomme le champ, ce qui est exactement la différence entre
/// ce défaut et sa version corrigée.
@MainActor
final class ComposerClearAllInventoryTests: XCTestCase {

    /// Tout ce que l'auteur a COMPOSÉ, et que « Tout effacer » doit reprendre.
    ///
    /// Trois familles, et la deuxième est celle qu'on oublie :
    /// - ce qui se VOIT (texte, médias, fond, lieu) ;
    /// - ce qui PART AVEC sans se voir (les personnes nommées, les légendes) ;
    /// - les INDEX que l'effacement invalide (`slideIdByMediaURL`,
    ///   `mediaRoleByURL`, `trimSourceDurations`), qui servent aussi de gardes
    ///   d'idempotence — un index survivant fait SAUTER la re-pose du même
    ///   fichier après un effacement.
    private static let composition = [
        "viewModel.reset()",
        "documentText",
        "documentLocalMedia",
        "documentBackground",
        "documentLocation",
        "documentDiscoverability",
        "documentTranscriptions",
        "documentMediaCaptions",
        "composerReferences",
        "editedForegroundSound",
        "slideIdByMediaURL",
        "mediaRoleByURL",
        "trimSourceDurations",
        "selectedSceneItemKind"
    ]

    private func clearAllBody() throws -> String {
        let source = AppSourceGuard.stripComments(try AppSourceGuard.composerHostSource())
        guard let debut = source.range(of: "case .clearAll:") else {
            throw XCTSkip("`case .clearAll:` introuvable — la garde ne mesurerait RIEN")
        }
        // Le `case` suivant borne le bloc ; à défaut, la fin de la fonction.
        let reste = source[debut.upperBound...]
        if let fin = reste.range(of: "\n        case ") {
            return String(reste[..<fin.lowerBound])
        }
        return String(reste.prefix(2000))
    }

    func test_toutEffacer_repredChaqueChampDeComposition() throws {
        let bloc = try clearAllBody()
        let manquants = Self.composition.filter { !bloc.contains($0) }
        XCTAssertTrue(
            manquants.isEmpty,
            "« Tout effacer » laisse derrière lui : \(manquants.joined(separator: ", ")).\n"
            + "Un champ de composition qui survit à l'effacement repart avec la publication "
            + "SUIVANTE — c'est ce qui est arrivé aux mentions (#5013), et l'auteur n'avait "
            + "aucun écran pour le voir. Ajoutez la remise à zéro dans "
            + "`MeeshyComposerHost+Overflow.perform(_:)`, ET le nom dans cet inventaire."
        )
    }

    /// **Le fusible de la garde elle-même.** Si `clearAllBody()` cessait de
    /// trouver son bloc, l'assertion ci-dessus passerait au vert sur une chaîne
    /// vide — une garde qui ne mesure rien affirme le contraire de ce qu'elle
    /// prétend.
    func test_laGarde_litUnBlocNonVide() throws {
        XCTAssertGreaterThan(try clearAllBody().count, 200,
                             "le bloc lu est trop court pour être celui de l'effacement")
    }
}
