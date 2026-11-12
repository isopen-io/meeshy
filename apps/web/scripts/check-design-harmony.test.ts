import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

// @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
// interroge son API publique exactement comme le pilote le fait.
import { EXEMPT_PATHS, auditSources, exemptionOf, isInScope, scanSource } from './check-design-harmony.mjs';

/**
 * LE TÉMOIN DU GATE D'HARMONIE (#8879).
 *
 * Le gate refuse, dans le code des écrans, toute couleur que la charte
 * nomme déjà : un hexadécimal, un `rgb()`, une classe à couleur arbitraire,
 * un `bg-white`/`text-black` brut, une teinte de la palette Tailwind. Sa
 * LOGIQUE se garde ici, par ses deux moitiés — ce qu'il attrape, et ce qu'il
 * laisse passer à dessein (un jeton, un commentaire, une couleur de tiers
 * DÉCLARÉE) — sans quoi un gate vert ne dirait rien.
 */

type Violation = { readonly line: number; readonly kind: string; readonly match: string };

const kinds = (text: string): readonly string[] => (scanSource(text) as readonly Violation[]).map((v) => v.kind);

describe('scanSource — ce que le gate attrape', () => {
  test('un hexadécimal dans une chaîne, à 3, 6 ou 8 chiffres', () => {
    expect(kinds("const a = '#fff';")).toEqual(['hex']);
    expect(kinds('<div style={{ color: "#6366f1" }} />')).toEqual(['hex']);
    expect(kinds('const b = `0 0 0 1px #11223344`;')).toEqual(['hex']);
  });

  test('un rgb()/rgba()/hsl()/hsla() littéral', () => {
    expect(kinds("const a = 'rgba(0,0,0,0.5)';")).toEqual(['rgb']);
    expect(kinds("const a = 'rgb(0 0 0 / 0.35)';")).toEqual(['rgb']);
    expect(kinds("const a = 'hsl(240 5% 10%)';")).toEqual(['rgb']);
  });

  test('une classe Tailwind à couleur arbitraire', () => {
    expect(kinds('<p className="bg-[#111] p-2" />')).toEqual(['arbitrary-class']);
    expect(kinds('<p className="text-[rgb(1,2,3)]" />')).toEqual(['arbitrary-class']);
  });

  test('un utilitaire blanc/noir brut, avec ou sans opacité ni variante', () => {
    expect(kinds('<p className="text-white" />')).toEqual(['raw-white-black']);
    expect(kinds('<p className="p-2 hover:bg-black/40" />')).toEqual(['raw-white-black']);
    expect(kinds('<p className="border-t-white/20" />')).toEqual(['raw-white-black']);
    expect(kinds("const c = 'backdrop:bg-black/40';")).toEqual(['raw-white-black']);
  });

  test('un mot-clé `white`/`black` servi comme COULEUR CSS', () => {
    expect(kinds("const s = { color: 'white' };")).toEqual(['keyword']);
    expect(kinds("const s = { background: 'color-mix(in srgb, white 16%, transparent)' };")).toEqual(['keyword']);
    expect(kinds('const g = `linear-gradient(160deg, ${accent}, black 75%)`;')).toEqual(['keyword']);
    expect(kinds("const b = '1px solid white';")).toEqual(['keyword']);
  });

  test('une teinte de la palette Tailwind brute', () => {
    expect(kinds('<p className="text-red-500" />')).toEqual(['palette']);
    expect(kinds('<p className="bg-indigo-950/60" />')).toEqual(['palette']);
  });

  test('la LIGNE est celle du littéral, pas celle de la déclaration', () => {
    const found = scanSource("const a = 1;\nconst b = {\n  c: '#000',\n};\n") as readonly Violation[];
    expect(found.map((v) => v.line)).toEqual([3]);
  });
});

