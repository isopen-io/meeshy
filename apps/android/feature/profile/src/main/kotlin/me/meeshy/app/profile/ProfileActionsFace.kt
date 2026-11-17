package me.meeshy.app.profile

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.hilt.navigation.compose.hiltViewModel
import me.meeshy.app.contacts.circles.ReceptionBlockSection
import me.meeshy.feature.profile.R
import me.meeshy.sdk.model.MeeshyUser
import me.meeshy.sdk.model.profile.ProfileActionAccess
import me.meeshy.sdk.model.profile.ProfileActionPlan
import me.meeshy.sdk.model.profile.ProfileFace
import me.meeshy.sdk.model.profile.ProfileRelationAction
import me.meeshy.sdk.model.relation.ProfileCircle
import me.meeshy.sdk.model.relation.RelationLevel
import me.meeshy.ui.component.battery.BatteryPersonSection
import me.meeshy.ui.component.battery.BatteryPersonSurface
import me.meeshy.ui.component.circles.levelTitle
import me.meeshy.ui.component.circles.tint
import me.meeshy.ui.component.kit.MeeshyActionGrid
import me.meeshy.ui.component.kit.MeeshyButton
import me.meeshy.ui.component.kit.MeeshyButtonKind
import me.meeshy.ui.component.kit.MeeshyButtonSize
import me.meeshy.ui.component.kit.MeeshyButtonWidth
import me.meeshy.ui.component.kit.MeeshyLabeledAction
import me.meeshy.ui.component.kit.MeeshyLabeledActionSize
import me.meeshy.ui.component.kit.MeeshyLockedRow
import me.meeshy.ui.component.phonereachability.PhoneReachabilityPersonSection
import me.meeshy.ui.component.phonereachability.PhoneReachabilityPersonSurface
import me.meeshy.ui.icons.MeeshyIcons
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshySpacing
import me.meeshy.ui.theme.MeeshyTheme

/** La personne et le cercle commun que la face Actions range ; tout le reste vient du plan et de la loi d'accès. */
internal data class ProfileActionsFaceInput(
    val plan: ProfileActionPlan,
    val userId: String,
    val displayName: String,
    val circle: ProfileCircle?,
    /** Le niveau d'outils servi pour la paire (`accessLevel`) ; `null` tant qu'il n'est pas servi. */
    val toolLevel: RelationLevel?,
    val receptions: ProfileReceptionBlocks?,
    val isOpeningConversation: Boolean,
)

/**
 * La face Actions (loi 1) : TOUTES les opérations de la fiche rangées en actions libellées, chacune offerte ou, quand le
 * cercle commun ne l'ouvre pas, verrouillée sous « Pas encore ouvert » avec le cercle qui l'ouvre (loi 4). Rien de ce que
 * la fiche savait faire ne disparaît : écrire, appeler, la connexion, le Talkie, le Bring, la position, la batterie,
 * l'injoignable, la fiche partagée, le blocage et le signalement.
 *
 * Le niveau lu est celui de [ProfileActionAccess.levelFor] : le niveau d'outils servi, sinon le lien, sinon Public ou INCONNU.
 */
@Composable
internal fun ProfileActionsFace(
    input: ProfileActionsFaceInput,
    callbacks: ProfileActionCallbacks,
    onOpenCircle: () -> Unit,
    onShareProfile: (() -> Unit)?,
) {
    val plan = input.plan
    val level = ProfileActionAccess.levelFor(
        linkLevel = input.circle?.level,
        toolLevel = input.toolLevel,
        awaitingLink = plan.showsConnectedBanner,
    )
    val access = remember(level) { level?.let { ProfileActionAccess.plan(it).toMap() }.orEmpty() }
    val locked = remember(access) { access.lockedRows() }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(MeeshySpacing.xxl)) {
        FaceHeader(title = stringResource(R.string.fiche_face_actions), level = input.circle?.level, onOpenCircle = onOpenCircle)
        ConnectionSection(input, callbacks)
        TalkSection(input, access, callbacks)
        TogetherSection(input, access)
        ProfileWhereSection(
            userId = input.userId,
            displayName = input.displayName,
            offered = access.offers(ProfileRelationAction.LOCATION),
        )
        ProfileWhereMapAction(userId = input.userId, displayName = input.displayName, callbacks = callbacks)
        PhoneSections(input)
        CardSection(input, onOpenCircle, onShareProfile)
        NotOpenSection(locked)
        DangerSection(plan, callbacks)
    }
}

private fun Map<ProfileRelationAction, ProfileActionAccess>.offers(action: ProfileRelationAction): Boolean =
    this[action] is ProfileActionAccess.Offered

private fun Map<ProfileRelationAction, ProfileActionAccess>.lockedRows(): List<Pair<ProfileRelationAction, RelationLevel>> =
    ProfileRelationAction.entries.mapNotNull { action ->
        (this[action] as? ProfileActionAccess.Locked)?.let { action to it.opensAt }
    }

