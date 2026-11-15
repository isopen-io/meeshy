import XCTest
@testable import MeeshySDK

/// **Une scène qui BOUGE est une vidéo ; une scène qui ne bouge pas est une
/// image** (directive porteur 2026-09-06).
///
/// > « Une scène cinématique (qui n'est pas statique) doit être considérée
/// > comme une vidéo ! Le bouton stop et play permet d'arrêter tout ou de
/// > poursuivre tout. »
///
/// ## Pourquoi cette règle doit être PURE, et pourquoi elle doit exister
///
/// Trois surfaces posent aujourd'hui la même question sans jamais l'écrire :
/// la carte du fil concourt à l'élection d'autoplay pour TOUTE scène — y
/// compris une scène de texte, qui occupe alors l'unique place jouante du fil
/// sans avoir rien à jouer ; le plein écran lève `isPlaying` à l'apparition
/// sans savoir s'il y a du mouvement ; et rien nulle part ne dit à VoiceOver
/// qu'un canvas est animé.
///
/// > **Un contrôle de lecture posé sur une image fixe est un contrôle inerte**
/// > (loi 4) — et une scène fixe qui remporte l'élection d'autoplay est pire
/// > qu'inerte : elle TAIT la vidéo voisine.
///
/// ## Ce que « cinématique » recouvre, et ce qu'il exclut
///
/// Le mouvement, jamais la durée. Une image affichée cinq secondes ne bouge
/// pas : `timelineDuration` mesure un temps de séjour, pas une animation, et
/// le composer le stampe sur des slides parfaitement fixes.
final class SceneMotionTests: XCTestCase {

    // MARK: - Fabriques

    private func objet(_ kind: ObjectKind,
                       timing: TimingV3? = nil,
                       payload: [String: CanvasJSONValue] = [:]) -> ObjectV3 {
        ObjectV3(id: "o-\(kind.wireValue)", kind: kind,
                 anchor: .free(x: 0.5, y: 0.5), plane: .content, z: 1,
                 transform: TransformV3(), timing: timing, payload: payload)
    }

    private func scene(_ objets: [ObjectV3],
                       opening: [String: CanvasJSONValue]? = nil,
                       closing: [String: CanvasJSONValue]? = nil,
                       clipTransitions: [[String: CanvasJSONValue]]? = nil,
                       timelineDuration: Double? = nil) -> SceneV3 {
        SceneV3(id: "s1", objects: objets, opening: opening, closing: closing,
                clipTransitions: clipTransitions, timelineDuration: timelineDuration)
    }

    // MARK: - Ce qui NE bouge pas

    /// Une scène de texte, de dessin, de stickers fixes sur un fond de couleur
    /// : rien n'y bouge, et lui donner un bouton de lecture serait promettre
    /// une lecture qui n'arrivera pas.
    func test_uneScenePurementStatique_nEstPasCinematique() {
        let statique = scene([objet(.text, payload: ["content": .string("PRINTEMPS")]),
                              objet(.drawing),
                              objet(.sticker, payload: ["emoji": .string("🌸")])])
        XCTAssertFalse(SceneMotion.isCinematic(statique))
    }

    /// **Une photo en fond n'anime rien.** C'est le cas nominal d'un post
    /// composé, et le plus important à tenir : s'il basculait du côté vidéo,
    /// toute scène serait cinématique et la règle ne dirait plus rien.
    func test_unePhotoEnFond_nEstPasCinematique() {
        let photo = scene([objet(.media, payload: ["mediaType": .string("image"),
                                                   "mediaURL": .string("k/photo.jpg")])])
        XCTAssertFalse(SceneMotion.isCinematic(photo))
    }

    /// **La durée d'un MÉDIA n'anime rien non plus.** `payload["duration"]`
    /// porte la longueur du clip ; une image affichée dix secondes en porte
    /// une et ne bouge pas. Sans cette distinction, toute publication photo
    /// passée par le composer deviendrait « une vidéo ».
    func test_unePhotoQuiDeclareUneDuree_nEstPasCinematique() {
        let photo = scene([objet(.media, payload: ["mediaType": .string("image"),
                                                   "duration": .number(10)])])
        XCTAssertFalse(SceneMotion.isCinematic(photo))
    }

