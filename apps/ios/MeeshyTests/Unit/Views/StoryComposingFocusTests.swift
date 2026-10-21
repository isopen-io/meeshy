import XCTest
import MeeshySDK
import MeeshyUI
@testable import Meeshy

/// **Écrire un commentaire fait le silence autour** (#8601, demande porteur du
/// 2026-09-28 : « il faut faire disparaître les boutons et décorateurs autour
/// sauf les commentaires si affichés »).
///
/// La LOI s'éprouve par son verdict ; le CÂBLAGE par la source, couche par
/// couche — un verdict juste qu'une couche ne lit pas la laisse peinte.
final class StoryComposingFocusTests: XCTestCase {

    // MARK: - La loi

    func test_enSaisie_leChromeSEfface_memeHorsImmersion() {
        XCTAssertFalse(StoryComposingFocus.showsChrome(chromeVisible: true, isComposing: true))
    }

    func test_auRepos_leChromeSuitLImmersion() {
        XCTAssertTrue(StoryComposingFocus.showsChrome(chromeVisible: true, isComposing: false))
        XCTAssertFalse(StoryComposingFocus.showsChrome(chromeVisible: false, isComposing: false),
                       "la saisie ajoute une raison de se taire, elle n'en retire aucune")
    }

    /// Les décorations du CONTENU restent en immersion — ce n'est pas du
    /// chrome — et se taisent pendant la saisie.
    func test_lesDecorationsDuContenu_neSeTaisentQuEnSaisie() {
        XCTAssertTrue(StoryComposingFocus.showsContentDecorations(isComposing: false))
        XCTAssertFalse(StoryComposingFocus.showsContentDecorations(isComposing: true))
    }

    // MARK: - Le câblage du lecteur

    /// L'UNITÉ du canvas (couches + cadrage) : ses couches vivent dans `+Canvas+Layers`, son cadrage
    /// dans `StoryReaderCanvasLayout` — les comptes ci-dessous se font sur l'ensemble.
    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            chemin,
            alsoIncluding: chemin.hasSuffix("StoryViewerView+Canvas.swift")
                ? ["Meeshy/Features/Main/Views/StoryReaderCanvasLayout.swift"] : []))
    }

    private var canvas: String {
        get throws { try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift") }
    }

    private func occurrences(_ motif: String, in code: String) -> Int {
        code.components(separatedBy: motif).count - 1
    }

    /// En-tête (barres de progression, auteur, `ReferenceNoteRow`) et rail
    /// d'actions : le chrome, sous la conjonction.
    func test_enTeteEtRail_suiventLeChromeDeSaisie() throws {
        let code = try canvas
        XCTAssertEqual(occurrences(".storyFocusFade(readerChromeShown)", in: code), 2,
                       "l'en-tête et le rail d'actions s'effacent en saisie")
        XCTAssertFalse(code.contains(".opacity(chromeVisible ? 1 : 0)"),
                       "plus aucune couche de chrome ne lit l'immersion seule")
    }

    func test_lesVoiles_suiventLeChromeDeSaisie() throws {
        XCTAssertTrue(try canvas.contains("StoryReaderScrims(topInset: topInset, chromeVisible: readerChromeShown)"))
    }

    /// Pastilles audio, cibles de lieu, réactions en vol.
    func test_lesDecorationsDuContenu_seTaisentEnSaisie() throws {
        let code = try canvas
        XCTAssertEqual(occurrences(".storyFocusFade(readerDecorationsShown)", in: code), 3)
        XCTAssertFalse(code.contains(".allowsHitTesting(!isComposerEngaged)"),
                       "désactiver le doigt ne suffisait pas : la couche restait PEINTE")
    }

    func test_laLegende_laTranscriptionEtLaPastilleDeSon_seTaisentEnSaisie() throws {
        let code = try source("Meeshy/Features/Main/Views/StoryViewerView+CanvasCaption.swift")
        XCTAssertTrue(code.contains(".storyFocusFade(readerDecorationsShown)"))
        XCTAssertEqual(occurrences(".opacity(readerDecorationsShown ? 1 : 0)", in: code), 2)
    }

    /// **Ce qui RESTE, et c'est la moitié de la demande** : le composeur ne
    /// lit que l'immersion, et la couche des commentaires n'est touchée par
    /// aucune des deux règles.
    func test_leComposeurEtLesCommentaires_restent() throws {
        let composeur = try source("Meeshy/Features/Main/Views/StoryViewerView+CanvasComposerLayer.swift")
        XCTAssertTrue(composeur.contains(".opacity(chromeVisible ? 1 : 0)"))
        XCTAssertFalse(composeur.contains("readerChromeShown"),
                       "le champ qu'on tape ne disparaît pas sous son propre doigt")

        let code = try canvas
        let commentaires = try XCTUnwrap(code.range(of: "makeCommentsOverlay()"))
        let suite = code[commentaires.upperBound...].prefix(600)
        XCTAssertFalse(suite.contains("storyFocusFade"),
                       "les commentaires affichés restent visibles pendant qu'on écrit")
    }
}

