package me.meeshy.app.notifications

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.NotificationFilterCategory
import me.meeshy.sdk.notification.NotificationScope
import org.junit.Test

class NotificationCategoryScopesTest {

    @Test
    fun `chaque categorie hors Toutes porte la requete de la loi pure`() {
        NotificationFilterCategory.entries.filter { it != NotificationFilterCategory.ALL }.forEach { category ->
            val query = category.serverQuery
            val scope = category.scope()
            assertThat(scope.types).containsExactlyElementsIn(query.types)
            assertThat(scope.unreadOnly).isEqualTo(query.unreadOnly)
            assertThat(scope.hideReadTypes).containsExactlyElementsIn(query.hideReadTypes)
        }
    }

    @Test
    fun `Toutes est la portee partagee`() {
        assertThat(NotificationFilterCategory.ALL.scope()).isEqualTo(NotificationScope.All)
    }

    @Test
    fun `Non lues interroge unreadOnly sans filtre de types`() {
        val scope = NotificationFilterCategory.UNREAD.scope()
        assertThat(scope.unreadOnly).isTrue()
        assertThat(scope.types).isEmpty()
    }

    @Test
    fun `les douze categories ont douze cles distinctes`() {
        assertThat(NotificationFilterCategory.entries.map { it.scope().key }.toSet()).hasSize(12)
    }
}
