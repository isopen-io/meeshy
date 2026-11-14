#if DEBUG
import SwiftUI

extension MeeshyKitCatalog {
    nonisolated static let entryK12 = MeeshyKitCatalogEntry(
        key: "K12",
        name: "MeeshyEdgeRails",
        states: [
            MeeshyKitCatalogState(id: "compact", boardView: "R3", backdrop: .media),
            MeeshyKitCatalogState(id: "compact-coller", boardView: "R3", backdrop: .media),
            MeeshyKitCatalogState(id: "compact-actif", boardView: "R3", backdrop: .media),
            MeeshyKitCatalogState(id: "compact-clair", backdrop: .light),
            MeeshyKitCatalogState(id: "viseur", boardView: "A8", backdrop: .media),
            MeeshyKitCatalogState(id: "defile", backdrop: .media),
            MeeshyKitCatalogState(id: "libelle", boardView: "I1", backdrop: .dark),
            MeeshyKitCatalogState(id: "libelle-etroit", boardView: "I4", backdrop: .dark),
            MeeshyKitCatalogState(id: "libelle-serre", backdrop: .dark),
            MeeshyKitCatalogState(id: "selection", boardView: "I2", backdrop: .dark),
            MeeshyKitCatalogState(id: "libelle-actif", backdrop: .dark),
            MeeshyKitCatalogState(id: "grise", boardView: "I3", backdrop: .dark),
            MeeshyKitCatalogState(id: "presse", backdrop: .dark),
        ]
    )

    @MainActor @ViewBuilder
    static func contentK12(state: MeeshyKitCatalogState, isPressed: Bool) -> some View {
        MeeshyEdgeRailsSample(stateID: state.id, isPressed: isPressed)
    }
}

/// L'échantillon d'un état : les rails dans un cadre de la taille d'une scène
/// de téléphone couché, aux mots de la planche (Texte, Média, Sticker…). Le
/// catalogue montre les rails au repos : ils ne parlent à personne.
private struct MeeshyEdgeRailsSample: View {
    let stateID: String
    let isPressed: Bool

    var body: some View {
        if stateID == "presse" {
            pressedFaces
        } else {
            rails
        }
    }

    private var pressedFaces: some View {
        let item = MeeshyEdgeRailItem(id: "text", label: "Ajouter un texte", title: "Texte", glyph: .system("textformat"))
        let lit = MeeshyEdgeRailItem(id: "sound", label: "Ajouter un son", title: "Son", glyph: .system("music.note"), isOn: true)
        return HStack(spacing: MeeshySpacing.md) {
            MeeshyGlassButtonFace(systemImage: "textformat", isPressed: true)
            VStack(spacing: MeeshyEdgeRailsRecipe.rowSpacing) {
                MeeshyEdgeRailRowFace(item: item, isPressed: true)
                MeeshyEdgeRailRowFace(item: lit, isPressed: true)
                MeeshyEdgeRailRowFace(item: item, isPressed: false)
            }
            .frame(width: MeeshyEdgeRailWidth.regular.points)
        }
    }

    private var rails: some View {
        MeeshyEdgeRails(
            leading: leadingSpec,
            trailing: trailingSpec,
            presentation: presentation,
            visibility: stateID == "grise" ? .dimmed : .shown,
            tone: stateID == "compact-clair" ? .onLight : nil,
            onAction: { _ in },
            custom: { _, _ in
                MeeshyGlassButtonFace(systemImage: "doc.on.clipboard", kind: .active)
            }
        )
        .frame(width: 340, height: height)
    }

    private var height: CGFloat {
        switch stateID {
        case "defile": return 280
        case "libelle", "libelle-actif", "grise", "libelle-etroit", "libelle-serre": return 470
        case "selection": return 440
        default: return 400
        }
    }

    private var presentation: MeeshyEdgeRailsPresentation {
        switch stateID {
        case "libelle", "selection", "libelle-actif": return .labeled(.regular)
        case "libelle-etroit", "grise": return .labeled(.narrow)
        case "libelle-serre": return .labeled(.tight)
        default: return .compact
        }
    }

    private var leadingSpec: MeeshyEdgeRailSpec? {
        switch stateID {
        case "viseur", "selection": return nil
        case "compact-coller": return Self.addRail(withPaste: true, litID: nil)
        case "compact-actif": return Self.addRail(withPaste: false, litID: "sticker")
        case "libelle-actif": return Self.addRail(withPaste: false, litID: "sound")
        case "defile": return Self.longRail
        case "libelle", "libelle-etroit", "libelle-serre", "grise":
            return Self.addRail(withPaste: false, litID: nil, header: "Ajouter", count: 8)
        default: return Self.addRail(withPaste: false, litID: nil)
        }
    }

