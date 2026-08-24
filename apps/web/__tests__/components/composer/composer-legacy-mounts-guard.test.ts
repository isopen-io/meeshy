/**
 * Garde G1 (Task W7) — le fil ne monte plus AUCUN des trois composers hérités
 * que la porte `feedComposer`/`moodChip` remplace.
 *
 * Modèle : `__tests__/lib/composer-door-single-source.test.ts` (marche `fs`,
 * mêmes exclusions). Cette garde est NÉGATIVE et ÉNUMÉRÉE — trois chemins
 * nommés, jamais un motif large — pour la raison que documente
 * `MeeshyComposer.tsx` (§ Ce que CE fichier ne peint pas) : compter
 * littéralement « au plus un composer monté » interdirait la porte `moodChip`
 * en dialogue à côté du composer inline permanent du fil, c'est-à-dire
 * précisément ce que ce lot bascule.
 *
 * Ce que ça protège : qu'aucune régression future (un correctif pressé, un
 * merge automatique) ne réintroduise un mount de
 * `<PostComposer`/`<AudioPostComposer`/`<StatusComposer` dans
 * `PostsFeedScreen.tsx` — les trois portes que W7 a fait basculer vers
 * `MeeshyComposer`. `<StoryComposer` n'est PAS dans cette liste : la porte
 * `storyTray` reste montée sur son dialogue hérité, et `StoryComposer` reste
 * un mount légitime.
 *
 * Ce report n'est adossé à AUCUNE ligne du plan — le §G, seule liste
 * opposable de ce que le lot 6 ne fait pas, ne dit que « il ne RETIRE pas
 * `StoryComposer.tsx` », ce qui parle de la suppression (W9), pas de la
 * bascule de la porte. La raison du report est technique et se dit ici plutôt
 * que de s'abriter derrière une référence : l'enrobage hérité déplace le
 * bouton Publier dans l'en-tête du dialogue (`renderPublishHeader`), un canal
 * que `MeeshyComposer` ne relaie pas ; basculer `storyTray` sans lui
 * redescendrait le CTA sous six rangées d'outils. Le format story est, lui,
 * joignable ET publiable depuis le composer inline du fil depuis le
 * correctif R1 (`composer-feed-story-publish.test.tsx`).
 *
 * Une garde de comptage brut (« zéro JSX `<...Composer` en dehors de
 * MeeshyComposer/StoryComposer ») serait verte pour la mauvaise raison le
 * jour où un quatrième composer hérité apparaît sous un nom qu'elle ne
 * connaît pas — d'où l'énumération explicite plutôt qu'un motif.
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../../..');
const HOST_FILE = 'components/feed/PostsFeedScreen.tsx';

const RETIRED_MOUNTS = ['<PostComposer', '<AudioPostComposer', '<StatusComposer'] as const;

function hostSource(): string {
  return fs.readFileSync(path.join(WEB_ROOT, HOST_FILE), 'utf8');
}

describe('Garde G1 — PostsFeedScreen ne monte plus aucun des trois composers hérités bascules par W7', () => {
  it.each(RETIRED_MOUNTS)('ne contient aucun mount JSX %s', (mount) => {
    expect(hostSource()).not.toContain(mount);
  });

  it('monte toujours `<StoryComposer` — la porte storyTray reste sciemment non basculée (W7 bis)', () => {
    expect(hostSource()).toContain('<StoryComposer');
  });

  it('monte `<MeeshyComposer` — la surface qui remplace les trois composers retirés', () => {
    expect(hostSource()).toContain('<MeeshyComposer');
  });
});
