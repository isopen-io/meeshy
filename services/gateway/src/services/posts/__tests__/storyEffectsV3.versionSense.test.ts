/**
 * #4774 — « ce blob est-il du v3 ? » est UNE question posée dans DEUX SENS.
 *
 * En LECTURE, tolérer l'avenir (`v >= 3`) est juste : un document plus récent
 * qu'on sait rendre partiellement vaut mieux qu'un écran vide. En ÉCRITURE /
 * VALIDATION, n'accepter que ce qu'on VALIDE (`v === 3`) est juste :
 * `CanvasV3Schema` décrit la v3, pas la v4.
 *
 * ## Pourquoi ce fichier ne teste QUE le rang 4
 *
 * Leçon 261 : **un témoin de RANG s'écrit sur un rang AUTRE que celui où les
 * deux règles coïncident.** Au `v: 3`, l'égalité stricte et l'inégalité
 * tolérante rendent le MÊME verdict — un témoin posé là ne peut pas tomber, et
 * c'est exactement pourquoi la divergence a survécu six sites durant. Le seul
 * rang qui sépare les deux prédicats est un rang que le dépôt ne produit pas
 * encore : `v: 4`. La mutation est donc le témoin, pas un cas de bord.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { CanvasV3Schema } from '@meeshy/shared/types/canvas-v3';

import {
  isCanvasV3,
  isCanvasV3Exactly,
  isCanvasV3OrNewer,
  storyTranslatableTexts,
  translationSetPath,
  convertStoryEffectsForWire,
  unclaimedCanvasMediaIds,
  negotiateWireStoryEffects,
} from '../storyEffectsV3';

/**
 * Le MÊME document, au rang que l'on veut. Rien d'autre ne change : ce qui
 * sépare les verdicts ci-dessous est la marque, jamais la forme.
 */
const canvasAt = (mark: number): Record<string, unknown> => ({
  v: mark,
  scenes: [{
    id: 's1',
    objects: [
      {
        id: 'o1',
        kind: 'text',
        anchor: { t: 'free', x: 0.5, y: 0.5 },
        plane: 'content',
        z: 0,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        locale: 'fr',
        payload: { text: 'Salut', translations: { en: 'Hi' } },
      },
      {
        id: 'o2',
        kind: 'sticker',
        anchor: { t: 'free', x: 0.2, y: 0.2 },
        plane: 'fg',
        z: 1,
        transform: { scale: 1, rotation: 0, opacity: 1 },
        payload: { mediaId: 'm-42' },
      },
    ],
  }],
});

const v1Blob = (): Record<string, unknown> => ({
  background: '#101010',
  textObjects: [{ id: 't1', text: 'Salut', x: 0.5, y: 0.5 }],
});

// ─── Les deux sens, nommés ────────────────────────────────────────────────────

describe('#4774 — les deux sens du prédicat de version', () => {
  it('rendent le MÊME verdict au rang 3 — c\'est pourquoi un témoin posé là ne peut pas tomber', () => {
    expect(isCanvasV3Exactly(canvasAt(3))).toBe(true);
    expect(isCanvasV3OrNewer(canvasAt(3))).toBe(true);
  });

  it('rendent le MÊME verdict sur un blob v1 — la tolérance ne rétrograde rien', () => {
    expect(isCanvasV3Exactly(v1Blob())).toBe(false);
    expect(isCanvasV3OrNewer(v1Blob())).toBe(false);
    expect(isCanvasV3Exactly(null)).toBe(false);
    expect(isCanvasV3OrNewer(null)).toBe(false);
    expect(isCanvasV3OrNewer('{"v":4}')).toBe(false);
  });

  it('DIVERGENT au rang 4 — le seul rang qui distingue une lecture d\'une validation', () => {
    expect(isCanvasV3OrNewer(canvasAt(4))).toBe(true);
    expect(isCanvasV3Exactly(canvasAt(4))).toBe(false);
  });
});

// ─── LECTURE — un v:4 traverse la chaîne comme du v3 ──────────────────────────

