// Témoins du nettoyeur de JSON libres (#9663), sans base : chaque fuite du
// tableau de l'audit adversarial du 2026-10-08, dans les DEUX sens — le
// nettoyage la retire, et le contrôle final la signale si elle reste.
//
//   node --import tsx --test infrastructure/scripts/anonymize-database*.test.mjs

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { jsonViolations, scrubJson } from './anonymize-database/scrub-json.mjs';
import { newContext } from './anonymize-database/context.mjs';
import * as s from './anonymize-database/synth.mjs';

const context = () => {
  const ctx = newContext({ salt: s.newSalt() });
  ctx.noteIdentity('jeanne.essai', 'Jeanne', 'Essai');
  return ctx;
};

const serialize = (value) => JSON.stringify(value, (_, v) => (v?.type === 'Buffer' && Array.isArray(v.data) ? Buffer.from(v.data).toString('latin1') : v));

const LEAKS = [
  ['coordonnées écrites en chaîne', { location: { lat: '45.764043', lng: '4.835659' } }, ['45.764043', '4.835659']],
  ['coordonnées écrites en chaîne hors d’une clé de lieu', { lat: '45.764043', longitude: '4.835659' }, ['45.764043', '4.835659']],
  ['coordonnées sous une autre clé', { location: [4.835659, 45.764043], center: { x: 4.83, y: 45.76 } }, ['4.835659', '45.764043', '4.83', '45.76']],
  ['clé porteuse d’identité sous une clé de lieu', { location: { 'Jeanne Essai': [4.835659, 45.764043], 'jeanne.essai@real-mail.test': 1 } }, ['Jeanne', 'real-mail', '4.835659']],
  ['téléphone écrit en nombre', { phone: 33612345678, contactPhone: 33612345678 }, ['33612345678']],
  ['IPv6 sous une clé autorisée', { sourceId: '2a01:e0a:1f2:3::5' }, ['2a01:e0a']],
  ['IPv6 libre', { candidate: '2a01:e0a:1f2:3::5' }, ['2a01:e0a']],
  ['secret hexadécimal sous une clé neutre', { encryptionKey: 'a3f1c2d4e5b6a7980a1b2c3d4e5f60718293a4b5c6d7e8f9', value: 'b4e2c2d4e5b6a7980a1b2c3d4e5f60718293a4b5c6d7e8f9' }, ['a3f1c2d4', 'b4e2c2d4']],
  ['jeton sous un suffixe Key, Code ou Id', { accessKey: 'AKIAIOSFODNN7EXAMPLE', inviteCode: 'Zx98Yw76Qp', code: '482913', otp: 482913 }, ['AKIAIOSFODNN7', 'Zx98Yw76Qp', '482913']],
  ['clés d’objet porteuses d’identité', { 'jeanne.essai': { count: 3 }, 'Paul Martin': 2, '0612345678': 1, 'jeanne.essai@real-mail.test': true }, ['jeanne', 'Paul Martin', '0612345678', 'real-mail']],
  ['préfixe synthétique suivi de texte réel', { other: 'anon- Jeanne Essai habite 10 rue des Lilas', note: 'Jeanne, 10 rue des Lilas x@example.invalid', ip2: '192.0.2.1 Jeanne Essai 10 rue des Lilas', file: 'anonymized/../Jeanne Essai.jpg' }, ['Lilas', 'Jeanne']],
  ['dates de naissance', { birthday: new Date('1990-05-04T00:00:00Z'), dob: '1990-05-04', dateOfBirth: 641779200000 }, ['1990-05-04', '641779200000']],
  ['données binaires', { blob: Buffer.from('Jeanne Essai 10 rue des Lilas') }, ['Lilas']],
  ['mot d’identité sous une clé autorisée', { source: 'jeanne', category: 'Essai', kind: 'JeanneEssai' }, ['jeanne', 'Essai']],
];

const SETTINGS_LEAKS = [
  ['mots isolés en mode réglages', { homeCity: 'Villeurbanne', wifi: 'Livebox-7F3A', nickname2: 'Jeannot' }, ['Villeurbanne', 'Livebox', 'Jeannot']],
  ['identité en mode réglages', { voiceProfile: 'jeanne', alias: 'essai2024' }, ['jeanne', 'essai']],
];

