import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { GameBird } from '@/components/game';
import { unwrap } from '@/lib/api/client';
import { apiDeps } from '@/lib/api/deps';
import { ENGAGEMENT_PROGRESS_QUERY_KEY, loadEngagementProgress } from '@/lib/api/engagement';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { callStore } from '@/lib/calls/call-store';
import { keptToSignal } from '@/lib/game-photo/alert-acks';
import { deferLater, photoAlertContextFree, type PendingPhotoAlert, type PhotoAlerts } from '@/lib/game-photo/alerts';
import { appPhotoAlerts, notebookIds, signalPhotoKept } from '@/lib/game-photo/app-alerts';
import { appPhotoEnv } from '@/lib/game-photo/app-env';
import type { PhotoEnv } from '@/lib/game-photo/env';
import type { PhotoMoment } from '@/lib/game-photo/moments';
import type { GameBlock } from '@meeshy/shared/types/game';
import { dateLabelOf } from '@/lib/game-photo/render';
import { useGamePrefs } from '@/lib/game/preferences';
import { useAtmosphereGate } from '@/lib/game/use-atmosphere-gate';
import { loadGameScreenCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { showsPlayerBanner } from '@/lib/view/top-band';
import { href, navigate } from '@/routes/route-table';

import { GamePhotoFlow } from './game-photo-flow';
import { GamePhotoFrame } from './game-photo-frame';
import { GAME_BRAND, GAME_CARD, GAME_INK, GAME_INK_2 } from './game-surface';

/**
 * L'HÔTE DES INVITATIONS À IMMORTALISER (#10174, L18 ; § 5.16.3 ; D19 de #10183) — armé par le chrome différé
 * (`game-photo-alert-mount.tsx`) dans la colonne de la bande du haut, APRÈS la première peinture, sur toutes les
 * routes d'un compte connecté. Il nourrit le coordinateur unique (`lib/game-photo/alerts.ts`) de chaque lecture fraîche du jeu (`['me','engagement']`), et montre ce qui
 * attend dans la file :
 *
 *  - une BANNIÈRE non modale, dans la pile du haut : elle ne prend pas le focus, s'annonce poliment aux
 *    lecteurs d'écran (`role="status"`, `aria-live="polite"`) et s'efface seule ; la toucher ouvre la feuille ;
 *  - la FEUILLE : Mee, le sur-titre et le titre de l'étape ANNONCÉE, la phrase de reprise quand l'étape
 *    PROPOSÉE diffère, l'aperçu de la carte (la carte actuelle, dessinée ici — aucune requête réseau), puis
 *    « Immortaliser » (le déroulé, importé avec l'hôte : il partage le morceau des écrans du jeu), « Plus tard »
 *    (l'attente sans expiration) et un lien discret « Ne plus me proposer » qui OUVRE le réglage et n'agit jamais
 *    en silence. Échap vaut « Plus tard ».
 *
 * AU BON MOMENT : seulement sur un hub (`showsPlayerBanner` — l'onboarding, l'appel, le composer, une story,
 * une visionneuse sont ailleurs), jamais pendant un appel ni une saisie ; l'étape attend, elle reste dans la
 * file. Sur Progression, la carte d'offre est la surface : rien ici. Le jeu masqué ou les célébrations coupées
 * (réglages de l'appareil) ne montrent rien et ne lisent rien.
 *
 * À la première lecture d'un compte sur cet appareil, les photos déjà gardées sont SIGNALÉES au registre
 * (D22 b), par lots de 64, pour que les autres appareils les sortent de « À rattraper ».
 */
/** La bannière s'efface seule : l'étape reste dans la file et au carnet. */
export const PHOTO_ALERT_BANNER_MS = 8_000;

const editing = (element: Element | null): boolean =>
  element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || (element instanceof HTMLElement && element.isContentEditable);

function useTyping(): boolean {
  const [typing, setTyping] = useState(() => typeof document !== 'undefined' && editing(document.activeElement));
  useEffect(() => {
    const update = (): void => setTyping(editing(document.activeElement));
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  return typing;
}

const useViewerKey = (): string => {
  const session = useStore(sessionStore, (state) => state.session);
  return resolveViewer({ source: apiDeps.source, session }).id ?? 'anonymous';
};

export type GamePhotoAlertHostProps = {
  readonly routeKey: string;
  readonly alerts?: PhotoAlerts;
  readonly env?: () => PhotoEnv;
  /** La durée de la bannière, injectable pour les témoins. */
  readonly bannerMs?: number;
  /** « Ne plus me proposer » ouvre le réglage ; défaut : la page des réglages du jeu. */
  readonly openSettings?: () => void;
  readonly signalKept?: (stepIds: readonly string[]) => void;
};

export function GamePhotoAlertHost({
  routeKey,
  alerts = appPhotoAlerts,
  env = appPhotoEnv,
  bannerMs = PHOTO_ALERT_BANNER_MS,
  openSettings = () => navigate(href('progressionReglages')),
  signalKept = signalPhotoKept,
}: GamePhotoAlertHostProps) {
  const prefs = useGamePrefs();
  const signedIn = useStore(sessionStore, (state) => state.session.status === 'authenticated') || apiDeps.source === 'fixtures';
  const awake = signedIn && !prefs.hidden && prefs.celebrations;
  const userId = useViewerKey();
  const query = useQuery(
    {
      queryKey: ENGAGEMENT_PROGRESS_QUERY_KEY,
      enabled: awake,
      queryFn: async ({ signal }) => unwrap(await loadEngagementProgress({ ...apiDeps, signal })),
    },
    appQueryClient,
  );
  const game = awake ? query.data?.game : undefined;

  useEffect(() => {
    if (game === undefined) return;
    void alerts.observe({ userId, game, kept: () => notebookIds(env().notebook) });
  }, [game, userId, alerts, env]);

  /* Les photos déjà gardées ici, signalées une fois par compte et par séance (D22 b). */
  const signalled = useRef<string | null>(null);
  const served = game?.photo?.moments;
  useEffect(() => {
    if (served === undefined || signalled.current === userId) return;
    signalled.current = userId;
    void notebookIds(env().notebook).then(({ kept }) => {
      const missing = keptToSignal(kept, served);
      if (missing.length > 0) signalKept(missing);
    });
  }, [served, userId, env, signalKept]);

  const pending = useStore(alerts.store, (state) => state.pending);
  const callLive = useStore(callStore, (state) => state.call !== null || state.waiting !== null);
  const typing = useTyping();
  const free = awake && photoAlertContextFree({ routeHub: showsPlayerBanner(routeKey), callLive, typing });
  const atmosphere = useAtmosphereGate(game);

  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (pending === null || ready) return;
    let live = true;
    void loadGameScreenCatalog(currentInterfaceLanguage(), 'profile').then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, [pending, ready]);

  const [sheet, setSheet] = useState(false);
  const [faded, setFaded] = useState<PendingPhotoAlert | null>(null);
  const [active, setActive] = useState<PhotoMoment | null>(null);

  const shown = pending !== null && ready && free && active === null;
  const banner = shown && !sheet && faded !== pending;

  useEffect(() => {
    if (pending === null || !shown) return;
    alerts.displayed(pending);
  }, [pending, shown, alerts]);

  useEffect(() => {
    if (!banner || pending === null) return undefined;
    const id = setTimeout(() => setFaded(pending), bannerMs);
    return () => clearTimeout(id);
  }, [banner, pending, bannerMs]);

  const dialog = useRef<HTMLDivElement | null>(null);
  const opener = useRef<Element | null>(null);
  useEffect(() => {
    if (!sheet) return;
    opener.current = document.activeElement;
    dialog.current?.focus();
    return () => {
      if (opener.current instanceof HTMLElement) opener.current.focus();
    };
  }, [sheet]);

  if (pending === null || !shown) return active === null ? null : <Flow moment={active} env={env} game={game} atmosphere={atmosphere} onClose={() => setActive(null)} />;

  const { announce, propose } = pending;

  const later = (): void => {
    setSheet(false);
    alerts.later();
    void deferLater(env().notebook, propose);
  };
  const start = (): void => {
    const taken = alerts.consume();
    setSheet(false);
    setActive(taken?.propose ?? propose);
  };
  const never = (): void => {
    setSheet(false);
    alerts.later();
    openSettings();
  };
  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    later();
  };

  return (
    <>
      {banner ? (
        <div
          data-photo-alert-banner={announce.id}
          role="status"
          aria-live="polite"
          className="pointer-events-auto flex items-center gap-3 rounded-card px-3 py-2"
          style={{ backgroundColor: GAME_CARD, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${GAME_BRAND} 22%, transparent)` }}
        >
          <GameBird bird="meeWink" size={40} />
          <div className="min-w-0 flex-1">
            <p className="text-check font-semibold uppercase tracking-[0.08em]" style={{ color: GAME_INK_2 }}>
              {announce.kicker}
            </p>
            <p className="truncate text-body font-bold" style={{ color: GAME_INK }}>
              {announce.title}
            </p>
          </div>
          <button type="button" data-photo-alert-open="" onClick={() => setSheet(true)} className="shrink-0 rounded-chip px-3 text-body font-bold" style={{ minHeight: 44, color: GAME_BRAND }}>
            {gameText('game.photo.alert.open')}
          </button>
          <button type="button" data-photo-alert-later="" aria-label={gameText('game.photo.later')} onClick={later} className="shrink-0 rounded-chip text-body font-semibold" style={{ minHeight: 44, minWidth: 44, color: GAME_INK_2 }}>
            ×
          </button>
        </div>
      ) : null}
      {sheet ? (
        <div
          ref={dialog}
          data-photo-alert-sheet={announce.id}
          role="dialog"
          aria-modal="true"
          aria-label={gameText('game.photo.alert.a11y', { kicker: announce.kicker, title: announce.title })}
          tabIndex={-1}
          onKeyDown={onKey}
          className="pointer-events-auto fixed inset-x-0 bottom-0 z-50 px-4 outline-none"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 12px)' }}
        >
          <div className="mx-auto flex max-w-md flex-col gap-3 rounded-card p-4" style={{ backgroundColor: GAME_CARD, boxShadow: '0 -8px 32px color-mix(in srgb, var(--color-ios-ink) 18%, transparent)' }}>
            <div className="flex items-end gap-3">
              <GameBird bird="meeWink" size={64} />
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-check font-semibold uppercase tracking-[0.08em]" style={{ color: GAME_INK_2 }}>
                  {announce.kicker}
                </p>
                <h2 className="text-body font-bold" style={{ color: GAME_INK }}>
                  {announce.title}
                </h2>
              </div>
              <div aria-hidden="true" className="relative shrink-0 overflow-hidden rounded-chip" style={{ width: 72, height: 128 }}>
                <GamePhotoFrame moment={propose} dateLabel={dateLabelOf(env().now())} format="story" />
              </div>
            </div>
            {propose.id === announce.id ? null : (
              <p data-photo-alert-resume={propose.id} className="text-body" style={{ color: GAME_INK_2 }}>
                {gameText('game.photo.alert.resume', { title: propose.title })}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button type="button" data-photo-alert-start="" onClick={start} className="rounded-chip px-4 text-body font-bold" style={{ minHeight: 44, backgroundColor: GAME_BRAND, color: 'var(--color-ios-surface)' }}>
                {gameText('game.photo.alert.start')}
              </button>
              <button type="button" data-photo-alert-sheet-later="" onClick={later} className="rounded-chip px-3 text-body font-semibold" style={{ minHeight: 44, color: GAME_INK_2 }}>
                {gameText('game.photo.later')}
              </button>
            </div>
            <button type="button" data-photo-alert-never="" onClick={never} className="self-start text-caption underline" style={{ minHeight: 44, color: GAME_INK_2 }}>
              {gameText('game.photo.alert.never')}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Flow({
  moment,
  env,
  game,
  atmosphere,
  onClose,
}: {
  readonly moment: PhotoMoment;
  readonly env: () => PhotoEnv;
  readonly game: GameBlock | undefined;
  readonly atmosphere: ReturnType<typeof useAtmosphereGate>;
  readonly onClose: () => void;
}) {
  return (
    <div data-photo-alert-flow={moment.id} className="pointer-events-auto">
      <GamePhotoFlow moment={moment} env={env()} flameDays={game?.flame.days ?? null} atmosphere={atmosphere} onClose={onClose} />
    </div>
  );
}
