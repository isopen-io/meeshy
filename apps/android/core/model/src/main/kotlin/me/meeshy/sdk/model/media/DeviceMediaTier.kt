package me.meeshy.sdk.model.media

/**
 * **Le tier média d'un appareil** — PURE. Chaque téléphone et chaque tablette
 * est rangé en bas / moyen / haut / pro, depuis ce qu'il DÉCLARE, et toutes les
 * lois de lecture lisent ce rang au lieu de réinventer chacune son seuil de
 * mémoire.
 *
 * Loi à miroirs : le TypeScript fait foi (`apps/web/src/lib/device/capability-tier.ts`),
 * iOS la rejoue (`packages/MeeshySDK/.../Media/DeviceMediaTier.swift`) et Android
 * ici. Les trois rejouent le MÊME fichier,
 * `packages/shared/fixtures/device-tier-vectors.json`. La loi ne lit donc que des
 * entrées NEUTRES ([DeviceMediaInputs]) — mémoire, cœurs, cadence, décodeurs,
 * énergie, chaleur — qu'aucune plateforme n'a à déduire d'une famille de puce :
 * Android MESURE ses entrées (`DeviceMediaProbe`, `:sdk-core`), il n'a pas de
 * table de puces comme le simulateur iOS.
 *
 * Le tier est ASYMÉTRIQUE par construction : [HIGH] est le comportement
 * historique de toutes les lois, [PRO] ne le dépasse que là où c'est gratuit, et
 * seuls [LOW] et [MID] BAISSENT un plafond. Une entrée inconnue (`null`) ne baisse
 * rien : un appareil que la loi ne sait pas ranger ne perd donc rien de ce qu'il
 * avait déjà.
 *
 * Les seuils :
 * - **la mémoire** — ce que l'appareil RAPPORTE (un « 4 Go » rend ~3,7 Gio), d'où
 *   2,5 / 3,5 / 5,5 Gio et non 3 / 4 / 6 ;
 * - **les cœurs** — moins de quatre plafonne à [MID], moins de six interdit [PRO] ;
 * - **la cadence** — 120 Hz est exigé pour [PRO] ;
 * - **les décodeurs** — sans HEVC matériel, [LOW] ; AV1 matériel exigé pour [PRO] ;
 * - **l'énergie et la chaleur** — l'économie d'énergie plafonne à [MID], une
 *   chaleur `serious` ou pire rend [LOW]. Ces deux-là bougent pendant la vie du
 *   processus : la sonde les relit à chaque lecture.
 *
 * Aucune dépendance à `android.*` : la loi se prouve sur JVM nue.
 */
public enum class DeviceMediaTier {
    LOW,
    MID,
    HIGH,
    PRO;

    public companion object {
        public const val MID_MEMORY_GB: Double = 2.5
        public const val HIGH_MEMORY_GB: Double = 3.5
        public const val PRO_MEMORY_GB: Double = 5.5
        public const val HIGH_CORES: Int = 4
        public const val PRO_CORES: Int = 6
        public const val PRO_FRAMES_PER_SECOND: Int = 120

        public fun classify(inputs: DeviceMediaInputs): DeviceMediaTier {
            if (inputs.thermal.throttles) return LOW
            val hardware = hardwareTier(inputs)
            return if (inputs.lowPower) minOf(hardware, MID) else hardware
        }

        private fun hardwareTier(inputs: DeviceMediaInputs): DeviceMediaTier {
            fun memoryAtLeast(threshold: Double) = inputs.memoryGb?.let { it >= threshold } ?: true
            fun coresAtLeast(threshold: Int) = inputs.cores?.let { it >= threshold } ?: true

            if (!inputs.hwHevc || !memoryAtLeast(MID_MEMORY_GB)) return LOW
            val pro = inputs.hwAv1 &&
                inputs.maxFps >= PRO_FRAMES_PER_SECOND &&
                memoryAtLeast(PRO_MEMORY_GB) &&
                coresAtLeast(PRO_CORES)
            if (pro) return PRO
            return if (memoryAtLeast(HIGH_MEMORY_GB) && coresAtLeast(HIGH_CORES)) HIGH else MID
        }
    }
}
