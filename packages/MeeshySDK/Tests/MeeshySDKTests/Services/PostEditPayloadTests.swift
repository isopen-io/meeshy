import XCTest
@testable import MeeshySDK

/// **On n'écrit que ce qu'on sait complet et qu'on a su rendre** — le miroir
/// Swift de `buildUpdatePayload` (`packages/shared/utils/composer-contract.ts`).
///
/// Le tri-état du fil était déjà tenu des deux côtés : `UpdatePostRequest`
/// omet ses optionnels `nil`, et le gateway lit l'absence comme « ne touche
/// pas ». Ce qui manquait n'était pas le tri-état — c'était la **déclaration
/// de ce qu'on sait**. Un composer qui n'a jamais PEINT les références
/// déclarées ne peut pas les réécrire : envoyer `[]` depuis là révoquerait
/// des mentions que l'auteur n'a jamais vues.
///
/// Deux niveaux, et la sanction est la même — la clé est OMISE :
/// 1. le champ n'est pas DÉCLARÉ connu (le composer ne l'a pas rendu) ;
/// 2. le champ est déclaré connu mais le brouillon ne porte RIEN (`nil`,
///    miroir exact de l'`undefined` TypeScript).
///
/// Tous les témoins lisent le JSON RÉELLEMENT ENCODÉ, jamais la struct : un
/// champ déclaré dans un type ne prouve pas ce qui part sur le fil.
final class PostEditPayloadTests: XCTestCase {

    private func encoded(_ request: UpdatePostRequest) throws -> [String: Any] {
        let data = try JSONEncoder().encode(request)
        return try XCTUnwrap(JSONSerialization.jsonObject(with: data) as? [String: Any])
    }

    // MARK: - Les trois pièges du tri-état, mot pour mot depuis les cas TS

    func test_build_whenFieldNotDeclaredKnown_omitsItEvenThoughDraftCarriesAValue() throws {
        let draft = PostEditDraft(content: "bonjour", visibility: "PUBLIC")

        let json = try encoded(PostEditPayload.build(known: [.content], draft: draft))

        XCTAssertEqual(json["content"] as? String, "bonjour")
        XCTAssertFalse(json.keys.contains("visibility"),
                       "le schéma lit l'absence comme « inchangé » — écrire ici écraserait un resserrement fait ailleurs")
    }

    func test_build_whenNothingDeclaredKnown_writesNothing() throws {
        let draft = PostEditDraft(content: "bonjour", visibility: "PUBLIC", mentions: [])

        let json = try encoded(PostEditPayload.build(known: [], draft: draft))

        XCTAssertTrue(json.isEmpty, "un composer qui ne déclare RIEN connu n'écrit rien")
    }

    func test_build_whenEmptyListDeclaredKnown_writesIt() throws {
        let draft = PostEditDraft(removeMediaIds: [], mentions: [])

        let json = try encoded(PostEditPayload.build(known: [.removeMediaIds, .mentions], draft: draft))

        XCTAssertEqual(json["removeMediaIds"] as? [String], [String]())
        XCTAssertEqual((json["mentions"] as? [Any])?.count, 0,
                       "le tri-état : [] déclaré connu RÉVOQUE, il ne vaut pas « inchangé »")
    }

    func test_build_whenRemovalDeclaredKnown_writesAnExplicitNull() throws {
        let draft = PostEditDraft(location: .remove)

        let json = try encoded(PostEditPayload.build(known: [.location], draft: draft))

        XCTAssertNotNil(json["location"] as? NSNull,
                        "un effacement explicite s'écrit `null`, jamais par omission")
    }

    func test_build_whenDeclaredKnownButDraftCarriesNothing_omitsIt() throws {
        let draft = PostEditDraft(content: "salut")

        let json = try encoded(PostEditPayload.build(known: [.content, .moodEmoji], draft: draft))

        XCTAssertEqual(json["content"] as? String, "salut")
        XCTAssertFalse(json.keys.contains("moodEmoji"),
                       "`nil` est le miroir de l'`undefined` TS : on n'écrit pas ce qu'on n'a pas")
    }

    // MARK: - Le cas qui a coûté : les références déclarées

    func test_build_whenComposerDidNotRenderDeclaredReferences_neverRevokesThem() throws {
        // Miroir exact d'`editingKnowsDeclaredReferences` : la charge d'une
        // liste porte des mentions AMPUTÉES par construction (le `select` du
        // fil écarte les silencieuses). Republier ce qu'on en a vu
        // révoquerait celles que l'auteur avait posées discrètement.
        let draft = PostEditDraft(content: "texte édité", mentions: [])

        let json = try encoded(PostEditPayload.build(known: [.content], draft: draft))

        XCTAssertFalse(json.keys.contains("mentions"),
                       "le serveur préserve les déclarées quand la clé est absente — c'est la seule lecture juste")
    }

