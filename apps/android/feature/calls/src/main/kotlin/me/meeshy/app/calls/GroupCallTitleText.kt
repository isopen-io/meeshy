package me.meeshy.app.calls

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.feature.calls.R
import me.meeshy.sdk.model.call.group.GroupCallTitleWording

/** L'appel se nomme par son groupe une fois le principal parti ; l'en-tête, la pilule et la notification lisent ce nom. */
internal fun CallUiState.withGroupTitle(title: String?): CallUiState =
    if (title == null || title == peerName) this else copy(peerName = title)

/** Les mots du nom d'un appel de groupe, dans la langue d'interface du moment (#13768). */
fun interface GroupCallTitleWordingSource {
    fun current(): GroupCallTitleWording
}

@Singleton
class AndroidGroupCallTitleWording @Inject constructor(
    @ApplicationContext private val context: Context,
) : GroupCallTitleWordingSource {
    override fun current(): GroupCallTitleWording = GroupCallTitleWording(
        unknownMember = context.getString(R.string.call_group_tile_unknown),
        everyone = context.getString(R.string.call_group_stage),
        more = { shown, count -> context.getString(R.string.call_participants_more, shown, count) },
    )
}

@Module
@InstallIn(SingletonComponent::class)
interface GroupCallTitleWordingModule {
    @Binds
    fun bindGroupCallTitleWording(impl: AndroidGroupCallTitleWording): GroupCallTitleWordingSource
}
