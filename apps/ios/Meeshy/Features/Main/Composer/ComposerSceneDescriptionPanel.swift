import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La légende se lit ET s'écrit sur la scène** (#4742, #4993, puis #6126 et
/// #6127 — directives porteur des 2026-09-01, 2026-09-03 et 2026-09-12).
///
/// > « Le texte de description doit se mettre dans la scène pliable avec un
/// > bouton V tout en bas de la scène […] qui devient ^ après le repli pour
/// > afficher de nouveau. » — 2026-09-01
///
/// > « il faut à présent mettre le V et ^ juste en dessus de la scène,
/// > disponible tout le temps, et lorsqu'on déplie ça met le texte si présent
/// > par dessus la scène, sinon l'invitation à insérer un texte. » — 2026-09-03
///
/// > « La légende qu'on met dans le canvas […] affichée par défaut quand la
/// > scène s'affiche avec un placeholder invitant à s'exprimer ; lorsqu'on
/// > touche la zone on doit pouvoir éditer EN PLACE, on n'ouvre plus la zone en
/// > bas comme pour l'édition de contenu du poste ! » — 2026-09-12
///
/// ## Les trois lots, dans l'ordre
///
/// **#4742** a fait de la description un volet PERSISTANT plutôt qu'un MODE :
/// un contenu qui part avec la publication sans jamais s'afficher est un
/// contenu qu'on oublie.
///
/// **#4993** l'a déplacé de sous la carte à SUR la carte — le chevron flottait
/// au milieu du plateau sans dire à quoi il s'appliquait, et déplié il
/// reprenait à la scène la hauteur que #4124 venait de lui rendre.
///
/// **#6126** referme la dernière moitié : le volet LISAIT, et le tap ouvrait
/// une zone EN BAS. Deux endroits pour un texte — celui où on le voit, celui où
/// on l'écrit — et l'auteur perdait de vue la scène qu'il légende au moment
/// précis où il la légende.
///
/// ## Ce que le lot déplace, et ce qu'il n'écrit pas
///
/// `ComposerDescriptionLayer` **était déjà** ce qu'il fallait : au repos il rend
/// le texte comme le lecteur le verra (`MessageTextRenderer`, mentions et
/// hashtags compris), un tap l'ouvre en champ, la coche le referme, et la perte
/// de focus — glissement contrôlé compris — range tout dans le bon ordre. Il
/// vivait simplement dans la mauvaise maison.
///
/// Ce volet le monte donc à SA place. Aucun second champ n'apparaît : c'est
/// exactement l'argument que ce fichier invoquait pour rester en lecture
/// — « deux champs pour un texte auraient divergé au premier réglage » —, et il
/// vaut encore, dans l'autre sens.
///
/// ## Pourquoi ce n'est PAS une entorse à la loi 6
///
/// La loi 6 (« aucun contrôle sur le canvas — le player EST l'aperçu ») bannit
/// de la scène ce qui ferait MENTIR l'aperçu sur le rendu final. La description
/// est le seul contenu du composer que le lecteur peint DÉJÀ par-dessus le
/// canvas : la légende `content` des viewers. Posée là, elle ne ment pas sur le
/// rendu — elle le rejoint. Et depuis #6126 elle le rejoint jusqu'au geste :
/// l'auteur écrit à l'endroit exact où son public lira.
///
/// ## L'ORDRE des deux moitiés porte le sens du glyphe
///
/// Le texte se peint AU-DESSUS du chevron, jamais en dessous : c'est ce qui rend
/// « ^ » (remonte-le) et « V » (range-le) littéralement vrais. Inversé, le même
/// glyphe désignerait la direction opposée à celle où le contenu apparaît.
struct ComposerSceneDescriptionPanel: View {

    /// **Le texte lui-même, en écriture** (#6126). Le volet portait une `String`
    /// en lecture et un `onEdit` ; il porte désormais la liaison, parce qu'il
    /// EST le site d'écriture.
    @Binding var text: String

