package me.meeshy.app.contacts

import android.content.Context
import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import me.meeshy.feature.contacts.R
import javax.inject.Inject

/** Les libellés des toasts de Découvrir, derrière une couture pour que le ViewModel reste testable sans Android. */
interface DiscoverStrings {
    fun inviteSent(email: String): String
    fun inviteFailed(): String
    fun smsUnavailable(): String
}

internal class AndroidDiscoverStrings @Inject constructor(
    @ApplicationContext private val context: Context,
) : DiscoverStrings {
    override fun inviteSent(email: String): String = context.getString(R.string.contacts_discover_invite_sent, email)
    override fun inviteFailed(): String = context.getString(R.string.contacts_discover_email_error)
    override fun smsUnavailable(): String = context.getString(R.string.contacts_discover_sms_unavailable)
}

@Module
@InstallIn(SingletonComponent::class)
internal abstract class DiscoverStringsModule {
    @Binds
    abstract fun bind(impl: AndroidDiscoverStrings): DiscoverStrings
}
