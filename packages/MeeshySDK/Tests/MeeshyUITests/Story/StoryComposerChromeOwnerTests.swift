import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// V3-1 — l'atelier du SDK sait DÉLÉGUER son chrome de publication, et expose
/// le déclenchement que le meuble app-side n'avait aucun moyen d'atteindre.
///
/// Ce que ce lot lève, mot pour mot, est le blocage consigné dans
/// `MeeshyComposerHost` : « l'unique publieur du composer est la barre du SDK
/// […] tout cela vit dans l'état privé de `StoryComposerView`, hors d'atteinte
/// du meuble ». Le socle NOMMAIT la publication sans la piloter, et basculer
/// les racines dessus aurait montré deux barres dont une inerte.
///
/// Deux règles, deux façons de les éprouver :
///
/// 1. **Ce que la barre assemble** est un prédicat PUR (`assembles(_:)`) : la
///    barre haute vit dans un `body` SwiftUI que XCTest ne sait pas monter
///    (précédent `StoryComposerView_ShouldShowEmptyStateLargePickerTests`).
///    Le prédicat se teste directement ; une garde de source vérifie ENSUITE
///    que la barre le consulte réellement pour chacune des trois commandes —
///    sans quoi la règle serait vraie et débranchée.
/// 2. **Le déclencheur** est une télécommande armée par l'atelier avec sa
///    PROPRE méthode de publication. Elle se teste sans hôte : c'est un objet
///    ordinaire, et le loquet qu'elle doit respecter est lui aussi une règle
///    pure (`acceptsPublishRequest`).
@MainActor
final class StoryComposerChromeOwnerTests: XCTestCase {

    // MARK: - a) En `.host`, les trois commandes de publication sont ABSENTES

    func test_aDelegatedChrome_assemblesNeitherPublishNorPreviewNorAudience() {
        let owner = ComposerChromeOwner.host

        XCTAssertFalse(owner.assembles(.publish),
                       "Le meuble peint sa propre flèche : deux publieurs à l'écran, dont un inerte.")
        XCTAssertFalse(owner.assembles(.preview),
                       "L'œil du socle EST l'aperçu (loi 6) — celui de la barre ferait doublon.")
        XCTAssertFalse(owner.assembles(.audience),
                       "L'audience se choisit dans le socle : un second sélecteur serait une seconde source.")
    }

    /// Le ⋯ n'est pas une commande de publication : il outille la composition
    /// (transitions, timeline, brouillon, purge des slides), que le meuble ne
    /// reprend pas. Le retirer aurait fait de `.host` un atelier amputé.
    func test_aDelegatedChrome_keepsTheCompositionOverflow() {
        XCTAssertTrue(ComposerChromeOwner.host.assembles(.overflow))
    }

    // MARK: - b) En `.atelier` (défaut), rien ne bouge

    func test_theAtelier_assemblesEveryControl() {
        for control in ComposerTopBarControl.allCases {
            XCTAssertTrue(
                ComposerChromeOwner.atelier.assembles(control),
                "L'atelier autonome reste autonome : « \(control) » doit survivre à la délégation."
            )
        }
    }

