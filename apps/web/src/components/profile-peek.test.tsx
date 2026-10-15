import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { GAME_V2_QUERY_PREFIX } from '@/lib/api/game-v2-queries';
import { appQueryClient } from '@/lib/api/query-client';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { closeProfilePeek, peekProfile, registerProfilePeekHost, useProfilePeek } from '@/lib/view/profile-peek';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { Avatar } from './avatar';
import { PersonName } from './person-name';
import { ProfilePeekSheet } from './profile-peek-sheet';
import { RichText } from './rich-text';

/**
 * **LE PROFIL D'UN AUTEUR S'OUVRE LÀ OÙ L'ON EST** (parité iOS, directive
 * porteur du 2026-09-25). Sur iOS, toucher l'avatar ou le nom d'un auteur —
 * fil, story, commentaire — présente `UserProfileSheet` par-dessus l'écran.
 * Le web quittait l'écran pour `/u/$username` : on perdait sa place dans le
 * fil, et la story qu'on regardait.
 *
 * Ce qui se mesure ici : le toucher OUVRE LA FEUILLE sans changer l'adresse
 * dès qu'un hôte écoute (la coquille en monte un sur toutes les routes), et
 * reste un lien quand aucun n'écoute — jamais un contrôle sans effet. La
 * feuille, elle, montre la personne, ses gestes, et la porte vers la page.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/**
 * UN TÉMOIN NE LAISSE RIEN EN FILE. La feuille porte le jeu, chargé à la
 * demande (`lazy`, catalogue en Suspense, requête dont la fixture
 * s'importe), et `@tanstack/query` notifie ses abonnés par un
 * `setTimeout(0)` : ce qu'un témoin déclenche peut donc retomber APRÈS
 * lui, hors `act`. React confiait alors le rendu au vrai Scheduler, dont le
 * rappel lisait `window.event` après le désenregistrement de happy-dom —
 * l'« Unhandled error between tests » qui rougissait « Test web »
 * (run 38119734883), sans nommer aucun témoin. La garde laisse passer UNE
 * macrotâche HORS `act` avant le démontage — exprès : ce qui restait en
 * file se pose alors et se fait entendre — puis exige qu'aucune mise à jour
 * n'ait échappé à `act`.
 */
const leakedUpdates: string[] = [];
const reportError = console.error;

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/c/c-direct-kwame' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  console.error = (...args: unknown[]) => {
    const [first] = args;
    if (typeof first === 'string' && first.includes('not wrapped in act')) leakedUpdates.push(first.split('\n')[0] ?? first);
    reportError(...args);
  };
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  console.error = reportError;
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;
let unregister: (() => void) | null = null;

afterEach(async () => {
  await new Promise((resolve) => setTimeout(resolve, 0));
  const leaked = leakedUpdates.splice(0);
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  unregister?.();
  unregister = null;
  closeProfilePeek();
  appQueryClient.clear();
  window.history.replaceState(null, '', '/c/c-direct-kwame');
  expect(leaked).toEqual([]);
});

async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(<QueryClientProvider client={appQueryClient}>{node}</QueryClientProvider>);
  });
  await settleRound();
  return container;
}

/** Un tour : ce qui retombe pendant l'attente (notification de requête, `lazy` résolu) se pose DANS la portée. */
const settleRound = (): Promise<void> =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

/**
 * LA FEUILLE N'EST PRÊTE QUE QUAND LA BANNIÈRE DU JEU A SA RÉPONSE. Ses
 * sauts asynchrones s'ENCHAÎNENT (`lazy` → catalogue → requête), et React ne
 * rend ce qu'une portée `act` a mis en file qu'à la FIN de cette portée :
 * attendre plus longtemps DANS un seul `act` ne fait rien avancer — d'où une
 * portée par tour, et un dernier tour pour la notification de la réponse.
 */
const GAME_SETTLE_ROUNDS = 50;

const gameSettled = (): boolean =>
  appQueryClient
    .getQueryCache()
    .findAll({ queryKey: [...GAME_V2_QUERY_PREFIX, 'user-game'] })
    .some((query) => query.state.status !== 'pending' && query.state.fetchStatus === 'idle');

async function mountSheet(node: React.ReactNode): Promise<HTMLDivElement> {
  const container = await mount(node);
  for (let round = 0; !gameSettled() || appQueryClient.isFetching() > 0; round += 1) {
    if (round === GAME_SETTLE_ROUNDS) throw new Error('la bannière du jeu de la feuille n’a jamais reçu sa réponse');
    await settleRound();
  }
  // La réponse posée, query-core la NOTIFIE au tour suivant (`setTimeout(0)`).
  await settleRound();
  return container;
}

