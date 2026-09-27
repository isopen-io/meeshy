import { useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';

import { EmailCodeForm, withStrongEmail } from '@/components/email-code-form';
import { Glyph } from '@/components/glyph';
import type { auth } from '@/lib/api/auth';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { prefersReducedMotion } from '@/lib/view/effects-runner';
import type { SignupVerification } from '@/lib/view/signup-phases';

/**
 * PHASES 3 ET 4 DE L'INSCRIPTION — LA CARTE D'IDENTITÉ EN VERRE LIQUIDE (#8288).
 *
 * Elle paraît quand l'adresse est cohérente et porte, dans l'ordre :
 *
 * 1. le nom affiché et le @pseudo, pré-dérivés et modifiables d'un toucher
 *    (`identity`, rendu par l'hôte — `DerivedIdentity`) ;
 * 2. les refus qui la visent : pseudo pris et ses suggestions, « Est-ce
 *    vous ? » (#8216) — `refusals`, rendus par l'hôte ;
 * 3. « Valider mon compte maintenant », qui CRÉE le compte et fait paraître le
 *    code à 6 chiffres DANS la carte (`EmailCodeForm`, la machine du code de
 *    `/auth/verify-email`, jamais une seconde) ;
 * 4. le code juste — ou le lien ouvert ailleurs, lu par le jeton d'attente
 *    (#8083) — et le feu d'artifice de l'arrivée (`arrival-fireworks.tsx`,
 *    chargé à la demande, jamais sous « Réduire les animations »).
 *
 * `onVerified` reçoit la validation, quelle que soit sa porte : le code, le
 * lien, ou une passerelle antérieure qui vérifie sans ouvrir de session.
 */

export type SignupCodeDeps = {
  readonly verifyEmail: typeof auth.verifyEmail;
  readonly verificationStatus: typeof auth.verificationStatus;
};

export function SignupIdentityCard({
  language,
  verification,
  identity,
  refusals,
  extra,
  canValidate,
  isValidating,
  onValidateNow,
  onVerified,
  codeDeps,
}: {
  readonly language: InterfaceLanguage;
  readonly verification: SignupVerification;
  readonly identity: ReactNode;
  readonly refusals: ReactNode;
  readonly extra: ReactNode;
  readonly canValidate: boolean;
  readonly isValidating: boolean;
  readonly onValidateNow: () => void;
  readonly onVerified: () => void;
  readonly codeDeps: SignupCodeDeps;
}) {
  const card = useRef<HTMLElement>(null);
  useCardEntrance(card);

  return (
    <section
      ref={card}
      data-signup-card
      aria-labelledby="signup-card-title"
      className="glass glass-card relative grid gap-4 overflow-hidden rounded-[26px] p-4"
      style={{
        border: '1px solid color-mix(in srgb, var(--color-ios-ink) 12%, transparent)',
        boxShadow: '0 18px 48px color-mix(in srgb, var(--color-ios-ink) 14%, transparent)',
      }}
    >
      <h2 id="signup-card-title" className="text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'signup.card.title')}
      </h2>

      {verification.kind === 'verified' ? (
        <Verified language={language} />
      ) : (
        <>
          {identity}
          {refusals}
          {verification.kind === 'none' ? (
            <>
              {extra}
              <button
                type="button"
                data-signup-validate-now
                onClick={onValidateNow}
                disabled={!canValidate || isValidating}
                aria-busy={isValidating}
                className="grid place-items-center rounded-[16px] px-4 font-semibold transition-opacity"
                style={{
                  minHeight: 48,
                  color: 'var(--color-ios-ink)',
                  border: '1px solid color-mix(in srgb, var(--ios-indigo-500) 45%, transparent)',
                  backgroundColor: 'color-mix(in srgb, var(--ios-indigo-500) 12%, transparent)',
                  opacity: !canValidate || isValidating ? 0.6 : 1,
                }}
              >
                {translate(language, isValidating ? 'signup.card.validateNow.busy' : 'signup.card.validateNow')}
              </button>
            </>
          ) : (
            <div className="grid gap-3" data-signup-code>
              <p className="text-caption" style={{ color: 'var(--color-ios-ink)' }}>
                {withStrongEmail(translate(language, 'signup.card.code.lead', { email: verification.email }), verification.email)}
              </p>
              <EmailCodeForm
                email={verification.email}
                next={null}
                verifyEmail={codeDeps.verifyEmail}
                verificationStatus={codeDeps.verificationStatus}
                pendingSessionToken={verification.pendingSessionToken}
                onVerified={onVerified}
                onSignedIn={onVerified}
                {...(verification.signedIn ? { onProvenElsewhere: onVerified } : {})}
                autoFocus
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** L'ENTRÉE DE LA CARTE — un ressort vif, en TRANSFORM seul ; un fondu sous
 * « Réduire les animations ». */
function useCardEntrance(card: { readonly current: HTMLElement | null }) {
  useEffect(() => {
    const element = card.current;
    if (element === null || typeof element.animate !== 'function') return;
    const animation = prefersReducedMotion()
      ? element.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' })
      : element.animate(
          [
            { opacity: 0, transform: 'translateY(14px) scale(0.97)' },
            { opacity: 1, transform: 'translateY(-2px) scale(1.01)', offset: 0.7 },
            { opacity: 1, transform: 'translateY(0) scale(1)' },
          ],
          { duration: 420, easing: 'cubic-bezier(0.22, 1.2, 0.36, 1)' },
        );
    animation.finished?.catch(() => undefined);
    return () => animation.cancel();
  }, [card]);
}

/** LE COMPTE VALIDÉ — la coche, le mot, et le feu d'artifice de l'arrivée. */
function Verified({ language }: { readonly language: InterfaceLanguage }) {
  const [reduced] = useState(prefersReducedMotion);
  const [Fireworks, setFireworks] = useState<ComponentType | null>(null);

  useEffect(() => {
    if (reduced) return;
    let alive = true;
    import('./arrival-fireworks').then(
      ({ ArrivalFireworks }) => {
        if (alive) setFireworks(() => ArrivalFireworks);
      },
      () => undefined,
    );
    return () => {
      alive = false;
    };
  }, [reduced]);

  return (
    <div data-signup-celebration data-motion={reduced ? 'reduced' : 'full'} className="relative grid justify-items-center gap-2 py-4 text-center">
      {Fireworks === null ? null : <Fireworks />}
      <span
        aria-hidden="true"
        className="relative grid place-items-center rounded-full"
        style={{ width: 64, height: 64, color: 'var(--ios-success)', background: 'color-mix(in srgb, var(--ios-success) 14%, transparent)' }}
      >
        <Glyph name="checks" size={36} />
      </span>
      <p role="status" className="relative text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'signup.card.verified')}
      </p>
      <p className="relative text-caption" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'signup.card.verified.lead')}
      </p>
    </div>
  );
}
