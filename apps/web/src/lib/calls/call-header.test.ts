import { readFileSync } from 'node:fs';

import { describe, expect, test } from 'bun:test';

import { callHeaderActions, callHeaderCapsule, callHeaderNames, isNetworkDegraded } from './call-header';

/**
 * L'EN-TÊTE DE L'APPEL (#17329, #17341) — Réduire · Image dans l'image ·
 * Conversation, et la capsule de droite. Miroir de `CallHeaderRule.swift`.
 */

describe('les boutons de l’en-tête, de début à fin', () => {
  const context = { pipEligible: false, pipActive: false, hasConversation: true };

  test('Réduire, puis Conversation quand elle est connue', () => {
    expect(callHeaderActions(context)).toEqual(['minimize', 'conversation']);
    expect(callHeaderActions({ ...context, hasConversation: false })).toEqual(['minimize']);
  });

  test('Image dans l’image entre Réduire et Conversation quand l’appel y est éligible', () => {
    expect(callHeaderActions({ ...context, pipEligible: true })).toEqual(['minimize', 'pip', 'conversation']);
  });

  test('et elle reste offerte, pour en SORTIR, tant que la fenêtre flotte', () => {
    expect(callHeaderActions({ ...context, pipActive: true })).toEqual(['minimize', 'pip', 'conversation']);
  });
});

describe('le réseau n’est dit que dégradé', () => {
  test('moyen et faible le sont, bon et excellent non, aucun relevé non plus', () => {
    expect((['excellent', 'good', 'fair', 'poor'] as const).map((level) => isNetworkDegraded({ level }))).toEqual([false, false, true, true]);
    expect(isNetworkDegraded(null)).toBe(false);
  });
});

describe('la capsule de droite (#17341)', () => {
  const input = { layout: 'video' as const, established: true, degraded: false, givenName: null, displayName: 'Amina Diallo', groupName: null, participantCount: 2 };

  test('rien avant que l’appel soit établi', () => {
    expect(callHeaderCapsule({ ...input, established: false })).toBeNull();
  });

  test('vidéo : le nom que j’ai donné, sinon le nom d’affichage, et la durée — jamais le réseau tant qu’il est bon', () => {
    expect(callHeaderCapsule({ ...input, givenName: 'Awa' })).toEqual({ title: 'Awa', participantCount: null, duration: true, network: false });
    expect(callHeaderCapsule(input)).toEqual({ title: 'Amina Diallo', participantCount: null, duration: true, network: false });
    expect(callHeaderCapsule({ ...input, givenName: '  ' })?.title).toBe('Amina Diallo');
  });

  test('vidéo : le réseau paraît avec la durée dès qu’il se dégrade', () => {
    expect(callHeaderCapsule({ ...input, degraded: true })?.network).toBe(true);
  });

  test('audio : le nom et la durée sont déjà sous l’avatar, la capsule n’existe que pour le réseau dégradé', () => {
    expect(callHeaderCapsule({ ...input, layout: 'audio' })).toBeNull();
    expect(callHeaderCapsule({ ...input, layout: 'audio', degraded: true })).toEqual({ title: null, participantCount: null, duration: false, network: true });
  });

  test('vidéo, écran reçu (P15.4) : la capsule annonce l’écran de la personne — son nom, sans durée, l’icône d’écran', () => {
    const screen = { ...input, receivesScreen: true };
    expect(callHeaderCapsule({ ...screen, givenName: 'Awa' })).toEqual({ title: 'Awa', participantCount: null, duration: false, network: false, receivedScreen: true });
    expect(callHeaderCapsule(screen)?.title).toBe('Amina Diallo');
    expect(callHeaderCapsule({ ...screen, givenName: '  ' })?.title).toBe('Amina Diallo');
  });

  test('vidéo, écran reçu : le réseau ne paraît que dégradé, et la capsule n’existe qu’une fois l’appel établi', () => {
    expect(callHeaderCapsule({ ...input, receivesScreen: true, degraded: true })?.network).toBe(true);
    expect(callHeaderCapsule({ ...input, receivesScreen: true, established: false })).toBeNull();
  });

  test('sans écran reçu la capsule n’est jamais marquée écran ; audio et groupe ignorent l’écran reçu', () => {
    expect(callHeaderCapsule(input)?.receivedScreen).toBeUndefined();
    expect(callHeaderCapsule({ ...input, layout: 'audio', receivesScreen: true })).toBeNull();
    expect(callHeaderCapsule({ ...input, layout: 'group', groupName: 'Famille', participantCount: 4, receivesScreen: true })).toEqual({ title: 'Famille', participantCount: 4, duration: true, network: false });
  });

  test('groupe : le nom du groupe, le nombre et la durée', () => {
    expect(callHeaderCapsule({ ...input, layout: 'group', groupName: 'Famille', participantCount: 4 })).toEqual({ title: 'Famille', participantCount: 4, duration: true, network: false });
    expect(callHeaderCapsule({ ...input, layout: 'group', groupName: 'Famille', participantCount: 4, degraded: true })?.network).toBe(true);
  });
});

