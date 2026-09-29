import { act } from 'react';
import { describe, expect, test } from 'bun:test';

import { createStudioDraftStore } from '@/lib/stories/studio-draft-store';
import { VIEWER_ID, fakeRect, flush, harness, mount, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * **LE TEXTE SE MANIPULE SANS QUITTER L'ÉDITION** (#8535, porteur
 * 2026-09-28) — pendant qu'on écrit, le doigt déplace le texte sur la scène,
 * deux doigts le pincent et le tournent ; le clavier et la plaque d'édition
 * restent ouverts, la saisie garde le focus.
 */

registerStudioBench();

const field = (el: ParentNode) => el.querySelector<HTMLTextAreaElement>('#story-studio-text');
const plaque = (el: ParentNode) => el.querySelector('[data-story-edit-plaque]');

async function editing(text: string) {
  const drafts = createStudioDraftStore(null);
  const el = mount(harness({ drafts }).deps);
  typeText(el, text);
  await flush(() => el.querySelector('[data-scene-object-id="text-1"]') !== null);
  el.querySelector<HTMLElement>('[data-scene-stage]')!.getBoundingClientRect = () => fakeRect({ top: 0, left: 0, width: 200, height: 400 });
  el.querySelector<HTMLElement>('[data-scene-object-id="text-1"]')!.getBoundingClientRect = () => fakeRect({ top: 180, left: 50, width: 100, height: 40 });
  const input = field(el)!;
  input.getBoundingClientRect = () => fakeRect({ top: 180, left: 50, width: 100, height: 40 });
  /** Qui garde le doigt — capturé par un ANCÊTRE, il quitterait la saisie et
   * ses mouvements n'y arriveraient plus (relevé au navigateur). */
  const holders: string[] = [];
  input.setPointerCapture = () => void holders.push('saisie');
  el.querySelector<HTMLElement>('[data-scene-stage]')!.setPointerCapture = () => void holders.push('scène');
  const layer = el.querySelector<HTMLElement>('[data-story-stage-gestures]')!;
  layer.setPointerCapture = () => undefined;
  const pose = () => drafts.get(VIEWER_ID)?.pages[0]?.texts[0]?.pose as { x: number; y: number; scale: number; rotation: number } | undefined;
  return { el, input, layer, pose, holders };
}

const finger = (target: HTMLElement, type: string, pointerId: number, clientX: number, clientY: number, pointerType = 'touch') =>
  act(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, button: 0, pointerId, pointerType, clientX, clientY })));

describe('pendant l’édition d’un texte, le doigt le manipule sur la scène (#8535)', () => {
  test('glisser le texte en cours d’écriture le DÉPLACE, et l’édition continue', async () => {
    const { el, input, pose, holders } = await editing('Déplacé');
    expect(plaque(el)).not.toBeNull();
    finger(input, 'pointerdown', 1, 100, 200);
    finger(input, 'pointermove', 1, 130, 240);
    finger(input, 'pointermove', 1, 140, 280);
    finger(input, 'pointerup', 1, 140, 280);
    await flush();
    expect(pose()?.x).toBeCloseTo(0.7, 6);
    expect(pose()?.y).toBeCloseTo(0.7, 6);
    expect(plaque(el)).not.toBeNull();
    expect(field(el)?.value).toBe('Déplacé');
    expect(document.activeElement).toBe(field(el));
    expect(holders).toEqual(['saisie']);
  });

  test('deux doigts — l’un sur le texte, l’autre sur la scène — le pincent et le tournent sans fermer l’édition', async () => {
    const { el, input, layer, pose } = await editing('Pincé');
    finger(input, 'pointerdown', 1, 50, 100);
    finger(layer, 'pointerdown', 2, 150, 100);
    finger(input, 'pointermove', 1, 100, 0);
    finger(layer, 'pointermove', 2, 100, 200);
    finger(layer, 'pointerup', 2, 100, 200);
    finger(input, 'pointerup', 1, 100, 0);
    await flush();
    expect(pose()?.scale).toBeCloseTo(2, 6);
    expect(pose()?.rotation).toBeCloseTo(45, 6);
    expect(plaque(el)).not.toBeNull();
    // La saisie suit : son curseur a la taille et l'angle du texte pincé (#8681).
    const [, rotation, scale] = /rotate\(([^)]+)deg\) scale\(([^)]+)\)/.exec(field(el)?.style.transform ?? '') ?? [];
    expect(Number(rotation)).toBeCloseTo(45, 6);
    expect(Number(scale)).toBeCloseTo(2, 6);
  });

  test('toucher le texte sans glisser ne déplace rien : le curseur se pose, l’édition reste', async () => {
    const { el, input, pose } = await editing('Immobile');
    const before = pose();
    finger(input, 'pointerdown', 1, 100, 200);
    finger(input, 'pointerup', 1, 101, 201);
    await flush();
    expect(pose()).toEqual(before);
    expect(plaque(el)).not.toBeNull();
  });

  test('à la souris, glisser dans la saisie SÉLECTIONNE le texte comme tout champ : la pose ne bouge pas', async () => {
    const { el, input, pose } = await editing('Sélection');
    const before = pose();
    finger(input, 'pointerdown', 1, 100, 200, 'mouse');
    finger(input, 'pointermove', 1, 160, 260, 'mouse');
    finger(input, 'pointerup', 1, 160, 260, 'mouse');
    await flush();
    expect(pose()).toEqual(before);
    expect(plaque(el)).not.toBeNull();
  });
});
