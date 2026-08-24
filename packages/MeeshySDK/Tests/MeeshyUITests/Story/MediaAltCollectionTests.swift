import XCTest
import MeeshySDK
@testable import MeeshyUI

/// C7-UI — collecte du texte alternatif par média.
///
/// `mediaAlt: [String: String]?` traverse déjà le transport (gateway
/// `CreatePostSchema.mediaAlt`, `PostService.create/update(… mediaAlt:)`)
/// mais rien ne le COLLECTAIT côté UI avant `MediaAccessibilityStore` +
/// `MediaAltTextField` + le panneau qu'ils alimentent dans
/// `ComposerToolPanelHost.mediaItemRow`.
@MainActor
final class MediaAltCollectionTests: XCTestCase {

    // MARK: - MediaAccessibilityStore — moitié alt

    func test_alt_defaultsToEmptyString_forUntouchedMedia() {
        let store = MediaAccessibilityStore()
        XCTAssertEqual(store.alt(for: "media-1"), "")
    }

    /// `test_setAlt_roundTrips` rougit si `setAlt(_:for:)` cesse d'écrire
    /// dans `altText` (ex : un refactor qui oublierait l'affectation).
    func test_setAlt_roundTrips() {
        let store = MediaAccessibilityStore()
        store.setAlt("Coucher de soleil sur la plage", for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "Coucher de soleil sur la plage")
    }