    /// L'invite du CHAMP — ce qu'on attend comme contenu. Distincte de l'amorce
    /// du calque, qui décrit le GESTE (« Touchez pour écrire ») ; les confondre
    /// donnerait soit une amorce muette sur ce qu'il faut faire, soit une invite
    /// qui parle d'un tap qu'on ne peut plus faire, puisqu'on écrit déjà.
    let placeholder: String

    @Binding var isCollapsed: Bool

    /// **Le scheme du CHROME, résolu par le fond de la scène** (#6127).
    ///
    /// Il vient de `CanvasChromeScheme` — luminance WCAG du hex ou du dégradé,
    /// moyenne 8×8 du bitmap pour un fond média — et c'est la MÊME loi que le
    /// reste du chrome du composer consomme déjà. Épinglé ici, il fait suivre
    /// d'un coup tout ce qui vit dessous : l'encre du calque, sa coche, le verre
    /// d'`adaptiveGlass` et le chevron lisent tous `\.colorScheme`.
    ///
    /// > Une couleur décidée ici serait une seconde loi. Le volet n'en pose
    /// > aucune — il branche celle qui existe.
    let chromeScheme: ColorScheme

    /// La capsule de langue, servie par l'hôte et posée au-dessus de la coche
    /// (#5137). `nil` ⇒ rien n'est peint.
    var languageAccessory: AnyView?

    var validationLabel: String = ComposerDescriptionCopy.done

    /// Relayé à l'hôte : il réserve au canvas la hauteur du clavier pendant la
    /// frappe, et sait que la légende n'est plus repliable.
    var onEditingChange: ((Bool) -> Void)?

    /// Relais du jeton d'ouverture externe — voir
    /// `ComposerDescriptionLayer.editingRequest`. Le volet ne l'interprète pas :
    /// les deux portes qui s'en servent (le bouton de l'atelier, la porte
    /// `.description` du rail) s'adressent au CHAMP, pas au volet.
    var editingRequest: Int = 0

    /// **Le volet sait qu'on écrit dedans**, et c'est ce qui retire le chevron
    /// (voir `chevron`). État miroir, alimenté par le calque : `isEditing` lui
    /// appartient et doit lui rester — deux sources pour « écrit-on ? »
    /// divergeraient au premier chemin de fermeture oublié.
    @State private var estEnFrappe = false

    var body: some View {
        VStack(spacing: 6) {
            if !isCollapsed { legende }
            if !estEnFrappe { chevron }
        }
        .frame(maxWidth: .infinity)
        // L'épinglage vaut pour TOUTE la colonne : le calque, sa coche, son
        // verre et le chevron. Un seul point, donc aucun site à oublier.
        .environment(\.colorScheme, chromeScheme)
    }

    // MARK: - La légende, écrite en place

    /// **Sur du verre, jamais à nu** (#4993) : le texte se peint sur la scène,
    /// dont l'auteur choisit la couleur. Un fond OPAQUE cacherait la moitié
    /// basse de ce qu'on décrit ; le verre laisse voir et contraste quand même.
    ///
    /// `opensEditingOnAppear: false` — le volet s'affiche AU REPOS. C'est la
    /// différence exacte avec la zone basse qu'il remplace, qui s'ouvrait en
    /// frappe parce qu'un geste l'avait explicitement demandée : ici, la légende
    /// est là dès que la scène est là, et c'est le tap qui ouvre le champ.
    private var legende: some View {
        ComposerDescriptionLayer(
            text: $text,
            placeholder: placeholder,
            // Trois lignes, comme la légende d'un réel : au-delà, la
            // description mangerait la scène qu'elle est censée laisser voir.
            collapsedLineLimit: 3,
            opensEditingOnAppear: false,
            // Rien à ranger : le calque REND son texte quand la frappe finit,
            // au lieu de disparaître. C'est ce qui distingue un calque posé en
            // place d'une zone qu'on ouvre et qu'on referme.
            onValidate: nil,
            languageAccessory: languageAccessory,
            validationLabel: validationLabel,
            onEditingChange: { enCours in
                estEnFrappe = enCours
                onEditingChange?(enCours)
            },
            editingRequest: editingRequest
        )
        .adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }

