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

public object ApiRoutesAttachments {
    public const val BATCH_ANALYSIS: String = "attachments/batch/analysis"
    public const val BY_ATTACHMENT_ID: String = "attachments/{attachmentId}"
    public const val BY_ATTACHMENT_ID_ANALYSIS: String = "attachments/{attachmentId}/analysis"
    public const val BY_ATTACHMENT_ID_METADATA: String = "attachments/{attachmentId}/metadata"
    public const val BY_ATTACHMENT_ID_STATUS: String = "attachments/{attachmentId}/status"
    public const val BY_ATTACHMENT_ID_STATUS_DETAILS: String = "attachments/{attachmentId}/status-details"
    public const val BY_ATTACHMENT_ID_THUMBNAIL: String = "attachments/{attachmentId}/thumbnail"
    public const val BY_ATTACHMENT_ID_TRANSCRIBE: String = "attachments/{attachmentId}/transcribe"
    public const val BY_ATTACHMENT_ID_TRANSLATE: String = "attachments/{attachmentId}/translate"
    public const val FILE_BY_WILDCARD: String = "attachments/file/{wildcard}"
    public const val SEARCH: String = "attachments/search"
    public const val SIGNED_BY_TOKEN_BY_WILDCARD: String = "attachments/signed/{token}/{wildcard}"
    public const val UPLOAD: String = "attachments/upload"
    public const val UPLOAD_TEXT: String = "attachments/upload-text"
}
