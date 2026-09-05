import Foundation
import MeeshySDK
import MeeshyUI
import SwiftUI

/// **Les sections de l'éditeur d'objet — dix depuis l'EFFET (#4870) — et
/// laquelle est OUVERTE** (#4842).
///
/// ## Le défaut
///
/// L'écran plein écran d'édition d'un objet texte dépliait ses neuf sections
/// d'un coup — style, couleur, alignement, fond, cadre, bordure, langue, la
/// fenêtre de temps et le plan 2D. Il fallait faire défiler pour atteindre les
/// quatre dernières, et rien n'annonçait qu'elles existaient.
///
/// > « ne pas tout montrer d'un coup (la vue plein ecran actuelle est trop
/// > chargé) » — directive porteur, 2026-09-01 23h04.
///
/// C'est la **loi 8** : le prisme n'affiche que ce dont on a besoin, au moment
/// où on en a besoin.
///
/// ## Ce que cette règle N'annule pas
///
/// L'empilement n'était pas une négligence : il répondait à un vrai défaut.
/// `MeeshyToolOptionsPanel` ne rend quelque chose que si un outil est déplié
/// **dans le ViewModel**, donc la zone basse d'une édition de texte restait
/// VIDE tant qu'aucune bulle du rail n'avait été tapée. « Toutes les options »
/// n'existait nulle part.
///
/// La distinction tient en un mot : ce dépliage-ci est **LOCAL**. Il n'a pas
/// d'état vide possible — une section est ouverte au premier rendu, et tous
/// les en-têtes restent visibles quoi qu'il arrive. Rien n'est retiré ; seule la
/// révélation change.
///
/// ## Pourquoi une règle pure pour trois lignes
///
/// Parce que la promesse à tenir — « jamais deux sections ouvertes ensemble » —
/// se mesure sur toutes les paires (90 pour dix sections), et qu'un témoin de
/// vue n'en éprouverait qu'un
/// chemin. Écrite dans un `body`, la même logique serait hors de portée.
/// **Les outils d'un média dans l'éditeur plein écran** (#4082, vue `2d`).
///
/// > « Un seul écran pour les trois gestes. Le cadre porte le recadrage, la
/// > bande porte le rognage, la coupe scinde à la tête de lecture — l'ordre des
/// > rangées suit l'ordre des décisions. »
///
/// **`served` n'est PAS `allCases`, et c'est la moitié qui compte.** La planche
/// en dessine cinq ; deux restent hors du jeu servi, mais **plus pour la même
/// raison depuis le 2026-09-04** — et la distinction vaut d'être tenue à jour,
/// parce qu'un motif périmé se relit comme une raison de ne pas y toucher.
///
/// | outil | ce qui le retient AUJOURD'HUI |
/// |---|---|
/// | ✂ COUPER | le contrat, toujours — aucun champ ne porte une scission (#5085) |
/// | ⌗ RECADRER | **plus le contrat** : `a0f2a86aa9` a posé `MediaCropRect`, `StoryMediaObject.crop`, le round-trip `CanvasV3Migration` et `StoryMediaLayer.applyCrop`. Ce qui reste est #5100 — `aspectRatio` ne sait pas distinguer « carré » de « pas encore mesuré », et sur les chemins vidéo elle arrive de façon asynchrone : taper `9:16` dans cette fenêtre sur une source 16:9 POSERAIT une borne dont le rapport réel vaut 1:1, et elle est persistée. Plus les deux autres clients, qui ne déclarent pas encore `crop` (#5085) |
///
/// Le verdict ne change pas — les servir ferait paraître deux outils qui ne
/// changeraient rien, ou pire, un qui écrirait faux ; la loi 4 bannit les deux.
/// Seule la RAISON change, et c'est elle qu'un relecteur consulte avant de
/// décider s'il peut lever le refus.
///
/// Les déclarer ici sans les servir dit la CIBLE sans la mentir.
nonisolated enum MediaEditTool: String, CaseIterable, Hashable, Sendable {
    /// Les bornes de lecture — existe de bout en bout (`MediaTrimStrip`).
    case trim
    /// Muet et quart de tour — existent tous deux.
    case actions
    /// ⌗ RECADRER — au contrat depuis `a0f2a86aa9`, retenu par #5100.
    case crop
    /// ✂ COUPER — absent du contrat (#5085).
    case split
    /// ✦ FILTRE — la teinte de la SLIDE (#5041).
    ///
    /// **Servi, contrairement à `crop` et `split`** : `StoryFilterGridView` et
    /// `StoryComposerViewModel.applyFilter` existent de bout en bout, et
    /// `EmbeddedSceneInspector` les monte déjà — mais dans l'écran DOCUMENT
    /// seulement. L'éditeur plein écran, lui, ne les offrait nulle part.
    ///
    /// **Sa portée est la SLIDE, pas l'objet**, et c'est dit ici parce que rien
    /// dans le nom ne le dirait : `applyFilter` écrit `currentEffects.filter`.
    /// C'est exactement ce que la directive demande — « editer l'image general
    /// avec filtre » — et c'est déjà la portée que l'inspecteur du document
    /// sert pour toute sélection `.media`. Un filtre PAR média serait un ajout
    /// de contrat, de la même nature que recadrer et couper (#5085).
    case filter
    /// **⌾ DÉCRIRE — le texte alternatif du média** (#4756).
    ///
    /// Servi, et c'est la loi 4 qui l'exige autant qu'elle l'autorise : le
    /// contrat existe de bout en bout (`PostMedia.mediaAlt` sur le fil,
    /// `PostService.create(mediaAlt:)`, `ComposerMediaAccessibility`), et
    /// l'atome de saisie aussi (`MediaAltTextField(kind: .alt)`, SDK). Ce qui
    /// manquait était la SOURCE — le nouveau composer publiait
    /// `ComposerMediaAccessibility.empty`, et son doc-comment l'admettait.
    ///
    /// > L'UI existait, mais dans l'ANCIENNE peau : `MediaAccessibilityPanel`
    /// > est monté par `ComposerToolPanelHost` → `ComposerBottomBand`, la bande
    /// > de l'atelier plein écran. Le contrôle n'avait pas été supprimé, il
    /// > était resté là où l'on ne va plus.
    ///
    /// **Sa portée est l'OBJET**, contrairement au filtre : un texte alternatif
    /// décrit CE média, pas la slide. C'est aussi ce qui le sépare de
    /// `allowSoundExtraction`, drapeau UNIQUE de la publication — les réunir
    /// serait l'erreur que `MediaAccessibilityPanel` avait déjà écartée.
    case altText

    /// **Ce que le rail sert pour un média.** `crop` et `split` restent hors du
    /// jeu tant que le contrat ne les porte pas (#5085) ; les monter inertes
    /// ferait croire à l'auteur qu'il a recadré.
    ///
    /// Le filtre ouvre la liste parce qu'il agit sur ce qu'on VOIT en premier —
    /// la teinte de la scène — avant les bornes de lecture et les actions.
    ///
    /// `altText` ferme la liste : on décrit un média une fois qu'on a fini de
    /// le régler, et c'est le seul des quatre qui s'adresse à quelqu'un d'autre
    /// que soi.
    static let served: [MediaEditTool] = [.filter, .trim, .actions, .altText]
}

