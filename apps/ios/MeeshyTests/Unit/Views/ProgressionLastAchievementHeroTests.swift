import XCTest
import SwiftUI
@testable import Meeshy
import MeeshySDK

/// LE HERO DU DERNIER SUCCÈS (#5840) — et le défaut qui le tenait VIDE pour
/// tout le monde, toujours.
///
/// Le hero décodait la date d'un succès avec un `ISO8601DateFormatter()` NU,
/// dont les options par défaut n'acceptent PAS les fractions de seconde. Or la
/// passerelle sérialise avec `reachedAt.toISOString()`, et `toISOString()` en
/// émet TOUJOURS : `2026-09-06T18:20:00.000Z`. Chaque candidat était donc
/// écarté, `dernier` rendait `nil`, et le hero affichait son état vide
/// (« Premier succès — envoyez un message ») à des comptes qui avaient déjà
/// décroché des succès.
///
/// **Rien ne pouvait le signaler** : le hero rendait une vue LÉGITIME, ses
/// témoins passaient, et l'état vide est un état attendu. Il a fallu une
/// capture à l'œil, sur un corpus qui contenait enfin des succès valides.
///
/// La leçon tient en une ligne : `EngagementProgressResolver.reachedDate`
/// EXISTE pour cette raison — son doc-comment dit « avec ou sans fraction de
/// seconde, les deux formes que la passerelle a servies ». Le hero avait
/// réécrit la boucle au lieu de l'appeler.
@MainActor
final class ProgressionLastAchievementHeroTests: XCTestCase {

    /// Les libellés du hero, résolus par LA MÊME CLÉ que la vue — voir la note
    /// de `ProgressionMeeshEntryTests` : un littéral français ne peut pas être
    /// trouvé dans un arbre rendu en anglais, et l'hôte de test n'a pas de
    /// langue garantie.
    private var premierSucces: String {
        String(localized: "progression.hero.first", defaultValue: "Premier succès", bundle: .main)
    }
    private var dernierSucces: String {
        String(localized: "progression.hero.last", defaultValue: "Dernier succès", bundle: .main)
    }
    private var prochainSucces: String {
        String(localized: "progression.hero.next", defaultValue: "Prochain succès", bundle: .main)
    }

    /// La forme que la passerelle sert RÉELLEMENT — fractions comprises.
    private func progres(reachedAt: String) -> EngagementProgress {
        EngagementProgressResolver.resolve(APIEngagementProgress(
            counters: [.init(axisKey: "content.text_message", count: 40, points: 80)],
            milestones: [
                .init(milestoneType: .achievement, milestoneKey: "achievement.first_content", reachedAt: reachedAt)
            ],
            streak: .init(currentStreakDays: 3, longestStreakDays: 5),
            level: .init(engagementScore: 120)
        ))
    }

    private var window: UIWindow?

    private func render(_ vue: some View) -> UIView {
        let scene = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .first { $0.activationState == .foregroundActive }
        let taille = CGSize(width: 402, height: 300)
        let window = scene.map { UIWindow(windowScene: $0) } ?? UIWindow(frame: .zero)
        window.frame = CGRect(origin: .zero, size: taille)
        let host = UIHostingController(rootView: vue.frame(width: taille.width))
        window.rootViewController = host
        window.isHidden = false
        window.makeKeyAndVisible()
        self.window = window
        host.view.frame = CGRect(origin: .zero, size: taille)
        window.setNeedsLayout(); window.layoutIfNeeded()
        RunLoop.current.run(until: Date().addingTimeInterval(0.3))
        return host.view
    }

    override func tearDown() {
        window?.rootViewController = nil
        window?.isHidden = true
        window = nil
        super.tearDown()
    }

    private func elements(de objet: NSObject) -> [NSObject] {
        if let listes = objet.accessibilityElements as? [NSObject], !listes.isEmpty { return listes }
        let compte = objet.accessibilityElementCount()
        guard compte != NSNotFound, compte > 0 else { return [] }
        return (0..<compte).compactMap { objet.accessibilityElement(at: $0) as? NSObject }
    }

    private func dit(_ objet: NSObject, profondeur: Int = 0) -> [String] {
        guard profondeur < 60 else { return [] }
        var trouves = objet.accessibilityLabel.map { [$0] } ?? []
        for element in elements(de: objet) { trouves += dit(element, profondeur: profondeur + 1) }
        if let vue = objet as? UIView {
            for sous in vue.subviews { trouves += dit(sous, profondeur: profondeur + 1) }
        }
        return trouves
    }

    /// LE témoin central — la forme que la passerelle sert vraiment.
    func test_aFractionalDate_stillReachesTheHero() {
        let root = render(ProgressionLastAchievementHero(
            progress: progres(reachedAt: "2026-09-06T18:20:00.000Z"),
            isDark: false
        ))
        let phrases = dit(root).joined(separator: " | ")

        XCTAssertFalse(
            phrases.contains(premierSucces),
            "Le hero montre son ÉTAT VIDE alors qu'un succès est débloqué : « \(phrases) »"
        )
        XCTAssertTrue(
            phrases.contains(dernierSucces),
            "Le hero n'annonce pas le dernier succès : « \(phrases) »"
        )
    }

    /// La forme SANS fraction — celle qu'une passerelle antérieure servait —
    /// doit rester lue. Corriger un format en cassant l'autre n'aurait fait que
    /// déplacer le défaut.
    func test_aPlainDate_isStillRead() {
        let root = render(ProgressionLastAchievementHero(
            progress: progres(reachedAt: "2026-09-06T18:20:00Z"),
            isDark: false
        ))
        XCTAssertTrue(
            dit(root).joined(separator: " | ").contains(dernierSucces),
            "La forme sans fraction de seconde n'est plus lue."
        )
    }

    /// Sans aucun succès OBTENU, le hero ne se tait pas : il nomme le PROCHAIN
    /// et ce qu'il demande (#5831, récupéré à la fusion).
    ///
    /// Cette branche n'affichait là qu'un conseil FIGÉ — correct, mais moins
    /// que ce que la passerelle sert déjà. Le témoin qui l'attendait est donc
    /// remplacé, pas supprimé : ce qu'il gardait — « le hero ne disparaît
    /// jamais » — reste gardé, sur la bonne phrase.
    func test_withoutAnyUnlockedAchievement_theHeroNamesTheNextOne() {
        let vide = EngagementProgressResolver.resolve(.empty)
        let root = render(ProgressionLastAchievementHero(progress: vide, isDark: false))
        let lu = dit(root).joined(separator: " | ")
        XCTAssertTrue(
            lu.contains(prochainSucces),
            "Rien d'obtenu ⇒ le hero doit VISER : un trou à cet endroit-là est le pire des états vides."
        )
        XCTAssertFalse(
            lu.contains(dernierSucces),
            "Annoncer « dernier » sur un palier qu'on n'a pas obtenu est un mensonge de bandeau."
        )
    }
}
