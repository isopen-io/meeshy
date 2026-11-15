package me.meeshy.sdk.model.call

/**
 * Le rôle d'un bouton de l'appel pour son verre : neutre (inactif ou en pause automatique), actif (un disque blanc
 * plein à glyphe sombre) ou Fin. Les quatre états visuels de l'écran (`CallPillKind`) s'y réduisent.
 */
enum class CallButtonRole { Neutral, Active, Destructive }

/** Ce que dessine la surface d'un bouton : un verre neutre, ou le verre rouge de Fin. */
enum class CallButtonGlassSurface { Glass, ProminentRed }

/**
 * Le traitement de verre d'UN bouton. [hasSolidWhiteBacking] : l'actif est un blanc plein, le contraste de son glyphe
 * ne dépend jamais de la teinte que le verre voudrait bien prendre. [drawsPressHighlight] : le verre dessiné ne réagit
 * pas seul au doigt, il s'éclaircit sous lui.
 */
data class CallButtonGlassTreatment(
    val surface: CallButtonGlassSurface,
    val isInteractive: Boolean,
    val hasSolidWhiteBacking: Boolean,
    val drawsPressHighlight: Boolean,
)

/**
 * #17323 — la loi qui choisit le verre de CHAQUE bouton de l'appel (pilule, rangées du (…), panneaux, en-tête).
 * Directive du porteur : chaque bouton porte son propre verre, et Fin reste rouge. Miroir de iOS `CallButtonGlassRule`
 * (`apps/ios/Meeshy/Features/Call/Models/CallButtonGlassRule.swift`) ; Android n'a pas de Liquid Glass, son verre est
 * `MeeshyGlassSurface` partout (dessiné, `liquid` pour le reflet), donc la loi ne dépend pas de la version de l'OS et
 * la surbrillance sous le doigt est toujours dessinée.
 *
 * La vue ne décide rien : elle applique ce que cette loi rend.
 */
object CallButtonGlassRule {
    fun treatment(role: CallButtonRole): CallButtonGlassTreatment = CallButtonGlassTreatment(
        surface = if (role == CallButtonRole.Destructive) CallButtonGlassSurface.ProminentRed else CallButtonGlassSurface.Glass,
        isInteractive = true,
        hasSolidWhiteBacking = role == CallButtonRole.Active,
        drawsPressHighlight = true,
    )
}