nonisolated enum ComposerObjectEditorSection: Hashable, Sendable {
    /// Les outils du SDK — sept alors, huit depuis l'EFFET (#4870), et le
    /// huitième est entré ici sans qu'une ligne change : le cas porte
    /// `TextEditTool` plutôt que de recopier ses cas, pour la même raison qui
    /// fait lire `TextEditTool.all` à l'écran plutôt qu'une liste écrite à la
    /// main.
    case tool(TextEditTool)
    /// **Les outils d'un MÉDIA** (#4082, vue `2d`). Le `switch` d'`entries`
    /// disait « différées, pas oubliées » ; les voici.
    case media(MediaEditTool)
    /// D'où à où l'objet vit dans la slide.
    case timing
    /// Le plan 2D — où il se pose, se pince et se tourne.
    case plan

    /// **Un nom STABLE pour l'accessibilité et les identifiants de test.**
    ///
    /// Une somme à cas associés n'a pas de `rawValue`, et c'est ce que la
    /// rangée de jetons lisait tant que sa destination était une bande
    /// (`ComposerSceneBand: String`). Composer l'identifiant ici plutôt qu'au
    /// site d'affichage garde une SEULE écriture de ces noms — deux
    /// interpolations divergeraient au premier outil ajouté, et un identifiant
    /// d'accessibilité qui change casse silencieusement le test qui le vise.
    var identifier: String {
        switch self {
        case .tool(let outil):  return "tool.\(outil.rawValue)"
        case .media(let outil): return "media.\(outil.rawValue)"
        case .timing:           return "timing"
        case .plan:             return "plan"
        }
    }
}

