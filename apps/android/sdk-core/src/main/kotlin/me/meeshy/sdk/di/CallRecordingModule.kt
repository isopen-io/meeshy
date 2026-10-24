package me.meeshy.sdk.di

import dagger.Binds
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import me.meeshy.sdk.call.CallRecordingCapturer
import me.meeshy.sdk.call.CallRecordingEncryptionGate
import me.meeshy.sdk.call.CallRecordingSignals
import me.meeshy.sdk.call.CallRecordingUploader
import me.meeshy.sdk.call.CallRecordingViewer
import me.meeshy.sdk.call.ConversationCallRecordingEncryptionGate
import me.meeshy.sdk.call.SessionCallRecordingViewer
import me.meeshy.sdk.call.SocketCallRecordingSignals
import me.meeshy.sdk.call.UnavailableCallRecordingCapturer
import me.meeshy.sdk.call.UnavailableCallRecordingUploader

/**
 * Les coutures du contrôleur d'enregistrement d'appel. La capture et le dépôt du fichier sont
 * INERTES tant que leurs moteurs n'existent pas : le bouton Enregistrer n'est alors pas proposé,
 * mais un participant voit la carte de consentement et le voyant d'un enregistrement lancé ailleurs.
 */
@Module
@InstallIn(SingletonComponent::class)
internal abstract class CallRecordingBindingsModule {
    @Binds abstract fun signals(impl: SocketCallRecordingSignals): CallRecordingSignals

    @Binds abstract fun viewer(impl: SessionCallRecordingViewer): CallRecordingViewer

    @Binds abstract fun encryption(impl: ConversationCallRecordingEncryptionGate): CallRecordingEncryptionGate

    companion object {
        @Provides
        fun capturer(): CallRecordingCapturer = UnavailableCallRecordingCapturer

        @Provides
        fun uploader(): CallRecordingUploader = UnavailableCallRecordingUploader
    }
}