describe('nettoyeur de JSON : chaque fuite de l’audit', () => {
  for (const [name, raw, needles] of LEAKS) {
    it(`retire et signale — ${name}`, () => {
      const ctx = context();
      const out = scrubJson(raw, ctx, ['doc', 'f'], () => {});
      const text = serialize(out);
      needles.forEach((n) => assert.ok(!text.includes(n), `« ${n} » survit : ${text}`));
      assert.deepEqual(jsonViolations(out, ctx), [], 'le nettoyé passe le contrôle');
      assert.ok(jsonViolations(raw, ctx).length > 0, 'le contrôle ne voit pas la fuite brute');
    });
  }
  for (const [name, raw, needles] of SETTINGS_LEAKS) {
    it(`retire et signale — ${name}`, () => {
      const ctx = context();
      const out = scrubJson(raw, ctx, ['doc', 'f'], () => {}, 'settings');
      const text = serialize(out);
      needles.forEach((n) => assert.ok(!text.toLowerCase().includes(n.toLowerCase()), `« ${n} » survit : ${text}`));
      assert.deepEqual(jsonViolations(out, ctx, 'settings'), []);
      assert.ok(jsonViolations(raw, ctx, 'settings').length > 0, 'le contrôle ne voit pas la fuite brute');
    });
  }
});

describe('nettoyeur de JSON : ce qui doit rester', () => {
  it('énumérations, nombres, emojis, formes techniques et GeoJSON restent', () => {
    const ctx = context();
    const id = '0123456789abcdef01234567';
    const raw = {
      kind: 'note', type: 'Point', translationModel: 'nllb', language: 'fr', locale: 'zh-Hans', status: 'SENT', mimeType: 'audio/mp4',
      count: 3, seen: true, durationMs: 9000, emoji: '❤️', userId: id, at: '2026-01-02T08:00:00Z', languageCode: 'fr',
      position: { x: 0.4321, y: 0.5123 }, translations: { en: { text: 'Le phare.' } }, reactions: { '❤️': 2 },
    };
    const out = scrubJson(raw, ctx, ['doc', 'f'], () => {});
    assert.deepEqual(out, raw);
    assert.deepEqual(jsonViolations(raw, ctx), []);
    const geo = scrubJson({ geoPoint: { type: 'Point', coordinates: [4.835659, 45.764043] } }, ctx, ['doc', 'f'], () => {});
    assert.equal(geo.geoPoint.type, 'Point', 'le type GeoJSON reste (index 2dsphere)');
    assert.ok(geo.geoPoint.coordinates.every(s.isSyntheticCoordinate));
  });

  it('réglages : énumérations et heures restent', () => {
    const ctx = context();
    const raw = { theme: 'dark', accentColor: '#FF00AA', interfaceLanguage: 'fr', dndStartTime: '22:00', visibility: 'FRIENDS_ONLY', fontSize: 'large', autoDownload: 'wifiOnly', enabled: true };
    assert.deepEqual(scrubJson(raw, ctx, ['doc', 'f'], () => {}, 'settings'), raw);
    assert.deepEqual(jsonViolations(raw, ctx, 'settings'), []);
  });

  it('une valeur synthétique se reconnaît à sa forme COMPLÈTE, jamais à un préfixe', () => {
    assert.equal(s.isSyntheticToken('anon- Jeanne'), false);
    assert.equal(s.isSyntheticToken(s.token('x', 1)), true);
    assert.equal(s.isSyntheticToken(s.fingerprint('x', 1)), true);
    assert.equal(s.isSyntheticEmail('Jeanne x@example.invalid'), false);
    assert.equal(s.isSyntheticEmail(s.email('x', 1)), true);
    assert.equal(s.isSyntheticIp('192.0.2.1 Jeanne'), false);
    assert.equal(s.isSyntheticIp('2001:db8:Jeanne'), false);
    assert.equal(s.isSyntheticIp(s.ipv4('x', 1)), true);
    assert.equal(s.isPlaceholderPath('anonymized/../Jeanne.jpg'), false);
    assert.equal(s.isPlaceholderPath('anonymized/placeholder.png'), true);
    assert.equal(s.isSyntheticFileName('anon-Jeanne.jpg'), false);
    assert.equal(s.isSyntheticFileName(s.fileName('x', 'a.jpg', 1)), true);
    assert.equal(s.isSyntheticCoordinate(-0.1276), false, 'la longitude de Londres n’est pas synthétique');
    assert.equal(s.isSyntheticCoordinate(s.coordinate('x', 1)), true);
  });
});