/// **Le rail d'outils de l'éditeur d'objet** (#4936).
///
/// > Directive porteur 2026-09-03 : « Plutôt que d'avoir une liste de fold, ce
/// > n'est pas mieux d'avoir une rangée de tool à gauche et à droite le undo
/// > redo au même endroit et préserver le bas pour afficher les options des
/// > tools à chaque fois ? Avec toujours en haut le texte touché ? »
///
/// ## L'anatomie du PLATEAU, ici aussi
///
/// C'est la dimension 6 dans sa forme la plus directe — même geste, même place.
/// La surface de scène a déjà cette géographie, et `apps/ios/CLAUDE.md` § 1 la
/// justifie : les rails vivent dans les COULOIRS, jamais sur le canvas.
///
/// | zone | sur la scène | ici |
/// |---|---|---|
/// | haut | la scène 9:16 | le sujet touché, toujours visible |
/// | gauche | les portes qui font ENTRER | *(rendu au sujet — #4997)* |
/// | droite | contrôleurs + historique | undo / redo, au même endroit |
/// | bas | les options de l'outil ouvert | les outils, PUIS leurs options |
///
/// **Le couloir gauche a été rendu au sujet au #4997** (directive porteur
/// 2026-09-03 : « lister les outils entièrement en bas […] pour laisser la
/// place au canvas d'occuper suffisamment l'espace »). La symétrie avec la
/// surface de scène était un moyen, pas la fin : ici le couloir coûtait 52 pt
/// de largeur de carte — donc ≈ 92 pt de hauteur, le ratio 9:16 les liant —
/// pour ranger dix entrées qu'une rangée basse porte sans rien prendre au
/// sujet. Ce type ne décrit plus qu'un ORDRE et une SÉLECTION ; la place, elle,
/// appartient à la vue.
///
/// ## Ce que le passage de la LISTE au RAIL change — une seule règle
///
/// Les deux modèles portent le même jeu d'entrées : `ComposerObjectEditorSection`
/// avait déjà une entrée par outil. Ce qui change est la BASCULE.
///
/// Le modèle DÉPLIANT d'hier rendait `nil` quand on
/// retape l'entrée ouverte, et son doc-comment dit pourquoi c'est juste CHEZ
/// LUI : « pouvoir tout replier rend la hauteur à la scène — c'est le geste de
/// celui qui positionne ». Dans un rail, la scène ne récupère rien : le rail
/// occupe le couloir, pas le bas. Un `nil` y viderait la zone basse, et un bas
/// vide est le défaut que cet écran existe pour fermer — « `MeeshyToolOptionsPanel`
/// ne rend quelque chose que si un outil est DÉPLIÉ […] "toutes les options"
/// n'existait nulle part ».
///
/// > **Une bascule juste dans une disposition peut être fausse dans une autre.**
/// > Ce n'est pas le geste qui change de valeur, c'est ce que la place LIBÉRÉE
/// > rend — ou ne rend pas.
nonisolated enum ComposerObjectEditorRail {

    /// Les entrées du rail, de haut en bas.
    ///
    /// **Dérivées, jamais recopiées** : `TextEditTool.all` porte l'ordre de la
    /// rangée du SDK, et le lire ici garantit qu'un neuvième outil entre sans
    /// qu'une ligne change — comme l'EFFET (#4870) est entré dans les sections.
    /// Une liste écrite à la main se périme à la prochaine capacité ; c'est le
    /// motif qui a fait tomber deux témoins au #4919.
    ///
    /// Le TEMPS et le PLAN ferment le rail parce qu'ils ne dessinent pas
    /// l'objet, ils le QUALIFIENT — d'où à où il vit, et où il se pose.
    static var entries: [ComposerObjectEditorSection] {
        entries(for: .text)
    }

    /// **Les entrées d'une FAMILLE** (#4937).
    ///
    /// > Directive porteur 2026-09-03 : « Faire la même vue pour les audio de la
    /// > scène, pour les images de la scène, et les vidéos de la scène et même
    /// > les stickers de la scène ! »
    ///
    /// ## Ce qui varie, et ce qui ne varie pas
    ///
    /// `timing` et `plan` valent pour les CINQ familles, et ce n'est pas une
    /// simplification : `timing` règle la fenêtre (`startTime` / `duration`,
    /// que `MeeshySceneObject` expose génériquement), et `plan` est la TIMELINE
    /// — `Plan2DLayout.tracks(from: currentEffects)` dessine toutes les pistes de
    /// la slide et surligne celle de l'objet courant. Ni l'une ni l'autre ne
    /// connaît le type de ce qu'elle règle.
    ///
    /// Ce qui varie est le jeu d'OUTILS. Seul le texte en a — les huit de
    /// `TextEditTool`. Les quatre autres familles n'ont pas encore de panneau
    /// d'options propre, et **cette absence se DÉCLARE plutôt qu'elle ne se
    /// devine** : une entrée sans contenu serait un contrôle inerte (loi 4), et
    /// l'issue autorise explicitement de différer ce qui n'existe pas encore.
    ///
    /// ## Le piège écarté, parce qu'il était tentant
    ///
    /// `ClipInspector.supportsTransform(kind:isBackground:)` semblait être la
    /// règle à réemployer. Elle ne l'est pas : elle répond à « la TIMELINE
    /// peut-elle régler ces propriétés ? » — son doc-comment le dit,
    /// « `SetClipPropertyCommand` refuse ses propriétés, elles se règlent au
    /// doigt sur le canvas » — et non à « cette famille a-t-elle telle entrée ».
    /// Un sticker n'y « supporte pas transform » alors qu'il porte bien x, y,
    /// échelle et rotation.
    ///
    /// > Une règle qui répond à une question VOISINE est plus dangereuse qu'une
    /// > règle absente : elle rend un verdict plausible, et rien ne dit qu'il
    /// > répond à autre chose.
    static func entries(for family: MeeshySceneObject.Kind) -> [ComposerObjectEditorSection] {
        let outils: [ComposerObjectEditorSection]
        switch family {
        case .text:
            outils = TextEditTool.all.map { ComposerObjectEditorSection.tool($0) }
        // **Différées, pas oubliées** : ces familles n'ont pas de panneau
        // d'options propre dans le dépôt. Le `switch` est exhaustif à dessein —
        // une sixième famille ne compilera pas tant qu'elle n'aura pas dit ce
        // qu'elle règle.
        case .media:
            outils = MediaEditTool.served.map { ComposerObjectEditorSection.media($0) }
        // **L'AUDIO a gagné son ROGNAGE le 2026-09-05**, et pas par confort :
        // la bande `timeline` du bas de scène était l'unique chemin pour borner
        // une PUCE DE SON posée (`StoryAudioPlayerObject`), et la directive qui
        // vide la première vue de ses éditions la retire. Sans cette ligne, le
        // lot aurait supprimé une capacité au lieu d'un doublon.
        //
        // > Un retrait ne se mesure pas à ce qu'il enlève, mais à ce qui
        // > SURVIT ailleurs. Les quatre autres surfaces retirées avaient leur
        // > jumelle ici ; celle-ci ne l'avait pas, et rien ne l'aurait dit —
        // > `sourceTrim(id:)` sert les deux familles depuis toujours, donc
        // > aucun type n'aurait rougi.
        case .audio:
            outils = [.media(.trim)]
        // **Différées, pas oubliées** : ces deux familles n'ont pas de panneau
        // d'options propre dans le dépôt. Le `switch` est exhaustif à dessein —
        // une sixième famille ne compilera pas tant qu'elle n'aura pas dit ce
        // qu'elle règle.
        case .sticker, .place:
            outils = []
        }
        return outils + [.timing, .plan]
    }

    /// Ce que le bas montre à l'ouverture — le STYLE, premier geste sur un
    /// texte. Même raison que le modèle dépliant, dont cette valeur est la
    /// reprise : l'écran ne naît jamais muet.
    static let initiallySelected: ComposerObjectEditorSection = .tool(.style)

    /// **La hauteur MAXIMALE de la zone d'options** (#4997).
    ///
    /// Mesurée sur le plus grand panneau servi — la grille des dix-huit styles,
    /// deux rangées de ~64 pt plus son titre et ses marges. Nommée ici plutôt
    /// qu'écrite dans le `body` pour la même raison que le reste de ce type :
    /// un nombre posé en ligne n'est interrogeable que par la source, et
    /// celui-ci arbitre entre le sujet et ses réglages — l'arbitrage exact que
    /// la directive du porteur tranche.
    static let optionsMaxHeight: CGFloat = 260

    /// **La largeur du couloir de tête** (#5026) — 52 pt, celle du #4936.
    ///
    /// Elle est passée à 68 le temps que le rail porte le NOM de chaque outil
    /// (#5029), puis est revenue : la directive du porteur a retiré les noms,
    /// et un couloir large pour un contenu qui ne l'occupe plus prendrait à la
    /// carte une largeur que rien ne réclame.
    ///
    /// La CIBLE reste bornée à 44 pt de HAUT — c'est le contact qui doit rester
    /// atteignable, pas le dessin qui doit grossir.
    static let railWidth: CGFloat = 52

    /// **La bascule a été REFUSÉE au #4936, puis RENDUE POSSIBLE au #5027.**
    ///
    /// Ce qui était écrit ici — « il n'y a pas de fonction de bascule, et c'est
    /// le cœur du lot » — n'était pas une négligence, et sa raison mérite d'être
    /// relue avant d'être révoquée :
    ///
    /// > « Un rail n'en a pas besoin : taper une entrée la sélectionne, point.
    /// > […] L'invariant "le bas n'est jamais vide" est porté par le TYPE :
    /// > l'état de sélection est un `ComposerObjectEditorSection` NON optionnel,
    /// > ce qui rend le vide irreprésentable. »
    ///
    /// Ce raisonnement liait deux choses qui ne le sont plus. Replier exigeait
    /// alors de **vider la sélection**, donc de rejouer le défaut que cet écran
    /// existe pour fermer. Le #5027 a séparé les deux faits : `optionsAreCollapsed`
    /// est un fait d'AFFICHAGE, posé à côté de la sélection et jamais à sa
    /// place. L'outil reste choisi pendant que son panneau se range.
    ///
    /// > **Une bascule refusée parce qu'elle casserait un invariant cesse de le
    /// > casser le jour où l'état qu'elle demandait existe ailleurs.** L'invariant
    /// > du #4936 n'est pas levé ici — il reste vrai, et c'est très exactement ce
    /// > qui rend la bascule sûre. La question à poser à un refus documenté n'est
    /// > donc pas « la raison était-elle bonne ? » mais **« tient-elle encore
    /// > dans le monde d'aujourd'hui ? »**
    ///
    /// > Directive porteur 2026-09-04 : « Lorsqu'on active un outil le retoucher
    /// > le desactive et ses options se cachent. »
    ///
    /// Le geste ne vaut que sur l'entrée DÉJÀ ouverte. Taper une autre entrée
    /// déplie toujours : choisir un outil dit qu'on veut le régler, et laisser
    /// son panneau rangé rendrait le rail muet — c'est ce qui distingue une
    /// bascule d'un interrupteur global.
    static func collapsed(afterTapping tapped: ComposerObjectEditorSection,
                          selected: ComposerObjectEditorSection,
                          wasCollapsed: Bool) -> Bool {
        guard tapped == selected else { return false }
        return !wasCollapsed
    }

    /// **L'outil qui reste sélectionné quand la FAMILLE change** (#4937).
    ///
    /// Cet écran laisse changer d'objet sans en sortir — le plan 2D désigne une
    /// autre piste, et l'éditeur suit. Si le nouvel objet n'est pas de la même
    /// famille, l'outil courant peut ne plus exister pour lui : passer d'un
    /// texte réglé sur POLICE à un sticker laisserait le bas **vide**.
    ///
    /// > C'est très exactement le défaut que l'invariant de type devait
    /// > interdire — et il revient par une porte que ce type ne garde pas. Un
    /// > `ComposerObjectEditorSection` non optionnel garantit qu'une valeur
    /// > existe ; il ne garantit pas qu'elle soit SERVIE par la famille
    /// > courante. Deux propriétés distinctes, et la seconde demande sa règle.
    ///
    /// Ce qui est valide est CONSERVÉ : changer d'objet sans changer de famille
    /// ne doit pas ramener l'auteur au premier outil, sans quoi régler la même
    /// chose sur trois textes de suite deviendrait trois fois le même chemin.
    static func selection(forFamily family: MeeshySceneObject.Kind,
                          keeping current: ComposerObjectEditorSection) -> ComposerObjectEditorSection {
        let servies = entries(for: family)
        guard let premiere = servies.first else { return current }
        return servies.contains(current) ? current : premiere
    }

    static func isSelected(_ entry: ComposerObjectEditorSection,
                           selected: ComposerObjectEditorSection) -> Bool {
        entry == selected
    }

    /// **Le glyphe d'une entrée — un seul site, et provisoire par contrat.**
    ///
    /// #4919 a montré ce que coûte une iconographie décidée dans un corps de
    /// vue ; celle-ci vit donc ici, en une table, et l'issue #4936 dit
    /// explicitement que « l'iconographie des outils et l'ordre exact du rail
    /// relèvent de la planche ». Ce qui est livré est l'ANATOMIE ; ces neuf
    /// symboles sont ce qui se défend en attendant qu'elle tranche.
    ///
    /// **Ils ne redessinent PAS l'indicateur du SDK.**
    /// `StoryTextAttributeCycle.indicator(_:of:)` peint une bulle qui reflète la
    /// VALEUR courante (la lettre dans sa police, l'effet appliqué) — une
    /// seconde écriture de ce rendu aurait divergé au premier outil ajouté. Le
    /// rail dit ce que l'outil FAIT ; la bulle du SDK dit ce qu'il VAUT. Deux
    /// questions, deux surfaces.
    static func symbolName(_ entry: ComposerObjectEditorSection) -> String {
        switch entry {
        case .timing: return "clock"
        case .plan:   return "rectangle.grid.1x2"
        case .media(let outil):
            switch outil {
            case .trim:    return "scissors"
            case .actions: return "slider.horizontal.3"
            case .crop:    return "crop"
            case .split:   return "square.split.2x1"
            case .filter:  return "camera.filters"
            // Le glyphe d'accessibilité d'Apple, celui que le système emploie
            // partout pour VoiceOver — un `text.bubble` aurait dit « commenter »,
            // un `eye` aurait dit « aperçu ».
            case .altText: return "accessibility"
            }
        case .tool(let outil):
            switch outil {
            case .style:      return "textformat"
            case .color:      return "paintpalette"
            case .align:      return "text.alignleft"
            case .background: return "rectangle.fill"
            case .frame:      return "rectangle.dashed"
            case .border:     return "square.on.square.dashed"
            case .language:   return "globe"
            case .effect:     return "sparkles"
            }
        }
    }
}

