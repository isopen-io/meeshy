import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import type { GameVisibility } from '@meeshy/shared/types/game';
import type { GloryAtmosphere } from '@meeshy/shared/types/glory-atmospheres';

import { GameAtmosphereChoice } from '@/components/game-atmosphere-choice';
import type { PhotoInvitations } from '@meeshy/shared/types/game-photo-settings';
import { setPhotoInvitations } from '@/lib/game-photo/app-alerts';

import { GameSettings } from '@/components/game-settings';
import { GAME_BRAND } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import type { GameHiddenOutcome } from '@/lib/game/game-hidden';
import { appPreferencesQueryOptions, type PreferencesPatch } from '@/lib/api/app-preferences';
import { performPreferenceEdit, type PreferenceActionDeps } from '@/lib/api/app-preferences-actions';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import type { AtmosphereGate, AtmosphereOutcome } from '@/lib/game/atmosphere';
import { gamePrefs, useGamePrefs } from '@/lib/game/preferences';
import { useAtmosphereGate } from '@/lib/game/use-atmosphere-gate';
import { setGameHidden, useGameSettings } from '@/lib/game/use-game-settings';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameErrorMessage, gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « RÉGLAGES DU JEU » (#9481) — les célébrations, le mode « Jeu
 * masqué », qui voit quoi, la ligue publique. Cache-first (le bloc `game` du
 * hub) ; les réglages de visibilité et le départ de la ligue sont optimistes avec
 * retour arrière.
 *
 * « Jeu masqué » enchaîne ce que le contrat permet (voir `GameSettings`) : le
 * réglage du compte (`PUT /me/game/privacy`, dont le drapeau de l'appareil n'est
 * que la copie), les quatre visibilités à « moi seul », la sortie de la ligue
 * publique. Hors ligne, le geste est SUSPENDU dans les deux sens : le serveur
 * fait foi, et une bascule qui ne partirait pas serait défaite à la lecture
 * suivante. Réafficher ne rouvre aucune visibilité.
 *
 * « Mon atmosphère » (#10163) ouvre le MÊME écran de choix que le déroulé photo (E1), sans « Choisir plus
 * tard » : choisir enregistre sur le compte et installe le pack ; hors ligne, l'écriture part avec la connexion.
 */
const CLOSED: { readonly showcase: 'me'; readonly rank: 'me'; readonly treasury: 'me'; readonly atlas: 'me' } = {
  showcase: 'me',
  rank: 'me',
  treasury: 'me',
  atlas: 'me',
};

export type GameNotificationsCard = {
  readonly enabled: boolean | undefined;
  readonly onToggle: (on: boolean) => void;
  readonly error?: string | undefined;
  readonly photo?: { readonly enabled: boolean | undefined; readonly onToggle: (on: boolean) => void } | undefined;
};

export function ReglagesBody({
  progress,
  actions,
  online,
  hide,
  visibility,
  notifications,
  atmosphere,
  invitations,
}: {
  readonly progress: EngagementWithGame;
  readonly actions: GameV2Actions;
  readonly online: boolean;
  readonly hide: (on: boolean) => void;
  /** Les visibilités lues par `GET /me/game/privacy` ; absentes, celles du bloc `game`. */
  readonly visibility?: GameVisibility | undefined;
  /** Les notifications du jeu (#9490) — absent : pas de carte ; `photo` : « Moments à immortaliser » (#10268), dans la même carte. */
  readonly notifications?: GameNotificationsCard | undefined;
  /** L'atmosphère des cadres (#10163) — absent : pas de carte. */
  readonly atmosphere?: AtmosphereGate | undefined;
  /** « Me proposer d'immortaliser » (#10174) : l'écriture de compte ; absent : pas de carte. */
  readonly invitations?: ((next: PhotoInvitations) => void) | undefined;
}) {
  const prefs = useGamePrefs();
  const game = progress.game;
  const [choosing, setChoosing] = useState(false);
  const [invitationsNotice, setInvitationsNotice] = useState<string | undefined>(undefined);
  const changeInvitations = (next: PhotoInvitations): void => {
    setInvitationsNotice(online ? undefined : gameText('game.settings.invitations.queued'));
    invitations?.(next);
  };
  const [atmosphereNotice, setAtmosphereNotice] = useState<string | undefined>(undefined);
  const chooseAtmosphere = (picked: GloryAtmosphere): void => {
    setChoosing(false);
    setAtmosphereNotice(undefined);
    void atmosphere?.choose(picked).then((outcome: AtmosphereOutcome) => {
      if (outcome.status === 'queued') setAtmosphereNotice(gameText('game.settings.atmosphere.queued'));
      if (outcome.status === 'refused') setAtmosphereNotice(gameErrorMessage(outcome.code));
    });
  };
  return (
    <>
    <GameSettings
      prefs={prefs}
      visibility={game?.visibility ?? visibility}
      league={game?.league}
      online={online}
      savingVisibility={actions.visibility.pending}
      leavingLeague={actions.consent.pending}
      errors={{ visibility: actions.visibility.error, league: actions.consent.error, notifications: notifications?.error }}
      gameNotifications={notifications?.enabled}
      onGameNotifications={notifications?.onToggle}
      gamePhoto={notifications?.photo?.enabled}
      onGamePhoto={notifications?.photo?.onToggle}
      onCelebrations={(on) => gamePrefs.set({ celebrations: on })}
      onHidden={hide}
      onVisibility={actions.visibility.run}
      onLeaveLeague={() => actions.consent.run({ consent: false })}
      atmosphere={atmosphere === undefined ? undefined : { current: atmosphere.current, onChange: () => setChoosing(true), notice: atmosphereNotice }}
      invitations={invitations === undefined ? undefined : { current: game?.photo?.invitations ?? 'every', onChange: changeInvitations, notice: invitationsNotice }}
    />
    {choosing && atmosphere !== undefined ? <GameAtmosphereChoice current={atmosphere.current} tiles={atmosphere.tiles} onChoose={chooseAtmosphere} onClose={() => setChoosing(false)} /> : null}
    </>
  );
}

/**
 * Le geste composé. Si la passerelle REFUSE l'une de ses moitiés serveur (fermer
 * les visibilités, quitter la ligue), l'interrupteur se rouvre — côté compte
 * aussi : « masqué » alors que les autres voient encore serait la fausse promesse
 * que le hors-ligne évite déjà. Le refus se dit sous la section concernée.
 * `persist` écrit le réglage du compte ET la copie de l'appareil (optimiste,
 * retour arrière sur refus) : `setGameHidden` en production.
 */
export function hideGame({
  on,
  progress,
  actions,
  persist = setGameHidden,
}: {
  readonly on: boolean;
  readonly progress: EngagementWithGame;
  readonly actions: GameV2Actions;
  readonly persist?: (hidden: boolean) => Promise<GameHiddenOutcome>;
}): void {
  void persist(on);
  if (!on) return;
  const reopen = (): void => void persist(false);
  if (progress.game?.visibility !== undefined) actions.visibility.run(CLOSED, { onError: reopen });
  if (progress.game?.league?.access === 'open') actions.consent.run({ consent: false }, { onError: reopen });
}

/**
 * LA CARTE « NOTIFICATIONS DU JEU » (#9490, #10268) — les deux interrupteurs de compte, lus dans les réglages de
 * l'application (cache-first) et écrits en optimiste par `performPreferenceEdit` : chacun n'écrit QUE sa clé.
 * Hors ligne, rien ne part et la carte le dit ; un refus se dit sous la carte.
 */
export function useGameNotifications(deps: PreferenceActionDeps): GameNotificationsCard {
  const preferences = useQuery({ ...appPreferencesQueryOptions(deps), enabled: true }, deps.queryClient);
  const [error, setError] = useState<string | undefined>(undefined);
  const edit = (patch: Pick<PreferencesPatch, 'gameEnabled' | 'gamePhotoEnabled'>): void => {
    setError(undefined);
    void performPreferenceEdit({ patch, deps }).then((outcome) => {
      if (outcome.status === 'offline') setError(gameText('game.offline.action'));
      if (outcome.status === 'refused') setError(gameErrorMessage(undefined));
    });
  };
  return {
    enabled: preferences.data?.gameEnabled,
    onToggle: (on) => edit({ gameEnabled: on }),
    error,
    photo: { enabled: preferences.data?.gamePhotoEnabled, onToggle: (on) => edit({ gamePhotoEnabled: on }) },
  };
}

function ReglagesScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  const settings = useGameSettings(true);
  const atmosphere = useAtmosphereGate(progress.game, { tiles: true });
  const notifications = useGameNotifications({ ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine });
  return (
    <ReglagesBody
      progress={progress}
      actions={actions}
      online={online}
      hide={(on) => hideGame({ on, progress, actions })}
      visibility={settings.data?.visibility}
      notifications={notifications}
      atmosphere={atmosphere}
      invitations={setPhotoInvitations}
    />
  );
}

export default function ProgressionReglagesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage(), 'progression');
  return (
    <ProgressionPage titre={gameText('game.settings.title')} teinte={GAME_BRAND} compte={() => null}>
      {(progress) => <ReglagesScreenBody progress={progress} />}
    </ProgressionPage>
  );
}
