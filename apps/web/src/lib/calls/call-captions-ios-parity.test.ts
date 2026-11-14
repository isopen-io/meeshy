import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadCallControlsCatalog, type CallControlsCatalogKey } from '../i18n-call-controls-catalog';
import { loadInterfaceCatalog, type InterfaceCatalogKey } from '../i18n-catalog';
import type { InterfaceLanguage } from '../interface-language';

/**
 * **LES DOUZE LÉGENDES COURTES DE LA PILULE DISENT, SUR LE WEB, CELLES D'iOS**
 * (#17700, P12.3 et P12.12) — chaque légende d'un bouton ou d'une rangée de la
 * liste « l'appel » est comparée, clé à clé et langue à langue, à la clé
 * correspondante de `apps/ios/Meeshy/Localizable.xcstrings`. Le portugais servi
 * est celui qu'iOS catalogue sous `pt-BR` (`decisions.md` § D-52).
 *
 * UNE SEULE différence est admise, et elle est de typographie : le catalogue web
 * écrit l'apostrophe en forme typographique (« L’appel »), comme partout ailleurs
 * dans ses catalogues, là où iOS l'écrit droite (« L'appel »). Le témoin ne la
 * gomme pas des deux côtés : il convertit l'apostrophe d'iOS dans la forme du web
 * et compare au caractère près — une apostrophe droite qui entrerait dans le
 * catalogue web, ou un mot qui changerait, le font rougir.
 */

const IOS_CATALOG = join(dirname(fileURLToPath(import.meta.url)), '../../../../ios/Meeshy/Localizable.xcstrings');

type Source = { readonly catalog: 'interface'; readonly key: InterfaceCatalogKey } | { readonly catalog: 'controls'; readonly key: CallControlsCatalogKey };

/** Les douze légendes : la clé du web, et la clé d'iOS qui dit la même chose. */
const CAPTIONS: readonly { readonly web: Source; readonly ios: string }[] = [
  { web: { catalog: 'interface', key: 'call.section.mine' }, ios: 'call.actions.myImage' },
  { web: { catalog: 'interface', key: 'call.section.call' }, ios: 'call.actions.theCall' },
  { web: { catalog: 'interface', key: 'call.devices.camera' }, ios: 'call.control.camera.caption' },
  { web: { catalog: 'interface', key: 'call.flip' }, ios: 'call.control.flipCamera.caption' },
  { web: { catalog: 'interface', key: 'call.effects' }, ios: 'call.control.effects.caption' },
  { web: { catalog: 'interface', key: 'call.screen.short' }, ios: 'call.screenShare.caption' },
  { web: { catalog: 'interface', key: 'call.record.short' }, ios: 'call.recording.caption' },
  { web: { catalog: 'interface', key: 'callCaptions.region' }, ios: 'call.control.transcript.caption' },
  { web: { catalog: 'controls', key: 'callControls.invite' }, ios: 'call.control.addPeople.caption' },
  { web: { catalog: 'controls', key: 'callControls.react' }, ios: 'call.control.react.caption' },
  { web: { catalog: 'controls', key: 'callControls.journal' }, ios: 'call.captions.journal' },
  { web: { catalog: 'controls', key: 'callControls.capture' }, ios: 'call.control.capture.caption' },
];

const LANGUAGES: readonly { readonly web: InterfaceLanguage; readonly ios: string }[] = [
  { web: 'fr', ios: 'fr' },
  { web: 'en', ios: 'en' },
  { web: 'es', ios: 'es' },
  { web: 'pt', ios: 'pt-BR' },
  { web: 'de', ios: 'de' },
  { web: 'it', ios: 'it' },
  { web: 'ar', ios: 'ar' },
];

type IosCatalog = { readonly strings: Readonly<Record<string, { readonly localizations: Readonly<Record<string, { readonly stringUnit: { readonly value: string } }>> }>> };

const ios = JSON.parse(readFileSync(IOS_CATALOG, 'utf8')) as IosCatalog;

/** La forme du catalogue web : l'apostrophe typographique (U+2019), jamais la droite (U+0027). */
const typographic = (text: string) => text.replaceAll("'", '’');

describe('les légendes courtes de la pilule sont celles d’iOS, dans les sept langues (#17700)', () => {
  for (const language of LANGUAGES) {
    test(`${language.web}`, async () => {
      const [interfaceCatalog, controls] = await Promise.all([loadInterfaceCatalog(language.web), loadCallControlsCatalog(language.web)]);
      const served = CAPTIONS.map(({ web, ios: key }) => ({
        key,
        text: web.catalog === 'interface' ? interfaceCatalog[web.key] : controls[web.key],
      }));
      const expected = CAPTIONS.map(({ ios: key }) => ({ key, text: typographic(ios.strings[key]?.localizations[language.ios]?.stringUnit.value ?? '') }));
      expect(served).toEqual(expected);
      expect(served.filter(({ text }) => text.includes("'"))).toEqual([]);
    });
  }

  test('« L’appel » : le web sert l’apostrophe typographique là où iOS écrit la droite — la même légende, au caractère près', async () => {
    const interfaceCatalog = await loadInterfaceCatalog('fr');
    expect(ios.strings['call.actions.theCall']?.localizations.fr?.stringUnit.value).toBe("L'appel");
    expect(interfaceCatalog['call.section.call']).toBe('L’appel');
  });
});
