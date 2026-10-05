// GÉNÉRÉ — ne pas éditer; source: packages/shared/design/call-capture-frames
// Régénérer : `cd packages/shared && bun run generate:call-frames`.
// Fraîcheur gardée par packages/shared/__tests__/call-capture-frames-swift.test.ts.

import MeeshySDK

nonisolated extension CallFrameCatalogue {
    static let deconnecteFrames: [CallFrameDesign] = [
        CallFrameDesign(
            id: "deconnecte.carte-postale.duo",
            motif: "deconnecte.carte-postale",
            mood: .deconnecte,
            name: "Carte postale",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .diagonal, margin: 0.08, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFDF7", pad: 0.06, foot: 0.0), tilt: .gentle, tone: .warm, duotone: nil),
                background: .solid(color: "#F3E9D8"),
                pattern: CallFramePattern(kind: .grain, color: "#3B2F2A", opacity: 0.08),
                border: CallFrameBorder(kind: .perforated, color: "#C8553D", width: 0.018, inset: 0.022),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#D9C3A0", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#E9D8A6CC", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#3B2F2A", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .handwriting, color: "#3B2F2A", fill: nil),
                title: CallFrameTitle(source: .date, font: .typewriter, color: "#C8553D", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .names, font: .handwriting, color: "#2B4C7E", place: .top, size: .m, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.carte-postale.comite",
            motif: "deconnecte.carte-postale",
            mood: .deconnecte,
            name: "Carte postale",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.08, gap: 0.03, top: 0.15, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFDF7", pad: 0.06, foot: 0.0), tilt: .gentle, tone: .warm, duotone: nil),
                background: .solid(color: "#F3E9D8"),
                pattern: CallFramePattern(kind: .grain, color: "#3B2F2A", opacity: 0.08),
                border: CallFrameBorder(kind: .perforated, color: "#C8553D", width: 0.018, inset: 0.022),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#D9C3A0", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#E9D8A6CC", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#3B2F2A", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .tag, font: .handwriting, color: "#3B2F2A", fill: nil),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#2B4C7E", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#C8553D", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.carte-postale.groupe",
            motif: "deconnecte.carte-postale",
            mood: .deconnecte,
            name: "Carte postale",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.09, gap: 0.025, top: 0.14, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: CallFrameCard(color: "#FFFDF7", pad: 0.05, foot: 0.0), tilt: .none, tone: .warm, duotone: nil),
                background: .solid(color: "#F3E9D8"),
                pattern: CallFramePattern(kind: .grain, color: "#3B2F2A", opacity: 0.08),
                border: CallFrameBorder(kind: .perforated, color: "#C8553D", width: 0.018, inset: 0.022),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#D9C3A0", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#E9D8A6CC", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#3B2F2A", size: .s, font: nil),
                names: CallFrameNames(show: .name, style: .list, font: .handwriting, color: "#3B2F2A", fill: nil),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#2B4C7E", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#C8553D", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.carte-postale.tablee",
            motif: "deconnecte.carte-postale",
            mood: .deconnecte,
            name: "Carte postale",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.08, gap: 0.02, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .stamp, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: CallFrameCard(color: "#FFFDF7", pad: 0.04, foot: 0.0), tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#F3E9D8"),
                pattern: CallFramePattern(kind: .grain, color: "#3B2F2A", opacity: 0.08),
                border: CallFrameBorder(kind: .perforated, color: "#C8553D", width: 0.018, inset: 0.022),
                ornaments: [
                    CallFrameOrnament(kind: .grain, color: "#D9C3A0", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#E9D8A6CC", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .both, place: .bottomRight, color: "#3B2F2A", size: .s, font: nil),
                names: CallFrameNames(show: .none, style: .tag, font: .handwriting, color: "#3B2F2A", fill: nil),
                title: CallFrameTitle(source: .group, font: .handwriting, color: "#2B4C7E", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#C8553D", place: .bottom, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.road-trip.duo",
            motif: "deconnecte.road-trip",
            mood: .deconnecte,
            name: "Road trip",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .split, margin: 0.12, gap: 0.03, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .solid(color: "#1E1A17"),
                pattern: nil,
                border: CallFrameBorder(kind: .filmstrip, color: "#F3E9D8", width: 0.07, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E07A5F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#F2CC8F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#F3E9D8", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .handle, style: .plate, font: .retro, color: "#F2CC8F", fill: "#1E1A17CC"),
                title: CallFrameTitle(source: .names, font: .retro, color: "#F2CC8F", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#E07A5F", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.road-trip.comite",
            motif: "deconnecte.road-trip",
            mood: .deconnecte,
            name: "Road trip",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .row, margin: 0.12, gap: 0.025, top: 0.12, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .solid(color: "#1E1A17"),
                pattern: nil,
                border: CallFrameBorder(kind: .filmstrip, color: "#F3E9D8", width: 0.07, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E07A5F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#F2CC8F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#F3E9D8", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .handle, style: .caption, font: .retro, color: "#F2CC8F", fill: nil),
                title: CallFrameTitle(source: .group, font: .retro, color: "#F2CC8F", place: .top, size: .m, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "deconnecte.road-trip.groupe",
            motif: "deconnecte.road-trip",
            mood: .deconnecte,
            name: "Road trip",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.12, gap: 0.02, top: 0.1, bottom: 0.1),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .faded, duotone: nil),
                background: .solid(color: "#1E1A17"),
                pattern: nil,
                border: CallFrameBorder(kind: .filmstrip, color: "#F3E9D8", width: 0.07, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .lightleak, color: "#E07A5F", density: .mid, layer: .back),
                    CallFrameOrnament(kind: .grain, color: "#F2CC8F", density: .low, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .bottomLeft, color: "#F3E9D8", size: .s, font: StoryTextStyle.retro),
                names: CallFrameNames(show: .handle, style: .plate, font: .typewriter, color: "#F2CC8F", fill: "#1E1A17CC"),
                title: CallFrameTitle(source: .group, font: .retro, color: "#F2CC8F", place: .top, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "deconnecte.cahier-de-vacances.duo",
            motif: "deconnecte.cahier-de-vacances",
            mood: .deconnecte,
            name: "Cahier de vacances",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .cascade, margin: 0.08, gap: 0.03, top: 0.15, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.18), tilt: .wild, tone: .faded, duotone: nil),
                background: .solid(color: "#FBF7EE"),
                pattern: CallFramePattern(kind: .grid, color: "#6C9BD2", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .leaves, color: "#81B29A", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#F2CC8FCC", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#2B4C7E", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .caption, font: .handwriting, color: "#2B4C7E", fill: nil),
                title: CallFrameTitle(source: .names, font: .note, color: "#C8553D", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .handwriting, color: "#2B4C7E", place: .top, size: .s, effect: nil, letterCase: nil)
            )
        ),
        CallFrameDesign(
            id: "deconnecte.cahier-de-vacances.comite",
            motif: "deconnecte.cahier-de-vacances",
            mood: .deconnecte,
            name: "Cahier de vacances",
            bucket: .comite,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .scatter, margin: 0.07, gap: 0.03, top: 0.15, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.05, foot: 0.18), tilt: .wild, tone: .faded, duotone: nil),
                background: .solid(color: "#FBF7EE"),
                pattern: CallFramePattern(kind: .grid, color: "#6C9BD2", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .leaves, color: "#81B29A", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#F2CC8FCC", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#2B4C7E", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .caption, font: .handwriting, color: "#2B4C7E", fill: nil),
                title: CallFrameTitle(source: .group, font: .note, color: "#C8553D", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "deconnecte.cahier-de-vacances.groupe",
            motif: "deconnecte.cahier-de-vacances",
            mood: .deconnecte,
            name: "Cahier de vacances",
            bucket: .groupe,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .mosaic, margin: 0.06, gap: 0.03, top: 0.14, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: true, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.16), tilt: .gentle, tone: .faded, duotone: nil),
                background: .solid(color: "#FBF7EE"),
                pattern: CallFramePattern(kind: .grid, color: "#6C9BD2", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .leaves, color: "#81B29A", density: .low, layer: .back),
                    CallFrameOrnament(kind: .tape, color: "#F2CC8FCC", density: .mid, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#2B4C7E", size: .m, font: nil),
                names: CallFrameNames(show: .name, style: .caption, font: .note, color: "#2B4C7E", fill: nil),
                title: CallFrameTitle(source: .group, font: .note, color: "#C8553D", place: .top, size: .l, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "deconnecte.cahier-de-vacances.tablee",
            motif: "deconnecte.cahier-de-vacances",
            mood: .deconnecte,
            name: "Cahier de vacances",
            bucket: .tablee,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .grid, margin: 0.06, gap: 0.02, top: 0.12, bottom: 0.08),
                slot: CallFrameSlotStyle(shape: .rect, radius: nil, stroke: nil, double: false, glow: nil, shadow: false, card: CallFrameCard(color: "#FFFFFF", pad: 0.04, foot: 0.12), tilt: .gentle, tone: .faded, duotone: nil),
                background: .solid(color: "#FBF7EE"),
                pattern: CallFramePattern(kind: .grid, color: "#6C9BD2", opacity: 0.22),
                border: nil,
                ornaments: [
                    CallFrameOrnament(kind: .tape, color: "#F2CC8FCC", density: .low, layer: .front)
                ],
                brand: CallFrameBrand(mark: .logo, place: .topRight, color: "#2B4C7E", size: .m, font: nil),
                names: CallFrameNames(show: .none, style: .caption, font: .note, color: "#2B4C7E", fill: nil),
                title: CallFrameTitle(source: .group, font: .note, color: "#C8553D", place: .top, size: .m, effect: nil, letterCase: nil),
                subtitle: nil
            )
        ),
        CallFrameDesign(
            id: "deconnecte.coucher-de-soleil.duo",
            motif: "deconnecte.coucher-de-soleil",
            mood: .deconnecte,
            name: "Coucher de soleil",
            bucket: .duo,
            look: CallFrameLook(
                layout: CallFrameLayout(arrangement: .column, margin: 0.07, gap: 0.05, top: 0.08, bottom: 0.2),
                slot: CallFrameSlotStyle(shape: .arch, radius: nil, stroke: CallFrameStroke(color: "#FFF8EE", width: 0.02), double: false, glow: nil, shadow: false, card: nil, tilt: .none, tone: .warm, duotone: nil),
                background: .linear(colors: ["#F2CC8F", "#E07A5F", "#6D597A"], angle: 0.0),
                pattern: nil,
                border: CallFrameBorder(kind: .polaroid, color: "#FFFDF7", width: 0.03, inset: 0.0),
                ornaments: [
                    CallFrameOrnament(kind: .rays, color: "#FFF1D0", density: .low, layer: .back),
                    CallFrameOrnament(kind: .lightleak, color: "#FFB38A", density: .mid, layer: .back)
                ],
                brand: CallFrameBrand(mark: .wordmark, place: .watermark, color: "#FFFFFF1F", size: .s, font: nil),
                names: CallFrameNames(show: .both, style: .caption, font: .handwriting, color: "#FFF8EE", fill: "#3B2F2ACC"),
                title: CallFrameTitle(source: .names, font: .handwriting, color: "#3B2F2A", place: .bottom, size: .l, effect: nil, letterCase: nil),
                subtitle: CallFrameTitle(source: .date, font: .typewriter, color: "#3B2F2A", place: .bottom, size: .s, effect: nil, letterCase: CallFrameLetterCase.upper)
            )
        )
    ]
}
