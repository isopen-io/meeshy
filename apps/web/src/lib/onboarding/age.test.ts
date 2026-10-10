import { describe, expect, test } from 'bun:test';

import { birthDateBounds, birthDateVerdict } from './age';

const TODAY = new Date(2026, 9, 10, 15, 30);

describe('birthDateVerdict — ce que la carte vérifie avant d’envoyer, jamais la classe d’âge (#9928)', () => {
  test('une date passée et plausible part', () => {
    expect(birthDateVerdict('1990-05-04', TODAY)).toBe('ok');
    expect(birthDateVerdict('2026-10-10', TODAY)).toBe('ok');
  });

  test('vide, tronquée ou impossible au calendrier : incomplète', () => {
    expect(birthDateVerdict('', TODAY)).toBe('incomplete');
    expect(birthDateVerdict('1990-05', TODAY)).toBe('incomplete');
    expect(birthDateVerdict('1990-02-30', TODAY)).toBe('incomplete');
    expect(birthDateVerdict('1990-13-01', TODAY)).toBe('incomplete');
  });

  test('demain : pas encore arrivée', () => {
    expect(birthDateVerdict('2026-10-11', TODAY)).toBe('future');
  });

  test('plus de cent vingt ans : l’année est à vérifier', () => {
    expect(birthDateVerdict('1906-10-09', TODAY)).toBe('tooOld');
    expect(birthDateVerdict('1906-10-10', TODAY)).toBe('ok');
  });

  test('un enfant de huit ans part aussi : le refus des moins de 13 ans appartient à la passerelle', () => {
    expect(birthDateVerdict('2018-01-01', TODAY)).toBe('ok');
  });
});

describe('birthDateBounds — les bornes du sélecteur natif', () => {
  test('d’il y a cent vingt ans à aujourd’hui, en date LOCALE', () => {
    expect(birthDateBounds(TODAY)).toEqual({ min: '1906-10-10', max: '2026-10-10' });
    expect(birthDateBounds(new Date(2026, 0, 1, 0, 5)).max).toBe('2026-01-01');
  });
});
