import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// S5 — le bouton Publier acquiert enfin un gate de contenu.
///
/// Le bouton n'était `.disabled` que sur le loquet anti-double-tap : une page
/// blanche — un rectangle coloré, sans un mot, sans un média — partait en
/// publication. L'arbitrage S2 a tranché sur `composerHasContent` (« le fond
/// auto-appliqué ne compte jamais seul comme contenu, aucun leader SOTA ne
/// publie ça ») ; la conséquence sur le bouton, elle, restait ouverte.
///
/// Le gate est un prédicat DÉDIÉ, et c'est le cœur de ces tests :
/// `composerHasContent` sert QUATRE autres consommateurs (alerte de sortie, D1,
/// E1, purge des fantômes) dont l'arbitrage est déjà tranché — l'élargir pour
/// laisser passer la story « fond + musique » les élargirait tous, et
/// rouvrirait la porte du fond auto-appliqué. `canPublish` s'ajoute à côté,
/// posé sur le seul bouton Publier.
@MainActor
final class StoryComposerPublishGateTests: XCTestCase {

    // MARK: - La règle pure

    func test_canPublish_withNeitherContentNorAudio_isRefused() {
        XCTAssertFalse(
            StoryComposerView.canPublish(hasContent: false, carriesAudio: false),
            "Une page blanche ne part pas : c'est l'arbitrage S2, appliqué au bouton."
        )
    }

    func test_canPublish_withContent_isAllowed() {
        XCTAssertTrue(StoryComposerView.canPublish(hasContent: true, carriesAudio: false))
    }

    /// Le cas qui interdit un `.disabled(!composerHasContent)` naïf : une story
    /// « fond + musique » ne porte AUCUN contenu visuel au sens de S2, et reste
    /// pourtant une story à part entière — l'audio EST sa matière narrative.
    func test_canPublish_withAudioOnly_isAllowed() {
        XCTAssertTrue(
            StoryComposerView.canPublish(hasContent: false, carriesAudio: true),
            "Fond + musique : rien de visuel, tout d'audible. Le gate doit la laisser passer."
        )
    }

    // MARK: - Ce que « porte de l'audio » veut dire

    func test_composerCarriesAudio_withNothing_isFalse() {
        XCTAssertFalse(
            StoryComposerView.composerCarriesAudio(
                slides: [StorySlide()],
                currentEffects: StoryEffects(),
                backgroundAudioId: nil)
        )
    }

    /// Le fond sonore en cours de sélection vit dans un `@State` de la vue et
    /// n'est rabattu sur `effects.backgroundAudioId` qu'au hand-off de
    /// publication : le lire depuis les slides seules manquerait le cas le plus
    /// courant — celui où l'utilisateur vient juste de choisir sa musique.
    func test_composerCarriesAudio_withAFreshlyPickedBackgroundSound_isTrue() {
        XCTAssertTrue(
            StoryComposerView.composerCarriesAudio(
                slides: [StorySlide()],
                currentEffects: StoryEffects(),
                backgroundAudioId: "sound-42")
        )
    }

    /// Un son EMPRUNTÉ est un lecteur posé sur le canvas (`audioPlayerObjects`),
    /// pas un fond : deux champs distincts, une seule question posée à l'auteur.
    func test_composerCarriesAudio_withABorrowedSoundOnTheCurrentSlide_isTrue() {
        var effects = StoryEffects()
        effects.audioPlayerObjects = [
            StoryAudioPlayerObject(id: "player-1", postMediaId: "media-1")
        ]

        XCTAssertTrue(
            StoryComposerView.composerCarriesAudio(
                slides: [StorySlide()],
                currentEffects: effects,
                backgroundAudioId: nil)
        )
    }

    /// La slide COURANTE n'est pas la seule : un son posé sur la slide 2 rend la
    /// story publiable même si la slide regardée est vierge.
    func test_composerCarriesAudio_withAudioOnAnotherSlide_isTrue() {
        var second = StorySlide()
        second.effects.backgroundAudioId = "sound-7"

        XCTAssertTrue(
            StoryComposerView.composerCarriesAudio(
                slides: [StorySlide(), second],
                currentEffects: StoryEffects(),
                backgroundAudioId: nil)
        )
    }

