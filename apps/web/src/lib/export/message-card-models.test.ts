import { describe, expect, test } from 'bun:test';

import { DECOR_BORDER_INSET, DECOR_RULE_WIDTH } from './message-card-decor';
import { INITIAL_MESSAGE_CARD_FORMAT, parseMessageCardFormat, sameMessageCardFormat } from './message-card-format';
import { layoutMessageCard, type MessageCardInput } from './message-card-layout';
import { BUILT_IN_MODELS, BUILT_IN_MODELS_JSON, applyModel, decodeCardModels, isValidModelId, modelById, modelName, offeredLinks, type CardDecor } from './message-card-models';
import { CARD_LINKS, templateOf } from './message-card-templates';

const measure = (text: string, font: string) => text.length * (Number(/(\d+)px/.exec(font)?.[1] ?? 20) * 0.5);

const input = (decor?: CardDecor, tilt: 'none' | 'left' = 'none'): MessageCardInput => ({
  quoted: { author: 'Koffi', text: 'Tu viens ?' },
  reply: { author: 'Awa', text: 'Oui, j’arrive' },
  template: 'aurore.rond.orbite',
  handle: 'moi',
  frame: { header: 'horizontal', authors: 'top', tilt },
  ...(decor === undefined ? {} : { decor }),
});

const brand = (fields: string) => `[{"id": "@acme/carte", "names": {"fr": "Carte"}, "palette": "aurore", "typeface": "rond", "link": "orbite"${fields}}]`;

describe('les maquettes d’export (#18673)', () => {
  test('les huit maquettes intégrées sont celles d’iOS et d’Android, lues depuis la même fiche', () => {
    expect(BUILT_IN_MODELS.map((model) => model.id)).toEqual(['citation', 'bulles', 'affiche', 'editorial', 'carnet', 'bandeau', 'manifeste', 'epure']);
    expect(decodeCardModels(BUILT_IN_MODELS_JSON)?.length).toBe(8);
  });

  test('une maquette se nomme dans la langue du lecteur, le français en repli', () => {
    const poster = modelById('affiche');
    expect(poster === null ? null : modelName(poster, 'en-US')).toBe('Poster');
    expect(poster === null ? null : modelName(poster, 'ja')).toBe('Affiche');
  });

  test('appliquer une maquette garde ce qu’on montre et prend son allure, l’en-tête couché de « Bandeau » compris', () => {
    const shown = { ...INITIAL_MESSAGE_CARD_FORMAT, showDate: true, anonymizeReply: true };
    const carnet = modelById('carnet');
    const bandeau = modelById('bandeau');
    if (carnet === null || bandeau === null) throw new Error('maquettes absentes');
    const format = applyModel(carnet, shown);
    expect(format.showDate).toBe(true);
    expect(format.anonymizeReply).toBe(true);
    expect(format.model).toBe('carnet');
    expect(format.template).toBe('manuscrit.plume.fil');
    expect(format.authorsAt).toBe('end');
    expect(format.tilt).toBe('left');
    expect(format.decor.frame).toBe('panel');
    expect(applyModel(bandeau, shown).header).toBe('up');
  });

  test('une maquette n’offre que ses liaisons, toutes quand elle n’en nomme aucune', () => {
    const bubbles = modelById('bulles');
    const quote = modelById('citation');
    expect(bubbles === null ? [] : offeredLinks(bubbles)).toEqual(['bulles']);
    expect(quote === null ? [] : offeredLinks(quote)).toEqual(CARD_LINKS);
  });

  test('une fiche de marque se lit par le même décodeur, et une valeur inconnue refuse toute la liste', () => {
    expect(decodeCardModels(brand(', "aspect": "story"'))?.[0]?.aspect).toBe('story');
    expect(decodeCardModels(brand(', "aspect": "cinema"'))).toBeNull();
    expect(decodeCardModels(brand(', "links": ["fil"]'))).toBeNull();
    expect(decodeCardModels(brand(', "decor": {"alignment": "center", "frame": "border"}'))).toBeNull();
    expect(decodeCardModels(brand('').replace('"aurore"', '"or"'))).toBeNull();
    const one = brand('').slice(1, -1);
    expect(decodeCardModels(`[${one}, ${one}]`)).toBeNull();
  });

  test('un identifiant de marque est en minuscules, chiffres et tirets, sous un « @ »', () => {
    expect(isValidModelId('citation')).toBe(true);
    expect(isValidModelId('@acme/mon-style-2')).toBe(true);
    expect(isValidModelId('@acme')).toBe(false);
    expect(isValidModelId('acme/carte')).toBe(false);
    expect(isValidModelId('Citation')).toBe(false);
  });

  test('la maquette et son décor survivent à l’enregistrement du format par défaut, et en sont distingués', () => {
    const epure = modelById('epure');
    if (epure === null) throw new Error('maquette absente');
    const format = applyModel(epure, INITIAL_MESSAGE_CARD_FORMAT);
    expect(parseMessageCardFormat(JSON.stringify(format))).toEqual(format);
    expect(sameMessageCardFormat(format, { ...format, decor: { ...format.decor, ornament: 'quoteMark' } })).toBe(false);
    const legacy = JSON.parse(JSON.stringify(INITIAL_MESSAGE_CARD_FORMAT)) as Record<string, unknown>;
    delete legacy['model'];
    delete legacy['decor'];
    expect(parseMessageCardFormat(JSON.stringify(legacy))).toEqual(INITIAL_MESSAGE_CARD_FORMAT);
  });
});

describe('le décor posé sur la carte (#18673)', () => {
  test('sans décor, la carte reste exactement celle d’avant', () => {
    expect(layoutMessageCard(input({ alignment: 'start', frame: 'none', ornament: 'none' }), measure)).toEqual(layoutMessageCard(input(), measure));
  });

  test('centrée, la carte centre ses lignes et retire le filet de la citation', () => {
    const card = layoutMessageCard(input({ alignment: 'center', frame: 'none', ornament: 'none' }), measure);
    expect(card.ops.filter((op) => op.kind === 'text' && op.align === 'center').length).toBeGreaterThan(0);
    expect(card.ops.some((op) => op.kind === 'bar' && op.width === 6)).toBe(false);
  });

  test('le cadre entoure la carte entière et reste droit quand le message penche', () => {
    const card = layoutMessageCard(input({ alignment: 'start', frame: 'border', ornament: 'none' }, 'left'), measure);
    const edges = (card.fixed ?? []).filter((op) => op.kind === 'bar');
    expect(edges.length).toBe(4);
    expect(edges[0]?.kind === 'bar' ? edges[0].x : null).toBe(DECOR_BORDER_INSET);
    expect(card.tilt).not.toBe(0);
  });

  test('le panneau passe sous le contenu, et le trait d’accent signe la carte de sa couleur', () => {
    const panel = layoutMessageCard(input({ alignment: 'start', frame: 'panel', ornament: 'none' }), measure);
    expect(panel.ops[0]?.kind).toBe('panel');
    const rule = layoutMessageCard(input({ alignment: 'start', frame: 'none', ornament: 'accentRule' }), measure).ops[0];
    expect(rule?.kind === 'panel' ? rule.width : null).toBe(DECOR_RULE_WIDTH);
    expect(rule?.kind === 'panel' ? rule.color : null).toBe(templateOf('aurore.rond.orbite').palette.accent);
    const mark = layoutMessageCard(input({ alignment: 'start', frame: 'none', ornament: 'quoteMark' }), measure).ops[0];
    expect(mark?.kind === 'text' ? mark.text : null).toBe('“');
  });
});
