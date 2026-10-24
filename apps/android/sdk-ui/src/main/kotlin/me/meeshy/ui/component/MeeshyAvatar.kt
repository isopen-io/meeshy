package me.meeshy.ui.component

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.TextUnit
import coil.decode.DataSource
import coil.request.ImageRequest
import coil.compose.AsyncImage
import coil.compose.AsyncImagePainter
import me.meeshy.sdk.model.PresenceState
import me.meeshy.sdk.model.avatar.AvatarAccessibilityLabel
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.avatar.AvatarContext
import me.meeshy.sdk.model.avatar.AvatarCornerBadge
import me.meeshy.sdk.model.avatar.AvatarDotTone
import me.meeshy.sdk.model.avatar.AvatarPresenceDot
import me.meeshy.sdk.model.avatar.AvatarPresenceTransition
import me.meeshy.sdk.model.avatar.ConversationHere
import me.meeshy.sdk.model.avatar.PresenceHereWave
import me.meeshy.ui.R
import me.meeshy.ui.accessibility.LocalReduceMotion
import me.meeshy.ui.appearance.AvatarRingLayer
import me.meeshy.ui.motion.pulse
import me.meeshy.ui.theme.MeeshyMotion
import me.meeshy.ui.theme.MeeshyPalette
import me.meeshy.ui.theme.MeeshyTheme
import me.meeshy.ui.theme.NunitoFontFamily

/** Story-ring affordance (parity plan §4.3 — port of iOS `StoryRingState`). */
public enum class StoryRingState { None, Unread, Read }

/**
 * CENTRAL presence-dot colour mapping for [presence], or `null` when no dot
 * should render. Pure so it stays unit-testable off Compose. Mirrors iOS
 * (MeeshyAvatar renders green online, orange away, grey idle, and NOTHING for
 * offline) and the web `PRESENCE_DOT_CLASS` consumers (which skip offline
 * dots) — règle 1/3/5 : green = online, orange = away (1-3min), grey =
 * idle (3-5min, AFFICHÉ), offline/no-data = no dot.
 * Every surface (contacts, profile, new-conversation) MUST consume this —
 * never redeclare the palette locally.
 */
public fun meeshyPresenceDotColor(presence: PresenceState?): Color? = when (presence) {
    PresenceState.ONLINE -> MeeshyPalette.Success // vert : connecté (<= 5min) / actif <= 60s
    PresenceState.AWAY -> MeeshyPalette.Warning   // orange : absent 1-3min
    PresenceState.IDLE -> MeeshyPalette.Neutral400 // gris AFFICHÉ : inactif 3-5min
    PresenceState.OFFLINE, null -> null           // hors ligne (> 5min) / aucune donnée : aucun dot
}

/**
 * Circular avatar (parity plan §4.3, port of iOS `MeeshyAvatar`). Gradient fill
 * (accent → [secondaryColor] or accent@60%) with rounded bold initials, plus the
 * optional signature affordances: a story ring, a presence dot, and a mood emoji
 * badge. Animations (ring rotation, mood pulse) are Phase 3 — this atom is static.
 *
 * SDK-pure: every behaviour is an explicit opaque parameter. The product decision
 * of *which* size/ring/presence a given surface uses (iOS `AvatarContext`) stays
 * app-side.
 *
 * [imageUrl] is the person's photo reference (iOS `avatarURL:`), resolved HERE ([AvatarFace]) so no
 * caller composes an address. ONE face at a time: the initials stand IN PLACE of the photo while it
 * loads or if it fails, and are removed once it shows — never layered under it (#12569).
 */
