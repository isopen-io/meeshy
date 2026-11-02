package me.meeshy.app.stories

/**
 * **LE CALQUE DE L'EXPORT NE PEINT QU'EN PASSAGE DE DESSIN** (#13897). Sur Android 9 (S8), le calque graphique est une vue
 * (`GraphicsViewLayer`) : s'il n'a pas pu s'enregistrer pendant le passage de dessin, `toImageBitmap` rejoue son bloc hors de
 * tout passage, et `drawContent` lève un `NullPointerException` faute de nœud à peindre — l'export s'arrêtait sur « les
 * calques de la scène 1 ne se sont pas peints ». Le bloc enregistré passe par [record] : en passage ([pass]), il peint ;
 * rejoué hors passage, il ne peint rien et le note ([replayed]). [capture] jette alors l'image vide, redemande un passage
 * et relit, [ATTEMPTS] fois au plus, puis échoue plutôt que de rendre une image vide.
 */
internal class StoryExportLayerRecording {
    private var drawing = false

    var replayed: Boolean = false
        private set

    fun pass(draw: () -> Unit) {
        drawing = true
        try {
            draw()
        } finally {
            drawing = false
        }
    }

    fun record(paint: () -> Unit) {
        if (drawing) paint() else replayed = true
    }

    suspend fun <T> capture(capture: suspend () -> T, redraw: suspend () -> Unit): T {
        repeat(ATTEMPTS) { attempt ->
            replayed = false
            val captured = capture()
            if (!replayed) return captured
            if (attempt < ATTEMPTS - 1) redraw()
        }
        error("le calque s'est rejoué hors de son passage de dessin à chacune des $ATTEMPTS captures")
    }

    companion object {
        const val ATTEMPTS = 3
    }
}