describe('les noms que la conversation en cache donne à la capsule', () => {
  test('sans conversation connue : aucun nom donné, et le titre connu du groupe', () => {
    expect(callHeaderNames(undefined, 'Famille')).toEqual({ givenName: null, groupName: 'Famille' });
  });

  test('un direct donne le nom que JE lui ai donné, pas son titre', () => {
    expect(callHeaderNames({ type: 'direct', title: 'X & Y', customName: 'Awa' }, 'Amina Diallo')).toEqual({ givenName: 'Awa', groupName: null });
    expect(callHeaderNames({ type: 'direct', title: 'X & Y', customName: undefined }, 'Amina Diallo')).toEqual({ givenName: null, groupName: null });
  });

  test('un groupe : mon nom donné, sinon son titre, sinon celui que l’appel connaît', () => {
    expect(callHeaderNames({ type: 'group', title: 'Famille', customName: 'Les miens' }, 'x')).toEqual({ givenName: null, groupName: 'Les miens' });
    expect(callHeaderNames({ type: 'group', title: 'Famille', customName: undefined }, 'x')).toEqual({ givenName: null, groupName: 'Famille' });
    expect(callHeaderNames({ type: 'group', title: undefined, customName: undefined }, 'Cousins')).toEqual({ givenName: null, groupName: 'Cousins' });
  });
});

describe('ce qui paraît dans l’en-tête arrive, jamais d’un coup (#17406, comme `CallView+Header` d’iOS)', () => {
  const css = readFileSync(new URL('../../styles/call-motion.css', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ');
  const rule = (selector: string): string => {
    const start = css.indexOf(selector);
    return start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  };
  const frames = (name: string): readonly string[] => [...css.matchAll(new RegExp(`@keyframes ${name}\\s*\\{([\\s\\S]*?)\\}\\s*\\}`, 'g'))].map((match) => match[1] ?? '');

  test('le bouton Image dans l’image et les barres du réseau dégradé entrent comme le texte de la pilule (la capsule, par une échelle ancrée à droite : P9.8)', () => {
    const entering = rule('[data-call-pip]');
    expect(entering).not.toContain('[data-call-capsule]');
    expect(entering).toContain('[data-call-signal]');
    expect(entering).toMatch(/animation:\s*call-pill-text-in \d{3}ms/);
  });

  test('l’arrivée ne se prolonge pas : une transformation tenue ferait de leur hôte le bloc conteneur d’un détail `fixed`', () => {
    expect(rule('[data-call-pip]')).toMatch(/\)\s*backwards;/);
  });

  test('seules la transformation et l’opacité bougent, et « Réduire les animations » n’en garde qu’un fondu', () => {
    const [motion, reduced] = frames('call-pill-text-in');
    expect(motion).toContain('opacity: 0');
    expect(motion).toContain('transform:');
    expect(reduced).toContain('opacity: 0');
    expect(reduced).not.toContain('transform');
  });
});
