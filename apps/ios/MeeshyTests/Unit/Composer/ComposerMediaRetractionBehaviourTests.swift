import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// #6577 — **le retrait d'un média, ÉPROUVÉ sur ce qu'il fait, pas sur ce qu'il
/// dit.**
///
/// ## Pourquoi cette suite existe à côté de `ComposerMediaRetractionTests`
///
/// Le premier correctif de #6577 avait seize témoins. Un contrôle adverse a
/// remplacé les huit affectations de `retractMedia` par des no-op qui
/// CONSERVAIENT chaque identifiant — le retrait était calculé puis jeté, le
/// défaut intégralement restauré — et **les seize sont restés verts**, puis
/// 241 de plus sur les suites voisines.
///
/// La cause n'était pas la qualité des témoins mais leur PRISE : onze lisaient
/// le texte du fichier (`contains("documentLocalMedia")`), et les cinq témoins
/// de comportement appelaient la règle PURE en direct, sans jamais passer par ce
/// qui l'applique.
///
/// > **Un `@State` ne s'éprouve pas.** Son `setter` est `nonmutating` et n'écrit
/// > nulle part tant que SwiftUI n'a pas installé la vue. Tant que l'application
/// > d'un retrait vivait dans le `@State` du meuble, aucun témoin ne POUVAIT
/// > distinguer « appliqué » de « calculé puis jeté » — et un grep reste vert
/// > sur un no-op qui garde les identifiants.
///
/// Les porteurs vivent donc dans `ComposerMediaPorterStore` et l'application
/// dans `ComposerMediaRetractionRun` : trois collaborateurs, tous instanciables.
/// **Chaque témoin de cette suite instancie, appelle, et observe un EFFET** —
/// l'état du store, la charge qu'il compose, le registre de pré-montée, le
/// modèle de scène. Neutraliser `store.porters = retrait.porteurs` les fait
/// rougir ; c'est la seule preuve qui compte.
@MainActor
final class ComposerMediaRetractionBehaviourTests: XCTestCase {

    // MARK: - Le montage

    /// Un monteur qui reste en vol le temps du témoin : sans lui,
    /// `ComposerPreUploadRegistry.begin` refuse de démarrer (`uploader == nil`)
    /// et « la pré-montée est oubliée » se prouverait sur un registre vide —
    /// c'est-à-dire sur rien.
    private final class MonteurEnVol: ComposerPreUploadProviding, @unchecked Sendable {
        func upload(fileURL: URL, mimeType: String) async throws
            -> (postMediaId: String, remoteURL: String) {
            try await Task.sleep(nanoseconds: 200_000_000)
            return ("pm", "https://cdn/\(fileURL.lastPathComponent)")
        }
    }

    private struct Montage {
        let store: ComposerMediaPorterStore
        let preUploads: ComposerPreUploadRegistry
        let viewModel: StoryComposerViewModel
    }

    private func makeSUT() -> Montage {
        let registre = ComposerPreUploadRegistry(uploader: MonteurEnVol())
        registre.adopt = { _, _, _ in true }
        return Montage(store: ComposerMediaPorterStore(),
                       preUploads: registre,
                       viewModel: StoryComposerViewModel())
    }

    /// Un fichier qui EXISTE sur le disque : le registre mesure une taille, et
    /// `AVURLAsset` ne part pas en erreur sur un chemin fantôme.
    @discardableResult
    private func fichier(_ nom: String, octets: Int = 0) -> URL {
        let url = FileManager.default.temporaryDirectory
            .appendingPathComponent("retrait-\(nom)")
        try? Data(repeating: 0x2A, count: max(octets, 1)).write(to: url)
        return url
    }

    private func media(_ url: URL) -> ComposerDocumentMedia {
        ComposerDocumentMedia(url: url, mimeType: "image/jpeg", durationMs: nil)
    }

    private func preMonte(_ url: URL, in registre: ComposerPreUploadRegistry) {
        registre.begin(url: url, mimeType: "image/jpeg",
                       fileSize: ComposerPreUploadPolicy.minimumBytes * 4,
                       alreadyRemote: false)
    }

