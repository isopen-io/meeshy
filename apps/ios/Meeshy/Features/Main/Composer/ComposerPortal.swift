import SwiftUI

/// **La feuille OUVERTE — une seule, nommée** (#4467).
///
/// ## Le défaut que ce type ferme
///
/// Le meuble a porté jusqu'à **neuf** présentations modales sur la même vue :
/// huit `.sheet(isPresented:)` gouvernées par huit booléens, plus un
/// `.sheet(item:)` dans une extension du même type. SwiftUI n'en supporte
/// qu'une par vue ; dès que deux booléens passaient à `true` dans la MÊME
/// transaction, il levait
///
/// > `[com.apple.SwiftUI:Invalid Configuration] Currently, only presenting a
/// > single sheet is supported`
///
/// et le process était **terminé**. Observé trois fois au simulateur le
/// 2026-08-30, sur trois points d'interaction différents — c'est ce qui a
/// désigné un défaut de structure plutôt qu'une porte fautive.
///
/// ## Pourquoi huit booléens ne pouvaient pas s'en sortir
///
/// L'inventaire des portails (#4120) a posé la bonne règle — « tout état de
/// présentation doit avoir son lecteur AU-DESSUS de l'aiguillage » — et sa
/// garde l'a tenue : chaque porte ajoutée depuis a reçu son `.sheet` au bon
/// endroit. Trois y sont entrées le même jour.
///
/// > **Une règle de PLACEMENT ne dit rien du NOMBRE.** L'inventaire
/// > garantissait que chaque booléen est lu ; il ne pouvait pas garantir qu'un
/// > SEUL l'est à la fois. C'est la limite d'un invariant écrit sur les
/// > éléments d'une collection plutôt que sur la collection.
///
/// ## Ce que le type somme apporte, et qu'aucune discipline n'apportait
///
/// Deux propriétés, toutes deux STRUCTURELLES :
///
/// - **deux portails ne peuvent pas être ouverts en même temps** — une variable
///   ne porte qu'une valeur ;
/// - **ouvrir le second FERME le premier**, au lieu de produire un état que
///   SwiftUI refuse.
///
/// Rien à retenir, rien à vérifier en revue : l'état invalide n'est plus
/// représentable.
///
/// ## Ce qui reste dehors, et pourquoi
///
/// `.photosPicker` et `.fileImporter` ne sont pas des feuilles — ils ont leur
/// propre mécanique de présentation et ne se disputent pas la place. Les deux
/// `.confirmationDialog` non plus. Les y faire entrer aurait élargi le type
/// sans rien résoudre.
///
/// **Le sélecteur d'AUDIENCE non plus**, et la raison mérite d'être écrite : sa
/// feuille est portée par le bouton d'audience du socle, une sous-vue, et non
/// par le corps du meuble. Deux feuilles sur deux VUES distinctes ne se
/// disputent rien — c'est l'empilement sur UNE vue que SwiftUI refuse. La faire
/// entrer ici aurait déplacé une présentation qui va bien, pour la seule
/// satisfaction d'un inventaire complet.
nonisolated enum ComposerPortal: String, Identifiable, CaseIterable, Equatable {

    /// Le sélecteur de lieu — MapKit, permissions, app-side.
    case location
    /// Le sélecteur d'emoji — il INSÈRE dans le texte du document.
    case emoji
    /// La bibliothèque de stickers — elle POSE un objet sur la scène.
    case sticker
    /// **LA feuille de CRÉATION AUDIO (#4483, fusionnée #4657).**
    ///
    /// #4483 avait déjà remplacé un choix à deux options qui n'atterrissait pas
    /// au même endroit selon la branche. #4657 ferme le dernier doublon : le
    /// portail `.audio`, qu'ouvrait l'outil « Vocal », montait une SECONDE vue
    /// d'enregistrement dont tout — capture, import, étagère, transcription —
    /// existait déjà ici. Les deux entrées ouvrent désormais cette feuille ; ce
    /// qui les distinguait, la DESTINATION, s'y choisit au lieu de se deviner
    /// au bouton pressé.
    case sound
    /// L'étagère seule, ouverte DEPUIS la feuille du son.
    case soundLibrary
    /// Le sélecteur de personnes à nommer, avec son mode d'apparition.
    case reference
    /// La langue déclarée du document — elle gouverne le Prisme.
    case language
    /// La caméra.
    case camera

    /// **Le sélecteur de HASHTAGS** (#4636). Il n'ajoute pas à une liste : il
    /// écrit dans le texte de la publication, seule source des balises
    /// (`ComposerHashtags`).
    case hashtag

    /// **L'AUDIENCE — la vue `2l`, en feuille.**
    ///
    /// Elle était un `Menu` posé sur la pastille du socle : six entrées sans
    /// compteur, sans les mentions qu'elles gouvernent, sans les hashtags qui
    /// partent avec, et sans dire que l'audience appartient à la PUBLICATION.
    /// Un menu contextuel peut lister des choix ; il ne peut pas montrer leurs
    /// conséquences, et c'est tout ce que cet écran a à faire.
    case audience

    public var id: String { rawValue }
}
