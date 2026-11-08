package me.meeshy.sdk.media

/** Fournisseur de bail factice : compte les prises et les fins, et déclenche l'expiration à la demande. */
internal class FakeUploadLeaseProvider : UploadLeaseProvider {
    var begins = 0
        private set
    var ends = 0
        private set
    private var onExpired: (() -> Unit)? = null

    override suspend fun begin(name: String, onExpired: () -> Unit) {
        begins++
        this.onExpired = onExpired
    }

    override suspend fun end() {
        ends++
    }

    override fun expire() {
        onExpired?.invoke()
    }
}
