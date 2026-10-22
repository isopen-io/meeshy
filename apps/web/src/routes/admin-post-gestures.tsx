import type { QueryKey } from '@tanstack/react-query';
import { useId, useState } from 'react';

import type { AdminPostState, AdminSettableVisibility } from '@meeshy/shared/types/admin-publication-states';

import { AdminButton } from '@/components/admin/button';
import { AdminConfirmSheet } from '@/components/admin/confirm-sheet';
import { BRAND, EDGE, INK, SURFACE } from '@/components/admin/tone';
import { interpretPostVisibility } from '@/lib/admin/interpret/enums';
import { audiencesOffered, gesturesOffered, type PostGestureIntent } from '@/lib/admin/post-gestures';
import { translatedRefusal, useAdminAction } from '@/lib/admin/use-admin-action';
import type { AdminDeps } from '@/lib/api/admin';
import { sendAdminPostGesture, type AdminPostView } from '@/lib/api/admin-post-gestures';
import { apiDeps } from '@/lib/api/deps';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { useOnline } from '@/lib/net/online';
import type { AnnouncementTone } from '@/lib/view/use-live-announcer';

/**
 * **LES GESTES D'UNE PUBLICATION, EN UN GESTE** (#10392) — posés sur la ligne de la
 * liste de la plateforme et dans la fiche : « Mettre hors ligne », « Remettre en
 * ligne », et l'audience — seulement celles que la passerelle accepte, jamais plus
 * large que l'audience choisie par l'auteur (`audiencesOffered`, #10471) ; un refus
 * `AUDIENCE_WIDENING` se dit en mots.
 *
 * Un geste = un appui, puis la feuille de confirmation qui dit l'effet et demande le
 * motif (sauf au rang souverain, que la feuille sait reconnaître) : deux gestes au
 * plus. L'effet est IMMÉDIAT (`optimistic`), défait si la passerelle refuse ; la
 * relecture qui suit fait foi. Hors ligne réseau, les gestes sont désactivés.
 */
const MOTIVE_MIN = 3;

type Pending = PostGestureIntent | null;

const KEYS = {
  'take-offline': { title: 'admin.gesture.takeOffline.title', body: 'admin.gesture.takeOffline.body', done: 'admin.gesture.done.takeOffline', action: 'admin.gesture.takeOffline' },
  restore: { title: 'admin.gesture.restore.title', body: 'admin.gesture.restore.body', done: 'admin.gesture.done.restore', action: 'admin.gesture.restore' },
} as const;

export type PostGestureTarget = {
  readonly id: string;
  readonly state: AdminPostState;
  readonly visibility: string | null;
  readonly moderationPriorVisibility: string | null;
};

