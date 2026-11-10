import { useCallback, useEffect, useId, useRef, useState } from 'react';

import type { ExternalInteropConsentStatus } from '@meeshy/shared/types/external-interop-compliance';

import type { ApiResult } from '@/lib/api/http';
import {
  externalOpeningOutcomeOf,
  normalizeExternalHandle,
  type ExternalOpening,
  type ExternalOpeningOutcome,
  type ExternalOpeningRefusal,
} from '@/lib/external-conversation/external-conversation';
import {
  isExternalConversationCatalogLoaded,
  loadExternalConversationCatalog,
  translateExternalConversation,
  type ExternalConversationCatalogKey,
} from '@/lib/i18n-external-conversation-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { ExternalInteropNotice } from './external-interop-notice';
import { Glyph } from './glyph';
import { PhoneCodeForm, phonePrimaryButton, type PhoneCodeDeps } from './phone-code-form';

/**
 * **« ÉCRIRE À UN AMI WHATSAPP »** (#17118, chantier #17007) — l'entrée de la
 * nouvelle conversation qui ouvre, ou retrouve, une conversation externe par le
 * numéro de l'ami. Chemin nominal : toucher la rangée, saisir le numéro,
 * « Écrire » — le fil s'ouvre.
 *
 * L'hôte décide si elle EXISTE (`externalConversationEntryVisible` : staging ou
 * développement, et compte de l'équipe) ; invisible, elle ne rend rien et ne
 * charge pas son catalogue. Chaque réponse de la passerelle est un état DIT
 * (`externalOpeningOutcomeOf`) : numéro de l'utilisateur non vérifié — la
 * vérification par SMS se fait ici même (`PhoneCodeForm`) —, porte fermée,
 * réservé, plafond, débit, hors ligne, échec. Aucun refus n'est muet.
 *
 * Elle dit AVANT l'envoi ce que la conversation sera : chiffrée de bout en
 * bout, traduite sur l'appareil, sans les fonctions qui exigent le clair côté
 * serveur. Le numéro ne quitte l'appareil que vers `POST conversations.external`.
 */

/** #17120 — lire et enregistrer le consentement à ce qui part chez Meta (`lib/api/external-interop-compliance.ts`). */
export type ExternalInteropConsentDeps = {
  readonly read: () => Promise<ApiResult<ExternalInteropConsentStatus>>;
  readonly record: (granted: boolean) => Promise<ApiResult<ExternalInteropConsentStatus>>;
};

export type ExternalConversationEntryProps = {
  readonly visible: boolean;
  readonly language: InterfaceLanguage;
  readonly online: boolean;
  readonly open: (handle: string) => Promise<ApiResult<ExternalOpening>>;
  readonly phone: PhoneCodeDeps;
  readonly consent: ExternalInteropConsentDeps;
  readonly onOpened: (conversationId: string) => void;
};

const REFUSAL_KEY: Readonly<Record<ExternalOpeningRefusal, ExternalConversationCatalogKey>> = {
  disabled: 'externalConversation.refused.disabled',
  reserved: 'externalConversation.refused.reserved',
  limit: 'externalConversation.refused.limit',
  invalid: 'externalConversation.handle.invalid',
  'rate-limited': 'externalConversation.refused.rateLimited',
  offline: 'externalConversation.refused.offline',
  failed: 'externalConversation.refused.failed',
};

const OPEN_FAILURE: ExternalOpeningOutcome = { kind: 'refused', reason: 'failed' };
const OPEN_OFFLINE: ExternalOpeningOutcome = { kind: 'refused', reason: 'offline' };

