/**
 * `?categories=` et `?fields=` — la sélection, prise seule (#4181).
 *
 * Ces témoins sont PURS parce que la règle l'est : aucune base, aucune route.
 * Ils disent ce que les tests de route ne peuvent pas dire sans se répéter
 * quatorze fois — l'ordre de service, la composition des deux paramètres, et le
 * fait qu'une demande VIDE vaut « tout » plutôt que « rien », qui est le
 * contrat du `DELETE` autant que celui du `GET`.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import {
  parseSelection,
  projectSelection,
} from '../../../../../routes/me/preferences/preference-selection';
import { PREFERENCE_CATEGORIES } from '../../../../../services/preferences/preferences-broadcast';

const selectionOf = (query: { categories?: string; fields?: string }) => {
  const result = parseSelection(query);
  if (result.ok === false) throw new Error(`selection refusée: ${result.failure.code}`);
  return result.selection;
};

const failureOf = (query: { categories?: string; fields?: string }) => {
  const result = parseSelection(query);
  if (result.ok === true) throw new Error('selection acceptée alors qu\'elle devait être refusée');
  return result.failure;
};

describe('parseSelection — ce que l\'appelant demande', () => {
  it('sans paramètre, sert les sept catégories dans l\'ordre du registre', () => {
    expect(selectionOf({}).categories).toEqual([...PREFERENCE_CATEGORIES]);
  });

  it('une liste VIDE vaut « tout » — c\'est le contrat du DELETE autant que du GET', () => {
    expect(selectionOf({ categories: '' }).categories).toEqual([...PREFERENCE_CATEGORIES]);
    expect(selectionOf({ categories: '  ,  ' }).categories).toEqual([...PREFERENCE_CATEGORIES]);
  });

  it('sert les catégories nommées dans l\'ordre du REGISTRE, pas celui de la query', () => {
    // L'ordre de service ne doit pas dépendre de la frappe de l'appelant : deux
    // clients qui demandent le même ensemble dans deux ordres différents
    // obtiendraient sinon deux corps distincts, donc deux ETags — et aucun 304.
    expect(selectionOf({ categories: 'video,audio' }).categories).toEqual(['audio', 'video']);
    expect(selectionOf({ categories: 'audio,video' }).categories).toEqual(['audio', 'video']);
  });

  it('`fields` implique ses catégories, et une catégorie NUE se sert entière', () => {
    const selection = selectionOf({ fields: 'application.theme,audio' });
    expect(selection.categories).toEqual(['audio', 'application']);
    expect([...(selection.fields.get('application') ?? [])]).toEqual(['theme']);
    expect(selection.fields.has('audio')).toBe(false);
  });

  it('une catégorie nommée ENTIÈRE gagne sur ses clés nommées une à une', () => {
    const selection = selectionOf({ fields: 'audio,audio.transcriptionEnabled' });
    expect(selection.fields.has('audio')).toBe(false);
  });

  it('refuse ce qu\'elle ne peut pas honorer, en disant lequel des trois refus', () => {
    expect(failureOf({ categories: 'notifications' }).code).toBe('UNKNOWN_CATEGORY');
    expect(failureOf({ fields: 'applications.theme' }).code).toBe('UNKNOWN_CATEGORY');
    expect(failureOf({ fields: 'application.theme2' }).code).toBe('UNKNOWN_FIELD');
    expect(failureOf({ categories: 'audio', fields: 'video.quality' }).code).toBe(
      'FIELD_OUTSIDE_CATEGORIES'
    );
  });
});

describe('projectSelection — ce qui sort', () => {
  it('ne garde que les catégories et les clés retenues', () => {
    const complete = {
      audio: { transcriptionEnabled: true, ttsSpeed: 1 },
      application: { theme: 'dark', fontSize: 'medium' },
      video: { quality: 'auto' },
    };

    expect(projectSelection(complete, selectionOf({ fields: 'application.theme,audio' }))).toEqual({
      audio: { transcriptionEnabled: true, ttsSpeed: 1 },
      application: { theme: 'dark' },
    });
  });

  it('rend un objet vide pour une catégorie que la lecture n\'a pas produite', () => {
    // Une catégorie demandée mais absente de la carte complète ne doit pas faire
    // lever : la route sert alors `{}`, et le client lit un objet — jamais
    // `undefined`, qui traverserait la sérialisation en clé MANQUANTE et
    // ressemblerait à « cette catégorie n'existe plus ».
    expect(projectSelection({}, selectionOf({ categories: 'audio' }))).toEqual({ audio: {} });
  });
});
