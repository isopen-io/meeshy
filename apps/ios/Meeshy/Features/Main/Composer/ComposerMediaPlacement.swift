import Foundation
import MeeshySDK

/// **Le rôle d'un média VISUEL qui entre dans le composer** (#4724) — jumeau
/// exact de `ComposerAudioRole`, pour l'autre matière.
///
/// > Directive porteur 2026-09-01 : « Il faut t'assurer que Meeshy Composer
/// > puisse faire la différence entre les medias sur la scene en foreground et
/// > les media en background (apparaissent comme nouveau tuile en haut sur la
/// > rangé des headers). »
///
/// Le modèle porte la distinction depuis toujours — `StoryMediaObject.isBackground`.
/// Ce qui manquait est un mot pour la DEMANDER à l'entrée : l'ingestion posait
/// tout média visuel comme une page du carrousel, quelle que soit la porte, et
/// laissait `addMediaObject` deviner le reste.
nonisolated enum ComposerMediaRole: String, Equatable, Hashable, CaseIterable, Sendable {
    /// Le FOND de sa slide — une page. Il gagne une tuile dans la rangée haute.
    case background
    /// Un objet parmi les autres sur la slide COURANTE. Aucune tuile, aucune page.
    case foreground
}

/// **Par quelle porte un média est entré.**
///
/// Deux portes, deux gestes — et c'est la porte qui porte l'intention, pas le
/// fichier : le même JPEG vaut une page quand il arrive par la rangée du
/// document, et un objet posé quand il arrive par le rail de la scène.
nonisolated enum ComposerMediaDoor: Equatable, Sendable {
    /// La rangée d'outils du DOCUMENT (photothèque, caméra, fichiers).
    /// Doctrine de la vue `1g` : en Post, une slide EST un média.
    case documentRow
    /// La porte du rail, ouverte SUR la scène. Elle ajoute « en additif » —
    /// créer une page est le geste de `[+]`, et lui seul (directive porteur
    /// 2026-08-30).
    case sceneRail
}

/// **Où se range un média visuel posé — la loi du #4724.**
///
/// Elle a une jumelle qui l'a précédée d'un an de commits : `ComposerAudioPlacement`,
/// qui range un SON. Les deux disent la même chose dans deux matières, et c'est
/// délibérément deux règles et non une : un son n'a pas de place de fond VISUEL
/// (`applyContentMedia` le refuse en toutes lettres), et un média n'a pas de
/// crédit d'auteur. Les fondre aurait donné une règle qui doit demander de quoi
/// elle parle avant de répondre.
nonisolated enum ComposerMediaPlacement {

    /// **Le rail ne pose en premier plan que s'il a un fond SUR QUOI poser.**
    ///
    /// C'est la moitié de la règle qu'on oublie en la résumant à « rail ⇒ premier
    /// plan ». Une slide vierge n'a pas de fond : le premier média qu'on y pose
    /// le DEVIENT — `addMediaObject` l'y range depuis toujours
    /// (`resolvedBackgroundMedia == nil`), et l'auteur le voit plein cadre. Le
    /// déclarer « premier plan » ici donnerait un objet que le modèle marque
    /// pourtant `isBackground: true` : la rangée haute et la scène se
    /// contrediraient sur le MÊME média, ce qui est pire que le défaut qu'on
    /// ferme.
    ///
    /// > **Un rôle déclaré à l'entrée doit être celui que le modèle écrira à la
    /// > sortie**, sinon ce n'est pas un rôle, c'est un vœu.
    static func role(door: ComposerMediaDoor, currentSlideHasBackground: Bool) -> ComposerMediaRole {
        switch door {
        case .documentRow:
            return .background
        case .sceneRail:
            return currentSlideHasBackground ? .foreground : .background
        }
    }
}

