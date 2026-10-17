import { useEffect, useRef, useState } from 'react';

import { httpTransport } from '@/lib/api/client';
import { maskEmail } from '@/lib/api/email-mask';
import { createProvenSessionCloser, provenEmailOf, type AccountReplacement, type ProvenSessionGestures } from '@/lib/api/proven-session';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

import { Avatar } from './avatar';
import { Glyph } from './glyph';

/**
 * LA QUESTION AVANT QU'UN LIEN N'OUVRE UN AUTRE COMPTE (#10451, jumelle web de
 * #10445) — posée seulement APRÈS la preuve, quand l'id rendu n'est pas celui
 * du compte ouvert. Elle dit « un AUTRE compte », montre ce compte (avatar,
 * nom, @pseudo, adresse masquée) et le compte qu'on quitterait. « Annuler »
 * est le geste mis en avant, et le focus initial : un lien qu'on n'a pas
 * demandé se refuse d'une touche.
 */

/** Les gestes de l'appareil. Accepter charge le coffre des comptes au geste :
 * l'écran du lien ne l'embarque pas tant que personne ne répond. Refuser et
 * abandonner n'en ont pas besoin — la session prouvée se referme même quand ce
 * chargement échoue, ou que la page se décharge (#10474). */
const closer = createProvenSessionCloser(httpTransport);

export const deviceProvenSessions: ProvenSessionGestures = {
  adopt: (replacement) => import('@/lib/api/device-accounts').then(({ provenSessions }) => provenSessions.adopt(replacement)),
  ...closer,
};