    private var trailingSpec: MeeshyEdgeRailSpec? {
        switch stateID {
        case "viseur": return Self.viewfinderRail
        case "selection": return Self.selectionRail
        case "defile", "libelle", "libelle-actif": return nil
        default: return Self.sceneRail
        }
    }

    private static let tools: [(id: String, label: String, title: String, glyph: String)] = [
        ("text", "Ajouter un texte", "Texte", "textformat"),
        ("media", "Ajouter une photo ou une vidéo", "Média", "photo.on.rectangle"),
        ("sticker", "Ajouter un sticker", "Sticker", "face.smiling"),
        ("sound", "Ajouter un son", "Son", "music.note"),
        ("drawing", "Dessiner", "Dessin", "scribble"),
        ("background", "Changer le fond", "Fond", "paintpalette"),
        ("mention", "Mentionner quelqu'un", "Mention", "at"),
        ("place", "Ajouter un lieu", "Lieu", "mappin.and.ellipse"),
    ]

    private static func addRail(withPaste: Bool, litID: String?, header: String? = nil, count: Int = 6) -> MeeshyEdgeRailSpec {
        let items = tools.prefix(count).map { tool in
            MeeshyEdgeRailEntry.item(MeeshyEdgeRailItem(
                id: tool.id, label: tool.label, title: tool.title, glyph: .system(tool.glyph), isOn: tool.id == litID
            ))
        }
        return MeeshyEdgeRailSpec(
            name: "Ce qu'on pose", header: header,
            entries: (withPaste ? [.custom(id: "paste")] : []) + items
        )
    }

    private static var longRail: MeeshyEdgeRailSpec {
        MeeshyEdgeRailSpec(name: "Ce qu'on pose", entries: (0..<14).map { index in
            .item(MeeshyEdgeRailItem(id: "tool-\(index)", label: "Outil \(index + 1)", glyph: .system("circle")))
        })
    }

    private static var sceneRail: MeeshyEdgeRailSpec {
        MeeshyEdgeRailSpec(name: "La scène et la publication", header: "Scène", entries: [
            .item(MeeshyEdgeRailItem(id: "preview", label: "Aperçu de la scène", title: "Aperçu", glyph: .system("play"))),
            .item(MeeshyEdgeRailItem(id: "slides", label: "Les diapos de la scène", title: "Diapos", glyph: .system("square.stack"))),
            .item(MeeshyEdgeRailItem(id: "more", label: "Plus d'options", title: "Plus", glyph: .system("ellipsis"))),
        ])
    }

    private static var viewfinderRail: MeeshyEdgeRailSpec {
        MeeshyEdgeRailSpec(name: "Le viseur", entries: [
            .item(MeeshyEdgeRailItem(id: "flip", label: "Retourner la caméra", glyph: .system("arrow.triangle.2.circlepath.camera"))),
            .item(MeeshyEdgeRailItem(id: "flash", label: "Flash", glyph: .system("bolt"))),
            .divider,
            .item(MeeshyEdgeRailItem(id: "timer", label: "Minuteur", glyph: .system("timer"))),
            .item(MeeshyEdgeRailItem(id: "grid", label: "Grille", glyph: .system("grid"))),
        ])
    }

    private static var selectionRail: MeeshyEdgeRailSpec {
        MeeshyEdgeRailSpec(
            name: "Sélection", header: "Sélection",
            entries: [
                .item(MeeshyEdgeRailItem(id: "duplicate", label: "Dupliquer l'objet", title: "Dupliquer", glyph: .system("plus.square.on.square"))),
                .item(MeeshyEdgeRailItem(id: "front", label: "Mettre l'objet devant", title: "Devant", glyph: .system("square.3.layers.3d.top.filled"))),
                .item(MeeshyEdgeRailItem(id: "remove", label: "Retirer l'objet", title: "Retirer", glyph: .system("trash"), role: .destructive)),
            ],
            foot: [
                MeeshyEdgeRailItem(id: "undo", label: "Annuler", glyph: .system("arrow.uturn.backward")),
                MeeshyEdgeRailItem(id: "redo", label: "Rétablir", glyph: .system("arrow.uturn.forward")),
            ]
        )
    }
}
#endif
