import { useState, type ReactNode } from 'react';

import { auth } from '@/lib/api/auth';
import { isEmailValid } from '@/lib/signup-form';
import { useOnline } from '@/lib/net/online';
import { secondClock, type IntervalClock } from '@/lib/view/interval-clock';
import {
  formatCountdown,
  resolveMagicLinkRequest,
  spokenCountdown,
  type MagicLinkDeadline,
  type MagicLinkRequestOutcome,
} from '@/lib/view/magic-link';
import { useCountdown } from '@/lib/view/use-countdown';

import { AuthSubmitButton } from './auth-chrome';
import { Field } from './field';
import { Glyph, GlyphSvg } from './glyph';
import { AUTH_GLYPHS } from './glyphs-auth';

/**
 * LE PANNEAU DU LIEN MAGIQUE — la saisie, l'envoi, l'attente et le renvoi,
 * SANS aucun chrome de page (#6404).
 *
 * **Pourquoi il est extrait de `magic-link-flow.tsx`.** Le lien magique devient
 * la porte PAR DÉFAUT de `/login` (directive porteur 2026-09-13 : « connexion
 * par magic link comme connexion par défaut pour le moment »), et il garde son
 * écran plein à `/auth/magic-link` — l'adresse que l'e-mail vise
 * (`MagicLinkService.ts:548`) et que les liens existants ouvrent. DEUX hôtes,
 * UN comportement : recopier la machine (état, compte à rebours, renvoi,
 * erreurs) dans l'écran de connexion en aurait fait deux, qui auraient dérivé
 * au premier correctif — la jumelle que ce dépôt nomme partout.
 *
 * Ce qui reste à l'HÔTE : le titre, l'en-tête, le pied, et ce que « Annuler »
 * signifie chez lui (fermer l'écran plein, ou revenir à la saisie sur
 * `/login`). Ce qui vit ICI : tout ce qui a un état.
 */

export type MagicLinkPanelDeps = {
  readonly request: typeof auth.requestMagicLink;
  readonly clock: IntervalClock;
  readonly now: () => number;
};

export const defaultMagicLinkDeps: MagicLinkPanelDeps = {
  request: auth.requestMagicLink,
  clock: secondClock,
  now: () => Date.now(),
};

const MAGIC_LINK_SUBMIT_GRADIENT = 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))';

const OUTCOME_FIELD_ERROR = 'Adresse e-mail invalide';

/**
 * CE QUE LA PASSERELLE NE DIT PAS, ET QUE L'ÉCRAN DOIT DIRE (#6404).
 *
 * `POST /auth/magic-link/request` rend 200 même pour une adresse inconnue
 * (`MagicLinkService.ts:133-137`, anti-énumération) : l'écran ne peut donc ni
 * promettre que l'e-mail part, ni démentir. Ce qu'il PEUT faire, c'est nommer
 * la première cause d'un e-mail « jamais reçu » — le dossier indésirables — et
 * dire au bout de combien de temps s'inquiéter. La directive porteur le
 * demande mot pour mot : « préciser dans l'interface de regarder les spams si
 * aucun e-mail ne parvient dans la minute ».
 */
const SPAM_HINT = 'Rien reçu après une minute ? Regardez vos indésirables (spam) — le message peut y être tombé.';

function bannerFor(outcome: MagicLinkRequestOutcome | null): string | null {
  if (outcome === null) return null;
  if (outcome.kind === 'rate-limited') return 'Trop de demandes — réessayez dans une heure.';
  if (outcome.kind === 'offline') return 'Pas de connexion. Vérifiez votre réseau et réessayez.';
  if (outcome.kind === 'failed') return outcome.message;
  return null;
}

export type MagicLinkPanelProps = {
  readonly deps?: MagicLinkPanelDeps;
  /** Ce que rend l'hôte SOUS le formulaire de saisie — l'autre porte, un lien
   * légal, rien. Jamais rendu pendant l'attente : à cet instant, l'écran ne
   * propose qu'une chose, ouvrir sa boîte mail. */
  readonly footer?: ReactNode;
  /** Ce que « Annuler » fait chez l'hôte, EN PLUS de revenir à la saisie. */
  readonly onCancel?: () => void;
  /** Le champ prend le focus au montage — vrai sur l'écran plein, faux quand le
   * panneau partage `/login` avec d'autres contrôles (voler le focus y
   * déplacerait le défilement sans que personne ne l'ait demandé). */
  readonly autoFocus?: boolean;
};