    /// La non-régression des quatre appelants existants tient à UNE chose : la
    /// valeur par défaut. Sans elle, `StoryTrayView`, `StoryTrayActions`,
    /// `StoryViewerView` et `MeeshyComposerHost` cessent tous de compiler.
    func test_bothPublicInitializers_defaultToTheAtelier_andToNoTrigger() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "chromeOwner: ComposerChromeOwner = .atelier", in: code), 2,
            "Les DEUX init publics portent le défaut : un appelant qui ne sait rien du meuble garde sa barre."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "publishTrigger: ComposerPublishTrigger? = nil", in: code), 2,
            "…et n'a aucune télécommande à fournir."
        )
    }

    // MARK: - La barre CONSULTE la règle (sinon la règle est vraie et morte)

    private func topBarBody() throws -> String {
        let code = try ComposerSourceGuard.source("StoryComposerView+TopBar.swift")
        return try XCTUnwrap(
            ComposerSourceGuard.functionBody(named: "var topBar: some View", in: code),
            "topBar introuvable dans StoryComposerView+TopBar.swift"
        )
    }

    func test_theTopBarGatesEachPublicationControlOnTheChromeOwner() throws {
        let body = try topBarBody()

        for (control, view) in [("audience", "visibilityMenu"),
                                ("preview", "previewButton"),
                                ("publish", "publishButton")] {
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: "chromeOwner.assembles(.\(control))", in: body), 1,
                "« \(view) » doit être assemblé sous la règle, une fois — sinon `.host` le peint quand même."
            )
            XCTAssertEqual(
                ComposerSourceGuard.occurrences(of: view, in: body), 1,
                "…et n'apparaître qu'à ce seul endroit de la rangée."
            )
        }
    }

    /// Loi 4 du composer : un format ou un outil NON OFFERT est ABSENT de
    /// l'interface, jamais grisé ni rendu transparent. La rangée n'a donc ni
    /// `.disabled(` ni `.opacity(` à elle : le seul `.disabled(` du chrome de
    /// publication vit dans le corps de `publishButton`, où il porte le gate de
    /// contenu (`StoryComposerPublishGateTests`), pas la délégation.
    func test_theDelegatedControlsAreAbsent_neverDisabledNorFadedOut() throws {
        let body = try topBarBody()

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: ".disabled(", in: body), 0,
            "Une commande reprise par le meuble sort de la rangée ; elle n'y reste pas grisée."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: ".opacity(", in: body), 0,
            "…ni masquée par transparence, qui laisse une cible tactile invisible."
        )
    }

    // MARK: - c) Le déclencheur : UN publishAllSlides, loquet respecté

    func test_anUnarmedTrigger_isSilentAndSaysSo() {
        let trigger = ComposerPublishTrigger()

        XCTAssertFalse(trigger.isArmed,
                       "Un meuble monté avant l'atelier doit pouvoir LIRE qu'il n'a personne pour publier.")
        trigger.requestPublish()

        XCTAssertFalse(trigger.isArmed,
                       "Presser n'arme pas : seul l'atelier arme, avec sa propre publication.")
    }

    func test_anArmedTrigger_runsThePublicationOnce() {
        let trigger = ComposerPublishTrigger()
        var calls = 0
        trigger.arm { calls += 1 }

        XCTAssertTrue(trigger.isArmed)
        trigger.requestPublish()

        XCTAssertEqual(calls, 1, "Une pression, une exécution de `publishAllSlides()`.")
    }

    /// Le cœur de la contrainte « UN SEUL PUBLIEUR ». Le déclencheur n'est PAS
    /// à un coup — c'est `publishAllSlides()` qui tranche, par le loquet qu'il
    /// pose sur un hand-off ACCEPTÉ. La règle du loquet est ici la VRAIE
    /// (`acceptsPublishRequest`), pas une imitation : deux pressions ne
    /// publient qu'une fois.
    func test_twoPressesPublishOnlyOnce_theLatchHolds() {
        let trigger = ComposerPublishTrigger()
        var didHandOffPublish = false
        var publications = 0
        trigger.arm {
            guard StoryComposerView.acceptsPublishRequest(didHandOffPublish: didHandOffPublish) else { return }
            publications += 1
            didHandOffPublish = true
        }

        trigger.requestPublish()
        trigger.requestPublish()

        XCTAssertEqual(publications, 1,
                       "Le second tap pendant l'animation de fermeture ne re-publie pas la même story.")
    }

    /// Et la contrepartie, qui interdit de mettre le loquet DANS la
    /// télécommande : un hand-off REFUSÉ (édition hors-ligne, surface qui ne
    /// ferme rien) ne pose pas le loquet, et la publication doit rester
    /// tentable — une télécommande à un coup condamnerait ces surfaces.
    func test_aRefusedHandoff_leavesTheTriggerUsable() {
        let trigger = ComposerPublishTrigger()
        var attempts = 0
        let didHandOffPublish = false
        trigger.arm {
            guard StoryComposerView.acceptsPublishRequest(didHandOffPublish: didHandOffPublish) else { return }
            attempts += 1
        }

        trigger.requestPublish()
        trigger.requestPublish()

        XCTAssertEqual(attempts, 2, "Refuser le hand-off ne condamne pas le bouton pour la session.")
    }

    func test_aDisarmedTrigger_stopsFiringIntoADismissedComposer() {
        let trigger = ComposerPublishTrigger()
        var calls = 0
        trigger.arm { calls += 1 }
        trigger.disarm()

        trigger.requestPublish()

        XCTAssertFalse(trigger.isArmed)
        XCTAssertEqual(calls, 0, "Une télécommande qui survit à sa vue publierait l'état d'un composer disparu.")
    }

    // MARK: - Un seul publieur, prouvé sur le code

    /// L'atelier arme la télécommande avec `publishAllSlides()` — la méthode
    /// qui flush la timeline ouverte, rabat les effets du canvas sur la
    /// diapositive courante et lit la visibilité tenue par l'atelier. Passer
    /// autre chose serait exactement le second chemin d'envoi que ce lot doit
    /// éviter.
    func test_theTriggerIsArmedWithPublishAllSlides_andDisarmedOnTeardown() throws {
        let code = try ComposerSourceGuard.source("StoryComposerView.swift")

        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "publishTrigger?.arm { publishAllSlides() }", in: code), 1,
            "Le corps du déclencheur EST la publication de l'atelier, une fois, et rien d'autre."
        )
        XCTAssertEqual(
            ComposerSourceGuard.occurrences(of: "publishTrigger?.disarm()", in: code), 1,
            "Le démontage rend la télécommande muette."
        )
    }

    /// La garde qui tient toute la contrainte : le callback de hand-off n'a
    /// qu'UN site d'appel dans tout `Sources/MeeshyUI/Story/`. Balayer le
    /// dossier entier plutôt que de nommer un fichier est délibéré — un second
    /// chemin d'envoi s'écrirait dans une extension voisine, hors de portée
    /// d'une garde qui nomme sa cible.
    func test_theHandoffCallbackKeepsASingleCallSiteInTheWholeComposer() throws {
        let sites: [(path: String, count: Int)] = try ComposerSourceGuard.allStorySources()
            .map { source in
                (path: source.path,
                 count: ComposerSourceGuard.occurrences(of: "onPublishAllInBackground(", in: source.code))
            }
            .filter { $0.count > 0 }

        XCTAssertEqual(
            sites.map(\.path), ["StoryComposerView+Publication.swift"],
            "Un déclencheur externe ne recompose rien : il entre dans publishAllSlides(), qui reste le seul appelant."
        )
        XCTAssertEqual(sites.first?.count, 1)
    }
}
