import { useEffect, useId, useState } from 'react';

import type { ExternalReportAcknowledgement } from '@meeshy/shared/types/external-interop-compliance';

import type { ExternalReportDraft } from '@/lib/api/external-interop-compliance';
import type { ApiResult } from '@/lib/api/http';
import { REPORT_REASONS, type ReportReason } from '@/lib/api/reports';
import { translate } from '@/lib/i18n-catalog';
import {
  isExternalInteropCatalogLoaded,
  loadExternalInteropCatalog,
  translateExternalInterop,
  type ExternalInteropCatalogKey,
} from '@/lib/i18n-external-interop-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { Sheet } from './sheet';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

type PlainKey = Exclude<ExternalInteropCatalogKey, 'externalInterop.notice.retention'>;

/**
 * **SIGNALER UN CONTENU REÇU DE WHATSAPP** (#17120, chantier #17007 ; DSA art. 16 et 17) — la conversation est
 * chiffrée de bout en bout : la passerelle ne la lit pas, et cette feuille ne change rien à cela.
 *
 * - Le texte du message ne part que si la personne coche « Joindre le texte du message » — décochée par défaut :
 *   transmettre du clair est un choix, jamais un effet de bord. La case dit où le texte va.
 * - « Bloquer ce contact sur Meeshy » est cochée par défaut (la passerelle bloque le pair localement).
 * - Le motif est obligatoire (`REPORT_REASONS`, les huit du serveur) : signaler sans motif n'est qu'un clic.
 * - L'accusé dit ce qui a été fait (bloqué ou non) et oriente vers le signalement de Meta : Meeshy ne peut pas agir
 *   sur le compte WhatsApp.
 */
export function ExternalContentReportSheet({
  language,
  messageText,
  report,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  /** Le texte DÉCHIFFRÉ du message signalé, sur cet appareil ; absent pour un média ou un fil entier. */
  readonly messageText?: string | undefined;
  readonly report: (draft: ExternalReportDraft) => Promise<ApiResult<ExternalReportAcknowledgement>>;
  readonly onClose: () => void;
}) {
  const [ready, setReady] = useState(() => isExternalInteropCatalogLoaded(language));
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [attach, setAttach] = useState(false);
  const [block, setBlock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [done, setDone] = useState<ExternalReportAcknowledgement | null>(null);
  const ids = useId();

  useEffect(() => {
    let live = true;
    void loadExternalInteropCatalog(language).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [language]);

  if (!ready) return null;
  const t = (key: PlainKey) => translateExternalInterop(language, key);
  const hasText = (messageText?.trim() ?? '') !== '';

  const send = async () => {
    if (reason === null) return;
    setBusy(true);
    setFailed(false);
    const draft: ExternalReportDraft = {
      reason,
      blockPeer: block,
      ...(attach && hasText && messageText !== undefined ? { disclosedText: messageText } : {}),
    };
    const result = await report(draft).catch(() => null);
    setBusy(false);
    if (result?.ok) {
      setDone(result.data);
      return;
    }
    setFailed(true);
  };

  if (done !== null) {
    return (
      <Sheet title={t('externalInterop.report.done.title')} presentation="centered" bodyAs="div" dialogData={{ 'data-external-report-done': '' }} onClose={onClose}>
        <div className="grid gap-4 px-5 pb-5 pt-2">
          {done.peerBlocked ? (
            <p role="status" className="text-body" style={{ color: 'var(--color-ios-ink)' }} data-external-report-blocked="">
              {t('externalInterop.report.done.blocked')}
            </p>
          ) : null}
          <p className="text-body" style={{ color: 'var(--color-ios-ink)' }} data-external-report-orientation={done.orientation}>
            {t('externalInterop.report.done.orientation')}
          </p>
          <button
            type="button"
            onClick={onClose}
            className={`rounded-card px-5 text-body font-semibold ${FOCUS}`}
            style={{ minHeight: 48, border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t('externalInterop.report.done.close')}
          </button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet title={t('externalInterop.report.title')} presentation="centered" bodyAs="div" dialogData={{ 'data-external-report': '' }} onClose={onClose}>
      <form
        className="grid gap-4 px-5 pb-5 pt-2"
        onSubmit={(event) => {
          event.preventDefault();
          void send();
        }}
      >
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('externalInterop.report.lead')}
        </p>
        <fieldset className="grid gap-1">
          <legend className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
            {t('externalInterop.report.reason')}
          </legend>
          {REPORT_REASONS.map((value) => (
            <label key={value} className="flex items-center gap-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
              <input
                type="radio"
                name={`${ids}-reason`}
                value={value}
                checked={reason === value}
                onChange={() => setReason(value)}
                data-external-report-reason={value}
              />
              {translate(language, `report.reason.${value}` as 'report.reason.spam')}
            </label>
          ))}
        </fieldset>
        {hasText ? (
          <label className="flex items-start gap-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
            <input type="checkbox" checked={attach} onChange={(event) => setAttach(event.currentTarget.checked)} aria-describedby={`${ids}-attach`} data-external-report-attach="" />
            <span className="grid gap-1">
              {t('externalInterop.report.attach')}
              <span id={`${ids}-attach`} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                {t('externalInterop.report.attach.hint')}
              </span>
            </span>
          </label>
        ) : null}
        <label className="flex items-center gap-3 text-body" style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}>
          <input type="checkbox" checked={block} onChange={(event) => setBlock(event.currentTarget.checked)} data-external-report-block="" />
          {t('externalInterop.report.block')}
        </label>
        {failed ? (
          <p role="alert" className="text-caption" style={{ color: 'var(--color-error)' }} data-external-report-failed="">
            {t('externalInterop.report.error')}
          </p>
        ) : null}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onClose}
            className={`rounded-card px-5 text-body font-semibold ${FOCUS}`}
            style={{ minHeight: 48, border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t('externalInterop.report.cancel')}
          </button>
          <button
            type="submit"
            disabled={reason === null || busy}
            aria-busy={busy}
            className={`rounded-card px-5 text-body font-semibold text-ios-on-brand disabled:opacity-40 ${FOCUS}`}
            style={{ minHeight: 48, backgroundColor: 'var(--color-error)', outlineColor: 'var(--color-ios-brand)' }}
            data-external-report-submit=""
          >
            {busy ? t('externalInterop.report.submit.busy') : t('externalInterop.report.submit')}
          </button>
        </div>
      </form>
    </Sheet>
  );
}
