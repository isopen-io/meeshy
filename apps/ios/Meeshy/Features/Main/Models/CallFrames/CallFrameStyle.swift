import Foundation

/// Ce qu'une DÉCLINAISON change dans l'apparence d'un cadre (#12685) : seules les clés qu'elle
/// déclare remplacent celles du cadre, clé par clé, comme une variante de tranche.
nonisolated struct CallFrameLookOverride: Equatable, Sendable {
    var layout: CallFrameLayout? = nil
    var slot: CallFrameSlotStyle? = nil
    var background: CallFrameBackground? = nil
    var pattern: CallFramePattern? = nil
    var border: CallFrameBorder? = nil
    var ornaments: [CallFrameOrnament]? = nil
    var brand: CallFrameBrand? = nil
    var names: CallFrameNames? = nil
    var title: CallFrameTitle? = nil
    var subtitle: CallFrameTitle? = nil
    var elements: [CallFrameElement]? = nil
    var scene: [CallFrameSceneLayer]? = nil
    var behaviors: [CallFrameBehavior]? = nil
    var fallbacks: CallFrameFallbacks? = nil
}

/// Une déclinaison d'un cadre : même motif, même disposition par tranche, autre habillage — par
/// exemple sa version « Relief », matière et moulure illustrées. Elle se choisit d'un glissement
/// vertical dans la vignette du cadre.
nonisolated struct CallFrameStyle: Equatable, Sendable {
    let id: String
    let name: String
    let look: CallFrameLookOverride
}

nonisolated extension CallFrameLook {
    func applying(_ override: CallFrameLookOverride) -> CallFrameLook {
        CallFrameLook(
            layout: override.layout ?? layout, slot: override.slot ?? slot, background: override.background ?? background,
            pattern: override.pattern ?? pattern, border: override.border ?? border, ornaments: override.ornaments ?? ornaments,
            brand: override.brand ?? brand, names: override.names ?? names, title: override.title ?? title,
            subtitle: override.subtitle ?? subtitle, elements: override.elements ?? elements, scene: override.scene ?? scene,
            behaviors: override.behaviors ?? behaviors, fallbacks: override.fallbacks ?? fallbacks
        )
    }
}

/// **LES DÉCLINAISONS D'UN CADRE** (#12685), en fonctions pures. Une déclinaison a pour identifiant
/// celui du cadre suivi du sien (`ambiance.motif.tranche.style`, quatre parties : la forme que la
/// passerelle accepte déjà) ; un client qui ne la connaît pas retombe sur le cadre de base.
nonisolated enum CallFrameStyleRule {
    /// Le cadre `design` sous la déclinaison `style`.
    static func styled(_ design: CallFrameDesign, with style: CallFrameStyle) -> CallFrameDesign {
        CallFrameDesign(
            id: "\(design.id).\(style.id)", motif: design.motif, mood: design.mood, name: design.name, bucket: design.bucket,
            look: design.look.applying(style.look), credits: design.credits, surfaces: design.surfaces, cost: design.cost,
            styles: design.styles, styleId: style.id
        )
    }

    /// Un identifiant du catalogue, de base ou décliné.
    static func resolve(id: String, in frames: [CallFrameDesign]) -> CallFrameDesign? {
        if let base = frames.first(where: { $0.id == id }) { return base }
        let parts = id.split(separator: ".", omittingEmptySubsequences: false).map(String.init)
        guard parts.count == 4, let base = frames.first(where: { $0.id == parts.prefix(3).joined(separator: ".") }) else { return nil }
        return base.styles.first { $0.id == parts[3] }.map { styled(base, with: $0) }
    }

    /// L'identifiant du cadre de base d'un identifiant, décliné ou non.
    static func baseId(of id: String) -> String {
        let parts = id.split(separator: ".", omittingEmptySubsequences: false)
        return parts.count == 4 ? parts.prefix(3).joined(separator: ".") : id
    }

    /// Le cadre de base puis chacune de ses déclinaisons, dans l'ordre du motif.
    static func declinations(of baseId: String, in frames: [CallFrameDesign]) -> [CallFrameDesign] {
        guard let base = frames.first(where: { $0.id == baseId }) else { return [] }
        return [base] + base.styles.map { styled(base, with: $0) }
    }

    /// La déclinaison voisine (`offset` = ±1) d'un cadre, sans boucler ; `nil` au bord.
    static func neighbour(of id: String, offset: Int, in frames: [CallFrameDesign]) -> CallFrameDesign? {
        let list = declinations(of: baseId(of: id), in: frames)
        guard let index = list.firstIndex(where: { $0.id == id }), list.indices.contains(index + offset) else { return nil }
        return list[index + offset]
    }
}