    /// **Une DURÉE n'est pas un mouvement.** Le composer stampe
    /// `timelineDuration` sur des slides fixes ; la retenir comme critère
    /// rendrait cinématique à peu près tout ce qui sort du composer.
    func test_uneDureeDeTimelineSeule_neRendPasCinematique() {
        let posee = scene([objet(.text)], timelineDuration: 5)
        XCTAssertFalse(SceneMotion.isCinematic(posee),
                       "une image affichée cinq secondes ne bouge pas — elle SÉJOURNE")
    }

    // MARK: - Ce qui bouge

    /// Le cas évident, et celui que la directive nomme : une vidéo.
    func test_uneVideo_estCinematique() {
        let clip = scene([objet(.media, payload: ["mediaType": .string("video"),
                                                  "mediaURL": .string("k/clip.mp4")])])
        XCTAssertTrue(SceneMotion.isCinematic(clip))
    }

    /// Le son n'a pas d'image et pourtant il se JOUE : sans lui, un canvas
    /// purement sonore n'aurait aucun bouton pour s'arrêter.
    func test_unePisteAudio_estCinematique() {
        XCTAssertTrue(SceneMotion.isCinematic(scene([objet(.audio)])))
    }

    /// Une décoration animée (`animation` au payload d'un sticker) bouge à
    /// l'écran — c'est ce que `StoryStickerMotionClock` fait vivre.
    func test_unStickerAnime_estCinematique() {
        let anime = scene([objet(.sticker, payload: ["animation": .string("pulse")])])
        XCTAssertTrue(SceneMotion.isCinematic(anime))
    }

    /// Un objet qui APPARAÎT ou DISPARAÎT dans le temps anime la scène, même
    /// si la scène ne porte ni vidéo ni son : c'est exactement ce que
    /// `RenderableItem.isStatic` nie déjà côté rendu.
    func test_unObjetQuiApparaitDansLeTemps_estCinematique() {
        let fenetre = scene([objet(.text, timing: TimingV3(start: 1, end: 3))])
        XCTAssertTrue(SceneMotion.isCinematic(fenetre))
    }

    /// Les timings des objets story voyagent au PAYLOAD (`fadeIn`, `fadeOut`,
    /// `duration`), pas seulement dans `timing` — la migration v1→v3 les y
    /// écrit. Ne lire que `timing` raterait tout le contenu converti.
    func test_unFonduAuPayload_estCinematique() {
        let fondu = scene([objet(.text, payload: ["fadeIn": .number(0.4)])])
        XCTAssertTrue(SceneMotion.isCinematic(fondu),
                      "la migration v1→v3 écrit les fondus au payload : les ignorer " +
                      "rendrait statique tout le contenu converti")
    }

    /// Une transition d'ouverture, de fermeture ou entre clips est une
    /// animation choisie par l'auteur.
    func test_uneTransition_estCinematique() {
        XCTAssertTrue(SceneMotion.isCinematic(scene([objet(.text)],
                                                    opening: ["type": .string("fade")])))
        XCTAssertTrue(SceneMotion.isCinematic(scene([objet(.text)],
                                                    closing: ["type": .string("fade")])))
        XCTAssertTrue(SceneMotion.isCinematic(
            scene([objet(.text)], clipTransitions: [["type": .string("crossfade")]])))
    }

    // MARK: - Ce qui a du SON

