import { describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { PackAssetRef } from '@meeshy/shared/types/content-pack';
import type { FrameRef } from '@meeshy/shared/utils/game/glory-frames';

import type { PhotoEnv } from '@/lib/game-photo/env';
import type { GloryOffer, GloryOfferTile } from '@/lib/game-photo/glory-choice';
import type { GloryScene } from '@/lib/game-photo/glory/glory-scene';
import { rankMoment } from '@/lib/game-photo/moments';
import { typeInto } from '@/test-support/act-mount';
import { by, choose, env, settle, setupGamePhotoFlowTests, takeFrame } from '@/test-support/game-photo-flow-harness';

const { click, open } = setupGamePhotoFlowTests();

/**
 * L'AUTEUR ÉCRIT UN MESSAGE SUR SON CADRE (#10165, L12, § 5.14 du prompt des
 * Cadres de gloire) : sur l'écran de résultat, un champ d'une ligne, borné à
 * 60 graphèmes, qui n'apparaît que sur un cadre à SUPPORT (le sélecteur le
 * dit) ; le message recompose l'image (c'est une autre version : « Enregistrer »
 * revient), part dans la recette du carnet, et JAMAIS dans le texte de partage.
 */
const ambassador = rankMoment({ rank: 'ambassadeur', division: 2 });
const thumb: PackAssetRef = { src: '0123456789abcdef.webp', bytes: 1, sha256: '0'.repeat(64) };
const ref = (frameId: string): FrameRef => ({ pack: 'afrique', frameId });

const tile = (frameId: string, overrides: Partial<GloryOfferTile> = {}): GloryOfferTile => ({
  ref: ref(frameId),
  name: frameId,
  usage: 'Rang Ambassadeur II uniquement',
  thumb,
  poses: ['perches'],
  defaultPose: 'perches',
  squareSimple: false,
  message: true,
  ready: true,
  missingBytes: 0,
  ...overrides,
});

const offer: GloryOffer = { tiles: [tile('savane.ambassadeur-2'), tile('royaumes.ambassadeur-2', { message: false })], preselected: ref('savane.ambassadeur-2') };

const fakeScene = (frameId: string): GloryScene => ({ frame: { id: frameId } as unknown as GloryScene['frame'], pack: 'afrique', crest: null, bannerLayout: () => null, paint: () => undefined, close: () => undefined });

function withMessages() {
  const messages: (string | null | undefined)[] = [];
  const { env: base, log } = env({ referral: async () => 'https://meeshy.me/i/abc' });
  const value: PhotoEnv = {
    ...base,
    render: async (input) => {
      messages.push(input.glory === null || input.glory === undefined ? undefined : input.glory.recipe.message);
      return base.render(input);
    },
    gloryOffer: async () => offer,
    glory: async ({ frame }) => fakeScene(frame === undefined ? 'savane.ambassadeur-2' : (frame?.frameId ?? 'savane.ambassadeur-2')),
    gloryThumb: async () => null,
  };
  return { env: value, log, messages };
}

const field = (host: ParentNode) => host.querySelector<HTMLInputElement>('input[data-photo-message]');
const option = (host: ParentNode, id: string) => host.querySelector<HTMLElement>(`[data-photo-frame-option="${id}"]`);

/* Quitter le champ remet le message au déroulé (React écoute `focusout`). */
const leave = async (host: ParentNode) => {
  await act(async () => {
    field(host)?.dispatchEvent(new Event('focusout', { bubbles: true }));
  });
  await settle();
};

const write = async (host: ParentNode, text: string) => {
  typeInto(field(host), text);
  await leave(host);
};

/* Coller PLUS que la borne : le champ contrôlé ne garde pas tout, donc la garde de `typeInto` (« le champ a reçu la valeur ») ne s'applique pas. */
const paste = async (host: ParentNode, text: string) => {
  const input = field(host);
  if (input === null) throw new Error('champ absent');
  act(() => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await leave(host);
};

async function atResult(e: PhotoEnv, log: ReturnType<typeof env>['log']) {
  const host = await open(ambassador, e, log);
  await click(choose(host, 'selfie'));
  await settle();
  await click(takeFrame(host));
  await settle();
  return host;
}

describe('le champ du message', () => {
  test('absent de la caméra ; sur le résultat, présent pour un cadre à support, avec son compteur ; le sélecteur dit quels cadres en ont un', async () => {
    const { env: e, log } = withMessages();
    const host = await open(ambassador, e, log);
    await click(choose(host, 'selfie'));
    await settle();
    expect(field(host)).toBeNull();
    expect(option(host, 'savane.ambassadeur-2')?.querySelector('[data-photo-frame-message]')).not.toBeNull();
    expect(option(host, 'royaumes.ambassadeur-2')?.querySelector('[data-photo-frame-message]')).toBeNull();
    await click(takeFrame(host));
    await settle();
    const input = field(host);
    expect(input).not.toBeNull();
    expect(input?.getAttribute('dir')).toBe('auto');
    expect(input?.value).toBe('');
    expect(by(host, 'data-photo-message-count')?.textContent).toContain('0');
  });

  test('un cadre sans support ou la carte simple : aucun champ', async () => {
    const { env: e, log } = withMessages();
    const host = await atResult(e, log);
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(field(host)).toBeNull();
    await click(option(host, 'simple'));
    await settle();
    expect(field(host)).toBeNull();
  });
});

describe('ce que le message fait à l’image', () => {
  test('écrire recompose avec le message dans la recette, et « Enregistrer » revient ; l’effacer recompose sans', async () => {
    const { env: e, log, messages } = withMessages();
    const host = await atResult(e, log);
    expect(messages).toEqual([null]);
    expect(by(host, 'data-photo-save')).toBeNull();
    await write(host, 'Pour toi, maman');
    expect(messages).toEqual([null, 'Pour toi, maman']);
    expect(by(host, 'data-photo-save')).not.toBeNull();
    expect(log.cameraOpened).toBe(1);
    await write(host, '');
    expect(messages.at(-1)).toBeNull();
  });

  test('61 graphèmes se bornent à 60 dans le champ comme dans la recette ; un retour à la ligne collé devient une espace', async () => {
    const { env: e, log, messages } = withMessages();
    const host = await atResult(e, log);
    await paste(host, `${'🇫🇷'.repeat(30)}\n${'é'.repeat(31)}`);
    const value = field(host)?.value ?? '';
    expect(Array.from(new Intl.Segmenter('und', { granularity: 'grapheme' }).segment(value)).length).toBe(60);
    expect(value.includes('\n')).toBe(false);
    expect(messages.at(-1)).toBe(value);
    expect(by(host, 'data-photo-message-count')?.textContent).toContain('60');
  });

  test('passer à un cadre sans support compose sans message et cache le champ ; revenir rend le message écrit', async () => {
    const { env: e, log, messages } = withMessages();
    const host = await atResult(e, log);
    await write(host, 'Merci la famille');
    await click(option(host, 'royaumes.ambassadeur-2'));
    await settle();
    expect(messages.at(-1)).toBeNull();
    expect(field(host)).toBeNull();
    await click(option(host, 'savane.ambassadeur-2'));
    await settle();
    expect(messages.at(-1)).toBe('Merci la famille');
    expect(field(host)?.value).toBe('Merci la famille');
  });

  test('le message vit dans la recette du carnet, et jamais dans le texte de partage', async () => {
    const { env: e, log } = withMessages();
    const host = await atResult(e, log);
    await write(host, 'Для мамы');
    await click(by(host, 'data-photo-keep'));
    await settle();
    expect(log.kept[0]?.photo.recipe?.message).toBe('Для мамы');
    expect(log.kept[0]?.photo.recipe?.frameId).toBe('savane.ambassadeur-2');
    await click(by(host, 'data-photo-share'));
    await settle();
    expect(log.shared).toHaveLength(1);
    expect(log.texts.every((text) => text === undefined || !text.includes('Для мамы'))).toBe(true);
  });

  test('le texte n’est jamais interprété : une balise écrite reste des lettres dans le champ et la recette', async () => {
    const { env: e, log, messages } = withMessages();
    const host = await atResult(e, log);
    await write(host, '<b>salut</b>');
    expect(field(host)?.value).toBe('<b>salut</b>');
    expect(messages.at(-1)).toBe('<b>salut</b>');
    expect(host.querySelector('b')).toBeNull();
  });
});
