package me.meeshy.app.profile

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.profile.ProfileSheetUser
import me.meeshy.sdk.model.profile.ProfileTab
import me.meeshy.ui.accessibility.MeeshyMinTapTarget
import me.meeshy.ui.component.MeeshySkeletonBox
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/**
 * Les onglets que la feuille sait remplir aujourd'hui. L'onglet Conversations (conversations
 * communes) attend son chargeur ; il rejoindra cette liste avec lui.
 */
internal val PROFILE_SHEET_TABS: List<ProfileTab> = listOf(ProfileTab.POSTS, ProfileTab.DETAILS)

/**
 * La fiche peinte (cache ou réseau) : bannière, avatar, identité, actions (jamais pour soi), puis
 * les onglets — Détails par défaut. Les statistiques en cours se signalent en squelette local, jamais
 * par un spinner plein écran.
 */
@Composable
internal fun ProfileSheetLoadedContent(
    state: UserProfileSheetUiState,
    actionsState: ProfileActionsState,
    environment: ProfileSheetEnvironment,
    accent: Color,
    actions: ProfileActionCallbacks,
) {
    val profile = state.profile ?: return
    val header = remember(profile) { ProfileHeaderBuilder.build(profile, System.currentTimeMillis()) }
    val stats = remember(state.stats) { state.stats?.let { UserStatsBuilder.build(it) } }
    var selected by rememberSaveable(profile.id) { mutableStateOf(ProfileTab.DEFAULT) }
    ProfileBanner(user = profile)
    ProfileAvatar(user = profile, header = header)
    Column(
        modifier = Modifier.fillMaxWidth().padding(horizontal = MeeshySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(MeeshySpacing.lg),
    ) {
        ProfileIdentityLines(header)
        val plan = actionsState.plan
        if (!state.isSelf && plan != null && actionsState.userId == profile.id) {
            ProfileActionsSection(
                plan = plan,
                displayName = header.displayName,
                isOpeningConversation = actionsState.isOpeningConversation,
                callbacks = actions,
            )
        }
        ProfileSheetTabBar(selected = selected, accent = accent, onSelect = { selected = it })
        when (selected) {
            ProfileTab.POSTS -> environment.postsContent?.invoke(profile.id)
                ?: ProfilePostsRow(onClick = { environment.onViewPosts(profile.id) })
            ProfileTab.CONVERSATIONS, ProfileTab.DETAILS -> {
                ProfileDetailsSection(header)
                when {
                    stats != null -> ProfileStatsSection(stats)
                    state.isLoadingStats -> MeeshySkeletonBox(Modifier.fillMaxWidth().height(60.dp))
                }
            }
        }
    }
}

/** La barre d'onglets de la fiche : texte souligné de l'accent du PROFIL, cible de 48 dp. */
@Composable
private fun ProfileSheetTabBar(selected: ProfileTab, accent: Color, onSelect: (ProfileTab) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth().selectableGroup()) {
        PROFILE_SHEET_TABS.forEach { tab ->
            val isSelected = tab == selected
            Column(
                modifier = Modifier
                    .weight(1f)
                    .heightIn(min = MeeshyMinTapTarget)
                    .selectable(selected = isSelected, role = Role.Tab, onClick = { onSelect(tab) }),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center,
            ) {
                Text(
                    text = stringResource(tab.titleRes()),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = if (isSelected) accent else MeeshyTheme.tokens.textSecondary,
                    modifier = Modifier.padding(vertical = MeeshySpacing.sm),
                )
                Box(
                    Modifier
                        .fillMaxWidth()
                        .height(2.dp)
                        .background(if (isSelected) accent else Color.Transparent),
                )
            }
        }
    }
}

private fun ProfileTab.titleRes(): Int = when (this) {
    ProfileTab.POSTS -> R.string.profile_tab_posts
    ProfileTab.CONVERSATIONS -> R.string.profile_tab_conversations
    ProfileTab.DETAILS -> R.string.profile_tab_details
}

/** Ce que la surface d'origine savait de la personne, quand aucun profil n'a pu être peint. */
@Composable
internal fun ProfileSheetIdentity(user: ProfileSheetUser) {
    Text(
        text = user.resolvedDisplayName,
        style = MaterialTheme.typography.headlineSmall,
        fontWeight = FontWeight.Bold,
    )
    user.username.takeIf { it.isNotBlank() && it != user.resolvedDisplayName }?.let { username ->
        Text(
            text = "@$username",
            style = MaterialTheme.typography.bodyMedium,
            color = MeeshyTheme.tokens.textSecondary,
        )
    }
}
