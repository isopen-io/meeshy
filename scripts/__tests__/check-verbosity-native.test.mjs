import assert from 'node:assert/strict';
import { test } from 'node:test';

import { androidEntries, iosFamilyOf, lowerBudgets, measureAndroidFiles, measureIosCatalog, nativeVerdict } from '../check-verbosity-native.mjs';

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

const budgetsOf = (families) => ({ families });

test('dépassement : plus de libellés longs ou d’explications que le budget échoue', () => {
  const budgets = budgetsOf({ 'android:sdk-ui': counters(10, 30, 1, 2) });
  const { problems } = nativeVerdict({ measured: { 'android:sdk-ui': counters(10, 30, 2, 3) }, budgets, previous: budgets });
  assert.equal(problems.length, 2);
  assert.match(problems[0], /80 caractères/);
  assert.match(problems[1], /explication/);
});

test('dépassement de volume : signalé, sans rougir — chaque feature ajoute des libellés', () => {
  const budgets = budgetsOf({ 'android:sdk-ui': counters(10, 30, 1, 2) });
  const { problems, notes } = nativeVerdict({ measured: { 'android:sdk-ui': counters(12, 34, 1, 2) }, budgets, previous: budgets });
  assert.deepEqual(problems, []);
  assert.equal(notes.length, 2);
});

test('sous le budget, tout passe', () => {
  const budgets = budgetsOf({ 'android:sdk-ui': counters(10, 30, 1, 2) });
  assert.deepEqual(nativeVerdict({ measured: { 'android:sdk-ui': counters(9, 25, 0, 2) }, budgets, previous: budgets }), { problems: [], notes: [] });
});

test('cliquet : un budget qui monte par rapport à la base échoue, volume compris', () => {
  const previous = budgetsOf({ 'ios:Meeshy/settings': counters(10, 30, 1, 2) });
  const budgets = budgetsOf({ 'ios:Meeshy/settings': counters(11, 30, 1, 3) });
  const { problems } = nativeVerdict({ measured: { 'ios:Meeshy/settings': counters(10, 30, 1, 2) }, budgets, previous });
  assert.equal(problems.length, 2);
  for (const problem of problems) assert.match(problem, /ne peut que baisser/);
});

test('cliquet : sans base lisible, seuls les budgets sont tenus', () => {
  const budgets = budgetsOf({ 'ios:Meeshy/settings': counters(10, 30, 1, 2) });
  assert.deepEqual(nativeVerdict({ measured: { 'ios:Meeshy/settings': counters(10, 30, 1, 2) }, budgets, previous: null }).problems, []);
});

test('famille absente des budgets : signalée, son cliquet part du jour où on l’inscrit', () => {
  const { problems, notes } = nativeVerdict({ measured: { 'android:feature/game': counters(1, 1, 1, 1) }, budgets: budgetsOf({}), previous: null });
  assert.deepEqual(problems, []);
  assert.equal(notes.length, 1);
  assert.match(notes[0], /sans budget/);
});

test('famille absente de la base : son budget n’a pas de cliquet', () => {
  const budgets = budgetsOf({ 'android:feature/game': counters(5, 9) });
  assert.deepEqual(nativeVerdict({ measured: { 'android:feature/game': counters(5, 9) }, budgets, previous: budgetsOf({}) }).problems, []);
});

test('--write n’abaisse que : le plus petit du budget et du relevé, une famille neuve à son relevé', () => {
  const lowered = lowerBudgets(budgetsOf({ 'ios:Meeshy/settings': counters(10, 30, 1, 2) }), {
    'ios:Meeshy/settings': counters(12, 25, 0, 2),
    'android:sdk-ui': counters(3, 4),
  });
  assert.deepEqual(lowered, budgetsOf({ 'android:sdk-ui': counters(3, 4), 'ios:Meeshy/settings': counters(10, 25, 0, 2) }));
  assert.deepEqual(Object.keys(lowered.families), ['android:sdk-ui', 'ios:Meeshy/settings']);
});
