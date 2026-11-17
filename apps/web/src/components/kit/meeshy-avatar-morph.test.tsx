import { afterEach, describe, expect, test } from 'bun:test';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyAvatarMorph, MeeshyAvatarMorphScope, meeshyAvatarMorphJewels, meeshyAvatarMorphRecipe, useMeeshyAvatarMorph } from './meeshy-avatar-morph';

const { mount, act } = kitMount();
type TransitionHost = { startViewTransition?: (update: () => void) => { finished: Promise<void> } };
const host = (): TransitionHost => document as unknown as TransitionHost;

afterEach(() => {
  delete host().startViewTransition;
});

const installTransitions = (): { calls: number } => {
  const log = { calls: 0 };
  host().startViewTransition = (update) => {
    log.calls += 1;
    update();
    return { finished: Promise.resolve() };
  };
  return log;
};

describe('meeshyAvatarMorphRecipe — la recette en valeurs', () => {
  test('avec portée et capacité : un voyage partagé sur motion.travel', () => {
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true })).toMatchObject({ mode: 'shared', token: 'travel', durationMs: 560 });
  });

  test('sans portée, sans capacité ou sous mouvement réduit : fondu enchaîné sur place', () => {
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: false, canTravel: true }).mode).toBe('crossfade');
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: false }).mode).toBe('crossfade');
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true, reduceMotion: true }).mode).toBe('crossfade');
  });

  test('piloté par progress : le voyage suit la valeur, bornée de 0 à 1', () => {
    expect(meeshyAvatarMorphRecipe({ from: 112, to: 36, hasScope: true, canTravel: true, progress: 0.4 })).toMatchObject({ mode: 'driven', progress: 0.4 });
    expect(meeshyAvatarMorphRecipe({ from: 112, to: 36, hasScope: true, canTravel: true, progress: 3 }).progress).toBe(1);
  });

  test('l’échelle de départ et d’arrivée suit le rapport des tailles', () => {
    const recipe = meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true });
    expect(recipe.scaleFrom).toBeCloseTo(44 / 112, 5);
    expect(recipe.scaleTo).toBe(1);
  });

  test('le trajet : droit si le déplacement est vertical, arc s’il est en diagonale, ou celui qu’on impose', () => {
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true, displacement: { x: 4, y: 200 } }).path).toBe('straight');
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true, displacement: { x: 180, y: 160 } }).path).toBe('arc');
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true, path: 'straight', displacement: { x: 180, y: 160 } }).path).toBe('straight');
  });

  test('l’anneau et le badge : l’anneau s’efface en vol sauf ringTravels, le badge part avant et revient après', () => {
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true })).toMatchObject({ ringInFlight: 0, badgeInFlight: 0, badgeLeadMs: 80, badgeReturnMs: 120 });
    expect(meeshyAvatarMorphRecipe({ from: 44, to: 112, hasScope: true, canTravel: true, ringTravels: true, badgeTravels: true })).toMatchObject({ ringInFlight: 1, badgeInFlight: 1 });
  });

  test('les emplacements : anneau à 4,5 % (2 au moins), badge à 25 % (14 au moins)', () => {
    expect(meeshyAvatarMorphJewels(112)).toMatchObject({ ringGap: 5.04, badge: 28 });
    expect(meeshyAvatarMorphJewels(36)).toMatchObject({ ringGap: 2, badge: 14 });
  });
});