describe('scanSource — ce que le gate laisse passer à dessein', () => {
  test('un jeton, une variable, un color-mix de jetons', () => {
    expect(kinds("const a = 'var(--color-ios-ink)';")).toEqual([]);
    expect(kinds("const a = 'color-mix(in srgb, var(--color-ios-ink-3) 22%, transparent)';")).toEqual([]);
    expect(kinds('<p className="text-on-media bg-scrim border-edge" />')).toEqual([]);
    expect(kinds("const a = 'var(--ios-indigo-500)';")).toEqual([]);
  });

  test('un commentaire qui CITE une couleur', () => {
    expect(kinds("// l'ancien '#f45b5b' tenait 4,04:1\nconst a = 1;")).toEqual([]);
    expect(kinds("/* bg-black/40 était écrit ici */\nconst a = 1;")).toEqual([]);
  });

  test('une ancre, un identifiant ou un texte sans couleur', () => {
    expect(kinds("const a = '#section';")).toEqual([]);
    expect(kinds("const a = 'Black Friday';")).toEqual([]);
    expect(kinds('<p className="whitespace-nowrap text-body" />')).toEqual([]);
  });

  test('une apostrophe de texte JSX ne décale pas la lecture des chaînes', () => {
    expect(kinds("<p>l'écran</p>\n<div className=\"p-2\" />")).toEqual([]);
  });
});

describe('le marqueur inline — une couleur de TIERS, déclarée avec sa raison', () => {
  test('sur la même ligne, il exempte', () => {
    expect(kinds("const a = '#ff0000'; // harmony-exempt: couleur choisie par l'auteur de la story")).toEqual([]);
  });

  test('sur la ligne précédente, il exempte', () => {
    expect(kinds("// harmony-exempt: modèle de carte choisi par l'utilisateur\nconst a = '#ff0000';")).toEqual([]);
    expect(kinds("{/* harmony-exempt: vignette d'un effet d'appel */}\n<p style={{ color: '#ff0000' }} />")).toEqual([]);
  });

  test('SANS raison, il n\'exempte rien et se signale lui-même', () => {
    expect(kinds("const a = '#ff0000'; // harmony-exempt:")).toEqual(['marker-without-reason', 'hex']);
  });

  test("il n'exempte que sa ligne et la suivante", () => {
    expect(kinds("// harmony-exempt: tiers\nconst a = 1;\nconst b = '#ff0000';")).toEqual(['hex']);
  });
});

describe('le périmètre', () => {
  test('les tests, les déclarations et le chantier du composer sont hors périmètre', () => {
    expect(isInScope('components/bubble.tsx')).toBe(true);
    expect(isInScope('components/bubble.test.tsx')).toBe(false);
    expect(isInScope('bun-test.d.ts')).toBe(false);
    expect(isInScope('test-support/act-mount.ts')).toBe(false);
    expect(isInScope('components/story-compose-canvas.tsx')).toBe(false);
    expect(isInScope('routes/story-compose.tsx')).toBe(false);
    expect(isInScope('lib/view/use-studio-sheet.ts')).toBe(false);
    expect(isInScope('routes/publication-compose.tsx')).toBe(false);
    expect(isInScope('components/composer-tray.tsx')).toBe(false);
    expect(isInScope('routes/status-compose.tsx')).toBe(false);
  });

  test('chaque chemin exempté porte sa RAISON', () => {
    expect((EXEMPT_PATHS as readonly { reason: string }[]).length).toBeGreaterThan(0);
    for (const entry of EXEMPT_PATHS as readonly { prefix: string; reason: string }[]) {
      expect(entry.prefix.length).toBeGreaterThan(0);
      expect(entry.reason.length).toBeGreaterThan(20);
    }
  });

  test('un chemin exempté rend sa raison, un chemin de chrome rend null', () => {
    const [first] = EXEMPT_PATHS as readonly { prefix: string; reason: string }[];
    expect(exemptionOf(`${first?.prefix}x.ts`)).toBe(first?.reason);
    expect(exemptionOf('components/bubble.tsx')).toBe(null);
  });
});

describe("l'art d'attente baké — même dessin que sa source, même exemption", () => {
  test('le SVG généré du sticker Mee/Meo (components/screen-wait-art.ts) est exempté, comme sa source lib/mee/', () => {
    // La source du dessin est DÉJÀ exemptée sous `lib/mee/` (palette des
    // PERSONNAGES, peinte dans le SVG du sticker). Son jumeau BAKÉ — généré par
    // `scripts/generate-screen-wait-art.ts`, « ne pas modifier à la main », et
    // byte-identique à la source (gardé par `screen-wait.test.tsx`) — porte la
    // MÊME palette de personnages : le gate ne doit pas le compter comme chrome.
    expect(exemptionOf('lib/mee/screen-wait-art-source.ts')).not.toBe(null);
    expect(exemptionOf('components/screen-wait-art.ts')).not.toBe(null);
  });

  test("l'exemption du baké ne couvre ni le composant hôte ni son témoin, qui restent du chrome scanné", () => {
    expect(exemptionOf('components/screen-wait.tsx')).toBe(null);
    expect(isInScope('components/screen-wait.test.tsx')).toBe(false);
  });
});

