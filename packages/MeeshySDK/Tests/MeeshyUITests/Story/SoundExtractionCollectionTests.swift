import XCTest
@testable import MeeshyUI

/// C7-UI — collecte de `allowSoundExtraction`.
///
/// `allowSoundExtraction: Bool?` traverse déjà le transport (gateway
/// `CreatePostSchema.allowSoundExtraction`, `PostService.create/update(…
/// allowSoundExtraction:)`) mais rien ne le COLLECTAIT côté UI avant
/// `MediaAccessibilityStore` + `SoundExtractionToggle`.
///
/// C'est un flag UNIQUE sur le post entier (`Post.allowSoundExtraction`,
/// `schema.prisma:3125` — « autorise l'extraction de la bande-son des VIDÉOS
/// de ce post/réel »), PAS un champ par média : un seul interrupteur
/// composer-wide, pas un par clip.
@MainActor
final class SoundExtractionCollectionTests: XCTestCase {

    // MARK: - MediaAccessibilityStore

    /// `test_allowsSoundExtraction_defaultsToFalse` rougit si le défaut
    /// devient `true` : c'est un opt-in de l'auteur sur SON contenu, jamais
    /// un opt-out.
    func test_allowsSoundExtraction_defaultsToFalse() {
        let store = MediaAccessibilityStore()
        XCTAssertFalse(store.allowsSoundExtraction())
    }

    /// `test_setAllowsSoundExtraction_roundTrips` rougit si
    /// `setAllowsSoundExtraction(_:)` cesse d'écrire l'override.
    func test_setAllowsSoundExtraction_roundTrips() {
        let store = MediaAccessibilityStore()
        store.setAllowsSoundExtraction(true)
        XCTAssertTrue(store.allowsSoundExtraction())

        store.setAllowsSoundExtraction(false)
        XCTAssertFalse(store.allowsSoundExtraction())
    }

    /// `test_allowSoundExtractionPayload_isNilUntouched` rougit si le
    /// payload renvoie `false` au lieu de `nil` tant que l'auteur n'a jamais
    /// touché l'interrupteur — un update partiel ne doit jamais écraser un
    /// `true` serveur existant avec un `false` que personne n'a choisi.
    func test_allowSoundExtractionPayload_isNilUntouched() {
        let store = MediaAccessibilityStore()
        XCTAssertNil(store.allowSoundExtractionPayload())
    }

    /// `test_allowSoundExtractionPayload_reflectsExplicitChoice` rougit si
    /// le payload ne reflète pas le dernier choix explicite de l'auteur.
    func test_allowSoundExtractionPayload_reflectsExplicitChoice() {
        let store = MediaAccessibilityStore()
        store.setAllowsSoundExtraction(true)
        XCTAssertEqual(store.allowSoundExtractionPayload(), true)
    }

    /// `test_removingOneMedia_leavesSoundExtractionChoiceIntact` rougit si
    /// `remove(mediaId:)` se met à réinitialiser le choix composer-wide —
    /// supprimer UNE vidéo ne doit pas effacer un choix qui vaut pour tout
    /// le post, tant qu'une autre vidéo peut rester dans la composition.
    func test_removingOneMedia_leavesSoundExtractionChoiceIntact() {
        let store = MediaAccessibilityStore()
        store.setAllowsSoundExtraction(true)
        store.remove(mediaId: "media-1")
        XCTAssertTrue(store.allowsSoundExtraction())
    }

    // MARK: - Gardes de source

    /// `test_toggle_describesConsequenceNotFieldName` rougit si le libellé
    /// ou la légende de `SoundExtractionToggle` se réduisent au nom du champ
    /// technique (`allowSoundExtraction`) au lieu de dire ce qui se passe si
    /// on l'active — consigne explicite du lot : « le libellé doit dire ce
    /// qui se passe si on l'active, pas nommer un champ technique ».
    func test_toggle_describesConsequenceNotFieldName() throws {
        let code = try ComposerSourceGuard.source("Controls/SoundExtractionToggle.swift")
        XCTAssertFalse(code.contains("\"allowSoundExtraction\""),
                       "Le libellé visible ne doit jamais nommer le champ technique.")
        XCTAssertTrue(code.contains("story.media.soundExtraction.caption"),
                      "Une légende doit expliquer la conséquence de l'activation.")
    }

