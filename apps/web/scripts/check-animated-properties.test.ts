import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  KNOWN_GEOMETRY_ANIMATIONS,
  auditRatchet,
  geometryAnimationsIn,
  scanSources,
  // @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
  // interroge son API publique exactement comme le pilote le fait.
} from './check-animated-properties.mjs';

/**
 * **LES ANIMATIONS DE GÉOMÉTRIE PASSENT SUR `transform` ET `opacity`** (#11314).
 * `width`, `height`, `top`, `left`, `grid-template-rows`… animés déclenchent
 * une mise en page par image : c'est la lenteur que la roadmap compte comme un
 * BUG. Le gate lit les sources et refuse toute nouvelle animation de
 * géométrie ; les sites encore tolérés sont nommés, et la liste ne fait que
 * décroître.
 */
const source = (relative: string): string => readFileSync(fileURLToPath(new URL(`../src/${relative}`, import.meta.url)), 'utf8');

type Found = { readonly property: string };
const properties = (kind: 'css' | 'ts', text: string): readonly string[] => (geometryAnimationsIn({ kind, text }) as readonly Found[]).map((site) => site.property);

describe('geometryAnimationsIn — ce que le gate reconnaît', () => {
  test('une transition CSS sur width / height / grid-template-rows', () => {
    expect(properties('css', '.a { transition: width 400ms ease, opacity 1s; }')).toEqual(['width']);
    expect(properties('css', '.a { transition-property: grid-template-rows; }')).toEqual(['grid-template-rows']);
    expect(properties('css', '.a { transition: transform 1s, opacity 1s; }')).toEqual([]);
  });

  test('un @keyframes qui touche la géométrie, et lui seul', () => {
    const css = '@keyframes burn { 0% { grid-template-rows: 1fr; opacity: 1; } 100% { grid-template-rows: 0fr; height: 0; } }\n.b { height: 4px; }';
    expect(properties('css', css)).toEqual(['grid-template-rows', 'grid-template-rows', 'height']);
  });

  test('une transition en ligne ou en classe Tailwind, camelCase compris', () => {
    expect(properties('ts', "const a = { transition: 'left 180ms ease-out, top 180ms ease-out' };")).toEqual(['left', 'top']);
    expect(properties('ts', 'const b = "transition-[left,top,transform] duration-300";')).toEqual(['left', 'top']);
    expect(properties('ts', "const c = { transition: 'inset-inline-start 160ms ease' };")).toEqual(['inset-inline-start']);
    expect(properties('ts', "const d = { transitionProperty: 'maxHeight' };")).toEqual(['max-height']);
  });

  test('une animation Web dont les images clés portent la géométrie', () => {
    expect(properties('ts', "el.animate([{ height: '0px' }, { height: `${to}px` }], { duration: 300 });")).toEqual(['height', 'height']);
    expect(properties('ts', "el.animate([{ transform: 'none' }, { opacity: 1 }], { duration: 300 });")).toEqual([]);
  });

  test('les commentaires ne comptent pas, ni les propriétés au repos', () => {
    expect(properties('ts', '/* transition: width 1s */\n// transition: height 1s\nconst a = { width: 10, height: 20 };')).toEqual([]);
    expect(properties('css', '/* transition: width 1s; */ .a { width: 10px; transition: opacity 1s; }')).toEqual([]);
  });
});

describe('auditRatchet — la liste tolérée ne fait que décroître', () => {
  test('un site hors liste est refusé, un site de la liste disparu aussi', () => {
    const known = { 'a.tsx': ['width'] };
    expect(auditRatchet({ found: { 'a.tsx': ['width'] }, known })).toEqual([]);
    const extra = auditRatchet({ found: { 'a.tsx': ['width', 'height'] }, known }) as readonly string[];
    expect(extra).toHaveLength(1);
    expect(extra[0]).toContain('a.tsx anime de la géométrie (height)');
    expect(auditRatchet({ found: { 'b.tsx': ['top'] }, known })).toHaveLength(2);
    const gone = auditRatchet({ found: {}, known }) as readonly string[];
    expect(gone).toHaveLength(1);
    expect(gone[0]).toContain('retirer');
  });
});

describe('les six sites du lot sont à zéro', () => {
  const none = (kind: 'css' | 'ts', relative: string) => expect(properties(kind, source(relative))).toEqual([]);

  test('long-message-text.tsx : le dépliage se joue en FLIP', () => none('ts', 'components/long-message-text.tsx'));
  test('app.css : plus de grid-template-rows animé', () => none('css', 'styles/app.css'));
  test('conversation-row-swipe.css : plus de width animée', () => none('css', 'styles/conversation-row-swipe.css'));
  test('call-bubble.tsx : plus de left/top/width/height animés', () => none('ts', 'components/call-bubble.tsx'));
  test('call-stage.tsx : plus de left/top/width/height animés', () => none('ts', 'components/call-stage.tsx'));
  test('comments-zone.ts : plus de height/bottom animés', () => none('ts', 'lib/view/comments-zone.ts'));
});

describe('le dépôt entier', () => {
  test('aucune animation de géométrie hors de la liste tolérée', () => {
    const found = scanSources() as Readonly<Record<string, readonly string[]>>;
    expect(auditRatchet({ found, known: KNOWN_GEOMETRY_ANIMATIONS })).toEqual([]);
  });
});