describe('#4774 lecture — un document v:4 traverse la chaîne serveur comme du v3', () => {
  it('rend ses textes traduisibles au lieu de retomber sur la forme v1', () => {
    expect(storyTranslatableTexts(canvasAt(4))).toEqual(storyTranslatableTexts(canvasAt(3)));
    expect(storyTranslatableTexts(canvasAt(4))).toEqual([
      { id: 'o1', text: 'Salut', sourceLanguage: 'fr', translations: { en: 'Hi' } },
    ]);
  });

  it('résout le chemin de persistance de ses traductions dans SA scène', () => {
    expect(translationSetPath(canvasAt(4), 'o1', 'en'))
      .toBe('storyEffects.scenes.0.objects.0.payload.translations.en');
  });

  it('n\'est JAMAIS repassé au convertisseur v1→v3, qui le réduirait à une coquille', () => {
    const doc = canvasAt(4);
    expect(convertStoryEffectsForWire(doc)).toBe(doc);
  });

  it('voit ses références média soumises au claim, au lieu d\'échapper à la garde', () => {
    expect(unclaimedCanvasMediaIds(canvasAt(4), [])).toEqual(['m-42']);
    expect(unclaimedCanvasMediaIds(canvasAt(4), ['m-42'])).toEqual([]);
  });

  it('part TEL QUEL sur le fil vers un client caps-3 (non-régression O17)', () => {
    const post = { id: 'p1', storyEffects: canvasAt(4) };
    expect(negotiateWireStoryEffects(post, { canvasCaps: 3 })).toBe(post);
  });
});

// ─── ÉCRITURE — la sévérité ne bouge pas ─────────────────────────────────────

describe('#4774 écriture — un blob inconnu n\'est jamais VALIDÉ comme compris', () => {
  it('n\'est pas exactement la v3, et le schéma le refuse — les deux verrous tiennent', () => {
    expect(isCanvasV3Exactly(canvasAt(4))).toBe(false);
    expect(CanvasV3Schema.safeParse(canvasAt(4)).success).toBe(false);
  });

  it('garde la porte d\'écriture STRICTE : `isCanvasV3`, que `rejectNonV3StoryEffects` importe, refuse le v:4', () => {
    expect(isCanvasV3(canvasAt(4))).toBe(false);
    expect(isCanvasV3(canvasAt(3))).toBe(true);
  });

  it('accepte la v3 exacte — la sévérité ne coûte pas le cas nominal', () => {
    expect(CanvasV3Schema.safeParse({ v: 3, scenes: canvasAt(3).scenes }).success).toBe(true);
  });
});

// ─── Cliquet — la question ne se réécrit pas à la main ───────────────────────

const SRC_DIR = join(__dirname, '..', '..', '..');

/** Le seul fichier autorisé à ÉCRIRE la comparaison, côté passerelle. */
const SITE_UNIQUE = join('services', 'posts', 'storyEffectsV3.ts');

/**
 * Un prédicat de version écrit à la main : une marque (`v`, `.v`, `mark`,
 * `version`) comparée au littéral 3. On cherche la FORME, jamais un nom de
 * fichier — c'est ce qui rattrape une septième réécriture là où personne ne
 * l'attend, et c'est précisément par ce biais que #4774 a grandi.
 */
const PREDICAT_MANUEL = /(?:\.\s*v|\bv|\bmark|\bversion|\bschemaVersion)\s*(?:===|==|>=|>|<=|<|!==|!=)\s*3\b/;

const SANS_COMMENTAIRES = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((ligne) => ligne.replace(/\/\/.*$/, ''))
    .join('\n');

const IGNORES = new Set(['__tests__', 'node_modules', 'dist']);

function sources(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (IGNORES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sources(full, acc);
    else if (entry.endsWith('.ts') && !/\.(test|spec)\./.test(entry)) acc.push(full);
  }
  return acc;
}

describe('#4774 cliquet — le prédicat de version vit à UN site, nommé par son sens', () => {
  it('voit bien les sources du gateway — sinon un balayage vide passerait au vert', () => {
    expect(sources(SRC_DIR).length).toBeGreaterThan(300);
  });

  it('aucun consommateur ne réécrit la comparaison à la main', () => {
    const fautifs = sources(SRC_DIR)
      .filter((f) => !f.endsWith(SITE_UNIQUE))
      .flatMap((f) => SANS_COMMENTAIRES(readFileSync(f, 'utf8'))
        .split('\n')
        .filter((ligne) => PREDICAT_MANUEL.test(ligne))
        .map((ligne) => `${f.slice(SRC_DIR.length + 1)} — ${ligne.trim()}`));

    expect(fautifs).toEqual([]);
  });

  it('le site unique n\'écrit la comparaison que DEUX fois — une par sens', () => {
    const occurrences = SANS_COMMENTAIRES(readFileSync(join(SRC_DIR, SITE_UNIQUE), 'utf8'))
      .split('\n')
      .filter((ligne) => PREDICAT_MANUEL.test(ligne));

    expect(occurrences).toHaveLength(2);
  });
});
