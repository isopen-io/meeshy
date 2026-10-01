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
