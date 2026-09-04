import XCTest
@testable import Meeshy
@testable import MeeshySDK

/// #4994 — **une porte du rail dit combien elle porte.**
///
/// > « lorsqu'une donnée a été faite (mise) pour un des composants, il faut
/// > insérer le compteur par dessus le composant ! » — porteur, 2026-09-03
///
/// ## Ce que ces témoins gardent, et qui n'est pas l'arithmétique
///
/// Compter des tableaux est trivial ; ce qui ne l'est pas est de compter les
/// BONS. Deux pièges, tous deux invisibles sur une scène nominale :
/// - un FOND vit dans le même tableau que les objets posés (leçon du #4935) ;
/// - un hashtag écrit deux fois avec deux casses est UN hashtag pour le
///   serveur, et deux pour une somme naïve.
final class ComposerRailDoorBadgeTests: XCTestCase {

    // MARK: - Fabriques

    private func slide(_ build: (inout StoryEffects) -> Void) -> StorySlide {
        var effets = StoryEffects()
        build(&effets)
        var s = StorySlide(id: "s1")
        s.effects = effets
        return s
    }

    private func audio(_ id: String, background: Bool) -> StoryAudioPlayerObject {
        var son = StoryAudioPlayerObject(postMediaId: "", placement: "overlay",
                                         x: 0.5, y: 0.5, volume: 1, waveformSamples: [])
        son.id = id
        son.isBackground = background ? true : nil
        return son
    }

    /// **`hashtags` est un COMPTE, pas un texte** (#5007) : la dérivation vit
    /// chez le meuble (`composerHashtags`), site unique que la feuille et le
    /// sélecteur lisent déjà. Le relevé la REÇOIT, exactement comme il reçoit
    /// `mentions` — c'est l'asymétrie entre les deux qui trahissait le doublon.
    private func matter(_ slide: StorySlide,
                        hashtags: Int = 0,
                        description: String = "",
                        mentions: Int = 0,
                        location: Bool = false) -> ComposerRailMatter {
        ComposerRailDoorBadge.matter(slide: slide,
                                     hashtags: hashtags,
                                     description: description,
                                     mentions: mentions,
                                     hasDocumentLocation: location)
    }

    // MARK: - Zéro ⇒ rien de peint

    /// **La loi 4 appliquée à un témoin.** Un « 0 » grisé n'apprend rien et
    /// occupe la place de ce qui apprend.
    func test_uneScèneVierge_neDonneAucunePastille() {
        let relevé = matter(slide { _ in })
        for porte in ComposerRailDoor.allCases {
            XCTAssertNil(ComposerRailDoorBadge.count(porte, in: relevé),
                         "\(porte) ne porte rien, elle ne doit rien afficher")
        }
        XCTAssertTrue(ComposerRailDoorBadge.badges(for: ComposerRailDoor.canonicalRail,
                                                   in: relevé).isEmpty)
    }

    // MARK: - Chaque porte compte ce qu'elle prétend compter

