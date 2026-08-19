import XCTest
@testable import Meeshy

/// Directive user 2026-07-10 : le set de boutons du rail d'actions du viewer
/// est calculé D'UN BLOC avant affichage (payload feed, compteurs inclus) et
/// figé pendant le slide. Ces tests pinnent la règle pure de résolution.
final class StoryActionRailPlanTests: XCTestCase {

    func test_resolve_ownStory_showsViewsExportForward_hidesReactReplyRepost() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: true,
            canReply: true,
            isPublicStory: true,
            hasAudibleSound: false,
            commentCount: 0,
            hasTranslatableContent: true
        )

        XCTAssertTrue(plan.showsViews)
        XCTAssertTrue(plan.showsExport)
        XCTAssertTrue(plan.showsForward)
        XCTAssertFalse(plan.showsReact)
        XCTAssertFalse(plan.showsReply)
        XCTAssertFalse(plan.showsRepost)
    }

    /// Changement 2026-07-25 : l'auteur voit AUSSI le bouton traductions. Il
    /// choisit déjà la langue de son export MP4 ; lui refuser l'exploration des
    /// langues dans le viewer était une asymétrie sans justification produit.
    func test_resolve_translations_visibleToAuthorAndReaderAlike() {
        let author = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: true
        )
        let reader = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: true
        )

        XCTAssertTrue(author.showsTranslations)
        XCTAssertTrue(reader.showsTranslations)
    }

    /// Sans texte ni audio à traduire, le bouton reste absent pour tout le monde.
    func test_resolve_translations_hiddenWithoutTranslatableContent() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: true,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )

        XCTAssertFalse(plan.showsTranslations)
    }

    func test_resolve_othersPublicStory_showsReactReplyForwardRepostTranslations() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false,
            canReply: true,
            isPublicStory: true,
            hasAudibleSound: true,
            commentCount: 3,
            hasTranslatableContent: true
        )

        XCTAssertTrue(plan.showsReact)
        XCTAssertTrue(plan.showsReply)
        XCTAssertTrue(plan.showsForward)
        XCTAssertTrue(plan.showsRepost)
        XCTAssertTrue(plan.showsSound)
        XCTAssertTrue(plan.showsComments)
        XCTAssertTrue(plan.showsTranslations)
        XCTAssertFalse(plan.showsViews)
        XCTAssertFalse(plan.showsExport)
    }

    /// D1 (arbitrage user 2026-08-19) — ce témoin exigeait l'INVERSE : le
    /// bouton de republication était caché sur toute story non publique. La
    /// règle « même audience ou plus restreinte » ne pouvait donc jamais
    /// s'appliquer, faute d'affordance sur les stories qu'elle concerne. C'est
    /// désormais `StoryRepostAudience` (miroir du serveur) qui borne le CHOIX
    /// d'audience ; l'appartenance au rail ne dépend plus que de « ce n'est pas
    /// ma story ».
    func test_resolve_othersPrivateStory_stillOffersRepost_audienceLawBoundsTheChoice() {
        let plan = StoryActionRailPlan.resolve(
            isOwnStory: false,
            canReply: false,
            isPublicStory: false,
            hasAudibleSound: false,
            commentCount: 0,
            hasTranslatableContent: false
        )

        XCTAssertTrue(plan.showsRepost)
        XCTAssertFalse(plan.showsReply)
        XCTAssertFalse(plan.showsViews)
        XCTAssertFalse(plan.showsExport)
    }

    func test_resolve_commentsMembership_decidedByEntryCount_only() {
        let without = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )
        let with = StoryActionRailPlan.resolve(
            isOwnStory: false, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 1, hasTranslatableContent: false
        )

        XCTAssertFalse(without.showsComments)
        XCTAssertTrue(with.showsComments)
    }

    func test_resolve_soundMembership_followsAudibleSound() {
        let silent = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: false,
            hasAudibleSound: false, commentCount: 0, hasTranslatableContent: false
        )
        let audible = StoryActionRailPlan.resolve(
            isOwnStory: true, canReply: false, isPublicStory: false,
            hasAudibleSound: true, commentCount: 0, hasTranslatableContent: false
        )

        XCTAssertFalse(silent.showsSound)
        XCTAssertTrue(audible.showsSound)
    }
}

// MARK: - Ré-évaluation du rail à l'arrivée du probe audio

/// Le rail est figé à l'entrée du slide (directive 2026-07-10), mais la présence
/// d'une piste audio dans une vidéo est établie par un probe ASYNCHRONE qui
/// conclut souvent après ce gel. Sans ré-évaluation, une story sonore restait
/// sans bouton son pour toute sa lecture (constaté 2026-07-25).
extension StoryActionRailPlanTests {

    func test_sidebar_refreezesRailWhenSoundBecomesAvailable() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: storyHasAudibleSound)"),
            "le rail doit être ré-évalué quand le probe audio conclut")
        XCTAssertTrue(
            source.contains("guard !wasAudible, isAudible else { return }"),
            "la ré-évaluation doit rester à sens unique : un bouton n'est jamais retiré en cours de lecture")
    }
}

// MARK: - Fraîcheur de la membership commentaires (Fix B — bouton commentaires manquant sur entrée notification)

