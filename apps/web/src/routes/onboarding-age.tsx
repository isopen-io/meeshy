import { useId, useRef, useState } from 'react';

import { translateOnboarding } from '@/lib/i18n-onboarding-catalog';
import { birthDateBounds, birthDateVerdict } from '@/lib/onboarding/age';

import { CardFrame, type CardHost } from './onboarding-cards';
import { PrimaryButton, SecondaryButton } from './onboarding-visuals';

/**
 * **LA CARTE DE L'ÂGE** (#9928) — facultative : « Passer » enregistre l'étape
 * passée, et un âge non renseigné ne restreint rien. Le sélecteur est le
 * champ de date NATIF : clavier, lecteur d'écran et roue de la coque Android
 * viennent du système, sans réécriture. La carte ne vérifie que la FORME de
 * la date (`age.ts`) ; la classe d'âge est tranchée par la passerelle, dont la
 * réponse dit la carte suivante — d'où un envoi attendu (le bouton réagit au
 * geste), jamais une carte qui avance puis recule.
 */

/** Ce que l'envoi a rendu à la carte — le reste (étape faite, refus des moins de 13 ans) est l'affaire du parcours. */
export type AgeSubmit = 'done' | 'invalid' | 'failed';

type AgeError = 'incomplete' | 'future' | 'tooOld' | 'invalid' | 'failed';

const ERROR_KEY = {
  incomplete: 'onboarding.age.incomplete',
  future: 'onboarding.age.future',
  tooOld: 'onboarding.age.tooOld',
  invalid: 'onboarding.age.invalid',
  failed: 'onboarding.age.failed',
} as const satisfies Record<AgeError, string>;

function AgeIllustration() {
  return (
    <div className="onb-illu onb-bell" aria-hidden="true">
      <span className="onb-bell-disc onb-age-disc">🎂</span>
    </div>
  );
}

export function AgeCard({
  host,
  today,
  submit,
  onSkip,
}: {
  readonly host: CardHost;
  readonly today: Date;
  readonly submit: (birthDate: string) => Promise<AgeSubmit>;
  readonly onSkip: () => void;
}) {
  const lang = host.lang;
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<AgeError | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const fieldId = useId();
  const errorId = useId();
  const bounds = birthDateBounds(today);

  const confirm = async () => {
    if (busy) return;
    const verdict = birthDateVerdict(value, today);
    if (verdict !== 'ok') {
      setError(verdict);
      field.current?.focus();
      return;
    }
    setBusy(true);
    setError(null);
    const outcome = await submit(value);
    if (outcome === 'done') return;
    setBusy(false);
    setError(outcome);
  };

  return (
    <CardFrame
      step="age"
      title={translateOnboarding(lang, 'onboarding.age.title')}
      body={translateOnboarding(lang, 'onboarding.age.body')}
      illustration={<AgeIllustration />}
      actions={
        <>
          <PrimaryButton id="age.confirm" onClick={() => void confirm()} busy={busy} disabled={!host.online || value === ''}>
            {translateOnboarding(lang, 'onboarding.age.confirm')}
          </PrimaryButton>
          <SecondaryButton id="age.skip" onClick={onSkip}>
            {translateOnboarding(lang, 'onboarding.age.skip')}
          </SecondaryButton>
        </>
      }
    >
      <div className="onb-field">
        <label className="onb-field-label" htmlFor={fieldId}>
          {translateOnboarding(lang, 'onboarding.age.label')}
        </label>
        <input
          ref={field}
          id={fieldId}
          type="date"
          className="onb-date"
          data-onb-age-input
          value={value}
          min={bounds.min}
          max={bounds.max}
          autoComplete="bday"
          aria-invalid={error === null ? undefined : true}
          {...(error === null ? {} : { 'aria-describedby': errorId })}
          onInput={(event) => {
            setValue(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void confirm();
          }}
        />
      </div>
      {error === null ? null : (
        <p id={errorId} role="alert" className="onb-error" data-onb-age-error={error}>
          {translateOnboarding(lang, ERROR_KEY[error])}
        </p>
      )}
      {!host.online ? <p className="onb-note">{translateOnboarding(lang, 'onboarding.offline')}</p> : null}
    </CardFrame>
  );
}

/**
 * **MOINS DE 13 ANS** — la passerelle n'a rien écrit (422) ; l'écran le dit
 * sobrement, sans retour possible au parcours, et « Compris » ferme la
 * session. Il reste monté jusqu'au geste : déconnecter d'abord ferait partir
 * la garde de session vers la connexion avant que la phrase soit lue.
 */
export function AgeRefusal({ host, onConfirm }: { readonly host: CardHost; readonly onConfirm: () => void }) {
  const lang = host.lang;
  return (
    <CardFrame
      step="age-refused"
      title={translateOnboarding(lang, 'onboarding.age.below.title')}
      body={translateOnboarding(lang, 'onboarding.age.below.body')}
      illustration={<AgeIllustration />}
      actions={
        <PrimaryButton id="age.refused.confirm" onClick={onConfirm}>
          {translateOnboarding(lang, 'onboarding.age.below.confirm')}
        </PrimaryButton>
      }
    />
  );
}
