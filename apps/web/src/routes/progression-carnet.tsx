import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import type { GameBlock } from '@meeshy/shared/types/game';
import { photoCatchUp, PHOTO_TRACKS, type PhotoTrack } from '@meeshy/shared/utils/game/photo-catch-up';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';

import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { GameBird } from '@/components/game';
import { GamePhotoFlow } from '@/components/game-photo-flow';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from '@/components/game-surface';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import { catchUpMoments, catchUpStandingOf, type CatchUpMoment } from '@/lib/game-photo/catch-up';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { momentLines, type PhotoMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { referralOf, referralShareText } from '@/lib/game-photo/referral';
import { dateLabelOf, fileNameOf } from '@/lib/game-photo/render';
import { useObjectUrl } from '@/lib/game-photo/use-object-url';
import type { GameCatalogKey } from '@/lib/i18n-game-catalog';
import { gameText } from '@/lib/view/game-copy';
import { ProgressionShell } from '@/routes/progression-shell';

/**
 * LE CARNET DE PROGRESSION (#9382) — conception, partie VI : « le carnet de
 * progression garde ces photos et montre le chemin parcouru ». Les photos
 * gardées, du plus récent au plus ancien, et les moments laissés en attente
 * (« plus tard », sept jours) avec de quoi les photographier maintenant.
 *
 * LOCAL à l'appareil : un stockage qui refuse se lit « carnet vide », jamais
 * une alerte qui ferait croire à une perte. Aucune image ne quitte l'appareil
 * sans un geste de partage. Retirer une photo demande une confirmation : c'est
 * le seul exemplaire.
 *
 * LE RATTRAPAGE (#9961, #9962) : chaque étape déjà franchie sans photo gardée
 * se photographie, DANS L'ORDRE de sa piste (`photo-catch-up.ts`). Les étapes
 * se lisent dans le bloc du jeu DÉJÀ en cache — sans lui, la section se tait.
 * Un moment en attente qui est une étape ne paraît qu'une fois : là.
 */

const CONFIRM_MS = 4000;

/** IndexedDB peut rendre un `Blob` nu : le partage veut un `File`, nommé comme à la prise de vue. */
const storyFile = (entry: NotebookEntry): File | null =>
  entry.story === undefined
    ? null
    : entry.story instanceof File
      ? entry.story
      : new File([entry.story], fileNameOf(entry.momentId, 'story'), { type: entry.story.type === '' ? 'image/png' : entry.story.type });

/* Les deux lignes se redéduisent de l'EMBLÈME, dans la langue d'aujourd'hui : une
   entrée gardée hier sous une autre langue ne reste pas figée dans celle-là. */
const momentOf = (entry: NotebookEntry): PhotoMoment => ({
  id: entry.momentId,
  emblem: entry.emblem,
  ...momentLines(entry.emblem),
});

function KeptEntry({ entry, env, onRemoved }: { readonly entry: NotebookEntry; readonly env: PhotoEnv; readonly onRemoved: (id: string) => void }) {
  const { kicker, title } = momentOf(entry);
  const preview = useObjectUrl(entry.story);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirming]);

  /* L'image gardée redit le lien de parrainage en texte (#7742) ; sans lien, elle part seule. */
  const share = async (file: File) => {
    const link = await (env.referral?.() ?? Promise.resolve(null)).catch(() => null);
    const referral = referralOf(link, null);
    await env.share(file, title, referral === null ? undefined : referralShareText(referral));
  };

  const remove = async () => {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    if (await env.notebook.remove(entry.id)) onRemoved(entry.id);
  };

  return (
    <li data-carnet-entry={entry.id} className="flex gap-3 rounded-card px-3 py-3" style={{ backgroundColor: GAME_CARD }}>
      {preview === null ? null : (
        <img src={preview} alt={gameText('game.notebook.photo_a11y', { title })} className="shrink-0 rounded-chip object-cover" style={{ width: 72, height: 128 }} />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {kicker}
        </p>
        <p className="text-body font-bold" style={{ color: GAME_INK }}>
          {title}
        </p>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {dateLabelOf(new Date(entry.createdAt))}
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          <button
            type="button"
            data-carnet-share=""
            disabled={entry.story === undefined}
            onClick={() => {
              const file = storyFile(entry);
              if (file !== null) void share(file);
            }}
            className="rounded-chip px-3 text-check font-semibold disabled:opacity-60"
            style={{ minHeight: 44, color: GAME_BRAND, backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' }}
          >
            {gameText('game.photo.share')}
          </button>
          <button
            type="button"
            data-carnet-remove=""
            onClick={() => void remove()}
            className="rounded-chip px-3 text-check font-semibold"
            style={{ minHeight: 44, color: confirming ? GAME_WARM : GAME_INK_2 }}
          >
            {confirming ? gameText('game.notebook.remove_confirm') : gameText('game.notebook.remove')}
          </button>
        </div>
      </div>
    </li>
  );
}

function PendingEntry({ entry, onTake }: { readonly entry: NotebookEntry; readonly onTake: (moment: PhotoMoment) => void }) {
  const { kicker, title } = momentOf(entry);
  return (
    <li data-carnet-entry={entry.id} className="flex items-center gap-3 rounded-card px-3 py-3" style={{ backgroundColor: GAME_CARD }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {kicker}
        </p>
        <p className="text-body font-bold" style={{ color: GAME_INK }}>
          {title}
        </p>
        <p className="text-caption" style={{ color: GAME_INK_2 }}>
          {gameText('game.notebook.pending_until', { date: dateLabelOf(new Date(entry.expiresAt ?? entry.createdAt)) })}
        </p>
      </div>
      <button
        type="button"
        data-carnet-take=""
        onClick={() => onTake(momentOf(entry))}
        className="shrink-0 rounded-chip px-3 text-check font-semibold"
        style={{ minHeight: 44, color: 'var(--color-ios-surface)', backgroundColor: GAME_BRAND }}
      >
        {gameText('game.photo.offer.start')}
      </button>
    </li>
  );
}

const TRACK_LABEL = {
  start: 'game.photo.kicker.start',
  rank: 'game.gauge.rank',
  tier: 'game.concept.level.name',
  summit: 'game.photo.kicker.summit',
  meesh: 'game.concept.meesh.name',
  treasury: 'game.gauge.treasury',
  flame: 'game.gauge.flame',
} as const satisfies Readonly<Record<PhotoTrack, GameCatalogKey>>;

function LockGlyph() {
  return (
    <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

function CatchUpEntry({ entry, firstTitle, onTake }: { readonly entry: CatchUpMoment; readonly firstTitle: string | null; readonly onTake: (moment: PhotoMoment) => void }) {
  const { id, kicker, title } = entry.moment;
  if (entry.state === 'locked') {
    const first = firstTitle ?? '';
    return (
      <li
        data-carnet-catch-up={id}
        data-carnet-catch-up-locked=""
        aria-label={gameText('game.notebook.catch_up_locked_a11y', { title, first })}
        className="flex items-center gap-3 rounded-card px-3 py-3 opacity-60"
        style={{ backgroundColor: GAME_CARD, color: GAME_INK_2 }}
      >
        <div aria-hidden="true" className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="text-body font-bold" style={{ color: GAME_INK }}>
            {title}
          </p>
          <p className="text-caption">{gameText('game.notebook.catch_up_locked', { title: first })}</p>
        </div>
        <LockGlyph />
      </li>
    );
  }
  return (
    <li data-carnet-catch-up={id} className="flex items-center gap-3 rounded-card px-3 py-3" style={{ backgroundColor: GAME_CARD }}>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
          {kicker}
        </p>
        <p className="text-body font-bold" style={{ color: GAME_INK }}>
          {title}
        </p>
      </div>
      <button
        type="button"
        data-carnet-catch-up-take=""
        onClick={() => onTake(entry.moment)}
        className="shrink-0 rounded-chip px-3 text-check font-semibold"
        style={{ minHeight: 44, color: 'var(--color-ios-surface)', backgroundColor: GAME_BRAND }}
      >
        {gameText('game.photo.offer.start')}
      </button>
    </li>
  );
}

function CatchUpSection({ entries, onTake }: { readonly entries: readonly CatchUpMoment[]; readonly onTake: (moment: PhotoMoment) => void }) {
  const titles = new Map(entries.map((entry) => [entry.moment.id, entry.moment.title]));
  const groups = PHOTO_TRACKS.map((track) => ({ track, items: entries.filter((entry) => entry.track === track) })).filter((group) => group.items.length > 0);
  return (
    <section aria-labelledby="carnet-rattrapage" className="flex flex-col gap-3">
      <h2 id="carnet-rattrapage" className="text-title font-bold" style={{ color: GAME_INK }}>
        {gameText('game.notebook.catch_up')}
      </h2>
      {groups.map(({ track, items }) => (
        <div key={track} data-carnet-track={track} role="group" aria-labelledby={`carnet-piste-${track}`} className="flex flex-col gap-2">
          <h3 id={`carnet-piste-${track}`} className="px-1 text-check font-semibold uppercase tracking-wide" style={{ color: GAME_INK_2 }}>
            {gameText(TRACK_LABEL[track])}
          </h3>
          <ul className="flex flex-col gap-2">
            {items.map((entry) => (
              <CatchUpEntry key={entry.moment.id} entry={entry} firstTitle={entry.blockedBy === null ? null : (titles.get(entry.blockedBy) ?? null)} onTake={onTake} />
            ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

export function CarnetBody({
  env,
  flameDays = null,
  game = null,
}: {
  readonly env: PhotoEnv;
  readonly flameDays?: number | null;
  readonly game?: GameBlock | null;
}) {
  const [entries, setEntries] = useState<readonly NotebookEntry[] | null>(null);
  const [taking, setTaking] = useState<PhotoMoment | null>(null);

  const load = useCallback(() => {
    void env.notebook.list().then(setEntries);
  }, [env]);
  useEffect(load, [load]);

  const removed = useCallback((id: string) => setEntries((current) => current?.filter((entry) => entry.id !== id) ?? current), []);

  if (entries === null) {
    return <div aria-busy="true" className="px-4 py-6" />;
  }

  const kept = entries
    .filter((entry) => entry.status === 'kept')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  const catchUp = game === null ? [] : catchUpMoments(photoCatchUp(catchUpStandingOf(game), kept.map((entry) => entry.momentId)));
  const caught = new Set(catchUp.map((entry) => entry.moment.id));
  const pending = entries.filter((entry) => entry.status === 'pending' && !caught.has(entry.momentId));

  return (
    <div className="flex flex-col gap-4 px-4 py-3">
      {entries.length === 0 ? (
        <section className="flex items-end gap-2 px-1">
          <GameBird bird="meeGuide" size={80} />
          <p className="flex-1 pb-2 text-body" style={{ color: GAME_INK }}>
            {gameText('game.notebook.empty')}
          </p>
          <GameBird bird="meoGuide" size={80} flip />
        </section>
      ) : null}

      {catchUp.length === 0 ? null : <CatchUpSection entries={catchUp} onTake={setTaking} />}

      {pending.length === 0 ? null : (
        <section aria-labelledby="carnet-attente" className="flex flex-col gap-2">
          <h2 id="carnet-attente" className="text-title font-bold" style={{ color: GAME_INK }}>
            {gameText('game.notebook.pending')}
          </h2>
          <ul className="flex flex-col gap-2">
            {pending.map((entry) => (
              <PendingEntry key={entry.id} entry={entry} onTake={setTaking} />
            ))}
          </ul>
        </section>
      )}

      {kept.length === 0 ? null : (
        <section aria-labelledby="carnet-gardees" className="flex flex-col gap-2">
          <h2 id="carnet-gardees" className="text-title font-bold" style={{ color: GAME_INK }}>
            {gameText('game.notebook.kept')}
          </h2>
          <ul className="flex flex-col gap-2">
            {kept.map((entry) => (
              <KeptEntry key={entry.id} entry={entry} env={env} onRemoved={removed} />
            ))}
          </ul>
        </section>
      )}

      {taking === null ? null : (
        <GamePhotoFlow
          moment={taking}
          env={env}
          flameDays={flameDays}
          onClose={() => {
            setTaking(null);
            load();
          }}
        />
      )}
    </div>
  );
}

export default function ProgressionCarnetScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  /* Le bloc du jeu (Flamme du bandeau, étapes à rattraper) : lu dans le cache de Progression, jamais redemandé. */
  const game = useQueryClient().getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game ?? null;
  return (
    <ProgressionShell title={gameText('game.notebook.page_title')}>
      <CarnetBody env={appPhotoEnv()} flameDays={game?.flame.days ?? null} game={game} />
    </ProgressionShell>
  );
}