/// `liveRailPlan` calcule `showsComments` — la MEMBERSHIP du bouton
/// commentaires, figée au premier `.onAppear` (voir `frozenRailPlan`) —
/// depuis `currentStory?.commentCount`, jamais depuis le miroir `@State
/// storyCommentCount`. Rien ne garantit structurellement que le `.onAppear`
/// ancêtre qui seed `storyCommentCount` (via `startTimer()`) s'exécute
/// avant le `.onAppear` de `StoryActionSidebarView`, descendant profond du
/// viewer — lire le payload directement élimine le risque par construction,
/// quel que soit l'ordre réel. Le LABEL affiché reste sur
/// `storyCommentCount` (compteur vivant, mis à jour en temps réel par les
/// réconciliations post-gel) : cette garde vérifie les DEUX moitiés pour ne
/// pas régresser silencieusement l'une en corrigeant l'autre.
extension StoryActionRailPlanTests {

    func test_liveRailPlan_membershipReadsPayloadCommentCount_labelStaysOnLiveState() throws {
        let source = try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"),
            encoding: .utf8
        )

        XCTAssertTrue(
            source.contains("commentCount: currentStory?.commentCount"),
            "showsComments doit être calculé depuis le payload currentStory, jamais depuis storyCommentCount seul")
        XCTAssertTrue(
            source.contains(#"label: "\(storyCommentCount)""#),
            "le label affiché sur le bouton doit rester le compteur vivant storyCommentCount, pas le payload figé")
    }
}

// MARK: - Réconciliation du compteur commentaires sur ouverture NORMALE (Fix C — cas général)

/// Fix B (ci-dessus) ne couvre que le chemin NOTIFICATION : le payload
/// `currentStory?.commentCount` y est déjà rafraîchi AVANT le premier montage
/// (`StoryViewModel.refreshFromCachedPostIfAvailable` +
/// `StoryViewerContainer.isGroupReadyToPresent`), donc le gel initial de
/// `liveRailPlan` voit déjà la bonne valeur. Une story ouverte NORMALEMENT
/// (tray, profil, feed — aucun postId de notification connu) n'a AUCUN de ces
/// deux verrous : si le tray local était périmé (`commentCount` à 0 alors que
/// le serveur en a depuis), le rail se gelait sans le bouton commentaires et
/// ne le montrait JAMAIS pour toute la lecture du slide — vérifié visuellement
/// après le fix précédent.
///
/// Le remède réutilise la réconciliation d'ouverture déjà existante
/// (`loadStoryCommentCount()`, +Content.swift : cache commentaires local puis,
/// si toujours à 0, une requête réseau bornée ~400ms, DÉJÀ appelée sur CHAQUE
/// ouverture de slide, notification ou non) — jusqu'ici elle ne mettait à jour
/// que le LABEL (`storyCommentCount`), jamais la MEMBERSHIP figée. Ces tests
/// pinnent le canal dédié (`storyCommentCountReconciledPulse`) qui relie enfin
/// cette réconciliation au rail, sans jamais laisser une activité TEMPS RÉEL
/// (nouveau commentaire posté pendant la lecture, par soi ou par un tiers)
/// faire surgir le bouton — directive 2026-07-10 non négociable.
extension StoryActionRailPlanTests {

    private func sidebarSource() throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()   // Stories
                .deletingLastPathComponent()   // Features
                .deletingLastPathComponent()   // MeeshyTests
                .deletingLastPathComponent()   // ios
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Sidebar.swift"),
            encoding: .utf8
        )
    }

    private func contentSource() throws -> String {
        try String(
            contentsOf: URL(fileURLWithPath: #filePath)
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .deletingLastPathComponent()
                .appendingPathComponent("Meeshy/Features/Main/Views/StoryViewerView+Content.swift"),
            encoding: .utf8
        )
    }

    /// Reproduit le cas confirmé cassé : le rail doit finir par réagir à la
    /// réconciliation dédiée (pas au compteur live générique) en reconstruisant
    /// une membership avec le compteur RÉCONCILIÉ, à sens unique.
    func test_sidebar_reopensCommentsMembershipWhenOpenReconciliationTicks() throws {
        let source = try sidebarSource()

        XCTAssertTrue(
            source.contains("adaptiveOnChange(of: storyCommentCountReconciledPulse)"),
            "le rail doit être ré-évalué quand la réconciliation d'ouverture du compteur commentaires tique")
        XCTAssertTrue(
            source.contains("guard !railPlan.showsComments else { return }"),
            "la ré-évaluation doit rester à sens unique : jamais retirer un bouton déjà affiché")
        XCTAssertTrue(
            source.contains("commentCount: storyCommentCount"),
            "la membership reconstruite doit utiliser le compteur RÉCONCILIÉ (storyCommentCount), pas le payload figé")
    }

    /// La réconciliation doit rester isolée de toute activité temps réel :
    /// `sendComment` (propre composer) et le socket `comment:added` reçu
    /// pendant la lecture ne doivent JAMAIS incrémenter le canal dédié — sinon
    /// un commentaire posté par un tiers PENDANT la lecture ferait surgir le
    /// bouton, en violation directe de la directive 2026-07-10.
    func test_reconciliationPulse_neverBumpedByLiveCommentActivity() throws {
        let sidebar = try sidebarSource()
        let content = try contentSource()

        // Les deux seuls sites d'écriture du canal dédié sont les branches de
        // réconciliation d'ouverture (cache local + fallback réseau borné) —
        // jamais `sendComment`, jamais le handler socket `comment:added`.
        let pulseWriteSites = content.components(separatedBy: "storyCommentCountReconciledPulse += 1").count - 1
        XCTAssertEqual(pulseWriteSites, 2,
            "storyCommentCountReconciledPulse ne doit être incrémenté que par les DEUX branches de réconciliation de loadStoryCommentCount()")

        XCTAssertFalse(
            sidebar.contains("storyCommentCountReconciledPulse +="),
            "le rail lit le canal, il ne l'incrémente jamais")
    }
}