/** Le titre de la face et, quand un cercle existe, la pilule de relation qui ouvre « Notre cercle ». */
@Composable
internal fun FaceHeader(title: String, level: RelationLevel?, onOpenCircle: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(MeeshySpacing.md),
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineSmall,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        level?.let { ProfileRelationPill(level = it, onClick = onOpenCircle) }
    }
}

@Composable
private fun ConnectionSection(input: ProfileActionsFaceInput, callbacks: ProfileActionCallbacks) {
    val plan = input.plan
    val showsConnected = input.circle == null && plan.showsConnectedBanner
    val hasConnection = plan.contextBanner != null || plan.connectionActions.isNotEmpty() || showsConnected
    if (!hasConnection && input.receptions == null) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        plan.contextBanner?.let { ConnectionContextRow(banner = it, name = input.displayName) }
        plan.connectionActions.forEach { ConnectionActionButton(action = it, callbacks = callbacks) }
        if (showsConnected) ConnectedPill()
        input.receptions?.let { ReceptionBlockSection(userId = it.userId, settings = it.settings) }
    }
}

@Composable
private fun TalkSection(
    input: ProfileActionsFaceInput,
    access: Map<ProfileRelationAction, ProfileActionAccess>,
    callbacks: ProfileActionCallbacks,
) {
    val plan = input.plan
    val write = access[ProfileRelationAction.WRITE] as? ProfileActionAccess.Offered
    val writeTitle = stringResource(
        if (write?.writeAsRequest == true) R.string.fiche_action_write_request else R.string.fiche_action_write,
    )
    val callTitle = stringResource(R.string.fiche_action_call)
    val videoTitle = stringResource(R.string.fiche_action_video)
    val onCall = callbacks.onCall
    val offersCall = plan.offersCall && onCall != null && access.offers(ProfileRelationAction.CALL)
    val tiles = buildList<@Composable (MeeshyLabeledActionSize) -> Unit> {
        if (plan.canMessage) {
            add { size ->
                MeeshyLabeledAction(
                    title = writeTitle,
                    icon = MeeshyIcons.Chat,
                    onClick = callbacks.onSendMessage,
                    size = size,
                    isPending = input.isOpeningConversation,
                    enabled = !input.isOpeningConversation,
                )
            }
        }
        if (offersCall && onCall != null) {
            val idle = !input.isOpeningConversation
            add { size -> MeeshyLabeledAction(title = callTitle, icon = MeeshyIcons.Call, onClick = { onCall(false) }, size = size, enabled = idle) }
            add { size -> MeeshyLabeledAction(title = videoTitle, icon = MeeshyIcons.Video, onClick = { onCall(true) }, size = size, enabled = idle) }
        }
    }
    val talkie = access.offers(ProfileRelationAction.TALKIE)
    if (tiles.isEmpty() && !talkie) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionHeading(stringResource(R.string.fiche_section_talk))
        if (tiles.isNotEmpty()) MeeshyActionGrid(actions = tiles)
        if (talkie) ProfileTalkieRow(userId = input.userId, displayName = input.displayName)
    }
}

@Composable
private fun TogetherSection(input: ProfileActionsFaceInput, access: Map<ProfileRelationAction, ProfileActionAccess>) {
    if (!access.offers(ProfileRelationAction.BRING)) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.md)) {
        SectionHeading(stringResource(R.string.fiche_section_together))
        ProfileBringRow(userId = input.userId, displayName = input.displayName)
    }
}

/**
 * « Où il est » : PROPOSER un partage exige le cercle ([offered], dès Ami) ; ARRÊTER un partage en cours ne l'exige jamais.
 * La section se compose donc à tout niveau — la rangée se tait d'elle-même, titre compris, quand il n'y a rien à proposer
 * ni à arrêter.
 */
@Composable
internal fun ProfileWhereSection(
    userId: String,
    displayName: String,
    offered: Boolean,
    viewModel: ProfileShareLocationViewModel = hiltViewModel(key = "share-location-$userId"),
) {
    ProfileShareLocationRow(
        userId = userId,
        displayName = displayName,
        offered = offered,
        heading = stringResource(R.string.fiche_section_where),
        viewModel = viewModel,
    )
}

/**
 * La batterie et le téléphone injoignable : chaque section se tait d'elle-même hors épisode servi et hors lien qui l'ouvre
 * (le serveur juge), comme sur la fiche d'un lien et les infos d'une conversation. Aucun niveau local ne les retient : un
 * lien en cache en retard sur le serveur ne masque pas un épisode servi. Émises sans enveloppe, pour qu'une section muette
 * ne laisse aucun espace dans la face.
 */
@Composable
private fun PhoneSections(input: ProfileActionsFaceInput) {
    BatteryPersonSection(userId = input.userId, name = input.displayName, surface = BatteryPersonSurface.PROFILE)
    PhoneReachabilityPersonSection(userId = input.userId, name = input.displayName, surface = PhoneReachabilityPersonSurface.PROFILE)
}

