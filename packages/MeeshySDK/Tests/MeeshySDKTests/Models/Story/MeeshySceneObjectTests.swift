import XCTest
@testable import MeeshySDK

/// **La planche parle d'« un objet » ; le code n'en avait pas** (#4591).
///
/// `MeeshySceneObject` — renommé `MeeshySceneObject` sur arbitrage du porteur —
/// apparaît 78 fois dans `docs/product/planche-meeshy-composer.html`. Le modèle
/// n'avait ni protocole ni type somme : cinq tableaux séparés, et toute question
/// posée à « l'objet d'id X » réécrite en cascade sur les cinq. Mesuré avant ce
/// lot : **plus de 150 répétitions**, dont 32 dans un seul fichier de timeline.
///
/// Ces témoins éprouvent la SOMME, pas le rendu : le type est une vue construite
/// à la demande sur les cinq tableaux, jamais une donnée persistée.
final class MeeshySceneObjectTests: XCTestCase {

    private func texte(_ id: String, z: Int = 0, x: Double = 0.5) -> StoryTextObject {
        var t = StoryTextObject(text: "Dernier soir", x: x, y: 0.5)
        t.id = id
        t.zIndex = z
        return t
    }

    private func media(_ id: String, z: Int = 0, fond: Bool = false) -> StoryMediaObject {
        StoryMediaObject(id: id, postMediaId: "pm", kind: .image,
                         aspectRatio: 16.0 / 9.0, isBackground: fond, zIndex: z)
    }

    private func effets(textes: [StoryTextObject] = [],
                        medias: [StoryMediaObject] = [],
                        stickers: [StorySticker] = [],
                        lieux: [StoryLocationObject] = [],
                        audios: [StoryAudioPlayerObject] = []) -> StoryEffects {
        var e = StoryEffects()
        e.textObjects = textes
        e.mediaObjects = medias.isEmpty ? nil : medias
        e.stickerObjects = stickers.isEmpty ? nil : stickers
        e.locationObjects = lieux
        e.audioPlayerObjects = audios.isEmpty ? nil : audios
        return e
    }

    // MARK: - La cascade fermée

