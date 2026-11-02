package me.meeshy.app.navigation

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.visitor.VisitorContentKind
import me.meeshy.sdk.model.visitor.VisitorContentRequest
import org.junit.Test

class VisitorContentPresenterTest {
    private val request = VisitorContentRequest("p1", VisitorContentKind.REEL, via = null)

    @Test
    fun `presenter pose la demande et fermer l efface`() {
        val presenter = VisitorContentPresenter()
        presenter.present(request)
        assertThat(presenter.request.value).isEqualTo(request)
        presenter.dismiss()
        assertThat(presenter.request.value).isNull()
    }
}
