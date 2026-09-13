import XCTest
@testable import MeeshySDK

/// **Le cadrage d'un fond de scène : ce qu'il vaut à l'arrivée, et ce que le
/// geste en fait** (#6125).
///
/// Deux questions distinctes, une seule loi, et c'est le point du lot : elles
/// étaient répondues à trois endroits qui ne se connaissaient pas — le renderer
/// (`resolveImageGravity` / `resolveVideoGravity`, qui traduit `nil` en
/// REMPLIR), l'ingestion (qui ne posait rien, donc `nil`, donc remplir), et le
/// double-tap (dont le cycle passait par `nil` comme s'il était un état).
///
/// > **`nil` n'est pas un état, c'est un ALIAS.** Un cycle écrit autour d'une
/// > valeur absente qui SIGNIFIE quelque chose se raccourcit sans prévenir le
/// > jour où ce quelque chose change de défaut : `nil → fit → fill → nil`
/// > devient, une fois le défaut passé à « ajusté », deux tiers d'appuis qui ne
/// > changent rien à l'écran.
///
/// Les témoins ci-dessous portent donc moins sur les valeurs que sur la
/// PROPRIÉTÉ qui les gouverne : un cadrage suivant doit RENDRE autrement que le
/// cadrage courant — sans quoi le geste est un contrôle inerte (loi 4).
final class StoryBackgroundFramingTests: XCTestCase {

    // MARK: - L'alias, nommé

    /// **Ce que `nil` rend vraiment.** Le renderer le traduit en
    /// `.resizeAspectFill` depuis toujours (mode libre : « TOUJOURS
    /// `.resizeAspectFill` », `StoryBackgroundLayer.resolveVideoGravity`). Tant
    /// que cette équivalence reste implicite, tout raisonnement sur les trois
    /// valeurs en compte trois là où l'écran n'en montre que deux.
    func test_rendersFilled_nilEstUnAliasDeRemplir() {
        XCTAssertTrue(StoryBackgroundFraming.rendersFilled(nil),
                      "`nil` est le mode libre, que le renderer peint en `.resizeAspectFill`.")
        XCTAssertTrue(StoryBackgroundFraming.rendersFilled(StoryBackgroundFraming.fill))
        XCTAssertFalse(StoryBackgroundFraming.rendersFilled(StoryBackgroundFraming.fit))
    }

    /// Une valeur inconnue — venue d'un client plus récent, d'une charge
    /// bricolée — retombe sur le défaut du renderer plutôt que d'inventer un
    /// troisième rendu. Fail-closed : on rend ce que l'absence rendrait.
    func test_rendersFilled_uneValeurInconnueRetombeSurLeDefaut() {
        XCTAssertTrue(StoryBackgroundFraming.rendersFilled("cover"))
        XCTAssertTrue(StoryBackgroundFraming.rendersFilled(""))
    }

    // MARK: - Ce qu'un fond reçoit à l'arrivée

    /// **La directive du 2026-09-12** : « le Meeshy Composer doit intégrer dans
    /// canvas la pièce pour fit dans le canvas par défaut ». Un média qui fonde
    /// une slide arrive donc AJUSTÉ — l'auteur voit sa pièce entière, puis
    /// zoome pour rogner.
    func test_posedFitMode_unFondNeufArriveAjuste() {
        XCTAssertEqual(StoryBackgroundFraming.posedFitMode(declared: nil),
                       StoryBackgroundFraming.fit)
    }

    /// **Une intention DÉJÀ déclarée sur la slide survit au remplacement du
    /// média.** L'auteur qui a demandé « remplir » sur cette scène l'a demandé
    /// pour la scène, pas pour le fichier : réécrire son choix à chaque média
    /// posé lui ferait reprendre le même geste indéfiniment.
    func test_posedFitMode_neReecritPasUnChoixDejaFait() {
        XCTAssertEqual(StoryBackgroundFraming.posedFitMode(declared: StoryBackgroundFraming.fill),
                       StoryBackgroundFraming.fill)
        XCTAssertEqual(StoryBackgroundFraming.posedFitMode(declared: StoryBackgroundFraming.fit),
                       StoryBackgroundFraming.fit)
    }

