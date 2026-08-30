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

    /// Les portes SERVIES, dans l'ordre du rail. Déjà filtrées par
    /// `ComposerRailDoor.offered` : cette vue n'a rien à décider.
    let doors: [ComposerRailDoor]

    /// La teinte du plateau, pour que le socle de verre du rail s'y pose au
    /// lieu de flotter sur un fond codé en dur — le défaut exact que le
    /// porteur a signalé sur l'occultation de la rangée (#4032).
    let plateauTint: Color

    var onDoor: ((ComposerRailDoor) -> Void)?

    @State private var lastTapped: ComposerRailDoor?

    var body: some View {
        if !doors.isEmpty {
            VStack(spacing: 10) {
                // Le ressort POUSSE les portes vers le bas : c'est lui, et non
                // un alignement, qui tient la décision 2 — un `VStack` centré
                // remettrait les portes hautes hors de portée du pouce dès que
                // la scène rétrécit.
                Spacer(minLength: 0)
                ForEach(doors, id: \.rawValue) { door in
                    doorButton(door)
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
        Button {
            lastTapped = door
            onDoor?(door)
            HapticFeedback.light()
        } label: {
            Image(systemName: door.symbolName)
                .font(.title3)
                .symbolRenderingMode(.hierarchical)
                .foregroundColor(MeeshyColors.textSecondary(isDark: true))
                .composerToolBounce(active: lastTapped == door)
                // La cible fait 44 pt MÊME si le glyphe est plus petit : c'est
                // la zone TOUCHABLE que la règle borne, pas le dessin.
                .frame(width: ComposerRailGeometry.railWidth,
                       height: ComposerRailGeometry.railWidth)
                .contentShape(Rectangle())
        }
        .accessibilityLabel(Text(ComposerRailCopy.label(door)))
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