    /// **La question que 150 sites réécrivaient.** Un id, un objet — quelle que
    /// soit la famille qui le porte.
    func test_unId_trouveSonObjet_dansNImporteLaquelleDesCinqFamilles() {
        let e = effets(textes: [texte("t1")],
                       medias: [media("m1")],
                       stickers: [StorySticker(emoji: "🎬", x: 0.5, y: 0.5)],
                       lieux: [StoryLocationObject(place: .init(latitude: 64.14, longitude: -21.94,
                                                             name: "Reykjavík"),
                                                   x: 0.5, y: 0.8)],
                       audios: [StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                                       x: 0.5, y: 0.5, volume: 1,
                                                       waveformSamples: [])])
        XCTAssertEqual(e.sceneObject(id: "t1")?.kind, .text)
        XCTAssertEqual(e.sceneObject(id: "m1")?.kind, .media)
        XCTAssertEqual(e.sceneObjects.count, 5, "les cinq familles, à plat")
    }

    /// `nil` ⇒ l'id ne désigne plus rien — un objet supprimé pendant qu'une
    /// sélection le tenait. État NOMINAL, jamais une erreur.
    func test_unIdInconnu_neRendRien() {
        XCTAssertNil(effets(textes: [texte("t1")]).sceneObject(id: "fantome"))
        XCTAssertNil(StoryEffects().sceneObject(id: "t1"))
        XCTAssertTrue(StoryEffects().sceneObjects.isEmpty)
    }

    // MARK: - L'ordre est celui du RENDU

    /// **Du fond vers l'avant.** C'est l'ordre que le rendu applique, et le seul
    /// qui ait un sens produit — une itération dans l'ordre des familles
    /// dessinerait un texte de `z 0` par-dessus un média de `z 5`.
    func test_lesObjets_sontRangesDuFondVersLAvant() {
        let e = effets(textes: [texte("haut", z: 5)], medias: [media("bas", z: 1)])
        XCTAssertEqual(e.sceneObjects.map(\.id), ["bas", "haut"])
    }

    /// **À `zIndex` égal, l'ordre est STABLE.** Arbitraire mais reproductible :
    /// une itération qui changerait d'ordre entre deux appels ferait clignoter
    /// tout ce qui la consomme.
    func test_aRangEgal_lOrdreNeVariePasDunAppelALAutre() {
        let e = effets(textes: [texte("t1"), texte("t2")], medias: [media("m1")])
        let premier = e.sceneObjects.map(\.id)
        XCTAssertEqual(premier, e.sceneObjects.map(\.id))
        XCTAssertEqual(premier, e.sceneObjects.map(\.id), "trois lectures, un seul ordre")
    }

    // MARK: - La géométrie, et son asymétrie ASSUMÉE

    func test_laGeometrieCommune_seLitSansSavoirLaFamille() {
        let e = effets(textes: [texte("t1", x: 0.25)])
        let o = e.sceneObject(id: "t1")
        XCTAssertEqual(o?.x, 0.25)
        XCTAssertEqual(o?.y, 0.5)
        XCTAssertEqual(o?.scale, 1)
        XCTAssertEqual(o?.rotation, 0)
    }

    /// **TOUT objet de scène se redimensionne et tourne** — l'audio compris.
    ///
    /// > « Dans la V3, tout `MeeshySceneObject` a ces détails. Tout objet sur la
    /// > scène peut scale et roter. » (porteur, 2026-08-31)
    ///
    /// La première version de ce témoin affirmait le contraire et le
    /// JUSTIFIAIT : « l'audio n'a jamais eu de forme sur la scène ». C'était
    /// faux, et le contrat le disait — `canvas-v3.ts` déclare
    /// `transform: { scale, rotation, opacity }` en champ REQUIS de tout
    /// `ObjectV3`, et le convertisseur du gateway fabriquait `num(o.scale, 1)`
    /// pour l'audio parce que le modèle Swift ne le portait pas.
    ///
    /// > **Documenter un trou comme une intention le rend permanent.** Le
    /// > commentaire était sincère et bien placé ; il aurait fait porter à
    /// > l'audio son absence de forme pendant encore un cycle.
    func test_toutObjet_seRedimensionneEtTourne_lAudioCompris() {
        let e = effets(audios: [StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                                       x: 0.5, y: 0.5, volume: 1,
                                                       waveformSamples: [])])
        let o = e.sceneObjects.first
        XCTAssertEqual(o?.kind, .audio)
        XCTAssertEqual(o?.scale, 1, "les défauts sont ceux du convertisseur V3")
        XCTAssertEqual(o?.rotation, 0)
        XCTAssertEqual(o?.x, 0.5)
    }

    /// **Une forme POSÉE est rendue telle quelle** — le fusible du témoin
    /// ci-dessus, qui resterait vert si la somme renvoyait toujours 1 et 0.
    func test_uneFormePosee_surUnAudio_estRendue() {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.scale = 2.4
        son.rotation = -15
        let o = effets(audios: [son]).sceneObjects.first
        XCTAssertEqual(o?.scale, 2.4)
        XCTAssertEqual(o?.rotation, -15)
    }

    /// **Le fil ne change pas.** `scale` et `rotation` sont OPTIONNELS sur
    /// `StoryAudioPlayerObject` : le décodeur synthétisé de Swift n'utilise pas
    /// les valeurs par défaut d'une propriété, donc les déclarer non-optionnels
    /// les aurait rendus OBLIGATOIRES dans le JSON — et toute publication
    /// existante aurait cessé de se décoder. C'est pour cette raison que les
    /// quatre autres familles ont un `decodeIfPresent(...) ?? 0` écrit à la main.
    func test_unPayloadSansForme_seDecodeEtRendLaMemeScene() throws {
        let brut = "{\"id\":\"a1\",\"postMediaId\":\"pm\",\"placement\":\"overlay\"," +
                   "\"x\":0.5,\"y\":0.8,\"volume\":1,\"waveformSamples\":[]}"
        let son = try JSONDecoder().decode(StoryAudioPlayerObject.self,
                                           from: Data(brut.utf8))
        XCTAssertNil(son.scale, "absent du fil")
        XCTAssertEqual(effets(audios: [son]).sceneObjects.first?.scale, 1,
                       "…et résolu à 1 sur la scène, comme le convertisseur V3")
    }

    /// **Le plan de fond n'appartient qu'à deux familles.** Un texte, un sticker
    /// et un lieu sont toujours de premier plan — ce n'est pas un défaut, le
    /// modèle ne leur donne pas le champ.
    func test_seulsUnMediaEtUnAudio_peuventEtreDeFond() {
        let e = effets(textes: [texte("t1")], medias: [media("bg", fond: true)])
        XCTAssertTrue(e.sceneObject(id: "bg")?.isBackground == true)
        XCTAssertFalse(e.sceneObject(id: "t1")?.isBackground == true)
    }

    /// **Le fusible du kind.** Cinq familles, cinq kinds — si la somme en
    /// oubliait une, tous les témoins ci-dessus resteraient verts sur les
    /// quatre autres.
    ///
    /// `place` et non `location` depuis #4960 : quatre couches employaient déjà
    /// ce mot — le contrat du fil, son miroir Swift, la timeline et l'inspecteur
    /// — et cet énuméré était le seul à en dire un autre.
    /// `SceneObjectFamilyVocabularyTests` garde désormais l'alignement, ce qui
    /// vaut plus que le renommage : ce témoin-ci épingle un JEU, celui-là
    /// interdit la prochaine divergence.
    func test_lesCinqFamilles_ontChacune_sonKind() {
        XCTAssertEqual(MeeshySceneObject.Kind.allCases.count, 5)
        XCTAssertEqual(Set(MeeshySceneObject.Kind.allCases.map(\.rawValue)),
                       ["text", "media", "sticker", "place", "audio"])
    }

    /// La slide n'est qu'une projection de ses effets : elle ne porte pas ses
    /// objets, elle porte les effets qui les portent.
    func test_laSlide_projetteSesEffets() {
        var slide = StorySlide(id: "s1")
        slide.effects = effets(textes: [texte("t1")])
        XCTAssertEqual(slide.sceneObjects.map(\.id), ["t1"])
        XCTAssertEqual(slide.sceneObject(id: "t1")?.kind, .text)
    }

    // MARK: - La DURÉE, et l'absence qui est une propriété

    /// **Un LIEU n'a pas de temps propre**, et cette absence est RÉELLE.
    ///
    /// **Un lieu porte SA fenêtre comme les quatre autres** — directive porteur
    /// 2026-08-31 : « tout `MeeshySceneObject` peut apparaître et disparaître
    /// quand il souhaite, y compris la pastille de lieu ».
    ///
    /// > La version précédente de ce témoin affirmait l'inverse — `XCTAssertNil`
    /// > sur la durée d'un lieu — en lisant `timing: optional()` dans
    /// > `canvas-v3.ts` comme « cette famille n'a pas de temps ». **`optional`
    /// > décrit la PRÉSENCE d'un champ, jamais la CAPACITÉ d'une famille.** Un
    /// > objet peut ne pas avoir de fenêtre ; aucun ne peut être privé du droit
    /// > d'en avoir une.
    func test_unLieu_porteSaFenetre_commeLesQuatreAutres() {
        var lieu = StoryLocationObject(place: .init(latitude: 64.14, longitude: -21.94,
                                                    name: "Reykjavík"), x: 0.5, y: 0.8)
        lieu.startTime = 2
        lieu.duration = 3
        var e = StoryEffects()
        e.locationObjects = [lieu]
        XCTAssertEqual(e.sceneObject(id: lieu.id)?.duration, 3)
    }

    /// `nil` reste lisible, et signifie la MÊME chose pour les cinq : aucune
    /// fenêtre posée, l'objet vit aussi longtemps que la slide. Ce n'est plus
    /// une propriété du lieu, c'est un état que les cinq peuvent prendre.
    func test_uneFenetreAbsente_seLitPareilPourLesCinq() {
        let lieu = StoryLocationObject(place: .init(latitude: 48.85, longitude: 2.35,
                                                    name: "Paris"), x: 0.5, y: 0.8)
        var e = StoryEffects()
        e.locationObjects = [lieu]
        e.textObjects = [texte("t1")]
        XCTAssertNil(e.sceneObject(id: lieu.id)?.duration)
        XCTAssertNil(e.sceneObject(id: "t1")?.duration)
    }

    /// Les quatre autres la portent, et le type est UNIFORMISÉ : l'audio la
    /// déclare en `Float?`, les trois autres en `Double?`. La conversion vit
    /// dans la somme, une fois, plutôt qu'à chaque site de lecture.
    func test_lesQuatreAutres_portentLeurDuree_dansUnSeulType() {
        var t = texte("t1"); t.duration = 6
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.duration = 12

        var e = StoryEffects()
        e.textObjects = [t]
        e.audioPlayerObjects = [son]

        XCTAssertEqual(e.sceneObject(id: "t1")?.duration, 6)
        XCTAssertEqual(e.sceneObject(id: son.id)?.duration, 12)
    }

    // MARK: - La timeline voit les CINQ familles

    /// **`TimelineProject` porte `locationObjects`**, parce qu'un objet qui a
    /// une fenêtre a une piste.
    ///
    /// > La version précédente affirmait quatre familles et le justifiait par le
    /// > témoin ci-dessus — « pas de piste parce que pas de temps » — pendant
    /// > que ce témoin-là se justifiait par cette absence-ci. **Deux absences
    /// > qui se soutiennent forment un cercle, et un cercle a l'air d'une
    /// > cohérence.** Aucune relecture ne pouvait le rompre : il fallait une
    /// > source extérieure au code.
    func test_leProjetDeTimeline_voitCinqFamilles() {
        let p = TimelineProject(
            slideId: "s1", slideDuration: 6,
            mediaObjects: [media("m1")],
            audioPlayerObjects: [StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                                        x: 0.5, y: 0.5, volume: 1,
                                                        waveformSamples: [])],
            textObjects: [texte("t1")],
            stickerObjects: [StorySticker(emoji: "🎬", x: 0.5, y: 0.5)],
            locationObjects: [StoryLocationObject(id: "l1",
                                                  place: .init(latitude: 48.85, longitude: 2.35,
                                                               name: "Paris"))])

        XCTAssertEqual(p.sceneObjects.count, 5)
        XCTAssertEqual(Set(p.sceneObjects.map(\.kind)), [.text, .media, .sticker, .audio, .place])
        XCTAssertEqual(p.sceneObject(id: "m1")?.kind, .media)
        XCTAssertEqual(p.sceneObject(id: "l1")?.kind, .place)
        XCTAssertNil(p.sceneObject(id: "fantome"))
    }

    /// **Le projet est ALIMENTÉ par la slide, et la rend.** Le champ ajouté au
    /// projet ne servait personne tant que `init(from:)` ne le remplissait pas
    /// et qu'`apply(to:)` ne le réécrivait pas : un déplacement de pastille dans
    /// la timeline se serait perdu au retour.
    func test_leLieu_faitLAllerRetour_entreLaSlideEtLeProjet() {
        var slide = StorySlide(id: "s1")
        slide.effects.locationObjects = [
            StoryLocationObject(id: "l1", place: .init(latitude: 48.85, longitude: 2.35,
                                                       name: "Paris"))
        ]

        var projet = TimelineProject(from: slide)
        XCTAssertEqual(projet.locationObjects.count, 1)

        projet.locationObjects[0].startTime = 1
        projet.locationObjects[0].duration = 4
        projet.apply(to: &slide)

        XCTAssertEqual(slide.effects.locationObjects.first?.startTime, 1)
        XCTAssertEqual(slide.effects.locationObjects.first?.duration, 4)
    }

    /// Même ordre que la scène : du fond vers l'avant.
    func test_leProjet_rangeDuFondVersLAvant() {
        let p = TimelineProject(slideId: "s1", slideDuration: 6,
                                mediaObjects: [media("bas", z: 1)],
                                textObjects: [texte("haut", z: 5)])
        XCTAssertEqual(p.sceneObjects.map(\.id), ["bas", "haut"])
    }
}
