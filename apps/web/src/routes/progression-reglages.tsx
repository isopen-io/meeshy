import { GameSettings } from '@/components/game-settings';
import { GAME_BRAND } from '@/components/game-surface';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { gamePrefs, useGamePrefs } from '@/lib/game/preferences';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { gameText } from '@/lib/view/game-copy';
import { useGameV2Actions, type GameV2Actions } from '@/routes/game-v2-actions';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LA PAGE « RÉGLAGES DU JEU » (#9481) — les célébrations, le mode « Jeu
 * masqué », qui voit quoi, la ligue publique. Cache-first (le bloc `game` du
 * hub) ; les réglages de visibilité et le départ de la ligue sont optimistes avec
 * retour arrière.
 *
 * « Jeu masqué » enchaîne ce que le contrat permet (voir `GameSettings`) : le
 * drapeau de l'appareil, les quatre visibilités à « moi seul », la sortie de la
 * ligue publique. Hors ligne, le geste est SUSPENDU (il ne ferait que la moitié
 * du travail : masquer ici sans fermer là-bas serait une fausse promesse) ; le
 * réafficher, lui, marche toujours et ne touche jamais au serveur.
 */
const CLOSED: { readonly showcase: 'me'; readonly rank: 'me'; readonly treasury: 'me'; readonly atlas: 'me' } = {
  showcase: 'me',
  rank: 'me',
  treasury: 'me',
  atlas: 'me',
};

export function ReglagesBody({ progress, actions, online, hide }: { readonly progress: EngagementWithGame; readonly actions: GameV2Actions; readonly online: boolean; readonly hide: (on: boolean) => void }) {
  const prefs = useGamePrefs();
  const game = progress.game;
  return (
    <GameSettings
      prefs={prefs}
      visibility={game?.visibility}
      league={game?.league}
      online={online}
      savingVisibility={actions.visibility.pending}
      leavingLeague={actions.consent.pending}
      errors={{ visibility: actions.visibility.error, league: actions.consent.error }}
      onCelebrations={(on) => gamePrefs.set({ celebrations: on })}
      onHidden={hide}
      onVisibility={actions.visibility.run}
      onLeaveLeague={() => actions.consent.run({ consent: false })}
    />
  );
}

/**
 * Le geste composé. Si la passerelle REFUSE l'une de ses moitiés serveur (fermer
 * les visibilités, quitter la ligue), l'interrupteur se rouvre : « masqué » sur
 * l'appareil alors que les autres voient encore serait la fausse promesse que
 * le hors-ligne évite déjà. Le refus se dit sous la section concernée.
 */
export function hideGame({ on, progress, actions }: { readonly on: boolean; readonly progress: EngagementWithGame; readonly actions: GameV2Actions }): void {
  gamePrefs.set({ hidden: on });
  if (!on) return;
  const reopen = (): void => gamePrefs.set({ hidden: false });
  if (progress.game?.visibility !== undefined) actions.visibility.run(CLOSED, { onError: reopen });
  if (progress.game?.league?.access === 'open') actions.consent.run({ consent: false }, { onError: reopen });
}

function ReglagesScreenBody({ progress }: { readonly progress: EngagementWithGame }) {
  const online = useOnline();
  const actions = useGameV2Actions();
  return <ReglagesBody progress={progress} actions={actions} online={online} hide={(on) => hideGame({ on, progress, actions })} />;
}

export default function ProgressionReglagesScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage titre={gameText('game.settings.title')} teinte={GAME_BRAND} compte={() => null}>
      {(progress) => <ReglagesScreenBody progress={progress} />}
    </ProgressionPage>
  );
}