function useCatalogReady(visible: boolean, language: InterfaceLanguage): boolean {
  const [readyLanguage, setReadyLanguage] = useState<InterfaceLanguage | null>(() => (isExternalConversationCatalogLoaded(language) ? language : null));
  useEffect(() => {
    if (!visible) return undefined;
    let live = true;
    void loadExternalConversationCatalog(language).then(
      () => {
        if (live) setReadyLanguage(language);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [visible, language]);
  return readyLanguage === language && isExternalConversationCatalogLoaded(language);
}

export function ExternalConversationEntry(props: ExternalConversationEntryProps) {
  const ready = useCatalogReady(props.visible, props.language);
  const [expanded, setExpanded] = useState(false);
  if (!props.visible || !ready) return null;
  const t = (key: ExternalConversationCatalogKey) => translateExternalConversation(props.language, key);
  return (
    <section data-external-conversation-entry="" className="mx-4 mb-2 shrink-0 rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <button
        type="button"
        aria-expanded={expanded}
        data-external-conversation-toggle=""
        onClick={() => setExpanded((current) => !current)}
        className="flex w-full items-center gap-3 rounded-[14px] px-3.5 py-2 text-start focus-visible:outline-2"
        style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)' }}
      >
        <span
          aria-hidden="true"
          className="grid size-8 shrink-0 place-items-center rounded-full"
          style={{ color: 'var(--color-ios-brand)', backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
        >
          <Glyph name="phone" size={16} />
        </span>
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
            {t('externalConversation.entry.title')}
          </span>
          <span className="flex items-center gap-1 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            <Glyph name="lock" size={12} aria-hidden="true" />
            {t('externalConversation.entry.detail')}
          </span>
        </span>
      </button>
      {expanded ? <ExternalConversationForm {...props} t={t} onCancel={() => setExpanded(false)} /> : null}
    </section>
  );
}

function ExternalConversationForm({
  language,
  online,
  open,
  phone,
  consent,
  onOpened,
  onCancel,
  t,
}: ExternalConversationEntryProps & {
  readonly onCancel: () => void;
  readonly t: (key: ExternalConversationCatalogKey) => string;
}) {
  const inputId = useId();
  const hintId = useId();
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState(false);
  const [outcome, setOutcome] = useState<ExternalOpeningOutcome | null>(null);
  const [pending, setPending] = useState(false);
  const [phoneVerified, setPhoneVerified] = useState(false);

  const submit = async () => {
    if (pending) return;
    const handle = normalizeExternalHandle(value);
    if (handle === null) {
      setFieldError(true);
      setOutcome(null);
      return;
    }
    setFieldError(false);
    setPhoneVerified(false);
    setOutcome(null);
    setPending(true);
    const next = await open(handle).then(
      (result) => externalOpeningOutcomeOf({ result, online }),
      () => (online ? OPEN_FAILURE : OPEN_OFFLINE),
    );
    setPending(false);
    if (next.kind === 'open') {
      setOutcome(null);
      onOpened(next.conversationId);
      return;
    }
    setFieldError(next.kind === 'refused' && next.reason === 'invalid');
    setOutcome(next.kind === 'refused' && next.reason === 'invalid' ? null : next);
  };

  const submitRef = useRef(submit);
  submitRef.current = submit;
  const onConsented = useCallback(() => void submitRef.current(), []);

  return (
    <div className="grid gap-2 px-3.5 pb-3.5">
      <form
        data-external-conversation-form=""
        noValidate
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label htmlFor={inputId} className="text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {t('externalConversation.handle.label')}
        </label>
        <input
          id={inputId}
          type="tel"
          inputMode="tel"
          autoComplete="off"
          dir="ltr"
          value={value}
          aria-invalid={fieldError}
          aria-describedby={hintId}
          onInput={(event) => {
            setValue(event.currentTarget.value);
            if (fieldError) setFieldError(false);
          }}
          className="w-full rounded-[12px] px-3 py-2 text-body outline-none focus-visible:outline-2"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)', backgroundColor: 'var(--color-ios-fill)', outlineColor: 'var(--color-ios-brand)' }}
        />
        <p
          id={hintId}
          className="m-0 text-caption"
          style={{ color: fieldError ? 'var(--color-error)' : 'var(--color-ios-ink-2)' }}
          {...(fieldError ? { role: 'alert' } : {})}
        >
          {t(fieldError ? 'externalConversation.handle.invalid' : 'externalConversation.handle.hint')}
        </p>
        <p data-external-conversation-encrypted="" className="m-0 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {t('externalConversation.encrypted')}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="grid flex-1 place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2"
            style={{ minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t('externalConversation.cancel')}
          </button>
          <button
            type="submit"
            data-external-conversation-submit=""
            disabled={pending}
            aria-busy={pending}
            className="grid flex-1 place-items-center rounded-chip px-4 font-semibold focus-visible:outline-2 disabled:opacity-60"
            style={{ ...phonePrimaryButton, color: 'var(--color-ios-on-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t(pending ? 'externalConversation.pending' : 'externalConversation.submit')}
          </button>
        </div>
      </form>
      {outcome?.kind === 'consent-required' ? (
        <ExternalInteropNotice
          language={language}
          read={consent.read}
          record={consent.record}
          onConsented={onConsented}
          onCancel={() => setOutcome(null)}
        />
      ) : null}
      <OutcomeNotice
        outcome={outcome}
        phoneVerified={phoneVerified}
        language={language}
        phone={phone}
        t={t}
        onVerified={() => {
          setPhoneVerified(true);
          setOutcome(null);
        }}
      />
    </div>
  );
}

function OutcomeNotice({
  outcome,
  phoneVerified,
  language,
  phone,
  t,
  onVerified,
}: {
  readonly outcome: ExternalOpeningOutcome | null;
  readonly phoneVerified: boolean;
  readonly language: InterfaceLanguage;
  readonly phone: PhoneCodeDeps;
  readonly t: (key: ExternalConversationCatalogKey) => string;
  readonly onVerified: () => void;
}) {
  if (phoneVerified) {
    return (
      <p role="status" data-external-conversation-outcome="phone-verified" className="m-0 text-caption font-semibold" style={{ color: 'var(--ios-success)' }}>
        {t('externalConversation.phoneVerified')}
      </p>
    );
  }
  if (outcome === null || outcome.kind === 'open' || outcome.kind === 'consent-required') return null;
  if (outcome.kind === 'phone-unverified') {
    return (
      <div data-external-conversation-outcome="phone-unverified" className="grid gap-2">
        <p role="alert" className="m-0 text-caption font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {t('externalConversation.phoneUnverified')}
        </p>
        <PhoneCodeForm language={language} deps={phone} onVerified={onVerified} />
      </div>
    );
  }
  return (
    <p role="alert" data-external-conversation-outcome={outcome.reason} className="m-0 text-caption" style={{ color: 'var(--color-error)' }}>
      {t(REFUSAL_KEY[outcome.reason])}
    </p>
  );
}
