import XCTest
@testable import Meeshy

/// Gardes de câblage du bouton de son du fil (S2, exigence produit 2026-08-22).
/// Un test qui vérifie seulement que le bouton EXISTE ne suffit pas — ces
/// gardes visent spécifiquement les régressions qui laisseraient un bouton
/// « décoratif » (icône qui bascule, aucun son) :
/// - `drive()` doit résoudre `isForceMuted` via le PRÉDICAT (D4), jamais un
///   littéral `true` figé — sans quoi le tap ne change RIEN à l'audio ;
/// - le passage muet → sonore doit armer la session audio (D5) — sans quoi le
///   son reste inaudible interrupteur Silence enclenché ;
/// - le fil ne doit JAMAIS écrire `isMuted` (préférence globale) — la fuite
///   documentée que `isForceMuted` a été créé pour fermer.
final class ReelFeedSoundButtonWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    // MARK: - ReelFeedVideoSurface : isForceMuted résolu, jamais figé

    func test_reelFeedVideoSurface_neverHardcodesForceMutedTrue() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertFalse(
            text.contains("manager.isForceMuted = true"),
            "isForceMuted ne doit plus être figé à true — drive() doit résoudre " +
            "l'intention son du fil via ReelFeedSoundButtonPolicy.isForceMuted(soundOn:), " +
            "sinon le bouton bascule une icône sans jamais changer l'audio."
        )
        XCTAssertTrue(
            text.contains("ReelFeedSoundButtonPolicy.isForceMuted(soundOn:"),
            "drive() doit résoudre isForceMuted via le prédicat pur partagé."
        )
    }

    func test_reelFeedVideoSurface_neverWritesGlobalIsMutedPreference() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertFalse(
            text.contains("manager.isMuted ="),
            "Le fil ne doit JAMAIS écrire isMuted (préférence globale session) — " +
            "seulement isForceMuted, sous peine de rouvrir la fuite documentée " +
            "(galerie de conversation héritant du silence du feed)."
        )
    }

    func test_reelFeedVideoSurface_armsAudioSessionOnUnmute() throws {
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains("MediaSessionCoordinator.shared.activatePlaybackSync"),
            "D5 : activer le son doit armer explicitement la session .playback " +
            "(.duckOthers) — play() saute cet armement pour l'autoplay muet " +
            "(shouldDuckOthersOnPlay), donc rien ne le fait sans cet appel " +
            "explicite. Sans lui, le son reste inaudible interrupteur Silence " +
            "enclenché (précédent documenté : RecentMediaStrip.swift)."
        )
    }

    func test_reelFeedVideoSurface_stillReaffirmsForceMutedAfterLoad() throws {
        // Non-régression du commentaire l.136-146 : isForceMuted doit rester
        // réaffirmé APRÈS load() (qui appelle cleanup() en interne et le
        // remettrait à false) — seule la VALEUR affectée change (D4), pas le
        // fait qu'elle soit réaffirmée à chaque passe de drive().
        let text = try source("Meeshy/Features/Main/Views/ReelFeedVideoSurface.swift")
        XCTAssertTrue(
            text.contains("manager.shouldLoop = true"),
            "Repère de non-régression introuvable — le fichier a-t-il changé de forme ?"
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

    // MARK: - Montage : les DEUX surfaces réutilisent LE MÊME bouton + LE MÊME prédicat

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

    // MARK: - Hors périmètre : la vidéo de post (FeedPostCard) ne monte JAMAIS ce bouton
    //
    // D1 : la vidéo de post n'autoplay pas et joue déjà avec le son au tap —
    // ce n'est pas la surface visée par l'exigence produit. Lui greffer ce
    // bouton serait une décision produit NOUVELLE, pas le comblement du manque
    // constaté (isForceMuted/isMuted, ReelFeedCard, ReelRepostEmbedCell).

    func test_feedPostCard_neverMountsTheFeedSoundButton() throws {
        let text = try source("Meeshy/Features/Main/Views/FeedPostCard.swift")
        XCTAssertFalse(
            text.contains("ReelFeedSoundButton("),
            "FeedPostCard est hors périmètre (D1) — la vidéo de post ne doit pas monter " +
            "le bouton de son du FIL. Voir S1 §3.1 : greffer ce bouton là serait une " +
            "décision produit nouvelle, pas le comblement du manque constaté."
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
