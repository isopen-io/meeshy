import XCTest
@testable import Meeshy

/// S5 — critère A2 « aucun délai artificiel dans le chemin d'ouverture ».
///
/// Six sites de la trail partageaient la même cause (une `sheet` et une
/// présentation cible actives simultanément depuis le même hôte) et le même
/// remède fautif : `try? await Task.sleep(for: .milliseconds(350))`. Un pari
/// sur la durée d'une animation système, payé par un gel d'un tiers de seconde
/// à chaque « ouvrir / créer / modifier » depuis « Mes stories ».
///
/// Le remède déterministe est `sheet(isPresented:onDismiss:)` : les callbacks
/// de `MyStoriesView` n'exécutent plus l'action, ils l'ENREGISTRENT et referment
/// la sheet ; `onDismiss` l'exécute après la fin réelle du dismiss.
///
/// Ces trois assertions sont des gardes de SOURCE assumées : elles prouvent ce
/// qu'elles seules peuvent prouver (l'absence d'un symbole, la parité d'un
/// nombre d'occurrences), pas un comportement — le comportement du chaînage,
/// lui, est couvert par `StoryTrayActionResolverTests`.
final class StoryTraySheetChainingTests: XCTestCase {

    /// Fichier de `Meeshy/`, COMMENTAIRES RETIRÉS : les commentaires de ces
    /// fichiers NOMMENT les symboles surveillés — sans ce strip, chaque garde
    /// matcherait sa propre documentation.
    private func source(_ relativePath: String) throws -> String {
        let projectRoot = #filePath.components(separatedBy: "/MeeshyTests/").first ?? ""
        let raw = try String(
            contentsOfFile: "\(projectRoot)/Meeshy/\(relativePath)", encoding: .utf8)
        return raw
            .split(separator: "\n", omittingEmptySubsequences: false)
            .map { line -> Substring in
                guard let comment = line.range(of: "//") else { return line }
                return line[line.startIndex..<comment.lowerBound]
            }
            .joined(separator: "\n")
    }

    private func traySource() throws -> String {
        try source("Features/Main/Views/StoryTrayView.swift")
    }

    private func occurrences(of needle: String, in haystack: String) -> Int {
        haystack.components(separatedBy: needle).count - 1
    }

    /// Bloc délimité par ACCOLADES ÉQUILIBRÉES à partir de la première `{` qui
    /// suit `anchor`. Une garde qui compte sur le FICHIER entier ne peut pas dire
    /// SUR QUOI elle porte : c'est exactement ce qui rendait
    /// `test_thePinnedTrailKeepsAReachableManageEntry` vacuously verte. Chaque
    /// assertion nomme désormais sa portée.
    ///
    /// Jumeau assumé de `ComposerSourceGuard.functionBody(named:in:)`, qui vit
    /// dans le bundle de tests du SDK : les deux cibles ne partagent aucun code.
    private func block(after anchor: String, in code: String) -> String? {
        guard let start = code.range(of: anchor),
              let open = code[start.upperBound...].firstIndex(of: "{") else { return nil }
        var depth = 0
        var index = open
        while index < code.endIndex {
            if code[index] == "{" { depth += 1 }
            if code[index] == "}" {
                depth -= 1
                if depth == 0 { return String(code[code.index(after: open)..<index]) }
            }
            index = code.index(after: index)
        }
        return nil
    }

    private func pinnedTrailBandSource() throws -> String {
        try XCTUnwrap(
            block(after: "struct PinnedStoryTrailBand: View", in: try traySource()),
            "`PinnedStoryTrailBand` a disparu : la mini-trail du header replié n'existe plus."
        )
    }

    private func trayActionsSource() throws -> String {
        try source("Features/Main/Views/StoryTrayActions.swift")
    }

    func test_theStoryTrayNeverSleepsBeforePresenting() throws {
        XCTAssertEqual(
            occurrences(of: "Task.sleep", in: try traySource()), 0,
            """
            A2 : plus aucun délai artificiel dans le chemin d'ouverture. Le \
            chaînage passe par `onDismiss`, primitive déterministe — jamais par \
            un sleep raccourci.
            """
        )
    }

    func test_bothTraySurfacesUseTheSharedMyStoriesSheet() throws {
        let source = try traySource()
        XCTAssertEqual(
            occurrences(of: ".myStoriesSheet(", in: source), 2,
            "La grande trail et la mini-trail montent la MÊME sheet, via le même modifier."
        )
        XCTAssertEqual(
            occurrences(of: "MyStoriesView(", in: source), 0,
            "Plus aucun montage direct : ~90 lignes dupliquées, deux règles de chaînage."
        )
    }

    func test_theAvatarTapRoutesThroughTheResolver() throws {
        XCTAssertGreaterThan(
            occurrences(of: "StoryTrayActionResolver.avatarTap(", in: try traySource()), 0,
            "La destination du tap n'est plus décidée en ligne dans une closure non testable."
        )
    }

