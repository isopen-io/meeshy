package me.meeshy.sdk.media.scene

import android.util.Log

/**
 * **LE JOURNAL DE L'EXPORT D'UNE SCÈNE** (#13986) : un export qui échoue dit son étape et sa cause, sous une seule
 * étiquette — `adb logcat -s SceneExport` suffit à lire pourquoi le bandeau a dit « L'export a échoué ». Avant lui, la
 * préparation, la peinture des calques et le moteur avalaient leurs exceptions : le bandeau échouait sans une ligne.
 */
public object SceneExportLog {
    public const val TAG: String = "SceneExport"

    /** L'export s'arrête : la cause, avec sa pile. */
    public fun failed(failure: Throwable) {
        Log.e(TAG, "export échoué : ${describe(failure)}", failure)
    }

    /** Une étape renonce à une partie sans arrêter l'export (un son injoignable, une durée illisible) : ce qui manquera. */
    public fun warn(step: String, failure: Throwable) {
        Log.w(TAG, "$step : ${describe(failure)}", failure)
    }

    /** La chaîne des causes, de l'enveloppe à la racine : « IllegalStateException: calques ← IOException: disque plein ». */
    public fun describe(failure: Throwable): String =
        generateSequence(failure) { it.cause?.takeIf { cause -> cause !== it } }
            .take(MAX_CAUSES)
            .joinToString(" ← ") { "${it.javaClass.simpleName}: ${it.message}" }

    private const val MAX_CAUSES = 8
}
