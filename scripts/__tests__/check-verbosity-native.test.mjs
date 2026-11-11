import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidEntries, budgetsFromMeasure, iosFamilyOf, measureAndroidFiles, measureIosCatalog, nativeProblems } from '../check-verbosity-native.mjs';

const counters = (labels, words, long = 0, explanations = 0) => ({ labels, words, long, explanations });

test('iOS : la valeur française, famille = premier segment de la clé', () => {
  const measured = measureIosCatalog('Meeshy', {
    sourceLanguage: 'fr',
    strings: {
      'settings.title': { localizations: { fr: { stringUnit: { value: 'Réglages' } } } },
      'settings.privacy.subtitle': { localizations: { fr: { stringUnit: { value: 'Qui peut voir que vous êtes en ligne' } } } },
      'Bloquer cet utilisateur': {},
      'game.count': { localizations: { fr: { variations: { plural: { one: { stringUnit: { value: 'un acte' } }, other: { stringUnit: { value: '%d actes' } } } } } } },
    },
  });
  assert.deepEqual(measured, {
    'ios:Meeshy/settings': counters(2, 9, 0, 1),
    'ios:Meeshy/(phrases)': counters(1, 3),
    'ios:Meeshy/game': counters(2, 4),
  });
});

test('iOS : une clé sans point prend son premier segment souligné', () => {
  assert.equal(iosFamilyOf('2fa_activated_title'), '2fa');
  assert.equal(iosFamilyOf('Comptes sauvegardés'), '(phrases)');
});

test('Android : chaînes, pluriels et tableaux, échappements retirés, commentaires ignorés', () => {
  const entries = androidEntries(`<resources>
    <!-- <string name="mort">jamais</string> -->
    <string name="settings_display_language">Langue d\\'affichage</string>
    <plurals name="unread"><item quantity="one">%d non lu</item><item quantity="other">%d non lus</item></plurals>
  </resources>`);
  assert.deepEqual(entries.map((entry) => entry.value), ["Langue d'affichage", '%d non lu', '%d non lus']);
});

test('Android : famille = module, libellé long et explication comptés', () => {
  const long = 'x '.repeat(45).trim();
  const measured = measureAndroidFiles([{ module: 'feature/settings', xml: `<resources><string name="settings_privacy_footer">${long}</string><string name="ok">OK</string></resources>` }]);
  assert.deepEqual(measured, { 'android:feature/settings': counters(2, 46, 1, 1) });
});

test('dépassement : une famille au-dessus de son budget échoue', () => {
  const budgets = budgetsFromMeasure({ 'android:sdk-ui': counters(10, 30, 1, 2) });
  const problems = nativeProblems({ measured: { 'android:sdk-ui': counters(10, 30, 2, 3) }, budgets, previous: budgets });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /80 caractères/);
  assert.match(problems[1], /explication/);
});

test('sous le budget, tout passe', () => {
  const budgets = budgetsFromMeasure({ 'android:sdk-ui': counters(10, 30, 1, 2) });
  assert.deepEqual(nativeProblems({ measured: { 'android:sdk-ui': counters(9, 25, 0, 2) }, budgets, previous: budgets }), []);
});

test('cliquet : un budget qui monte par rapport à la base échoue', () => {
  const previous = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(10, 30, 1, 2) });
  const budgets = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(10, 30, 1, 3) });
  const problems = nativeProblems({ measured: { 'ios:Meeshy/settings': counters(10, 30, 1, 3) }, budgets, previous });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ne peut que baisser/);
});

test('cliquet : « growth » avec son issue relève le volume, jamais le bavardage', () => {
  const previous = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(10, 30, 1, 2) });
  const budgets = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(12, 34, 2, 2) }, { 'ios:Meeshy/settings': '#17000 — bascule de présence' });
  const problems = nativeProblems({ measured: { 'ios:Meeshy/settings': counters(12, 34, 2, 2) }, budgets, previous });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /80 caractères/);
});

test('cliquet : « growth » sans numéro d’issue ne relève rien', () => {
  const previous = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(10, 30) });
  const budgets = budgetsFromMeasure({ 'ios:Meeshy/settings': counters(11, 30) }, { 'ios:Meeshy/settings': 'parce que' });
  assert.equal(nativeProblems({ measured: { 'ios:Meeshy/settings': counters(11, 30) }, budgets, previous }).length, 1);
});

test('famille absente : une famille mesurée sans budget échoue', () => {
  const budgets = budgetsFromMeasure({});
  const problems = nativeProblems({ measured: { 'android:feature/game': counters(1, 1) }, budgets, previous: null });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /sans budget/);
});

test('famille neuve à la base : son budget n’a pas de cliquet', () => {
  const budgets = budgetsFromMeasure({ 'android:feature/game': counters(5, 9) });
  assert.deepEqual(nativeProblems({ measured: { 'android:feature/game': counters(5, 9) }, budgets, previous: budgetsFromMeasure({}) }), []);
});