export function AdminPostGestureBar({
  language,
  post,
  onAnnounce,
  optimistic,
  invalidate = [['admin', 'posts']],
  deps = apiDeps,
  now = () => new Date(),
  compact = false,
}: {
  readonly language: AdminLanguage;
  readonly post: PostGestureTarget;
  readonly onAnnounce: (message: string, tone?: AnnouncementTone) => void;
  /** L'effet immédiat sur le cache qui montre cette publication (la page de liste, ou la fiche). */
  readonly optimistic?: { readonly key: QueryKey; readonly apply: (before: unknown, intent: PostGestureIntent, now: Date) => unknown };
  readonly invalidate?: readonly QueryKey[];
  readonly deps?: AdminDeps;
  readonly now?: () => Date;
  readonly compact?: boolean;
}) {
  const online = useOnline();
  const selectId = useId();
  const [pending, setPending] = useState<Pending>(null);
  const action = useAdminAction<AdminPostView>({ language, onAnnounce });
  const offered = gesturesOffered(post.state);
  if (offered.length === 0) return null;

  const close = () => {
    setPending(null);
    action.reset();
  };

  const run = async (intent: PostGestureIntent, motive: string | null) => {
    const at = now();
    const done = await action.run({
      call: async () => {
        const outcome = await sendAdminPostGesture({ ...deps, postId: post.id, intent, reason: motive });
        return !outcome.ok && outcome.code === 'AUDIENCE_WIDENING' ? translatedRefusal(translateAdmin(language, 'admin.gesture.refused.widening')) : outcome;
      },
      success: intent.gesture === 'set-visibility' ? 'admin.gesture.done.audience' : KEYS[intent.gesture].done,
      ...(optimistic === undefined ? {} : { optimistic: { key: optimistic.key, apply: (before: unknown) => optimistic.apply(before, intent, at) } }),
      invalidate,
    });
    if (done !== null) close();
  };

  const audienceLabel = (visibility: string): string => interpretPostVisibility(visibility, language).label;
  const audiences = audiencesOffered(post);
  const settable = audiences.find((candidate) => candidate === post.visibility && post.state !== 'offline');

  /* La feuille de confirmation est un FRÈRE du groupe, pas un de ses gestes (#10461) : le groupe se
     replie ENTRE ses contrôles de 44 px, la feuille replie son texte comme n'importe quel dialogue. */
  return (
    <>
      <div
        role="group"
        aria-label={translateAdmin(language, 'admin.gesture.group')}
        data-admin-post-gestures={post.id}
        className={`flex flex-wrap items-center ${compact ? 'gap-1.5' : 'gap-2'}`}
      >
        {offered.includes('take-offline') ? (
          <AdminButton tone="danger" disabled={!online} onClick={() => setPending({ gesture: 'take-offline' })} data={{ 'data-admin-post-gesture': 'take-offline' }}>
            {translateAdmin(language, 'admin.gesture.takeOffline')}
          </AdminButton>
        ) : null}
        {offered.includes('restore') ? (
          <AdminButton tone="primary" disabled={!online} onClick={() => setPending({ gesture: 'restore' })} data={{ 'data-admin-post-gesture': 'restore' }}>
            {translateAdmin(language, 'admin.gesture.restore')}
          </AdminButton>
        ) : null}
        {offered.includes('set-visibility') ? (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <label htmlFor={selectId} className="sr-only">
              {translateAdmin(language, 'admin.gesture.audience')}
            </label>
            <select
              id={selectId}
              data-admin-post-gesture="set-visibility"
              disabled={!online}
              value={settable ?? ''}
              onChange={(event) => {
                const visibility = audiences.find((candidate) => candidate === event.currentTarget.value);
                if (visibility !== undefined && visibility !== settable) setPending({ gesture: 'set-visibility', visibility });
              }}
              className="rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, backgroundColor: SURFACE, color: INK, border: `1px solid ${EDGE}`, outlineColor: BRAND }}
            >
              {settable === undefined ? <option value="">{translateAdmin(language, 'admin.gesture.audience.placeholder')}</option> : null}
              {audiences.map((visibility: AdminSettableVisibility) => (
                <option key={visibility} value={visibility}>
                  {audienceLabel(visibility)}
                </option>
              ))}
            </select>
          </span>
        ) : null}
      </div>
      {pending === null ? null : (
        <AdminConfirmSheet
          language={language}
          title={
            pending.gesture === 'set-visibility'
              ? translateAdmin(language, 'admin.gesture.audience.title', { audience: audienceLabel(pending.visibility) })
              : translateAdmin(language, KEYS[pending.gesture].title)
          }
          body={translateAdmin(language, pending.gesture === 'set-visibility' ? 'admin.gesture.audience.body' : KEYS[pending.gesture].body)}
          confirmLabel={
            pending.gesture === 'set-visibility' ? audienceLabel(pending.visibility) : translateAdmin(language, KEYS[pending.gesture].action)
          }
          tone={pending.gesture === 'take-offline' ? 'danger' : 'primary'}
          motive={{ label: translateAdmin(language, 'admin.gesture.motive'), minLength: MOTIVE_MIN, required: true }}
          busy={action.state.phase === 'running'}
          error={action.state.phase === 'error' ? action.state.message : null}
          onConfirm={(motive) => void run(pending, motive)}
          onCancel={close}
        />
      )}
    </>
  );
}