    func test_build_whenComposerDidRenderDeclaredReferences_replacesTheWholeSet() throws {
        let draft = PostEditDraft(
            content: "texte édité",
            mentions: [PostMentionInput(username: "ada", display: "PINNED")]
        )

        let json = try encoded(PostEditPayload.build(known: [.content, .mentions], draft: draft))

        XCTAssertEqual((json["mentions"] as? [[String: Any]])?.first?["username"] as? String, "ada")
    }

    // MARK: - Non-régression des SIX chemins d'édition
    //
    // Chacun des six appelants de `postService.update` produit, à matière
    // identique, LE MÊME CORPS qu'avant ce lot. Le témoin compare l'ENCODAGE
    // JSON, pas les appels : la couverture des six chemins n'était pas
    // mesurée, donc l'existant ne peut pas servir de juge.

    private func assertSameBody(
        _ built: UpdatePostRequest,
        _ legacy: UpdatePostRequest,
        _ path: String,
        line: UInt = #line
    ) throws {
        let builtBody = try encoded(built) as NSDictionary
        let legacyBody = try encoded(legacy) as NSDictionary
        XCTAssertEqual(builtBody, legacyBody, "le corps de \(path) a changé", line: line)
    }

    /// Ce que la feuille d'édition de document PEINT — donc tout ce qu'elle
    /// peut déclarer connu. La déclaration elle-même vit app-side
    /// (`EditPostDraft.documentFields`) : quels champs un formulaire rend est
    /// une décision de produit, pas une loi du fil. Le témoin la recopie ici
    /// pour juger le CORPS, pas la feuille.
    private let documentFields: Set<PostEditField> = [
        .content, .visibility, .visibilityUserIds, .originalLanguage,
        .type, .removeMediaIds, .location
    ]

    /// Les QUATRE chemins de document (`FeedViewModel`, `ReelsViewModel`,
    /// `PostDetailViewModel`, `ProfileUserPostsList`) construisent aujourd'hui
    /// le même corps — même forme sur quatre états optimistes distincts.
    func test_build_documentEditPath_encodesExactlyAsBefore() throws {
        let place = SharedPlace(latitude: 48.85, longitude: 2.35, name: "Café")
        let built = PostEditPayload.build(
            known: documentFields,
            draft: PostEditDraft(
                content: "nouveau texte",
                visibility: "ONLY",
                visibilityUserIds: ["u1", "u2"],
                originalLanguage: "fr",
                type: "REEL",
                removeMediaIds: ["m1"],
                location: .set(place)
            )
        )
        let legacy = UpdatePostRequest(
            content: "nouveau texte", visibility: "ONLY", visibilityUserIds: ["u1", "u2"],
            moodEmoji: nil, originalLanguage: "fr", type: "REEL",
            removeMediaIds: ["m1"], storyEffects: nil, mediaIds: nil,
            location: .set(place), mentions: nil, allowSoundExtraction: nil, mediaAlt: nil
        )

        try assertSameBody(built, legacy, "les quatre chemins de document")
    }

    func test_build_documentEditPath_withNothingButText_encodesExactlyAsBefore() throws {
        let built = PostEditPayload.build(
            known: documentFields,
            draft: PostEditDraft(content: "juste du texte")
        )
        let legacy = UpdatePostRequest(
            content: "juste du texte", visibility: nil, visibilityUserIds: nil,
            moodEmoji: nil, originalLanguage: nil, type: nil,
            removeMediaIds: nil, storyEffects: nil, mediaIds: nil,
            location: nil, mentions: nil, allowSoundExtraction: nil, mediaAlt: nil
        )

        try assertSameBody(built, legacy, "un chemin de document sans autre matière")
    }

    /// `StoryViewModel.applyVisibility` — l'audience SEULE, par la surcharge
    /// courte historique (huit paramètres).
    func test_build_storyVisibilityPath_encodesExactlyAsBefore() throws {
        let built = PostEditPayload.build(
            known: PostEditField.all,
            draft: PostEditDraft(visibility: "EXCEPT", visibilityUserIds: ["u9"])
        )
        let legacy = UpdatePostRequest(
            content: nil, visibility: "EXCEPT", visibilityUserIds: ["u9"],
            moodEmoji: nil, originalLanguage: nil, type: nil,
            removeMediaIds: nil, storyEffects: nil, mediaIds: nil,
            location: nil, mentions: nil, allowSoundExtraction: nil, mediaAlt: nil
        )

        try assertSameBody(built, legacy, "l'audience seule d'une story")
    }

