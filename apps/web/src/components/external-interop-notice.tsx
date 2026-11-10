import { useEffect, useState } from 'react';

import {
  EXTERNAL_INTEROP_DISCLOSURES,
  type ExternalInteropConsentStatus,
} from '@meeshy/shared/types/external-interop-compliance';

import { consentAnswerOf, type ConsentAnswer } from '@/lib/api/external-interop-compliance';
import type { ApiResult } from '@/lib/api/http';
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

const ANSWER_KEYS = {
  outdated: 'externalInterop.notice.outdated',
  unavailable: 'externalInterop.notice.unavailable',
  failed: 'externalInterop.notice.error',
} as const;

/**
 * **CE QUI PART CHEZ META, ET LE CONSENTEMENT** (#17120, chantier #17007) — l'écran montré AVANT la première
 * conversation avec un ami WhatsApp : la passerelle refuse d'en ouvrir une sans consentement daté sous la version
 * en vigueur de cette information (`403 EXTERNAL_CONVERSATION_CONSENT_REQUIRED`).
 *
 * - La liste vient de `EXTERNAL_INTEROP_DISCLOSURES`, partagée avec la passerelle : elle s'affiche AVANT toute
 *   réponse réseau (rien à attendre pour lire). La durée de conservation du numéro de l'ami, elle, vient du
 *   serveur (`GET …/consent`, une configuration) ; tant qu'elle manque, l'écran dit « une durée limitée ».
 * - Le consentement déjà donné sous la version en vigueur ne redemande rien : `onConsented` part aussitôt.
 * - « J'accepte et je continue » est le seul geste ; « Annuler » n'écrit rien.
 * - Monté par l'entrée « écrire à un ami WhatsApp », visible au seul staging et à la seule équipe : la production
 *   ne l'atteint pas.
 */
export function ExternalInteropNotice({
  language,
  read,
  record,
  onConsented,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly read: () => Promise<ApiResult<ExternalInteropConsentStatus>>;
  readonly record: (granted: boolean) => Promise<ApiResult<ExternalInteropConsentStatus>>;
  readonly onConsented: (status: ExternalInteropConsentStatus) => void;
  readonly onCancel: () => void;
}) {
  const [ready, setReady] = useState(() => isExternalInteropCatalogLoaded(language));
  const [retentionDays, setRetentionDays] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Exclude<ConsentAnswer, 'recorded'> | null>(null);

  useEffect(() => {
    let live = true;
    void loadExternalInteropCatalog(language).then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [language]);

  useEffect(() => {
    let live = true;
    void read()
      .catch(() => null)
      .then((result) => {
        if (!live || result === null || !result.ok) return;
        if (result.data.current) {
          onConsented(result.data);
          return;
        }
        setRetentionDays(result.data.retentionDays);
      });
    return () => {
      live = false;
    };
  }, [read, onConsented]);

  if (!ready) return null;
  const t = (key: PlainKey) => translateExternalInterop(language, key);

  const accept = async () => {
    setBusy(true);
    setAnswer(null);
    const result = await record(true).catch(() => null);
    const outcome = consentAnswerOf(result);
    setBusy(false);
    if (outcome === 'recorded' && result?.ok) {
      onConsented(result.data);
      return;
    }
    if (outcome !== 'recorded') setAnswer(outcome);
  };

  return (
    <Sheet
      title={t('externalInterop.notice.title')}
      presentation="centered"
      bodyAs="div"
      closeLabel={t('externalInterop.notice.cancel')}
      dialogData={{ 'data-external-interop-notice': '' }}
      onClose={onCancel}
    >
      <div className="grid gap-4 px-5 pb-5 pt-2">
        <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
          {t('externalInterop.notice.lead')}
        </p>
        <ul className="grid list-disc gap-1 ps-5 text-body" style={{ color: 'var(--color-ios-ink)' }} data-external-interop-disclosures="">
          {EXTERNAL_INTEROP_DISCLOSURES.map((disclosure) => (
            <li key={disclosure} data-external-interop-disclosure={disclosure}>
              {t(`externalInterop.disclosure.${disclosure}`)}
            </li>
          ))}
        </ul>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }} data-external-interop-retention="">
          {retentionDays === null
            ? t('externalInterop.notice.retention.unknown')
            : translateExternalInterop(language, 'externalInterop.notice.retention', { days: String(retentionDays) })}
        </p>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('externalInterop.notice.translation')}
        </p>
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('externalInterop.notice.withdraw')}
        </p>
        {answer === null ? null : (
          <p role="alert" className="text-caption" style={{ color: 'var(--color-error)' }} data-external-interop-answer={answer}>
            {t(ANSWER_KEYS[answer])}
          </p>
        )}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-card px-5 text-body font-semibold ${FOCUS}`}
            style={{ minHeight: 48, border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t('externalInterop.notice.cancel')}
          </button>
          <button
            type="button"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void accept()}
            className={`rounded-card px-5 text-body font-semibold text-ios-on-brand disabled:opacity-60 ${FOCUS}`}
            style={{ minHeight: 48, backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
            data-external-interop-accept=""
          >
            {busy ? t('externalInterop.notice.accept.busy') : t('externalInterop.notice.accept')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
