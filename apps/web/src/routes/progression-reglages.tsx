import { useState } from 'react';

import { useQuery } from '@tanstack/react-query';

import type { GameVisibility } from '@meeshy/shared/types/game';

import { GameSettings } from '@/components/game-settings';
import { GAME_BRAND } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import type { GameHiddenOutcome } from '@/lib/game/game-hidden';
import { appPreferencesQueryOptions } from '@/lib/api/app-preferences';
import { performPreferenceEdit } from '@/lib/api/app-preferences-actions';
import { apiDeps } from '@/lib/api/deps';
import { appQueryClient } from '@/lib/api/query-client';
import { gamePrefs, useGamePrefs } from '@/lib/game/preferences';
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
 */
const CLOSED: { readonly showcase: 'me'; readonly rank: 'me'; readonly treasury: 'me'; readonly atlas: 'me' } = {
  showcase: 'me',
  rank: 'me',
  treasury: 'me',
  atlas: 'me',
};

export function ReglagesBody({
  progress,
  actions,
  online,
  hide,
  visibility,
  notifications,
}: {
  readonly progress: EngagementWithGame;
  readonly actions: GameV2Actions;
  readonly online: boolean;
  readonly hide: (on: boolean) => void;
  /** Les visibilités lues par `GET /me/game/privacy` ; absentes, celles du bloc `game`. */
  readonly visibility?: GameVisibility | undefined;
  /** Les notifications du jeu (#9490) — absent : pas de carte. */
  readonly notifications?: { readonly enabled: boolean | undefined; readonly onToggle: (on: boolean) => void; readonly error?: string | undefined } | undefined;
}) {
  const prefs = useGamePrefs();
  const game = progress.game;
  return (
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
      onCelebrations={(on) => gamePrefs.set({ celebrations: on })}
      onHidden={hide}
      onVisibility={actions.visibility.run}
      onLeaveLeague={() => actions.consent.run({ consent: false })}
    />
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

function ReglagesScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  const settings = useGameSettings(true);
  const preferences = useQuery({ ...appPreferencesQueryOptions(apiDeps), enabled: true }, appQueryClient);
  const [notificationsError, setNotificationsError] = useState<string | undefined>(undefined);
  const toggleNotifications = (on: boolean): void => {
    setNotificationsError(undefined);
    void performPreferenceEdit({
      patch: { gameEnabled: on },
      deps: { ...apiDeps, queryClient: appQueryClient, isOnline: () => navigator.onLine },
    }).then((outcome) => {
      if (outcome.status === 'offline') setNotificationsError(gameText('game.offline.action'));
      if (outcome.status === 'refused') setNotificationsError(gameErrorMessage(undefined));
    });
  };
  return (
    <ReglagesBody
      progress={progress}
      actions={actions}
      online={online}
      hide={(on) => hideGame({ on, progress, actions })}
      visibility={settings.data?.visibility}
      notifications={{ enabled: preferences.data?.gameEnabled, onToggle: toggleNotifications, error: notificationsError }}
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
