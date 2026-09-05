import XCTest
@testable import Meeshy

/// **Vue `3e` (#4095) — la galerie plein écran ne montre que ce qu'elle JOUE.**
///
/// > « Le muet de la galerie est celui du lecteur vidéo, pas celui du fond.
/// > Cette surface n'annonce aucun son de fond : elle ne montre que ce qu'elle
/// > joue réellement, contrôles compris. »
///
/// La doctrine est déjà respectée par le code — et c'est précisément pour ça
/// qu'elle avait besoin d'un cliquet. Une conformité qui tient par accident
/// d'histoire ne survit pas à la prochaine main : `BackgroundSoundBadge` est
/// monté sur TROIS surfaces voisines (carte de fil, viewer story, plein écran
/// réel), toutes atteignables depuis les mêmes fichiers, et rien n'expliquait
/// pourquoi la quatrième — la galerie — devait s'en passer.
///
/// **La raison, écrite ici pour qu'elle ne se reperde pas :** les trois autres
/// surfaces rendent une SCÈNE, dont la piste de fond fait partie du contenu.
/// La galerie rend une PIÈCE JOINTE — une image, une vidéo. Le son de fond
/// d'un post n'y joue pas, donc l'annoncer promettrait un son que la surface
/// ne sert pas, et le muet qu'on lui accolerait ne piloterait rien. C'est la
/// loi 4 du `BOUCLE.md` prise par l'autre bout : un contrôle n'existe que s'il
/// a un effet, et une ANNONCE n'existe que si elle décrit ce qui joue ici.
///
/// Trois témoins, dont un fusible. Le fusible n'est pas décoratif : les deux
/// premiers sont l'un négatif, l'autre satisfait par une seule chaîne — deux
/// formes qui passent au vert en ne regardant rien.
final class FullscreenGallerySoundScopeGuardTests: XCTestCase {

    private static let gallery = "Meeshy/Features/Main/Views/ConversationMediaGalleryView.swift"

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    /// Racine du dépôt — la galerie délègue son muet à un composant du SDK, et
    /// la promesse « c'est celui du lecteur vidéo » ne se vérifie que là-bas.
    private func sdkSource(_ relativePath: String) throws -> String {
        let repoRoot = MyStoriesSourceCorpus.appRoot()
            .deletingLastPathComponent()   // apps
            .deletingLastPathComponent()   // racine
        return try String(contentsOf: repoRoot.appendingPathComponent(relativePath), encoding: .utf8)
    }

    // MARK: - 1. Aucune annonce de son de fond

    func test_theGallery_neverAnnouncesABackgroundSound() throws {
        let text = try source(Self.gallery)

        for forbidden in ["BackgroundSoundBadge", "storyEffects", "backgroundAudio"] {
            XCTAssertFalse(
                text.contains(forbidden),
                "Vue `3e` : la galerie ne doit RIEN dire du son de fond (« \(forbidden) »). " +
                "Elle rend une pièce jointe, pas une scène — la piste de fond du post n'y " +
                "joue pas, donc l'annoncer promettrait un son que la surface ne sert pas."
            )
        }
    }

    // MARK: - 2. Le muet montré est celui du lecteur

    func test_theGalleryMute_isThePlayers_neverALocalState() throws {
        let text = try source(Self.gallery)

        XCTAssertTrue(
            text.contains("VideoTransportControls("),
            "La galerie monte le transport vidéo partagé — c'est LUI qui porte le muet."
        )
        for localState in ["@State private var isMuted", "@State var isMuted", "isCanvasMuted"] {
            XCTAssertFalse(
                text.contains(localState),
                "Vue `3e` : la galerie ne doit déclarer AUCUN état muet à elle (« \(localState) »). " +
                "Un second état diverge du lecteur dès la première surface qui le remet à zéro, " +
                "et l'icône se met alors à mentir sur ce qu'on entend."
            )
        }
    }

    // MARK: - 3. Fusible — le transport porte VRAIMENT un muet câblé

    /// Sans ce témoin, le précédent tient sur une seule chaîne : le jour où
    /// `VideoTransportControls` perdrait son bouton, « le muet de la galerie
    /// est celui du lecteur » resterait VERT en ne décrivant plus aucun muet.
    /// La garde suit la promesse jusqu'à son effet, pas jusqu'à son nom.
    func test_theSharedTransport_reallyCarriesAMuteWiredToThePlayer() throws {
        let transport = try sdkSource(
            "packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift")

        XCTAssertTrue(
            transport.contains("manager.isMuted.toggle()"),
            "Le transport partagé doit BASCULER le muet du lecteur — pas un état décoratif."
        )
        XCTAssertTrue(
            transport.contains("manager.isMuted ? \"speaker.slash.fill\" : \"speaker.wave.2.fill\""),
            "L'icône doit dire l'état RÉEL du lecteur."
        )
    }

    /// Fusible de lecture : une garde de source qui lit le vide passe au vert
    /// sur toutes ses assertions négatives sans qu'aucune ne puisse le dire.
    func test_theGuardActuallyReadsItsSources() throws {
        XCTAssertGreaterThan(try source(Self.gallery).count, 5_000)
        XCTAssertGreaterThan(
            try sdkSource("packages/MeeshySDK/Sources/MeeshyUI/Media/VideoTransportControls.swift").count,
            1_000)
    }
}
