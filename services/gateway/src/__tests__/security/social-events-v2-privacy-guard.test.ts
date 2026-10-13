/**
 * Gardes de la télémétrie v2 (#10499, revue de conformité O3, O8).
 *
 * 1. **Aucune chaîne libre au schéma** : aucun type v2 ne déclare un champ
 *    qui pourrait porter un texte saisi, une adresse complète ou une image.
 * 2. **O8 — la capture d'écran et la visite de profil ne sont jamais
 *    servies par acteur** : seules l'écriture, la purge, le retrait de
 *    consentement, les index et l'export de SES PROPRES données touchent
 *    `ContentEvent`. Une route qui lirait cette collection pour dire « X a
 *    capturé votre post » ou « X a visité votre profil » rougit ici : c'est un
 *    traitement distinct, avec sa propre base légale (#10511).
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { z } from 'zod';
import { SOCIAL_EVENT_V2_SCHEMAS } from '../../routes/social/eventsV2Schemas';

const SRC = join(__dirname, '..', '..');

const sources = (dir: string): string[] => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  if (statSync(path).isDirectory()) return name === '__tests__' || name === 'node_modules' ? [] : sources(path);
  return /\.ts$/.test(name) && !/\.test\.ts$/.test(name) ? [path] : [];
});

const relative = (path: string) => path.slice(SRC.length + 1);

const FREE_TEXT = /^(q|query|search|text|url|href|uri|content|caption|message|body|title|name|image|screenshot|data|html|note|comment)$/i;

describe('schémas v2 — aucun champ de texte libre', () => {
  it.each(Object.entries(SOCIAL_EVENT_V2_SCHEMAS))('%s ne déclare aucun champ de texte libre', (_type, schema) => {
    const keys = Object.keys((schema as z.ZodObject<z.ZodRawShape>).shape);
    expect(keys.filter((key) => FREE_TEXT.test(key))).toEqual([]);
  });
});

const CONTENT_EVENT_READERS_ALLOWED = [
  'services/social/contentEvents.ts',
  'services/social/countingReplays.ts',
  'services/social/socialEventsV2.ts',
  'services/social/socialEventIndexes.ts',
  'services/social/socialEventsRetentionMigration.ts',
  'services/social/consentWithdrawal.ts',
  'services/social/readingTelemetryErasure.ts',
  'routes/me/export-reading.ts',
  'services/InitService.ts',
];

describe('O8 — personne ne sert la télémétrie v2 par acteur', () => {
  it('seuls l’écriture, la purge, le retrait, les index et l’export de soi touchent ContentEvent', () => {
    const touching = sources(SRC)
      .filter((path) => /contentEvent\.|['"`]ContentEvent['"`]|CONTENT_EVENT_COLLECTION/.test(readFileSync(path, 'utf8')))
      .map(relative)
      .filter((path) => !CONTENT_EVENT_READERS_ALLOWED.includes(path));

    expect(touching).toEqual([]);
  });

  it('aucune route hors de la porte d’ingestion ne nomme screen_capture ni profile_visit', () => {
    const routes = sources(join(SRC, 'routes'))
      .filter((path) => !path.includes(`${join('routes', 'social')}`))
      .filter((path) => /screen_capture|profile_visit/.test(readFileSync(path, 'utf8')))
      .map(relative);

    expect(routes).toEqual([]);
  });
});