@Composable
public fun MeeshyAvatar(
    name: String,
    modifier: Modifier = Modifier,
    size: Dp = 48.dp,
    containerColor: Color = MeeshyPalette.Indigo500,
    secondaryColor: Color? = null,
    contentColor: Color = MeeshyPalette.White,
    storyRing: StoryRingState = StoryRingState.None,
    presence: PresenceState? = null,
    moodEmoji: String? = null,
    imageUrl: String? = null,
) {
    val density = LocalDensity.current
    val textSize = with(density) { (size * 0.38f).toSp() }
    val fallbackDescription = stringResource(R.string.avatar_fallback)

    val ringExtra = 6.dp
    val ringWidth = if (size <= 32.dp) 1.5.dp else 2.5.dp
    val hasRing = storyRing != StoryRingState.None
    val boxSize = if (hasRing) size + ringExtra else size
    val gradientEnd = secondaryColor ?: containerColor.copy(alpha = 0.6f)
    val dotColor = meeshyPresenceDotColor(presence)
    val dotBorderColor = MeeshyTheme.tokens.backgroundPrimary
    val apiBaseUrl = LocalMediaBaseUrl.current
    val face = remember(name, imageUrl, apiBaseUrl) { AvatarFace.resolve(name, imageUrl, apiBaseUrl) }

    Box(modifier = modifier.size(boxSize), contentAlignment = Alignment.Center) {
        when (storyRing) {
            StoryRingState.Unread -> Box(
                Modifier.size(size + ringExtra)
                    .border(ringWidth * 2, MeeshyPalette.Indigo500, CircleShape),
            )
            StoryRingState.Read -> Box(
                Modifier.size(size + ringExtra)
                    .border(ringWidth, containerColor.copy(alpha = 0.3f), CircleShape),
            )
            StoryRingState.None -> Unit
        }

        AvatarDisc(
            face = face,
            size = size,
            brush = Brush.linearGradient(listOf(containerColor, gradientEnd)),
            contentColor = contentColor,
            fontSize = textSize,
            modifier = Modifier.semantics { contentDescription = name.ifBlank { fallbackDescription } },
        )

        if (!moodEmoji.isNullOrEmpty()) {
            Text(
                text = moodEmoji,
                fontSize = with(density) { (size * 0.4f).toSp() },
                modifier = Modifier.align(Alignment.BottomEnd),
            )
        } else if (dotColor != null) {
            Box(
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .size(size * 0.26f + 4.dp)
                    .clip(CircleShape)
                    .background(dotBorderColor)
                    .padding(2.dp)
                    .clip(CircleShape)
                    .background(dotColor),
            )
        }
    }
}

/** Couleur d'une teinte de point ou de contour : « ici » en primaire, le reste par le mapping central. */
public fun meeshyDotToneColor(tone: AvatarDotTone): Color = when (tone) {
    AvatarDotTone.HERE -> MeeshyPalette.Indigo500
    AvatarDotTone.ONLINE -> MeeshyPalette.Success
    AvatarDotTone.AWAY -> MeeshyPalette.Warning
    AvatarDotTone.IDLE -> MeeshyPalette.Neutral400
}

/**
 * Avatar a LOI DE CONTEXTE (iOS `MeeshyAvatar(context:)`) : la taille, l'anneau, l'humeur, la pulsation et
 * l'ombre viennent de [AvatarContext], jamais de l'appelant. Le coin bas-droit est resolu par
 * [AvatarCornerBadge] : l'humeur MASQUE le point ; hors ligne ou presence absente = aucun point ; « ici »
 * ([here]) prime et se rend sans presence servie. Un VRAI changement de point le remplace (le sortant
 * diminue, l'entrant rebondit) ; rien ne pulse en liste ni sous Reduire les animations. TalkBack lit le nom,
 * l'humeur puis « dans la conversation ».
 *
 * [isUser] = faux pour une entite (communaute, groupe) : ni humeur ni anneau de story.
 * [ring] = le contour choisi par son porteur (miroir d'`avatarRingWithin`) : il se pose DANS l'empreinte, l'anneau de
 * story reste concentrique dedans, la pastille de presence se pose par-dessus. `null` = rendu historique.
 */
