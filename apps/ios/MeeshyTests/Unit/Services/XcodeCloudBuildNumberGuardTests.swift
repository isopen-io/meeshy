import XCTest
@testable import Meeshy

/// **Le numéro de build d'un binaire Xcode Cloud vient de Xcode Cloud** — pas
/// d'une valeur figée dans le dépôt (directive porteur 2026-09-09).
///
/// `project.yml` AFFIRMAIT que « Xcode Cloud numérote avec son propre compteur
/// (CI_BUILD_NUMBER) ». C'était faux, et de la pire façon : Xcode Cloud EXPOSE
/// bien `CI_BUILD_NUMBER` à ses scripts, mais ne l'injecte dans AUCUN réglage
/// de build. Sans un hook qui l'écrive, l'archive porte le
/// `CURRENT_PROJECT_VERSION` committé — **1816 pour tous les runs**, quel que
/// soit leur numéro.
///
/// Ce que ça coûte : deux binaires différents peuvent porter le même numéro de
/// build. App Store Connect refuse le second (« The bundle version must be
/// higher »), et rien dans le dépôt ne dit pourquoi — le commentaire, lui,
/// jurait que le numéro venait d'ailleurs.
///
/// **C'est une garde de SOURCE, et ce n'est pas un pis-aller.** Le hook ne
/// s'exécute que sur les runners d'Apple : aucun test ne peut l'appeler. Ce qui
/// est vérifiable ici, c'est qu'il porte l'injection ET sa vérification — et
/// c'est la seconde qui compte, un `sed` qui ne trouve pas sa ligne échouant
/// silencieusement.
final class XcodeCloudBuildNumberGuardTests: XCTestCase {

    private func hook() throws -> String {
        try AppSourceGuard.unit("ci_scripts/ci_post_clone.sh")
    }

    /// Le hook SANS ses commentaires. Sa longue en-tête cite `xcodegen generate`
    /// et `CURRENT_PROJECT_VERSION` en prose ; chercher ces chaînes dans le
    /// fichier ENTIER mesure la documentation, pas le script — c'est ce qui a
    /// fait tomber la première version de ce témoin sur un hook correct.
    private func commandes() throws -> String {
        try hook()
            .split(separator: "\n", omittingEmptySubsequences: false)
            .filter { !$0.trimmingCharacters(in: .whitespaces).hasPrefix("#") }
            .joined(separator: "\n")
    }

    private func manifeste() throws -> String {
        try AppSourceGuard.unit("project.yml")
    }

    // MARK: - L'injection

    func test_leHookEcritLeNumeroDeBuildDeXcodeCloud() throws {
        let source = try commandes()
        XCTAssertTrue(source.contains("CI_BUILD_NUMBER"),
                      "Sans lire CI_BUILD_NUMBER, chaque run d'Xcode Cloud archive le même numéro.")
        XCTAssertTrue(source.contains("CURRENT_PROJECT_VERSION"),
                      "Le numéro lu doit être ÉCRIT dans le réglage que l'archive porte.")
    }

    /// L'ordre décide de tout : `xcodegen generate` rend le pbxproj DEPUIS
    /// `project.yml`. Écrire le numéro après la régénération le poserait dans un
    /// fichier que plus personne ne lit.
    func test_leNumeroEstEcritAVANTLaRegeneration() throws {
        let source = try commandes()
        guard let injection = source.range(of: "CI_BUILD_NUMBER"),
              let regeneration = source.range(of: "xcodegen generate") else {
            return XCTFail("Le hook doit contenir les deux étapes.")
        }
        XCTAssertLessThan(injection.lowerBound, regeneration.lowerBound,
                          "Écrit APRÈS `xcodegen generate`, le numéro n'atteint pas le pbxproj construit.")
    }

    // MARK: - La vérification, qui est le cœur de la garde

    /// **Un `sed` qui ne trouve pas sa ligne réussit.** Il rend 0, ne modifie
    /// rien, et le build sort avec l'ancien numéro — c'est-à-dire exactement le
    /// défaut qu'on vient de corriger, revenu sans que rien ne rougisse. Le
    /// hook doit donc RELIRE ce qu'il a écrit et échouer sinon.
    func test_leHookVerifieQueLeNumeroAEteEcrit() throws {
        let source = try commandes()
        XCTAssertTrue(source.contains("exit 1"),
                      "Une injection qui ne peut pas échouer n'est pas une injection : elle est un espoir.")
    }

    // MARK: - Le manifeste ne ment plus

    /// Le commentaire qui affirmait que le compteur venait d'Xcode Cloud a
    /// SURVÉCU au défaut pendant des mois. Un doc-comment qui décrit un
    /// mécanisme absent est pire qu'un silence : il fait conclure que la
    /// question est réglée, et personne ne va vérifier.
    func test_leManifesteNAffirmePlusQueXcodeCloudNumeroteSeul() throws {
        let source = try manifeste()
        XCTAssertFalse(
            source.contains("Xcode Cloud numérote avec son propre compteur (CI_BUILD_NUMBER), très au-dessus de"),
            "Cette phrase décrivait un mécanisme qui n'existait pas — le hook l'écrit désormais VRAIMENT."
        )
    }
}
