import { useState } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { AdminMetaRow } from '@/components/admin/meta';
import { Sheet } from '@/components/sheet';
import { shareLinkGestures, type ShareLinkGesture } from '@/lib/admin/share-link-model';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminReach } from '@/lib/admin/use-admin-reach';
import { type AdminDeps, asRecord } from '@/lib/api/admin';
import {
  ADMIN_SHARE_LINKS_KEY,
  adminShareLinkKey,
  closeAdminShareLink,
  reopenAdminShareLink,
  revealAdminShareLink,
  type AdminShareLink,
  type AdminShareLinkSecret,
} from '@/lib/api/admin-share-links';
import type { AdminLinkAck } from '@/lib/api/admin-share-links-person';
import { translateAdmin, type AdminPlainCatalogKey, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { copyPlainText } from '@/lib/view/copy-text';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES TROIS GESTES D'UN LIEN DE PARTAGE** (#8876, #6729) — fermer, rouvrir,
 * révéler le secret. Chacun passe par `AdminConfirmSheet`, qui dit ce qui va se
 * passer : fermer retire TOUT DE SUITE les invités arrivés par ce lien ; rouvrir ne
 * les rétablit pas ; révéler remet les clés de jointure au seul créateur de la
 * plateforme, contre un motif écrit.
 *
 * **Le secret révélé n'existe que dans l'état local de ce composant** : il n'est
 * passé ni à `useQuery` ni à `setQueryData`, donc il n'entre dans aucune clé du
 * cache TanStack (et, par là, dans aucun disque). Il s'affiche UNE fois, dans une
 * feuille avec copie ; la fermer l'efface. Le message annoncé à voix haute ne le
 * porte pas.
 *
 * Fermer et rouvrir passent par `useAdminAction` (effet optimiste sur la fiche,
 * retour arrière si la passerelle refuse, refus traduit, annonce, relecture de la
 * liste et de la fiche). Hors ligne, les boutons sont désactivés.
 */
type Sheet = ShareLinkGesture | null;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const GLYPH: Readonly<Record<ShareLinkGesture, AdminGlyphName>> = { close: 'linkBreak', reopen: 'linkSimple', reveal: 'eye' };

const ANCHOR: Readonly<Record<ShareLinkGesture, string>> = { close: 'close-link', reopen: 'reopen-link', reveal: 'reveal-secret' };

const patchedActive =
  (isActive: boolean) =>
  (before: unknown): unknown => {
    const current = asRecord(before);
    return current === null ? before : { ...current, isActive };
  };

function GestureButton({ anchor, label, glyph, danger, disabled, onClick }: {
  readonly anchor: string;
  readonly label: string;
  readonly glyph: AdminGlyphName;
  readonly danger: boolean;
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-admin-action={anchor}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${FOCUS}`}
      style={{
        minHeight: 44,
        backgroundColor: 'var(--color-ios-surface)',
        color: danger ? 'var(--color-danger)' : 'var(--color-ios-ink)',
        border: '1px solid var(--color-edge)',
        outlineColor: 'var(--color-ios-brand)',
      }}
    >
      <AdminGlyph name={glyph} size={16} />
      {label}
    </button>
  );
}

/** Une clé révélée : en `code`, sous l'ancre des identifiants techniques, avec sa copie annoncée. */
function SecretRow({ language, label, value, onAnnounce }: {
  readonly language: AdminLanguage;
  readonly label: string;
  readonly value: string;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const copy = async () => {
    const outcome = await copyPlainText(value);
    onAnnounce(translateAdmin(language, outcome === 'copied' ? 'admin.shareLink.secret.copied' : 'admin.kit.copyFailed'), outcome === 'copied' ? 'neutral' : 'error');
  };

  return (
    <AdminMetaRow
      label={label}
      value={
        <span className="flex flex-wrap items-center gap-2">
          <code data-admin-technical-id className="font-mono text-caption" style={{ color: 'var(--color-ios-ink)', overflowWrap: 'anywhere' }}>
            {value}
          </code>
          <button
            type="button"
            data-admin-action="copy-secret"
            onClick={() => void copy()}
            className={`inline-flex items-center gap-1 rounded-chip px-3 text-caption font-medium ${FOCUS}`}
            style={{ minHeight: 44, color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            <AdminGlyph name="copy" size={14} />
            {translateAdmin(language, 'admin.shareLink.secret.copy')}
          </button>
        </span>
      }
    />
  );
}

function RevealedSecretSheet({ language, secret, onClose, onAnnounce }: {
  readonly language: AdminLanguage;
  readonly secret: AdminShareLinkSecret;
  readonly onClose: () => void;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
}) {
  return (
    <Sheet title={translateAdmin(language, 'admin.shareLink.secret.title')} presentation="centered" bodyAs="div" closeLabel={translateAdmin(language, 'admin.kit.close')} onClose={onClose}>
      <div data-admin-secret className="grid gap-4 px-4 pb-4 pt-2">
        <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
          {translateAdmin(language, 'admin.shareLink.secret.notice')}
        </p>
        <dl className="grid gap-3">
          <SecretRow language={language} label={translateAdmin(language, 'admin.shareLink.secret.linkId')} value={secret.linkId} onAnnounce={onAnnounce} />
          <SecretRow language={language} label={translateAdmin(language, 'admin.shareLink.secret.identifier')} value={secret.identifier} onAnnounce={onAnnounce} />
        </dl>
        <div className="flex justify-end">
          <button
            type="button"
            data-admin-action="close-secret"
            onClick={onClose}
            className={`rounded-chip px-5 text-body font-semibold text-ios-on-brand ${FOCUS}`}
            style={{ minHeight: 44, backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translateAdmin(language, 'admin.shareLink.secret.close')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}

export function ShareLinkGestures({
  language,
  link,
  reach,
  deps,
  online,
  announce,
}: {
  readonly language: AdminLanguage;
  readonly link: AdminShareLink;
  readonly reach: AdminReach;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
}) {
  const toggle = useAdminAction<AdminLinkAck>({ language, onAnnounce: announce });
  const reveal = useAdminAction<AdminShareLinkSecret>({ language, onAnnounce: announce });
  const [sheet, setSheet] = useState<Sheet>(null);
  const [secret, setSecret] = useState<AdminShareLinkSecret | null>(null);
  /* `run` ne rend la main qu'APRÈS la relecture : tant qu'elle dure, le geste est « en cours »
     pour l'écran, sans quoi un second appui partirait sur un lien que le premier vient de changer. */
  const [settling, setSettling] = useState(false);
  const running = toggle.state.phase === 'running' || reveal.state.phase === 'running' || settling;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const linkKey = adminShareLinkKey(link.id);

  const switchTo = async (next: 'close' | 'reopen') => {
    setSettling(true);
    try {
      const done = await toggle.run({
        call: () => (next === 'close' ? closeAdminShareLink({ ...deps, shareLinkId: link.id }) : reopenAdminShareLink({ ...deps, shareLinkId: link.id })),
        success: next === 'close' ? 'admin.shareLink.done.closed' : 'admin.shareLink.done.reopened',
        optimistic: { key: linkKey, apply: patchedActive(next === 'reopen') },
        invalidate: [ADMIN_SHARE_LINKS_KEY],
      });
      if (done !== null) setSheet(null);
    } finally {
      setSettling(false);
    }
  };

  const revealSecret = async (reason: string) => {
    setSettling(true);
    try {
      const revealed = await reveal.run({
        call: () => revealAdminShareLink({ ...deps, shareLinkId: link.id, reason }),
        success: 'admin.shareLink.done.revealed',
      });
      if (revealed === null) return;
      setSheet(null);
      setSecret(revealed);
    } finally {
      setSettling(false);
    }
  };

  const open = (next: ShareLinkGesture) => {
    toggle.reset();
    reveal.reset();
    setSheet(next);
  };

  const close = () => {
    toggle.reset();
    reveal.reset();
    setSheet(null);
  };

  const common = (error: string | null) => ({ language, busy: running, error, onCancel: close }) as const;
  const toggleError = toggle.state.phase === 'error' ? toggle.state.message : null;
  const revealError = reveal.state.phase === 'error' ? reveal.state.message : null;

  return (
    <>
      {shareLinkGestures(link, reach).map((gesture) => (
        <GestureButton
          key={gesture}
          anchor={ANCHOR[gesture]}
          label={t(`admin.shareLink.gesture.${gesture}`)}
          glyph={GLYPH[gesture]}
          danger={gesture === 'close'}
          disabled={!online || running}
          onClick={() => open(gesture)}
        />
      ))}
      {sheet === 'close' ? (
        <AdminConfirmSheet
          {...common(toggleError)}
          title={t('admin.shareLink.confirm.close.title')}
          body={t('admin.shareLink.confirm.close.body')}
          confirmLabel={t('admin.shareLink.gesture.close')}
          tone="danger"
          onConfirm={() => void switchTo('close')}
        />
      ) : null}
      {sheet === 'reopen' ? (
        <AdminConfirmSheet
          {...common(toggleError)}
          title={t('admin.shareLink.confirm.reopen.title')}
          body={t('admin.shareLink.confirm.reopen.body')}
          confirmLabel={t('admin.shareLink.gesture.reopen')}
          tone="primary"
          onConfirm={() => void switchTo('reopen')}
        />
      ) : null}
      {sheet === 'reveal' ? (
        <AdminConfirmSheet
          {...common(revealError)}
          title={t('admin.shareLink.confirm.reveal.title')}
          body={t('admin.shareLink.confirm.reveal.body')}
          confirmLabel={t('admin.shareLink.gesture.reveal')}
          tone="danger"
          motive={{ label: t('admin.shareLink.confirm.reveal.motive'), minLength: 10, required: true }}
          onConfirm={(motive) => void revealSecret(motive ?? '')}
        />
      ) : null}
      {secret === null ? null : <RevealedSecretSheet language={language} secret={secret} onClose={() => setSecret(null)} onAnnounce={announce} />}
    </>
  );
}
