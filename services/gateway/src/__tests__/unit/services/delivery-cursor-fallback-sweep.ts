/**
 * Balayage des dérivations INLINE du repli de livraison (#18701).
 *
 * Le cliquet de TYPE (`CursorDeliveredAt`) ferme la porte qui mène à
 * `resolveReceivedAt`. Il ne peut rien contre un site qui dérive le repli pour
 * servir un AUTRE champ — ce que faisait exactement `getMessageStatusDetails`
 * avec son `deliveredAt`, servi tel quel et gouvernant le filtre « delivered ».
 * Une porte se ferme ; une porte se CONTOURNE.
 *
 * Le discriminant est étroit par décision : une comparaison entre
 * `lastDeliveredAt` et un `createdAt`, qui confronte une horloge MURALE à une
 * POSITION. Les `select`, l'avance du curseur et la borne de la fenêtre de gel
 * (`prevDeliveredAt`) n'en sont pas et sortent par CONSTRUCTION, pas par
 * exemption.
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const WALL_CLOCK_AGAINST_POSITION =
  /(lastDeliveredAt[^\n]*(?:>=|<=|>|<)[^\n]*createdAt)|(createdAt[^\n]*(?:>=|<=|>|<)[^\n]*lastDeliveredAt)/;

export type InlineDerivation = { readonly file: string; readonly line: number; readonly text: string };

export function detectInlineDeliveryFallback(source: string, file = '<inline>'): InlineDerivation[] {
  return source
    .split('\n')
    .map((text, index) => ({ file, line: index + 1, text: text.trim() }))
    .filter(entry => WALL_CLOCK_AGAINST_POSITION.test(entry.text));
}

function productionFiles(root: string): string[] {
  const found: string[] = [];

  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        if (entry === '__tests__' || entry === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) found.push(full);
    }
  };

  walk(root);
  return found;
}

export function sweepInlineDeliveryFallbacks(root: string): InlineDerivation[] {
  return productionFiles(root).flatMap(file =>
    detectInlineDeliveryFallback(readFileSync(file, 'utf8'), file)
  );
}