@Composable
private fun CardSection(input: ProfileActionsFaceInput, onOpenCircle: () -> Unit, onShareProfile: (() -> Unit)?) {
    val circle = input.circle
    if (onShareProfile == null && circle == null) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionHeading(stringResource(R.string.fiche_section_card))
        onShareProfile?.let { share ->
            MeeshyButton(
                title = stringResource(R.string.fiche_card_share),
                onClick = share,
                icon = MeeshyIcons.Share,
                kind = MeeshyButtonKind.Tinted,
                size = MeeshyButtonSize.S44,
                width = MeeshyButtonWidth.Fill,
            )
        }
        if (circle != null) {
            MeeshyButton(
                title = stringResource(R.string.fiche_card_our_circle),
                onClick = onOpenCircle,
                icon = circle.level.glyph(),
                kind = MeeshyButtonKind.Tinted,
                size = MeeshyButtonSize.S44,
                width = MeeshyButtonWidth.Fill,
                tint = circle.level.tint(),
            )
        }
    }
}

/** Ce que le cercle commun n'ouvre pas : une rangée par capacité, qui nomme le cercle qui l'ouvre et rien d'autre. */
@Composable
private fun NotOpenSection(locked: List<Pair<ProfileRelationAction, RelationLevel>>) {
    if (locked.isEmpty()) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        SectionHeading(stringResource(R.string.fiche_section_not_open))
        locked.forEach { (action, opensAt) ->
            MeeshyLockedRow(
                title = stringResource(action.lockedTitleRes()),
                requirement = stringResource(R.string.vitrine_as_opens_from, levelTitle(opensAt, null)),
                tint = opensAt.tint(),
            )
        }
    }
}

private fun ProfileRelationAction.lockedTitleRes(): Int = when (this) {
    ProfileRelationAction.TALKIE -> R.string.vitrine_cap_talkie
    ProfileRelationAction.BRING -> R.string.vitrine_cap_bring
    ProfileRelationAction.LOCATION -> R.string.vitrine_cap_location_temporary
    ProfileRelationAction.BATTERY -> R.string.vitrine_cap_battery
    ProfileRelationAction.UNREACHABLE -> R.string.vitrine_cap_unreachable
    ProfileRelationAction.WRITE -> R.string.vitrine_cap_direct_message
    ProfileRelationAction.CALL -> R.string.vitrine_cap_ring
    ProfileRelationAction.VIDEO -> R.string.vitrine_cap_ring
}

@Composable
private fun DangerSection(plan: ProfileActionPlan, callbacks: ProfileActionCallbacks) {
    if (!plan.canBlock && !plan.canReport) return
    Column(verticalArrangement = Arrangement.spacedBy(MeeshySpacing.sm)) {
        if (plan.canBlock) {
            ProfileActionButton(
                icon = MeeshyIcons.Block,
                label = stringResource(R.string.profile_action_block_user),
                color = MeeshyPalette.Error,
                onClick = callbacks.onBlock,
            )
        }
        if (plan.canReport) {
            ProfileActionButton(
                icon = MeeshyIcons.Report,
                label = stringResource(R.string.profile_action_report),
                color = MeeshyPalette.Warning,
                onClick = callbacks.onReport,
            )
        }
    }
}

@Composable
internal fun SectionHeading(text: String, color: Color = MeeshyTheme.tokens.textSecondary) {
    Text(
        text = text,
        style = MaterialTheme.typography.titleSmall,
        fontWeight = FontWeight.SemiBold,
        color = color,
        modifier = Modifier.semantics { heading() },
    )
}

/** Ce que la face [face] (hors Vitrine) peint pour la personne de la fiche ; la Vitrine garde ses onglets, ailleurs. */
@Composable
internal fun ProfileOtherFace(
    face: ProfileFace,
    plan: ProfileActionPlan?,
    profile: MeeshyUser,
    displayName: String,
    circle: ProfileCircle?,
    toolLevel: RelationLevel?,
    receptions: ProfileReceptionBlocks?,
    isOpeningConversation: Boolean,
    actions: ProfileActionCallbacks,
    share: ProfileSharePresentation?,
    onOpenCircle: () -> Unit,
    onOpenShare: () -> Unit,
) {
    when (face) {
        ProfileFace.LIENS -> ProfileLinksFace(
            share = share,
            level = circle?.level,
            onOpenCircle = onOpenCircle,
            onOpenShare = onOpenShare,
        )
        ProfileFace.ACTIONS -> if (plan != null) {
            ProfileActionsFace(
                input = ProfileActionsFaceInput(plan, profile.id, displayName, circle, toolLevel, receptions, isOpeningConversation),
                callbacks = actions,
                onOpenCircle = onOpenCircle,
                onShareProfile = onOpenShare.takeIf { share != null },
            )
        }
        ProfileFace.VITRINE -> Unit
    }
}
