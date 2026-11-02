import { describe, expect, test } from 'bun:test';

import { harness, mount, registerStudioBench, typeText } from '@/test-support/story-studio-bench';

/**
 * **UN TEXTE S'ARRÊTE À MILLE CARACTÈRES, ET LE DIT** (#13590) — la borne se
 * compte en caractères AFFICHÉS, comme iOS et la passerelle : un emoji composé
 * vaut un, jamais quatre unités UTF-16 qu'un `maxLength` compterait.
 */

registerStudioBench();

const field = (el: ParentNode) => el.querySelector<HTMLTextAreaElement>('#story-studio-text');
const refusal = (el: ParentNode) => el.querySelector('[data-place-refusal="text-length"]');

describe('le plafond de 1 000 caractères à la saisie', () => {
  test('un collage trop long est coupé au millième caractère affiché, et le refus se lit', () => {
    const el = mount(harness({}).deps);
    typeText(el, '👨‍👩‍👧'.repeat(1200));
    expect(field(el)?.value).toBe('👨‍👩‍👧'.repeat(1000));
    expect(refusal(el)).not.toBeNull();
  });

  test('une frappe de plus à la borne ne laisse pas un 1001ᵉ caractère dans le champ', () => {
    const el = mount(harness({}).deps);
    typeText(el, 'a'.repeat(1000));
    typeText(el, 'a'.repeat(1001));
    expect(field(el)?.value).toHaveLength(1000);
    expect(refusal(el)).not.toBeNull();
  });

  test('le champ ne borne pas en unités UTF-16 : un `maxLength` couperait 600 emoji à 500, sans rien dire', () => {
    const el = mount(harness({}).deps);
    expect(field(el)?.hasAttribute('maxlength')).toBe(false);
  });

  test('un texte d’emoji de 600 caractères n’est ni coupé ni refusé', () => {
    const el = mount(harness({}).deps);
    typeText(el, '😀'.repeat(600));
    expect(field(el)?.value).toBe('😀'.repeat(600));
    expect(refusal(el)).toBeNull();
  });
});
