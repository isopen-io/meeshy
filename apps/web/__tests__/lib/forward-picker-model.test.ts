/**
 * Machine à états du picker de transfert hybride (sélection + envoi immédiat).
 * MIROIR EXACT des règles user testées par `ForwardPickerModelTests` iOS
 * (apps/ios/MeeshyTests/Unit/Components/ForwardPickerModelTests.swift).
 */

import { ForwardPickerModel } from '@/lib/forward-picker-model';

describe('ForwardPickerModel', () => {
  it('tapRow bascule idle ↔ selected', () => {
    const model = new ForwardPickerModel();

    expect(model.state('a')).toBe('idle');
    model.tapRow('a');
    expect(model.state('a')).toBe('selected');
    expect(model.selectedIds()).toEqual(['a']);
    model.tapRow('a');
    expect(model.state('a')).toBe('idle');
    expect(model.selectedIds()).toEqual([]);
  });

  it('tapRow sur une cible déjà envoyée est un no-op', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    model.finishSend('a', true);
    expect(model.state('a')).toBe('sent');

    model.tapRow('a');

    expect(model.state('a')).toBe('sent');
    expect(model.selectedIds()).toEqual([]);
  });

  it('tapRow sur une cible en cours d’envoi est un no-op', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    expect(model.state('a')).toBe('sending');

    model.tapRow('a');

    expect(model.state('a')).toBe('sending');
    expect(model.selectedIds()).toEqual([]);
  });

  it('tapRow sur une cible en échec la sélectionne pour un renvoi groupé', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    model.finishSend('a', false, 'réseau indisponible');

    model.tapRow('a');

    expect(model.state('a')).toBe('selected');
    expect(model.selectedIds()).toEqual(['a']);
    expect(model.beginBatch()).toEqual(['a']);
  });

  it('beginSend sur une ligne sélectionnée la retire de la sélection', () => {
    const model = new ForwardPickerModel();
    model.tapRow('a');
    model.tapRow('b');

    expect(model.beginSend('a')).toBe(true);

    expect(model.state('a')).toBe('sending');
    expect(model.selectedIds()).toEqual(['b']);
  });

  it('beginSend refuse une cible déjà envoyée', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    model.finishSend('a', true);

    expect(model.beginSend('a')).toBe(false);
    expect(model.state('a')).toBe('sent');
  });

  it('beginBatch passe toutes les sélectionnées en sending, jamais une cible envoyée', () => {
    const model = new ForwardPickerModel();
    model.beginSend('sent-target');
    model.finishSend('sent-target', true);
    model.tapRow('a');
    model.tapRow('b');

    const batch = model.beginBatch();

    expect(batch.sort()).toEqual(['a', 'b']);
    expect(batch).not.toContain('sent-target');
    expect(model.state('a')).toBe('sending');
    expect(model.state('b')).toBe('sending');
    expect(model.selectedIds()).toEqual([]);
  });

  it('finishSend en échec garde la raison et re-permet beginSend', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    model.finishSend('a', false, 'réseau indisponible');

    expect(model.state('a')).toEqual({ failed: 'réseau indisponible' });

    expect(model.beginSend('a')).toBe(true);
    expect(model.state('a')).toBe('sending');
    model.finishSend('a', true);
    expect(model.state('a')).toBe('sent');
  });

  it('un envoi accepté hors ligne (résolu ok) compte comme envoyé côté affichage', () => {
    const model = new ForwardPickerModel();
    model.beginSend('a');
    model.finishSend('a', true);

    expect(model.state('a')).toBe('sent');
    model.tapRow('a');
    expect(model.selectedIds()).toEqual([]);
    expect(model.beginBatch()).toEqual([]);
  });
});
