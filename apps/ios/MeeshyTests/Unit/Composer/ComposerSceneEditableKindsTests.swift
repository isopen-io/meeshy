import XCTest
@testable import Meeshy
@testable import MeeshySDK
@testable import MeeshyUI

/// **Ce que « Modifier » OFFRE et ce que l'hôte SAIT faire doivent coïncider**
/// (#4937).
///
/// Deux déclarations gouvernent le même geste, et elles sont dans deux fichiers :
///
/// - `ComposerSceneSurface.editableSceneKinds` décide si le geste est OFFERT —
///   `StoryCanvasUIView.canEdit(kind)` le lit ;
/// - le `switch` d'`onItemEdit`, chez le meuble, décide de ce qui SE PASSE.
///
/// Le doc-comment de l'hôte prévient depuis #4082 : « servir l'un sans l'autre
/// rendrait "Modifier" offert et inerte ». C'était un rappel écrit ; ce fichier
/// en fait une garde.
///
/// > **Un avertissement dans un commentaire protège le lecteur qui le lit.** La
/// > moitié des lots qui traversent ce fichier ne le lisent pas — c'est le
/// > propre d'un commentaire posé sur ce qu'on ne modifie pas.
/// `@MainActor` parce que `CanvasItemKind` est imbriqué dans `StoryCanvasUIView`,
/// une `UIView`, donc `@MainActor` — et **sa conformité à `Hashable` hérite de
/// cette isolation**. Un témoin `nonisolated` ne peut donc pas s'en servir dans
/// un `Set`. C'est la convention du dépôt (`apps/ios/CLAUDE.md`), et la raison
/// mérite d'être écrite : l'isolation se propage par les appels ET par les
/// CONFORMANCES, ce qui la rend invisible au premier coup d'œil.
@MainActor
final class ComposerSceneEditableKindsTests: XCTestCase {

    private func hostSource() throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Meeshy/Features/Main/Composer/MeeshyComposerHost+Surfaces.swift")
        // **Les commentaires sont DÉPOUILLÉS**, et ce n'est pas une précaution
        // de style : la première version de cette garde rougissait sur mon
        // propre commentaire, qui explique pourquoi le `break` a disparu — donc
        // qui contient le mot `break`.
        //
        // Une garde de source qui cherche un fragment le trouve dans la PROSE
        // qui le nomme, y compris dans la phrase écrite pour dire qu'il n'est
        // plus là. C'est le motif que le dépôt a déjà payé deux fois.
        return AppSourceGuard.stripComments(try String(contentsOf: url, encoding: .utf8))
    }

    func test_laSource_estLisible() throws {
        XCTAssertTrue(try hostSource().contains("onItemEdit:"),
                      "le balayage ne voit pas l'hôte — chemin faux, et un balayage aveugle "
                      + "est toujours vert")
    }

    /// **Les cinq familles sont OFFERTES.** Un objet qu'on ne peut pas ouvrir
    /// n'a aucun écran où régler sa fenêtre — c'est ce que #4937 ferme.
    func test_lesCinqFamilles_sontOffertes() {
        let offertes = ComposerSceneSurface.defaultEditableSceneKinds
        for famille in MeeshySceneObject.Kind.allCases {
            let surLaToile = MeeshyComposerHost.canvasKind(famille)
            XCTAssertTrue(offertes.contains(surLaToile),
                          "\(famille) n'est pas offerte à l'édition — son geste sera muet")
        }
    }

    /// **Et aucune n'est offerte sans réponse.** Le témoin qui porte la loi :
    /// il lit le `switch` de l'hôte et refuse qu'une famille offerte y tombe
    /// dans un `break`.
    ///
    /// Sans lui, élargir le jeu sans élargir le `switch` — l'ordre naturel,
    /// puisque le jeu est dans l'autre fichier — rendrait « Modifier » offert
    /// et inerte, sur trois familles d'un coup.
    func test_aucuneFamilleOfferte_neTombeDansUnBreak() throws {
        let source = try hostSource()
        guard let debut = source.range(of: "onItemEdit: { id, kind in"),
              let fin = source.range(of: "},", range: debut.upperBound..<source.endIndex) else {
            return XCTFail("le `switch` d'`onItemEdit` est introuvable — la garde ne mesure rien")
        }
        let corps = String(source[debut.upperBound..<fin.lowerBound])
        XCTAssertFalse(corps.contains("break"),
                       "une famille offerte tombe dans un `break` : « Modifier » y serait "
                       + "offert et INERTE. Élargir le `switch` en même temps que le jeu.")
    }
}
