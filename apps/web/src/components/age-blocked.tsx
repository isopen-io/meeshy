import { useId } from 'react';

import type { ApiFailure } from '@/lib/api/http';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **UN COMPTE DE MOINS DE 13 ANS** (#9928, contrat #9927) — la déclaration
 * sous 13 ans est DÉFINITIVE : la passerelle l'écrit, répond 422 à l'accueil,
 * révoque les sessions, puis rend 403 `AGE_BELOW_MINIMUM` à la connexion et
 * au lien magique tant que le compte a moins de 13 ans. Toutes ces portes
 * disent la même chose, avec ce composant et ses textes — jamais un échec
 * générique qui inviterait à réessayer — et rien ne se relance tout seul :
 * seul « Compris » quitte l'écran. L'accueil, dont le 422 vient de révoquer
 * la session, finit celle-ci et mène à la connexion sur `?motif=age`
 * (`login.tsx § ageBlockedFromSearch`) : c'est ce même écran qui le dit.
 */
export const AGE_BELOW_MINIMUM = 'AGE_BELOW_MINIMUM';

export const isAgeBelowMinimum = (failure: Pick<ApiFailure, 'code'>): boolean => failure.code === AGE_BELOW_MINIMUM;

export function AgeBlocked({ language, onConfirm }: { readonly language: InterfaceLanguage; readonly onConfirm: () => void }) {
  const titleId = useId();
  return (
    <section data-age-blocked role="alert" aria-labelledby={titleId} className="grid w-full gap-4 text-center">
      <span aria-hidden="true" className="text-5xl">
        🎂
      </span>
      <h1 id={titleId} className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'age.blocked.title')}
      </h1>
      <p style={{ color: 'var(--color-ios-ink-2)' }}>{translate(language, 'age.blocked.body')}</p>
      <button
        type="button"
        data-age-blocked-confirm
        onClick={onConfirm}
        className="grid place-items-center rounded-field font-bold text-ios-on-brand"
        style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))' }}
      >
        {translate(language, 'age.blocked.confirm')}
      </button>
    </section>
  );
}
