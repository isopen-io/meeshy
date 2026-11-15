import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'bun:test';

/**
 * **SEUL L'ÉCRAN DE CRÉATION CHOISIT UN MODE DE CHIFFREMENT** (décision du
 * 2026-11-01). Ouvrir une conversation depuis un profil, un partage, la carte
 * d'un contact, le clavier d'appel, une humeur, une notification ou le geste
 * « sans chiffrement de bout en bout » ne choisit rien : la passerelle pose
 * Serveur. Jamais le bout en bout d'office — ces chemins portent des pièces
 * jointes qu'il ne scelle pas encore.
 *
 * Le témoin lit chaque APPEL de création hors des tests et vérifie qu'aucun
 * ne passe `encryptionMode`, sauf l'écran de création.
 */
const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ALLOWED = new Set(['routes/conversation-new.tsx']);
const CALL = /create(?:Direct|Group)Conversation\(([\s\S]*?)\)\s*[;,)\n]/gu;

function sources(dir: string): readonly string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|tsx)$/u.test(entry) && !/\.test\.(ts|tsx)$/u.test(entry) ? [path] : [];
  });
}

describe('les créations hors de l’écran de création n’envoient aucun mode', () => {
  const callers = sources(SRC)
    .map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }))
    .filter(({ file, text }) => file !== 'lib/api/conversations.ts' && /create(?:Direct|Group)Conversation\(/u.test(text));

  test('les sites connus sont bien lus (le témoin n’est pas vide)', () => {
    expect(callers.map(({ file }) => file)).toContain('lib/send/send-sheet-ports.ts');
    expect(callers.map(({ file }) => file)).toContain('routes/conversation-new.tsx');
  });

  for (const { file, text } of callers) {
    test(file, () => {
      const passesMode = [...text.matchAll(CALL)].some((match) => (match[1] ?? '').includes('encryptionMode'));
      expect({ file, passesMode }).toEqual({ file, passesMode: ALLOWED.has(file) });
    });
  }
});