export function AccountReplacementPrompt({
  language,
  replacement,
  gestures = deviceProvenSessions,
  onAdopted,
  onDiscarded,
  alreadyConfirmed = false,
}: {
  readonly language: InterfaceLanguage;
  readonly replacement: AccountReplacement;
  readonly gestures?: ProvenSessionGestures;
  readonly onAdopted: () => void;
  readonly onDiscarded: () => void;
  /** #10872 — le « oui » a déjà été donné à « Se connecter en tant que @x ? »,
   * qui nommait le compte ouvert : la question ne se repose pas. */
  readonly alreadyConfirmed?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [ending, setEnding] = useState<'failed' | 'expired' | null>(null);
  const answered = useRef(false);
  const leaving = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = replacement.current.username;

  /* Recharger, fermer l'onglet ou tuer l'appli pendant la question vaut
     « non » aussi : le démontage n'a pas lieu, la déconnexion part donc au
     `pagehide`, en keepalive (#10474). Une page rendue par le cache de pages
     (« Précédent ») ne remontre pas une question déjà refusée : elle la quitte. */
  useEffect(() => {
    let abandonedOnHide = false;
    const onPageHide = () => {
      if (answered.current) return;
      answered.current = true;
      abandonedOnHide = true;
      gestures.abandon(replacement);
    };
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted && abandonedOnHide) onDiscarded();
    };
    window.addEventListener('pagehide', onPageHide);
    window.addEventListener('pageshow', onPageShow);
    return () => {
      window.removeEventListener('pagehide', onPageHide);
      window.removeEventListener('pageshow', onPageShow);
    };
  }, [gestures, replacement, onDiscarded]);

  /* Quitter l'écran sans répondre vaut « non » : la session prouvée ne reste
     jamais ouverte côté passerelle. Le refus attend un tour, pour qu'un
     démontage suivi d'un remontage immédiat (StrictMode) ne le déclenche pas. */
  useEffect(() => {
    if (leaving.current !== null) clearTimeout(leaving.current);
    leaving.current = null;
    return () => {
      leaving.current = setTimeout(() => {
        if (answered.current) return;
        answered.current = true;
        void gestures.discard(replacement);
      }, 0);
    };
  }, [gestures, replacement]);
  const proven = replacement.proven.user;
  const shownName = proven.displayName?.trim() ?? '';
  const email = provenEmailOf(replacement.proven);

  /* Les gestes de l'appareil qui ne se chargent pas (réseau coupé, version
     déployée entre-temps) : la session ouverte n'a pas été touchée, la session
     prouvée est refermée, et la question se ferme sur un message (#10474). */
  async function adoptOrFail(): Promise<boolean | 'expired' | 'failed'> {
    try {
      return await gestures.adopt(replacement);
    } catch {
      await gestures.discard(replacement);
      return 'failed';
    }
  }

  async function answer(adopt: boolean) {
    if (answered.current) return;
    answered.current = true;
    setBusy(true);
    if (!adopt) {
      await gestures.discard(replacement);
      onDiscarded();
      return;
    }
    const opened = await adoptOrFail();
    /* Trop tard (#10513) : la session prouvée a passé sa fenêtre d'adoption,
       le compte ouvert n'a pas été touché — l'écran dit d'en demander un autre. */
    if (opened === 'failed' || opened === 'expired') {
      setEnding(opened);
      return;
    }
    if (opened) onAdopted();
    else onDiscarded();
  }

  useEffect(() => {
    if (alreadyConfirmed) void answer(true);
  }, []);

  if (ending !== null) {
    return (
      <section role="alert" className="grid gap-5 text-center">
        <Glyph name="warningCircle" size={44} className="mx-auto" style={{ color: 'var(--ios-error)' }} />
        <p style={{ color: 'var(--color-ios-ink)' }}>{translate(language, ending === 'expired' ? 'signInLink.switchAccount.expired' : 'signInLink.switchAccount.failed')}</p>
        <button
          type="button"
          data-action="leave"
          autoFocus
          onClick={onDiscarded}
          className="grid place-items-center rounded-field px-6 font-bold text-ios-on-brand focus-visible:outline-2"
          style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'signInLink.switchAccount.leave')}
        </button>
      </section>
    );
  }

  if (alreadyConfirmed) {
    return (
      <p role="status" aria-busy="true" className="text-center" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'signInLink.switchAccount.busy')}
      </p>
    );
  }

  return (
    <section role="alertdialog" aria-modal="false" aria-labelledby="account-replacement-title" aria-describedby="account-replacement-lead" className="grid gap-5 text-center">
      <Glyph name="warningCircle" size={44} className="mx-auto" style={{ color: 'var(--ios-warning)' }} />
      <h1 id="account-replacement-title" className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'signInLink.switchAccount.title')}
      </h1>
      <p id="account-replacement-lead" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'signInLink.switchAccount.lead', { current })}
      </p>

      <div
        data-proven-account={proven.username}
        className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-start"
        style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }}
      >
        <Avatar initials={initialsOf(proven.username)} color="var(--color-ios-brand)" size={52} {...(proven.avatar ? { src: proven.avatar } : {})} />
        {/* Le @pseudo d'abord (#10474) : unique et vérifié par la passerelle,
            il dit QUEL compte s'ouvrirait ; le nom affiché, que n'importe qui
            choisit (« Support Meeshy »), ne vient qu'en second. */}
        <span className="flex min-w-0 flex-1 flex-col">
          <strong data-proven-handle className="truncate text-body font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {`@${proven.username}`}
          </strong>
          {shownName === '' || shownName === proven.username ? null : (
            <span data-proven-name className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {shownName}
            </span>
          )}
          {email === null ? null : (
            <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {maskEmail(email)}
            </span>
          )}
        </span>
      </div>

      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {translate(language, 'signInLink.switchAccount.warning')}
      </p>

      <div className="grid gap-3">
        <button
          type="button"
          data-answer="cancel"
          autoFocus
          disabled={busy}
          onClick={() => void answer(false)}
          className="grid place-items-center rounded-field px-6 font-bold text-ios-on-brand focus-visible:outline-2"
          style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))', outlineColor: 'var(--color-ios-brand)' }}
        >
          {translate(language, 'signInLink.switchAccount.cancel', { current })}
        </button>
        <button
          type="button"
          data-answer="confirm"
          disabled={busy}
          aria-describedby="account-replacement-kept"
          onClick={() => void answer(true)}
          className="grid place-items-center rounded-field px-6 font-semibold focus-visible:outline-2"
          style={{
            minHeight: 44,
            border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
            color: 'var(--color-ios-ink)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {busy ? translate(language, 'signInLink.switchAccount.busy') : translate(language, 'signInLink.switchAccount.confirm')}
        </button>
        <p id="account-replacement-kept" className="text-caption" style={{ color: 'var(--color-ios-ink-3)' }}>
          {translate(language, 'signInLink.switchAccount.kept', { current })}
        </p>
      </div>
    </section>
  );
}
