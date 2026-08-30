import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le rail *leading* — les portes qui font ENTRER de la matière** (#4062,
/// planche rév. 27 § P4, loi 12).
///
/// ## Trois décisions, et aucune n'est un goût
///
/// **1. `leading`, jamais « à gauche ».** En arabe — l'une des sept langues
/// servies — les deux côtés s'échangent. Un rail codé « à gauche » y mettrait
/// les portes du côté des contrôleurs, et retournerait contre son utilisateur
/// le geste qu'il vient d'apprendre. Ce type ne nomme donc jamais un côté : il
/// se place, et le système décide où cela tombe.
///
/// **2. Ancré EN BAS, jamais centré verticalement.** Le rail *leading* est le
/// côté LOIN d'une prise à une main ; centré, ses portes hautes deviennent
/// inatteignables au pouce. L'ancrage bas est ce qui les garde à portée
/// (dimensions 5 et 7).
///
/// **3. Il ne DÉCIDE de rien.** La liste des portes vient de
/// `ComposerRailDoor.offered` — une règle pure, testée hors de tout rendu. Une
/// vue qui filtrerait elle-même ferait naître une seconde loi 4, et les deux
/// divergeraient au premier ajustement.
///
/// ## Ce qu'il ne fait pas
///
/// Il ne pose aucun objet : chaque porte remonte à l'hôte, qui possède les
/// chemins d'ingestion. C'est la même frontière que la rangée d'outils, et pour
/// la même raison — peindre une porte dont le résultat n'a nulle part où aller
/// est exactement ce que la loi 4 interdit.
struct ComposerLeadingRail: View {

    /// **Ce que le rail montre** — les portes, ou les contrôleurs de l'outil en
    /// cours (directive porteur 2026-08-30). Déjà résolu par
    /// `ComposerRailMode.resolve` : cette vue n'a rien à décider, pas plus
    /// qu'elle ne décidait quelles portes peindre.
    let mode: ComposerRailMode

    /// La teinte du plateau, pour que le socle de verre du rail s'y pose au
    /// lieu de flotter sur un fond codé en dur — le défaut exact que le
    /// porteur a signalé sur l'occultation de la rangée (#4032).
    let plateauTint: Color

    var onDoor: ((ComposerRailDoor) -> Void)?

    /// Un contrôleur d'outil a été tapé — l'hôte déplie ou replie son panneau.
    var onToolControl: ((ComposerToolControl) -> Void)?

    /// Le `(x)` — termine l'outil en cours et rend le rail à ses portes.
    var onExitTool: (() -> Void)?

    /// **Le slot de bouton SYSTÈME** (#4092, le collage).
    ///
    /// Les sept portes sont des `Button` qui RAPPELLENT l'hôte : le rail peint
    /// un glyphe, l'hôte fait le reste. Ce patron ne peut pas porter le
    /// collage, et la raison est dans `BlankCanvasPasteStarter` :
    ///
    /// > « `PasteButton` et non un `Button` qui lirait `UIPasteboard.general`.
    /// > Deux propriétés qu'un bouton maison n'a pas : le système accorde
    /// > l'accès au presse-papier SANS la bannière « Coller depuis … », et le
    /// > bouton se désactive de lui-même quand le presse-papier ne porte rien
    /// > d'acceptable — donc jamais d'affordance qui ne ferait rien. »
    ///
    /// Une huitième porte construite sur le patron ordinaire perdrait les deux :
    /// elle ferait paraître la bannière à chaque tap, et resterait peinte devant
    /// un presse-papier vide — ce que la loi 4 interdit précisément.
    ///
    /// D'où un slot où l'hôte rend la vue ENTIÈRE au lieu d'un rappel. Le rail
    /// ne sait pas ce qu'elle fait ; il sait seulement OÙ elle va.
    var systemEntry: AnyView?

    /// La porte APRÈS laquelle le bouton système se place. `nil` ⇒ en fin de
    /// liste. L'ordre vient de la maquette (`3b` : dessin · sticker · COLLAGE ·
    /// mention · lieu), pas d'une commodité de rendu.
    var systemEntryAfter: ComposerRailDoor?

    @State private var lastTapped: String?

    private var isEmpty: Bool {
        switch mode {
        case .doors(let doors):   return doors.isEmpty
        case .tool(let controls): return controls.isEmpty
        }
    }

    var body: some View {
        if !isEmpty {
            VStack(spacing: 10) {
                // Le ressort POUSSE les entrées vers le bas : c'est lui, et non
                // un alignement, qui tient la décision 2 — un `VStack` centré
                // remettrait les entrées hautes hors de portée du pouce dès que
                // la scène rétrécit.
                Spacer(minLength: 0)
                switch mode {
                case .doors(let doors):
                    ForEach(doors, id: \.rawValue) { door in
                        doorButton(door)
                        // Le bouton système se glisse à SA place dans l'ordre,
                        // jamais en bout de rail : la maquette range le collage
                        // entre le sticker et la mention, et une entrée qu'on
                        // relègue à la fin cesse d'être trouvable là où le doigt
                        // l'attend.
                        if let systemEntry, systemEntryAfter == door {
                            systemEntry
                                .frame(width: ComposerRailGeometry.railWidth,
                                       height: ComposerRailGeometry.railWidth)
                        }
                    }
                    if let systemEntry, systemEntryAfter == nil {
                        systemEntry
                            .frame(width: ComposerRailGeometry.railWidth,
                                   height: ComposerRailGeometry.railWidth)
                    }
                case .tool(let controls):
                    ForEach(controls) { control in
                        toolButton(control)
                    }
                    // **Le `(x)` est TOUJOURS le dernier.** La position que le
                    // doigt apprend pour sortir ne doit pas dépendre du nombre
                    // de contrôleurs de l'outil ouvert — quatre pour le dessin,
                    // sept pour le texte.
                    exitButton
                }
            }
            .frame(width: ComposerRailGeometry.railWidth)
            .padding(.vertical, 8)
            .background(
                RoundedRectangle(cornerRadius: ComposerRailGeometry.railWidth / 2, style: .continuous)
                    .fill(plateauTint.opacity(0.55))
            )
            .accessibilityElement(children: .contain)
            .accessibilityLabel(Text(ComposerRailCopy.railLabel))
        }
    }

    private func doorButton(_ door: ComposerRailDoor) -> some View {
        entry(id: door.rawValue,
              symbolName: door.symbolName,
              label: ComposerRailCopy.label(door),
              tint: MeeshyColors.textSecondary(isDark: true)) {
            onDoor?(door)
        }
    }

    /// Un contrôleur d'outil. **Teinté quand son panneau est déplié** — le même
    /// signal que la rangée d'outils de l'atelier donne à l'outil actif, et que
    /// la palette de fond du document donne quand elle est ouverte.
    private func toolButton(_ control: ComposerToolControl) -> some View {
        entry(id: control.id,
              symbolName: control.symbolName,
              label: control.label,
              tint: control.isExpanded
                  ? MeeshyColors.brandPrimary
                  : MeeshyColors.textSecondary(isDark: true)) {
            onToolControl?(control)
        }
    }

    /// **Le `(x)`.** Il porte la couleur du texte, pas celle d'une action
    /// destructrice : terminer un outil ne détruit rien — ce qui a été posé
    /// reste sur la scène.
    private var exitButton: some View {
        entry(id: "tool.exit",
              symbolName: "xmark",
              label: ComposerToolExitCopy.label,
              tint: MeeshyColors.textPrimary(isDark: true)) {
            onExitTool?()
        }
    }

    /// Le gabarit COMMUN des trois. Il existe pour que la cible de 44 pt, le
    /// rebond et la forme de contact ne soient écrits qu'une fois : trois
    /// copies auraient divergé au premier ajustement, et c'est la zone
    /// TOUCHABLE — pas le dessin — que la règle borne.
    private func entry(id: String,
                       symbolName: String,
                       label: String,
                       tint: Color,
                       action: @escaping () -> Void) -> some View {
        Button {
            lastTapped = id
            action()
            HapticFeedback.light()
        } label: {
            Image(systemName: symbolName)
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(tint)
                .composerToolBounce(active: lastTapped == id)
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(label))
    }
}

/// Les libellés du rail — VoiceOver nomme chaque porte par son VERBE, jamais
/// par son glyphe (loi 7 : l'icône EST le verbe, donc le lecteur d'écran doit
/// entendre ce verbe-là).
nonisolated enum ComposerRailCopy {

    static var railLabel: String {
        String(localized: "composer.rail.leading.label",
               defaultValue: "Ajouter à la scène", bundle: .main)
    }

    static func label(_ door: ComposerRailDoor) -> String {
        switch door {
        case .description:
            return String(localized: "composer.rail.description",
                          defaultValue: "Décrire", bundle: .main)
        case .media:
            return String(localized: "composer.rail.media",
                          defaultValue: "Ajouter un média", bundle: .main)
        case .sound:
            return String(localized: "composer.rail.sound",
                          defaultValue: "Ajouter un son", bundle: .main)
        case .sticker:
            return String(localized: "composer.rail.sticker",
                          defaultValue: "Ajouter un sticker", bundle: .main)
        case .mention:
            return String(localized: "composer.rail.mention",
                          defaultValue: "Nommer quelqu'un", bundle: .main)
        case .place:
            return String(localized: "composer.rail.place",
                          defaultValue: "Ajouter un lieu", bundle: .main)
        case .drawing:
            return String(localized: "composer.rail.drawing",
                          defaultValue: "Dessiner", bundle: .main)
        case .text:
            return String(localized: "composer.rail.text",
                          defaultValue: "Ajouter du texte", bundle: .main)
        }
    }
}
