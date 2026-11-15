import {
  CONTENT_CAPTURE_NOTICES_PER_HOUR,
  CONTENT_CAPTURE_NOTICES_PER_REPORT,
  CONTENT_CAPTURE_REPORTS_PER_MINUTE,
  type ContentCaptureKind,
} from '@meeshy/shared/types/content-capture-kinds';

/**
 * CE QUE LA PASSERELLE PEUT ENCORE ANNONCER, PAR CONVERSATION (#9617, audit
 * A1). Elle n'écrit au plus que 10 avis par déclaration, 6 déclarations par
 * minute et 30 avis par heure ; au-delà, une flamme capturée ne s'annonce pas.
 * Ce registre compte, côté client, ce qui a été demandé et ce qui a été
 * annoncé, pour que la coque noircisse une fenêtre qui montrerait plus de
 * flammes non encore annoncées qu'elle ne peut en annoncer. Il SURESTIME
 * l'usage (une déclaration refusée compte, une annonce faite depuis un autre
 * appareil ne se voit pas comme gratuite) : l'erreur va vers le noir.
 */
export type CaptureLedger = {
  readonly declarationsAt: readonly number[];
  readonly noticesAt: readonly number[];
  /** `kind:messageId` déjà annoncés — la passerelle n'annonce qu'une fois par (acteur, message, sorte). */
  readonly announced: ReadonlySet<string>;
};

export const EMPTY_LEDGER: CaptureLedger = { declarationsAt: [], noticesAt: [], announced: new Set() };

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;

const within = (instants: readonly number[], now: number, windowMs: number): readonly number[] => instants.filter((at) => now - at < windowMs);

/** Combien d'avis neufs la passerelle peut encore écrire maintenant. */
export function captureCapacity(ledger: CaptureLedger, now: number): number {
  const hourly = CONTENT_CAPTURE_NOTICES_PER_HOUR - within(ledger.noticesAt, now, HOUR_MS).length;
  const perMinute = (CONTENT_CAPTURE_REPORTS_PER_MINUTE - within(ledger.declarationsAt, now, MINUTE_MS).length) * CONTENT_CAPTURE_NOTICES_PER_REPORT;
  return Math.max(0, Math.min(hourly, perMinute));
}

export function unannounced(ledger: CaptureLedger, kind: ContentCaptureKind, messageIds: Iterable<string>): readonly string[] {
  return [...new Set(messageIds)].filter((id) => !ledger.announced.has(`${kind}:${id}`));
}

export function withDeclaration(ledger: CaptureLedger, now: number): CaptureLedger {
  return { ...ledger, declarationsAt: [...within(ledger.declarationsAt, now, MINUTE_MS), now] };
}

/** Les annonces que la passerelle confirme (`noticedMessageIds`) ; seules les neuves consomment le budget horaire. */
export function withNotices(ledger: CaptureLedger, kind: ContentCaptureKind, messageIds: readonly string[], now: number): CaptureLedger {
  const fresh = unannounced(ledger, kind, messageIds);
  return {
    ...ledger,
    noticesAt: [...within(ledger.noticesAt, now, HOUR_MS), ...fresh.map(() => now)],
    announced: new Set([...ledger.announced, ...fresh.map((id) => `${kind}:${id}`)]),
  };
}

/** Découpe une capture en déclarations que la passerelle annonce en entier. */
export function captureLots(messageIds: readonly string[]): readonly (readonly string[])[] {
  const unique = [...new Set(messageIds)];
  return Array.from({ length: Math.ceil(unique.length / CONTENT_CAPTURE_NOTICES_PER_REPORT) }, (_, index) =>
    unique.slice(index * CONTENT_CAPTURE_NOTICES_PER_REPORT, (index + 1) * CONTENT_CAPTURE_NOTICES_PER_REPORT),
  );
}
