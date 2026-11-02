// GÉNÉRÉ — ne pas éditer à la main.
//
// Source : services/gateway/route-manifest.json, via la MÊME dérivation que le
// catalogue TypeScript (packages/shared/api/build-catalog.ts). Régénérer après
// tout changement de route :
//
//   cd packages/shared && npm run android-endpoints:generate
//
// Les chemins sont relatifs au préfixe d'API (/api/v1/) ; les emplacements {nom}
// sont résolus par @Path. Les routes hors /api/v1 gardent leur chemin complet.

package me.meeshy.sdk.net.routes

public object ApiRoutesVoice {
    public const val ADMIN_METRICS: String = "voice/admin/metrics"
    public const val ANALYSIS: String = "voice/analysis"
    public const val ANALYZE: String = "voice/analyze"
    public const val COMPARE: String = "voice/compare"
    public const val FEEDBACK: String = "voice/feedback"
    public const val HISTORY: String = "voice/history"
    public const val JOB_BY_JOB_ID: String = "voice/job/{jobId}"
    public const val LANGUAGES: String = "voice/languages"
    public const val PROFILE: String = "voice/profile"
    public const val PROFILE_BY_PROFILE_ID: String = "voice/profile/{profileId}"
    public const val PROFILE_CONSENT: String = "voice/profile/consent"
    public const val PROFILE_REGISTER: String = "voice/profile/register"
    public const val TRANSCRIBE: String = "voice/transcribe"
    public const val TRANSLATE: String = "voice/translate"
    public const val TRANSLATE_ASYNC: String = "voice/translate/async"
}
