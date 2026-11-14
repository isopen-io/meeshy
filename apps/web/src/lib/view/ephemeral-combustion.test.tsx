import { readFileSync } from 'node:fs';
import { act } from 'react';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import {
  EPHEMERAL_BURN_FADE_MS,
  EPHEMERAL_BURN_FULL_MS,
  EPHEMERAL_BURN_IGNITION_END,
  EPHEMERAL_BURN_SPREAD_END,
} from '@meeshy/shared/utils/ephemeral-burn';

import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import {
  DESTRUCTION_MS,
  announceDestruction,
  burnFrontOf,
  destructionWindowMs,
  useEphemeralDestruction,
  type EphemeralDestruction,
} from './ephemeral-destruction';

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
const held: { matchMedia?: typeof window.matchMedia } = {};

afterEach(() => {
  mounter.unmountAll();
  if (held.matchMedia !== undefined) window.matchMedia = held.matchMedia;
});

const reduceMotion = (reduced: boolean): void => {
  held.matchMedia ??= window.matchMedia;
  window.matchMedia = ((query: string) =>
    ({
      matches: reduced && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
};

const wait = (ms: number) =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });

describe('la fenêtre de combustion vient de la loi partagée (#18556)', () => {
  test('la fenêtre pleine est celle de la loi', () => {
    expect(DESTRUCTION_MS).toBe(EPHEMERAL_BURN_FULL_MS);
    expect(destructionWindowMs(false)).toBe(EPHEMERAL_BURN_FULL_MS);
  });

  test('« réduire les animations » donne le fondu court de la loi', () => {
    expect(destructionWindowMs(true)).toBe(EPHEMERAL_BURN_FADE_MS);
  });
});

describe('le feu part du bord d’où vient le vent, sans capteur', () => {
  test('mon message (à droite) : le front avance vers la droite', () => {
    expect(burnFrontOf({ isMine: true, rtl: false })).toBe('right');
  });

  test('le message d’autrui (à gauche) : le front avance vers la gauche', () => {
    expect(burnFrontOf({ isMine: false, rtl: false })).toBe('left');
  });

  test('en écriture de droite à gauche, les côtés s’inversent à l’écran', () => {
    expect(burnFrontOf({ isMine: true, rtl: true })).toBe('left');
    expect(burnFrontOf({ isMine: false, rtl: true })).toBe('right');
  });
});

function Probe({ onState }: { readonly onState: (state: EphemeralDestruction) => void }) {
  onState(useEphemeralDestruction());
  return null;
}

const mountProbe = async () => {
  const seen: { current: EphemeralDestruction | null } = { current: null };
  await mounter.mount(
    <Probe
      onState={(state) => {
        seen.current = state;
      }}
    />,
  );
  return seen;
};

describe('la bulle annoncée brûle, puis est retirée', () => {
  test('annoncée : en feu ; la fenêtre passée : retirée', async () => {
    reduceMotion(false);
    const seen = await mountProbe();
    await act(async () => announceDestruction('m-feu'));

    expect(seen.current?.destroyingIds.has('m-feu')).toBe(true);
    expect(seen.current?.expiredIds.has('m-feu')).toBe(false);

    await wait(EPHEMERAL_BURN_FADE_MS + 50);
    expect(seen.current?.destroyingIds.has('m-feu')).toBe(true);

    await wait(EPHEMERAL_BURN_FULL_MS - EPHEMERAL_BURN_FADE_MS);
    expect(seen.current?.destroyingIds.has('m-feu')).toBe(false);
    expect(seen.current?.expiredIds.has('m-feu')).toBe(true);
  });

  test('mouvement réduit : retirée dès la fin du fondu, sans rangée vide qui traîne', async () => {
    reduceMotion(true);
    const seen = await mountProbe();
    await act(async () => announceDestruction('m-fondu'));
    expect(seen.current?.destroyingIds.has('m-fondu')).toBe(true);

    await wait(EPHEMERAL_BURN_FADE_MS + 50);
    expect(seen.current?.destroyingIds.has('m-fondu')).toBe(false);
    expect(seen.current?.expiredIds.has('m-fondu')).toBe(true);
  });
});

const css = readFileSync(new URL('../../styles/thread-protection.css', import.meta.url).pathname, 'utf8');

const blockOf = (opening: string): string => {
  const start = css.indexOf(opening);
  expect(start).toBeGreaterThanOrEqual(0);
  let depth = 0;
  for (let index = css.indexOf('{', start); index < css.length; index += 1) {
    if (css[index] === '{') depth += 1;
    if (css[index] === '}') depth -= 1;
    if (depth === 0) return css.slice(start, index + 1);
  }
  return css.slice(start);
};

const pct = (fraction: number): string => `${Math.round(fraction * 100)}%`;

describe('la feuille peint la loi', () => {
  test('la durée servie est celle de la loi, et le fondu sous mouvement réduit', () => {
    expect(blockOf('.ephemeral-destroying {')).toContain(`--ephemeral-destruction-ms: ${EPHEMERAL_BURN_FULL_MS}ms`);
    const reduced = blockOf('@media (prefers-reduced-motion: reduce) {\n  .ephemeral-destroying');
    expect(reduced).toContain(`--ephemeral-destruction-ms: ${EPHEMERAL_BURN_FADE_MS}ms`);
  });

  test('le front traverse la bulle entre la fin de l’ignition et la fin de la propagation', () => {
    const front = blockOf('@keyframes ephemeral-burn-front');
    expect(front).toContain(`${pct(EPHEMERAL_BURN_IGNITION_END)} {`);
    expect(front).toContain(`${pct(EPHEMERAL_BURN_SPREAD_END)} {`);
  });

  test('la rangée ne se replie qu’aux cendres, une fois les lettres brûlées', () => {
    const collapse = blockOf('@keyframes ephemeral-burn-collapse');
    expect(collapse).toContain(`${pct(EPHEMERAL_BURN_SPREAD_END)} {`);
  });

  test('le feu ne se peint que par transform, opacity et masque', () => {
    for (const name of ['ephemeral-burn-front', 'ephemeral-burn-ember', 'ephemeral-burn-sparks']) {
      const block = blockOf(`@keyframes ${name}`);
      const declared = [...block.matchAll(/([a-z-]+)\s*:/g)].map((found) => found[1] ?? '');
      expect(declared.every((property) => /^(?:-webkit-)?(?:mask-position|opacity|translate|scale|transform)$/.test(property))).toBe(true);
    }
  });

  test('aucune couleur en dur : le feu lit les jetons', () => {
    const fire = css.slice(css.indexOf('.ephemeral-destroying {')).replace(/\/\*[\s\S]*?\*\//g, '');
    expect(fire).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(fire).toContain('var(--color-warning)');
    expect(fire).toContain('var(--color-danger)');
  });

  test('mouvement réduit : ni flammes ni étincelles, un simple fondu', () => {
    const reduced = blockOf('@media (prefers-reduced-motion: reduce) {\n  .ephemeral-destroying');
    expect(reduced).toContain('content: none');
    expect(reduced).toContain('animation: ephemeral-fade');
  });
});
