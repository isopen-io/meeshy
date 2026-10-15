/**
 * Traduit un refus du PARSEUR DE CORPS de Fastify (`FST_ERR_CTP_*`) en réponse
 * qui dit au client ce qui ne va pas (#8052).
 *
 * Ces erreurs naissent avant le handler, quand Fastify lit le corps : type de
 * contenu non pris en charge (415), corps JSON vide ou illisible (400), corps
 * au-delà du `bodyLimit` (413), longueur annoncée fausse (400). Elles portent
 * leur statut, mais le gestionnaire global les faisait tomber dans son repli
 * générique : « Internal Server Error / An unexpected error occurred » et une
 * ligne `[ERROR] Uncaught error in request handler` pour chaque requête mal
 * formée — le bruit que #6591 (CORS) et #8082 (schéma) ont retiré pour leurs
 * refus, et qui masque les vrais 500.
 *
 * Le discriminant est le CODE Fastify, pas le statut seul : la même famille
 * `FST_ERR_CTP_*` porte aussi des erreurs de CONFIGURATION du parseur
 * (`FST_ERR_CTP_INVALID_TYPE`, `…_INVALID_HANDLER`, statut 500), qui sont bien
 * des pannes et doivent rester journalisées comme telles. Seuls les codes
 * ci-dessous, tous 4xx, sont reconnus.
 */

export type ContentTypeParserErrorResponse = {
  readonly statusCode: 400 | 413 | 415;
  readonly error: string;
  readonly message: string;
  readonly code: string;
};

const REFUS_DU_PARSEUR: Readonly<Record<string, ContentTypeParserErrorResponse>> = {
  FST_ERR_CTP_INVALID_MEDIA_TYPE: {
    statusCode: 415,
    error: 'Unsupported Media Type',
    message: 'The request content type is not supported by this route',
    code: 'UNSUPPORTED_MEDIA_TYPE',
  },
  FST_ERR_CTP_EMPTY_JSON_BODY: {
    statusCode: 400,
    error: 'Bad Request',
    message: "The body cannot be empty when content-type is 'application/json'",
    code: 'EMPTY_BODY',
  },
  FST_ERR_CTP_INVALID_JSON_BODY: {
    statusCode: 400,
    error: 'Bad Request',
    message: 'The body is not valid JSON',
    code: 'INVALID_JSON_BODY',
  },
  FST_ERR_CTP_INVALID_CONTENT_LENGTH: {
    statusCode: 400,
    error: 'Bad Request',
    message: 'The body size does not match its Content-Length',
    code: 'INVALID_CONTENT_LENGTH',
  },
  FST_ERR_CTP_BODY_TOO_LARGE: {
    statusCode: 413,
    error: 'Payload Too Large',
    message: 'The request body is too large',
    code: 'PAYLOAD_TOO_LARGE',
  },
};

export function contentTypeParserErrorResponse(error: unknown): ContentTypeParserErrorResponse | null {
  if (typeof error !== 'object' || error === null) return null;
  const code = (error as { readonly code?: unknown }).code;
  if (typeof code !== 'string') return null;
  return Object.prototype.hasOwnProperty.call(REFUS_DU_PARSEUR, code) ? REFUS_DU_PARSEUR[code] : null;
}