/// **Le geste de retour au bord de tête** (#4997, directive porteur
/// 2026-09-03 : « le swipe bordure gauche vers la droite doit retourner sur la
/// scène principale »).
///
/// ## Pourquoi une règle pour deux comparaisons
///
/// Parce qu'elles décident d'une sortie DESTRUCTIVE en apparence : l'auteur
/// règle un objet, et un glissement mal interprété referme l'écran sous ses
/// doigts. Les deux seuils doivent donc être éprouvés sur ce qu'ils REFUSENT —
/// un glissement parti du milieu, un glissement trop court, un glissement
/// vertical — et un `if` écrit dans un `body` n'est éprouvable sur aucun des
/// trois.
///
/// ## La dominance verticale n'est pas une précaution de plus
///
/// La rangée d'options défile, le plan 2D se panne, le canvas déplace des
/// objets. Sans le terme vertical, un glissement en diagonale parti du bord —
/// le geste naturel pour attraper une glissière de gauche — refermerait
/// l'écran. C'est le cas que le seuil horizontal seul laisse passer, et le seul
/// que l'utilisateur ne comprendrait pas.
/// **Le glissement qui REND l'écran à la scène** (#5027, directive porteur
/// 2026-09-03).
///
/// > « Le swipe bas doit tout cacher, même l'outil activé à l'instant doit se
/// > désactiver pour laisser pleine place à la scène. »
///
/// ## Deux effets, pas un
///
/// Ranger le clavier ne suffit pas : la zone d'options garderait sa hauteur, et
/// la scène ne gagnerait que les ≈ 300 pt du clavier. La directive demande la
/// PLEINE place, donc le panneau de l'outil s'efface aussi.
///
/// ## L'invariant que ça semble casser, et pourquoi il tient
///
/// `ComposerObjectEditorSection` est NON optionnel depuis #4936, et son
/// doc-comment dit pourquoi : « un `nil` viderait la zone basse, et un bas vide
/// est le défaut que cet écran existe pour fermer ». Un outil désactivé
/// paraît donc contredire le type.
///
/// Il ne le contredit pas, parce que **les deux vides ne sont pas le même** :
/// celui de #4936 était le vide par DÉFAUT — un écran qui s'ouvre muet, sans
/// que personne l'ait demandé. Celui-ci est un vide DEMANDÉ, par un geste
/// délibéré, et réversible d'un tap sur n'importe quel outil.
///
/// > Une bascule juste dans une disposition peut être fausse dans une autre —
/// > et un état interdit comme défaut peut être légitime comme réponse à un
/// > geste. Ce qui change n'est pas l'état, c'est qui l'a voulu.
///
/// L'outil reste donc SÉLECTIONNÉ dans l'état de la vue : rouvrir le panneau
/// ramène celui qu'on réglait, et non le premier de la liste. Le type garde son
/// invariant, et le repli est un fait d'affichage à côté de lui.
nonisolated enum ComposerObjectEditorDismissGesture {

    /// La distance verticale au-delà de laquelle le geste est une INTENTION.
    /// Plus généreuse que le seuil du bord (60 pt) : ce geste part du corps de
    /// l'écran, où la main a plus de course.
    static let minimumTranslation: CGFloat = 70

    /// Le geste rend-il l'écran à la scène ?
    ///
    /// **La dominance verticale n'est pas une précaution de plus** : la zone
    /// d'options défile, le plan 2D panne, le canvas déplace des objets. Sans
    /// ce terme, tout balayage horizontal un peu penché replierait le panneau
    /// qu'on est en train de lire.
    static func completes(translation: CGSize) -> Bool {
        guard translation.height >= minimumTranslation else { return false }
        return abs(translation.height) > abs(translation.width)
    }
}

