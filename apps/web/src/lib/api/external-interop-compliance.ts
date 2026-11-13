import * as conversationsEndpoints from '@meeshy/shared/api/endpoints/conversations';
import { EXTERNAL_CONVERSATION_ERROR_CODES } from '@meeshy/shared/types/external-conversation';
import {
  EXTERNAL_INTEROP_NOTICE_VERSION,
  type ExternalInteropConsentStatus,
  type ExternalReportAcknowledgement,
} from '@meeshy/shared/types/external-interop-compliance';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';
import type { ReportReason } from './reports';

/**
 * **LA CONFORMITÉ DE L'INTEROPÉRABILITÉ, CÔTÉ WEB** (#17120, chantier #17007) —
 * les trois portes de la passerelle (`routes/conversations/external-compliance.ts`) :
 *
 * - `GET conversations.externalConsent` : ce qui part chez Meta (version,
 *   liste, durée de conservation du numéro de l'ami) et le consentement ;
 * - `PUT conversations.externalConsent` : le consentement, sous la version que
 *   CE client montre (`EXTERNAL_INTEROP_NOTICE_VERSION`) — le serveur date,
 *   refuse une version périmée en 409 ;
 * - `POST conversations.byIdExternalReport` : signaler un contenu reçu de
 *   WhatsApp ; le texte ne part que si la personne le joint elle-même.
 *
 * En fixtures, aucune passerelle ne joue l'ami : les portes se disent absentes
 * (`404`), lues « pas encore disponible ici ».
 */
export type ExternalInteropDeps = {
  readonly source: DataSource;
  readonly transport: Pick<HttpTransport, 'request'>;
};

const ABSENT_IN_FIXTURES = { ok: false, status: 404, error: 'Interopérabilité indisponible en fixtures' } as const;

export function readExternalInteropConsent(deps: ExternalInteropDeps): Promise<ApiResult<ExternalInteropConsentStatus>> {
  if (deps.source === 'fixtures') return Promise.resolve(ABSENT_IN_FIXTURES);
  return deps.transport.request<ExternalInteropConsentStatus>({
    method: 'GET',
    path: `${conversationsEndpoints.externalConsent}?network=whatsapp`,
  });
}

export function recordExternalInteropConsent(
  deps: ExternalInteropDeps,
  granted: boolean,
): Promise<ApiResult<ExternalInteropConsentStatus>> {
  if (deps.source === 'fixtures') return Promise.resolve(ABSENT_IN_FIXTURES);
  return deps.transport.request<ExternalInteropConsentStatus>({
    method: 'PUT',
    path: conversationsEndpoints.externalConsent,
    body: { network: 'whatsapp', noticeVersion: EXTERNAL_INTEROP_NOTICE_VERSION, granted },
  });
}

export type ExternalReportDraft = {
  readonly reason: ReportReason;
  readonly blockPeer: boolean;
  /** Le texte que la personne a CHOISI de joindre ; absent, rien du contenu ne part. */
  readonly disclosedText?: string;
};

export function reportExternalContent(
  deps: ExternalInteropDeps,
  conversationId: string,
  draft: ExternalReportDraft,
): Promise<ApiResult<ExternalReportAcknowledgement>> {
  if (deps.source === 'fixtures') return Promise.resolve(ABSENT_IN_FIXTURES);
  const disclosed = draft.disclosedText?.trim() ?? '';
  return deps.transport.request<ExternalReportAcknowledgement>({
    method: 'POST',
    path: conversationsEndpoints.byIdExternalReport(conversationId),
    body: { reportType: draft.reason, blockPeer: draft.blockPeer, ...(disclosed === '' ? {} : { disclosedText: disclosed }) },
  });
}

/** Ce que l'écran d'information dit d'une réponse à son consentement. */
export type ConsentAnswer = 'recorded' | 'outdated' | 'unavailable' | 'failed';

export function consentAnswerOf(result: ApiResult<ExternalInteropConsentStatus> | null): ConsentAnswer {
  if (result === null) return 'failed';
  if (result.ok) return result.data.current ? 'recorded' : 'failed';
  if (result.code === EXTERNAL_CONVERSATION_ERROR_CODES.NOTICE_OUTDATED) return 'outdated';
  if (result.code === EXTERNAL_CONVERSATION_ERROR_CODES.DISABLED || result.status === 404) return 'unavailable';
  return 'failed';
}