/// **Lire les commentaires floute la scène ; écrire la RÉDUIT au-dessus du
/// composeur** (#8642, demande porteur du 2026-09-29 : « floute un peu toute la
/// scène […] réduire la scène pour que ce soit visible entièrement au-dessus du
/// Universal Composer bar »).
final class StorySceneFocusTests: XCTestCase {

    private let iPhone = CGSize(width: 402, height: 874)
    private let topInset: CGFloat = 62

    private func resting(_ state: StoryCanvasFraming.Presentation = .carded) -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(viewport: iPhone, headerInset: topInset + 72, bottomInset: 64,
                                 sideInset: 8, state: state,
                                 cardedCornerRadius: SceneShape.cardedCornerRadius,
                                 verticalAlignment: .center, canvasRatio: SceneShape.aspect)
    }

    /// Les bords haut et bas de la carte, tels que le lecteur la pose : cadre
    /// 9:16 ajusté au viewport, mis à l'échelle autour de son centre, décalé.
    private func edges(_ result: StoryCanvasFraming.Result) -> (top: CGFloat, bottom: CGFloat) {
        let fit = CanvasGeometry.aspectFitSize(in: iPhone, ratio: SceneShape.aspect)
        let centre = iPhone.height / 2 + result.offset.height
        let half = fit.height * result.scale / 2
        return (centre - half, centre + half)
    }

    // MARK: - Lire les commentaires : un flou léger

    func test_lesCommentairesOuverts_floutentUnPeuLaScene() {
        let rayon = StorySceneFocus.blurRadius(commentsOpen: true)
        XCTAssertGreaterThan(rayon, 0)
        XCTAssertLessThanOrEqual(rayon, 10, "« un peu » : la scène se devine encore sous les commentaires")
        XCTAssertEqual(StorySceneFocus.blurRadius(commentsOpen: false), 0)
    }

    /// Lire les commentaires tait aussi les décorations du contenu (légende,
    /// pastilles) : elles se posent au même bas d'écran que la liste.
    func test_lesCommentairesOuverts_taisentLesDecorations() {
        XCTAssertFalse(StorySceneFocus.showsContentDecorations(isComposing: false, commentsOpen: true))
        XCTAssertFalse(StorySceneFocus.showsContentDecorations(isComposing: true, commentsOpen: false))
        XCTAssertTrue(StorySceneFocus.showsContentDecorations(isComposing: false, commentsOpen: false))
    }

    func test_reduceMotion_neJouePasLeRecadrage() {
        XCTAssertNil(StorySceneFocus.reframeAnimation(reduceMotion: true))
        XCTAssertNotNil(StorySceneFocus.reframeAnimation(reduceMotion: false))
    }

    // MARK: - Écrire : la scène se réduit au-dessus du composeur

    func test_enSaisie_laScene_estUneCarte_memeEnPleinEcran() {
        XCTAssertEqual(StorySceneFocus.presentation(resting: .immersive, isComposing: true), .carded)
        XCTAssertEqual(StorySceneFocus.presentation(resting: .free, isComposing: true), .carded)
        XCTAssertEqual(StorySceneFocus.presentation(resting: .immersive, isComposing: false), .immersive)
        XCTAssertEqual(StorySceneFocus.presentation(resting: .free, isComposing: false), .free)
    }

    func test_auRepos_leCadrageEstCeluiDuLecteur() {
        XCTAssertEqual(StorySceneFocus.framingInput(resting: resting(), topInset: topInset, composerReserve: nil),
                       resting())
    }

    /// Une réserve nulle (le bloc n'est pas encore mesuré) ne rétrécit rien.
    func test_uneReserveNulle_laisseLeCadrageAuRepos() {
        XCTAssertEqual(StorySceneFocus.framingInput(resting: resting(), topInset: topInset, composerReserve: 0),
                       resting())
    }

    /// Clavier (336) + plaque (64) : la scène tient ENTIÈRE entre la zone sûre
    /// et le haut de la plaque, ancrée en haut.
    func test_enSaisie_laSceneTientEntiereAuDessusDuComposeur_ancreeEnHaut() {
        let reserve: CGFloat = 400
        let reduite = StoryCanvasFraming.resolve(
            StorySceneFocus.framingInput(resting: resting(), topInset: topInset, composerReserve: reserve))
        let bords = edges(reduite)

        XCTAssertLessThan(reduite.scale, StoryCanvasFraming.resolve(resting()).scale)
        XCTAssertLessThanOrEqual(bords.bottom, iPhone.height - reserve + 0.5,
                                 "rien de la scène ne passe sous la plaque de verre")
        XCTAssertEqual(bords.top, topInset + StorySceneFocus.composingGap, accuracy: 0.5,
                       "ancrée en haut, sous la zone sûre")
        XCTAssertEqual(reduite.cornerRadius, SceneShape.cardedCornerRadius)
        XCTAssertEqual(reduite.offset.width, 0, "centrée horizontalement")
    }

    /// Plus la réserve grandit (panneau d'émojis, bannière de réponse), plus la
    /// scène rapetisse — jamais d'échelle nulle, jamais de débordement.
    func test_laReduction_suitLaHauteurDisponible() {
        let petite = StoryCanvasFraming.resolve(
            StorySceneFocus.framingInput(resting: resting(), topInset: topInset, composerReserve: 300))
        let grande = StoryCanvasFraming.resolve(
            StorySceneFocus.framingInput(resting: resting(), topInset: topInset, composerReserve: 600))
        XCTAssertGreaterThan(petite.scale, grande.scale)
        XCTAssertGreaterThan(grande.scale, 0)
        XCTAssertLessThanOrEqual(edges(grande).bottom, iPhone.height - 600 + 0.5)
    }

    // MARK: - Le câblage

    /// L'UNITÉ du canvas (couches + cadrage) : ses couches vivent dans `+Canvas+Layers`, son cadrage
    /// dans `StoryReaderCanvasLayout` — les comptes ci-dessous se font sur l'ensemble.
    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            chemin,
            alsoIncluding: chemin.hasSuffix("StoryViewerView+Canvas.swift")
                ? ["Meeshy/Features/Main/Views/StoryReaderCanvasLayout.swift"] : []))
    }

    func test_leLecteur_consulteLaLoi() throws {
        let code = try source("Meeshy/Features/Main/Views/StoryViewerView+Canvas.swift")
        XCTAssertTrue(code.contains("StorySceneFocus.presentation("), "le plein écran cède à la saisie")
        XCTAssertTrue(code.contains("StorySceneFocus.framingInput("), "le cadrage lit la réserve du composeur")
        XCTAssertGreaterThanOrEqual(
            code.components(separatedBy: ".storyCommentsReadingBlur(showCommentsOverlay)").count - 1, 3,
            "la scène, son chargeur et la carte sortante se floutent ensemble")
    }

    /// La carte anime SON recadrage — un seul site pour les trois couches, et
    /// Reduce Motion y est lu.
    func test_laCarte_animeSonRecadrage() throws {
        let code = try source("Meeshy/Features/Main/Views/StoryViewerView+ReaderCard.swift")
        XCTAssertTrue(code.contains("StorySceneFocus.reframeAnimation(reduceMotion:"))
        XCTAssertTrue(code.contains("value: resting ?? framing"),
                      "le ressort ne couvre que le cadrage de REPOS : ce que le clavier déplace suit sa transaction (#10544)")
    }

    func test_lesDecorations_lisentLesCommentairesOuverts() throws {
        let code = try source("Meeshy/Features/Main/Views/StoryComposingFocus.swift")
        XCTAssertTrue(code.contains("StorySceneFocus.showsContentDecorations(isComposing: isComposerEngaged, commentsOpen: showCommentsOverlay)"))
    }
}

