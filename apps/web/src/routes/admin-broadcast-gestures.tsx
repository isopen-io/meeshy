import { useQueryClient } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminGlyph, type AdminGlyphName } from '@/components/admin/admin-glyph';
import { audienceSentence } from '@/lib/admin/broadcast-audience';
import { formOfBroadcast } from '@/lib/admin/broadcast-form';
import { broadcastGestures, recipientsToReach, type BroadcastGesture } from '@/lib/admin/broadcast-gestures';
import { interpretBroadcastStatus } from '@/lib/admin/interpret/enums';
import { formatCount } from '@/lib/admin/interpret/numbers';
import { useAdminAction, type AdminGesture } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_BROADCASTS_LISTS_KEY,
  adminBroadcastKey,
  adminBroadcastPreviewKey,
  deleteAdminBroadcast,
  prepareAdminBroadcast,
  publishAdminBroadcastInApp,
  sendAdminBroadcast,
  updateAdminBroadcast,
  type AdminBroadcast,
  type AdminBroadcastAck,
  type AdminBroadcastBody,
  type AdminBroadcastPreview,
} from '@/lib/api/admin-broadcasts';
import { translateAdmin, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

import { BroadcastComposerSheet } from './admin-broadcast-compose';

/**
 * **LES GESTES D'UNE DIFFUSION** (#8876, #6731) — préparer (traduire), modifier,
 * envoyer par e-mail, publier dans l'application, supprimer. Chacun passe par
 * `useAdminAction` (effet optimiste quand l'état se lit localement, retour en
 * arrière si la passerelle refuse, refus traduit, annonce à voix haute,
 * relecture de la fiche, de la liste et du tableau de bord) ; tous, sauf
 * « Modifier » qui a sa propre feuille, passent par `AdminConfirmSheet`, qui DIT
 * ce qui va se passer — y compris l'effet de bord de la préparation, qui change le
 * statut et ferme la modification.
 *
 * Hors ligne, les gestes sont désactivés : le cache reste lisible, rien ne part.
 * Une diffusion prête qui ne vise personne n'offre ni envoi ni publication : un
 * envoi à zéro compte passerait la diffusion à « Envoyée » sans rien envoyer.
 */
type Sheet = BroadcastGesture;

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const GLYPH: Readonly<Record<BroadcastGesture, AdminGlyphName>> = {
  edit: 'pencilSimple',
  prepare: 'translate',
  send: 'paperPlaneTilt',
  publishInApp: 'megaphone',
  delete: 'trash',
};

const VARIANT: Readonly<Record<BroadcastGesture, 'primary' | 'secondary' | 'danger'>> = {
  edit: 'secondary',
  prepare: 'primary',
  send: 'primary',
  publishInApp: 'secondary',
  delete: 'danger',
};

/** Ce que chaque geste invalide en plus de la fiche : la liste et le tableau de bord du hub (`['admin', 'dash']`, préfixe du lot « tableau de bord »). */
const QUEUE_KEYS = [ADMIN_BROADCASTS_LISTS_KEY, ['admin', 'dash']] as const;

function GestureButton({
  anchor,
  label,
  variant,
  disabled,
  onClick,
}: {
  readonly anchor: BroadcastGesture;
  readonly label: string;
  readonly variant: 'primary' | 'secondary' | 'danger';
  readonly disabled: boolean;
  readonly onClick: () => void;
}) {
  const primary = variant === 'primary';
  const style = primary
    ? { backgroundColor: 'var(--color-ios-brand)', border: '1px solid transparent' }
    : { backgroundColor: 'var(--color-ios-surface)', color: variant === 'danger' ? 'var(--color-danger)' : 'var(--color-ios-ink)', border: '1px solid var(--color-edge)' };
  return (
    <button
      type="button"
      data-admin-action={anchor}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-semibold disabled:opacity-40 ${primary ? 'text-ios-on-brand' : ''} ${FOCUS}`}
      style={{ minHeight: 44, outlineColor: 'var(--color-ios-brand)', ...style }}
    >
      <AdminGlyph name={GLYPH[anchor]} size={16} />
      {label}
    </button>
  );
}

/** Une fiche en cache, reconnue structurellement : l'effet optimiste ne touche jamais autre chose qu'une fiche déjà lue. */
const isBroadcast = (value: unknown): value is AdminBroadcast =>
  typeof value === 'object' && value !== null && 'status' in value && 'translations' in value && 'inAppSentCount' in value;

const patched =
  (patch: Partial<AdminBroadcast>) =>
  (before: unknown): unknown =>
    isBroadcast(before) ? { ...before, ...patch } : before;

export function BroadcastGestures({
  language,
  broadcast,
  preview,
  deps,
  online,
  now,
  announce,
  onDeleted,
}: {
  readonly language: InterfaceLanguage;
  readonly broadcast: AdminBroadcast;
  readonly preview: AdminBroadcastPreview | undefined;
  readonly deps: AdminDeps;
  readonly online: boolean;
  readonly now: () => Date;
  readonly announce: (message: string, tone?: AnnouncementTone) => void;
  readonly onDeleted: () => void;
}) {
  const queryClient = useQueryClient();
  const acknowledge = useAdminAction<AdminBroadcastAck>({ language, onAnnounce: announce });
  const prepareAction = useAdminAction<AdminBroadcastPreview>({ language, onAnnounce: announce });
  const [sheet, setSheet] = useState<Sheet | null>(null);
  /* `run` ne rend la main qu'APRÈS la relecture des listes : tant qu'elle dure, le
     geste est « en cours » pour l'écran, sans quoi un second appui partirait sur
     une diffusion que le premier vient de changer. */
  const [settling, setSettling] = useState(false);
  const active = sheet === 'prepare' ? prepareAction.state : acknowledge.state;
  const running = active.phase === 'running' || settling;
  const error = active.phase === 'error' ? active.message : null;
  const t = (key: AdminPlainCatalogKey) => translateAdmin(language, key);
  const ficheKey = adminBroadcastKey(broadcast.id);

  const settle = async <Result,>(run: () => Promise<Result | null>): Promise<Result | null> => {
    setSettling(true);
    try {
      return await run();
    } finally {
      setSettling(false);
    }
  };

  const perform = (gesture: AdminGesture<AdminBroadcastAck>) => settle(() => acknowledge.run(gesture));

  const reachable = recipientsToReach(broadcast, preview);
  const audience = audienceSentence(broadcast.targeting, language);
  const blocked = broadcast.status === 'READY' && reachable === 0;

  const prepare = async () => {
    const prepared = await settle(() =>
      prepareAction.run({
        call: () => prepareAdminBroadcast({ ...deps, broadcastId: broadcast.id }),
        success: 'admin.broadcast.done.prepared',
        invalidate: [ficheKey, ...QUEUE_KEYS],
      }),
    );
    if (prepared === null) {
      /* La traduction a pu finir côté passerelle malgré un délai dépassé côté client : on relit la fiche pour ne pas afficher un brouillon qui est déjà prêt. */
      void queryClient.invalidateQueries({ queryKey: ficheKey });
      return;
    }
    queryClient.setQueryData(adminBroadcastPreviewKey(broadcast.id), prepared);
    setSheet(null);
  };

  const send = async () => {
    const done = await perform({
      call: () => sendAdminBroadcast({ ...deps, broadcastId: broadcast.id }),
      success: 'admin.broadcast.done.sent',
      optimistic: { key: ficheKey, apply: patched({ status: 'SENDING', sentAt: now().toISOString() }) },
      invalidate: [ficheKey, ...QUEUE_KEYS],
    });
    if (done !== null) setSheet(null);
  };

  const publishInApp = async () => {
    const done = await perform({
      call: () => publishAdminBroadcastInApp({ ...deps, broadcastId: broadcast.id }),
      success: 'admin.broadcast.done.inApp',
      optimistic: { key: ficheKey, apply: patched({ inAppSentAt: now().toISOString(), inAppCompletedAt: null, inAppSentCount: 0, inAppFailedCount: 0 }) },
      invalidate: [ficheKey, ...QUEUE_KEYS],
    });
    if (done !== null) setSheet(null);
  };

  const remove = async () => {
    const done = await perform({
      call: () => deleteAdminBroadcast({ ...deps, broadcastId: broadcast.id }),
      success: 'admin.broadcast.done.deleted',
      invalidate: [...QUEUE_KEYS],
    });
    if (done === null) return;
    setSheet(null);
    onDeleted();
  };

  const edit = async (body: AdminBroadcastBody) => {
    const done = await perform({
      call: () => updateAdminBroadcast({ ...deps, broadcastId: broadcast.id, body }),
      success: 'admin.broadcast.done.updated',
      invalidate: [ficheKey, ...QUEUE_KEYS],
    });
    if (done !== null) setSheet(null);
  };

  const close = () => {
    acknowledge.reset();
    prepareAction.reset();
    setSheet(null);
  };

  const open = (next: Sheet) => {
    acknowledge.reset();
    prepareAction.reset();
    setSheet(next);
  };

  const count = formatCount(reachable, language);
  const common = { language, busy: running, error, onCancel: close } as const;

  const sheetFor = (kind: Sheet): ReactNode => {
    switch (kind) {
      case 'edit':
        return <BroadcastComposerSheet language={language} mode="edit" initial={formOfBroadcast(broadcast)} busy={running} error={error} onSubmit={(body) => void edit(body)} onCancel={close} />;
      case 'prepare':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.broadcast.confirm.prepare.title')}
            body={translateAdmin(language, 'admin.broadcast.confirm.prepare.body', { status: interpretBroadcastStatus('READY', language).label })}
            confirmLabel={t('admin.broadcast.confirm.prepare.confirm')}
            tone="primary"
            onConfirm={() => void prepare()}
          />
        );
      case 'send':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.broadcast.confirm.send.title')}
            body={translateAdmin(language, 'admin.broadcast.confirm.send.body', { audience, count })}
            confirmLabel={t('admin.broadcast.confirm.send.confirm')}
            tone="primary"
            onConfirm={() => void send()}
          />
        );
      case 'publishInApp':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.broadcast.confirm.inApp.title')}
            body={translateAdmin(language, 'admin.broadcast.confirm.inApp.body', { audience, count })}
            confirmLabel={t('admin.broadcast.confirm.inApp.confirm')}
            tone="primary"
            onConfirm={() => void publishInApp()}
          />
        );
      case 'delete':
        return (
          <AdminConfirmSheet
            {...common}
            title={t('admin.broadcast.confirm.delete.title')}
            body={t(broadcast.inAppSentAt === null ? 'admin.broadcast.confirm.delete.body' : 'admin.broadcast.confirm.delete.bodyPublished')}
            confirmLabel={t('admin.broadcast.confirm.delete.confirm')}
            tone="danger"
            onConfirm={() => void remove()}
          />
        );
    }
  };

  const label = (gesture: BroadcastGesture): string => {
    switch (gesture) {
      case 'send':
        return reachable === 1 ? t('admin.broadcast.gesture.send.one') : translateAdmin(language, 'admin.broadcast.gesture.send.many', { count });
      case 'edit':
        return t('admin.broadcast.gesture.edit');
      case 'prepare':
        return t('admin.broadcast.gesture.prepare');
      case 'publishInApp':
        return t('admin.broadcast.gesture.publishInApp');
      case 'delete':
        return t('admin.broadcast.gesture.delete');
    }
  };

  const offered = broadcastGestures(broadcast);

  return (
    <>
      {offered.map((gesture) => (
        <GestureButton
          key={gesture}
          anchor={gesture}
          label={label(gesture)}
          variant={VARIANT[gesture]}
          disabled={!online || running || (blocked && (gesture === 'send' || gesture === 'publishInApp'))}
          onClick={() => open(gesture)}
        />
      ))}
      {sheet === null ? null : sheetFor(sheet)}
    </>
  );
}
