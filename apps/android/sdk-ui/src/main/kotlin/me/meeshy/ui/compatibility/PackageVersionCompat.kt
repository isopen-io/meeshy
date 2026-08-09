package me.meeshy.ui.compatibility

import android.content.pm.PackageInfo
import android.os.Build

/**
 * Couche de compatibilite Oreo (API 26) -> Android 17 (API 37).
 *
 * Pendant Android de `packages/MeeshySDK/Sources/MeeshyUI/Compatibility/` cote iOS,
 * et meme regle : un appelant ne teste JAMAIS le niveau d'API lui-meme. Chaque
 * divergence entre versions est encapsulee ici et exposee par une fonction unique,
 * de sorte qu'ajouter une plateforme se fasse en un seul endroit.
 *
 * Regle de creation, reprise telle quelle d'iOS : ne pas ecrire de helper quand
 * l'API recente existe deja au plancher. Un shim decoratif coute de l'indirection
 * sans rien garantir.
 */

/**
 * Le code de version du paquet, quelle que soit la plateforme.
 *
 * `PackageInfo.versionCode` est deprecie depuis API 28 au profit de
 * `longVersionCode`, mais le plancher du projet est API 26 : les deux chemins sont
 * necessaires. La regle vivait recopiee a l'identique dans `AboutScreen` et
 * `SupportScreen` — deux copies d'une meme regle de version ne restent pas
 * d'accord.
 *
 * Les deux lectures arrivent en lambda et le niveau d'API en parametre : c'est ce
 * qui rend le seuil verifiable des deux cotes sans emulateur. Un test qui ne
 * vaudrait que sur la version de la machine ne prouverait rien sur la plage
 * annoncee.
 */
internal fun resolvePackageVersionCode(
    sdkInt: Int,
    longVersionCode: () -> Long,
    legacyVersionCode: () -> Int,
): Long =
    if (sdkInt >= Build.VERSION_CODES.P) longVersionCode() else legacyVersionCode().toLong()

/** Point d'appel reel : lit le [PackageInfo] par le chemin que sa plateforme autorise. */
public fun PackageInfo.versionCodeCompat(): Long =
    resolvePackageVersionCode(
        sdkInt = Build.VERSION.SDK_INT,
        longVersionCode = { longVersionCode },
        legacyVersionCode = { @Suppress("DEPRECATION") versionCode },
    )
