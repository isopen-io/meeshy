import { GameHiddenCard } from '@/components/game-hidden-card';
import { GAME_BRAND, GAME_CARD, GAME_INK_2 } from '@/components/game-surface';
import { ConceptEmblem, ConceptFacts, ProgressionRow } from '@/components/progression-concept';
import type { EngagementWithGame } from '@/lib/api/engagement';
import { useGamePrefs } from '@/lib/game/preferences';
import { suspendForGameCatalog } from '@/lib/i18n-game-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { gameText } from '@/lib/view/game-copy';
import { conceptView, shownConcepts, shownProgress } from '@/lib/view/progression-concepts';
import { useMinute } from '@/lib/view/use-minute';
import { ProgressionPage } from '@/routes/progression-page';

/**
 * LE TABLEAU DE BORD (#9563) — toutes les données, regroupées par concept, dans
 * l'ordre de la première page. Un bloc compact par concept : sa tête (emblème,
 * nom, valeur) ouvre la fiche, ses données sont celles de « Où j'en suis ».
 * LECTURE SEULE : aucun geste ici, ils vivent dans les fiches.
 *
 * Cache-first : la même requête que la première page, déjà en cache — aucun
 * squelette à l'ouverture.
 */
export function TableauBody({ progress, now }: { readonly progress: EngagementWithGame; readonly now?: Date }) {
  const minute = useMinute();
  const clock = now ?? new Date(minute * 60_000);
  const prefs = useGamePrefs();
  const hidden = progress.game !== undefined && prefs.hidden;
  const view = shownProgress(progress, hidden);
  return (
    <>
      {hidden ? <GameHiddenCard /> : null}
      <p className="px-1 text-caption" style={{ color: GAME_INK_2 }}>
        {gameText('game.dashboard.hint')}
      </p>
      {shownConcepts(progress, hidden).map((key) => {
        const concept = conceptView(key, view, clock);
        return (
          <section key={key} data-dashboard-block={key} aria-label={concept.name} className="flex flex-col rounded-card" style={{ backgroundColor: GAME_CARD }}>
            <ProgressionRow
              target={{ to: 'progressionConcept', concept: key }}
              marker={key}
              emblem={<ConceptEmblem concept={key} view={view} size={36} />}
              name={concept.name}
              value={concept.value}
            />
            <div className="px-4 pb-2">
              <ConceptFacts facts={concept.facts} />
            </div>
          </section>
        );
      })}
    </>
  );
}

export default function ProgressionTableauScreen() {
  suspendForGameCatalog(currentInterfaceLanguage());
  return (
    <ProgressionPage titre={gameText('game.dashboard.title')} teinte={GAME_BRAND} compte={() => null}>
      {(progress) => <TableauBody progress={progress} />}
    </ProgressionPage>
  );
}