/// **Ce qui gagne une TUILE dans la rangée haute** — et rien d'autre (#4724).
///
/// > **Une tuile de la rangée haute dit le FOND d'une slide.** Un média posé en
/// > premier plan vit sur la scène ; un son vit dans sa carte ; un document part
/// > en pièce jointe. Aucun des trois n'est une page, donc aucun des trois n'a
/// > de tuile.
///
/// La rangée était alimentée par `documentLocalMedia` — la liste ENTIÈRE — donc
/// elle montrait une tuile pour tout ce qui entre, jusqu'au son et au PDF. Le
/// symptôme se lisait comme un carrousel qui grossit sans qu'on ait ajouté de
/// page.
///
/// **La règle lit l'INDEX des fondations, pas une seconde vérité.**
/// `slideIdByMediaURL` dit déjà « ce média a fondé cette slide » ; c'est
/// exactement l'ensemble des fonds. Reconstruire la liste depuis les
/// `mediaObjects` du modèle aurait donné une deuxième source à faire diverger —
/// et une tuile a besoin de la VIGNETTE, que seul `ComposerDocumentMedia` porte.
nonisolated enum ComposerHeaderTiles {

    /// Les médias qui ont droit à une tuile, dans l'ordre de la liste du
    /// document — le seul ordre que l'auteur puisse prévoir.
    /// **La rangée compte les SCÈNES** (constat porteur 2026-09-06 : « lorsque
    /// je crée une nouvelle scène elle n'apparaît pas immédiatement dans la
    /// mini-preview »).
    ///
    /// La règle précédente filtrait les MÉDIAS par l'index des fondations —
    /// « une tuile par média posé en fond ». Elle rendait le bon résultat tant
    /// que toute scène naissait d'un média, et le doc-comment de
    /// `ComposerTopBar` énonçait d'ailleurs cette coïncidence comme une
    /// définition : « une par `MeeshySlide`, ce qui veut dire une par média
    /// posé en FOND ».
    ///
    /// Un fond COLORÉ sépare les deux termes : la scène existe, elle n'a aucun
    /// média, et la rangée n'avait rien à montrer. L'auteur créait une scène
    /// et rien à l'écran ne le lui disait.
    ///
    /// > **Une équivalence écrite comme un fait ne se relit pas** — elle se lit
    /// > comme une définition. C'est ce qui la rend invisible le jour où ses
    /// > deux termes divergent.
    ///
    /// La règle est donc devenue la QUESTION qui restait posée : que compte la
    /// rangée ? Des scènes. Elle ne filtre plus — et c'est le point : tout
    /// filtre y était une occasion de perdre une scène.
    static func tiles(for slides: [StorySlide]) -> [StorySlide] {
        slides
    }

    /// **Quelle tuile porte la corbeille** (constat porteur 2026-09-06 : « il
    /// manque la poubelle pour supprimer les scènes »).
    ///
    /// Deux conditions, et chacune évite un contrôle qui MENT :
    ///
    /// 1. **la tuile COURANTE seulement.** Une corbeille sur chaque tuile ferait
    ///    six cibles destructrices dans une rangée où le doigt navigue ; le
    ///    geste de suppression vise ce qu'on REGARDE, comme l'ancienne rangée le
    ///    faisait déjà pour les médias (`showsRemove(isSelected:…)`) ;
    /// 2. **jamais sous deux scènes.** `removeSlide` refuse de descendre
    ///    au-dessous d'une slide (`guard slides.count > 1`) : offrir la
    ///    corbeille là serait un bouton qui ne fait rien — exactement le
    ///    contrôle inerte que la loi 4 interdit.
    ///
    /// > La seconde condition ne se DÉDUIT pas de la première : une rangée
    /// > montée à une seule scène aurait une tuile courante, donc une corbeille,
    /// > et elle serait morte. C'est le modèle qui la donne, pas la vue.
    static func showsDelete(sceneIndex: Int, currentIndex: Int, sceneCount: Int) -> Bool {
        sceneCount > 1 && sceneIndex == currentIndex
    }
}

/// **Quand la scène reste MONTÉE** (#4724, défaut V2 mesuré au simulateur).
///
/// La scène était liée aux seules FONDATIONS : `documentBackground != nil ||
/// !slideIdByMediaURL.isEmpty`. C'était juste tant que tout média fondait une
/// slide — la même coïncidence qui a cassé la garde d'idempotence, un cran plus
/// bas. Depuis qu'un média peut être posé en PREMIER PLAN, retirer la dernière
/// tuile vidait l'index sans vider la slide : `removeSlide` refuse de descendre
/// sous une slide, ses objets restaient donc là, mais la scène se DÉMONTAIT et
/// l'écran revenait au document vide. Les médias de premier plan devenaient
/// invisibles ET irretirables — et repartaient quand même à la publication
/// (mesuré : le `⋯` continuait de servir « Tout effacer », que
/// `ComposerOverflowPolicy` ne sert que si `hasMedia`).
///
/// > **Ce qui décide de MONTRER une surface doit compter ce qu'elle CONTIENT,
/// > jamais ce qui l'a fait naître.** Une condition de naissance placée là tient
/// > tant que naître et contenir coïncident ; elle démonte la surface le jour
/// > où ils divergent, et emporte son contenu hors de vue sans rien effacer.
/// **Ce prédicat répond à « y a-t-il de la matière à CADRER ? », jamais à
/// « cette unité mérite-t-elle un post ? »** (distinction établie avec la
/// session voisine, 2026-09-01).
///
/// La seconde question a sa propre loi — `StorySlidePublishMatter.deservesAPost`
/// (SDK) —, qui énumère les champs et TRIM les textes. Les deux coïncident
/// presque partout et divergent exactement sur la page blanche EFFLEURÉE : le
/// tap y pose une coquille de texte vide, donc `sceneObjects` n'est plus vide.
/// Cette slide A une scène — son canevas et son inspecteur doivent rester — et
/// ne mérite AUCUN post : la compter comme méritante fabriquait la story
/// fantôme du #4730, un post vide publié à côté du vrai.
///
/// Ne repointer ni l'une sur l'autre. Y substituer `deservesAPost` ferait
/// disparaître le canevas d'une slide qu'on vient d'ouvrir.
///
/// **Et le sixième lecteur n'est pas de la même nature que les cinq autres.**
/// `backgroundPaletteIsReachable`, `socleZones`, `showsScene`, `sceneInspector`
/// et `mountedComposerView` demandent tous s'il y a quelque chose à MONTRER.
/// `ComposerMoodGate.compositionQualifiesAsMood` (par `moodGate`) décide, lui,
/// de l'OFFRE des formats — et il ouvre par `guard !hasMedia, !hasScene`. Un
/// prédicat qui gouverne à la fois le montage et l'offre couple deux choses :
/// tout élargissement de ce que « avoir une scène » veut dire retire des
/// formats de l'éventail, sans qu'aucun témoin de montage ne rougisse.
nonisolated enum ComposerScenePresence {

    /// - Parameter sceneObjectCount: `StorySlide.sceneObjects.count` — la somme
    ///   à cinq cas du SDK (texte · média · sticker · lieu · audio), jamais une
    ///   énumération de tableaux réécrite ici : c'est exactement ce que le type
    ///   `MeeshySceneObject` existe pour éviter.
    static func hasScene(backgroundHex: String?,
                         foundedSlides: Int,
                         sceneObjectCount: Int) -> Bool {
        backgroundHex != nil || foundedSlides > 0 || sceneObjectCount > 0
    }
}