/// **La scène d'une story ne bouge que si le composeur est RÉELLEMENT soulevé**
/// (#10544, décision porteur du 2026-10-13).
///
/// Le focus seul réduisait la scène et la remontait de 64 pt : avec un clavier
/// matériel, rien ne montait et le contenu se déplaçait quand même. La
/// réduction dérive désormais de ce qui soulève la plaque — clavier ou panneau
/// d'émojis — et le silence du chrome (#8601) reste, lui, sur le focus.
final class StoryKeyboardLiftTests: XCTestCase {

    private let iPhone = CGSize(width: 430, height: 932)
    private let topInset: CGFloat = 59
    /// Zone sûre (34) + respiration (20) : le retrait de la plaque au repos.
    private let repos: CGFloat = 54
    private let plaque: CGFloat = 104

    private func cadrageDeLecture() -> StoryCanvasFraming.Input {
        StoryCanvasFraming.Input(viewport: iPhone, headerInset: topInset + 72, bottomInset: 64,
                                 sideInset: 8, state: .carded,
                                 cardedCornerRadius: SceneShape.cardedCornerRadius,
                                 verticalAlignment: .center, canvasRatio: SceneShape.aspect)
    }

    // MARK: - Ce qui soulève

    func test_leClavier_souleveDeSaHauteur() {
        XCTAssertEqual(StoryKeyboardLift.lift(keyboardHeight: 336, emojiPanelHeight: 0, restingPadding: 336), 336)
    }

