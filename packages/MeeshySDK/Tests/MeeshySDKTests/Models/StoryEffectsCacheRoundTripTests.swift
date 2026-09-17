import XCTest
@testable import MeeshySDK

/// **LE CACHE DU FIL MUTILE LA PREMIÈRE SCÈNE D'UN DOCUMENT V3 NATIF** (#6893).
///
/// `GRDBCacheStore<String, FeedPost>` (Codable) exécute, à chaque lecture du
/// fil, un aller-retour `StoryEffects` decode → encode → decode. Or
/// `StoryEffects.encode` repart TOUJOURS du runtime v1 courant pour la scène 0
/// (`CanvasV3(migrating:keeping:)`, doc-comment : « une composition neuve doit
/// émettre l'état RÉEL du canvas ») — et ce runtime, pour un fond `plane: bg`,
/// ne sait lire qu'une couleur (`payload.background`) et un transform
/// (`payload.transform`), jamais une RÉFÉRENCE média (`payload.mediaId` /
/// `payload.postMediaId`). Un tel fond disparaît donc entièrement dès le
/// premier aller-retour — mesuré au simulateur sur « RECETTE C — 3 scènes »
/// (staging, `X-Canvas-Caps: 3`) : la carte du fil affiche encore le texte
/// (elle n'a aucune garde), le plein écran ne le peut plus
/// (`SocialFullscreenRoute.scene(of:)` exige `coversEveryVisual`).
///
/// Les deux charges ci-dessous sont copiées TELLES QUELLES du fil (fixtures
/// `effects-C.json` et `effects-real.json` de l'audit du 2026-09-17).
final class StoryEffectsCacheRoundTripTests: XCTestCase {

    /// Post de recette : 3 scènes, chacune `{plane: bg, payload.mediaId}` + un
    /// texte. La forme que la PASSERELLE sert et qu'AUCUN composer iOS
    /// n'écrit (contrat des deux orthographes, #6894).
    private func chargeRecetteC() -> Data {
        Data("""
        {"v": 3, "scenes": [
          {"id": "s1", "objects": [
            {"id": "bg1", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972c3fd1f8a72d0e38e6"}},
            {"id": "t1", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr",
             "payload": {"text": "C1 pano", "textStyle": "classic", "textColor": "#FFFFFF",
                         "translations": {"ar": "(ب)", "de": "C1", "es": "C1 pan"}}}
          ]},
          {"id": "s2", "objects": [
            {"id": "bg2", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972d3fd1f8a72d0e38e7"}},
            {"id": "t2", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr",
             "payload": {"text": "C2 portrait", "textStyle": "classic", "textColor": "#FFFFFF",
                         "translations": {"ar": "C2 صورة", "de": "C2 Porträt", "es": "C2 retrato"}}}
          ]},
          {"id": "s3", "objects": [
            {"id": "bg3", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "payload": {"mediaId": "6aaa972d3fd1f8a72d0e38e8"}},
            {"id": "t3", "kind": "text", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
             "plane": "fg", "z": 1, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
             "locale": "fr",
             "payload": {"text": "C3 paysage", "textStyle": "classic", "textColor": "#FFFFFF",
                         "translations": {"ar": "C3 المناظر الطبيعية", "de": "C3 Landschaft", "es": "C3 paisaje"}}}
          ]}
        ]}
        """.utf8)
    }

    /// Post du composer iOS réel (staging, 2026-09-14/15) : UNE scène, un
    /// porteur `plane: bg` qui ne loge QUE son cadrage (`transform.videoFitMode`,
    /// aucune référence média), et le vrai fond en `plane: content` avec
    /// `isBackground` + `postMediaId`. Cette forme survit déjà à l'aller-retour
    /// aujourd'hui — ce témoin garde la non-régression.
    private func chargeComposerReel() -> Data {
        Data("""
        {"scenes": [{"id": "s1", "objects": [
          {"payload": {"transform": {"videoFitMode": "fit"}},
           "anchor": {"y": 0.5, "t": "free", "x": 0.5}, "z": 0, "plane": "bg",
           "transform": {"scale": 1, "rotation": 0, "opacity": 1}, "kind": "media", "id": "bg"},
          {"payload": {"mediaType": "image", "postMediaId": "6aa7da4c69eecc85c55d2081",
                       "loop": true,
                       "mediaURL": "2026/09/68f2a81417a557e8ce4ddfc1/0_fa7d023e-c48d-4751-a214-c16ef221708c.jpeg",
                       "aspectRatio": 1.50561797752809, "isBackground": true},
           "anchor": {"y": 0.5, "t": "free", "x": 0.5}, "locale": "fr", "z": 1, "plane": "content",
           "transform": {"scale": 1, "rotation": 0, "opacity": 1}, "kind": "media",
           "id": "F0177019-168F-406B-9D99-C5FA1DEDA2D0"}
        ]}], "v": 3}
        """.utf8)
    }

