/**
 * Garde REV-4/B3 — les actions de rang sont RÉUTILISÉES, jamais recopiées.
 *
 * Le verdict de la porte V2 qualifie la V4 de « câblage, pas de conception » ;
 * la réponse à B3 ne vaut donc que si la voie Lentille monte LE MÊME menu
 * d'actions que le rang historique — mêmes entrées, mêmes handlers, même
 * magasin — et non un jumeau qui divergera au premier changement.
 *
 * Cette garde est STRUCTURELLE (source), pas comportementale : un test de
 * rendu resterait vert devant une copie parfaite le jour de sa copie. Elle
 * vérifie trois choses :
 *   1. `ConversationItemActions.tsx` exporte bien la section d'entrées
 *      partagée (`ConversationActionMenuItems`) et le rang historique
 *      continue de la monter — l'extraction n'a pas laissé le chemin OFF de
 *      côté ;
 *   2. `LentillePeek.tsx` importe cette section depuis le rang historique et
 *      les handlers depuis `useConversationItemActions` — jamais une
 *      redéfinition locale ;
 *   3. aucun fichier de la peau Lentille ne redéclare d'entrée d'action
 *      (`DropdownMenuItem` avec un libellé `conversationHeader.*`), ce qui
 *      serait la signature d'un menu recopié.
 */
import * as fs from 'fs';
import * as path from 'path';

const WEB_ROOT = path.join(__dirname, '../..');
const SKIN_ROOT = path.join(WEB_ROOT, 'components/conversations/lentille');

const ACTIONS_SOURCE = fs.readFileSync(
  path.join(WEB_ROOT, 'components/conversations/conversation-item/ConversationItemActions.tsx'),
  'utf8'
);
const ITEM_SOURCE = fs.readFileSync(
  path.join(WEB_ROOT, 'components/conversations/conversation-item/ConversationItem.tsx'),
  'utf8'
);
const PEEK_SOURCE = fs.readFileSync(path.join(SKIN_ROOT, 'LentillePeek.tsx'), 'utf8');

function skinFiles(dir: string, files: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === '__tests__') continue;
      skinFiles(path.join(dir, entry.name), files);
      continue;
    }
    if (!/\.tsx?$/.test(entry.name)) continue;
    files.push(path.join(dir, entry.name));
  }
  return files;
}

describe('Garde B3 — le menu d\'actions du rang est partagé, jamais dupliqué', () => {
  it('la garde lit bien des fichiers (anti-silence, leçon 257)', () => {
    expect(ACTIONS_SOURCE.length).toBeGreaterThan(0);
    expect(PEEK_SOURCE.length).toBeGreaterThan(0);
    expect(skinFiles(SKIN_ROOT).length).toBeGreaterThan(0);
  });

  it('la section d\'entrées est exportée par le rang historique, et il la monte lui-même', () => {
    expect(ACTIONS_SOURCE).toMatch(/export\s+(?:const|function)\s+ConversationActionMenuItems\b/);
    expect(ACTIONS_SOURCE).toMatch(/<ConversationActionMenuItems\b/);
  });

  it('les handlers historiques vivent dans un hook partagé, monté par le rang historique', () => {
    expect(ITEM_SOURCE).toMatch(/useConversationItemActions\s*\(/);
    expect(fs.existsSync(path.join(WEB_ROOT, 'components/conversations/conversation-item/use-conversation-item-actions.ts'))).toBe(true);
  });

  it('LentillePeek monte la MÊME section et les MÊMES handlers (imports depuis le rang historique)', () => {
    expect(PEEK_SOURCE).toMatch(
      /import\s*\{[^}]*ConversationActionMenuItems[^}]*\}\s*from\s*['"]\.\.\/conversation-item\/ConversationItemActions['"]/
    );
    expect(PEEK_SOURCE).toMatch(
      /import\s*\{[^}]*useConversationItemActions[^}]*\}\s*from\s*['"]\.\.\/conversation-item\/use-conversation-item-actions['"]/
    );
  });

  it('aucun fichier de la peau Lentille ne redéclare une entrée d\'action historique', () => {
    const offenders: string[] = [];
    for (const file of skinFiles(SKIN_ROOT)) {
      const source = fs.readFileSync(file, 'utf8');
      if (/<DropdownMenuItem\b/.test(source) || /conversationHeader\.(pin|mute|archive|share|reactions|settings)/.test(source)) {
        offenders.push(path.relative(WEB_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  });
});
