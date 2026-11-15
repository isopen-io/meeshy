import { useEffect, useState } from 'react';

import { loadSessionsCatalog, sessionsTextOf } from '@/lib/i18n-sessions-catalog';
import { appInstitutionalHref } from '@/lib/institutional-href';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { sessionEnd as defaultMemory, type SessionEndReason } from '@/lib/session-end';

/**
 * **L'EXPLICATION D'UNE SESSION FERMÉE** (#9613) — en tête de l'écran de
 * connexion, UNE fois, quand la session précédente a été fermée sans que le
 * lecteur l'ait demandé ici. Fermée par l'administration, elle dit « par
 * l'équipe Meeshy » et offre de contacter l'équipe — jamais le nom d'un
 * administrateur, que le serveur ne transmet pas. « Compris » la congédie.
 *
 * Chargée par `import()` depuis la connexion (`routes/login.tsx`) : ni elle ni
 * son catalogue ne pèsent sur la première peinture ni sur la connexion d'un
 * lecteur qui n'a rien à apprendre.
 */

type Memory = { readonly pending: () => SessionEndReason | null; readonly dismiss: () => void };

const BODY = {
  admin_revoke: 'sessionEnd.admin_revoke',
  user_revoke: 'sessionEnd.user_revoke',
  password_changed: 'sessionEnd.password_changed',
  logout: 'sessionEnd.logout',
  logout_all_devices: 'sessionEnd.logout_all_devices',
  session_expired: 'sessionEnd.session_expired',
} as const satisfies Readonly<Record<SessionEndReason, string>>;

export function SessionEndNotice({ language, memory = defaultMemory }: { readonly language: InterfaceLanguage; readonly memory?: Memory }) {
  const [reason, setReason] = useState<SessionEndReason | null>(() => memory.pending());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (reason === null) return undefined;
    let live = true;
    void loadSessionsCatalog(language).then(
      () => live && setReady(true),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [reason, language]);

  if (reason === null || !ready) return null;
  const t = sessionsTextOf(language);
  const dismiss = () => {
    memory.dismiss();
    setReason(null);
  };

  return (
    <section
      role="alert"
      data-session-end={reason}
      className="grid w-full gap-2 rounded-card p-4"
      style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)' }}
    >
      <h2 className="text-body font-semibold">{t('sessionEnd.title')}</h2>
      <p className="text-caption">{t(BODY[reason])}</p>
      {reason === 'admin_revoke' ? <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>{t('sessionEnd.admin_revoke.help')}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {reason === 'admin_revoke' ? (
          <a
            href={appInstitutionalHref('contact')}
            data-session-end-contact
            className="inline-flex items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2"
            style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {t('sessionEnd.contact')}
          </a>
        ) : null}
        <button
          type="button"
          data-session-end-dismiss
          onClick={dismiss}
          className="inline-flex items-center rounded-chip px-3 text-caption font-semibold focus-visible:outline-2"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)', border: '1px solid var(--color-edge)' }}
        >
          {t('sessionEnd.ok')}
        </button>
      </div>
    </section>
  );
}

export default SessionEndNotice;