@Composable
public fun MeeshyAvatar(
    name: String,
    context: AvatarContext,
    modifier: Modifier = Modifier,
    containerColor: Color = MeeshyPalette.Indigo500,
    secondaryColor: Color? = null,
    contentColor: Color = MeeshyPalette.White,
    storyRing: StoryRingState = StoryRingState.None,
    presence: PresenceState? = null,
    moodEmoji: String? = null,
    here: ConversationHere = ConversationHere.ABSENT,
    isUser: Boolean = true,
    enablePulse: Boolean = context.defaultPulse,
    onMoodTap: (() -> Unit)? = null,
    ring: AvatarRingDesign? = null,
    imageUrl: String? = null,
) {
    val reduceMotion = LocalReduceMotion.current
    val apiBaseUrl = LocalMediaBaseUrl.current
    val face = remember(name, imageUrl, apiBaseUrl) { AvatarFace.resolve(name, imageUrl, apiBaseUrl) }
    val density = LocalDensity.current
    val size = context.size.dp
    val effectiveRing = if (isUser && context.showsStoryRing) storyRing else StoryRingState.None
    val hasRing = effectiveRing != StoryRingState.None
    val frame = if (hasRing) context.ringSize.dp else size
    val gradientEnd = secondaryColor ?: containerColor.copy(alpha = 0.6f)
    val dot = AvatarPresenceDot.resolve(presence, isHere = here.isHere)
    val corner = AvatarCornerBadge.resolve(
        context = context, isUser = isUser, moodEmoji = moodEmoji, dot = dot, here = here,
        enablePulse = enablePulse, hasStoryRing = hasRing, reduceMotion = reduceMotion,
    )
    val resources = LocalContext.current.resources
    val hereLabel = stringResource(R.string.presence_here)
    val fallback = stringResource(R.string.avatar_fallback)
    val spokenName = AvatarAccessibilityLabel.spokenName(
        name = name,
        moodEmoji = (corner as? AvatarCornerBadge.Mood)?.emoji,
        isHere = dot == AvatarPresenceDot.Here,
        moodLabel = { resources.getString(R.string.avatar_a11y_mood, it) },
        hereLabel = hereLabel,
        fallbackName = fallback,
    )
    var transition by remember { mutableStateOf(AvatarPresenceTransition.initial(dot)) }
    LaunchedEffect(dot?.transitionKey) { transition = transition.observe(dot) }

    Box(modifier = modifier.size(frame), contentAlignment = Alignment.Center) {
        AvatarRingLayer(ring, footprint = size, storyRingSize = if (hasRing) frame else null) {
            when (effectiveRing) {
                StoryRingState.Unread -> Box(Modifier.size(frame).border(context.ringWidth.dp * 2, MeeshyPalette.Indigo500, CircleShape))
                StoryRingState.Read -> Box(Modifier.size(frame).border(context.ringWidth.dp, containerColor.copy(alpha = 0.3f), CircleShape))
                StoryRingState.None -> Unit
            }
            AvatarDisc(
                face = face,
                size = size,
                brush = Brush.linearGradient(listOf(containerColor, gradientEnd)),
                contentColor = contentColor,
                fontSize = with(density) { context.initialFont.dp.toSp() },
                modifier = Modifier.semantics { contentDescription = spokenName },
            )
        }
        AvatarCorner(
            corner = corner,
            context = context,
            frame = frame,
            transition = transition,
            here = here,
            reduceMotion = reduceMotion,
            onMoodTap = onMoodTap,
            modifier = Modifier.align(Alignment.BottomEnd),
        )
    }
}

/**
 * Le cercle d'avatar, UN seul visage ([AvatarFace.layer]) : les initiales tiennent la place de la photo
 * tant qu'elle charge ou si elle échoue (ni spinner, ni « Réessayer »), et sont RETIRÉES dès qu'elle
 * s'affiche. La photo remplit le cercle en `Crop` : une image non carrée ne laisse ni bande de dégradé
 * ni initiales autour d'elle.
 */
@Composable
private fun AvatarDisc(
    face: AvatarFace,
    size: Dp,
    brush: Brush,
    contentColor: Color,
    fontSize: TextUnit,
    modifier: Modifier = Modifier,
) {
    var photoState by remember(face) { mutableStateOf(AvatarPhotoState.Loading) }
    var warm by remember(face) { mutableStateOf(false) }
    val layer = face.layer(photoState)
    Box(
        modifier = modifier
            .size(size)
            .clip(CircleShape)
            .background(brush),
        contentAlignment = Alignment.Center,
    ) {
        if (layer is AvatarLayer.Initials) {
            Text(
                text = layer.text,
                color = contentColor,
                fontFamily = NunitoFontFamily,
                fontWeight = FontWeight.Bold,
                fontSize = fontSize,
            )
        }
        if (face is AvatarFace.Photo) {
            val photoAlpha by animateFloatAsState(
                targetValue = if (photoState == AvatarPhotoState.Success) 1f else 0f,
                animationSpec = if (warm) snap() else tween(PHOTO_FADE_MILLIS),
                label = "avatarPhotoFade",
            )
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current).data(face.model).build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                onState = { state ->
                    warm = (state as? AsyncImagePainter.State.Success)?.result?.dataSource == DataSource.MEMORY_CACHE
                    photoState = state.toPhotoState()
                },
                modifier = Modifier.size(size).alpha(photoAlpha),
            )
        }
    }
}