    /// Le libellé du tap doit porter sur la cible RÉELLEMENT tapée — l'avatar —
    /// et sur elle seule. Posé sur le `VStack` racine, `children: .combine`
    /// fusionnait quatre cibles distinctes (avatar, bouton mood, badge « + »,
    /// contrôles d'upload) en un seul élément dont le libellé écrasait ensuite
    /// tous les autres : sous VoiceOver, le badge « + » cessait d'être un
    /// bouton nommé, à rebours de « badge + → composer TOUJOURS ».
    func test_theAvatarLabelsItselfWithoutSwallowingTheSiblingButtons() throws {
        let source = try traySource()
        XCTAssertGreaterThan(
            occurrences(of: "StoryTrayActionResolver.avatarAccessibilityLabel(", in: source), 0,
            "L'annonce vient de la même règle que le routage."
        )
        XCTAssertEqual(
            occurrences(of: "children: .combine", in: source), 1,
            "Une seule fusion, et elle est SCOPÉE à l'avatar."
        )
        // Un modificateur ne s'applique qu'à ce qui le PRÉCÈDE : la fusion
        // posée avant les overlays du bouton mood et du badge « + » ne peut
        // pas les absorber. C'est la propriété structurelle qu'un simple
        // compte d'occurrences ne prouverait pas.
        let combine = try XCTUnwrap(source.range(of: "children: .combine"))
        let moodButton = try XCTUnwrap(source.range(of: "story.tray.a11y.changeMood"))
        let addStoryBadge = try XCTUnwrap(source.range(of: "story.tray.addStory"))
        XCTAssertTrue(
            combine.lowerBound < moodButton.lowerBound,
            "Le bouton mood garde son propre libellé."
        )
        XCTAssertTrue(
            combine.lowerBound < addStoryBadge.lowerBound,
            "Le badge « + » reste un bouton nommé — c'est l'affordance « composer TOUJOURS »."
        )
    }

    /// SUPERSESSION 2026-07-14 → 2026-07-31 : `StoryTrayMyStoryTapGuardTests`
    /// épinglait ici l'exigence inverse (`onViewStory: { showMyStories = true }`,
    /// « le tap ouvre la LISTE »). La directive du 31 juillet aligne les deux
    /// trails sur Instagram — le tap ouvre la story — et fait de l'entrée de
    /// gestion la contrepartie obligatoire. L'ancien fichier a donc été supprimé
    /// avec ce lot, cette assertion et la suivante en héritent.
    ///
    /// Ancrage revu : la garde comptait `contextMenuExtras:` sur le FICHIER
    /// entier, un littéral que la simple DÉCLARATION de propriété de
    /// `StoryRingCell` (`var contextMenuExtras: [AvatarContextMenuItem] = []`)
    /// suffit à satisfaire — supprimer l'unique call site la laissait verte. Elle
    /// porte désormais sur le LIBELLÉ de l'entrée (`StoryTrayCopy.manageStories`,
    /// clé `story.tray.menu.manage`), en compte EXACT et scopée à la mini-trail :
    /// aucune déclaration ne peut plus la satisfaire à la place du call site.
    func test_thePinnedTrailKeepsAReachableManageEntry() throws {
        let band = try pinnedTrailBandSource()

        // Supersession 2026-08-02 : le tap sur son propre anneau monte la
        // LISTE, et l'entrée de menu reste — deux chemins vers la même sheet.
        //
        // Troisième site depuis 2026-08-13 : le retrait du bouton « + » de tête
        // a fait de l'avatar « Moi » l'UNIQUE entrée de composition du band, et
        // cet avatar doit donc exister même sans aucun groupe de stories
        // (`selfAvatarCell`). Son routage passe par le même résolveur : un
        // historique entièrement expiré y mène aussi à la liste de gestion.
        XCTAssertEqual(
            occurrences(of: "showMyStories = true", in: band), 3,
            "Le tap sur l'anneau « Moi » (avec ou sans story) ET l'entrée de menu montent la sheet de gestion depuis le header replié."
        )
        // Boucle fermée : l'entrée de menu porte le libellé « Gérer mes
        // stories », résolu par le catalogue. Sans ce lien, renommer la
        // constante vers une autre clé passerait sous la garde.
        let manageStories = try XCTUnwrap(
            block(after: "static var manageStories:", in: try trayActionsSource()))
        XCTAssertTrue(
            manageStories.contains("story.tray.menu.manage"),
            "L'entrée de gestion doit rester adossée à sa clé de catalogue."
        )
    }

    /// SUPERSESSION 2026-08-02 (directive user, retour au sens du 14 juillet) :
    /// dans la mini-trail, le tap sur son propre anneau ouvre la LISTE de
    /// gestion — c'est elle qui porte les onglets Publiées / Brouillons. La
    /// lecture directe vit au menu contextuel. Ancré sur la closure
    /// `onViewStory` de l'anneau `ownGroup` et sur elle seule — le même fichier
    /// porte trois autres `onViewStory` (la propriété d'injection, les anneaux
    /// de pairs, la grande trail) dont aucun ne répond de cette règle.
    func test_thePinnedOwnRingTapOpensTheManageSheetNotTheViewer() throws {
        let ownRing = try XCTUnwrap(
            block(after: "if let ownGroup", in: try pinnedTrailBandSource()),
            "L'anneau « ma story » a disparu de la mini-trail : plus rien à ouvrir d'un tap."
        )
        let tap = try XCTUnwrap(
            block(after: "onViewStory:", in: ownRing),
            "…ou son tap n'est plus câblé."
        )

        XCTAssertEqual(
            occurrences(of: "showMyStories = true", in: tap), 1,
            "Le tap ouvre la liste de gestion (onglets Publiées / Brouillons)."
        )
        XCTAssertEqual(
            occurrences(of: "storyViewerCoordinator.present(", in: tap), 0,
            "…et jamais la lecture directe : elle vit au menu contextuel (« Voir ma story »)."
        )
    }
}
