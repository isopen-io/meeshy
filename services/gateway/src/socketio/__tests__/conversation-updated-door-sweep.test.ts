/**
 * @jest-environment node
 *
 * LE CLIQUET DE LA PORTE — aucune boucle `conversation:updated` écrite à la
 * main ne revient (#18380).
 *
 * Le lot a dérivé QUATRE boucles vers `emitConversationUpdatedPerReader`. Un
 * type ne peut pas garder ce résultat : rien n'oblige un cinquième émetteur à
 * importer le site unique, et sa boucle compilerait parfaitement. C'est la
 * forme du balayage de `server-emit-door-sweep` — une porte se ferme, une
 * porte se CONTOURNE, et seule la seconde a besoin d'un balayage.
 *
 * **Quand il tombe, la réparation est de DÉRIVER, jamais d'ajouter une ligne à
 * un inventaire** : il n'y a pas de fan-out `conversation:updated` non confiné
 * qui soit légitime. L'inventaire doit rester VIDE.
 *
 * Le balayage prouve d'abord qu'il balaie — une garde négative dont la lecture
 * rend `[]` reste verte quoi qu'il arrive (leçon du cycle 107, où un balayage
 * qui cherchait UN idiome mesurait sa popularité).
 */
import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const SRC = join(__dirname, '..', '..');
/** Le site unique est le SEUL autorisé à épeler l'émission. */
const LE_SITE_UNIQUE = 'socketio/conversationUpdatedPerReader.ts';

function sources(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === '__tests__' || entry === 'node_modules') continue;
      sources(full, found);
    } else if (entry.endsWith('.ts')) {
      found.push(full);
    }
  }
  return found;
}

/** Les fichiers de production qui ÉMETTENT `conversation:updated`, hors site unique. */
function emitteursHorsSiteUnique(): string[] {
  return sources(SRC)
    .filter((file) => /\.emit\(\s*SERVER_EVENTS\.CONVERSATION_UPDATED/.test(readFileSync(file, 'utf8')))
    .map((file) => relative(SRC, file).split('\\').join('/'))
    .filter((file) => file !== LE_SITE_UNIQUE)
    .sort();
}

describe('`conversation:updated` — un seul site épelle son émission (#18380)', () => {
  it('le balayage LIT bien les sources de la passerelle', () => {
    const files = sources(SRC);
    expect(files.length).toBeGreaterThan(200);
    expect(files.some((f) => f.endsWith(LE_SITE_UNIQUE.split('/').pop() as string))).toBe(true);
  });

  it("le site unique est le SEUL à épeler l'émission — inventaire VIDE", () => {
    // Le message vit DANS les éléments comparés : `expect` de Jest ne prend pas
    // de second argument, et une garde qui tombe sans NOMMER ce qu'elle a
    // trouvé bloque sans informer (#18240).
    expect(
      emitteursHorsSiteUnique().map(
        (file) =>
          `${file} — émet \`conversation:updated\` à la main. Une boucle par lecteur écrite ici ` +
          `fait payer à chaque lecteur l'échec du précédent, et à l'appelant tout ce qu'il fait ` +
          `APRÈS. Dériver \`emitConversationUpdatedPerReader\` plutôt qu'ajouter une ligne ici.`,
      ),
    ).toEqual([]);
  });
});