    /// `test_mediaPanel_offersSoundExtractionOnlyWhenVideoPresent` rougit si
    /// `ComposerToolPanelHost.mediaPanel` cesse de gater
    /// `SoundExtractionToggle` derrière `hasVideoMedia` : une slide sans
    /// vidéo n'a pas de bande-son à extraire, offrir l'interrupteur
    /// collecterait un choix qui ne correspond à rien de publiable.
    func test_mediaPanel_offersSoundExtractionOnlyWhenVideoPresent() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var mediaPanel: some View {", in: code)
        )
        XCTAssertTrue(body.contains("if hasVideoMedia {"),
                      "SoundExtractionToggle doit être gaté à la présence d'une vidéo.")
        guard let ifRange = body.range(of: "if hasVideoMedia {") else {
            return XCTFail("garde hasVideoMedia introuvable")
        }
        let afterIf = body[ifRange.upperBound...]
        XCTAssertTrue(afterIf.contains("SoundExtractionToggle("),
                      "Le toggle doit être À L'INTÉRIEUR de la garde, pas seulement présent ailleurs.")
    }

    /// `test_mediaPanel_wiresSoundExtractionCommit` rougit si
    /// `ComposerToolPanelHost.mediaPanel` cesse de relayer le changement du
    /// toggle jusqu'au store de collecte.
    func test_mediaPanel_wiresSoundExtractionCommit() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var mediaPanel: some View {", in: code)
        )
        XCTAssertTrue(body.contains("accessibilityStore.setAllowsSoundExtraction("),
                      "Le commit du toggle doit atteindre le store de collecte.")
    }

    /// Espaces normalisés — cf. `MediaAltCollectionTests.collapsed` : une garde
    /// ancrée sur un littéral multi-lignes tombe au premier retour à la ligne.
    private func collapsed(_ code: String) -> String {
        code.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    // MARK: - Le défaut reste CONSERVATEUR (C-bis, correctif 5)

    /// `test_store_defaultIsNotPermissive` rougit si le repli du store devient
    /// `?? true` : l'auteur se verrait imposer, sur SON contenu, un choix qu'il
    /// n'a jamais fait. Le test de comportement voisin
    /// (`test_allowsSoundExtraction_defaultsToFalse`) prouve le résultat ; cette
    /// garde nomme le MÉCANISME, pour qu'un repli inversé ne puisse pas se
    /// glisser derrière une reformulation.
    func test_store_defaultIsNotPermissive() throws {
        let code = try ComposerSourceGuard.source("Controls/MediaAccessibilityStore.swift")
        let flat = collapsed(code)
        XCTAssertTrue(flat.contains("allowSoundExtractionOverride ?? false"),
                      "Le repli du store doit rester le refus.")
        XCTAssertFalse(flat.contains("allowSoundExtractionOverride ?? true"),
                       "Un repli permissif prendrait la décision à la place de l'auteur.")
    }

    /// `test_mediaPanel_readsToggleStateFromTheStore` rougit si `isOn:` du
    /// `SoundExtractionToggle` devient un littéral (`true` / `false`) au lieu de
    /// lire le store : l'interrupteur afficherait un état qui n'est pas celui
    /// qui sera publié.
    func test_mediaPanel_readsToggleStateFromTheStore() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private var mediaPanel: some View {", in: code)
        )
        let flat = collapsed(body)
        XCTAssertTrue(flat.contains("isOn: accessibilityStore.allowsSoundExtraction()"),
                      "L'état affiché doit venir du store, seul détenteur du défaut conservateur.")
        XCTAssertFalse(flat.contains("isOn: true"),
                       "Un état codé en dur trahirait le choix de l'auteur.")
    }

    // MARK: - La chaîne ATTEINT le point de publication (C-bis, correctif 3)

    /// `test_bottomBand_passesSoundExtractionCallbackDownToToolPanelHost`
    /// rougit si `ComposerBottomBand` cesse de passer
    /// `onAllowSoundExtractionChanged` au host : le host EXPOSE ce rappel
    /// depuis la vague 2, mais personne ne le lui passait — l'opt-in de
    /// l'auteur n'atteignait jamais le réseau.
    func test_bottomBand_passesSoundExtractionCallbackDownToToolPanelHost() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerBottomBand.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var body: some View", in: code)
        )
        XCTAssertTrue(
            collapsed(body).contains("onAllowSoundExtractionChanged: onAllowSoundExtractionChanged"),
            "Le band doit relayer l'opt-in jusqu'au host de panneau.")
    }

    /// `test_controlsLayer_relaysSoundExtractionCallbackToBottomBand` rougit si
    /// la couche de contrôles cesse de relayer l'opt-in au band.
    func test_controlsLayer_relaysSoundExtractionCallbackToBottomBand() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public var body: some View", in: code)
        )
        XCTAssertTrue(
            collapsed(body).contains("onAllowSoundExtractionChanged: onAllowSoundExtractionChanged"),
            "La couche de contrôles doit relayer l'opt-in au band.")
    }

    /// `test_controlsLayer_exposesSoundExtractionCallbackToItsParent` rougit si
    /// le point de sortie publique disparaît : le parent qui tient la
    /// publication n'aurait plus de canal pour apprendre le choix de l'auteur.
    func test_controlsLayer_exposesSoundExtractionCallbackToItsParent() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        XCTAssertTrue(
            collapsed(code).contains("onAllowSoundExtractionChanged: ((Bool) -> Void)? = nil"),
            "L'opt-in doit être un paramètre d'init, sinon le parent n'a aucun canal.")
        let initBody = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public init(", in: code)
        )
        XCTAssertTrue(
            collapsed(initBody).contains("self.onAllowSoundExtractionChanged = onAllowSoundExtractionChanged"),
            "L'init doit CONSERVER le rappel reçu — le déclarer sans l'assigner le laisse nil.")
    }

    /// `test_mediaAccessibilityPanel_hasNoPerMediaSoundToggle` rougit si un
    /// futur changement réintroduit `SoundExtractionToggle` DANS le panneau
    /// par-média — le flag n'a qu'un seul foyer légitime (`mediaPanel`),
    /// jamais un par row.
    func test_mediaAccessibilityPanel_hasNoPerMediaSoundToggle() throws {
        let code = try ComposerSourceGuard.source("Controls/MediaAccessibilityPanel.swift")
        XCTAssertFalse(code.contains("SoundExtractionToggle("),
                       "Le panneau par-média ne doit pas dupliquer l'interrupteur composer-wide.")
    }
}
