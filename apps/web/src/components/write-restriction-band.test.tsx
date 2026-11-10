import { beforeAll, describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { loadInterfaceCatalog, translate } from '@/lib/i18n-catalog';
import { SUPPORTED_INTERFACE_LANGUAGES } from '@/lib/inline-interface-language-bootstrap.js';

import { WriteRestrictionBand } from './write-restriction-band';

beforeAll(async () => {
  await Promise.all(SUPPORTED_INTERFACE_LANGUAGES.map((language) => loadInterfaceCatalog(language)));
});

/**
 * LA COQUE ANDROID EST DÉJÀ L'APP MEESHY (#13066) — le bandeau d'une
 * conversation chiffrée de bout en bout renvoie le navigateur vers l'app
 * installée ; dans la coque, il renvoie vers un des appareils chiffrés, comme
 * l'écran « Mes appareils chiffrés » de la même coque.
 */
describe('WriteRestrictionBand — conversation chiffrée de bout en bout', () => {
  test('sur le web, le bandeau renvoie vers l’app Meeshy', () => {
    expect(renderToStaticMarkup(<WriteRestrictionBand restriction="end-to-end-encrypted" language="fr" />)).toContain(
      'écrivez depuis l’app Meeshy',
    );
  });

  test('dans la coque, aucune langue ne renvoie vers l’app où l’on se trouve déjà', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const band = renderToStaticMarkup(<WriteRestrictionBand restriction="end-to-end-encrypted" language={language} shell />);
      expect(band).not.toContain(translate(language, 'composer.writeRestriction.endToEnd'));
      expect(band).toContain(translate(language, 'composer.writeRestriction.endToEnd.shell'));
    }
    expect(renderToStaticMarkup(<WriteRestrictionBand restriction="end-to-end-encrypted" language="fr" shell />)).toContain(
      'un de vos appareils chiffrés',
    );
  });
});

/**
 * UN AMI WHATSAPP (#17118) — aucun relais ne porte encore un message vers un
 * réseau tiers : le bandeau ne renvoie vers AUCUNE app (aucune ne sait encore
 * lui écrire), il dit l'attente, dans chaque langue et dans la coque aussi.
 */
describe('WriteRestrictionBand — conversation avec un ami WhatsApp', () => {
  test('le bandeau dit que l’envoi vers WhatsApp n’est pas encore ouvert, jamais « écrivez depuis l’app »', () => {
    const band = renderToStaticMarkup(<WriteRestrictionBand restriction="external-pending" language="fr" />);
    expect(band).toContain('L’envoi vers WhatsApp n’est pas encore ouvert');
    expect(band).not.toContain('app Meeshy');
  });

  test('chaque langue, coque comprise, a sa phrase', () => {
    for (const language of SUPPORTED_INTERFACE_LANGUAGES) {
      const phrase = translate(language, 'composer.writeRestriction.externalPending');
      expect(phrase).not.toBe('composer.writeRestriction.externalPending');
      expect(renderToStaticMarkup(<WriteRestrictionBand restriction="external-pending" language={language} shell />)).toContain(phrase);
    }
  });
});