    /// Le panneau d'émojis prend la place du clavier : il soulève de sa hauteur
    /// plus le retrait sous lui.
    func test_lePanneauDEmojis_souleveCommeLeClavier() {
        XCTAssertEqual(StoryKeyboardLift.lift(keyboardHeight: 0, emojiPanelHeight: 302, restingPadding: 34), 336)
    }

    func test_sansClavierNiPanneau_rienNeSouleve() {
        XCTAssertEqual(StoryKeyboardLift.lift(keyboardHeight: 0, emojiPanelHeight: 0, restingPadding: repos), 0)
    }

    // MARK: - La réserve de la scène

    /// LE DÉFAUT : champ touché, clavier matériel — rien ne monte, la scène
    /// garde son cadrage de lecture.
    func test_focusSansClavier_laSceneGardeSonCadrageDeLecture() {
        let reserve = StoryKeyboardLift.sceneReserve(lift: 0, bottomPadding: repos, blockHeight: plaque)
        XCTAssertNil(reserve, "sans soulèvement, aucune réserve : le focus seul ne déplace pas la scène")
        XCTAssertEqual(
            StorySceneFocus.framingInput(resting: cadrageDeLecture(), topInset: topInset, composerReserve: reserve),
            cadrageDeLecture())
    }

    func test_clavierLeve_laSceneReserveLeClavierEtLaPlaque() {
        XCTAssertEqual(StoryKeyboardLift.sceneReserve(lift: 336, bottomPadding: 336, blockHeight: plaque), 440)
    }

    /// Sans composeur mesuré (sa propre story), le clavier d'une autre surface
    /// ne réduit rien.
    func test_sansPlaqueMesuree_aucuneReserve() {
        XCTAssertNil(StoryKeyboardLift.sceneReserve(lift: 336, bottomPadding: 336, blockHeight: nil))
        XCTAssertNil(StoryKeyboardLift.sceneReserve(lift: 336, bottomPadding: 336, blockHeight: 0))
    }

    // MARK: - Le câblage

    private func source(_ nom: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(
            "Meeshy/Features/Main/Views/" + nom,
            alsoIncluding: nom == "StoryViewerView+Canvas.swift"
                ? ["Meeshy/Features/Main/Views/StoryReaderCanvasLayout.swift"] : []))
    }

    /// La réserve de la scène et la zone des commentaires lisent le MÊME
    /// soulèvement, et plus le focus.
    func test_laCarte_deriveSaReserveDuSoulevement() throws {
        let focus = try source("StoryComposingFocus.swift")
        XCTAssertTrue(focus.contains("StoryKeyboardLift.sceneReserve(lift: composerLift(geometry: geometry)"))
        XCTAssertFalse(focus.contains("guard isComposerEngaged, let block"),
                       "le focus ne décide plus de la réduction de la scène")
        let couche = try source("StoryViewerView+CanvasComposerLayer.swift")
        XCTAssertTrue(couche.contains("StoryKeyboardLift.lift("))
        XCTAssertTrue(couche.contains("let lift = composerLift(geometry: geometry)"),
                      "la liste des commentaires suit le même soulèvement que la scène")
    }

    /// En session plein écran, c'est le soulèvement — pas le focus — qui fait
    /// de la scène une carte.
    func test_laPresentation_suitLeSoulevement_pasLeFocus() throws {
        let canvas = try source("StoryViewerView+Canvas.swift")
        XCTAssertFalse(canvas.contains("isComposing: isComposerEngaged)"))
        XCTAssertTrue(canvas.contains("isComposing: lifted)"))
        XCTAssertEqual(canvas.components(separatedBy: "resting: readerRestingFraming").count - 1, 3,
                       "les trois couches de la carte donnent leur cadrage de repos au ressort")
    }

    /// Une seule source par écran de story : la barre reçoit l'observateur du
    /// lecteur.
    func test_laBarreDeLaStory_recoitLObservateurDuLecteur() throws {
        XCTAssertTrue(try source("StoryViewerView+CanvasComposerLayer.swift")
            .contains(".environment(\\.composerHostKeyboard, keyboard)"))
    }
}