describe("l'écran d'humeur — un chrome immersif qui se LIT dans la charte", () => {
  // La page d'humeur (`components/mood-page.tsx`) est un plein écran posé SUR un
  // média : encre blanche, voiles noirs, halo d'avatar. Chacune de ces couleurs
  // a un RÔLE que la charte nomme déjà (`on-media`, `on-brand`, `scrim*`,
  // `media-backdrop`) ; aucune ne doit rester un littéral brut. Le témoin lit la
  // VRAIE source par l'API publique du gate — la même que le pilote.
  const source = readFileSync(fileURLToPath(new URL('../src/components/mood-page.tsx', import.meta.url)), 'utf8');

  test('mood-page.tsx ne porte aucune couleur de chrome en dur', () => {
    expect(scanSource(source)).toEqual([]);
  });

  test("le chrome immersif passe par les jetons de la charte, pas par l'exemption", () => {
    expect(exemptionOf('components/mood-page.tsx')).toBe(null);
    expect(source).toContain('text-on-media');
    expect(source).toContain('var(--color-scrim');
    expect(source).toContain('var(--color-media-backdrop)');
  });
});

describe("le fini arc-en-ciel d'un aperçu — le spectre de la maison, pas une couleur en dur", () => {
  // La ligne d'aperçu (`components/lens-preview-line.tsx`) peint le fini
  // « rainbow » d'un message. Son spectre n'est PAS du chrome libre : c'est LE
  // SPECTRE DE LA MAISON (`RAINBOW_SPECTRUM`, miroir iOS `houseSpectrum`), déjà
  // joué par la bulle (`effects-runner`). Le dégradé doit donc en DÉRIVER —
  // pas être un arc-en-ciel réécrit en littéraux ici, qui divergeait de la
  // bulle et d'iOS. Pas une exemption : une source unique partagée.
  const source = readFileSync(fileURLToPath(new URL('../src/components/lens-preview-line.tsx', import.meta.url)), 'utf8');

  test('lens-preview-line.tsx ne porte aucune couleur en dur', () => {
    expect(scanSource(source)).toEqual([]);
  });

  test('le spectre vient de la source unique RAINBOW_SPECTRUM, pas d’une jumelle ni d’une exemption', () => {
    expect(exemptionOf('components/lens-preview-line.tsx')).toBe(null);
    expect(source).toContain('RAINBOW_SPECTRUM');
    expect(source).not.toContain('#f43f5e');
    expect(source).not.toContain('#a855f7');
  });
});

describe("la barre de talkie élargie — un chrome immersif qui se LIT dans la charte", () => {
  // La bande de talkie (`components/talkie-header-band.tsx`, transposition de
  // `TalkieHeaderLiveBar.swift`) est un chrome posé SUR le dégradé de la
  // conversation : encre blanche (pastille, dot, chrono), voiles noirs (repli
  // hors-ligne), filets et halos. Chaque couleur a un RÔLE que la charte nomme
  // (`on-media`, `scrim-soft`, `media-fill`/`-hairline`) — aucune ne doit rester
  // un littéral brut. Le rouge d'enregistrement est un APLAT sur surface sombre :
  // il se LIT `var(--ios-error-strong)` (miroir iOS `errorStrong`), jamais
  // `var(--color-error)` qui tombe à un rouge foncé illisible en thème clair.
  // Seuls restent exemptés, déclarés à la ligne : l'onde peinte en CANVAS (hors
  // du DOM) et le masque de luminance (`#000` = opaque, pas une couleur).
  const source = readFileSync(fileURLToPath(new URL('../src/components/talkie-header-band.tsx', import.meta.url)), 'utf8');

  test('talkie-header-band.tsx ne porte aucune couleur de chrome en dur', () => {
    expect(scanSource(source)).toEqual([]);
  });

  test("le chrome immersif passe par les jetons de la charte, pas par l'exemption de chemin", () => {
    expect(exemptionOf('components/talkie-header-band.tsx')).toBe(null);
    expect(source).toContain('var(--color-on-media)');
    expect(source).toContain('var(--color-scrim-soft)');
    expect(source).toContain('var(--color-media-fill)');
  });

  test("le rouge d'enregistrement se lit `ios-error-strong` (aplat sur surface sombre), jamais `color-error`", () => {
    expect(source).toContain('var(--ios-error-strong)');
    expect(source).not.toContain('var(--color-error)');
  });

  test("les deux seules exemptions sont déclarées à la ligne : canvas hors du DOM et masque de luminance", () => {
    expect(source).toContain('harmony-exempt:');
  });
});

