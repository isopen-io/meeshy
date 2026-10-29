package me.meeshy.app.profile

import androidx.compose.runtime.Immutable
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import me.meeshy.sdk.appearance.AppearanceCatalogLoader
import me.meeshy.sdk.model.ProfileDecorRef
import me.meeshy.sdk.model.ProfileDecorSide
import me.meeshy.sdk.model.PackOrigin
import me.meeshy.sdk.model.ServedProfileDecor
import me.meeshy.sdk.model.ServedProfileDecorItem
import me.meeshy.sdk.model.appearance.AppearanceCatalog
import me.meeshy.sdk.model.appearance.AppearanceDesign
import me.meeshy.sdk.model.appearance.AppearancePackDomain
import me.meeshy.sdk.model.appearance.AvatarRingDesign
import me.meeshy.sdk.model.appearance.BannerFrameDesign
import me.meeshy.sdk.model.appearance.InstalledPackSummary
import me.meeshy.sdk.model.appearance.ProfileBannerChoice
import me.meeshy.sdk.model.appearance.ProfileBannerPaint
import me.meeshy.sdk.model.appearance.ProfileDecorOptions
import me.meeshy.sdk.model.appearance.ProfileDecorResolver
import me.meeshy.sdk.model.appearance.WallpaperPackOptions
import me.meeshy.sdk.model.packs.PackInstallationUpdatedEvent
import me.meeshy.sdk.model.packs.applying
import me.meeshy.sdk.net.NetworkResult
import me.meeshy.sdk.net.api.PackApi
import me.meeshy.sdk.net.api.installed
import me.meeshy.sdk.net.apiCall
import me.meeshy.sdk.packs.PackShopRepository
import me.meeshy.sdk.profile.ProfileDecorOutcome
import me.meeshy.sdk.profile.ProfileDecorRepository
import me.meeshy.sdk.session.SessionRepository
import me.meeshy.sdk.theme.DynamicColorGenerator

/** Les trois listes que la feuille propose, avant et après la lecture des packs installés. */
@Immutable
data class ProfileDecorUiState(
    val catalog: AppearanceCatalog? = null,
    val decor: ServedProfileDecor = ServedProfileDecor.EMPTY,
    val photo: String? = null,
    val rings: List<ProfileDecorOptions.Group<AvatarRingDesign>> = emptyList(),
    val banners: List<ProfileDecorOptions.Group<AppearanceDesign>> = emptyList(),
    val frames: List<ProfileDecorOptions.Group<BannerFrameDesign>> = emptyList(),
    val failed: Boolean = false,
    /** Mon identité, pour peindre l'avatar et les bannières comme la fiche. */
    val name: String = "?",
    val avatarUrl: String? = null,
    val accentHex: String = DEFAULT_ACCENT_HEX,
) {
    fun current(side: ProfileDecorSide): ProfileDecorRef? = decor[side]?.ref

    val bannerChoice: ProfileBannerChoice get() = ProfileBannerChoice(photo, current(ProfileDecorSide.BANNER))

    /** Ce que la bannière peint avec le choix en cours : les cadres se montrent posés DESSUS. */
    val bannerPaint: ProfileBannerPaint
        get() = catalog?.let { ProfileDecorResolver.bannerPaint(photo, decor.banner, it) } ?: ProfileBannerPaint.Plain
}

/**
 * Le décor de MON profil (miroir de `ProfileDecorModel`, iOS #10632) : le contour d'avatar, la bannière de design et le
 * cadre de bannière. Le sélecteur ne liste que les packs INSTALLÉS et POSSÉDÉS — avant la lecture de la liste, les
 * packs installés d'office. Équiper est optimiste et délégué au [ProfileDecorRepository] (la réponse de la passerelle
 * fait foi, un refus rétablit LE CÔTÉ touché) ; ce modèle ne calcule ni ne détient jamais un décor : il montre ce que la
 * session porte.
 */
