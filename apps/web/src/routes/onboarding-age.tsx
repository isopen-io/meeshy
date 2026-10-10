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

/* Une date à revoir se dit d'UNE phrase, quelle que soit sa faute (le champ
   natif borne déjà la saisie) ; seul l'échec d'enregistrement dit autre chose. */
const ERROR_KEY = {
  incomplete: 'onboarding.age.check',
  future: 'onboarding.age.check',
  tooOld: 'onboarding.age.check',
  invalid: 'onboarding.age.check',
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
            {translateOnboarding(lang, 'onboarding.continue')}
          </PrimaryButton>
          <SecondaryButton id="age.skip" onClick={onSkip}>
            {translateOnboarding(lang, 'onboarding.age.skip')}
          </SecondaryButton>
        </>
      }
    >
      <div className="onb-field">
        <input
          ref={field}
          type="date"
          aria-label={translateOnboarding(lang, 'onboarding.age.title')}
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