describe('MeeshyAvatarMorph — l’emplacement', () => {
  test('le contenu est celui de l’hôte, dans un cadre rond de la taille donnée', () => {
    const container = mount(<MeeshyAvatarMorph id="p-7f3a" size={44}><i data-face="">LM</i></MeeshyAvatarMorph>);
    const slot = container.querySelector('[data-kit-avatar-morph]') as HTMLElement;
    expect(slot.getAttribute('data-morph-id')).toBe('p-7f3a');
    expect(slot.style.getPropertyValue('--kit-morph-size')).toBe('2.75rem');
    expect(slot.querySelector('[data-face]')).not.toBeNull();
  });

  test('l’anneau et le badge ont leurs emplacements, l’anneau ne se peint que s’il est donné', () => {
    const container = mount(<MeeshyAvatarMorph id="a" size={112} ring={<b data-ring="" />} badge={<b data-badge="" />}><i /></MeeshyAvatarMorph>);
    expect(container.querySelector('[data-kit-morph-ring] [data-ring]')).not.toBeNull();
    expect(container.querySelector('[data-kit-morph-badge] [data-badge]')).not.toBeNull();
    expect(mount(<MeeshyAvatarMorph id="a" size={112}><i /></MeeshyAvatarMorph>).querySelector('[data-kit-morph-ring]')).toBeNull();
  });

  test('progress pose --kit-morph-progress', () => {
    const container = mount(<MeeshyAvatarMorph id="a" size={36} progress={0.25}><i /></MeeshyAvatarMorph>);
    expect((container.querySelector('[data-kit-avatar-morph]') as HTMLElement).style.getPropertyValue('--kit-morph-progress')).toBe('0.25');
  });
});

function Trigger({ id, onDone }: { readonly id: string; readonly onDone: (ran: boolean) => void }) {
  const morph = useMeeshyAvatarMorph();
  return <button type="button" data-go="" onClick={() => onDone(morph.travel(id, () => {}))} />;
}

describe('MeeshyAvatarMorphScope — le voyage', () => {
  test('avec la capacité du navigateur : un seul avatar voyage, nommé le temps du voyage', () => {
    const log = installTransitions();
    let ran: boolean | null = null;
    const container = mount(
      <MeeshyAvatarMorphScope>
        <MeeshyAvatarMorph id="p-1" size={44}><i /></MeeshyAvatarMorph>
        <Trigger id="p-1" onDone={(value) => (ran = value)} />
      </MeeshyAvatarMorphScope>,
    );
    act(() => (container.querySelector('[data-go]') as HTMLButtonElement).click());
    expect(log.calls).toBe(1);
    expect(ran as boolean | null).toBe(true);
  });

  test('sans capacité : la mise à jour se joue seule, le voyage le dit', () => {
    let ran: boolean | null = null;
    const container = mount(
      <MeeshyAvatarMorphScope>
        <MeeshyAvatarMorph id="p-1" size={44}><i /></MeeshyAvatarMorph>
        <Trigger id="p-1" onDone={(value) => (ran = value)} />
      </MeeshyAvatarMorphScope>,
    );
    act(() => (container.querySelector('[data-go]') as HTMLButtonElement).click());
    expect(ran as boolean | null).toBe(false);
  });

  test('un doublon d’identité dans la portée coupe le voyage', () => {
    const log = installTransitions();
    let ran: boolean | null = null;
    const container = mount(
      <MeeshyAvatarMorphScope>
        <MeeshyAvatarMorph id="p-1" size={44}><i /></MeeshyAvatarMorph>
        <MeeshyAvatarMorph id="p-1" size={112}><i /></MeeshyAvatarMorph>
        <Trigger id="p-1" onDone={(value) => (ran = value)} />
      </MeeshyAvatarMorphScope>,
    );
    act(() => (container.querySelector('[data-go]') as HTMLButtonElement).click());
    expect(log.calls).toBe(0);
    expect(ran as boolean | null).toBe(false);
  });

  test('un emplacement désactivé ne part ni ne reçoit', () => {
    const log = installTransitions();
    let ran: boolean | null = null;
    const container = mount(
      <MeeshyAvatarMorphScope>
        <MeeshyAvatarMorph id="p-1" size={44} isEnabled={false}><i /></MeeshyAvatarMorph>
        <Trigger id="p-1" onDone={(value) => (ran = value)} />
      </MeeshyAvatarMorphScope>,
    );
    act(() => (container.querySelector('[data-go]') as HTMLButtonElement).click());
    expect(log.calls).toBe(0);
    expect(ran as boolean | null).toBe(false);
  });

  test('sans portée, le crochet rend un voyage qui ne part jamais', () => {
    let ran: boolean | null = null;
    const container = mount(<Trigger id="p-1" onDone={(value) => (ran = value)} />);
    act(() => (container.querySelector('[data-go]') as HTMLButtonElement).click());
    expect(ran as boolean | null).toBe(false);
  });
});