    // MARK: - Le texte vide n'arme rien

    /// La coquille posée par `addText()` pour donner une cible à l'éditeur ne
    /// doit ni activer le bouton Publier, ni armer l'alerte de sortie — même
    /// règle, même trim, que la protection du brouillon (`carriesRealText`).
    func test_anEmptyTextObject_armsNeitherThePublishButtonNorTheExitAlert() throws {
        let viewModel = StoryComposerViewModel()
        _ = try XCTUnwrap(viewModel.addText())

        let hasContent = StoryComposerView.composerHasContent(
            slides: viewModel.slides,
            slideImageIds: [],
            hasStickerObjects: false,
            hasDrawingData: false,
            hasDrawingStrokes: false
        )
        let carriesAudio = StoryComposerView.composerCarriesAudio(
            slides: viewModel.slides,
            currentEffects: viewModel.currentEffects,
            backgroundAudioId: nil
        )

        XCTAssertFalse(
            hasContent,
            "L'alerte de sortie se déclenche sur ce prédicat : elle demanderait à confirmer l'abandon de rien."
        )
        XCTAssertFalse(
            StoryComposerView.canPublish(hasContent: hasContent, carriesAudio: carriesAudio),
            "Et le bouton Publier reste inerte tant qu'aucun caractère n'est saisi."
        )
    }

    func test_aSingleTypedCharacter_armsThePublishButton() throws {
        let viewModel = StoryComposerViewModel()
        let text = try XCTUnwrap(viewModel.addText())
        var effects = viewModel.currentEffects
        let index = try XCTUnwrap(effects.textObjects.firstIndex { $0.id == text.id })
        effects.textObjects[index].text = "A"
        viewModel.currentEffects = effects

        XCTAssertTrue(
            StoryComposerView.canPublish(
                hasContent: StoryComposerView.composerHasContent(
                    slides: viewModel.slides,
                    slideImageIds: [],
                    hasStickerObjects: false,
                    hasDrawingData: false,
                    hasDrawingStrokes: false),
                carriesAudio: false)
        )
    }

    // MARK: - Protection de sortie (la croix)

    /// Le trou que `canPublish` avait ouvert par contraste. Le bouton Publier
    /// accepte la story « fond + musique » ; la sortie par le X, elle, restait
    /// sur `composerHasContent` seul — rien de VISUEL, donc « rien à perdre »,
    /// donc fermeture immédiate et muette. Une musique choisie, un fond posé, et
    /// tout part au premier tap sur la croix, sans un mot.
    func test_handleDismiss_audioOnlyComposition_asksBeforeQuitting() {
        XCTAssertEqual(
            StoryComposerView.exitPrompt(hasContent: false, carriesAudio: true),
            .confirm(offersSave: true),
            "Ce que le bouton Publier accepte comme story, la sortie doit le protéger."
        )
    }

    /// La feuille peut promettre ce que le brouillon SAIT tenir : la prémisse
    /// « rabattu au seul hand-off de publication » est caduque depuis que
    /// `persistDraft()` passe par `syncCurrentSlideEffects()` → `mergeEffects`
    /// (copie intégrale, `backgroundAudioId` compris, écrite dans la slide via
    /// le proxy `currentEffects`) et que `restoreCanvas` re-sème
    /// `selectedAudioId` depuis les effets restaurés. Sans « Sauvegarder »,
    /// la seule issue d'une session audio-seule était DESTRUCTIVE.
    func test_exitDialog_audioOnly_offersTheSaveAction() {
        XCTAssertTrue(
            StoryComposerView.exitPrompt(hasContent: false, carriesAudio: true).offersSave,
            "Le store retient l'audio rabattu (mergeEffects) et la reprise le restaure — la feuille doit l'offrir."
        )
    }

