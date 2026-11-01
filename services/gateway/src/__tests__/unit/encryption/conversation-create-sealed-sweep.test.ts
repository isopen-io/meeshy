/**
 * AUCUNE CONVERSATION NE NAÎT EN CLAIR (directive porteur du 2026-11-01).
 *
 * Le serveur chiffre toujours au repos : tout `conversation.create` de
 * production pose son régime (`nascentRegime` ou `implicitConversationRegime`,
 * `services/conversations/creationRegime.ts`). L'audit du lot a trouvé quatre
 * sites qui l'ignoraient — l'amitié acceptée, les deux branches du lien de
 * partage, la création implicite de la traduction — parce que rien ne les
 * énumérait. Ce balayage les énumère.
 *
 * Exceptions DÉCLARÉES, chacune avec sa raison : les conversations SYSTÈME
 * créées au démarrage, que la migration des conversations sans mode chiffrera
 * (elle attend le feu vert du porteur) — les sceller au démarrage rendrait la
 * passerelle dépendante de la clé maîtresse pour démarrer.
 *
 * @jest-environment node
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const SRC = join(__dirname, '../../..');

const SYSTEM_CONVERSATIONS: Readonly<Record<string, string>> = {
  'services/InitService.ts': 'conversations système de démarrage (Meeshy Global) — migration des conversations sans mode',
  'services/world/worldConversation.ts': 'conversation monde, créée au démarrage — migration des conversations sans mode',
};

const SEALERS = /\b(nascentRegime|implicitConversationRegime)\s*\(/;
const CREATES = /\.conversation\.(create|upsert)\s*\(/;

function productionFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : productionFiles(path);
    return name.endsWith('.ts') && !name.endsWith('.test.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });
}

const creators = productionFiles(SRC)
  .map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }))
  .filter(({ text }) => CREATES.test(text));

describe('tout conversation.create de production pose son régime', () => {
  it('le balayage voit bien les sites de création (une garde qui ne voit rien reste verte)', () => {
    expect(creators.map(({ file }) => file)).toEqual(expect.arrayContaining([
      'routes/conversations/core-lifecycle.ts',
      'routes/directory/friend-request-answer.ts',
      'routes/links/utils/share-link-mint.ts',
    ]));
  });

  it('chaque site scelle sa conversation, ou figure parmi les conversations système déclarées', () => {
    const unsealed = creators
      .filter(({ file }) => !(file in SYSTEM_CONVERSATIONS))
      .filter(({ text }) => !SEALERS.test(text))
      .map(({ file }) => file);
    expect(unsealed).toEqual([]);
  });

  it('une exception déclarée qui ne crée plus rien quitte la liste', () => {
    const creatorFiles = new Set(creators.map(({ file }) => file));
    expect(Object.keys(SYSTEM_CONVERSATIONS).filter((file) => !creatorFiles.has(file))).toEqual([]);
  });
});