let seen: string | null = null;
function PeekProbe() {
  seen = useProfilePeek();
  return null;
}

/** Le geste, puis le tour où retombe ce qu'il a mis en file — dans la même portée. */
async function interact(gesture: () => void): Promise<void> {
  await act(async () => {
    gesture();
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const tap = (el: Element | null): Promise<void> =>
  interact(() => {
    el?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
  });

const text = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/\s+/gu, ' ').trim();

describe('le toucher ouvre la feuille, et l’adresse ne bouge pas', () => {
  const surfaces = {
    'l’avatar d’un auteur (fil, story, commentaire)': (
      <Avatar initials="KM" color="#4455ff" size={32} name="Kwame Mensah" profileUsername="kwame-mensah" />
    ),
    'le nom d’un auteur': <PersonName name="Kwame Mensah" username="kwame-mensah" />,
    'une @mention dans un texte': <RichText text="Merci @kwame-mensah !" />,
  } as const;

  for (const [label, node] of Object.entries(surfaces)) {
    test(label, async () => {
      unregister = registerProfilePeekHost();
      const el = await mount(
        <>
          <PeekProbe />
          {node}
        </>,
      );
      const link = el.querySelector('a[href="/u/kwame-mensah"]');
      expect(link).not.toBeNull();
      await tap(link);
      expect(seen).toBe('kwame-mensah');
      expect(window.location.pathname).toBe('/c/c-direct-kwame');
    });
  }

  test('sans hôte à l’écoute, le lien mène à la page — jamais un toucher sans effet', async () => {
    const el = await mount(<PersonName name="Kwame Mensah" username="kwame-mensah" />);
    expect(peekProfile('kwame-mensah')).toBe(false);
    await tap(el.querySelector('a[href="/u/kwame-mensah"]'));
    expect(window.location.pathname).toBe('/u/kwame-mensah');
  });

  test('l’hôte démonté referme la feuille qu’il portait', () => {
    const release = registerProfilePeekHost();
    expect(peekProfile('kwame-mensah')).toBe(true);
    release();
    expect(peekProfile('kwame-mensah')).toBe(false);
  });
});

describe('la feuille montre la personne, ses gestes, et la porte vers la page', () => {
  test('identité, gestes de relation et lien vers le profil complet', async () => {
    const el = await mountSheet(<ProfilePeekSheet username="kwame-mensah" onClose={() => {}} />);
    expect(el.querySelector('dialog')).not.toBeNull();
    expect(text(el.querySelector('[data-user-hero] p'))).toBe('Kwame Mensah');
    expect([...el.querySelectorAll('[data-profile-action]')].map((n) => n.getAttribute('data-profile-action'))).toEqual([
      'add',
      'write',
      'block',
      'report',
    ]);
    const page = el.querySelector('[data-profile-peek-open-page]');
    expect(page?.getAttribute('href')).toBe('/u/kwame-mensah');
    expect(text(page)).toBe('Ouvrir le profil complet');
  });

  test('la porte vers la page quitte l’écran — elle n’ouvre pas une seconde feuille', async () => {
    unregister = registerProfilePeekHost();
    const el = await mountSheet(<ProfilePeekSheet username="kwame-mensah" onClose={() => {}} />);
    await tap(el.querySelector('[data-profile-peek-open-page]'));
    expect(window.location.pathname).toBe('/u/kwame-mensah');
  });

  test('la porte vers la page referme la feuille DANS le geste, pas un effet plus tard', async () => {
    unregister = registerProfilePeekHost();
    peekProfile('kwame-mensah');
    const el = await mountSheet(
      <>
        <PeekProbe />
        <ProfilePeekSheet username="kwame-mensah" onClose={closeProfilePeek} />
      </>,
    );
    expect(seen).toBe('kwame-mensah');
    await tap(el.querySelector('[data-profile-peek-open-page]'));
    expect(seen).toBeNull();
    expect(window.location.pathname).toBe('/u/kwame-mensah');
  });

  test('la fermeture passe par le dialogue', async () => {
    let closed = 0;
    const el = await mountSheet(<ProfilePeekSheet username="kwame-mensah" onClose={() => (closed += 1)} />);
    await interact(() => el.querySelector('dialog')?.close());
    expect(closed).toBe(1);
  });
});