    func test_exitPrompt_withVisualContent_offersToSaveTheDraft() {
        XCTAssertEqual(
            StoryComposerView.exitPrompt(hasContent: true, carriesAudio: false),
            .confirm(offersSave: true),
            "Ce que le brouillon sait retenir, la feuille peut le proposer."
        )
    }

    func test_exitPrompt_withAnEmptyComposer_leavesWithoutAsking() {
        XCTAssertEqual(
            StoryComposerView.exitPrompt(hasContent: false, carriesAudio: false),
            .leaveSilently,
            "Fermer une page blanche n'a rien à confirmer — c'est la sortie par défaut."
        )
    }

    // MARK: - Gardes de source

    /// L'autosave doit compter l'audio comme travail persistable : sans lui,
    /// une session audio-seule n'écrit jamais rien et « Sauvegarder » depuis la
    /// feuille de sortie resterait la SEULE écriture — un crash ou un passage
    /// en background perdrait la composition.
    func test_theAutosaveGateCountsAudioAsPersistableWork() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var mayOverwriteStoredDraft:", in: code))

        XCTAssertTrue(
            body.contains("composerHasContent || composerCarriesAudio"),
            "Le gate d'autosave doit élargir le terme de contenu à l'audio — le store sait le retenir."
        )
    }

    /// Directive 2026-08-02 (point c) : une story mise en ÉDITION revient en
    /// brouillon. Le terme `isEditingExistingStory` qui éteignait l'autosave
    /// en édition a été retiré — le brouillon d'édition porte `editingPostId`
    /// et sa réouverture rouvre le mode édition, la prémisse « restauré comme
    /// une NOUVELLE story » ne tient plus. Cette garde interdit la
    /// réintroduction du terme.
    func test_theAutosaveGateNoLongerShutsOffForEditSessions() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var mayOverwriteStoredDraft:", in: code))

        XCTAssertFalse(
            body.contains("isEditingExistingStory"),
            "L'édition autosauvegarde comme toute session : son brouillon porte editingPostId."
        )
    }

    /// Le gate ne vaut que s'il est POSÉ. Ancré sur le corps de `publishButton`
    /// et sur lui seul : compter `.disabled(` dans le fichier entier dirait la
    /// mauvaise chose (le header en porte plusieurs).
    func test_thePublishButtonCarriesTheContentGate() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+TopBar.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var publishButton:", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "canPublish", in: body), 1,
            "Le bouton Publier lit le prédicat dédié — une fois, dans son `.disabled`."
        )
    }

    /// La contrepartie, et la vraie raison d'un prédicat séparé : le gate du
    /// BOUTON ne fuit dans aucun autre consommateur.
    ///
    /// La sortie par le X protège bien la story « fond + musique » — mais par sa
    /// règle à elle (`exitPrompt`), qui décide EN PLUS de ce que la feuille a le
    /// droit de proposer. Adopter `canPublish` ici les soudait : un jour où le
    /// bouton accepterait un cas de plus, la feuille offrirait de le sauvegarder
    /// sans que le brouillon sache le retenir.
    ///
    /// D1 (auto-save au passage en background), E1 (autosave débouncé) et la
    /// purge des fantômes, eux, restent sur `composerHasContent` NU : l'arbitrage
    /// S2 y est tranché — le fond auto-appliqué ne vaut pas un brouillon.
    func test_theContentGateNeverLeaksIntoTheOtherConsumers() throws {
        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let dismiss = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: publication))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "canPublish", in: dismiss), 0,
            "L'alerte de sortie a sa propre règle, qui porte AUSSI l'offre de sauvegarde."
        )

        let syncRestore = try ComposerSourceGuard.source("StoryComposerView+SyncRestore.swift")
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "canPublish", in: syncRestore), 0,
            "D1, E1 et la purge des fantômes n'ont pas à connaître le gate du bouton."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "exitPrompt", in: syncRestore), 0,
            "…ni la règle de sortie : leur arbitrage S2 se lit sur `composerHasContent` seul."
        )
    }

    /// **Ce test a été RETOURNÉ le 2026-08-23 (C6b), pas assoupli.**
    ///
    /// Il arbitrait DEUX lectures de la règle de sortie : la garde de
    /// `handleDismiss` et le bouton « Sauvegarder » du dialogue. Depuis que la
    /// règle produit M10 s'applique — *zéro question à la sortie* — le dialogue
    /// n'existe plus : fermer sauvegarde, silencieusement. La seconde moitié de
    /// l'ancien invariant n'a plus de surface à arbitrer.
    ///
    /// L'invariant devient donc plus STRICT, pas plus lâche : la règle n'a
    /// qu'UN lecteur, et aucune feuille ne la relit pour poser une question.
    /// La garde rougit à la RÉINTRODUCTION d'un dialogue de sortie — le geste
    /// exact que M10 interdit — et non à la disparition d'un fichier, dont
    /// `ComposerSourceGuard.source` répond en jetant.
    func test_theExitRuleHasASingleReader_andNoDialogReadsIt() throws {
        let publication = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let dismiss = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "func handleDismiss()", in: publication))
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "exitPrompt", in: dismiss), 1,
            "La sortie lit la règle une fois, et c'est le SEUL lecteur qui reste."
        )

        let view = try ComposerSourceGuard.source("StoryComposerView.swift")
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "exitPrompt", in: view), 0,
            "Aucune feuille ne relit la règle de sortie : la question a disparu (M10)."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "confirmationDialog", in: view), 0,
            "…et aucun dialogue de confirmation ne revient sur le chemin de sortie."
        )
    }

    // MARK: - V3-1 — publier suppose de la matière ET un publieur

    /// La délégation de chrome (`.host`) retire la flèche de la barre du SDK.
    /// Elle ouvre donc un cas que le gate de contenu ne décrit pas : une
    /// composition pleine, dans une barre sans bouton, et AUCUN déclencheur
    /// armé pour la faire partir. Le symptôme, sinon, est le pire qui soit —
    /// un bouton d'hôte qui ne fait rien, sans erreur ni trace.
    func test_aDelegatedChromeWithoutATrigger_isNotPublishable() {
        XCTAssertFalse(
            ComposerChromeOwner.host.hasPublisher(triggerIsArmed: false),
            "Personne ne publie : le composer doit le DIRE, pour que le meuble n'offre pas la commande (loi 4)."
        )
    }

    func test_aDelegatedChromeWithAnArmedTrigger_isPublishable() {
        XCTAssertTrue(ComposerChromeOwner.host.hasPublisher(triggerIsArmed: true))
    }

    /// L'atelier autonome, lui, n'a jamais eu de télécommande à armer : son
    /// publieur est la flèche de sa propre barre. Lier son gate à un
    /// déclencheur externe aurait éteint le bouton des quatre appelants
    /// existants.
    func test_theAtelier_alwaysHasItsOwnPublisher() {
        XCTAssertTrue(ComposerChromeOwner.atelier.hasPublisher(triggerIsArmed: false))
    }

    /// Et le publieur ne remplace pas la matière : un déclencheur armé ne
    /// publie toujours pas une page blanche (arbitrage S2, intact).
    func test_anArmedPublisherStillDoesNotPublishABlankPage() {
        XCTAssertFalse(StoryComposerView.canPublish(hasContent: false, carriesAudio: false))
    }

    /// Les deux termes doivent être COMPOSÉS là où le composer répond
    /// « publiable ? ». Sans cette garde, la règle de publieur existerait,
    /// serait verte, et ne serait lue par personne.
    func test_theComposerPublishabilityComposesContentAndPublisher() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView+Publication.swift")
        let body = try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var canPublish: Bool", in: code))

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "Self.canPublish(hasContent:", in: body), 1,
            "Le gate de contenu reste le premier terme."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "hasPublisher(triggerIsArmed:", in: body), 1,
            "…et le second demande s'il existe quelqu'un pour l'envoyer."
        )
    }
}