    func test_chaquePorte_compteSaPropreMatière() {
        let s = slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "un"),
                             StoryTextObject(id: "t2", text: "deux"),
                             StoryTextObject(id: "t3", text: "trois")]
            e.mediaObjects = [StoryMediaObject(id: "m1", aspectRatio: 1),
                              StoryMediaObject(id: "m2", aspectRatio: 1)]
            e.audioPlayerObjects = [audio("a1", background: false)]
            e.stickerObjects = [StorySticker(id: "k1", emoji: "🎈"),
                                StorySticker(id: "k2", emoji: "🔥"),
                                StorySticker(id: "k3", emoji: "🌟"),
                                StorySticker(id: "k4", emoji: "🎉")]
            e.locationObjects = [StoryLocationObject(
                id: "l1", place: SharedPlace(latitude: 48.8, longitude: 2.3, name: "Paris"))]
            e.drawingStrokes = (0..<7).map { _ in
                StoryDrawingStroke(colorHex: "FFFFFF", width: 4)
            }
        }
        // `#voyage`, `#Voyage` et `#été` ⇒ DEUX balises : la dé-duplication par
        // casse appartient à `ComposerHashtags`, dont le meuble sert le
        // résultat. Le relevé ne la refait pas — il ne peut plus se tromper
        // dessus.
        let relevé = matter(s,
                            hashtags: 2,
                            description: "un mot",
                            mentions: 2,
                            location: true)

        XCTAssertEqual(ComposerRailDoorBadge.count(.text, in: relevé), 3)
        XCTAssertEqual(ComposerRailDoorBadge.count(.media, in: relevé), 2)
        XCTAssertEqual(ComposerRailDoorBadge.count(.sound, in: relevé), 1)
        XCTAssertEqual(ComposerRailDoorBadge.count(.sticker, in: relevé), 4)
        XCTAssertEqual(ComposerRailDoorBadge.count(.drawing, in: relevé), 7)
        XCTAssertEqual(ComposerRailDoorBadge.count(.mention, in: relevé), 2)
        XCTAssertEqual(ComposerRailDoorBadge.count(.description, in: relevé), 1)
        // La pastille de scène ET le lieu de la publication : la porte sert les
        // deux niveaux selon le format, son compte les additionne.
        XCTAssertEqual(ComposerRailDoorBadge.count(.place, in: relevé), 2)
        XCTAssertEqual(ComposerRailDoorBadge.count(.hashtag, in: relevé), 2)
    }

    // MARK: - Le fond n'est pas un objet posé

    /// **Le fond COMPTE sur la porte image** (#5014, directive porteur
    /// 2026-09-03 : « l'image de fond ou la vidéo de fond d'une scène compte
    /// comme un élément dans outils image »).
    ///
    /// Ce témoin affirmait l'inverse jusqu'au #5014, et il avait raison sous la
    /// règle d'alors — il suivait `ComposerSceneObjectCount`, qui exclut le
    /// fond parce qu'il n'est pas un objet POSÉ. La directive renverse la
    /// règle, pas le code : **deux règles voisines peuvent compter la même
    /// famille et devoir diverger, parce que ce n'est pas la MATIÈRE qui décide
    /// du filtre mais la QUESTION.**
    ///
    /// La scène qui n'a QU'un fond reste le cas discriminant — c'est le seul où
    /// l'ancienne règle et la nouvelle rendent des verdicts différents.
    func test_unMédiaDeFond_compteSurLaPorteImage() {
        let deuxDontUnFond = slide { e in
            e.mediaObjects = [StoryMediaObject(id: "m1", aspectRatio: 1),
                              StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true)]
        }
        XCTAssertEqual(ComposerRailDoorBadge.count(.media, in: matter(deuxDontUnFond)), 2)

        let fondSeul = slide { e in
            e.mediaObjects = [StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true)]
        }
        XCTAssertEqual(ComposerRailDoorBadge.count(.media, in: matter(fondSeul)), 1,
                       "une scène qui n'a qu'un fond porte bien UNE image")
    }

    /// **La porte du FOND ne porte AUCUNE pastille** (#5014) — et c'est une
    /// réponse, pas un oubli.
    ///
    /// Le fond étant compté par la porte image, l'annoncer ici l'afficherait
    /// deux fois sur deux icônes voisines du même rail : une scène qui n'a
    /// qu'un fond dirait « une image » ET « un fond », que l'auteur lit comme
    /// deux images. Et le signal n'est pas perdu — le fond remplit la carte,
    /// c'est la seule matière qu'on ne peut pas manquer à l'écran.
    func test_laPorteDuFond_nePorteAucunePastille() {
        let avecFond = slide { e in
            e.mediaObjects = [StoryMediaObject(id: "fond", aspectRatio: 1.777, isBackground: true)]
        }
        XCTAssertNil(ComposerRailDoorBadge.count(.background, in: matter(avecFond)))
        XCTAssertNil(ComposerRailDoorBadge.count(.background, in: matter(slide { _ in })))
    }

    /// Le son de FOND compte : la porte `sound` ouvre la feuille des deux
    /// placements, et n'en montrer qu'un laisserait la bande-son invisible sur
    /// la seule porte qui la sert.
    func test_leSonDeFond_compteSurLaPorteQuiLeSert() {
        let relevé = matter(slide { e in e.audioPlayerObjects = [audio("bg", background: true)] })
        XCTAssertEqual(ComposerRailDoorBadge.count(.sound, in: relevé), 1)
    }

    /// Une description faite d'espaces n'est pas une description.
    func test_uneDescriptionBlanche_neComptePas() {
        XCTAssertNil(ComposerRailDoorBadge.count(.description,
                                                 in: matter(slide { _ in }, description: "   \n ")))
    }

    /// **Un fond de COULEUR n'est pas une image.** La porte image sert des
    /// médias ; une couleur choisie dans la palette n'en est pas un, et la
    /// compter ferait promettre une image que l'auteur ne trouverait pas.
    func test_unFondDeCouleur_neCompteSurAucuneDesDeuxPortes() {
        let relevé = matter(slide { _ in })
        XCTAssertNil(ComposerRailDoorBadge.count(.media, in: relevé))
        XCTAssertNil(ComposerRailDoorBadge.count(.background, in: relevé))
    }

    // MARK: - La carte servie au rail

    func test_laCarte_neContientQueLesPortesQuiPortentQuelqueChose() {
        let relevé = matter(slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "un"),
                             StoryTextObject(id: "t2", text: "deux")]
        }, mentions: 1)
        let carte = ComposerRailDoorBadge.badges(for: ComposerRailDoor.canonicalRail, in: relevé)
        XCTAssertEqual(carte, [.text: 2, .mention: 1])
    }

    /// La carte ne parle que des portes SERVIES : une porte absente du rail
    /// n'a pas de pastille à peindre, même si sa matière existe.
    func test_laCarte_ignoreCeQueLeRailNeSertPas() {
        let relevé = matter(slide { e in
            e.textObjects = [StoryTextObject(id: "t1", text: "un"),
                             StoryTextObject(id: "t2", text: "deux")]
            e.stickerObjects = [StorySticker(id: "k1", emoji: "🎈")]
        })
        XCTAssertEqual(ComposerRailDoorBadge.badges(for: [.text], in: relevé), [.text: 2])
    }
}