    // MARK: - Le geste à deux états

    /// Depuis un fond AJUSTÉ — le nouveau défaut — l'appui remplit.
    func test_nextFitMode_ajusteMeneAremplir() {
        XCTAssertEqual(StoryBackgroundFraming.nextFitMode(current: StoryBackgroundFraming.fit),
                       StoryBackgroundFraming.fill)
    }

    /// Depuis un fond REMPLI, l'appui ajuste.
    func test_nextFitMode_rempliMeneAajuster() {
        XCTAssertEqual(StoryBackgroundFraming.nextFitMode(current: StoryBackgroundFraming.fill),
                       StoryBackgroundFraming.fit)
    }

    /// **Le témoin qui n'existait pas, et sans lequel le défaut revient.**
    /// Une composition ANCIENNE — ou toute slide dont le cadrage n'a jamais été
    /// déclaré — porte `nil`. L'ancien cycle en faisait un état de départ et
    /// menait à `"fit"`, ce qui était juste ; ce qui ne l'était pas, c'est
    /// qu'il y REVENAIT depuis `"fill"`, enchaînant deux appuis au rendu
    /// identique.
    func test_nextFitMode_lAliasNeSertQueDeDepart() {
        XCTAssertEqual(StoryBackgroundFraming.nextFitMode(current: nil),
                       StoryBackgroundFraming.fit,
                       "`nil` rend REMPLI, donc l'appui suivant doit ajuster.")
    }

    /// **La propriété qui gouverne les trois témoins ci-dessus**, et la seule
    /// qui survivra à un quatrième mode : quelle que soit l'entrée, le cadrage
    /// suivant doit RENDRE autrement que le courant. Un cycle qui viole ça
    /// offre un appui sans effet — exactement ce que la loi 4 interdit, et
    /// exactement ce que le passage du défaut à « ajusté » aurait produit.
    func test_nextFitMode_changeToujoursCeQueLEcranMontre() {
        for courant in [nil, StoryBackgroundFraming.fit, StoryBackgroundFraming.fill, "cover"] {
            let suivant = StoryBackgroundFraming.nextFitMode(current: courant)
            XCTAssertNotEqual(
                StoryBackgroundFraming.rendersFilled(courant),
                StoryBackgroundFraming.rendersFilled(suivant),
                "Depuis \(courant ?? "nil"), l'appui mène à \(suivant) — qui rend pareil."
            )
        }
    }

    /// **Le cycle se referme en DEUX appuis, jamais trois.** Le corollaire du
    /// témoin précédent, écrit pour être lisible : deux appuis ramènent l'écran
    /// où il était.
    func test_nextFitMode_deuxAppuisRamenentAuMemeRendu() {
        for courant in [nil, StoryBackgroundFraming.fit, StoryBackgroundFraming.fill] {
            let un = StoryBackgroundFraming.nextFitMode(current: courant)
            let deux = StoryBackgroundFraming.nextFitMode(current: un)
            XCTAssertEqual(StoryBackgroundFraming.rendersFilled(courant),
                           StoryBackgroundFraming.rendersFilled(deux),
                           "Depuis \(courant ?? "nil"), deux appuis doivent rendre l'écran de départ.")
        }
    }

    // MARK: - Ce que la persistance en fait

    /// **Un cadrage explicite doit SURVIVRE au round-trip.**
    /// `StoryBackgroundTransform.isIdentity` jette la transformation entière
    /// quand elle est neutre, et il compte `videoFitMode == nil` comme neutre.
    /// C'est précisément pourquoi le cycle ne doit jamais produire `nil` : un
    /// « remplir » écrit comme `nil` serait jeté, et la slide repartirait au
    /// défaut — qui est désormais AJUSTER. L'auteur verrait son choix s'annuler
    /// tout seul.
    func test_lesDeuxModesSurviventAuNettoyageDeLIdentite() {
        for mode in [StoryBackgroundFraming.fit, StoryBackgroundFraming.fill] {
            var transform = StoryBackgroundTransform()
            transform.videoFitMode = mode
            XCTAssertFalse(transform.isIdentity,
                           "`\(mode)` est un choix de l'auteur : il ne doit pas être nettoyé.")
        }
    }
}