export function MagicLinkPanel({ deps = defaultMagicLinkDeps, footer, onCancel, autoFocus = false }: MagicLinkPanelProps) {
  const online = useOnline();
  const [step, setStep] = useState<'input' | 'waiting'>('input');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [outcome, setOutcome] = useState<MagicLinkRequestOutcome | null>(null);
  const [deadline, setDeadline] = useState<MagicLinkDeadline | null>(null);
  const [focused, setFocused] = useState(false);

  const remaining = useCountdown(deadline, deps.clock, deps.now);
  const locale = typeof document === 'object' ? document.documentElement.lang || 'fr' : 'fr';

  async function send() {
    if (!isEmailValid(email) || submitting || !online) return;
    setSubmitting(true);
    setOutcome(null);
    const result = await deps.request({ email });
    setSubmitting(false);
    const resolved = resolveMagicLinkRequest(result);
    if (resolved.kind === 'sent') {
      setDeadline({ startedAt: deps.now(), expiresInSeconds: resolved.expiresInSeconds });
      setStep('waiting');
      return;
    }
    setOutcome(resolved);
  }

  function cancel() {
    setStep('input');
    setOutcome(null);
    onCancel?.();
  }

  const fieldError = outcome?.kind === 'invalid-email' ? OUTCOME_FIELD_ERROR : undefined;
  const banner = bannerFor(outcome);

  if (step === 'waiting') {
    const expired = deadline !== null && remaining <= 0;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
        <div
          aria-hidden="true"
          className="grid place-items-center rounded-full"
          style={{ width: 120, height: 120, backgroundColor: 'color-mix(in srgb, var(--ios-indigo-600) 10%, transparent)' }}
        >
          <Glyph name="envelopeOpen" size={48} style={{ color: 'var(--ios-indigo-500)' }} />
        </div>

        <h2 className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
          Lien envoyé !
        </h2>
        <p style={{ color: 'var(--color-ios-ink-2)' }}>
          Un lien de connexion a été envoyé à <strong style={{ color: 'var(--ios-indigo-400)' }}>{email}</strong>
        </p>

        {expired ? (
          <p role="alert" style={{ color: 'var(--ios-error)' }}>
            Lien expiré, renvoyez-en un nouveau
          </p>
        ) : (
          <>
            <p style={{ color: 'var(--color-ios-ink-2)' }}>Ouvrez votre email et cliquez sur le lien</p>
            <p
              role="timer"
              aria-live="off"
              aria-label={`Le lien expire dans ${spokenCountdown(remaining, locale)}`}
              className="font-bold tabular-nums text-screen"
              style={{ color: 'var(--ios-indigo-600)' }}
            >
              {formatCountdown(remaining, locale)}
            </p>
          </>
        )}

        {/* LES INDÉSIRABLES — voir `SPAM_HINT`. Toujours présent pendant
            l'attente, jamais derrière un (i) : c'est le seul endroit où
            l'utilisateur attend quelque chose qui peut ne jamais paraître. */}
        <p data-magic-link-spam-hint className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {SPAM_HINT}
        </p>

        <button
          type="button"
          disabled={(!expired && remaining > 0) || submitting || !online}
          aria-label="Renvoyer le lien magique"
          onClick={send}
          className="inline-flex items-center gap-2 font-semibold text-title"
          style={{ minHeight: 44, color: expired ? 'var(--ios-indigo-400)' : 'var(--color-ios-ink-2)' }}
        >
          <GlyphSvg glyph={AUTH_GLYPHS.arrowClockwise} size={18} />
          Renvoyer
        </button>

        <button
          type="button"
          onClick={cancel}
          className="text-title font-medium"
          style={{ minHeight: 44, color: 'var(--color-ios-ink-2)' }}
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
      className="flex flex-1 flex-col content-center justify-center gap-6 px-8"
      noValidate
    >
      <span aria-hidden="true" className="mx-auto" style={{ color: 'var(--ios-indigo-500)' }}>
        <GlyphSvg glyph={AUTH_GLYPHS.magicWand} size={56} />
      </span>

      <h2 className="text-center text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        Entrez votre adresse email
      </h2>
      <p className="text-center text-title" style={{ color: 'var(--color-ios-ink-2)' }}>
        Nous vous enverrons un lien de connexion sécurisé
      </p>

      <Field id="magic-link-email" glyph={AUTH_GLYPHS.envelope} tint="var(--ios-indigo-400)" focused={focused} error={fieldError}>
        {({ id, describedBy }) => (
          <input
            id={id}
            aria-describedby={describedBy}
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            autoFocus={autoFocus}
            value={email}
            onInput={(e) => setEmail(e.currentTarget.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="nom@exemple.com"
            aria-label="Adresse email"
            className="w-full bg-transparent py-3 text-input outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        )}
      </Field>

      {banner !== null ? (
        <p role="alert" className="text-center text-caption" style={{ color: 'var(--ios-error)' }}>
          {banner}
        </p>
      ) : null}

      <AuthSubmitButton
        disabled={!isEmailValid(email) || !online}
        isSubmitting={submitting}
        label="Envoyer le lien magique"
        busyLabel="Envoi…"
        background={MAGIC_LINK_SUBMIT_GRADIENT}
      />

      {footer}
    </form>
  );
}
