import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { PAGE_PRIVACY } from './privacy';
import { sectionText } from './text';

/**
 * LA POLITIQUE DIT CE QUE DEVIENT LE CARNET D'ADRESSES (#8130).
 *
 * Le serveur conserve le carnet (`UserContact`) pour rapprocher les amis déjà
 * inscrits et annoncer ceux qui arrivent (`contact_joined`). Une politique qui
 * le tait promet moins qu'elle ne fait : le témoin lit la section entière et
 * exige chacune des cinq réponses — quoi, pourquoi, combien de temps, comment
 * l'effacer, et ce que Meeshy ne fait PAS à la place de l'utilisateur.
 */
const addressBook = PAGE_PRIVACY.sections.find((section) => /carnet d'adresses/i.test(section.title));

describe("Politique de confidentialité — le carnet d'adresses (#8130)", () => {
  test('une section dédiée existe', () => {
    expect(addressBook).toBeDefined();
  });

  const text = addressBook ? sectionText(addressBook) : '';

  test('elle dit ce qui est envoyé : numéros, e-mails et noms tels que enregistrés', () => {
    expect(text).toMatch(/numéros/i);
    expect(text).toMatch(/e-mails/i);
    expect(text).toMatch(/noms tels que vous les avez enregistrés/i);
  });

  test('elle dit pourquoi : retrouver ses amis et être prévenu de leur arrivée', () => {
    expect(text).toMatch(/retrouver/i);
    expect(text).toMatch(/rejoint Meeshy/i);
  });

  test('elle dit que personne n’est contacté à la place de l’utilisateur', () => {
    expect(text).toMatch(/personne n'est contacté à votre place/i);
  });

  test('elle dit la conservation et l’effacement à la suppression du compte', () => {
    expect(text).toMatch(/conserv/i);
    expect(text).toMatch(/effac/i);
    expect(text).toMatch(/suppression de votre compte/i);
  });

  test('elle nomme le réglage « Ne pas me proposer » tel que l’app l’affiche', () => {
    expect(text).toContain('Ne pas me proposer à ceux qui ont mon numéro ou mon e-mail');
  });

  /* #8284 — décision porteur : le carnet s'efface à la suppression du compte,
     jamais par un geste à part. La carte le dit, avec ce qui part avec lui,
     et ne promet plus aucun chemin manuel qui n'existe pas. */
  test('la carte « Effacement » dit que supprimer son compte efface le carnet synchronisé', () => {
    expect(text).toMatch(/supprimer votre compte efface aussi votre carnet synchronisé/i);
  });

  test('elle dit que les annonces d’arrivée et les notifications partent avec lui', () => {
    expect(text).toMatch(/annonc/i);
    expect(text).toMatch(/notifications/i);
  });

  test('elle ne promet plus d’effacement manuel', () => {
    expect(text).not.toContain("Effacer mon carnet d'adresses");
    expect(text).not.toMatch(/au bas du Répertoire/);
  });

  test('la date de mise à jour suit la modification', () => {
    expect(PAGE_PRIVACY.mention).toBe('Dernière mise à jour : 22 octobre 2026');
  });
});

/**
 * LA POLITIQUE NOMME SES SOUS-TRAITANTS ET SES TRANSFERTS HORS UE (#9922).
 *
 * Google rejette une déclaration « Sécurité des données » que la politique
 * contredit, et le RGPD (art. 13) exige de nommer les destinataires et les
 * transferts hors UE. Le témoin exige chaque prestataire que le code BRANCHE —
 * et, dans l'autre sens, confronte chaque nom à la source qui l'appelle : une
 * politique qui citerait un prestataire que rien n'appelle mentirait aussi.
 */
const ROOT = new URL('../../../../', import.meta.url);
const source = (path: string): string => readFileSync(new URL(path, ROOT), 'utf8');

const subprocessors = PAGE_PRIVACY.sections.find((section) => /sous-traitants/i.test(section.title));
const transfers = PAGE_PRIVACY.sections.find((section) => /transferts/i.test(section.title));

describe('Politique de confidentialité — les sous-traitants (#9922)', () => {
  test('une section dédiée existe', () => {
    expect(subprocessors).toBeDefined();
  });

  const text = subprocessors ? sectionText(subprocessors) : '';

  const wiredProviders = [
    ['Brevo', 'services/gateway/src/services/email/providers.ts', /api\.brevo\.com/],
    ['SendGrid', 'services/gateway/src/services/email/providers.ts', /api\.sendgrid\.com/],
    ['Mailgun', 'services/gateway/src/services/email/providers.ts', /mailgun/i],
    ['Twilio', 'services/gateway/src/services/SmsService.ts', /TWILIO_ACCOUNT_SID/],
    ['Vonage', 'services/gateway/src/services/SmsService.ts', /VONAGE_API_KEY/],
    ['Firebase Cloud Messaging', 'services/gateway/src/services/web-push-config.ts', /firebase-admin\/messaging/],
    ['Apple Push Notification service', 'infrastructure/docker/compose/docker-compose.prod.yml', /ENABLE_APNS_PUSH=true/],
    ['OpenAI', 'infrastructure/docker/compose/docker-compose.prod.yml', /OPENAI_API_KEY/],
    ['Anthropic', 'infrastructure/docker/compose/docker-compose.prod.yml', /ANTHROPIC_API_KEY/],
  ] as const;
  for (const [name, path, wired] of wiredProviders) {
    test(`${name} est nommé, et le code le branche bien`, () => {
      expect(text).toContain(name);
      expect(source(path)).toMatch(wired);
    });
  }

  test('les prestataires optionnels sont dits « selon la configuration »', () => {
    expect(text).toMatch(/selon la configuration/i);
  });

  test('chaque catégorie dit quelles données part chez le prestataire', () => {
    for (const data of [/adresse e-mail/i, /numéro de téléphone/i, /jeton/i, /texte des messages/i]) {
      expect(text).toMatch(data);
    }
  });

  test('la reconnaissance vocale du système (sous-titres d’appel sur Android) est dite', () => {
    expect(text).toMatch(/reconnaissance vocale/i);
    expect(source('apps/web/android/app/src/main/java/me/meeshy/app/MeeshySpeechPlugin.java')).toMatch(/SpeechRecognizer/);
  });

  test('la géolocalisation par IP reste locale, sans service tiers', () => {
    expect(text).toMatch(/base locale/i);
    expect(source('services/gateway/src/services/geoip/local-geoip-database.ts').length).toBeGreaterThan(0);
  });

  test('la traduction reste interne : aucun prestataire n’est cité pour elle', () => {
    expect(text).toMatch(/traduction[^.]*sans (aucun )?service tiers|sans service tiers[^.]*traduction/i);
  });
});

describe('Politique de confidentialité — les transferts hors UE (#9922)', () => {
  const text = transfers ? sectionText(transfers) : '';

  test('la section des transferts nomme les États-Unis et les garanties du RGPD', () => {
    expect(text).toMatch(/États-Unis/);
    expect(text).toMatch(/clauses contractuelles types/i);
    expect(text).toMatch(/privacy@meeshy\.me/);
  });

  test('elle ne prétend plus que les données restent dans l’UE sans exception', () => {
    expect(text).toMatch(/sous-traitants/i);
  });

  test('le partage renvoie aux sous-traitants au lieu du seul hébergement', () => {
    const sharing = PAGE_PRIVACY.sections.find((section) => /partage de vos données/i.test(section.title));
    expect(sharing ? sectionText(sharing) : '').toMatch(/sous-traitants/i);
  });

  test('la politique mène aux normes de sécurité des enfants', () => {
    expect(PAGE_PRIVACY.run.links.map((l) => l.href)).toContain('/child-safety');
  });
});