    /// `test_setAlt_emptyString_clearsEntry_ratherThanStoringEmptyString`
    /// rougit si `setAlt("", for:)` stocke `""` au lieu de retirer l'entrée —
    /// un média jamais touché et un média dont le texte a été effacé
    /// doivent produire le MÊME payload (absent), pas une chaîne vide qui
    /// écraserait un texte serveur existant au prochain update.
    func test_setAlt_emptyString_clearsEntry_ratherThanStoringEmptyString() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un texte", for: "media-1")
        store.setAlt("", for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "")
        XCTAssertNil(store.mediaAltPayload())
    }

    /// `test_setAlt_clampsToMaxLength` rougit si le clamp
    /// (`String(text.prefix(Self.maxAltLength))`) est retiré : un texte plus
    /// long que ce que le gateway accepte (`z.string().max(1000)`,
    /// `services/gateway/src/routes/posts/types.ts:249`) doit être tronqué
    /// AVANT d'atteindre le transport, pas rejeté silencieusement là-bas.
    func test_setAlt_clampsToMaxLength() {
        let store = MediaAccessibilityStore()
        let tooLong = String(repeating: "a", count: MediaAccessibilityStore.maxAltLength + 50)
        store.setAlt(tooLong, for: "media-1")
        XCTAssertEqual(store.alt(for: "media-1").count, MediaAccessibilityStore.maxAltLength)
    }

    /// `test_mediaAltPayload_isNilWhenNoEntriesSet` rougit si
    /// `mediaAltPayload()` renvoie un dictionnaire vide au lieu de `nil` :
    /// un payload vide et une absence de payload sont deux signaux
    /// différents pour `PostService.create(… mediaAlt:)`.
    func test_mediaAltPayload_isNilWhenNoEntriesSet() {
        let store = MediaAccessibilityStore()
        XCTAssertNil(store.mediaAltPayload())
    }

    /// `test_mediaAltPayload_includesOnlyTouchedMedia` rougit si le payload
    /// inclut un média qui n'a jamais été touché.
    func test_mediaAltPayload_includesOnlyTouchedMedia() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un chat", for: "media-1")
        let payload = store.mediaAltPayload()
        XCTAssertEqual(payload, ["media-1": "Un chat"])
    }

    /// `test_remove_clearsAlt` rougit si `remove(mediaId:)` cesse de vider
    /// `altText` pour cet id — un média supprimé de la slide ne doit pas
    /// laisser un id orphelin fuiter dans un futur payload.
    func test_remove_clearsAlt() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un texte", for: "media-1")
        store.remove(mediaId: "media-1")
        XCTAssertEqual(store.alt(for: "media-1"), "")
        XCTAssertNil(store.mediaAltPayload())
    }

    // MARK: - Gardes de source — le champ EST accessible, pas seulement persisté

    /// `test_altField_exposesAccessibilityLabelAndHint` rougit si
    /// `.accessibilityLabel`/`.accessibilityHint` disparaissent de
    /// `MediaAltTextField` : un champ qui COLLECTE du texte pour VoiceOver
    /// sans être lui-même navigable à VoiceOver serait une contradiction —
    /// la consigne du lot le nomme explicitement.
    func test_altField_exposesAccessibilityLabelAndHint() throws {
        let code = try ComposerSourceGuard.source("Controls/MediaAltTextField.swift")
        XCTAssertTrue(code.contains(".accessibilityLabel("),
                      "Le champ alt doit porter un accessibilityLabel explicite.")
        XCTAssertTrue(code.contains(".accessibilityHint("),
                      "Le champ alt doit expliquer à VoiceOver ce que la saisie produit.")
    }

    /// `test_mediaItemRow_wiresAccessibilityPanel` rougit si
    /// `ComposerToolPanelHost.mediaItemRow` cesse de monter
    /// `MediaAccessibilityPanel` — la surface de collecte redeviendrait
    /// injoignable depuis l'inspecteur média existant, sans qu'aucun test de
    /// compilation ne le signale (le panneau resterait un composant écrit
    /// mais jamais monté, exactement le motif "code juste, invisible" déjà
    /// mesuré sur ce chantier).
    func test_mediaItemRow_wiresAccessibilityPanel() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private func mediaItemRow(", in: code)
        )
        XCTAssertTrue(body.contains("MediaAccessibilityPanel("),
                      "La row média doit pouvoir déplier le panneau accessibilité.")
        XCTAssertTrue(body.contains("accessibilityStore.setAlt("),
                      "Le commit du champ alt doit atteindre le store de collecte.")
    }

    // MARK: - La chaîne ATTEINT le point de publication (C-bis)

    /// Espaces normalisés : une garde ancrée sur un littéral multi-lignes est
    /// contournée par un simple retour à la ligne (constat de la revue
    /// adversariale — quatre gardes de la vague 2 tombaient ainsi). Comparer
    /// sur la forme aplatie rend l'assertion insensible au formatage tout en
    /// restant une assertion sur du CODE, pas sur un fichier.
    private func collapsed(_ code: String) -> String {
        code.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
    }

    /// `test_bottomBand_passesAltCommitCallbackDownToToolPanelHost` rougit si
    /// `ComposerBottomBand` cesse de passer `onMediaAltCommitted` à
    /// `ComposerToolPanelHost` : le host EXPOSE ce rappel depuis la vague 2,
    /// mais personne ne le lui passait — l'auteur pouvait saisir un texte
    /// alternatif qui n'atteignait jamais le réseau, sans aucune erreur.
    func test_bottomBand_passesAltCommitCallbackDownToToolPanelHost() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerBottomBand.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var body: some View", in: code)
        )
        XCTAssertTrue(collapsed(body).contains("onMediaAltCommitted: onMediaAltCommitted"),
                      "Le band doit relayer le rappel de commit alt jusqu'au host de panneau.")
    }

    /// `test_controlsLayer_relaysAltCommitCallbackToBottomBand` rougit si
    /// `ComposerControlsLayer` cesse de relayer `onMediaAltCommitted` au band :
    /// la chaîne se rompt un cran plus haut et la saisie meurt au même endroit,
    /// avec la même absence de signal.
    func test_controlsLayer_relaysAltCommitCallbackToBottomBand() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public var body: some View", in: code)
        )
        XCTAssertTrue(collapsed(body).contains("onMediaAltCommitted: onMediaAltCommitted"),
                      "La couche de contrôles doit relayer le commit alt au band.")
    }

    /// `test_controlsLayer_exposesAltCommitCallbackToItsParent` rougit si le
    /// point de SORTIE publique disparaît : le parent qui tient la publication
    /// (`StoryComposerView`) n'aurait plus aucun canal pour apprendre ce que
    /// l'auteur a saisi, et la chaîne s'arrêterait juste avant sa dernière
    /// marche.
    func test_controlsLayer_exposesAltCommitCallbackToItsParent() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        let flat = collapsed(code)
        XCTAssertTrue(flat.contains("public init("),
                      "La couche expose un init public — c'est lui la surface du parent.")
        let initBody = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public init(", in: code)
        )
        XCTAssertTrue(collapsed(initBody).contains("self.onMediaAltCommitted = onMediaAltCommitted"),
                      "L'init doit CONSERVER le rappel reçu — le déclarer sans l'assigner le laisse nil.")
        XCTAssertTrue(flat.contains("onMediaAltCommitted: ((String, String) -> Void)? = nil"),
                      "Le rappel doit être un paramètre d'init, sinon le parent n'a aucun canal.")
        XCTAssertTrue(flat.contains("accessibilityStore: MediaAccessibilityStore? = nil"),
                      "Le parent doit pouvoir INJECTER le store pour en lire la charge au moment de publier.")
    }

    // MARK: - Le store SURVIT au démontage du panneau (C-bis, correctif 4)

    /// `test_toolPanelHost_doesNotOwnTheAccessibilityStore` rougit si
    /// `ComposerToolPanelHost` recrée un `MediaAccessibilityStore` au lieu de
    /// le recevoir.
    ///
    /// Le host est démonté par `ComposerBottomBand` à CHAQUE bascule vers
    /// `.hidden` ou `.formatPanel` (branches distinctes de son `switch`), donc
    /// un `@StateObject` local mourait avec lui : fermer puis rouvrir le
    /// panneau Média perdait le texte alternatif déjà saisi. C'est une perte de
    /// saisie utilisateur, invisible à la compilation comme aux tests de
    /// modèle.
    func test_toolPanelHost_doesNotOwnTheAccessibilityStore() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MediaAccessibilityStore(", in: code), 0,
                       "Le host ne doit JAMAIS construire le store : il meurt à chaque fermeture de panneau.")
        XCTAssertTrue(collapsed(code).contains("@ObservedObject var accessibilityStore: MediaAccessibilityStore"),
                      "Le store doit être INJECTÉ dans le host, pas possédé par lui.")
    }

    /// `test_bottomBand_forwardsTheInjectedStore` rougit si le band construit
    /// son propre store au lieu de traverser celui qu'il reçoit — il est
    /// lui-même démonté dès que la band se replie (`if !chrome.isBandHidden`),
    /// donc le posséder rejouerait la même perte un cran plus haut.
    func test_bottomBand_forwardsTheInjectedStore() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerBottomBand.swift")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MediaAccessibilityStore(", in: code), 0,
                       "Le band ne doit pas construire de store — il est démonté avec la band.")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var body: some View", in: code)
        )
        XCTAssertTrue(collapsed(body).contains("accessibilityStore: accessibilityStore"),
                      "Le band doit passer le store reçu au host de panneau.")
    }

    /// `test_controlsLayer_ownsTheStoreOutsideItsBody` rougit dans les DEUX
    /// sens :
    ///  - si plus personne ne construit le store (compte ≠ 1), la collecte
    ///    n'existe plus ;
    ///  - si la construction migre DANS `body`, le store est recréé à chaque
    ///    passe de rendu — la saisie serait perdue non plus à la fermeture du
    ///    panneau, mais à la frappe suivante.
    ///
    /// `ComposerControlsLayer` est le niveau le plus bas qui survive à la
    /// fermeture du band comme au changement d'outil.
    func test_controlsLayer_ownsTheStoreOutsideItsBody() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerControlsLayer.swift")
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MediaAccessibilityStore(", in: code), 1,
                       "Exactement une construction du store dans toute la couche.")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "public var body: some View", in: code)
        )
        XCTAssertEqual(ComposerSourceGuard.occurrences(of: "MediaAccessibilityStore(", in: body), 0,
                       "La construction doit être une PROPRIÉTÉ, jamais une expression de body.")
        XCTAssertTrue(collapsed(code).contains("@StateObject private var ownedAccessibilityStore = MediaAccessibilityStore()"),
                      "La possession doit passer par @StateObject — @ObservedObject ou un let seraient recréés.")
    }

    // MARK: - V3-4 — le texte saisi PART (transport, pas seulement collecte)

    /// `test_accessibilityHandoff_carriesTheTypedAltText` rougit si la charge
    /// remise à la publication cesse de porter ce que l'auteur a écrit.
    ///
    /// C'est la première assertion COMPORTEMENTALE du transport : jusqu'ici
    /// toute la chaîne au-dessus du store n'était gardée que par lecture de
    /// source, et `mediaAltPayload()` n'avait aucun appelant de production —
    /// le texte se saisissait, se conservait, et ne partait jamais.
    func test_accessibilityHandoff_carriesTheTypedAltText() {
        let store = MediaAccessibilityStore()
        store.setAlt("Un chat roux sur un muret", for: "media-1")

        let handoff = StoryComposerView.accessibilityHandoff(from: store)

        XCTAssertEqual(handoff.mediaAlt, ["media-1": "Un chat roux sur un muret"])
    }

    /// `test_accessibilityHandoff_saysNothingWhenNothingWasTyped` rougit si la
    /// charge se met à porter un dictionnaire vide : « aucun texte » et « tous
    /// les textes sont vides » sont deux signaux différents pour le gateway,
    /// et le second écraserait au prochain update des textes déjà en base.
    func test_accessibilityHandoff_saysNothingWhenNothingWasTyped() {
        let handoff = StoryComposerView.accessibilityHandoff(from: MediaAccessibilityStore())

        XCTAssertNil(handoff.mediaAlt)
        XCTAssertNil(handoff.allowSoundExtraction)
        XCTAssertEqual(handoff, .empty)
    }

    /// `test_createStoryRequest_encodesMediaAlt` rougit si le champ disparaît
    /// du corps de `POST /posts` : le gateway l'accepte depuis
    /// `CreatePostSchema.mediaAlt`, mais une story ne le lui envoyait jamais —
    /// `CreateStoryRequest` ne portait pas le champ du tout.
    func test_createStoryRequest_encodesMediaAlt() throws {
        let body = CreateStoryRequest(mediaAlt: ["post-media-7": "Une plage au couchant"])

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertEqual(json["mediaAlt"] as? [String: String],
                       ["post-media-7": "Une plage au couchant"])
    }

    /// `test_createStoryRequest_omitsMediaAltWhenAbsent` rougit si le champ
    /// part à `null` faute de saisie : `UpdatePostSchema` lit l'ABSENCE comme
    /// « n'y touche pas », et un `null` explicite est une autre phrase.
    func test_createStoryRequest_omitsMediaAltWhenAbsent() throws {
        let body = CreateStoryRequest(content: "coucou")

        let json = try XCTUnwrap(
            JSONSerialization.jsonObject(with: try JSONEncoder().encode(body)) as? [String: Any]
        )

        XCTAssertNil(json["mediaAlt"])
    }

    // MARK: - Les clés envoyées sont celles que le SERVEUR connaît

    /// `test_serverKeyedAlt_translatesComposerIdsIntoPostMediaIds` rougit si la
    /// traduction saute : le panneau collecte sous l'id d'élément du COMPOSER
    /// (les médias ne sont uploadés qu'après le hand-off) alors que
    /// `PostService.applyMediaAlt` FILTRE les clés absentes de `mediaIds`.
    /// Envoyer les ids locaux serait un no-op parfaitement silencieux —
    /// requête acceptée, aucun texte enregistré.
    func test_serverKeyedAlt_translatesComposerIdsIntoPostMediaIds() {
        let uploaded = StoryMediaObject(id: "local-1", postMediaId: "post-media-7", aspectRatio: 1)

        let keyed = StoryMediaAltMapping.serverKeyed(
            composerKeyed: ["local-1": "Une plage au couchant"],
            mediaObjects: [uploaded]
        )

        XCTAssertEqual(keyed, ["post-media-7": "Une plage au couchant"])
    }

    /// `test_serverKeyedAlt_dropsMediaThatNeverReachedTheServer` rougit si un
    /// média dont l'upload n'a pas abouti (`postMediaId` vide, cas déjà
    /// journalisé par le publish) fait naître une clé vide dans le payload.
    func test_serverKeyedAlt_dropsMediaThatNeverReachedTheServer() {
        let neverUploaded = StoryMediaObject(id: "local-1", aspectRatio: 1)

        let keyed = StoryMediaAltMapping.serverKeyed(
            composerKeyed: ["local-1": "Une plage au couchant"],
            mediaObjects: [neverUploaded]
        )

        XCTAssertTrue(keyed.isEmpty)
    }

    // MARK: - Gardes POSITIVES : la charge a un appelant, et il publie

    /// `test_mediaAltPayload_hasAtLeastOneProductionCaller` rougit si le
    /// snapshot redevient orphelin.
    ///
    /// Formulée en POSITIF (« au moins un appelant ») et non en négatif : une
    /// garde qui vérifierait l'ABSENCE d'un motif interdit resterait verte le
    /// jour où le motif change de nom, et c'est exactement l'état mesuré avant
    /// ce lot — `mediaAltPayload()` compilait, était testé, et n'était appelé
    /// par personne.
    func test_mediaAltPayload_hasAtLeastOneProductionCaller() throws {
        let callers = try ComposerSourceGuard.allStorySources()
            .filter { $0.path != "Controls/MediaAccessibilityStore.swift" }
            .filter { $0.code.contains("mediaAltPayload()") }
            .map { $0.path }

        XCTAssertFalse(
            callers.isEmpty,
            """
            `mediaAltPayload()` n'a AUCUN appelant hors de sa propre déclaration : \
            le texte alternatif se saisit, se conserve, et ne part nulle part.
            """
        )
    }

    /// `test_publishAllSlides_handsTheAccessibilityPayloadToTheHost` rougit si
    /// la charge cesse d'être CALCULÉE dans le corps qui publie, ou si elle
    /// l'est après le hand-off (donc trop tard pour partir avec).
    func test_publishAllSlides_handsTheAccessibilityPayloadToTheHost() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func publishAllSlides()", in: code)
        )
        let flat = collapsed(body)

        XCTAssertTrue(flat.contains("Self.accessibilityHandoff(from: accessibilityStore)"),
                      "La publication doit LIRE le store de collecte du composer.")
        let handoff = try XCTUnwrap(flat.range(of: "onPublishAllInBackground("))
        let payload = try XCTUnwrap(flat.range(of: "Self.accessibilityHandoff(from: accessibilityStore)"))
        XCTAssertTrue(handoff.lowerBound < payload.lowerBound,
                      "La charge doit être un ARGUMENT du hand-off, pas un calcul posé à côté.")
    }

    /// `test_composerOwnsTheAccessibilityStoreForTheWholeSession` rougit si le
    /// composer cesse de POSSÉDER le store qu'il injecte : la couche de
    /// contrôles retomberait sur le sien, et le point de publication lirait un
    /// store vide — la saisie repartirait à zéro sans le moindre signal.
    func test_composerOwnsTheAccessibilityStoreForTheWholeSession() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertTrue(
            collapsed(code).contains("@StateObject var accessibilityStore = MediaAccessibilityStore()"),
            "Le composer doit posséder le store — un @ObservedObject serait recréé à chaque rendu."
        )
    }

    /// `test_canvas_injectsTheComposerStoreIntoTheControlsLayer` rougit si
    /// l'appelant cesse de passer le store : `ComposerControlsLayer` retombe
    /// alors SILENCIEUSEMENT sur son store interne (`ownedAccessibilityStore`),
    /// la saisie reste possible, et la publication lit un autre objet — le
    /// défaut exact que ce lot répare.
    func test_canvas_injectsTheComposerStoreIntoTheControlsLayer() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Canvas.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var bottomRegion: some View", in: code)
        )

        XCTAssertTrue(collapsed(body).contains("accessibilityStore: accessibilityStore"),
                      "La région basse doit injecter le store du composer dans la couche de contrôles.")
    }

    /// `test_deletingMedia_clearsItsAccessibilityEntry` rougit si le bouton
    /// Supprimer de la row cesse d'appeler `accessibilityStore.remove` avant
    /// `viewModel.deleteElement` — un média supprimé puis un NOUVEAU média
    /// réutilisant un id recyclé hériterait sinon d'un texte alt fantôme.
    func test_deletingMedia_clearsItsAccessibilityEntry() throws {
        let code = try ComposerSourceGuard.source("Controls/ComposerToolPanelHost.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "private func mediaItemRow(", in: code)
        )
        XCTAssertTrue(body.contains("accessibilityStore.remove(mediaId: media.id)"))
    }
}
