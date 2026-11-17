import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { kitMount } from '@/test-support/kit-mount';

import { MeeshyKitCatalog } from './catalog';

const { mount } = kitMount();

describe('les atomes du profil au catalogue du kit', () => {
  test('trente entrées, dans l’ordre des numéros de la planche, chacune avec ses états', () => {
    expect(MeeshyKitCatalog.atoms.map((entry) => `${entry.key} ${entry.name}`)).toEqual([
      'K26 MeeshyMotion',
      'K27 MeeshyLivingBanner',
      'K28 MeeshyCollapsingHero',
      'K29 MeeshyAvatarMorph',
      'K30 MeeshyTicket',
      'K31 MeeshyCodeCard',
      'K32 MeeshyLabeledAction',
      'K33 MeeshyCircleScale',
      'K34 MeeshyFigures',
      'K35 MeeshyWavePlayer',
      'K36 MeeshyMapPin',
      'K37 MeeshyLockedRow',
      'K38 MeeshyStateBlock',
      'K39 MeeshyPersonRow',
      'K40 MeeshyButton',
      'K41 MeeshyBadge',
      'K42 MeeshyMeter',
      'K43 MeeshyGroupCard',
      'K44 MeeshySectionHeader',
      'K45 MeeshyMedallion',
      'K46 MeeshyNote',
      'K47 MeeshyChoiceTiles',
      'K48 MeeshyAvatarGroup',
      'K49 MeeshyMediaGrid',
      'K50 MeeshyChart',
      'K51 MeeshyTranslationMark',
      'K52 MeeshyReorderList',
      'K53 MeeshyStepper',
      'K54 MeeshyMapTrace',
      'K55 MeeshyKeyHint',
    ]);
    for (const entry of MeeshyKitCatalog.atoms) expect(entry.states.length).toBeGreaterThan(0);
  });

  test('chaque composant cité existe sur disque', () => {
    for (const file of MeeshyKitCatalog.atomFiles) expect(existsSync(fileURLToPath(new URL(`./${file}`, import.meta.url)))).toBe(true);
  });

  test('chaque état se rend sans lever', () => {
    for (const entry of MeeshyKitCatalog.atoms) {
      for (const state of entry.states) {
        const container = mount(<div>{MeeshyKitCatalog.atomContent(entry.key, state)}</div>);
        expect(container.firstElementChild?.children.length ?? 0).toBeGreaterThan(0);
      }
    }
  });

  test('les atomes ne se mêlent pas à la liste du registre', () => {
    const registryKeys = MeeshyKitCatalog.entries.map((entry) => entry.key);
    for (const entry of MeeshyKitCatalog.atoms) expect(registryKeys).not.toContain(entry.key);
  });

  test('une clé d’atome rend son contenu, une clé inconnue rien', () => {
    expect(MeeshyKitCatalog.content('K40', MeeshyKitCatalog.atoms[5]?.states[0] as never, false)).not.toBeNull();
    expect(MeeshyKitCatalog.content('K999', MeeshyKitCatalog.atoms[5]?.states[0] as never, false)).toBeNull();
  });
});
