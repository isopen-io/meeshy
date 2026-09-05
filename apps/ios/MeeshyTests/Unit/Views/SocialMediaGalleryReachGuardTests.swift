import XCTest
@testable import Meeshy

/// **Toute surface sociale qui peut porter PLUSIEURS médias mène à la galerie**
/// (#4927).
///
/// ## Ce que ce témoin remplace
///
/// L'issue d'origine dressait un RELEVÉ : quatre hôtes de
/// `ConversationMediaGalleryView`, tous conformes. Un relevé dit « ces sites
/// appliquent la règle » ; il ne dit pas « ce sont les sites où la règle
/// s'applique ». C'est cette seconde affirmation, jamais vérifiée, qui a laissé
/// le lecteur de réels dehors pendant que la colonne « fait » paraissait pleine.
///
/// > Une énumération de sites porte deux affirmations, et une seule se mesure.
/// > Le témoin ci-dessous fait de la LISTE la chose gardée : y ajouter une
/// > surface est le geste attendu quand on en écrit une, et l'oublier ne coûte
/// > rien tant que personne ne publie plusieurs médias — exactement le défaut
/// > qu'on vient de réparer.
///
/// ## Pourquoi le réel n'est pas un cas à part
///
/// `ReelsPlayerView.mediaLayer` aiguille sur `primaryReelDisplayMedia`, qui
/// PRÉFÈRE la vidéo : un réel « une vidéo + deux photos » ne servait jamais les
/// photos. Le chemin IMAGE avait pourtant son carrousel depuis toujours — le
/// trou ne concernait que les réels MIXTES, ce qui le rendait invisible à la
/// lecture du fichier.
final class SocialMediaGalleryReachGuardTests: XCTestCase {

    /// Chaque surface sociale capable d'afficher un post à plusieurs médias, et
    /// le fichier qui doit ouvrir la galerie. Une entrée par SURFACE, pas par
    /// fichier : c'est la surface que l'utilisateur voit.
    private static let surfaces: [(name: String, file: String)] = [
        ("carte du fil",        "Meeshy/Features/Main/Views/FeedPostCard.swift"),
        ("détail d'un post",    "Meeshy/Features/Main/Views/PostDetailView.swift"),
        ("média d'un commentaire", "Meeshy/Features/Main/Views/CommentMediaView.swift"),
        ("fil de conversation", "Meeshy/Features/Main/Views/ConversationView+MediaGallery.swift"),
        ("plein écran réel",    "Meeshy/Features/Main/Views/ReelsPlayerView.swift"),
    ]

    /// Les deux formes acceptées : le site unique (`socialMediaGallery`) et le
    /// montage direct, que les surfaces antérieures utilisent encore. Le témoin
    /// garde le CHEMIN, pas la façon de le composer — convertir un hôte au site
    /// unique ne doit pas le faire rougir.
    private static let reachMarkers = ["socialMediaGallery(", "ConversationMediaGalleryView("]

    private func source(_ relativePath: String) throws -> String {
        try MyStoriesSourceCorpus.text(of: relativePath)
    }

    func test_chaqueSurfaceSocialeMeneALaGalerie() throws {
        for surface in Self.surfaces {
            let code = try source(surface.file)
            let reaches = Self.reachMarkers.contains { code.contains($0) }

            XCTAssertTrue(
                reaches,
                "la surface « \(surface.name) » ne mène à aucune galerie : un post à "
                + "plusieurs médias n'y sert que le premier, et rien ne le signale."
            )
        }
    }

    /// Le site unique doit servir la LÉGENDE, sinon le plein écran perd ce que
    /// la surface d'origine affichait — le défaut réparé par #4934, qu'un
    /// quatrième exemplaire recopié aurait pu réintroduire.
    func test_leSiteUniqueSertLaLegendeEtSesAlternatives() throws {
        let code = try source("Meeshy/Features/Main/Views/SocialMediaGalleryPresentation.swift")

        XCTAssertTrue(code.contains("SocialMediaCaption.map("),
                      "la légende simple doit être servie")
        XCTAssertTrue(code.contains("SocialMediaCaption.serving("),
                      "…et ses alternatives de langue, sans quoi la bascule disparaît en plein écran")
    }

    /// La pastille du réel n'existe QUE lorsqu'elle a un effet — loi 4 : un
    /// contrôle sans effet est absent, jamais grisé.
    func test_laPastilleDuReelNApparaitQuAvecPlusieursMedias() throws {
        let code = try source("Meeshy/Features/Main/Views/ReelsPlayerView.swift")

        XCTAssertTrue(code.contains("if galleryMediaCount > 1 {"),
                      "la pastille se monte sous condition du nombre de médias")
        XCTAssertTrue(code.contains("ReelMediaCountBadge("),
                      "…et c'est bien la pastille qui est montée")
    }
}
