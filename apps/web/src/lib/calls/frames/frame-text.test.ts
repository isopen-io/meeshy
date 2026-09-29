import { describe, expect, test } from 'bun:test';

import { fitText, handleText, listEntry, namesText, personLines, titleText, type FramePerson, type FrameTexts, type MeasureText } from './frame-text';

/**
 * LES MOTS D'UN CADRE (#8743, spec § 4.5, § 5.3) — les noms du duo et des
 * groupes, le nom du groupe qui ne s'écrit qu'en groupe, la marque en
 * minuscules, le texte trop long qui rétrécit puis se tronque.
 */

const person = (name: string, handle: string | null = null, isSelf = false): FramePerson => ({ id: name.toLowerCase(), name, handle, isSelf });
const PEOPLE = ['Awa', 'Karim', 'Lina', 'Tomás', 'Mei'].map((name) => person(name, name.toLowerCase()));
const texts = (overrides: Partial<FrameTexts> = {}): FrameTexts => ({ groupName: 'Les Copains', isGroup: true, date: '29 sept. 2026', accent: null, ...overrides });

/** Une police à chasse fixe : 0,5 em par caractère. */
const MONO: MeasureText = (text, px) => Array.from(text).length * px * 0.5;

describe('les noms', () => {
  test('le duo : « Awa & Karim »', () => {
    expect(namesText(PEOPLE.slice(0, 2))).toBe('Awa & Karim');
  });

  test('trois : « Awa, Karim & Lina »', () => {
    expect(namesText(PEOPLE.slice(0, 3))).toBe('Awa, Karim & Lina');
  });

  test('au-delà de trois : « Awa, Karim, Lina + 2 »', () => {
    expect(namesText(PEOPLE)).toBe('Awa, Karim, Lina + 2');
  });

  test('un nom vide ne compte pas', () => {
    expect(namesText([person('Awa'), person('  ')])).toBe('Awa');
  });

  test('le pseudo porte UN « @ »', () => {
    expect(handleText('awa')).toBe('@awa');
    expect(handleText('@@awa ')).toBe('@awa');
  });

  test('name · handle · both (deux lignes) · none', () => {
    const awa = person('Awa', 'awa_d');
    expect(personLines(awa, 'name')).toEqual(['Awa']);
    expect(personLines(awa, 'handle')).toEqual(['@awa_d']);
    expect(personLines(awa, 'both')).toEqual(['Awa', '@awa_d']);
    expect(personLines(awa, 'none')).toEqual([]);
    expect(listEntry(awa, 'both')).toBe('Awa @awa_d');
  });

  test('sans pseudo connu, le nom le remplace', () => {
    expect(personLines(person('Karim'), 'handle')).toEqual(['Karim']);
    expect(personLines(person('Karim'), 'both')).toEqual(['Karim']);
  });
});

describe('le titre', () => {
  test('group, en groupe : le nom du groupe', () => {
    expect(titleText('group', { people: PEOPLE, texts: texts() })).toBe('Les Copains');
  });

  test('group, hors groupe : les noms — jamais le titre de la conversation à deux', () => {
    expect(titleText('group', { people: PEOPLE.slice(0, 2), texts: texts({ isGroup: false }) })).toBe('Awa & Karim');
  });

  test('group sans nom de groupe : les noms', () => {
    expect(titleText('group', { people: PEOPLE, texts: texts({ groupName: '   ' }) })).toBe('Awa, Karim, Lina + 2');
    expect(titleText('group', { people: PEOPLE, texts: texts({ groupName: null }) })).toBe('Awa, Karim, Lina + 2');
  });

  test('brand : « meeshy », en minuscules même sous `upper`', () => {
    expect(titleText('brand', { people: PEOPLE, texts: texts() }, 'upper')).toBe('meeshy');
  });

  test('date : la date déjà formatée, en capitales sous `upper`', () => {
    expect(titleText('date', { people: PEOPLE, texts: texts() })).toBe('29 sept. 2026');
    expect(titleText('date', { people: PEOPLE, texts: texts() }, 'upper')).toBe('29 SEPT. 2026');
  });

  test('none : rien', () => {
    expect(titleText('none', { people: PEOPLE, texts: texts() })).toBe('');
  });
});

describe('fitText — rétrécir jusqu’à 60 %, puis tronquer', () => {
  test('un texte qui tient reste tel quel', () => {
    expect(fitText(MONO, 'Awa', 100, 20)).toEqual({ text: 'Awa', px: 20 });
  });

  test('un texte un peu long rétrécit sans se tronquer', () => {
    const fitted = fitText(MONO, 'Awa & Karim', 88, 20);
    expect(fitted.text).toBe('Awa & Karim');
    expect(fitted.px).toBeLessThan(20);
    expect(fitted.px).toBeGreaterThanOrEqual(12);
    expect(MONO(fitted.text, fitted.px)).toBeLessThanOrEqual(88);
  });

  test('au-delà de 60 %, il se tronque d’une ellipse', () => {
    const fitted = fitText(MONO, 'Une très longue histoire de famille', 60, 20);
    expect(fitted.px).toBe(12);
    expect(fitted.text.endsWith('…')).toBe(true);
    expect(MONO(fitted.text, fitted.px)).toBeLessThanOrEqual(60);
    expect(fitted.text).toBe('Une très…');
  });

  test('la coupe ne tranche pas un caractère composé', () => {
    const fitted = fitText(MONO, '😀😀😀😀😀😀😀😀😀😀', 18, 10);
    expect(fitted.text).toBe('😀😀😀😀😀…');
  });

  test('aucune place : aucun texte', () => {
    expect(fitText(MONO, 'Awa', 0, 20).text).toBe('');
    expect(fitText(MONO, 'Awa', 2, 20).text).toBe('');
  });
});
