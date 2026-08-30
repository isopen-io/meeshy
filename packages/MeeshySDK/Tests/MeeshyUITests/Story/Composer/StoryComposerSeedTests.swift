import XCTest
import MeeshySDK
@testable import MeeshyUI

/// **La GRAINE** — ce qu'une porte pose dans l'atelier avant qu'il ne s'ouvre
/// (lot 5, O13 : « le média reçu est déjà posé par la porte »).
///
/// Elle est le jumeau de `init(reposting:authorHandle:)`, et c'est délibéré :
/// même foyer (la CONSTRUCTION du ViewModel, seul moment que le `@StateObject`
/// du meuble laisse passer), même forme (un slide, `currentSlideIndex = 0`).
/// Trois choses l'en séparent, et chacune a son test ci-dessous — aucune chaîne
/// de republication, aucun badge d'attribution verrouillé, aucun préchargement
/// distant.
///
/// **L'asymétrie image / vidéo est mesurée, pas esthétique.** Le fond de slide
/// est recopié dans un `@State` de la VUE par `restoreCanvas(from:)`, un
/// INSTANTANÉ qui ne relit jamais ce qui arrive après lui : un bitmap posé
/// asynchroniquement ne s'afficherait donc jamais. Le premier plan, lui, se
/// rafraîchit par `loadedImagesVersion` — il tolère qu'on affine sa vignette,
/// son ratio et sa durée après coup.
@MainActor
final class StoryComposerSeedTests: XCTestCase {

    // MARK: - Fixtures