describe("la famille appel — un masque de fondu UNIQUE, un verre qui se LIT dans la charte", () => {
  // Trois sites de la famille appel écrivaient le MÊME fondu de bord
  // (`linear-gradient(…, #000 8px, #000 calc(100% - 8px), transparent)`) en
  // JUMELLES divergentes : `RAIL_FADE` (call-control-actions, to bottom),
  // `ROW_EDGE_FADE` (call-row-keys, to right) et le `fade` de `stripBox`
  // (call-grid, paramétré). C'est un masque de LUMINANCE (#000 = opaque, pas
  // une couleur) — mais répété trois fois, il dérive en silence et compte six
  // fois au gate. Source unique désormais : `edgeFadeMask(axis)` dans
  // `call-row-keys.ts`, exemptée UNE fois à la ligne ; les trois sites la
  // consomment. Et le verre de la pastille d'appel (`call-floating-pill`)
  // était `color-mix(in srgb, white 22%, transparent)` — un filet blanc 22 %
  // que la charte nomme `media-hairline` (parité avec la pastille du talkie, 84w).
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../src/${rel}`, import.meta.url)), 'utf8');
  const keys = read('lib/calls/call-row-keys.ts');
  const actions = read('components/call-control-actions.tsx');
  const grid = read('components/call-grid.tsx');
  const pill = read('components/call-floating-pill.tsx');

  test('les trois consommateurs du fondu ne portent plus aucun littéral de masque', () => {
    expect(scanSource(actions)).toEqual([]);
    expect(scanSource(grid)).toEqual([]);
  });

  test("le fondu de bord a UNE source `edgeFadeMask`, exemptée à la ligne dans call-row-keys", () => {
    expect(keys).toContain('edgeFadeMask');
    expect(keys).toContain('harmony-exempt:');
    expect(scanSource(keys)).toEqual([]);
    expect(exemptionOf('lib/calls/call-row-keys.ts')).toBe(null);
  });

  test('les jumelles RAIL_FADE / stripBox dérivent du masque unique, plus d’un littéral local', () => {
    expect(actions).toContain('edgeFadeMask');
    expect(actions).not.toContain('linear-gradient(to bottom, transparent, #000');
    expect(grid).toContain('edgeFadeMask');
    expect(grid).not.toContain("'linear-gradient(to ");
  });

  test("le verre de la pastille d'appel se lit `media-hairline`, jamais un blanc 22 % en dur", () => {
    expect(scanSource(pill)).toEqual([]);
    expect(pill).toContain('var(--color-media-hairline)');
    expect(pill).not.toContain('white 22%');
  });
});

describe('auditSources — le rapport', () => {
  test('compte par fichier, ignore les exemptés et le hors-périmètre', () => {
    const [first] = EXEMPT_PATHS as readonly { prefix: string }[];
    const report = auditSources([
      { path: 'components/a.tsx', text: "const a = '#fff';\nconst b = 'text-white';" },
      { path: 'components/b.tsx', text: "const a = 'var(--color-ios-ink)';" },
      { path: `${first?.prefix}c.ts`, text: "const a = '#123456';" },
      { path: 'components/a.test.tsx', text: "const a = '#fff';" },
    ]);
    expect(report.total).toBe(2);
    expect(report.files.map((f: { path: string }) => f.path)).toEqual(['components/a.tsx']);
  });
});