@HiltViewModel
class ProfileDecorViewModel @Inject constructor(
    private val repository: ProfileDecorRepository,
    private val session: SessionRepository,
    private val loader: AppearanceCatalogLoader,
    private val packs: PackApi,
    private val shop: PackShopRepository,
) : ViewModel() {

    private val installed = MutableStateFlow<Installed?>(null)
    private val failed = MutableStateFlow(false)

    private class Installed(
        val rings: List<InstalledPackSummary>?,
        val banners: List<InstalledPackSummary>?,
        val frames: List<InstalledPackSummary>?,
    )

    val state: StateFlow<ProfileDecorUiState> = combine(loader.state, session.currentUser, installed, failed) { catalog, user, lists, failure ->
        val decor = user?.servedDecor ?: ServedProfileDecor.EMPTY
        val name = user?.let { it.displayName?.takeIf(String::isNotBlank) ?: it.username } ?: "?"
        val accent = user?.let { DynamicColorGenerator.profileAccentHex(it.id, name) } ?: DEFAULT_ACCENT_HEX
        if (catalog == null) {
            ProfileDecorUiState(decor = decor, photo = user?.banner, failed = failure, name = name, avatarUrl = user?.avatar, accentHex = accent)
        } else {
            ProfileDecorUiState(
                catalog = catalog,
                decor = decor,
                photo = user?.banner,
                name = name,
                avatarUrl = user?.avatar,
                accentHex = accent,
                rings = ProfileDecorOptions.rings(lists?.rings, catalog),
                banners = ProfileDecorOptions.banners(lists?.banners, catalog),
                frames = ProfileDecorOptions.bannerFrames(lists?.frames, catalog),
                failed = failure,
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(STOP_TIMEOUT_MS), ProfileDecorUiState())

    init {
        viewModelScope.launch { runCatching { loader.catalog() } }
        viewModelScope.launch { load() }
        viewModelScope.launch { shop.installations.collect(::follow) }
    }

    /**
     * Un pack s'installe ou se retire sur mon compte (`pack:installation-updated`, achat compris) : la charge suffit à
     * tenir la liste du domaine. Seule une liste jamais lue (panne) coûte UNE relecture de CE domaine.
     */
    private suspend fun follow(event: PackInstallationUpdatedEvent) {
        val domain = event.appearanceDomain?.takeIf { it in DECOR_DOMAINS } ?: return
        val current = installed.value
        val known = current?.let { list(it, domain) }
        val next = known?.applying(event) ?: read(domain) ?: return
        installed.update { latest -> (latest ?: Installed(null, null, null)).with(domain, next) }
    }

    private fun list(lists: Installed, domain: AppearancePackDomain) = when (domain) {
        AppearancePackDomain.AVATAR_RING -> lists.rings
        AppearancePackDomain.BANNER -> lists.banners
        else -> lists.frames
    }

    private fun Installed.with(domain: AppearancePackDomain, packs: List<InstalledPackSummary>) = when (domain) {
        AppearancePackDomain.AVATAR_RING -> Installed(packs, banners, frames)
        AppearancePackDomain.BANNER -> Installed(rings, packs, frames)
        else -> Installed(rings, banners, packs)
    }

    private suspend fun load() {
        val rings = viewModelScope.async { read(AppearancePackDomain.AVATAR_RING) }
        val banners = viewModelScope.async { read(AppearancePackDomain.BANNER) }
        val frames = viewModelScope.async { read(AppearancePackDomain.BANNER_FRAME) }
        installed.value = Installed(rings.await(), banners.await(), frames.await())
    }

    /** Une panne ne conclut rien (`null` : les packs installés d'office) ; un 404 (ancien serveur) ⇒ aucun pack. */
    private suspend fun read(domain: AppearancePackDomain): List<InstalledPackSummary>? =
        when (val result = apiCall { packs.installed(domain) }) {
            is NetworkResult.Success -> result.data.packs
            is NetworkResult.Failure -> WallpaperPackOptions.installedFromFailure(result.error.httpStatus)
        }

    /** Équipe ([ref] `null` = retirer) ; sans effet si le côté porte déjà ce choix. */
    fun equip(ref: ProfileDecorRef?, side: ProfileDecorSide) {
        if (state.value.current(side) == ref) return
        failed.value = false
        val item = ref?.let { ServedProfileDecorItem(it.pack, it.item, PackOrigin.BUILTIN, contract = null) }
        viewModelScope.launch {
            val outcome = repository.equip(item, side)
            if (outcome is ProfileDecorOutcome.Failed) failed.value = true
        }
    }
}

private val DECOR_DOMAINS = setOf(AppearancePackDomain.AVATAR_RING, AppearancePackDomain.BANNER, AppearancePackDomain.BANNER_FRAME)

private const val STOP_TIMEOUT_MS = 5_000L
private const val DEFAULT_ACCENT_HEX = "#6366F1"
