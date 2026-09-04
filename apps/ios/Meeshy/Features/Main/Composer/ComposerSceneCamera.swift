import MeeshySDK
import Foundation

/// **Le viseur vit DANS la scène — il n'est pas une feuille** (#4080, vue `2b`).
///
/// > « La caméra est une entrée, pas un mode. Ce qu'elle rend est posé dans la
/// > scène courante selon la même règle que la galerie : pas de fond ⇒ il
/// > devient le fond, sinon un objet de premier plan. » — planche `2b`
///
/// > « Quand je touche la scène ça déclenche la caméra et ouvre la sheet caméra
/// > au lieu de déclencher la caméra et **utiliser le fond de la scène comme
/// > caméra** » — porteur, 2026-09-04
///
/// ## Ce que ce type décide, et ce qu'il ne décide PAS
///
/// Il porte l'ÉTAPE du viseur et les modes qu'un format sert. Il ne décide ni
/// **si** le geste est offert (`ComposerSceneCaptureGesture.offersCapture`), ni
/// **où** la prise se pose (`ComposerMediaPlacement.role`) : ces deux règles
/// existent, sont testées, et les recopier ici les ferait diverger au premier
/// format ajouté. Le §2b prescrit explicitement la seconde — « la même règle
/// que la galerie » — donc la réutiliser est la lecture littérale de la cible,
/// pas une commodité.
nonisolated enum ComposerSceneCameraStage: String, Equatable, CaseIterable, Sendable {

    /// La scène est une scène. Aucun flux, aucune session ouverte.
    case off

    /// Le viseur occupe le fond de la scène et attend. Rien n'est encore pris.
    case armed

    /// Le doigt tient, la piste s'écrit.
    case recording
}

/// Les trois pastilles de la cible — `PHOTO` · `VIDÉO` · `MAINS LIBRES`.
///
/// **`handsFree` n'est pas un troisième média, c'est un troisième GESTE** : la
/// même vidéo, sans tenir le doigt. La cible les range sur une seule rangée
/// parce que l'auteur y choisit *comment il déclenche*, pas *ce qu'il capture*.
nonisolated enum ComposerSceneCameraMode: String, Equatable, CaseIterable, Sendable {
    case photo
    case video
    case handsFree
}

nonisolated enum ComposerSceneCamera {

    /// **Quels modes un format SERT.**
    ///
    /// Un réel est une vidéo par définition : lui offrir `PHOTO` poserait une
    /// image dans un format qui attend du mouvement — la faute que
    /// `ComposerSceneCaptureGesture.mode` évite déjà à l'ouverture, ici rendue
    /// visible plutôt que corrigée après coup.
    ///
    /// Un statut n'a pas de scène du tout, donc pas de viseur : la liste VIDE
    /// est ce qui l'exprime, et elle est cohérente avec `offersCapture`, qui
    /// refuse le geste sur ce format. Deux règles, un seul verdict.
    static func modes(for format: ComposerFormat) -> [ComposerSceneCameraMode] {
        switch format {
        case .status: return []
        case .reel:   return [.video, .handsFree]
        case .story, .post: return [.photo, .video, .handsFree]
        }
    }

    /// Le mode posé à l'armement — le premier SERVI, jamais un littéral.
    ///
    /// Dériver du même tableau que la rangée garantit qu'aucun format ne
    /// s'ouvre sur une pastille que sa propre rangée ne montre pas.
    static func initialMode(for format: ComposerFormat) -> ComposerSceneCameraMode? {
        modes(for: format).first
    }

    /// **Ce que le RELÂCHEMENT fait, et c'est là que les trois modes diffèrent.**
    ///
    /// - `photo` — l'appui a déjà pris l'image ; relâcher ne fait rien de plus.
    /// - `video` — le doigt TENAIT la prise : relâcher la clôt et pose.
    /// - `handsFree` — le doigt ne tient rien : relâcher laisse tourner, et
    ///   c'est un second appui qui clôt. C'est toute la raison d'être du mode ;
    ///   le traiter comme `video` le rendrait indiscernable de lui.
    static func stageAfterRelease(mode: ComposerSceneCameraMode,
                                  stage: ComposerSceneCameraStage) -> ComposerSceneCameraStage {
        guard stage == .recording else { return stage }
        switch mode {
        case .photo, .video: return .armed
        case .handsFree:     return .recording
        }
    }

    /// **La prise POSE, puis le viseur se retire** — le viseur n'est pas un
    /// mode où l'on reste (§2b : « une entrée, pas un mode »). Rester armé
    /// après une pose ferait de la caméra un état du composer, et l'auteur
    /// n'aurait plus de scène à regarder pour juger ce qu'il vient de poser.
    static let stageAfterCapture: ComposerSceneCameraStage = .off

    /// **Le libellé du bas de la cible n'est pas décoratif : il DIT le geste**,
    /// et il change avec le mode. Le figer sur « maintenir pour filmer »
    /// mentirait en `PHOTO` et en `MAINS LIBRES`.
    static func hintKey(mode: ComposerSceneCameraMode,
                        stage: ComposerSceneCameraStage) -> String {
        switch (mode, stage) {
        case (.photo, _):            return "composer.camera.hint.photo"
        case (.video, .recording):   return "composer.camera.hint.videoHolding"
        case (.video, _):            return "composer.camera.hint.video"
        case (.handsFree, .recording): return "composer.camera.hint.handsFreeStop"
        case (.handsFree, _):        return "composer.camera.hint.handsFreeStart"
        }
    }
}

