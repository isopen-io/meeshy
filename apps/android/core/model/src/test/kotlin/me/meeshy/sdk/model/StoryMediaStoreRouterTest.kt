package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.mediacache.MediaCacheCategory
import org.junit.Test

class StoryMediaStoreRouterTest {
    @Test
    fun `un mp4 declare image est route comme video d'apres l'extension`() {
        assertThat(StoryMediaStoreRouter.effectiveKind(FeedMediaType.IMAGE, "https://cdn/a/b.MP4")).isEqualTo(FeedMediaType.VIDEO)
    }

    @Test
    fun `un jpg declare video est route comme image`() {
        assertThat(StoryMediaStoreRouter.effectiveKind(FeedMediaType.VIDEO, "https://cdn/a.jpg")).isEqualTo(FeedMediaType.IMAGE)
    }

    @Test
    fun `les extensions audio sont reconnues`() {
        assertThat(StoryMediaStoreRouter.effectiveKind(null, "https://cdn/a.m4a")).isEqualTo(FeedMediaType.AUDIO)
    }

    @Test
    fun `la requete et le fragment ne comptent pas dans l'extension`() {
        assertThat(StoryMediaStoreRouter.effectiveKind(FeedMediaType.IMAGE, "https://cdn/v.mov?sig=x.png#t=1")).isEqualTo(FeedMediaType.VIDEO)
    }

    @Test
    fun `sans extension exploitable le type declare l'emporte puis l'image par defaut`() {
        assertThat(StoryMediaStoreRouter.effectiveKind(FeedMediaType.VIDEO, "https://cdn/signed/abc")).isEqualTo(FeedMediaType.VIDEO)
        assertThat(StoryMediaStoreRouter.effectiveKind(null, "https://cdn/signed/abc")).isEqualTo(FeedMediaType.IMAGE)
        assertThat(StoryMediaStoreRouter.effectiveKind(FeedMediaType.AUDIO, "https://cdn.v1/abc")).isEqualTo(FeedMediaType.AUDIO)
    }

    @Test
    fun `le magasin suit le type effectif et un document passe par les images`() {
        assertThat(StoryMediaStoreRouter.category(FeedMediaType.VIDEO)).isEqualTo(MediaCacheCategory.VIDEO)
        assertThat(StoryMediaStoreRouter.category(FeedMediaType.AUDIO)).isEqualTo(MediaCacheCategory.AUDIO)
        assertThat(StoryMediaStoreRouter.category(FeedMediaType.DOCUMENT)).isEqualTo(MediaCacheCategory.IMAGES)
    }
}