    /// La référence média d'un objet, quelle que soit son orthographe — un
    /// double de portée LOCALE au témoin (le site unique `mediaReference(of:)`
    /// arrive avec #6894 ; ce fichier ne le présuppose pas).
    private func reference(_ object: ObjectV3) -> String? {
        if case .string(let id)? = object.payload["mediaId"] { return id }
        if case .string(let id)? = object.payload["postMediaId"] { return id }
        return nil
    }

    private func roundTrip(_ effects: StoryEffects) throws -> StoryEffects {
        try JSONDecoder().decode(StoryEffects.self, from: JSONEncoder().encode(effects))
    }

    // MARK: - RECETTE C — le cas qui rougissait

    func test_lesTroisScenes_survivent_auPremierDecodage() throws {
        let effects = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        XCTAssertEqual(effects.canvasV3?.scenes.count, 3)
        for scene in effects.canvasV3?.scenes ?? [] {
            XCTAssertEqual(scene.objects.filter { $0.kind == .media }.count, 1,
                           "scène \(scene.id) : un fond média au premier décodage")
        }
    }

    /// **Le témoin qui rougissait avant le correctif.** Sur `dev` avant ce
    /// lot, la scène 0 perdait son fond à l'aller-retour : `objets média par
    /// scène [["bg"],["bg"],["bg"]] → [[],["bg"],["bg"]]`.
    func test_lAllerRetourParLeCacheDuFil_nePerdAucunFondDeScene() throws {
        let original = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        let regrave = try roundTrip(original)

        let scenesOriginal = original.canvasV3?.scenes ?? []
        let scenesRegravees = regrave.canvasV3?.scenes ?? []
        XCTAssertEqual(scenesRegravees.count, 3, "les trois scènes doivent survivre à l'aller-retour")

        for (index, scene) in scenesRegravees.enumerated() {
            let medias = scene.objects.filter { $0.kind == .media }
            XCTAssertEqual(medias.count, 1,
                           "scène \(index) : un fond média doit survivre au cache, pas \(medias.count)")
            let referenceOriginale = scenesOriginal[index].objects
                .first { $0.kind == .media }.flatMap(reference)
            XCTAssertEqual(medias.first.flatMap(reference), referenceOriginale,
                           "scène \(index) : la RÉFÉRENCE du média ne doit pas changer de valeur")
        }

        // Les textes, eux, n'ont jamais été perdus — c'est CE qui rendait le
        // défaut invisible à la carte du fil (elle n'a aucune garde).
        XCTAssertEqual(scenesRegravees.flatMap { $0.objects.filter { $0.kind == .text } }.count, 3)
    }

    /// La scène 0 (la seule migrée depuis le runtime) restitue son fond PAR
    /// IDENTITÉ : le même id, le même kind, le même plan — le document n'a
    /// jamais été touché par une édition, rien n'a de raison d'en changer la
    /// forme.
    ///
    /// **Mise à jour #6894** — depuis que `StoryEffects.init(rendering:)` fait
    /// entrer une référence `mediaId` dans `mediaObjects` (pour que le LECTEUR
    /// la peigne), le fond de la scène 0 est désormais COUVERT par la famille
    /// média de contenu ordinaire dès le premier décodage : il ne relève plus
    /// du merge par identité de ce fichier (`id` "bg1" apparaît dans
    /// `migratedIds`), et se réencode donc sous la forme `plane: content` +
    /// `postMediaId` — la forme que le composer écrit déjà. L'IDENTITÉ (id) et
    /// la RÉFÉRENCE (mediaId ⇔ postMediaId) sont ce que ce lot garantit ; la
    /// forme du wire, elle, converge vers l'orthographe unique de #6894.
    func test_laPremiereScene_restitueSonFondParIdentiteEtParReference() throws {
        let original = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        let regravee = try roundTrip(original)

        let fondOriginal = original.canvasV3?.scenes.first?.objects.first { $0.kind == .media }
        let fondRegrave = regravee.canvasV3?.scenes.first?.objects.first { $0.kind == .media }
        XCTAssertEqual(fondRegrave?.id, fondOriginal?.id, "la scène ne doit jamais changer l'IDENTITÉ de son fond")
        XCTAssertEqual(fondRegrave.flatMap(reference), fondOriginal.flatMap(reference),
                       "la RÉFÉRENCE média (mediaId ⇔ postMediaId) doit survivre, quelle que soit sa forme")
    }