    // MARK: - Le chevron

    /// **44 pt de haut, quel que soit le glyphe** (dimension 5) : un chevron
    /// dessiné à sa taille naturelle donnerait une cible de 12 pt que personne
    /// n'atteint du pouce.
    ///
    /// **La CIBLE fait 44 pt, la PASTILLE beaucoup moins** (#4993). Posée sur le
    /// canvas, une cible pleine largeur couvrirait la bande basse de la scène et
    /// volerait au doigt tout objet qu'on y traîne. La forme de contact suit
    /// donc la pastille — même arbitrage que les deux rails, qui bornent leur
    /// contact à leurs entrées.
    ///
    /// **Il s'efface pendant la frappe** (#6126). Clavier levé, il se retrouve à
    /// quelques points du champ : un appui manqué replierait la légende qu'on
    /// est en train d'écrire et lâcherait le focus. Ce n'est pas un contrôle
    /// qu'on cache par prudence — c'est un contrôle qui n'a plus de sens,
    /// puisque ranger le texte pendant qu'on le tape n'est pas une intention.
    private var chevron: some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                isCollapsed.toggle()
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: Self.chevronSymbol(isCollapsed: isCollapsed))
                .font(MeeshyFont.relative(13, weight: .semibold))
                // **Adaptatif, plus blanc en dur** (#6127). Le blanc était
                // justifié ici même par « la pastille flotte sur une scène dont
                // la couleur est celle de l'auteur, pas celle du thème — une
                // teinte sémantique y disparaîtrait sur un fond clair ». Le
                // raisonnement était juste et la conclusion s'arrêtait un cran
                // trop tôt : ce qu'il faut n'est pas une teinte du THÈME, c'est
                // une teinte du FOND. `glassControlForeground` la lit dans le
                // `colorScheme` que ce volet épingle.
                .glassControlForeground()
                .frame(width: 44, height: 30)
                .adaptiveGlass(in: Capsule())
                .contentShape(Capsule())
        }
        .buttonStyle(.plain)
        // **Le libellé dit l'ACTION, jamais l'état.** « Description repliée »
        // laisserait le lecteur d'écran deviner ce qu'un appui ferait ; les
        // deux formulations ci-dessous le disent.
        .accessibilityLabel(Self.chevronLabel(isCollapsed: isCollapsed))
    }

    /// **Le glyphe DIT ce qu'un appui fera, pas où l'on en est.**
    ///
    /// Déplié, le chevron pointe vers le BAS — « range ça » ; replié, vers le
    /// HAUT — « remonte-le ». C'est la directive du porteur mot pour mot :
    /// « un bouton V […] qui devient ^ après le repli ». Règle PURE, hors du
    /// corps : une condition écrite dans un `body` est invisible aux tests, et
    /// celle-ci est tout ce que l'affordance promet.
    nonisolated static func chevronSymbol(isCollapsed: Bool) -> String {
        isCollapsed ? "chevron.up" : "chevron.down"
    }

    /// Le libellé du lecteur d'écran dit l'ACTION, jamais l'ÉTAT. Il ne se dérive
    /// PAS du glyphe : « chevron.up » se prononce mal, et une chaîne qui sert
    /// l'œil ET la voix n'en sert qu'un.
    @MainActor
    static func chevronLabel(isCollapsed: Bool) -> String {
        isCollapsed
            ? String(localized: "composer.description.expand",
                     defaultValue: "Afficher la description", bundle: .main)
            : String(localized: "composer.description.collapse",
                     defaultValue: "Replier la description", bundle: .main)
    }
}
