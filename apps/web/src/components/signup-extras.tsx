import { useState } from 'react';

import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import { PasswordInput } from '@/components/password-input';
import { inviterName, validateReferralCode, type ReferralValidation } from '@/lib/api/affiliate';
import type { ApiResult } from '@/lib/api/http';
import { PASSWORD_MIN } from '@/lib/signup-form';
import { isReferralCodeShaped, normalizeReferralCode, referralCodeFromLocation } from '@/lib/view/referral-code';
import { recallReferralCode, rememberReferralCode } from '@/lib/view/referral-memory';

/**
 * CE QUE L'INSCRIPTION PORTE EN PLUS DE L'IDENTITÉ — le mot de passe
 * facultatif (#7897) et le code de parrainage (#6584). Extraits de
 * `routes/signup.tsx` par le réagencement en phases (#8288), sans rien
 * changer à leur loi.
 */

/**
 * L'ACCENT DES ACTIONS EN TEXTE — indigo, un pas de rampe par schéma (revue
 * de #5555, défaut 10) : `indigo500` sur la carte tombe sous AA en petit texte
 * dans les DEUX schémas ; `indigo400` en sombre et `indigo600` en clair rendent
 * 6,24:1 et 5,93:1. En CLASSE : le choix dépend du SCHÉMA, qu'un attribut
 * `style` ne sait pas lire.
 */
export const INDIGO_LINK = 'text-[color:var(--ios-indigo-400)] light:text-[color:var(--ios-indigo-600)]';

/** Le bord d'un champ AU FOCUS — `indigo500` à 60 %, `SignupView.swift`. */
export const INDIGO_TINT = 'var(--ios-indigo-500)';

/**
 * « POURQUOI METTRE UN MOT DE PASSE MAINTENANT ? » (#7897) — une ligne
 * discrète qui se déplie. Le détail reste dans le DOM replié (`hidden`) : il
 * ne se lit qu'à la demande, sans surcharger l'écran (#6441).
 */
