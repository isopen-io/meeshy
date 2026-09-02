import XCTest
@testable import Meeshy

/// **Toutes les surfaces sociales qui jouent un audio élisent leur piste**
/// (#4926).
///
/// ## Pourquoi une garde par SURFACE et non par fichier
///
/// `FocalMatrixWiringGuardTests` gardait déjà la règle — pour `AudioMediaView`,
/// c'est-à-dire pour la conversation. Elle était juste, elle passait, et cinq
/// surfaces sociales jouaient un audio sans jamais appeler la loi.
///
/// > **Une garde qui nomme UN fichier prouve que ce fichier applique la règle,
/// > jamais que ce sont les seuls fichiers où elle s'applique** (leçon 261).
///
/// Le cliquet est donc `SocialAudioSurface.allCases` : la table ci-dessous doit
/// couvrir CHAQUE cas, et une septième surface fait tomber ce fichier avant
/// même d'atteindre une assertion de contenu. C'est ce qui manquait — les cinq
/// surfaces muettes n'étaient nommées nulle part, donc aucune garde ne POUVAIT
/// rougir.
@MainActor
final class SocialAudioSurfaceWiringGuardTests: XCTestCase {

    private func source(_ relativePath: String) throws -> String {
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()   // Unit/Models
            .deletingLastPathComponent()   // Unit
            .deletingLastPathComponent()   // MeeshyTests
            .deletingLastPathComponent()   // apps/ios
            .appendingPathComponent(relativePath)
        return try String(contentsOf: url, encoding: .utf8)
    }

    /// Le fichier qui MONTE le lecteur audio de chaque surface.
    private static let files: [SocialAudioSurface: String] = [
        .feedPostCard:       "Meeshy/Features/Main/Views/FeedPostCard+Media.swift",
        .postDetail:         "Meeshy/Features/Main/Views/PostDetailView.swift",
        .comment:            "Meeshy/Features/Main/Views/CommentMediaView.swift",
        .reel:               "Meeshy/Features/Main/Views/ReelsPlayerView.swift",
        .audioFullscreen:    "Meeshy/Features/Main/Views/AudioFullscreenView.swift",
        .repostLegacyAudio:  "Meeshy/Features/Main/Views/PostDetailView+RepostEmbed.swift"
    ]

    /// **Le cliquet.** Une surface déclarée sans fichier fait tomber CE témoin,
    /// et il est le premier — donc l'oubli se signale avant tout le reste.
    func test_chaqueSurfaceDeclaree_aUnFichier() {
        for surface in SocialAudioSurface.allCases {
            XCTAssertNotNil(Self.files[surface],
                            "\(surface.rawValue) n'a pas de fichier : la garde ne peut rien vérifier")
        }
        XCTAssertEqual(Self.files.count, SocialAudioSurface.allCases.count)
    }

    /// **La PREUVE DE VIE de chaque surface — et elle n'est pas la même pour
    /// toutes.**
    ///
    /// Ce fusible a mordu à sa première exécution, et il avait raison : j'avais
    /// écrit `AudioPlayerView(` comme fragment de contrôle pour les SIX
    /// surfaces. Or `AudioFullscreenView` **EST** le lecteur — il pilote
    /// directement `AudioPlaybackManager` et ne monte aucun `AudioPlayerView`.
    /// Le fragment partagé décrivait cinq surfaces sur six.
    ///
    /// > **Un fusible qui suppose que toutes les surfaces se ressemblent teste
    /// > la ressemblance, pas la vie.** Il doit être propre à chacune — sinon il
    /// > tombe sur celle qui diffère (au mieux), ou passe sur un fragment si
    /// > générique qu'il ne prouve plus rien (au pire).
    private static let proofOfLife: [SocialAudioSurface: String] = [
        .feedPostCard:       "AudioPlayerView(",
        .postDetail:         "AudioPlayerView(",
        .comment:            "AudioPlayerView(",
        .reel:               "AudioPlayerView(",
        .repostLegacyAudio:  "AudioPlayerView(",
        .audioFullscreen:    "AudioPlaybackManager"
    ]

