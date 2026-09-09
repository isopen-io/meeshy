import XCTest
@testable import Meeshy
import MeeshySDK

/// **Le tableau de bord a un héros, et chaque succès s'y ouvre en grand**
/// (#5831).
///
/// `AchievementRevealView` (#5809) n'avait qu'UNE porte : le tap d'une
/// notification. Depuis l'écran qui LISTE précisément ce qu'elle célèbre, on ne
/// pouvait pas l'ouvrir — `ProgressionAchievementRow` n'avait ni `Button`, ni
/// `onTapGesture`, ni `.isButton`. Une célébration ne se voyait donc qu'une
/// fois, au vol. C'est la loi 4 sous sa forme la plus coûteuse : la
/// fonctionnalité est écrite, testée, et inatteignable.
@MainActor
final class ProgressionHeroWiringTests: XCTestCase {

    private func progressionSource() throws -> String {
        AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/ProgressionView.swift"))
    }

    // MARK: - Le héros est MONTÉ

    func test_leTableauDeBordMonteLeHeros() throws {
        let code = try progressionSource()
        XCTAssertTrue(code.contains("ProgressionHeroCard(achievement:"),
                      "Sans le héros, le succès décroché ce matin pèse autant qu'un succès verrouillé.")
        XCTAssertTrue(code.contains("progress.heroAchievement"),
                      "Le choix du héros est une loi de MODÈLE (`EngagementProgress.heroAchievement`), "
                          + "pas une règle réécrite dans la vue.")
    }

    // MARK: - Ouvrir la vue complète, depuis le héros ET depuis les lignes

    func test_leSuccesSOuvreEnGrand() throws {
        let code = try progressionSource()
        XCTAssertTrue(code.contains("fullScreenCover(item: $succesOuvert)"),
                      "La vue complète COUVRE le tableau de bord — refermer ramène où le doigt était.")
        XCTAssertTrue(code.contains("AchievementRevealView("),
                      "La MÊME vue que la célébration : un second exemplaire divergerait au premier ajustement.")
        XCTAssertTrue(code.contains("occasion: .consultation("),
                      "Depuis le tableau de bord on CONSULTE — on n'y refête rien, et un succès "
                          + "verrouillé doit pouvoir s'y regarder.")
        XCTAssertEqual(code.components(separatedBy: "succesOuvert =").count - 1, 3,
                       "Trois écritures : le héros, la ligne, et la fermeture. Une porte manquante "
                           + "laisse une moitié de l'écran inerte.")
    }

    func test_chaqueLigneDeSuccesEstUnBouton() throws {
        let code = try progressionSource()
        XCTAssertTrue(code.contains("ProgressionAchievementRow(achievement: achievement)"))
        XCTAssertTrue(code.contains(".accessibilityAddTraits(.isButton)"),
                      "Un contrôle qui n'annonce pas qu'il en est un n'existe pas pour VoiceOver.")
        XCTAssertTrue(code.contains("progression.achievement.a11y.hint"),
                      "L'indice DIT ce que le tap fait — sinon le lecteur d'écran découvre l'effet après coup.")
    }

    // MARK: - Ce que la vue complète DIT selon l'occasion

    func test_uneConsultationNeRejoueNiLHaptiqueDeSuccesNiLaPromesseDYAller() throws {
        let code = AppSourceGuard.stripComments(
            try AppSourceGuard.unit("Meeshy/Features/Main/Views/AchievementRevealView.swift"))
        XCTAssertTrue(code.contains("occasion.estCelebration { HapticFeedback.success() }"),
                      "Rejouer l'haptique de SUCCÈS à chaque consultation userait le signal qui compte.")
        XCTAssertTrue(code.contains("reveal.close"),
                      "Depuis le tableau de bord, promettre d'y aller serait faux : on en revient.")
        XCTAssertTrue(code.contains("guard occasion.estObtenu else { return MeeshyColors.textMuted"),
                      "La couleur EST le signal « c'est à vous » : la servir à ce qui n'est pas "
                          + "obtenu la vide de son sens sur tout l'écran.")
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