    /// `StoryViewModel.updateStory` — le SEUL site du dépôt qui appliquait
    /// déjà la loi 3, sur un champ (`declaredMentions`).
    func test_build_storyEditPath_encodesExactlyAsBefore() throws {
        let effects = StoryEffects(background: "#101010")
        let mentions = [PostMentionInput(username: "ada", display: "PINNED")]
        let built = PostEditPayload.build(
            known: PostEditField.all,
            draft: PostEditDraft(
                content: "slide",
                visibility: "PUBLIC",
                visibilityUserIds: [],
                originalLanguage: "fr",
                removeMediaIds: ["old1"],
                storyEffects: effects,
                mediaIds: ["new1"],
                mentions: mentions,
                allowSoundExtraction: true,
                mediaAlt: ["new1": "une affiche"]
            )
        )
        let legacy = UpdatePostRequest(
            content: "slide", visibility: "PUBLIC", visibilityUserIds: [],
            moodEmoji: nil, originalLanguage: "fr", type: nil,
            removeMediaIds: ["old1"], storyEffects: effects, mediaIds: ["new1"],
            location: nil, mentions: mentions, allowSoundExtraction: true,
            mediaAlt: ["new1": "une affiche"]
        )

        try assertSameBody(built, legacy, "l'édition d'une story")
    }

    /// La surcharge historique de `PostService` passe désormais PAR le
    /// constructeur unique : `known: .all` rend le champ tel quel, et le `nil`
    /// reste omis. C'est ce qui garantit qu'aucun des six chemins ne bouge.
    func test_build_whenEverythingDeclaredKnown_isTheIdentityOfTheDraft() throws {
        let draft = PostEditDraft(content: "x", location: .remove, mentions: [])

        let json = try encoded(PostEditPayload.build(known: PostEditField.all, draft: draft))

        XCTAssertEqual(json["content"] as? String, "x")
        XCTAssertEqual((json["mentions"] as? [Any])?.count, 0)
        XCTAssertNotNil(json["location"] as? NSNull)
        XCTAssertEqual(json.keys.count, 3, "tout le reste est `nil`, donc omis")
    }

    // MARK: - La garde qui attrape le champ SUIVANT, quel qu'il soit

    func test_everyDeclarableField_reachesTheEncodedBody() throws {
        let full = PostEditDraft(
            content: "c", visibility: "PUBLIC", visibilityUserIds: ["u"],
            moodEmoji: "🙂", originalLanguage: "fr", type: "POST",
            removeMediaIds: ["m"], storyEffects: StoryEffects(background: "#000"),
            mediaIds: ["n"], location: .remove,
            mentions: [PostMentionInput(username: "ada")],
            allowSoundExtraction: false, mediaAlt: ["n": "alt"],
            mediaCaption: ["n": "légende"]
        )

        let json = try encoded(PostEditPayload.build(known: PostEditField.all, draft: full))

        // Un champ ajouté au corps sans case de déclaration ne pourrait PLUS
        // JAMAIS être écrit — et rien ne rougirait. Ce témoin est le seul qui
        // le dise.
        XCTAssertEqual(Set(json.keys), Set(PostEditField.allCases.map(\.rawValue)))
    }

    func test_documentEditPath_neverDeclaresWhatTheSheetHasNeverPainted() throws {
        let neverPainted: Set<PostEditField> = [
            .moodEmoji, .storyEffects, .mediaIds, .mentions, .allowSoundExtraction,
            .mediaAlt, .mediaCaption
        ]
        // Le brouillon PORTE de la matière sur les six champs ; seule la
        // déclaration l'empêche de partir.
        let draft = PostEditDraft(
            content: "c", moodEmoji: "🙂", storyEffects: StoryEffects(background: "#000"),
            mediaIds: ["n"], mentions: [], allowSoundExtraction: true, mediaAlt: ["n": "alt"],
            mediaCaption: ["n": "légende"]
        )

        let json = try encoded(PostEditPayload.build(known: documentFields, draft: draft))

        XCTAssertEqual(json.keys.count, 1, "seul le contenu a été rendu par la feuille")
        for field in neverPainted {
            XCTAssertFalse(json.keys.contains(field.rawValue),
                           "\(field.rawValue) n'a jamais été peint par la feuille d'édition de post")
        }
    }
}