function PasswordWhy() {
  const [isOpen, setOpen] = useState(false);
  return (
    <div className="grid" data-signup-password-why>
      <button
        type="button"
        onClick={() => setOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls="signup-password-why"
        className={`inline-flex items-center gap-1 justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
        style={{ minHeight: 44 }}
      >
        Pourquoi mettre un mot de passe maintenant ?
        <Glyph name="caretDown" size={12} style={{ transform: isOpen ? 'rotate(180deg)' : undefined, transition: 'transform 0.2s' }} />
      </button>
      <p id="signup-password-why" hidden={!isOpen} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        Vous pouvez activer votre mot de passe dès maintenant si vous le souhaitez. Sans mot de passe, vous vous
        connecterez toujours à partir d’un e-mail reçu dans votre boîte.
      </p>
    </div>
  );
}

/**
 * LE MOT DE PASSE — il s'active quand l'identité est définie (#7897) et ne
 * s'annonce pas « facultatif » (#6582) : le bouton actif sans lui le prouve.
 * Le bord vert d'un mot de passe qui tient la borne garde sa phrase (règle 17 :
 * jamais la couleur seule).
 */
export function SignupPasswordBlock({
  password,
  onPassword,
  focused,
  onFocus,
  onBlur,
  isStrong,
  error,
}: {
  readonly password: string;
  readonly onPassword: (value: string) => void;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
  readonly isStrong: boolean;
  readonly error: string | undefined;
}) {
  return (
    <div className="grid gap-1" data-signup-password-block>
      <Field id="signup-password" label="Mot de passe" tint={INDIGO_TINT} focused={focused} valid={isStrong} error={error}>
        {({ id, describedBy }) => (
          <PasswordInput
            id={id}
            autoComplete="new-password"
            value={password}
            onValue={onPassword}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={`${PASSWORD_MIN} caractères minimum`}
            describedBy={describedBy}
            invalid={error !== undefined}
          />
        )}
      </Field>
      {isStrong ? (
        <p role="status" className="text-caption" style={{ color: 'var(--color-success)' }}>
          Votre compte sera actif immédiatement.
        </p>
      ) : null}
      <PasswordWhy />
    </div>
  );
}

/**
 * CE QU'ON SAIT DU CODE DE PARRAINAGE (#6584) — et `idle` recouvre DEUX
 * silences qu'il serait faux de distinguer : « on n'a pas encore demandé » et
 * « le réseau n'a pas répondu ». Un code n'est pas refusé parce que la requête
 * a échoué.
 */
type ReferralStatus =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'valid'; readonly inviter: string }
  | { readonly kind: 'invalid' };

/** La vérification, INJECTABLE — le témoin atteint les trois verdicts sans
 * parler à une passerelle (même dispositif que `MagicLinkPanel`, #6404). */
export type SignupReferralDeps = { readonly validate: (code: string) => Promise<ApiResult<ReferralValidation>> };

export const defaultReferralDeps: SignupReferralDeps = { validate: (code) => validateReferralCode(code) };

/**
 * LE PARRAINAGE — l'adresse D'ABORD, la MÉMOIRE ensuite (#6584). Un nouveau
 * lien remplace un ancien, jamais l'inverse ; le bloc s'ouvre SEUL quand un
 * code est connu, et reste replié sinon (#6441).
 */
export function useSignupReferral(deps: SignupReferralDeps) {
  const [code, setCode] = useState(() => {
    const fromAddress = referralCodeFromLocation();
    if (fromAddress !== '') {
      rememberReferralCode(fromAddress);
      return fromAddress;
    }
    return recallReferralCode();
  });
  const [isOpen, setOpen] = useState(() => code !== '');
  const [status, setStatus] = useState<ReferralStatus>({ kind: 'idle' });

  async function check() {
    const normalized = normalizeReferralCode(code);
    if (!isReferralCodeShaped(normalized)) {
      setStatus({ kind: 'idle' });
      return;
    }
    setStatus({ kind: 'checking' });
    const result = await deps.validate(normalized);
    if (!result.ok) {
      setStatus({ kind: 'idle' });
      return;
    }
    setStatus(result.data.isValid ? { kind: 'valid', inviter: inviterName(result.data) } : { kind: 'invalid' });
  }

  return {
    code,
    isOpen,
    status,
    open: () => setOpen(true),
    type: (value: string) => {
      setCode(value);
      setStatus({ kind: 'idle' });
    },
    check,
  };
}

export type SignupReferral = ReturnType<typeof useSignupReferral>;

/**
 * LE CODE DE PARRAINAGE (#6584) — REPLIÉ, et c'est le point. Un refus n'est
 * pas rendu en `--ios-error` ni en `role="alert"` : ce n'est PAS un refus
 * d'inscription — le compte se crée, seule la relation est perdue.
 */
export function SignupReferralBlock({
  referral,
  focused,
  onFocus,
  onBlur,
}: {
  readonly referral: SignupReferral;
  readonly focused: boolean;
  readonly onFocus: () => void;
  readonly onBlur: () => void;
}) {
  if (!referral.isOpen) {
    return (
      <button
        type="button"
        data-signup-referral-toggle
        onClick={referral.open}
        className={`inline-flex items-center justify-self-start text-caption font-semibold ${INDIGO_LINK}`}
        style={{ minHeight: 44 }}
      >
        J’ai un code de parrainage
      </button>
    );
  }
  const { status } = referral;
  return (
    <div className="grid gap-1">
      <Field id="signup-referral" label="Code de parrainage" tint={INDIGO_TINT} focused={focused} valid={status.kind === 'valid'}>
        {({ id, describedBy }) => (
          <input
            id={id}
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={referral.code}
            onInput={(e) => referral.type(e.currentTarget.value)}
            onFocus={onFocus}
            onBlur={() => {
              onBlur();
              void referral.check();
            }}
            placeholder="Le code reçu de la personne qui vous invite"
            className="w-full bg-transparent py-3 text-input outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
            aria-describedby={describedBy}
          />
        )}
      </Field>
      <p
        data-signup-referral-status={status.kind}
        role="status"
        className="text-caption"
        style={{ color: status.kind === 'valid' ? 'var(--color-success)' : 'var(--color-ios-ink-2)' }}
      >
        {status.kind === 'valid'
          ? `${status.inviter} vous a invité — vous serez rattaché à son parrainage.`
          : status.kind === 'invalid'
            ? 'Ce code n’est plus valable. Vous pouvez créer votre compte sans lui.'
            : status.kind === 'checking'
              ? 'Vérification du code…'
              : 'Vous pouvez laisser ce champ vide.'}
      </p>
    </div>
  );
}
