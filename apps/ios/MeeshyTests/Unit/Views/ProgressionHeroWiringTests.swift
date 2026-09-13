import XCTest
@testable import Meeshy
import MeeshySDK

/// **Le tableau de bord a un héros, et chaque succès s'y ouvre en grand**
/// (#5831, re-pointé sur le hub #5838/#5843).
///
/// `AchievementRevealView` (#5809) n'avait qu'UNE porte : le tap d'une
/// notification. Depuis l'écran qui LISTE précisément ce qu'elle célèbre, on ne
/// pouvait pas l'ouvrir — une célébration ne se voyait donc qu'une fois, au
/// vol. C'est la loi 4 sous sa forme la plus coûteuse : la fonctionnalité est
/// écrite, testée, et inatteignable.
///
/// **Ce témoin a changé de CIBLE, pas d'exigence.** La refonte en hub a déplacé
/// les lignes de succès de `ProgressionView` vers `ProgressionSectionPage` — et
/// les avait perdues en route : plus de `Button`, plus de `.isButton`, plus
/// d'indice. C'est cette garde, écrite pour l'ancienne disposition, qui l'a
/// attrapé. Une garde de source qu'on SUPPRIME parce qu'elle ne décrit plus la
/// forme du jour emporte avec elle la seule preuve que la porte existait.
@MainActor
final class ProgressionHeroWiringTests: XCTestCase {

    private func source(_ chemin: String) throws -> String {
        AppSourceGuard.stripComments(try AppSourceGuard.unit(chemin))
    }

    private func tableauDeBord() throws -> String {
        try source("Meeshy/Features/Main/Views/ProgressionView.swift")
    }

    private func hub() throws -> String {
        try source("Meeshy/Features/Main/Views/ProgressionHub.swift")
    }

    // MARK: - Le héros est MONTÉ

    func test_leTableauDeBordMonteLeHeros() throws {
        XCTAssertTrue(try tableauDeBord().contains("ProgressionLastAchievementHero("),
                      "Sans le héros, le succès décroché ce matin pèse autant qu'un succès verrouillé.")
        XCTAssertTrue(try hub().contains("progress.heroAchievement"),
                      "Le choix du palier à viser QUAND RIEN N'EST OBTENU est une loi de MODÈLE "
                          + "(`EngagementProgress.heroAchievement`), pas une règle réécrite dans la vue.")
    }

    func test_leHeroCouvreLesDeuxProvenances() throws {
        let code = try hub()
        XCTAssertTrue(code.contains("progress.achievementSections"),
                      "Le dernier fait d'un compte peut être un palier GÉNÉRÉ : `heroAchievement` "
                          + "ne connaît que les succès nommés.")
        XCTAssertTrue(code.contains("EngagementProgressResolver.reachedDate("),
                      "`ISO8601DateFormatter()` nu refuse les fractions de seconde, que le gateway "
                          + "émet TOUJOURS — chaque candidat était écarté en silence.")
    }

    // MARK: - Ouvrir la vue complète, depuis le héros ET depuis les lignes

    func test_leSuccesSOuvreEnGrand() throws {
        let code = try tableauDeBord()
        XCTAssertTrue(code.contains("fullScreenCover(item: $reveal)"),
                      "La vue complète COUVRE le tableau de bord — refermer ramène où le doigt était.")
        XCTAssertTrue(code.contains("AchievementRevealView("),
                      "La MÊME vue que la célébration : un second exemplaire divergerait au premier ajustement.")
        XCTAssertTrue(code.contains("occasion: .consultation("),
                      "Depuis le tableau de bord on CONSULTE — on n'y refête rien, et un succès "
                          + "verrouillé doit pouvoir s'y regarder.")
    }

    func test_chaqueLigneDeSuccesEstUnBouton() throws {
        let code = try hub()
        XCTAssertTrue(code.contains("ProgressionAchievementRow(achievement: achievement)"))
        XCTAssertTrue(code.contains(".accessibilityAddTraits(.isButton)"),
                      "Un contrôle qui n'annonce pas qu'il en est un n'existe pas pour VoiceOver.")
        XCTAssertTrue(code.contains("progression.achievement.a11y.hint"),
                      "L'indice DIT ce que le tap fait — sinon le lecteur d'écran découvre l'effet après coup.")
        XCTAssertTrue(code.contains("fullScreenCover(item: $reveal)"),
                      "La sous-page est présentée en `sheet` : un cover attaché à l'hôte s'ouvrirait "
                          + "DERRIÈRE elle, et la porte n'existerait pas.")
    }

    // MARK: - Ce que la vue complète DIT selon l'occasion

    func test_uneConsultationNeRejoueNiLHaptiqueDeSuccesNiLaPromesseDYAller() throws {
        let code = try source("Meeshy/Features/Main/Views/AchievementRevealView.swift")
        XCTAssertTrue(code.contains("occasion.estCelebration { HapticFeedback.success() }"),
                      "Rejouer l'haptique de SUCCÈS à chaque consultation userait le signal qui compte.")
        XCTAssertTrue(code.contains("reveal.close"),
                      "Depuis le tableau de bord, promettre d'y aller serait faux : on en revient.")
        XCTAssertTrue(code.contains("guard occasion.estObtenu else { return MeeshyColors.neutral500"),
                      "La couleur EST le signal « c'est à vous » : la servir à ce qui n'est pas "
                          + "obtenu la vide de son sens sur tout l'écran.")
        XCTAssertTrue(code.contains("if !reduceMotion && occasion.estObtenu {"),
                      "Un rayonnement dit « ta-daa » : le peindre autour d'un palier NON obtenu "
                          + "félicite pour rien.")
    }

    func test_occasion_estObtenu_suitLEtatDuSucces() {
        XCTAssertTrue(AchievementRevealView.Occasion.celebration.estObtenu)
        XCTAssertTrue(AchievementRevealView.Occasion.consultation(unlocked: true, reachedAt: nil).estObtenu)
        XCTAssertFalse(AchievementRevealView.Occasion.consultation(unlocked: false, reachedAt: nil).estObtenu)
    }

    func test_occasion_seuleLaCelebrationEstUneCelebration() {
        XCTAssertTrue(AchievementRevealView.Occasion.celebration.estCelebration)
        XCTAssertFalse(AchievementRevealView.Occasion.consultation(unlocked: true, reachedAt: nil).estCelebration)
    }
}
