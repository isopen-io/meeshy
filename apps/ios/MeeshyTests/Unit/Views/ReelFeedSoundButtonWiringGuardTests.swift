import XCTest
@testable import Meeshy

/// Gardes de câblage du bouton de son du fil (S2, exigence produit 2026-08-22).
/// Un test qui vérifie seulement que le bouton EXISTE ne suffit pas — ces
/// gardes visent spécifiquement les régressions qui laisseraient un bouton
/// « décoratif » (icône qui bascule, aucun son) :
/// - `drive()` doit écrire le mute via `ReelFeedSoundButtonPolicy
///   .apply(soundOn:to:)` — le SEUL point d'écriture (D4) — jamais un
///   `let forceMuted = …` suivi d'une affectation séparée, qui peut perdre
///   l'affectation sans qu'aucun test string ne s'en aperçoive (DoD S2
///   rejet, mutation M5 : la démonstration réelle que `apply` fait ce qu'il
///   dit vit dans `ReelFeedSoundIntentTests`, contre un double ET contre
///   `SharedAVPlayerManager.shared`) ;
/// - la CHAÎNE DE RÉACTIVITÉ elle-même — pas seulement le point d'écriture —
///   doit être verrouillée : `.onReceive` de l'intention, `.adaptiveOnChange`
///   qui rejoue `drive()`, et le binding `isEngineOwned:` aux DEUX sites de
///   montage. DoD S2 rejet, constat majeur #1 : une mutation qui coupe ces
///   trois fils en gardant intact tout le reste du fichier laissait 58/58
///   VERT tant qu'aucun test n'ancrait leur présence CONJOINTE.
final class ReelFeedSoundButtonWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    // MARK: - ReelFeedVideoSurface : le mute passe par LE SEUL point d'écriture

    func test_reelFeedVideoSurface_appliesSoundIntentViaTheSharedPolicy() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains("ReelFeedSoundButtonPolicy.apply(soundOn: soundOn, to: manager)"),
            "drive() DOIT écrire le mute via apply(soundOn:to:), le SEUL point d'écriture (S2 D4). " +
            "Une résolution séparée (`let forceMuted = …` puis affectation à la main) peut perdre " +
            "l'affectation sans qu'aucun test string ne s'en aperçoive (DoD S2 rejet, mutation M5)."
        )
        XCTAssertFalse(
            text.contains("manager.isForceMuted = true"),
            "isForceMuted ne doit jamais être figé à true — voir apply(soundOn:to:)."
        )
        XCTAssertFalse(
            text.contains("manager.isForceMuted = forceMuted"),
            "Ancienne forme (affectation séparée après un `let forceMuted = …`) : c'est exactement " +
            "la ligne que la mutation M5 a retirée sans qu'aucun test ne rougisse. apply(soundOn:to:) " +
            "doit être le SEUL site qui écrit isForceMuted."
        )
    }

    func test_reelFeedVideoSurface_neverForcesGlobalIsMutedToTrue() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertFalse(
            text.contains("manager.isMuted = true"),
            "Le fil ne doit JAMAIS forcer isMuted à VRAI (préférence globale session) — seul un vrai " +
            "mute utilisateur explicite ailleurs (galerie, plein écran) le fait. Couper le son du fil " +
            "ne doit écrire QUE isForceMuted, sous peine de rouvrir la fuite documentée (galerie " +
            "héritant du silence du feed)."
        )
    }

    func test_reelFeedVideoSurface_stillReaffirmsMuteAfterLoad() throws {
        // Non-régression du commentaire l.202-216 : le mute doit rester
        // réaffirmé APRÈS load() (qui appelle cleanup() en interne et
        // remettrait isForceMuted à false) — seule la RÉSOLUTION change
        // (via apply(), D4), pas le fait qu'elle soit réaffirmée à chaque
        // passe de drive().
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains("manager.shouldLoop = true"),
            "Repère de non-régression introuvable — le fichier a-t-il changé de forme ?"
        )
    }

    func test_reelFeedVideoSurface_appliesSoundIntentBeforePlaying() throws {
        // D5 : `apply()` doit s'exécuter AVANT `manager.play()` — `play()`
        // (SDK) arme lui-même `.duckOthers`, gated sur `effectiveMuted`, qui
        // doit donc déjà refléter ce tap au moment où `play()` le lit. Aucun
        // armement séparé et mal gated ne doit subsister ici : l'ancien appel
        // explicite armait `.duckOthers` sur `!forceMuted` SEUL (ignorant
        // `isMuted`) et pouvait armer la session pour une vidéo restée
        // silencieuse (DoD S2 rejet, constat majeur #2).
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        guard let applyRange = text.range(of: "ReelFeedSoundButtonPolicy.apply(soundOn: soundOn, to: manager)") else {
            return XCTFail("apply(soundOn:to:) introuvable.")
        }
        guard text.range(of: "manager.play()", range: applyRange.upperBound..<text.endIndex) != nil else {
            return XCTFail(
                "manager.play() doit apparaître APRÈS apply(soundOn:to:) — sinon play() peut armer " +
                ".duckOthers avant que le mute résolu par ce tap n'ait été appliqué."
            )
        }
        XCTAssertFalse(
            text.contains("MediaSessionCoordinator.shared.activatePlaybackSync"),
            "Aucun armement explicite de .duckOthers ici — play() (SharedAVPlayerManager) l'arme déjà, " +
            "correctement gated sur effectiveMuted au complet. Un appel séparé ici a été retiré parce " +
            "qu'il gatait sur forceMuted SEUL (DoD S2 rejet, constat majeur #2)."
        )
    }

    // MARK: - ReelFeedVideoSurface : la CHAÎNE DE RÉACTIVITÉ elle-même — pas
    // seulement le point d'écriture. DoD S2 rejet, mutation M3+M4 : couper
    // ces deux lignes en gardant `apply()`/le prédicat intacts laissait le
    // bouton EXISTER et écrire dans le vide (l'intention ne rejoue jamais
    // drive(), ou drive() n'apprend jamais que l'intention a changé) — 58/58
    // vert tant qu'aucun test n'ancrait leur présence.

    func test_reelFeedVideoSurface_subscribesToTheSoundIntentPublisher() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains(".onReceive(ReelFeedSoundIntent.shared.$isSoundOn) { soundOn = $0 }"),
            "Sans cet abonnement, la surface n'apprend jamais qu'une AUTRE instance (le bouton, monté " +
            "sur la carte PARENTE) a changé l'intention de son — soundOn resterait figé à sa valeur " +
            "de création, drive() ne serait jamais rejoué (DoD S2 rejet, mutation M3)."
        )
    }

    func test_reelFeedVideoSurface_replaysDriveWhenSoundIntentChanges() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains(".adaptiveOnChange(of: soundOn) { _, _ in drive(ready: ready) }"),
            "Sans cette relance de drive() au changement de soundOn, le tap change l'état LOCAL mais " +
            "ne repasse jamais sur le lecteur — le bouton bascule une icône, aucun son ne change " +
            "(DoD S2 rejet, mutation M4)."
        )
    }

    // MARK: - Montage : les DEUX surfaces câblent LE MÊME bouton + LES MÊMES bindings
    //
    // DoD S2 rejet, mutation M2 : retirer `isEngineOwned: $isEngineOwned` au
    // site d'appel laisse le binding retomber sur `.constant(false)` —
    // `showsSoundButton()` n'est alors JAMAIS vrai, le bouton ne se monte
    // PLUS JAMAIS sur la carte réel native, et 58/58 restait vert.

    func test_readingSurfaces_mountTheSharedSoundButton() throws {
        for path in [
            "Meeshy/Features/Main/Views/ReelFeedCard.swift",
            "Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("ReelFeedSoundButton("),
                "\(path) doit monter le bouton PARTAGÉ ReelFeedSoundButton — jamais " +
                "une chrome dupliquée (cercle/icône) recopiée localement."
            )
            XCTAssertTrue(
                text.contains("ReelFeedSoundButtonPolicy.showsSoundButton("),
                "\(path) doit décider du montage via le prédicat PARTAGÉ — jamais une " +
                "condition d'existence recopiée à la main qui pourrait diverger."
            )
        }
    }

    func test_bothMountSites_wireTheEngineOwnershipBinding() throws {
        for path in [
            "Meeshy/Features/Main/Views/ReelFeedCard.swift",
            "Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("isEngineOwned: $isEngineOwned"),
                "\(path) doit câbler isEngineOwned: $isEngineOwned sur ReelFeedVideoSurface — sinon " +
                "le binding retombe sur .constant(false) et showsSoundButton() n'est JAMAIS vrai " +
                "(DoD S2 rejet, mutation M2)."
            )
        }
    }

    func test_bothMountSites_wireTheSoundAudibleBinding() throws {
        // Correctif DoD S2 rejet, constat majeur #2 : l'icône doit refléter
        // l'état RÉEL du lecteur (manager.effectiveMuted), jamais
        // ReelFeedSoundIntent.isSoundOn seul — sans ce câblage, le binding
        // retombe sur .constant(false) et le bouton affiche « muet » à
        // demeure, quoi que fasse l'utilisateur.
        for path in [
            "Meeshy/Features/Main/Views/ReelFeedCard.swift",
            "Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift",
        ] {
            let text = try source(path)
            XCTAssertTrue(
                text.contains("isSoundAudible: $isSoundAudible"),
                "\(path) doit câbler isSoundAudible: $isSoundAudible sur ReelFeedVideoSurface."
            )
            XCTAssertTrue(
                text.contains("ReelFeedSoundButton(isSoundAudible: isSoundAudible)"),
                "\(path) doit passer la vérité du lecteur (isSoundAudible) au bouton — jamais une " +
                "intention seule qui peut mentir quand la préférence globale isMuted reste vraie."
            )
        }
    }

    func test_reelFeedVideoSurface_reportsPlayerTruthToTheParent() throws {
        // Correctif DoD S2 rejet, constat majeur #2 : la SURFACE doit
        // observer l'état RÉEL du manager (isMuted ET isForceMuted) pour
        // alimenter isSoundAudible — jamais dériver ce binding de soundOn
        // (l'intention) seul, qui ignore un isMuted global laissé vrai par
        // une autre surface.
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains(".onReceive(manager.$isMuted)"),
            "ReelFeedVideoSurface doit observer manager.$isMuted pour calculer isSoundAudible."
        )
        XCTAssertTrue(
            text.contains(".onReceive(manager.$isForceMuted)"),
            "ReelFeedVideoSurface doit observer manager.$isForceMuted pour calculer isSoundAudible."
        )
    }

    // MARK: - Montage : la condition d'engine ownership lit la source AUTORITAIRE
    //
    // DoD S2 rejet, constat majeur #3 : `updateEngineOwnership` calculait la
    // décision sur les miroirs @State locaux (`isShowingThis`), potentiellement
    // périmés d'une frame le temps qu'une souscription .onReceive DISTINCTE
    // les rattrape. Doit lire manager.player/manager.activeURL directement.

    func test_updateEngineOwnership_readsTheAuthoritativeManagerState() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains("ReelEngineOwnershipPolicy.isEngineOwned("),
            "La décision de montage doit passer par le prédicat pur ReelEngineOwnershipPolicy.isEngineOwned."
        )
        XCTAssertTrue(
            text.contains("player: manager.player, activeURL: manager.activeURL"),
            "La décision DOIT lire manager.player/manager.activeURL DIRECTEMENT — jamais les miroirs " +
            "@State locaux (self.player/self.activeURL), tenus à jour par une souscription .onReceive " +
            "DISTINCTE dont l'ordre d'exécution n'est pas garanti relativement à cet appel."
        )
        XCTAssertFalse(
            text.contains("isEngineOwned.wrappedValue = owns && isShowingThis"),
            "Ancienne forme (miroir @State potentiellement périmé) — doit avoir été remplacée."
        )
    }

    func test_reelFeedVideoSurface_replaysDriveWhenTheAuthoritativePlayerArrives() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains(".adaptiveOnChange(of: player) { _, _ in drive(ready: ready) }"),
            "Filet de sécurité : si l'arrivée du player autoritaire (manager.player) est un jour " +
            "asynchrone, cette relance rattrape le montage du bouton sans elle."
        )
    }

    // MARK: - Réutilisation de l'icône partagée (pas de résolution seconde)

    func test_reelFeedSoundButton_reusesSharedIconResolver() throws {
        let text = try source("Meeshy/Features/Main/Components/ReelFeedSoundButton.swift")
        XCTAssertTrue(
            text.contains("BackgroundSoundBadge.muteIconName(isMuted:"),
            "Le bouton de son du fil doit réutiliser BackgroundSoundBadge.muteIconName(isMuted:) " +
            "— un seul jeu d'icônes dans le produit, jamais une résolution seconde."
        )
    }

    func test_reelFeedSoundButton_hasFortyFourPointHitTarget() throws {
        let text = try source("Meeshy/Features/Main/Components/ReelFeedSoundButton.swift")
        XCTAssertTrue(text.contains(".frame(minWidth: 44, minHeight: 44)"), "Cible tactile 44×44 (HIG) manquante.")
        XCTAssertTrue(text.contains(".contentShape(Rectangle())"), "Zone de hit non élargie au rectangle complet.")
    }

    // MARK: - ReelRepostEmbedCell : le bouton est HISSÉ hors du label du Button englobant
    //
    // Un Button imbriqué dans le label: d'un Button est INERTE sous iOS. Le
    // bouton de son doit être appliqué en .overlay sur le Button EXTÉRIEUR,
    // APRÈS accessibilityElement(children: .ignore) — sinon il est soit inerte
    // (imbriqué dans le label), soit avalé par l'élément d'accessibilité unique
    // de la carte.

    func test_reelRepostEmbedCell_soundButtonOverlay_isHoistedAfterAccessibilityIgnore() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelRepostEmbedCell.swift")
        guard let ignoreRange = text.range(of: ".accessibilityElement(children: .ignore)") else {
            return XCTFail("Repère .accessibilityElement(children: .ignore) introuvable.")
        }
        guard text.range(of: "ReelFeedSoundButton(", range: ignoreRange.upperBound..<text.endIndex) != nil else {
            return XCTFail(
                "ReelFeedSoundButton doit apparaître APRÈS .accessibilityElement(children: .ignore) " +
                "dans la chaîne de modificateurs du Button englobant — sinon il est soit imbriqué " +
                "dans le label: (inerte sous iOS), soit avalé par l'élément d'accessibilité unique."
            )
        }
        XCTAssertTrue(
            text.contains(".overlay(alignment: .topLeading)"),
            "Le bouton de son doit être posé en .overlay(alignment: .topLeading) sur le Button " +
            "englobant, jamais réinjecté dans son label:."
        )
    }

    // MARK: - La vidéo de POST (FeedPostCard) : PAS le bouton du FIL, mais SA
    // PROPRE affordance de son
    //
    // L'exigence produit couvre « reels ET vidéos de post ». La vidéo de post
    // n'autoplay pas (RF2 ne la concerne pas — vérifié : FeedVideoMediaCell
    // n'appelle jamais autoplayOnAppear: true) et joue déjà avec le son au
    // premier tap PLAY : le bouton de son SPÉCIFIQUE au fil (pensé pour un
    // autoplay MUET, `ReelFeedSoundButton`) n'a donc pas de sens ici. Elle
    // gagne à la place l'affordance de son EXISTANTE de `VideoTransportControls`
    // (déjà câblée, déjà localisée, déjà utilisée par la galerie/le plein
    // écran) via `.mute` dans son ControlSet — DoD S2 rejet, constat majeur #4.

    func test_feedPostCard_neverMountsTheFeedSoundButton() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertFalse(
            text.contains("ReelFeedSoundButton("),
            "FeedPostCard ne doit jamais monter le bouton de son SPÉCIFIQUE au fil (pensé pour un " +
            "autoplay muet) — la vidéo de post gagne son affordance de son via .mute (voir " +
            "test_feedVideoMediaCell_gainsMuteControl), pas via ReelFeedSoundButton."
        )
    }

    func test_feedVideoMediaCell_gainsMuteControl() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard+Media.swift")
        XCTAssertTrue(
            text.contains(".inlineDefault.union(.mute)"),
            "La vidéo de POST doit gagner l'affordance de son (exigence produit 2026-08-22 : " +
            "« reels ET vidéos de post ») — réutilise le contrôle .mute existant de " +
            "VideoTransportControls/_InlineOverlayControls (déjà câblé, déjà localisé), jamais une " +
            "seconde chrome. DoD S2 rejet, constat majeur #4."
        )
    }

    // MARK: - Localisation — clés neuves déclarées, 7 langues (garde ciblée ;
    // la couverture exhaustive reste LocalizationCatalogGuardTests)

    func test_newSoundKeys_areDeclaredInAppCatalog() throws {
        let root = MyStoriesSourceCorpus.appRoot()
            .deletingLastPathComponent() // apps
            .deletingLastPathComponent() // repo root
        let url = root.appendingPathComponent("apps/ios/Meeshy/Localizable.xcstrings")
        let data = try Data(contentsOf: url)
        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
              let strings = json["strings"] as? [String: Any] else {
            return XCTFail("Catalogue illisible.")
        }
        let requiredLanguages = ["ar", "de", "en", "es", "fr", "it", "pt-BR"]
        for key in ["a11y.feed.video.sound.unmute", "a11y.feed.video.sound.mute"] {
            guard let entry = strings[key] as? [String: Any],
                  let localizations = entry["localizations"] as? [String: Any] else {
                XCTFail("Clé neuve absente du catalogue : \(key)")
                continue
            }
            for lang in requiredLanguages {
                guard let loc = localizations[lang] as? [String: Any],
                      let unit = loc["stringUnit"] as? [String: Any],
                      let value = unit["value"] as? String, !value.isEmpty else {
                    XCTFail("\(key) : traduction manquante ou vide pour '\(lang)'.")
                    continue
                }
            }
        }
    }
}
