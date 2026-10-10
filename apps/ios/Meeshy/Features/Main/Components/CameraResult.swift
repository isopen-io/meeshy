import UIKit

enum CameraResult {
    /// **La photo, ET ses octets d'origine** (directive porteur 2026-09-04 :
    /// « la prise de la photo doit avoir les exif et metadata »).
    ///
    /// `AVCapturePhoto.fileDataRepresentation()` rend un fichier COMPLET :
    /// EXIF, TIFF, marque et modèle de l'appareil, date de prise, temps de
    /// pose, focale, orientation — et la position si l'app y a droit. Une
    /// `UIImage` n'en garde RIEN : elle porte des pixels et une orientation, et
    /// tout le reste est perdu à la construction.
    ///
    /// Les octets voyagent donc À CÔTÉ de l'image, `nil` quand la source n'en
    /// a pas. La sauvegarde en photothèque suivait déjà cette doctrine — « les
    /// octets ORIGINAUX, pas une `UIImage` ré-encodée » — mais elle vivait dans
    /// le délégué et ne sortait pas de lui : les quatre consommateurs de ce
    /// type ré-encodaient tous, chacun de son côté.
    case photo(UIImage, data: Data?)
    case video(URL)
}

/// **Le mode dans lequel le viseur s'OUVRE** (#4998, directive porteur
/// 2026-09-03 : « assure-toi que la caméra se déclenche bien en mode photo et
/// vidéo sans problème ! »).
///
/// L'écran a toujours su faire les deux — deux onglets, deux déclencheurs, deux
/// sorties — et naissait TOUJOURS en photo. Une porte qui promet un viseur
/// vidéo (`ComposerOpening.videoCameraReady`) ouvrait donc un viseur photo, et
/// rien ne rougissait : les deux modes existent, les deux marchent, c'est
/// l'appariement qui manquait.
///
/// > Déplacer une porte d'un écran à l'autre ne déplace pas ce qu'elle PROMET.
/// > Ici la promesse n'avait même jamais eu de porteur.
/// **`nonisolated` — sinon sa conformance `Equatable` l'est au MainActor.**
///
/// Le fichier compile sous `SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor` : sans
/// l'annotation, `==` n'est appelable que depuis le main actor, et toute règle
/// pure qui rend un mode devient intestable — l'erreur tombe alors sur les
/// SITES d'appel (« main actor-isolated conformance … in nonisolated context »),
/// jamais sur la déclaration qui en est la cause.
///
/// > Une isolation se propage vers le HAUT par les appels. Un type de valeur à
/// > deux cas peut ainsi retenir sur le main actor toutes les règles qui le
/// > mentionnent, et l'erreur qu'on lit désigne partout sauf sa source.
nonisolated enum CameraCaptureMode: Equatable, Sendable {
    case photo
    case video
}
