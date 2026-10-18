import { useState } from 'react';

import type { LinkQuestion } from '@/lib/api/link-confirmation';
import type { SessionUser } from '@/lib/api/session';
import { translate } from '@/lib/i18n-catalog';
import { translateSignInLink } from '@/lib/i18n-sign-in-link-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

import { Avatar } from './avatar';
import { Glyph } from './glyph';

/**
 * « SE CONNECTER EN TANT QUE @x ? » (#10872) — la question d'un lien de
 * connexion ouvert sur un autre appareil que celui qui l'a demandé, ou forgé
 * par un tiers. Aucune session n'existe encore : « Annuler » ne coûte rien, et
 * c'est lui qui a le focus — un lien qu'on n'a pas demandé se refuse d'une
 * touche. Si un autre compte est ouvert, la question le dit : y répondre « oui »
 * vaut aussi le choix de le quitter.
 *
 * #10879 — l'adresse en jeu s'affiche MASQUÉE par la passerelle (deux comptes
 * qui imitent le même nom ne partagent pas l'adresse) ; et le oui d'une
 * REVENDICATION (#8214), qui rattache cette adresse au compte, le dit en
 * toutes lettres — bouton compris.
 */
export function LinkSignInConfirmation({
  language,
  question,
  current,
  onConfirm,
  onCancel,
}: {
  readonly language: InterfaceLanguage;
  readonly question: LinkQuestion;
  readonly current: SessionUser | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const { account, maskedEmail } = question;
  const claims = question.intent === 'claim-email';
  const shownName = account.displayName?.trim() ?? '';

  function answer(confirm: boolean) {
    if (busy) return;
    setBusy(true);
    if (confirm) onConfirm();
    else onCancel();
  }

  return (
    <section role="alertdialog" aria-modal="false" aria-labelledby="link-sign-in-title" aria-describedby={claims ? 'link-sign-in-lead link-sign-in-claim' : 'link-sign-in-lead'} className="grid gap-5 text-center">
      <Glyph name="warningCircle" size={44} className="mx-auto" style={{ color: 'var(--ios-warning)' }} />
      <h1 id="link-sign-in-title" className="text-screen font-bold" style={{ color: 'var(--color-ios-ink)' }}>
        {translateSignInLink(language, 'signInLink.confirm.title', { username: account.username })}
      </h1>
      <p id="link-sign-in-lead" style={{ color: 'var(--color-ios-ink-2)' }}>
        {current === null
          ? translateSignInLink(language, 'signInLink.confirm.lead')
          : translateSignInLink(language, 'signInLink.confirm.leadSignedIn', { current: current.username })}
      </p>

      <div
        data-link-account={account.username}
        className="flex items-center gap-3 rounded-[14px] px-4 py-3 text-start"
        style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }}
      >
        <Avatar initials={initialsOf(account.username)} color="var(--color-ios-brand)" size={52} {...(account.avatar ? { src: account.avatar } : {})} />
        <span className="flex min-w-0 flex-1 flex-col">
          <strong className="truncate text-body font-bold" style={{ color: 'var(--color-ios-ink)' }}>
            {`@${account.username}`}
          </strong>
          {shownName === '' || shownName === account.username ? null : (
            <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {shownName}
            </span>
          )}
          {maskedEmail === null ? null : (
            <span data-link-email dir="ltr" className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {maskedEmail}
            </span>
          )}
        </span>
      </div>

      {claims ? (
        <p id="link-sign-in-claim" data-link-claim className="font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
          {translateSignInLink(language, 'signInLink.confirm.claim', { username: account.username })}
        </p>
      ) : null}

      <div className="grid gap-3">
        <button
          type="button"
          data-answer="confirm"
          disabled={busy}
          onClick={() => answer(true)}
          className="grid place-items-center rounded-field px-6 font-bold text-ios-on-brand focus-visible:outline-2"
          style={{ minHeight: 52, background: 'linear-gradient(90deg, var(--ios-indigo-600), var(--ios-indigo-400))', outlineColor: 'var(--color-ios-brand)' }}
        >
          {busy ? translate(language, 'signInLink.switchAccount.busy') : translateSignInLink(language, claims ? 'signInLink.confirm.acceptClaim' : 'signInLink.confirm.accept')}
        </button>
        <button
          type="button"
          data-answer="cancel"
          autoFocus
          disabled={busy}
          onClick={() => answer(false)}
          className="grid place-items-center rounded-field px-6 font-semibold focus-visible:outline-2"
          style={{
            minHeight: 44,
            border: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 60%, transparent)',
            color: 'var(--color-ios-ink)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {translateSignInLink(language, 'signInLink.confirm.cancel')}
        </button>
      </div>
    </section>
  );
}
