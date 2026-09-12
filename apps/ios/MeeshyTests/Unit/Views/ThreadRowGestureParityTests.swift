import XCTest

/// **Le double tap et l'appui long ouvrent la MÊME chose, depuis le MÊME site
/// (#6117).**
///
/// Directive porteur du 2026-09-12 : « la touche double tap sur les messages de
/// script qui affiche les menu et reaction convenable pour liquidglass ».
/// « script » n'est pas une coquille — c'est un mode de lecture
/// (`ConversationReadingMode.script`).
///
/// ## Ce que cette garde tient, et pourquoi elle est de SOURCE
///
/// Avant ce lot, les deux gestes vivaient à deux ÉTAGES différents :
///
/// | geste | où | ce qu'il ouvrait |
/// |---|---|---|
/// | appui long | `BubbleSwipeContainer` — le conteneur de CHAQUE cellule | le menu (`onLongPress`) |
/// | double tap | `ThemedMessageBubble` — l'INTÉRIEUR d'une bulle | la barre de réactions seule |
///
/// Deux conséquences mesurées, et la seconde est celle que la directive nomme :
///
/// 1. **deux destinations pour deux gestes voisins** sur le même objet ;
/// 2. **le double tap n'existait pas en `.script` ni en `.focal`** — ces deux
///    modes sont rendus par `FocalRow`, pas par `ThemedMessageBubble`, et le
///    geste était posé à l'intérieur de la seconde.
///
/// Le conteneur, lui, enveloppe les cellules des TROIS peaux
/// (`MessageListViewController` — `.bubbles`, `.script`, `.focal`). Poser le
/// geste là le donne aux trois d'un coup.
///
/// ## Pourquoi la parité se garde par la SOURCE, et non par un test de vue
///
/// Ce qu'on veut interdire n'est pas un mauvais rendu : c'est la DÉRIVE. Un
/// futur lot qui changerait la destination d'un seul des deux gestes
/// rétablirait exactement le défaut que ce lot corrige, et aucun témoin de vue
/// ne tomberait — les deux chemins continueraient de fonctionner, séparément.
///
/// C'est la même raison qui a fait écrire `AttachmentReactionOffer` comme une
/// loi plutôt qu'un `if` dans un `body` : une condition enfouie dans une vue
/// n'est interrogeable par aucun témoin.
///
/// ## Ce que cette garde ne dit PAS
///
/// - elle ne garde pas le double tap d'une PIÈCE (grille média) : celui-là vise
///   la pièce, pas le message, et la vue interne le capte avant le conteneur ;
/// - elle ne garde pas le plein écran, où le double tap reste le ZOOM — un
///   réflexe système que ce lot ne casse pas ;
/// - elle ne couvre ni `.river` ni `.summary`, qui sont des hôtes SwiftUI
///   séparés (le premier porte son propre menu natif, le second ne rend pas de
///   message ligne à ligne).
final class ThreadRowGestureParityTests: XCTestCase {

    private func sourceDuConteneur() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Views
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .appendingPathComponent("Meeshy/Features/Main/Views/MessageListView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le balayage doit VOIR le fichier : une garde négative dont la source est
    /// vide reste verte pour la pire des raisons.
    func test_leBalayageVoitBienLeConteneur() throws {
        let source = try sourceDuConteneur()

        XCTAssertTrue(source.contains("struct BubbleSwipeContainer"),
                      "le conteneur des trois peaux doit être dans ce fichier")
        XCTAssertTrue(source.contains("ConditionalBubbleLongPress"),
                      "l'appui long doit être posé sur ce conteneur")
    }

    /// **Le double tap est posé sur le CONTENEUR**, pas à l'intérieur d'une
    /// bulle — c'est ce qui le donne aux trois peaux.
    func test_leDoubleTapEstPoseSurLeConteneurDesTroisPeaux() throws {
        let source = try sourceDuConteneur()

        XCTAssertTrue(source.contains("ThreadRowDoubleTap"),
                      "le double tap doit vivre sur BubbleSwipeContainer, hôte des trois peaux")
    }

    /// **Les deux gestes visent la MÊME destination.** C'est l'invariant que ce
    /// lot pose : `onLongPress` est le seul rappel de menu du conteneur, et le
    /// double tap doit l'appeler — jamais un second rappel qui lui ressemble.
    func test_lesDeuxGestesAppellentLeMemeRappel() throws {
        let source = try sourceDuConteneur()

        let interdits = ["onDoubleTap", "onQuickReact", "onOpenMenuFromDoubleTap"]
        for nom in interdits {
            XCTAssertFalse(source.contains(nom),
                           "\(nom) ouvrirait une SECONDE destination : les deux gestes divergeraient au premier ajustement")
        }
    }

    /// **Le double tap s'éteint en mode sélection, comme l'appui long.** Une
    /// seule intention à la fois (#4005) — et une garde posée sur un seul des
    /// deux gestes est une garde qui a déjà commencé à diverger.
    func test_leDoubleTapSEteintEnModeSelection() throws {
        let source = try sourceDuConteneur()

        guard let plage = source.range(of: "ThreadRowDoubleTap") else {
            return XCTFail("le double tap n'est pas encore posé sur le conteneur")
        }
        let fenetre = source[plage.lowerBound...].prefix(220)

        XCTAssertTrue(fenetre.contains("isSelectionModeActive"),
                      "le double tap doit porter la même garde de sélection que l'appui long")
    }

    /// **La bulle ne porte plus de double tap de MESSAGE.** Deux gestes
    /// identiques à deux étages, avec deux destinations, sont exactement le
    /// défaut corrigé : le laisser en place le rejouerait dans la seule peau qui
    /// l'avait.
    func test_laBulleNePortePlusDeDoubleTapDeMessage() throws {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Views/ThemedMessageBubble.swift")
        let source = try String(contentsOf: url, encoding: .utf8)

        XCTAssertTrue(source.contains("struct ThemedMessageBubble"),
                      "le balayage doit voir la bulle")
        XCTAssertFalse(source.contains("QuickReactionDoubleTap("),
                       "le double tap du MESSAGE a quitté la bulle pour le conteneur des trois peaux")
    }
}