/** Le fondu de la photo qui remplace les initiales (iOS : 0,15 s) ; une photo déjà en mémoire s'affiche d'emblée. */
private const val PHOTO_FADE_MILLIS = 150

private fun AsyncImagePainter.State.toPhotoState(): AvatarPhotoState = when (this) {
    is AsyncImagePainter.State.Success -> AvatarPhotoState.Success
    is AsyncImagePainter.State.Error -> AvatarPhotoState.Error
    else -> AvatarPhotoState.Loading
}

@Composable
private fun AvatarCorner(
    corner: AvatarCornerBadge,
    context: AvatarContext,
    frame: Dp,
    transition: AvatarPresenceTransition,
    here: ConversationHere,
    reduceMotion: Boolean,
    onMoodTap: (() -> Unit)?,
    modifier: Modifier,
) {
    AnimatedContent(
        targetState = corner,
        modifier = modifier,
        transitionSpec = { presenceReplacement(reduceMotion) },
        contentKey = {
            when (it) {
                AvatarCornerBadge.None -> "none"
                is AvatarCornerBadge.Mood -> "mood.${it.outline}"
                is AvatarCornerBadge.Dot -> it.dot.transitionKey
            }
        },
        label = "avatarCorner",
    ) { shown ->
        when (shown) {
            AvatarCornerBadge.None -> Unit
            is AvatarCornerBadge.Mood -> {
                val badge = context.badgeSize.dp
                Box(contentAlignment = Alignment.Center) {
                    if (shown.outline == AvatarDotTone.HERE && transition.showsArrivalRipple(AvatarPresenceDot.Here, reduceMotion)) {
                        PresenceArrivalRipple(meeshyDotToneColor(AvatarDotTone.HERE), badge)
                    }
                    MeeshyMoodBadge(
                        emoji = shown.emoji,
                        diameter = badge,
                        animates = shown.animates,
                        outline = shown.outline?.let(::meeshyDotToneColor),
                        hushed = shown.hushed,
                        onTap = onMoodTap,
                        modifier = if (shown.animates) Modifier.pulse(shown.pulseIntensity) else Modifier,
                    )
                }
            }
            is AvatarCornerBadge.Dot -> AvatarPresenceDotGlyph(
                dot = shown.dot,
                avatarSize = context.size,
                frameSize = frame.value,
                pulses = shown.pulses,
                wave = PresenceHereWave.forHere(here),
                arrives = transition.showsArrivalRipple(shown.dot, reduceMotion),
                reduceMotion = reduceMotion,
            )
        }
    }
}

/** Remplacement d'un coin : le sortant DIMINUE, l'entrant REBONDIT un temps apres ; fondu seul sous reduction. */
private fun presenceReplacement(reduceMotion: Boolean): ContentTransform {
    if (reduceMotion) return fadeIn(tween(120)) togetherWith fadeOut(tween(120))
    val enter = scaleIn(
        initialScale = AvatarPresenceTransition.INSERT_FROM_SCALE,
        animationSpec = spring(
            dampingRatio = AvatarPresenceTransition.INSERT_SPRING_DAMPING,
            stiffness = MeeshyMotion.stiffnessForResponse(AvatarPresenceTransition.INSERT_SPRING_RESPONSE),
        ),
    ) + fadeIn(tween(AvatarPresenceTransition.INSERT_DELAY_MILLIS, delayMillis = AvatarPresenceTransition.INSERT_DELAY_MILLIS))
    val exit = scaleOut(
        targetScale = AvatarPresenceTransition.REMOVE_TO_SCALE,
        animationSpec = tween(AvatarPresenceTransition.REMOVE_DURATION_MILLIS),
    ) + fadeOut(tween(AvatarPresenceTransition.REMOVE_DURATION_MILLIS))
    return enter togetherWith exit
}