nonisolated enum ComposerEdgeBackGesture {

    /// La largeur de la lisière qui reçoit le geste. Le système en donne ~20 pt
    /// à sa propre pile de navigation ; s'en écarter ferait apprendre au doigt
    /// deux bords différents dans la même app.
    static let stripWidth: CGFloat = 20

    /// La distance horizontale au-delà de laquelle le geste est une INTENTION,
    /// pas un frôlement.
    static let minimumTranslation: CGFloat = 60

    /// Le geste ferme-t-il l'écran ?
    ///
    /// - Parameter startX: l'abscisse du DÉBUT du geste, dans l'espace global.
    ///   Un glissement parti du milieu de l'écran n'est pas un retour, même
    ///   s'il finit sur le bord.
    /// - Parameter translation: le déplacement cumulé. Le terme vertical n'est
    ///   pas décoratif : il distingue le retour d'un défilement en diagonale.
    static func completes(startX: CGFloat, translation: CGSize) -> Bool {
        guard startX <= stripWidth else { return false }
        guard translation.width >= minimumTranslation else { return false }
        return abs(translation.width) > abs(translation.height)
    }
}

/// **La hauteur SERVIE au panneau d'options** (#5083) — le contenu, plafonné.
///
/// Écrite hors du corps de vue pour être éprouvable : c'est une règle à deux
/// bornes, et chacune répond à un défaut distinct.
///
/// Le PLAFOND est celui de #4997 : au-delà, les options mangeraient la carte.
/// Le PLANCHER à 1 est plus subtil — la hauteur mesurée vaut zéro à la première
/// passe de layout, avant que la préférence ne remonte. Servie telle quelle,
/// elle ferait disparaître le panneau une frame, ce qui se voit comme un
/// clignotement à chaque ouverture d'outil.
nonisolated enum ComposerObjectEditorOptions {
    static func height(content: CGFloat, cap: CGFloat) -> CGFloat {
        min(max(content, 1), cap)
    }
}

/// **La hauteur du contenu du panneau d'options** (#5083).
///
/// Jumelle verticale de ce que `ComposerSceneCardLeadingKey` fait pour le bord
/// gauche de la scène : une vue ne peut pas calculer ce que son enfant mesure,
/// elle ne peut que le RECEVOIR. Sans elle, le panneau prend les 260 points
/// qu'on l'autorise à prendre — un `ScrollView` est glouton dans son axe — et
/// laisse un vide qui ressemble à une marge voulue.
///
/// `max` en réduction : une seule vue publie, et un zéro venu d'une passe de
/// layout intermédiaire ne doit pas écraser la mesure.
struct ComposerObjectEditorOptionsHeightKey: PreferenceKey {
    static let defaultValue: CGFloat = 0
    static func reduce(value: inout CGFloat, nextValue: () -> CGFloat) {
        value = max(value, nextValue())
    }
}
