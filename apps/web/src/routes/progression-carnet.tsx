import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { ENGAGEMENT_PROGRESS_QUERY_KEY, type EngagementWithGame } from '@/lib/api/engagement';

import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { Glyph } from '@/components/glyph';
import { GameBird } from '@/components/game';
import { GamePhotoFlow } from '@/components/game-photo-flow';
import { GlassBack } from '@/components/glass-surface';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2, GAME_WARM } from '@/components/game-surface';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoEnv } from '@/lib/game-photo/env';
import { momentLines, type PhotoMoment } from '@/lib/game-photo/moments';
import type { NotebookEntry } from '@/lib/game-photo/notebook';
import { referralOf, referralShareText } from '@/lib/game-photo/referral';
import { dateLabelOf, fileNameOf } from '@/lib/game-photo/render';
import { useObjectUrl } from '@/lib/game-photo/use-object-url';
import { gameText } from '@/lib/view/game-copy';
import { Link } from '@/routes/route-table';

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

export function CarnetBody({ env, flameDays = null }: { readonly env: PhotoEnv; readonly flameDays?: number | null }) {
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

  const pending = entries.filter((entry) => entry.status === 'pending');
  const kept = entries
    .filter((entry) => entry.status === 'kept')
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

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
  /* Les jours de la Flamme du bandeau : lus dans le cache de Progression, jamais redemandés. */
  const flameDays = useQueryClient().getQueryData<EngagementWithGame>(ENGAGEMENT_PROGRESS_QUERY_KEY)?.game?.flame.days ?? null;
  return (
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="glass z-10 shrink-0">
        <div className="flex items-center gap-2 px-4 py-2">
          <Link to="progression" className="grid size-11 shrink-0 place-items-center" style={{ color: GAME_BRAND }} aria-label={gameText('game.page.back')}>
            <GlassBack label={gameText('game.page.back')}>
              <Glyph name="caretLeft" size={22} className="rtl:-scale-x-100" />
            </GlassBack>
          </Link>
          <h1 className="flex-1 truncate text-title font-bold" style={{ color: GAME_INK }}>
            {gameText('game.notebook.page_title')}
          </h1>
        </div>
      </header>
      <main id="contenu" className="flex-1 overflow-y-auto pb-safe">
        <CarnetBody env={appPhotoEnv()} flameDays={flameDays} />
      </main>
    </div>
  );
}
