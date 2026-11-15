package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.StoryVisibilityMenuResolver.Route
import org.junit.Test

class StoryVisibilityMenuResolverTest {

    @Test
    fun `le mode deja actif est ignore, casse du serveur comprise`() {
        assertThat(StoryVisibilityMenuResolver.route(StoryVisibility.FRIENDS, "friends")).isEqualTo(Route.Ignored)
        assertThat(StoryVisibilityMenuResolver.route(StoryVisibility.PUBLIC, "PUBLIC")).isEqualTo(Route.Ignored)
    }

    @Test
    fun `EXCEPT et ONLY ouvrent le selecteur d'audience`() {
        assertThat(StoryVisibilityMenuResolver.route(StoryVisibility.EXCEPT, "PUBLIC")).isEqualTo(Route.OpenAudiencePicker)
        assertThat(StoryVisibilityMenuResolver.route(StoryVisibility.ONLY, null)).isEqualTo(Route.OpenAudiencePicker)
    }

    @Test
    fun `les autres modes partent directement avec une liste vide toujours envoyee`() {
        listOf(StoryVisibility.PUBLIC, StoryVisibility.COMMUNITY, StoryVisibility.FRIENDS, StoryVisibility.PRIVATE)
            .forEach { mode ->
                val route = StoryVisibilityMenuResolver.route(mode, "EXCEPT")
                assertThat(route).isEqualTo(Route.ApplyDirectly(userIds = emptyList()))
                assertThat((route as Route.ApplyDirectly).userIds).isNotNull()
            }
    }

    @Test
    fun `quitter EXCEPT pour un mode direct nettoie l'audience orpheline`() {
        val route = StoryVisibilityMenuResolver.route(StoryVisibility.PUBLIC, "EXCEPT") as Route.ApplyDirectly
        assertThat(route.userIds).isEmpty()
    }
}
