package me.meeshy.app.profile

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileTab
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.accessibility.MeeshyMinTapTarget
import me.meeshy.ui.haptics.rememberMeeshyHaptics
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyOpacity
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** Les trois onglets de la fiche, dans l'ordre iOS : Postes, Conversations, Détails. */
internal val PROFILE_SHEET_TABS: List<ProfileTab> = ProfileTab.entries.toList()

internal const val PROFILE_TAB_BAR_TAG = "profile-tab-bar"

/**
 * L'onglet choisi de la fiche (miroir de `@State selectedTab = .details` iOS) : Détails par défaut,
 * restauré après recréation (rotation, processus) par [Saver] ; un nom inconnu retombe sur le défaut.
 */
@Stable
internal class ProfileTabBarState(initial: ProfileTab = ProfileTab.DEFAULT) {
    var selected: ProfileTab by mutableStateOf(initial)
        private set

    /** Choisit [tab] ; vrai seulement si la sélection a changé. */
    fun select(tab: ProfileTab): Boolean {
        if (tab == selected) return false
        selected = tab
        return true
    }

    companion object {
        val Saver: Saver<ProfileTabBarState, String> = Saver(
            save = { it.selected.name },
            restore = { ProfileTabBarState(restored(it)) },
        )

        fun restored(saved: String?): ProfileTab =
            ProfileTab.entries.firstOrNull { it.name == saved } ?: ProfileTab.DEFAULT
    }
}

/** L'état d'onglets d'une fiche, propre à la personne [key] et restauré après recréation. */
@Composable
internal fun rememberProfileTabBarState(key: String): ProfileTabBarState =
    rememberSaveable(key, saver = ProfileTabBarState.Saver) { ProfileTabBarState() }

/**
 * La barre d'onglets épinglée (miroir de `pinnedTabBar` iOS) : icône + titre, soulignement de 2 dp
 * dans la couleur du PROFIL, ressort 0,3 / 0,8 (fondu sec sous « Réduire les animations »), haptique
 * légère, état « sélectionné » annoncé par TalkBack. [topInset] la fait glisser sous la barre
 * compacte : ce retrait reste TRANSPARENT et sans geste, il ne capte aucune touche destinée à la
 * liste dessous ; seul le bandeau des onglets porte le fond.
 */
@Composable
internal fun ProfileTabBar(
    selected: ProfileTab,
    accent: Color,
    onSelect: (ProfileTab) -> Unit,
    modifier: Modifier = Modifier,
    topInset: Dp = 0.dp,
) {
    val haptics = rememberMeeshyHaptics()
    Column(modifier.fillMaxWidth().padding(top = topInset)) {
        Column(Modifier.fillMaxWidth().background(MeeshyTheme.tokens.backgroundPrimary).testTag(PROFILE_TAB_BAR_TAG)) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = MeeshySpacing.xl)
                    .padding(top = MeeshySpacing.md)
                    .selectableGroup(),
            ) {
                PROFILE_SHEET_TABS.forEach { tab ->
                    ProfileTabButton(
                        tab = tab,
                        isSelected = tab == selected,
                        accent = accent,
                        onClick = {
                            haptics.light()
                            onSelect(tab)
                        },
                    )
                }
            }
            HorizontalDivider(color = MeeshyTheme.tokens.textMuted.copy(alpha = MeeshyOpacity.medium))
        }
    }
}

@Composable
private fun RowScope.ProfileTabButton(tab: ProfileTab, isSelected: Boolean, accent: Color, onClick: () -> Unit) {
    val reduceMotion = LocalReduceMotion.current
    val spec: AnimationSpec<Color> =
        if (reduceMotion) snap() else spring(dampingRatio = 0.8f, stiffness = MeeshyMotion.stiffnessForResponse(0.3f))
    val content by animateColorAsState(if (isSelected) accent else MeeshyTheme.tokens.textMuted, spec, label = "profile-tab-content")
    val underline by animateColorAsState(if (isSelected) accent else Color.Transparent, spec, label = "profile-tab-underline")
    Column(
        modifier = Modifier
            .weight(1f)
            .heightIn(min = MeeshyMinTapTarget)
            .selectable(selected = isSelected, role = Role.Tab, onClick = onClick),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Bottom,
    ) {
        Row(
            modifier = Modifier.padding(vertical = MeeshySpacing.smPlus),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(imageVector = tab.icon(), contentDescription = null, tint = content, modifier = Modifier.size(14.dp))
            Spacer(Modifier.width(MeeshySpacing.xs))
            Text(
                text = stringResource(tab.titleRes()),
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.SemiBold,
                color = content,
            )
        }
        Box(Modifier.fillMaxWidth().height(2.dp).background(underline))
    }
}

private fun ProfileTab.icon(): ImageVector = when (this) {
    ProfileTab.POSTS -> MeeshyIcons.Article
    ProfileTab.CONVERSATIONS -> MeeshyIcons.ForumFilled
    ProfileTab.DETAILS -> MeeshyIcons.PersonFilled
}

internal fun ProfileTab.titleRes(): Int = when (this) {
    ProfileTab.POSTS -> R.string.profile_tab_posts
    ProfileTab.CONVERSATIONS -> R.string.profile_tab_conversations
    ProfileTab.DETAILS -> R.string.profile_tab_details
}