    /// Un SECOND aller-retour (deux lectures successives du cache) ne doit
    /// rien perdre de plus — la restitution par identité n'est pas un
    /// billet à usage unique.
    func test_deuxAllerRetoursSuccessifs_nePerdentRienDePlus() throws {
        let original = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        let deuxiemePassage = try roundTrip(roundTrip(original))
        XCTAssertEqual(deuxiemePassage.canvasV3?.scenes.flatMap { $0.objects.filter { $0.kind == .media } }.count, 3)
    }

    // MARK: - Composer réel — la non-régression

    func test_documentDuComposerReel_survitIdentiqueAuCache() throws {
        let original = try JSONDecoder().decode(StoryEffects.self, from: chargeComposerReel())
        let regrave = try roundTrip(original)

        let scenesOriginal = original.canvasV3?.scenes ?? []
        let scenesRegravees = regrave.canvasV3?.scenes ?? []
        XCTAssertEqual(scenesRegravees.map(\.id), scenesOriginal.map(\.id))
        XCTAssertEqual(scenesRegravees.first?.objects.map(\.id).sorted(),
                       scenesOriginal.first?.objects.map(\.id).sorted(),
                       "un document déjà bien modélisé par le runtime v1 ne doit gagner ni perdre d'objet")
        XCTAssertEqual(scenesRegravees.flatMap { $0.objects.filter { $0.kind == .media } }.count, 2)
    }

    // MARK: - Suppression du fond — le merge ne doit jamais l'annuler (revue tour 1)

    /// **#6894 donne au fond référencé une affordance de retrait** (il entre
    /// dans `mediaObjects`, `deleteElement` peut donc le viser) — la prémisse
    /// du merge par identité (« cette forme n'a AUCUNE affordance de retrait »)
    /// est désormais fausse. Sans correctif, l'auteur supprime le fond, et
    /// l'autosave (`StoryDraftStore` → `StoryEffects.encode` →
    /// `CanvasV3(migrating:keeping:)`) le REGRAVE depuis le `canvasV3` mémorisé.
    func test_unFondExplicitementSupprime_neRessuscitePasAuReencodage() throws {
        var effects = try JSONDecoder().decode(StoryEffects.self, from: chargeRecetteC())
        effects.mediaObjects?.removeAll { $0.id == "bg1" }

        let regrave = try roundTrip(effects)

        let medias = regrave.canvasV3?.scenes.first?.objects.filter { $0.kind == .media } ?? []
        XCTAssertTrue(medias.isEmpty,
                       "un fond retiré par l'auteur (deleteElement) ne doit jamais être restitué par le merge")
    }

    // MARK: - Collision d'identifiant — le porteur couleur/transform et le média référencé (revue tour 1)

    /// Un objet `plane: bg` qui porte À LA FOIS un cadrage non identité
    /// (`transform.videoFitMode`) ET une référence média, sous l'id littéral
    /// `"bg"` — le nom que le SDK réserve à son porteur couleur/transform —
    /// ne doit jamais produire DEUX objets homonymes au réencodage : les
    /// cartes clés-par-id (`wireBandEdge`, `zIndexMap`, `deleteElement`, …) les
    /// confondraient.
    func test_fondReferenceEtCadre_sousIdBg_neDedoubleNiNeCollisionne() throws {
        let charge = Data("""
        {"v": 3, "scenes": [{"id": "s1", "objects": [
          {"id": "bg", "kind": "media", "anchor": {"t": "free", "x": 0.5, "y": 0.5},
           "plane": "bg", "z": 0, "transform": {"scale": 1, "rotation": 0, "opacity": 1},
           "payload": {"mediaId": "m-fond", "transform": {"videoFitMode": "fit"}}}
        ]}]}
        """.utf8)
        let effects = try JSONDecoder().decode(StoryEffects.self, from: charge)
        let regrave = try roundTrip(effects)

        let objets = regrave.canvasV3?.scenes.first?.objects ?? []
        let ids = objets.map(\.id)
        XCTAssertEqual(Set(ids).count, ids.count,
                       "aucun id ne doit se répéter dans une scène — \(ids)")
        XCTAssertEqual(objets.filter { $0.kind == .media }.count, 1,
                       "un seul fond en sortie pour un seul fond en entrée")
    }
}
