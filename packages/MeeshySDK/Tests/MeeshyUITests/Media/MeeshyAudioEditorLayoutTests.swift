import XCTest
@testable import MeeshyUI

/// Tenue de l'éditeur audio dans son `fullScreenCover`.
///
/// Symptôme rapporté : la feuille « sort du viewport », les chips débordent —
/// à l'ajout d'un audio, qu'il vienne d'un fichier ou d'un enregistrement (les
/// deux chemins convergent sur cette vue).
///
/// Garde de source assumée : une hauteur qui déborde ne lève aucune exception
/// et ne se lit dans aucun état — SwiftUI dessine simplement hors cadre. Le
/// seul point de contrôle automatisable est la forme du layout. Même famille
/// que `CallViewLayoutGuardTests`, écrit après qu'un backdrop trop large eut
/// décalé tout l'écran d'appel de 30 pt.
@MainActor
final class MeeshyAudioEditorLayoutTests: XCTestCase {

    private func editorSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Media
            .deletingLastPathComponent()   // MeeshyUITests
            .deletingLastPathComponent()   // Tests
            .deletingLastPathComponent()   // MeeshySDK
            .appendingPathComponent("Sources/MeeshyUI/Media/MeeshyAudioEditorView.swift")
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Cause A. Seul le FOND porte `.ignoresSafeArea()` : le contenu, lui, est
    /// déjà inséré de la safe area par SwiftUI. Se la réappliquer à la main
    /// ajoutait ~59 pt en haut et ~34 pt en bas sur un iPhone à Dynamic Island
    /// — presque cent points de hauteur fantôme, sur une vue qui ne défile pas.
    func test_content_doesNotReapplyTheDeviceSafeArea() throws {
        let code = try editorSource()
        XCTAssertFalse(
            code.contains("deviceSafeAreaInsets"),
            "Le contenu reçoit déjà la safe area de SwiftUI (seul le fond l'ignore). "
            + "La relire depuis la fenêtre clé et la repadder la compte DEUX fois."
        )
        XCTAssertFalse(
            code.contains("windows.first(where: { $0.isKeyWindow })"),
            "Lire les inserts depuis la fenêtre clé contourne le système de layout : "
            + "sur iPad en Slide Over ou en multi-scène, ce n'est même pas la bonne fenêtre."
        )
    }

    /// Cause B. `bottomDock` empile jusqu'à cinq blocs — bandeau d'erreur,
    /// panneau d'outil, bande d'historique, bande d'outils, barre du bas — au-
    /// dessus d'une forme d'onde figée à 96 pt et de transports de 60 pt. Les
    /// `Spacer(minLength: 6)` ne descendent pas sous 6. Sans défilement, ouvrir
    /// un panneau d'outil pousse mécaniquement le dock hors de l'écran, et avec
    /// lui les bandes de chips.
    func test_content_scrollsWhenItExceedsTheViewport() throws {
        let code = try editorSource()
        guard let range = code.range(of: "private var content: some View {") else {
            XCTFail("`content` introuvable"); return
        }
        let end = code.range(of: "\n    private var bottomDock", range: range.upperBound ..< code.endIndex)?.lowerBound
            ?? code.endIndex
        let body = String(code[range.upperBound ..< end])

        XCTAssertTrue(
            body.contains("ScrollView"),
            "Le contenu doit pouvoir défiler : sa hauteur intrinsèque dépasse "
            + "l'écran dès qu'un panneau d'outil s'ouvre."
        )
        XCTAssertTrue(
            body.contains("minHeight:"),
            "…mais garder une hauteur plancher égale au conteneur, sinon les "
            + "`Spacer` s'effondrent et le dock cesse d'être ancré en bas quand "
            + "le contenu tient à l'écran."
        )
    }
}
