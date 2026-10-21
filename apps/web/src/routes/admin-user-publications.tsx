import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';

import { AdminGlyph } from '@/components/admin/admin-glyph';
import { AdminBadge } from '@/components/admin/badges';
import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { AdminSkeleton } from '@/components/admin/states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '@/components/admin/tone';
import { interpretEnum } from '@/lib/admin/interpret/enums';
import type { AdminTone } from '@/lib/admin/interpret/types';
import { adminDate } from '@/lib/admin/interpret/time';
import { applyGestureToPage } from '@/lib/admin/publication-gestures';
import { useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import {
  ADMIN_PUBLICATIONS_BATCH_MAX,
  ADMIN_PUBLICATIONS_PAGE_SIZE,
  adminUserPublicationsQueryKey,
  loadAdminUserPublications,
  moderateAdminUserPublications,
  type AdminPublication,
  type AdminPublicationGesture,
  type AdminPublicationModeration,
  type AdminPublicationPage,
  type AdminPublicationState,
} from '@/lib/api/admin-user-publications';
import { apiDeps } from '@/lib/api/deps';
import { attachmentSrc } from '@/lib/api/media-url';
import { translateAdmin, type AdminLanguage, type AdminPlainCatalogKey } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES PUBLICATIONS D'UN MEMBRE, ET LE GESTE QUI EN RETIRE PLUSIEURS** (#10315).
 *
 * Le porteur a dû passer par la base de production pour mettre hors ligne des
 * publications d'une utilisatrice. Ici : la liste (vignette, date, type, audience,
 * état), une case par publication, « Tout sélectionner », puis l'un des trois gestes
 * — « Mettre en privé », « Mettre hors ligne », « Remettre en ligne » — confirmé par
 * une feuille qui dit ce qui va se passer et demande le motif (sauf au rang souverain).
 *
 * L'effet est immédiat (les lignes changent d'état au geste) et se défait si la
 * passerelle refuse ; la relecture qui suit fait foi. Une publication supprimée se
 * liste sans case : aucun geste ne la ressuscite.
 */
const MOTIVE_MIN = 3;
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const GESTURES: readonly AdminPublicationGesture[] = ['make-private', 'take-offline', 'restore'];

const GESTURE_KEYS = {
  'make-private': {
    action: 'admin.people.publications.makePrivate',
    title: 'admin.people.publications.makePrivate.title',
    body: 'admin.people.publications.makePrivate.body',
    done: 'admin.people.publications.makePrivate.done',
  },
  'take-offline': {
    action: 'admin.people.publications.takeOffline',
    title: 'admin.people.publications.takeOffline.title',
    body: 'admin.people.publications.takeOffline.body',
    done: 'admin.people.publications.takeOffline.done',
  },
  restore: {
    action: 'admin.people.publications.restore',
    title: 'admin.people.publications.restore.title',
    body: 'admin.people.publications.restore.body',
    done: 'admin.people.publications.restore.done',
  },
} as const;

const STATE_TONE: Readonly<Record<AdminPublicationState, AdminTone>> = {
  online: 'success',
  private: 'neutral',
  offline: 'danger',
  expired: 'neutral',
  deleted: 'danger',
};

const STATE_KEY = {
  online: 'admin.people.publications.state.online',
  private: 'admin.people.publications.state.private',
  offline: 'admin.people.publications.state.offline',
  expired: 'admin.people.publications.state.expired',
  deleted: 'admin.people.publications.state.deleted',
} as const satisfies Readonly<Record<AdminPublicationState, AdminPlainCatalogKey>>;

const selectable = (publication: AdminPublication): boolean => publication.state !== 'deleted';

