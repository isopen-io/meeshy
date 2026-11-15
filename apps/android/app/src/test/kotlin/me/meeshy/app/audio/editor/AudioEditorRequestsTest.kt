package me.meeshy.app.audio.editor

import com.google.common.truth.Truth.assertThat
import java.io.File
import me.meeshy.sdk.audioedit.AudioEditResult
import org.junit.Test

class AudioEditorRequestsTest {

    private val result = AudioEditResult(File("out.m4a"), 3.0)

    @Test
    fun `ouvrir expose la demande, confirmer la ferme puis prévient l'appelant une fois`() {
        val requests = AudioEditorRequests()
        val seen = mutableListOf<String>()
        requests.open(File("a.m4a"), { seen += "ok" + (requests.request.value == null) }, { seen += "cancel" })
        val open = requests.request.value!!
        requests.confirm(open, result)
        requests.confirm(open, result)
        assertThat(seen).containsExactly("oktrue")
        assertThat(requests.request.value).isNull()
    }

    @Test
    fun `annuler ferme puis prévient, et une issue tardive après annulation est ignorée`() {
        val requests = AudioEditorRequests()
        val seen = mutableListOf<String>()
        requests.open(File("a.m4a"), { seen += "ok" }, { seen += "cancel" })
        val open = requests.request.value!!
        requests.cancel(open)
        requests.confirm(open, result)
        assertThat(seen).containsExactly("cancel")
    }

    @Test
    fun `une seconde ouverture pendant une première est refusée à l'instant et ne vole pas la place`() {
        val requests = AudioEditorRequests()
        val seen = mutableListOf<String>()
        requests.open(File("a.m4a"), { seen += "a-ok" }, { seen += "a-cancel" })
        val first = requests.request.value!!
        requests.open(File("b.m4a"), { seen += "b-ok" }, { seen += "b-cancel" })
        assertThat(seen).containsExactly("b-cancel")
        assertThat(requests.request.value).isSameInstanceAs(first)
    }

    @Test
    fun `un rappel de sortie peut rouvrir un éditeur`() {
        val requests = AudioEditorRequests()
        var reopened = false
        requests.open(File("a.m4a"), {}, { requests.open(File("b.m4a"), {}, {}); reopened = requests.request.value != null })
        requests.cancel(requests.request.value!!)
        assertThat(reopened).isTrue()
    }
}