    private func makeImage(width: CGFloat = 200, height: CGFloat = 100) -> UIImage {
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: width, height: height))
        return renderer.image { ctx in
            UIColor.systemTeal.setFill()
            ctx.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    /// Un fichier RÉEL sur disque : la graine vidéo COPIE, et une copie ne peut
    /// pas se mesurer sur une URL qui ne désigne rien.
    private func makeVideoFile(extension ext: String = "mov") throws -> URL {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("StoryComposerSeed-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let url = root.appendingPathComponent("source.\(ext)")
        try Data(repeating: 0x42, count: 2048).write(to: url)
        addTeardownBlock { try? FileManager.default.removeItem(at: root) }
        return url
    }

    /// La graine COPIE sous `tmp/{objectId}.{ext}`, **une fois, à sa
    /// FABRIQUE** — et c'est la fabrique qui possède le fichier, pas l'atelier.
    /// La copie est donc balayée ici, à la graine, et non par ViewModel.
    private func makeVideoSeed(from source: URL) throws -> StoryComposerSeed {
        let seed = try XCTUnwrap(
            StoryComposerSeed.video(copying: source),
            "La fabrique doit produire une graine : sans elle, tous les cas ci-dessous mesurent le vide."
        )
        if case .video(let fileURL, _) = seed.payload {
            addTeardownBlock { try? FileManager.default.removeItem(at: fileURL) }
        }
        return seed
    }

    private func seededWithVideo(at url: URL) throws -> StoryComposerViewModel {
        StoryComposerViewModel(seeding: try makeVideoSeed(from: url))
    }


    // MARK: - Graine IMAGE — le fond, posé SYNCHRONIQUEMENT

    /// Le bitmap va dans `slideImages`, pas dans `loadedImages` : c'est
    /// `upload.slideImages[slide.id]` — et lui seul — que `runStoryUpload` lit
    /// pour envoyer un FOND. Posé dans `loadedImages`, le média serait visible
    /// à l'écran et absent de la publication.
    func test_seedingWithAnImage_posesTheBitmapAsTheBackgroundOfASingleSlide() {
        let bitmap = makeImage()

        let sut = StoryComposerViewModel(seeding: StoryComposerSeed(payload: .image(bitmap)))

        XCTAssertEqual(sut.slides.count, 1, "Une graine pose UN slide — jamais un deuxième par-dessus l'ardoise.")
        XCTAssertEqual(sut.currentSlideIndex, 0)
        XCTAssertTrue(
            sut.imageForCurrentSlide() === bitmap,
            "Le fond doit être le bitmap SEMÉ, sous la clé du slide courant."
        )
        XCTAssertTrue(
            sut.loadedImages.isEmpty,
            "Un fond posé dans `loadedImages` s'afficherait sans jamais partir : `runStoryUpload` n'envoie "
                + "un fond que depuis `slideImages[slide.id]`."
        )
    }

    // MARK: - Graine VIDÉO — le premier plan, sous un fichier COPIÉ

    func test_seedingWithAVideo_posesOneVideoObject_onTheCurrentSlide() throws {
        let source = try makeVideoFile()

        let sut = try seededWithVideo(at: source)

        let objects = try XCTUnwrap(sut.currentSlide.effects.mediaObjects)
        XCTAssertEqual(objects.count, 1)
        XCTAssertEqual(objects.first?.kind, .video)
    }

    /// **La graine COPIE, elle ne référence pas.** Le fichier que la porte lui
    /// remet vient du `DiskCacheStore`, soumis à ÉVICTION par mtime : une
    /// éviction entre l'ouverture de l'atelier et l'envoi ferait échouer
    /// l'upload d'une vidéo déjà composée, sans un mot.
    func test_seedingWithAVideo_copiesTheFile_ratherThanReferencingTheSource() throws {
        let source = try makeVideoFile()

        let sut = try seededWithVideo(at: source)

        let object = try XCTUnwrap(sut.currentSlide.effects.mediaObjects?.first)
        let copied = try XCTUnwrap(sut.loadedVideoURLs[object.id])
        XCTAssertNotEqual(copied, source, "Référencer la source laisse l'envoi dépendre du cache typé.")
        XCTAssertTrue(FileManager.default.fileExists(atPath: copied.path))
    }

    /// La convention « `obj.id` == nom du fichier » est STRUCTURANTE : c'est
    /// elle qui relie le bitmap au `composerKey` que `StoryBackgroundLayer`
    /// dérive du fichier. La casser rend le fond `.clear` — canvas noir.
    func test_seedingWithAVideo_namesTheCopiedFileAfterTheObjectId() throws {
        let source = try makeVideoFile(extension: "mp4")

        let sut = try seededWithVideo(at: source)

        let object = try XCTUnwrap(sut.currentSlide.effects.mediaObjects?.first)
        let copied = try XCTUnwrap(sut.loadedVideoURLs[object.id])
        XCTAssertEqual(copied.lastPathComponent, "\(object.id).mp4")
    }

    /// **Une source ABSENTE ne produit AUCUNE graine.** Le refus vit à la
    /// FABRIQUE, c'est-à-dire au seul endroit qui tient encore la source — et
    /// c'est ce qui permet à la porte de le DIRE (« ce média n'est pas
    /// disponible ») plutôt que d'ouvrir un atelier vide.
    func test_laFabriqueVideo_refuseUneSourceAbsente() {
        let absent = FileManager.default.temporaryDirectory
            .appendingPathComponent("jamais-ecrit-\(UUID().uuidString).mov")

        XCTAssertNil(StoryComposerSeed.video(copying: absent))
    }

    /// Un fichier ÉVINCÉ entre la fabrique et l'ouverture ne pose RIEN.
    /// L'alternative — poser l'objet quand même — produirait exactement le mode
    /// d'échec que `runStoryUpload` journalise sous « layer will be invisible to
    /// viewers » : une couche déclarée, sans actif chargé, que personne ne verra.
    func test_seedingWithAMissingFile_leavesTheComposerPristine() throws {
        let seed = try makeVideoSeed(from: try makeVideoFile())
        guard case .video(let copie, _) = seed.payload else { return XCTFail("graine vidéo attendue") }
        try FileManager.default.removeItem(at: copie)

        let sut = StoryComposerViewModel(seeding: seed)

        XCTAssertEqual(sut.slides.count, 1)
        XCTAssertTrue(sut.currentSlide.effects.mediaObjects?.isEmpty ?? true, "Aucun objet orphelin.")
        XCTAssertTrue(sut.loadedVideoURLs.isEmpty)
        XCTAssertFalse(
            sut.isSeededSession,
            "Une graine qui n'a rien posé n'a rien à protéger : la session redevient vierge, et le bandeau "
                + "de reprise reprend ses droits."
        )
    }

    /// **La copie appartient à la GRAINE, pas à la construction du ViewModel —
    /// et c'est un invariant de DISQUE, pas de style.**
    ///
    /// `MeeshyComposerHost.init` construit son `StoryComposerViewModel` de
    /// manière ÉAGRE : `StateObject(wrappedValue:)` ne reçoit pas une
    /// autoclosure paresseuse ici mais une valeur déjà calculée, si bien que
    /// CHAQUE réévaluation du `body` de la porte en fabrique un de plus, dont un
    /// seul survit. Une copie de fichier logée dans cet `init` s'exécuterait donc
    /// à chaque passe de rendu — un aller-retour dans l'aperçu en vaut deux — sur
    /// le MAIN ACTOR, et rien ne balaie `tmp/` (`cleanupTempFiles` n'a aucun
    /// appelant de production, `deinit` n'annule que `preloadTask`). Une vidéo
    /// reçue de 80 Mo devenait ainsi 80 Mo de plus par rendu.
    func test_construireDeuxAteliers_depuisLaMemeGraine_nEcritAucuneCopieDePlus() throws {
        let seed = try makeVideoSeed(from: try makeVideoFile())

        let premier = StoryComposerViewModel(seeding: seed)
        let second = StoryComposerViewModel(seeding: seed)

        let a = try XCTUnwrap(premier.loadedVideoURLs.values.first)
        let b = try XCTUnwrap(second.loadedVideoURLs.values.first)
        XCTAssertEqual(
            a, b,
            "Deux ateliers semés par la MÊME graine doivent pointer le MÊME fichier. Deux URL distinctes "
                + "signifient qu'une copie a été écrite PAR CONSTRUCTION — donc à chaque passe de rendu."
        )
        XCTAssertEqual(
            try FileManager.default.contentsOfDirectory(atPath: a.deletingLastPathComponent().path)
                .filter { $0.hasPrefix(a.deletingPathExtension().lastPathComponent) }
                .count,
            1,
            "Une graine, un fichier. Un second exemplaire est une copie que rien ne balaiera."
        )
    }

    // MARK: - Ce qu'une graine n'est PAS

    /// Une graine n'est pas une REPUBLICATION (O13 : « aucune référence
    /// automatique vers l'expéditeur »). Le média a été reçu en privé ; le
    /// republier vers son expéditeur serait une divulgation, pas un crédit.
    func test_aSeed_carriesNoRepostChain() throws {
        let source = try makeVideoFile()

        for sut in [StoryComposerViewModel(seeding: StoryComposerSeed(payload: .image(makeImage()))),
                    try seededWithVideo(at: source)] {
            XCTAssertNil(sut.repostOfId)
            XCTAssertNil(sut.originalRepostOfId)
        }
    }

    /// Garde NÉGATIVE, doublée de son garde-fou : le badge d'attribution
    /// verrouillé est l'apanage EXCLUSIF du repost (`+Repost.swift` en est
    /// l'unique producteur). En poser un afficherait « Reposté de @… » sur un
    /// média reçu EN PRIVÉ.
    func test_aSeed_posesNoLockedAttributionBadge() {
        let sut = StoryComposerViewModel(seeding: StoryComposerSeed(payload: .image(makeImage())))

        XCTAssertEqual(sut.slides.count, 1, "Garde-fou : sans slide, l'assertion suivante ne mesurerait RIEN.")
        XCTAssertTrue(
            sut.currentEffects.textObjects.allSatisfy { $0.isLocked != true },
            "Un texte verrouillé est un badge d'attribution — il n'a rien à faire sur un média reçu en privé."
        )
    }

    func test_isSeededSession_isTrueOnlyForASeededComposer() {
        XCTAssertFalse(StoryComposerViewModel().isSeededSession)
        XCTAssertTrue(
            StoryComposerViewModel(seeding: StoryComposerSeed(payload: .image(makeImage()))).isSeededSession
        )
    }

    // MARK: - La seconde pièce : ce que l'OUVERTURE fait d'une session semée

    /// Sans ce cas, la graine est soit INVISIBLE, soit DÉTRUITE — deux défauts
    /// distincts qu'une demi-fermeture laisserait plausibles :
    ///
    /// 1. une session fraîche n'appelle jamais `restoreCanvas`, donc le fond
    ///    semé n'est jamais recopié dans le `@State` de la vue ⇒ canvas VIDE
    ///    sous une porte qui vient d'annoncer un média posé ;
    /// 2. elle propose en plus une carte « Reprendre », et `restoreDraft()`
    ///    écrase `slides` SANS CONDITION ⇒ le média disparaît d'un tap.
    func test_openingDraftAction_seededSession_adoptsItsCanvas_andOffersNoResume() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: false,
                isAdoptedDraftSession: false,
                isSeededSession: true),
            .adoptSeededCanvas
        )
    }

    /// L'ADOPTION prime sur la graine : un brouillon que l'utilisateur vient de
    /// désigner ne se fait pas écraser par ce qu'une porte sème.
    func test_openingDraftAction_adoptionPrimesOverTheSeed() {
        XCTAssertEqual(
            StoryComposerView.openingDraftAction(
                isEditingExistingStory: false,
                isAdoptedDraftSession: true,
                isSeededSession: true),
            .restoreAdoptedDraft
        )
    }

    /// La table EXHAUSTIVE des huit combinaisons. Un quatrième booléen ajouté
    /// sans entrer ici passerait en silence — c'est le mode de mort ordinaire
    /// d'une décision à plusieurs entrées.
    func test_openingDraftAction_coversTheEightCombinations() {
        let table: [(edition: Bool, adoption: Bool, graine: Bool, attendu: StoryComposerView.ComposerOpeningDraftAction)] = [
            (false, false, false, .offerDraftResume),
            (false, false, true, .adoptSeededCanvas),
            (false, true, false, .restoreAdoptedDraft),
            (false, true, true, .restoreAdoptedDraft),
            (true, false, false, .hydratedByEditMode),
            (true, false, true, .adoptSeededCanvas),
            (true, true, false, .restoreAdoptedDraft),
            (true, true, true, .restoreAdoptedDraft)
        ]

        for cas in table {
            XCTAssertEqual(
                StoryComposerView.openingDraftAction(
                    isEditingExistingStory: cas.edition,
                    isAdoptedDraftSession: cas.adoption,
                    isSeededSession: cas.graine),
                cas.attendu,
                "édition=\(cas.edition) adoption=\(cas.adoption) graine=\(cas.graine)"
            )
        }
    }

    /// L'`onAppear` du composer ROUTE par la décision — et il route le cas
    /// SEMÉ, sans quoi la graine n'atteint jamais le canvas.
    func test_onAppear_routesTheSeededCase() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertTrue(
            code.contains("struct StoryComposerView"),
            "Garde-fou : la source lue n'est pas celle de l'atelier — la garde ci-dessous ne mesurerait RIEN."
        )
        XCTAssertTrue(
            code.contains("case .adoptSeededCanvas:"),
            "Sans ce cas dans l'`onAppear`, une session semée retombe sur `.offerDraftResume` : canvas vide, "
                + "et une carte « Reprendre » qui écrase la graine au premier tap."
        )
    }

    // MARK: - #4025 — une graine peut ne semer QUE du texte

    /// **Le défaut.** La graine ne connaissait que `.image` et `.video` : un
    /// message TEXTE n'avait aucune porte d'entrée vers l'atelier, alors que son
    /// texte a une destination évidente — la DESCRIPTION de la slide.
    ///
    /// Le texte n'est donc PAS un troisième cas de `Payload` : ce qu'on pose sur
    /// le canvas et ce qui pré-remplit la description sont deux choses de nature
    /// différente, et un message porte souvent les deux. Le payload devient
    /// optionnel, la description l'accompagne.
    @MainActor
    func test_seed_textOnly_fillsTheSlideDescription() throws {
        let graine = try XCTUnwrap(StoryComposerSeed.text("On se voit à 18h"))
        let sut = StoryComposerViewModel(seeding: graine)

        XCTAssertEqual(sut.currentSlide.content, "On se voit à 18h")
        XCTAssertTrue(sut.isSeededSession,
                      "une session semée par du texte est semée au même titre qu'une autre")
    }

    /// Un texte fait d'espaces ne sème rien : la fabrique le DIT en rendant
    /// `nil`, plutôt que d'ouvrir un atelier sur une description vide.
    func test_seed_blankText_yieldsNoSeed() {
        XCTAssertNil(StoryComposerSeed.text("   \n\t "))
        XCTAssertNil(StoryComposerSeed.text(""))
    }

    /// **Média ET texte ensemble** — la légende que l'auteur a déjà écrite ne
    /// lui est pas redemandée.
    @MainActor
    func test_seed_imageWithDescription_posesBoth() {
        let sut = StoryComposerViewModel(seeding: StoryComposerSeed(
            payload: .image(makeImage()), description: "au bord du lac"))

        XCTAssertTrue(sut.hasBackgroundImage, "le média se pose toujours sur le canvas")
        XCTAssertEqual(sut.currentSlide.content, "au bord du lac")
    }
}