    /// **La CHARGE, composée des mêmes porteurs que le meuble lui passe**
    /// (`MeeshyComposerHost+Draft.documentDraft`). Un témoin qui réécrirait la
    /// composition en ferait une jumelle à faire diverger ; celui-ci la
    /// consulte, et `altsBySourceURL` est la projection que le meuble sert sous
    /// le nom `altsParURLSource`.
    private func charge(_ porteurs: ComposerMediaPorters) -> ComposerDocumentDraft {
        ComposerDocumentDraft.document(
            format: .post, forcePlainPost: true, text: "", visibility: .public,
            visibilityUserIds: [], repostOfId: nil,
            localMedia: porteurs.localMedia, location: nil,
            discoverabilityPrecision: nil, originalLanguage: nil,
            mobileTranscription: nil, references: [], storyEffects: nil,
            mediaCaptions: porteurs.captions,
            mediaAlts: porteurs.altsBySourceURL,
            mediaObjectIds: porteurs.objectIdBySource,
            allowSoundExtraction: nil)
    }

    // MARK: - 1. L'APPLICATION — ce qu'aucun grep ne pouvait mesurer

    /// **« Je supprime un média et rechoisis un autre : c'est l'ancien qui est
    /// publié »** (porteur, 2026-09-14). Le geste, rejoué sur les porteurs RÉELS
    /// du meuble puis sur la charge qu'ils composent.
    ///
    /// C'est LE témoin de la mutation adverse : neutraliser
    /// `store.porters = retrait.porteurs` dans `ComposerMediaRetractionRun.apply`
    /// le fait rougir sur la première assertion, quelle que soit la façon dont
    /// les identifiants sont conservés.
    func test_leRetraitApplique_sortLeFichierDeLaCharge_etEpargneSonVoisin() {
        let sut = makeSUT()
        let a = fichier("A.jpg")
        let b = fichier("B.jpg")
        sut.store.porters = ComposerMediaPorters(
            localMedia: [media(a), media(b)],
            roleByURL: [a: .background, b: .background],
            slideIdByMediaURL: [a: "scene-1", b: "scene-2"],
            objectIdBySource: [a: "objet-A", b: "objet-B"],
            captions: [a: "légende de A", b: "légende de B"],
            altsByObjectId: ["objet-A": "alt de A", "objet-B": "alt de B"],
            transcriptions: [:],
            railPosedURLs: [a, b])

        ComposerMediaRetractionRun.apply(objectIds: ["objet-A"],
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertEqual(sut.store.localMedia.map(\.url), [b],
            "Les porteurs du meuble portent encore A : le retrait a été CALCULÉ puis JETÉ. "
            + "C'est le fantôme que le gateway grave à `order: 0`, donc en COUVERTURE (#6577).")

        let partant = charge(sut.store.porters)
        XCTAssertEqual(partant.localMedia.map(\.url), [b])
        XCTAssertNil(partant.mediaCaptions[a], "La légende de A voyage encore")
        XCTAssertNil(partant.mediaAlts[a], "L'alternative de A voyage encore")
        XCTAssertNil(partant.mediaObjectIds[a], "Le pont d'objet de A voyage encore")

        // Les index d'idempotence : survivant à leur média, ils font SAUTER en
        // silence la re-pose du même fichier — « je le supprime, je le
        // rechoisis, il n'apparaît plus ».
        XCTAssertNil(sut.store.roleByURL[a])
        XCTAssertFalse(sut.store.railPosedURLs.contains(a))
        XCTAssertNil(sut.store.slideIdByMediaURL[a])

        // Le voisin n'est pas emporté : un retrait qui nettoie TROP est l'autre
        // moitié du même défaut.
        XCTAssertEqual(partant.mediaCaptions[b], "légende de B")
        XCTAssertEqual(partant.mediaAlts[b], "alt de B")
        XCTAssertEqual(sut.store.roleByURL[b], .background)
    }

    /// **La pré-montée est la moitié SERVEUR du même geste.** Sans elle, le
    /// fichier déjà téléversé reste un `PostMedia` orphelin en base et le
    /// registre continue de le tenir pour prêt.
    func test_leRetraitApplique_oublieLaPreMontee() {
        let sut = makeSUT()
        let a = fichier("pre-A.jpg", octets: 64)
        preMonte(a, in: sut.preUploads)
        XCTAssertTrue(sut.preUploads.state(for: a).showsProgress,
                      "fusible : sans pré-montée en cours, ce témoin ne mesurerait rien")

        sut.store.porters = ComposerMediaPorters(
            localMedia: [media(a)], roleByURL: [a: .background], slideIdByMediaURL: [:],
            objectIdBySource: [a: "objet-A"], captions: [:], altsByObjectId: [:],
            transcriptions: [:], railPosedURLs: [])

        ComposerMediaRetractionRun.apply(objectIds: ["objet-A"],
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertFalse(sut.preUploads.state(for: a).showsProgress,
            "Le registre monte encore un fichier que la composition ne porte plus : son "
            + "`PostMedia` restera orphelin côté serveur.")
        sut.preUploads.stopForPublication()
    }

    /// **Ce que les deux portes du SON remettent : un FICHIER, sans objet de
    /// canvas.** Une carte de contenu n'est peinte par aucun
    /// `MeeshySceneObject`, donc aucun relevé ne peut la désigner — c'est la
    /// seule raison d'être de `fileURLs:`.
    ///
    /// Les deux portes le faisaient à la main : `documentLocalMedia` et
    /// `documentTranscriptions`, DEUX porteurs sur huit, et jamais
    /// `preUploads.forget(url:)`. Le doc-comment du premier lot affirmait
    /// pourtant qu'elles « faisaient les deux moitiés depuis #4696 », et fondait
    /// sur ce précédent imaginaire le témoin de la pré-montée.
    func test_unFichierNomme_quitteLaCharge_memeSansObjetDeCanvas() {
        let sut = makeSUT()
        let son = fichier("carte.m4a", octets: 64)
        preMonte(son, in: sut.preUploads)
        sut.store.porters = ComposerMediaPorters(
            localMedia: [media(son)], roleByURL: [son: .foreground], slideIdByMediaURL: [:],
            objectIdBySource: [:], captions: [:], altsByObjectId: [:],
            transcriptions: [son: MobileTranscriptionPayload(text: "t", language: "fr")],
            railPosedURLs: [])

        ComposerMediaRetractionRun.apply(objectIds: [], fileURLs: [son],
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertTrue(sut.store.localMedia.isEmpty,
            "Le son supprimé depuis sa carte reste dans la charge et repart à la publication.")
        XCTAssertNil(sut.store.transcriptions[son],
            "Sa transcription survit : un son posé plus tard sous la même URL temporaire "
            + "hériterait d'un texte qui n'est pas le sien.")
        XCTAssertFalse(sut.preUploads.state(for: son).showsProgress,
            "Sa pré-montée continue : le `PostMedia` restera orphelin côté serveur.")
        sut.preUploads.stopForPublication()
    }

    /// Un objet sans fichier — un texte, une pastille — ne touche AUCUN porteur
    /// et descend tel quel au SDK. C'est le cas nominal du rail trailing, qui
    /// supprime surtout des objets qui ne sont aucun média.
    func test_unObjetSansFichier_neToucheAucunPorteur() {
        let sut = makeSUT()
        let a = fichier("intact.jpg")
        let avant = ComposerMediaPorters(
            localMedia: [media(a)], roleByURL: [a: .background], slideIdByMediaURL: [a: "s1"],
            objectIdBySource: [a: "objet-A"], captions: [a: "l"], altsByObjectId: ["objet-A": "x"],
            transcriptions: [:], railPosedURLs: [a])
        sut.store.porters = avant

        ComposerMediaRetractionRun.apply(objectIds: ["un-texte"],
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertEqual(sut.store.porters, avant,
            "Supprimer un objet de texte ne doit toucher aucun porteur de média.")
    }

    // MARK: - 2. La famille AUDIO, restée derrière la porte du premier lot

    /// **Jeter une scène qui porte un SON.** Le pont `objectIdBySource` n'est
    /// alimenté que par `applyContentMedia`, qui écarte l'audio ;
    /// `slideIdByMediaURL` n'indexe que les FONDS ; `syncPostMediaIntoSlides`
    /// filtre `kind != .audio`. Les trois voies de rattrapage étaient donc
    /// fermées, et le fichier du son restait pré-monté côté serveur avec sa
    /// transcription accrochée à son URL.
    func test_jeterUneScene_emporteLeFichierDuSonQuiYEstPose() {
        let sut = makeSUT()
        let son = fichier("son.m4a", octets: 64)
        sut.viewModel.addSlide()
        sut.viewModel.attachPastedAudio(url: son, role: .foreground)
        let scene = sut.viewModel.currentSlide
        XCTAssertEqual(scene.effects.audioPlayerObjects?.count, 1,
                       "fusible : aucun son posé, le témoin ne mesurerait rien")

        preMonte(son, in: sut.preUploads)
        sut.store.transcriptions[son] = MobileTranscriptionPayload(
            text: "ce que Whisper a compris", language: "fr", confidence: nil, durationMs: nil)

        ComposerMediaRetractionRun.apply(objectIds: [], slideId: scene.id,
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertFalse(sut.preUploads.state(for: son).showsProgress,
            "Le son de la scène jetée monte encore : son `PostMedia` restera orphelin.")
        XCTAssertNil(sut.store.transcriptions[son],
            "La transcription survit à son fichier : un son posé plus tard sous la même URL "
            + "temporaire hériterait d'un texte qui n'est pas le sien.")
        XCTAssertEqual(sut.viewModel.slides.count, 1, "La scène doit avoir quitté le modèle")
        sut.preUploads.stopForPublication()
    }

    /// **Le relevé du canvas voit les DEUX familles qui portent un fichier.**
    /// C'est la paire que le balayage de pré-montée énumère déjà ; les deux
    /// sites doivent rester d'accord — ce qui se pré-monte est exactement ce
    /// qu'un retrait doit faire oublier.
    func test_leReleve_voitLeFichierDUnSon_queAucunIndexDuMeubleNeConnait() {
        let sut = makeSUT()
        let son = fichier("releve.m4a", octets: 64)
        sut.viewModel.attachPastedAudio(url: son, role: .background)

        let releve = ComposerCanvasCensus.of(sut.viewModel.slides)
        XCTAssertEqual(Set(releve.objects.compactMap(\.fileURL)), [son],
            "Le relevé ne voit pas le fichier du son — il ne pourra donc jamais le retirer.")
    }

    // MARK: - 3. Le repli « scène vierge », qui ne l'était pas

    /// **`removeSlide` refuse de descendre sous une scène, en silence.** Le
    /// repli du meuble reproduit donc sa condition — mais il ne supprimait que
    /// les objets nés d'un FICHIER (`retiredObjectIds`), laissant sur place
    /// textes, pastilles, lieux et sons. Son commentaire affirmait pourtant « ce
    /// qui reste est une scène vierge ». Le relevé du canvas lui donne désormais
    /// TOUS les objets de la scène.
    func test_jeterLaDerniereScene_laLaisseVIERGE_pasSeulementSansMedia() {
        let sut = makeSUT()
        let son = fichier("dernier.m4a", octets: 64)
        _ = sut.viewModel.addText()
        sut.viewModel.attachPastedAudio(url: son, role: .foreground)
        let scene = sut.viewModel.currentSlide
        XCTAssertGreaterThanOrEqual(scene.sceneObjects.count, 2,
                                    "fusible : la scène doit porter au moins un texte et un son")

        ComposerMediaRetractionRun.apply(objectIds: [], slideId: scene.id,
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertEqual(sut.viewModel.slides.count, 1,
            "`removeSlide` refuse sous une scène : le meuble doit REPRODUIRE sa condition.")
        XCTAssertTrue(sut.viewModel.slides[0].sceneObjects.isEmpty,
            "La scène garde \(sut.viewModel.slides[0].sceneObjects.map(\.kind)) — le commentaire "
            + "promet une scène VIERGE, le code ne supprimait que ce qui portait un fichier.")
    }

    // MARK: - 4. La DUPLICATION — l'inversion que le premier lot avait introduite

    /// **Dupliquer puis supprimer l'ORIGINAL ne doit pas déshabiller le clone.**
    ///
    /// `duplicateElement` clone l'objet avec un `id` NEUF en recopiant son
    /// `mediaURL` : DEUX objets pour UN fichier. Le pont `objectIdBySource` est
    /// un `[URL: String]` — il ne connaît que l'objet d'ORIGINE. Supprimer
    /// l'original retirait donc le fichier de la charge et oubliait sa
    /// pré-montée pendant que le clone restait peint sur le canvas : **l'inverse
    /// exact de #6577**, et tout aussi invisible à l'auteur.
    func test_dupliquerPuisSupprimerLOriginal_laisseLeFichierServi() {
        let sut = makeSUT()
        let son = fichier("clone.m4a", octets: 64)
        sut.viewModel.attachPastedAudio(url: son, role: .foreground)
        guard let original = sut.viewModel.currentSlide.effects.audioPlayerObjects?.first?.id else {
            return XCTFail("fusible : aucun objet posé, le témoin ne mesurerait rien")
        }
        sut.viewModel.duplicateElement(id: original)
        let objets = sut.viewModel.currentSlide.effects.audioPlayerObjects ?? []
        XCTAssertEqual(objets.count, 2, "fusible : la duplication n'a pas eu lieu")
        guard let clone = objets.map(\.id).first(where: { $0 != original }) else {
            return XCTFail("fusible : le clone porte l'identifiant de son original")
        }

        preMonte(son, in: sut.preUploads)
        sut.store.porters = ComposerMediaPorters(
            localMedia: [media(son)], roleByURL: [son: .foreground], slideIdByMediaURL: [:],
            objectIdBySource: [son: original], captions: [son: "la légende"],
            altsByObjectId: [original: "l'alternative"], transcriptions: [:], railPosedURLs: [])

        ComposerMediaRetractionRun.apply(objectIds: [original],
                                         store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertEqual(sut.store.localMedia.map(\.url), [son],
            "Le fichier a quitté la charge pendant que le CLONE le peint encore : la "
            + "publication partira avec un objet sans média.")
        XCTAssertTrue(sut.preUploads.state(for: son).showsProgress,
            "Sa pré-montée a été annulée alors que le fichier part toujours.")
        XCTAssertEqual(sut.store.objectIdBySource[son], clone,
            "Le pont désigne un objet que le modèle ne connaît plus — la charge nommerait un "
            + "fantôme dans `mediaObjectIds`.")
        XCTAssertEqual(charge(sut.store.porters).mediaAlts[son], "l'alternative",
            "L'alternative décrit le FICHIER : elle doit suivre le peintre survivant.")
        sut.preUploads.stopForPublication()
    }

    // MARK: - 5. « Tout effacer » — les huit, et les pré-montées

    /// L'effacement s'écrivait en ÉNUMÉRATION et en oubliait DEUX sur huit —
    /// `documentMediaAlts` et `railPosedMediaURLs`, qu'aucun autre site
    /// n'affectait non plus. Et il n'oubliait aucune pré-montée : chaque fichier
    /// déjà téléversé restait un `PostMedia` orphelin côté serveur.
    func test_toutEffacer_videLesHuitPorteurs_etOublieLesPreMontees() {
        let sut = makeSUT()
        let photo = fichier("efface.jpg", octets: 64)
        let son = fichier("efface.m4a", octets: 64)
        sut.viewModel.attachPastedAudio(url: son, role: .background)
        preMonte(photo, in: sut.preUploads)
        preMonte(son, in: sut.preUploads)
        sut.store.porters = ComposerMediaPorters(
            localMedia: [media(photo)], roleByURL: [photo: .background],
            slideIdByMediaURL: [photo: "s1"], objectIdBySource: [photo: "objet"],
            captions: [photo: "l"], altsByObjectId: ["objet": "a"],
            transcriptions: [son: MobileTranscriptionPayload(
                text: "t", language: "fr", confidence: nil, durationMs: nil)],
            railPosedURLs: [photo])

        ComposerMediaRetractionRun.clear(store: sut.store,
                                         preUploads: sut.preUploads,
                                         viewModel: sut.viewModel)

        XCTAssertEqual(sut.store.porters, .empty,
            "« Tout effacer » laisse des porteurs derrière lui — et l'auteur croit être reparti "
            + "de zéro. Le survivant le plus traître est `railPosedMediaURLs` : re-poser LA MÊME "
            + "photo héritera de sa marque périmée.")
        XCTAssertFalse(sut.preUploads.state(for: photo).showsProgress,
                       "La photo effacée monte encore")
        XCTAssertFalse(sut.preUploads.state(for: son).showsProgress,
            "Le SON de la scène monte encore — il n'était dans aucun des huit porteurs, seul le "
            + "relevé du canvas pouvait le nommer, et il faut le dresser AVANT `reset()`.")
        sut.preUploads.stopForPublication()
    }
}
