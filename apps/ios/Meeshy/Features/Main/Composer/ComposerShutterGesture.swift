import CoreGraphics
import Foundation

/// **Un seul déclencheur, trois intentions — lues du GESTE, jamais d'un bouton**
/// (#4080/#5074, directive porteur 2026-09-04).
///
/// > « la gestion photo vidéo ou mains libres se fait par la gestuelle
/// > uniquement et non des boutons disponibles »
///
/// C'est le motif que le doigt connaît d'ailleurs, et il n'a pas besoin d'être
/// appris : **appuyer prend, tenir filme, remonter verrouille.** Trois pastilles
/// à choisir avant de déclencher demandaient une décision AVANT l'intention ;
/// le geste la lit APRÈS, ce qui est l'ordre dans lequel elle vient.
///
/// ## Pourquoi une règle et non trois `if` dans le corps de la vue
///
/// Les seuils décident de ce que l'utilisateur obtient. Écrits dans un `body`,
/// ils sont hors de portée d'un témoin — et celui du VERROU, en particulier,
/// est le seul moyen de filmer à deux mains : le rater rend la fonction
/// inatteignable sans qu'aucun écran ne rougisse.
nonisolated enum ComposerShutterGesture {

    /// Au-delà de ce temps, l'appui n'est plus une photo mais une prise vidéo.
    ///
    /// 0,35 s : au-dessus du double-tap système (0,25 s) pour qu'un appui vif
    /// reste une photo, en dessous du long-press SwiftUI (0,5 s) pour que la
    /// vidéo démarre avant que le doigt ne se demande s'il s'est passé quelque
    /// chose.
    static let holdToFilm: TimeInterval = 0.35

    /// De combien il faut glisser VERS LA DROITE, sans relâcher, pour
    /// verrouiller la prise (directive porteur 2026-09-04).
    ///
    /// 64 pt — assez pour qu'un tremblement de main ne verrouille pas, assez
    /// peu pour que le pouce y arrive sans quitter le déclencheur.
    ///
    /// **La droite, et non le haut.** Le déclencheur vit au BAS de la carte :
    /// remonter le fait passer sur l'image, c'est-à-dire sur ce que l'auteur
    /// est en train de cadrer — le doigt masque le sujet au moment précis où il
    /// le filme. Glisser sur le côté longe le bord et ne couvre rien.
    static let slideToLock: CGFloat = 64

    /// Ce que le RELÂCHEMENT produit, selon ce que le doigt a fait avant lui.
    enum Outcome: Equatable {
        /// Appui bref : une photo.
        case photo
        /// Le doigt tenait : la prise se clôt.
        case closeTake
        /// La prise est VERROUILLÉE : relâcher ne l'arrête pas — c'est le
        /// « mains libres », et c'est toute sa raison d'être.
        case keepFilming
    }

    /// - Parameter heldFor: depuis combien de temps le doigt est posé.
    /// - Parameter locked: le geste de verrouillage a-t-il été franchi ?
    static func outcome(heldFor: TimeInterval, locked: Bool) -> Outcome {
        if locked { return .keepFilming }
        return heldFor >= holdToFilm ? .closeTake : .photo
    }

    /// Le geste de verrouillage est-il franchi ?
    ///
    /// Une translation POSITIVE en x va vers la droite. Le sens compte : le
    /// verrou doit s'atteindre dans la direction où le pouce a de la place, et
    /// glisser à GAUCHE ramènerait vers les portes du rail — un geste qui veut
    /// dire autre chose.
    static func locks(translationX: CGFloat) -> Bool {
        translationX >= slideToLock
    }

    /// **Où en est le geste, entre zéro et le verrou.** La barre s'en sert pour
    /// montrer que le verrou APPROCHE : un seuil franchi sans prévenir laisse
    /// l'auteur découvrir l'état après coup, et la directive du 2026-08-30 sur
    /// les gestes progressifs demande l'inverse — le geste se voit pendant
    /// qu'il se fait, et reste annulable jusqu'au bout.
    static func lockProgress(translationX: CGFloat) -> Double {
        guard slideToLock > 0 else { return 0 }
        return min(1, max(0, Double(translationX / slideToLock)))
    }

    /// **Ce que la prise DEVIENT une fois lancée**, pour que la vue sache quoi
    /// peindre : tenue ou verrouillée, c'est une vidéo dans les deux cas — la
    /// différence est ce que le relâchement fera, pas ce qui s'écrit.
    static func mode(locked: Bool) -> ComposerSceneCameraMode {
        locked ? .handsFree : .video
    }
}
