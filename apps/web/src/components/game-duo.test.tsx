import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import type { GameDuoBlock } from '@meeshy/shared/types/game';

import { gameBlockWithExtrasFixture } from '@/lib/api/game-fixture';
import { buttonNamed, createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { GameDuo, type GameDuoProps } from './game-duo';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click } = createActMounter();

beforeAll(() => {
  ensureHappyDomRegistered({ url: 'http://localhost/me/progression/ligue' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});
afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});
afterEach(unmountAll);

const text = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
const duo = (patch: Partial<GameDuoBlock> = {}): GameDuoBlock => {
  const block = gameBlockWithExtrasFixture().duo;
  if (block === undefined) throw new Error('la fixture porte le duo');
  return { ...block, unlocked: true, ...patch };
};
const NONE = { status: 'none', duoId: null, role: null, partner: null, mission: null, progress: null, reward: null } as const;
const friends = [{ id: 'friend-1', displayName: 'Amina' }, { id: 'friend-2', displayName: 'Léa' }];

const props = (patch: Partial<GameDuoProps> = {}): GameDuoProps => ({
  duo: duo(),
  levelRecord: 25,
  friends,
  online: true,
  busy: false,
  onInvite: () => undefined,
  onAccept: () => undefined,
  onAbandon: () => undefined,
  ...patch,
});

/**
 * LA MISSION EN DUO (#9385) — jamais ouverte, invitée, active, réussie. Aucune
 * pression : l’écran lit l’état, il n’envoie rien. La mission, la part du
 * partenaire et la récompense viennent du bloc servi.
 */
describe('un duo actif', () => {
  const html = renderToStaticMarkup(<GameDuo {...props()} />);

  test('la mission, ma part, celle du partenaire par son nom, et la barre commune', () => {
    const t = text(html);
    expect(t).toContain('Envoyer 40 messages');
    expect(t).toContain('Toi : 22 sur 40');
    expect(t).toContain('Amina : 31 sur 40');
    expect(t).toContain('À deux : 53 sur 80');
  });

  test('la récompense dit comment elle double', () => {
    expect(text(html)).toContain('Doublée si vous finissez chacun votre part.');
  });

  test('on peut le quitter à tout moment', () => {
    expect(html).toContain('data-game-duo-abandon');
  });

  test('une part qui dépasse sa cible ne déborde pas', () => {
    const over = duo({ progress: { mine: 90, partner: 31, common: 121, mineDone: true, partnerDone: false, bothDone: false } });
    expect(text(renderToStaticMarkup(<GameDuo {...props({ duo: over })} />))).toContain('Toi : 40 sur 40');
  });
});

describe('les autres états', () => {
  test('verrouillé : le niveau 20 des DEUX et le niveau record de la personne', () => {
    const t = text(renderToStaticMarkup(<GameDuo {...props({ duo: duo({ unlocked: false, ...NONE }), levelRecord: 12 })} />));
    expect(t).toContain('s’ouvre au niveau 20, pour vous deux');
    expect(t).toContain('Tu es au niveau 12');
  });

  test('jamais ouvert : les amis acceptés se proposent par leur nom', () => {
    const html = renderToStaticMarkup(<GameDuo {...props({ duo: duo(NONE) })} />);
    expect(text(html)).toContain('Inviter Amina');
    expect(text(html)).toContain('Inviter Léa');
  });

  test('sans ami accepté : on le dit', () => {
    expect(text(renderToStaticMarkup(<GameDuo {...props({ duo: duo(NONE), friends: [] })} />))).toContain('Il te faut un ami accepté');
  });

  test('inviter : un geste, avec l’ami choisi', async () => {
    const picked: string[] = [];
    const host = await mount(<GameDuo {...props({ duo: duo(NONE), onInvite: (friend) => picked.push(friend.id) })} />);
    await click(buttonNamed(host, 'Inviter Léa'));
    expect(picked).toEqual(['friend-2']);
  });

  test('invitation envoyée : on attend, on peut annuler', () => {
    const html = renderToStaticMarkup(<GameDuo {...props({ duo: duo({ status: 'invited', role: 'inviter', mission: null, progress: null, reward: null }) })} />);
    expect(text(html)).toContain('Invitation envoyée à Amina');
    expect(text(html)).toContain('Annuler l’invitation');
    expect(html).not.toContain('data-game-duo-accept');
  });

  test('invitation reçue : accepter ou décliner', async () => {
    const accepted: string[] = [];
    const received = duo({ status: 'invited', role: 'invitee', mission: null, progress: null, reward: null });
    const host = await mount(<GameDuo {...props({ duo: received, onAccept: (id) => accepted.push(id) })} />);
    expect(host.textContent).toContain('Amina t’invite');
    await click(buttonNamed(host, 'Accepter'));
    expect(accepted).toEqual(['duo-1']);
    expect(buttonNamed(host, 'Décliner')).not.toBeNull();
  });

  test('réussi : la récompense doublée se dit', () => {
    const done = duo({ status: 'completed', progress: { mine: 40, partner: 40, common: 80, mineDone: true, partnerDone: true, bothDone: true }, reward: { points: 600, doubled: true } });
    const t = text(renderToStaticMarkup(<GameDuo {...props({ duo: done })} />));
    expect(t).toContain('Récompense doublée : 600 points');
    expect(t).toContain('Duo réussi cette semaine.');
  });

  test('abandonné : pas de nouvelle invitation avant la semaine prochaine', () => {
    const html = renderToStaticMarkup(<GameDuo {...props({ duo: duo({ ...NONE, status: 'abandoned' }) })} />);
    expect(text(html)).toContain('Un nouveau duo s’ouvre la semaine prochaine');
    expect(html).not.toContain('data-game-duo-invite');
  });

  test('hors ligne : les gestes sont suspendus et l’écran le dit', async () => {
    const host = await mount(<GameDuo {...props({ duo: duo(NONE), online: false })} />);
    expect(host.querySelector<HTMLButtonElement>('[data-game-duo-invite]')?.disabled).toBe(true);
    expect(host.textContent).toContain('Hors ligne');
  });

  test('un refus de la passerelle se lit', () => {
    expect(text(renderToStaticMarkup(<GameDuo {...props({ error: 'Le duo se joue entre amis acceptés.' })} />))).toContain('entre amis acceptés');
  });
});
