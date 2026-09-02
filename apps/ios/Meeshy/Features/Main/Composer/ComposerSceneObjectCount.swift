import Foundation
import MeeshySDK

/// **Combien d'objets la scène PORTE** (#4935).
///
/// > Directive porteur 2026-09-03 : « à la place de "Edit object", ce n'est pas
/// > mieux d'avoir une flèche `< N` où N est le nombre d'objets sur la scène
/// > actif ? »
///
/// ## « Actif » avait deux lectures, et le choix se dit
///
/// Le dépôt distingue déjà « présent » de « actif à cet instant » : c'est ce que
/// fait `AudioForegroundReaderOverlay.visibleAudios(in:elapsed:slideDuration:)`,
/// qui filtre sur `startTime` et `duration`.
///
/// **Cette règle compte les objets PRÉSENTS**, pas ceux dont la fenêtre couvre
/// l'instant courant. Le motif est d'usage : un chiffre indexé sur le temps
/// changerait pendant qu'on déplace un curseur de temps, sans que l'auteur ait
/// touché au nombre d'objets — un nombre qui bouge tout seul est un nombre qu'on
/// cesse de lire. Le choix est écrit ici pour que le mot « actif » ne se relise
/// pas à l'envers plus tard.
///
/// ## Ce que « présent » n'est PAS
///
/// Ce n'est pas « la somme des tableaux ». Un FOND — média ou son — vit dans
/// `mediaObjects` et `audioPlayerObjects` comme les autres, et n'est pas un objet
/// posé : il n'a pas de position, pas de puce sur la scène, pas de sélection
/// (#4918), et l'éditeur d'objet ne peut pas l'ouvrir. Le compter ferait
/// promettre à la flèche des objets dont l'auteur ne trouverait jamais le
/// dernier.
///
/// > La distinction n'est visible sur AUCUNE scène sans fond — c'est-à-dire sur
/// > le cas nominal, et sur lui seul. C'est pourquoi le témoin s'écrit sur une
/// > scène qui en a un.
///
/// L'objet en cours d'édition fait partie du compte : la flèche dit « cet écran
/// en édite un parmi N », pas « il en reste N autres ».
nonisolated enum ComposerSceneObjectCount {

    /// Le nombre d'objets POSÉS sur la slide, toutes familles confondues.
    ///
    /// Les cinq familles de `MeeshySceneObject` comptent — texte, média,
    /// sticker, lieu, audio. Aucune n'est privilégiée : ce que la flèche annonce
    /// est ce que le plan 2D permet de désigner.
    /// Les cinq termes sont HISSÉS et TYPÉS plutôt que chaînés en une somme :
    /// écrite d'un trait, l'expression a fait rendre au compilateur « unable to
    /// type-check this expression in reasonable time » — cinq `Optional`, deux
    /// fermetures et un `??` sur la même ligne. C'est la leçon de
    /// `StickerTemplates+Travel`, rejouée sur une addition.
    static func posed(on slide: StorySlide) -> Int {
        let effets = slide.effects
        let textes: Int = effets.textObjects.count
        let medias: Int = (effets.mediaObjects ?? []).filter { $0.isBackground != true }.count
        let stickers: Int = (effets.stickerObjects ?? []).count
        let lieux: Int = effets.locationObjects.count
        let sons: Int = (effets.audioPlayerObjects ?? []).filter { $0.isBackground != true }.count
        return textes + medias + stickers + lieux + sons
    }

    /// Ce que VoiceOver DIT de la flèche — une phrase, jamais un chiffre.
    ///
    /// « Retour, 4 objets sur la scène » plutôt que « inférieur, 4 » : le glyphe
    /// `chevron.left` n'a pas de nom parlé utile, et un nombre annoncé seul ne
    /// dit pas ce qu'il compte. Le pluriel passe par le catalogue, qui porte ses
    /// règles par langue — l'arabe en a six.
    /// UNE clé, ses variations de pluriel — l'idiome que `a11y.back.with_unread`
    /// pose déjà pour exactement cette forme (« Retour, %d message non lu »).
    /// Concaténer deux chaînes traduites produirait un ordre de mots faux dans
    /// les langues qui n'ont pas le nôtre, et laisserait l'arabe sans ses six
    /// formes de pluriel.
    static func spokenLabel(count: Int) -> String {
        String(format: String(localized: "composer.object.editor.back.a11y", bundle: .main), count)
    }
}
