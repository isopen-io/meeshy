import { describe, expect, test } from 'bun:test';

import { SERVER_MESSAGE_MAX_LENGTH, pastedContentOf, pastedTextFileName, routePastedContent } from './paste-route';

/**
 * #9037 — CE QU'ON COLLE PART TOUJOURS. Un FICHIER collé devient la pièce
 * elle-même (jamais son nom ni son chemin en texte) ; un texte qui ferait
 * dépasser la limite que le SERVEUR accepte part en document `.txt`, et le
 * champ reste intact.
 */

const at = new Date(2026, 9, 1, 9, 5, 7);
const image = () => new File([new Uint8Array([1, 2])], 'capture.png', { type: 'image/png' });
const route = (input: { readonly files?: readonly File[]; readonly text?: string; readonly current?: string; readonly selection?: { readonly start: number; readonly end: number } }) =>
  routePastedContent({
    pasted: { files: input.files ?? [], text: input.text ?? '' },
    current: input.current ?? '',
    selection: input.selection ?? { start: (input.current ?? '').length, end: (input.current ?? '').length },
    now: at,
  });

describe('routePastedContent — un fichier collé est une pièce jointe', () => {
  test('une image collée part en pièce jointe, et le nom qui l’accompagne n’est jamais écrit', () => {
    const file = image();
    const decision = route({ files: [file], text: '/Users/awa/Desktop/capture.png' });
    expect(decision).toEqual({ kind: 'attach', files: [file] });
  });

  test('audio, vidéo et document collés ensemble partent tous', () => {
    const files = [
      new File(['a'], 'voix.m4a', { type: 'audio/mp4' }),
      new File(['v'], 'clip.mp4', { type: 'video/mp4' }),
      new File(['d'], 'devis.pdf', { type: 'application/pdf' }),
    ];
    expect(route({ files })).toEqual({ kind: 'attach', files });
  });
});

describe('routePastedContent — le texte, mesuré contre la limite du serveur', () => {
  test('la limite est celle que la passerelle accepte (4000)', () => {
    expect(SERVER_MESSAGE_MAX_LENGTH).toBe(4000);
  });

  test('un texte qui tient reste au navigateur : il s’insère dans le champ', () => {
    expect(route({ text: 'Bonjour', current: 'x'.repeat(100) })).toEqual({ kind: 'native' });
  });

  test('exactement à la limite, le texte tient encore', () => {
    expect(route({ text: 'b'.repeat(10), current: 'a'.repeat(SERVER_MESSAGE_MAX_LENGTH - 10) })).toEqual({ kind: 'native' });
  });

  test('un caractère au-delà ⇒ un document .txt horodaté qui porte le texte collé, tel quel', async () => {
    const pasted = 'b'.repeat(11);
    const decision = route({ text: pasted, current: 'a'.repeat(SERVER_MESSAGE_MAX_LENGTH - 10) });
    if (decision.kind !== 'attach') throw new Error('attendu : attach');
    const [file] = decision.files;
    expect(decision.files).toHaveLength(1);
    expect(file?.name).toBe('texte-colle-20261001-090507.txt');
    expect(file?.type).toBe('text/plain;charset=utf-8');
    expect(await file?.text()).toBe(pasted);
  });

  test('la sélection REMPLACÉE ne compte pas : coller sur tout le champ ne mesure que le collé', () => {
    const current = 'a'.repeat(SERVER_MESSAGE_MAX_LENGTH);
    expect(route({ text: 'court', current, selection: { start: 0, end: current.length } })).toEqual({ kind: 'native' });
  });

  test('un texte seul démesuré, champ vide, part aussi en .txt', () => {
    expect(route({ text: 'z'.repeat(SERVER_MESSAGE_MAX_LENGTH + 1) }).kind).toBe('attach');
  });

  test('rien de collé ⇒ le navigateur garde la main', () => {
    expect(route({})).toEqual({ kind: 'native' });
  });
});

describe('pastedTextFileName — lisible dans une liste, sans rien du contenu', () => {
  test('AAAAMMJJ-HHMMSS sur l’heure locale', () => {
    expect(pastedTextFileName(new Date(2026, 0, 2, 3, 4, 5))).toBe('texte-colle-20260102-030405.txt');
  });
});

describe('pastedContentOf — ce que porte le presse-papiers', () => {
  test('les fichiers de `files` d’abord, et le texte brut', () => {
    const file = image();
    const content = pastedContentOf({ files: [file], items: [], getData: (type) => (type === 'text/plain' ? 'capture.png' : '') });
    expect(content).toEqual({ files: [file], text: 'capture.png' });
  });

  test('un navigateur qui ne remplit que `items` : les entrées de nature fichier', () => {
    const file = image();
    const content = pastedContentOf({
      files: [],
      items: [
        { kind: 'string', getAsFile: () => null },
        { kind: 'file', getAsFile: () => file },
      ],
      getData: () => '',
    });
    expect(content.files).toEqual([file]);
  });

  test('aucun presse-papiers ⇒ rien', () => {
    expect(pastedContentOf(null)).toEqual({ files: [], text: '' });
  });
});