export function AdminUserPublicationsSection({
  userId,
  language,
  onAnnounce,
  deps = apiDeps,
  now = () => new Date(),
}: {
  readonly userId: string;
  readonly language: AdminLanguage;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
}) {
  const online = useOnline();
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [pending, setPending] = useState<AdminPublicationGesture | null>(null);
  const action = useAdminAction<AdminPublicationModeration>({ language, onAnnounce });
  const queryKey = adminUserPublicationsQueryKey(userId, offset);

  const page = useQuery({
    queryKey,
    queryFn: async ({ signal }) => {
      const result = await loadAdminUserPublications({ ...deps, userId, offset, signal });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });

  const rows = page.data?.publications ?? [];
  const candidates = rows.filter(selectable);
  const allSelected = candidates.length > 0 && candidates.every((publication) => selected.has(publication.id));
  const tooMany = selected.size > ADMIN_PUBLICATIONS_BATCH_MAX;

  const toggle = (id: string) =>
    setSelected((before) => {
      const next = new Set(before);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(candidates.map((publication) => publication.id)));
  const turnPage = (next: number) => {
    setSelected(new Set());
    setOffset(next);
  };

  const close = () => {
    setPending(null);
    action.reset();
  };

  const run = async (gesture: AdminPublicationGesture, motive: string | null) => {
    const ids = new Set(selected);
    const done = await action.run({
      call: () => moderateAdminUserPublications({ ...deps, userId, gesture, postIds: [...ids], reason: motive }),
      success: GESTURE_KEYS[gesture].done,
      optimistic: { key: queryKey, apply: (before) => applyGestureToPage(before as AdminPublicationPage, ids, gesture, now()) },
      invalidate: [['admin', 'user', userId, 'publications'], ['admin', 'posts']],
    });
    if (done !== null) {
      const untouched = done.unchanged + done.skipped;
      if (untouched > 0) onAnnounce(translateAdmin(language, 'admin.people.publications.untouched', { count: String(untouched) }), 'neutral');
      setSelected(new Set());
      close();
    }
  };

  return (
    <section data-admin-publications className="grid gap-3">
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.people.publications.caption')}
      </p>
      {page.isPending ? (
        <AdminSkeleton rows={4} />
      ) : page.data === undefined ? (
        <p className="text-caption" style={{ color: INK2 }} data-admin-absence>
          {translateAdmin(language, online ? 'admin.convList.unavailable' : 'admin.offline')}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.people.publications.empty')}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3" data-admin-publications-toolbar>
            <label className="inline-flex items-center gap-2 text-body" style={{ minHeight: 44, color: INK }}>
              <input type="checkbox" data-admin-publications-all checked={allSelected} disabled={candidates.length === 0} onChange={toggleAll} style={{ width: 20, height: 20, accentColor: BRAND }} />
              {translateAdmin(language, 'admin.people.publications.selectAll')}
            </label>
            <span className="text-caption tabular-nums" style={{ color: INK2 }} aria-live="polite" data-admin-publications-count>
              {translateAdmin(language, 'admin.people.publications.selected', { count: String(selected.size) })}
            </span>
          </div>
          <div className="flex flex-wrap gap-2" data-admin-publications-gestures>
            {GESTURES.map((gesture) => (
              <AdminButton
                key={gesture}
                tone={gesture === 'take-offline' ? 'danger' : 'secondary'}
                disabled={!online || selected.size === 0 || tooMany}
                onClick={() => setPending(gesture)}
                data={{ 'data-admin-action': gesture }}
              >
                {translateAdmin(language, GESTURE_KEYS[gesture].action)}
              </AdminButton>
            ))}
          </div>
          {tooMany ? (
            <p role="alert" className="text-caption" style={{ color: 'var(--color-danger)' }}>
              {translateAdmin(language, 'admin.people.publications.batchMax', { max: String(ADMIN_PUBLICATIONS_BATCH_MAX) })}
            </p>
          ) : null}
          <ul className="grid gap-2">
            {rows.map((publication) => (
              <PublicationRow key={publication.id} publication={publication} language={language} checked={selected.has(publication.id)} onToggle={() => toggle(publication.id)} />
            ))}
          </ul>
          <div className="flex justify-between gap-2 pt-2">
            <AdminButton disabled={offset === 0} onClick={() => turnPage(Math.max(0, offset - ADMIN_PUBLICATIONS_PAGE_SIZE))}>
              {translateAdmin(language, 'admin.users.previous')}
            </AdminButton>
            <AdminButton disabled={!page.data.hasMore} onClick={() => turnPage(offset + ADMIN_PUBLICATIONS_PAGE_SIZE)}>
              {translateAdmin(language, 'admin.users.next')}
            </AdminButton>
          </div>
        </>
      )}
      {pending === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={translateAdmin(language, GESTURE_KEYS[pending].title)}
          body={translateAdmin(language, GESTURE_KEYS[pending].body, { count: String(selected.size) })}
          confirmLabel={translateAdmin(language, GESTURE_KEYS[pending].action)}
          tone={pending === 'take-offline' ? 'danger' : 'primary'}
          motive={{ label: translateAdmin(language, 'admin.people.publications.motive'), minLength: MOTIVE_MIN, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void run(pending, motive)}
          onCancel={close}
        />
      )}
    </section>
  );
}

function Thumbnail({ publication }: { readonly publication: AdminPublication }) {
  const box = { width: 56, height: 56, borderRadius: 12, backgroundColor: SURFACE, border: `1px solid ${EDGE}` } as const;
  const thumbnail = publication.thumbnail;
  const visual = thumbnail !== null && (thumbnail.mimeType.startsWith('image/') || thumbnail.mimeType.startsWith('video/'));
  if (!visual) {
    return (
      <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center" style={{ ...box, color: INK2 }}>
        <AdminGlyph name={thumbnail === null ? 'newspaper' : 'file'} size={22} />
      </span>
    );
  }
  return <img src={attachmentSrc(thumbnail.url)} alt="" loading="lazy" decoding="async" className="shrink-0 object-cover" style={box} />;
}

function PublicationRow({
  publication,
  language,
  checked,
  onToggle,
}: {
  readonly publication: AdminPublication;
  readonly language: AdminLanguage;
  readonly checked: boolean;
  readonly onToggle: () => void;
}) {
  const checkboxId = useId();
  const date = publication.createdAt === null ? '' : adminDate(publication.createdAt, language);
  const meta = [
    interpretEnum('postType', publication.type, language).label,
    date,
    interpretEnum('postVisibility', publication.visibility, language).label,
    publication.mediaCount > 0 ? translateAdmin(language, 'admin.people.publications.mediaCount', { count: String(publication.mediaCount) }) : '',
  ].filter((part) => part !== '');

  return (
    <li data-admin-publication={publication.id} className="flex items-center gap-3 rounded-card px-3 py-2" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
      {selectable(publication) ? (
        <input
          id={checkboxId}
          type="checkbox"
          data-admin-publication-select
          checked={checked}
          onChange={onToggle}
          aria-label={translateAdmin(language, 'admin.people.publications.select', { date })}
          className={FOCUS}
          style={{ width: 22, height: 22, minWidth: 22, accentColor: BRAND }}
        />
      ) : (
        <span aria-hidden="true" style={{ width: 22, minWidth: 22 }} />
      )}
      <Thumbnail publication={publication} />
      <div className="grid min-w-0 flex-1 gap-1">
        <p className="line-clamp-2 break-words text-body" style={{ color: publication.contentPreview === null ? INK2 : INK }}>
          {publication.contentPreview ?? translateAdmin(language, 'admin.people.publications.noText')}
        </p>
        <p className="break-words text-caption" style={{ color: INK2 }}>
          {meta.join(' · ')}
        </p>
        {publication.priorVisibility === null || publication.state === 'deleted' ? null : (
          <p className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.people.publications.prior', { visibility: interpretEnum('postVisibility', publication.priorVisibility, language).label })}
          </p>
        )}
      </div>
      <span className="shrink-0" data-admin-publication-state={publication.state}>
        <AdminBadge tone={STATE_TONE[publication.state]}>{translateAdmin(language, STATE_KEY[publication.state])}</AdminBadge>
      </span>
    </li>
  );
}
