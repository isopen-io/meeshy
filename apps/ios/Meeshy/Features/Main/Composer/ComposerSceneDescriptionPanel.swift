import SwiftUI
import MeeshySDK
import MeeshyUI

/// **La description se lit SUR la scène, et se replie** (#4742 puis #4993,
/// directives porteur des 2026-09-01 et 2026-09-03).
///
/// > « Le texte de description doit se mettre dans la scène pliable avec un
/// > bouton V tout en bas de la scène tout de suite en dessous, et qui devient
/// > ^ après le repli pour afficher de nouveau. » — 2026-09-01
///
/// > « il faut à présent mettre le V et ^ juste en dessus de la scène,
/// > disponible tout le temps, et lorsqu'on déplie ça met le texte si présent
/// > par dessus la scène, sinon l'invitation à insérer un texte. » — 2026-09-03
///
/// ## Ce que les deux lots ont changé, dans l'ordre
///
/// **#4742** a fait de la description un volet PERSISTANT plutôt qu'un MODE :
/// avant lui, le texte n'était visible nulle part hors saisie, et un contenu
/// qui part avec la publication sans jamais s'afficher est un contenu qu'on
/// oublie.
///
/// **#4993** le déplace de sous la carte à SUR la carte. Le volet occupait une
/// marche du plateau — celle que la doctrine de `ComposerSceneSurface` lui
/// donne — et payait deux fois :
/// - le chevron flottait à ≈ 165 pt sous la carte, au milieu du plateau, et
///   rien ne disait à quoi il s'appliquait ;
/// - déplié, il poussait la scène vers le haut et lui reprenait la hauteur que
///   #4124 venait de lui rendre.
///
/// ## Pourquoi ce n'est PAS une entorse à la loi 6
///
/// La loi 6 (« aucun contrôle sur le canvas — le player EST l'aperçu ») bannit
/// de la scène ce qui ferait MENTIR l'aperçu sur le rendu final. La description
/// est le seul contenu du composer dont le lecteur peint DÉJÀ le texte
/// par-dessus le canvas : la légende `content` des viewers. Posée là, elle ne
/// ment pas sur le rendu — elle le rejoint. Le chevron, lui, est une poignée de
/// 44 pt collée au bord bas, hors de la zone où l'on manipule les objets.
///
/// ## L'ORDRE des deux moitiés porte le sens du glyphe
///
/// Le texte se peint AU-DESSUS du chevron, jamais en dessous : c'est ce qui
/// rend « ^ » (remonte-le) et « V » (range-le) littéralement vrais. Inversé, le
/// même glyphe désignerait la direction opposée à celle où le contenu apparaît
/// — le genre de justesse accidentelle qui survit à une relecture.
struct ComposerSceneDescriptionPanel: View {

    let text: String
    let placeholder: String
    @Binding var isCollapsed: Bool
    /// Ouvre la saisie. Le volet LIT ; il n'écrit pas — c'est l'éditeur
    /// existant (`sceneDescriptionEditor`) qui écrit, et deux champs pour un
    /// texte auraient divergé au premier réglage.
    let onEdit: () -> Void

    var body: some View {
        VStack(spacing: 6) {
            if !isCollapsed { lecture }
            chevron
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: - Le chevron

    /// **44 pt de haut, quel que soit le glyphe** (dimension 5) : un chevron
    /// dessiné à sa taille naturelle donnerait une cible de 12 pt que personne
    /// n'atteint du pouce.
    ///
    /// **La CIBLE fait 44 pt, la PASTILLE beaucoup moins** (#4993). Posée sur
    /// le canvas, une cible pleine largeur couvrirait la bande basse de la
    /// scène et volerait au doigt tout objet qu'on y traîne. La forme de
    /// contact suit donc la pastille — c'est le même arbitrage que les deux
    /// rails, qui bornent leur contact à leurs entrées et laissent passer le
    /// reste.
    private var chevron: some View {
        Button {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.9)) {
                isCollapsed.toggle()
            }
            HapticFeedback.light()
        } label: {
            Image(systemName: Self.chevronSymbol(isCollapsed: isCollapsed))
                .font(MeeshyFont.relative(13, weight: .semibold))
                // Blanc, jamais `.secondary` : la pastille flotte sur une scène
                // dont la couleur est celle de l'auteur, pas celle du thème —
                // une teinte sémantique y disparaîtrait sur un fond clair.
                .foregroundStyle(.white)
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

    /// Le libellé du lecteur d'écran dit l'ACTION, jamais l'ÉTAT. « Description
    /// repliée » laisserait deviner ce qu'un appui ferait — et c'est justement
    /// ce qu'un lecteur d'écran ne peut pas voir.
    ///
    /// Il ne se dérive PAS du glyphe : « chevron.up » se prononce mal, et une
    /// chaîne qui sert l'œil ET la voix n'en sert qu'un.
    @MainActor
    static func chevronLabel(isCollapsed: Bool) -> String {
        isCollapsed
            ? String(localized: "composer.description.expand",
                     defaultValue: "Afficher la description", bundle: .main)
            : String(localized: "composer.description.collapse",
                     defaultValue: "Replier la description", bundle: .main)
    }

    // MARK: - La lecture

    /// Le texte, ou son invite. Un tap ouvre la saisie — le volet est une
    /// AFFORDANCE, pas un décor : le toucher doit mener quelque part (loi 4).
    ///
    /// **Sur du verre, jamais à nu** (#4993) : le texte se peint désormais sur
    /// la scène, dont l'auteur choisit la couleur. Une chaîne blanche posée
    /// directement sur un fond clair serait illisible, et un fond OPAQUE
    /// cacherait la moitié basse de ce qu'on décrit.
    private var lecture: some View {
        Button(action: onEdit) {
            Text(text.isEmpty ? placeholder : text)
                .font(MeeshyFont.relative(14, design: .rounded))
                .foregroundStyle(text.isEmpty ? Color.white.opacity(0.75) : Color.white)
                .lineLimit(3)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .adaptiveGlass(in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .contentShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityHint(String(localized: "composer.description.editHint",
                                  defaultValue: "Touchez pour modifier la description",
                                  bundle: .main))
        .transition(.opacity.combined(with: .move(edge: .bottom)))
    }
}