/// **Ce que le viseur OCCUPE, et ce qu'il laisse** (#4080).
///
/// Le chrome du viseur vit désormais DANS la carte (directive porteur
/// 2026-09-04). Il y rencontre donc les meubles que la carte peint déjà —
/// et mesuré au simulateur, le déclencheur (y 569–665) tombait exactement sur
/// le volet de description (y 610–648).
///
/// ## Trois meubles, trois réponses — c'est ce qui fait de ceci une règle
///
/// Une fonction qui rendrait « tout cède » en ignorant son paramètre ne
/// déciderait rien. Celle-ci décide l'APPARTENANCE : ce que le viseur occupe
/// n'est pas « le bas de l'écran », c'est **la carte**.
nonisolated enum ComposerSceneCameraOverlay {

    enum Furniture: String, CaseIterable, Sendable {
        /// Le volet de description, ancré au bas du DESSIN (#4993) — donc
        /// exactement là où le déclencheur se pose.
        case description
        /// La trace du son de fond, ancrée AU-DESSUS du dessin (#5017). Le
        /// viseur ne monte pas jusque-là.
        case soundTrace
        /// Les deux rails, dans les COULOIRS du plateau (#4561). Le viseur est
        /// borné au dessin ; il ne les atteint pas, et les cacher priverait
        /// l'auteur de sa sortie autant que de ses portes.
        case rails
    }

    static func yieldsToViewfinder(_ furniture: Furniture) -> Bool {
        switch furniture {
        case .description: return true
        case .soundTrace:  return false
        case .rails:       return false
        }
    }

    /// La question que les sites de montage posent — ils n'écrivent pas
    /// `cameraStage != .off`, ils demandent si LEUR meuble est servi.
    static func isServed(_ furniture: Furniture,
                         stage: ComposerSceneCameraStage) -> Bool {
        !(stage != .off && yieldsToViewfinder(furniture))
    }
}

/// **Ce que la carte MONTRE quand le viseur est armé** (#4080).
///
/// Trois états, et le troisième est celui qui manquait : une permission REFUSÉE
/// laissait la carte noire, c'est-à-dire indiscernable d'une scène vide ou
/// d'une caméra en panne. L'auteur cherchait un défaut là où il n'y avait
/// qu'une case à cocher.
///
/// `notDetermined` ne montre PAS le panneau : le système est en train de poser
/// sa question, et un écran de refus affiché pendant qu'on demande dirait le
/// contraire de ce qui se passe.
nonisolated enum ComposerSceneCameraSurface {

    enum Shown: String, Equatable, Sendable {
        /// La scène est une scène.
        case scene
        /// L'aperçu de l'objectif.
        case viewfinder
        /// L'écran qui dit POURQUOI il n'y a pas d'image.
        case permissionRefused
    }

    static func shown(stage: ComposerSceneCameraStage,
                      permission: MediaPermissionState) -> Shown {
        guard stage != .off else { return .scene }
        if permission.needsSettingsRedirect { return .permissionRefused }
        return .viewfinder
    }
}