    /// **« Bouger » et « avoir du son » sont deux questions** (constat porteur
    /// 2026-09-06 : « les scènes cinématiques jouent avec signe audio barré »).
    ///
    /// Une vidéo MUETTE bouge sans rien faire entendre ; un son de fond se fait
    /// entendre sans rien montrer. Répondre à la seconde question avec la
    /// première poserait un haut-parleur barré sur une scène qui n'a aucun son
    /// à couper — la définition d'un indicateur qui ment.
    func test_uneVideoMUETTE_bougeSansEtreAudible() {
        let muette = scene([objet(.media, payload: ["mediaType": .string("video"),
                                                    "muted": .bool(true)])])
        XCTAssertTrue(SceneMotion.isCinematic(muette), "elle bouge")
        XCTAssertFalse(SceneMotion.isAudible(CanvasV3(scenes: [muette])),
                       "…et elle n'a rien à faire entendre")
    }

    /// Une vidéo qui ne se déclare pas muette l'est par défaut sur le fil, mais
    /// elle PORTE une piste : c'est ce que l'indicateur annonce.
    func test_uneVideoNonMuette_estAudible() {
        let sonore = scene([objet(.media, payload: ["mediaType": .string("video")])])
        XCTAssertTrue(SceneMotion.isAudible(CanvasV3(scenes: [sonore])))
    }

    /// Le son de fond appartient au DOCUMENT : il rend la publication audible
    /// même si aucune scène ne bouge.
    func test_unFondSonore_rendLeDocumentAudible() {
        let fixe = CanvasV3(scenes: [scene([objet(.text)])],
                            sound: BackgroundSoundV3(source: .library(soundId: "s"), volume: 1))
        XCTAssertTrue(SceneMotion.isAudible(fixe))
    }

    /// Une piste POSÉE sur la scène s'entend aussi.
    func test_unePisteAudioPosee_estAudible() {
        XCTAssertTrue(SceneMotion.isAudible(CanvasV3(scenes: [scene([objet(.audio)])])))
    }

    /// **Une scène de texte, de dessin ou de photo n'a AUCUN son.** C'est le
    /// cas nominal, et le plus important à tenir : un haut-parleur barré y
    /// serait du chrome mort.
    func test_uneSceneSansSon_nEstPasAudible() {
        XCTAssertFalse(SceneMotion.isAudible(CanvasV3(scenes: [
            scene([objet(.text), objet(.drawing),
                   objet(.media, payload: ["mediaType": .string("image")])])
        ])))
        XCTAssertFalse(SceneMotion.isAudible(CanvasV3(scenes: [])))
    }

    // MARK: - Le DOCUMENT

    /// **Le son de fond appartient au DOCUMENT, pas à une scène.** Un canvas
    /// de scènes fixes sur une musique se joue : le bouton doit exister.
    func test_unFondSonore_rendLeDocumentCinematique() {
        let document = CanvasV3(scenes: [scene([objet(.text)])],
                                sound: BackgroundSoundV3(source: .library(soundId: "s"), volume: 1))
        XCTAssertTrue(SceneMotion.isCinematic(document))
    }

    /// Un document est cinématique dès QU'UNE de ses scènes l'est — sinon un
    /// post de dix scènes dont la sixième est une vidéo n'aurait pas de bouton.
    func test_uneSeuleSceneQuiBouge_rendLeDocumentCinematique() {
        let document = CanvasV3(scenes: [
            scene([objet(.text)]),
            scene([objet(.media, payload: ["mediaType": .string("video")])])
        ])
        XCTAssertTrue(SceneMotion.isCinematic(document))
    }

    func test_unDocumentEntierementFixe_nEstPasCinematique() {
        let document = CanvasV3(scenes: [scene([objet(.text)]), scene([objet(.drawing)])])
        XCTAssertFalse(SceneMotion.isCinematic(document),
                       "sans mouvement ni son, le bouton de lecture ne gouvernerait RIEN")
    }

    /// **Un document VIDE n'est pas cinématique** — et le dire évite qu'un
    /// canvas sans scène ouvre une chrome de lecture au-dessus du néant.
    func test_unDocumentSansScene_nEstPasCinematique() {
        XCTAssertFalse(SceneMotion.isCinematic(CanvasV3(scenes: [])))
    }
}