    /// Une garde de source qui ne lit rien passe au vert en ne protégeant plus
    /// rien — c'est le mode d'extinction silencieux des gardes de source. On
    /// prouve d'abord que la lecture fonctionne.
    func test_leLecteurDeSource_litVraimentLesFichiers() throws {
        for surface in SocialAudioSurface.allCases {
            let chemin = try XCTUnwrap(Self.files[surface])
            let fragment = try XCTUnwrap(Self.proofOfLife[surface],
                                         "\(surface.rawValue) n'a pas de preuve de vie")
            let code = try source(chemin)
            XCTAssertGreaterThan(code.count, 500, "\(chemin) est vide ou illisible")
            XCTAssertTrue(code.contains(fragment),
                          "\(surface.rawValue) : \(chemin) ne contient plus « \(fragment) » — la table est périmée")
        }
    }

    /// **Le cœur.** Chaque surface qui TRANSPORTE des pistes traduites élit la
    /// sienne par la loi partagée.
    func test_chaqueSurfacePorteusseDePistes_elitParLaLoiPartagee() throws {
        for surface in SocialAudioSurface.allCases where surface.carriesTranslatedTracks {
            let chemin = try XCTUnwrap(Self.files[surface])
            let code = AppSourceGuard.stripComments(try source(chemin))
            XCTAssertTrue(
                code.contains("SocialAudioTrack.") || code.contains("ReelAudioLanguageResolver.preferredAudioLanguage("),
                """
                \(surface.rawValue) (\(chemin)) joue un audio sans élire sa piste. \
                Le lecteur entendra la langue de l'auteur alors que sa traduction \
                voyage dans le même objet — c'est le défaut de #4926.
                """
            )
        }
    }

    /// **La déclaration inverse se vérifie AUSSI**, sinon elle rote.
    ///
    /// `repostLegacyAudio` déclare ne transporter aucune piste. Le jour où ce
    /// chemin gagne un `FeedMedia`, ce témoin tombe et réclame son élection —
    /// au lieu de laisser une surface muette derrière une exemption que plus
    /// personne ne relit.
    func test_uneSurfaceSansPiste_nEnTransporteToujoursAUCUNE() throws {
        for surface in SocialAudioSurface.allCases where !surface.carriesTranslatedTracks {
            let chemin = try XCTUnwrap(Self.files[surface])
            let code = AppSourceGuard.stripComments(try source(chemin))
            XCTAssertFalse(
                code.contains("translatedAudios:"),
                """
                \(surface.rawValue) (\(chemin)) transporte désormais des pistes \
                traduites : `carriesTranslatedTracks` doit passer à `true` et la \
                surface doit élire sa piste.
                """
            )
        }
    }

    /// La loi de rang n'est écrite qu'à UN endroit. Le réel en avait une
    /// seconde, mot pour mot — deux lois justes qui ne rougissent nulle part le
    /// jour où l'une évolue.
    func test_leReel_neReecritPlusLaLoiDeRang() throws {
        let code = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")
        )
        XCTAssertTrue(code.contains("AudioTrackLanguageResolver.resolve("),
                      "ReelAudioLanguageResolver doit DÉLÉGUER à la loi partagée")
        XCTAssertFalse(code.contains("if let origLang, origLang == lang"),
                       "le parcours de rang recopié est revenu dans ReelsPlayerView")
    }

    /// Le plein écran n'écrit plus sa langue en littéral. C'ÉTAIT le défaut :
    /// `selectedLanguage = "orig"` ne consultait rien.
    func test_lePleinEcran_nInitialisePlusSaLangueEnLitteral() throws {
        let code = AppSourceGuard.stripComments(
            try source("Meeshy/Features/Main/Views/AudioFullscreenView.swift")
        )
        XCTAssertFalse(code.contains("var selectedLanguage: String = \"orig\""),
                       "la langue du plein écran redevient un littéral — elle ne consulte plus le Prisme")
        XCTAssertTrue(code.contains("SocialAudioTrack.fullscreenSelection("),
                      "le plein écran doit naître sur la langue élue")
    }
}
