package me.meeshy.app.conversations

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.conversations.R
import me.meeshy.sdk.conversation.ReaderLabelProvider
import javax.inject.Inject
import javax.inject.Singleton

/** Le mot « Vous » de l'apercu de ligne, lu du catalogue de chaines de la liste. */
@Singleton
class ResourceReaderLabelProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : ReaderLabelProvider {
    override fun youLabel(): String = context.getString(R.string.conversations_preview_you)
}

@Module
@InstallIn(SingletonComponent::class)
abstract class ConversationListLiveModule {
    @Binds
    abstract fun bindReaderLabelProvider(impl: ResourceReaderLabelProvider): ReaderLabelProvider
}
