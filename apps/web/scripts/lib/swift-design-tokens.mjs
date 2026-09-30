import { readFileSync } from 'node:fs';

/**
 * LES JETONS DE `MeeshyUI`, LUS COMME DES COTES (#8877). La charte visuelle
 * iOS écrit `cornerRadius: MeeshyRadius.xlPlus` là où la source portait
 * `cornerRadius: 22` : même valeur, autre graphie. Les gardes de parité qui
 * lisent une cote Swift passent par `SWIFT_VALUE` puis `value()` — sans quoi
 * une cote inchangée deviendrait « introuvable » au premier jeton posé.
 *
 * `value()` et `veilOpacity()` rendent `null` pour tout ce qui n'est ni un
 * nombre ni un jeton numérique déclaré : une garde ne compare jamais une
 * valeur devinée.
 */
export const SWIFT_VALUE = '(-?[0-9]+(?:\\.[0-9]+)?|Meeshy[A-Za-z]+\\.[A-Za-z0-9]+)';

const NUMBER = /^-?[0-9]+(?:\.[0-9]+)?$/;

const scaleTokens = (designTokens) => {
  const table = new Map();
  const enums = designTokens.matchAll(/enum (Meeshy[A-Za-z]+) \{([\s\S]*?)\n\}/g);
  for (const [, enumName, body] of enums) {
    for (const [, name, raw] of body.matchAll(/static let (\w+)(?:: \w+)? = (-?[0-9.]+)\s*$/gm)) {
      table.set(`${enumName}.${name}`, Number(raw));
    }
  }
  return table;
};

export function swiftDesignTokens({ designTokens, colors }) {
  const scales = scaleTokens(designTokens);

  const value = (raw) => {
    if (NUMBER.test(raw)) return Number(raw);
    return scales.get(raw) ?? null;
  };

  const veilOpacity = (raw) => {
    const name = /^MeeshyColors\.(\w+)$/.exec(raw)?.[1];
    if (name === undefined) return null;
    const declared = new RegExp(`static let ${name} = Color\\.black\\.opacity\\(${SWIFT_VALUE}\\)`).exec(colors);
    return declared === null ? null : value(declared[1]);
  };

  return { value, veilOpacity };
}

export function readSwiftDesignTokens(root) {
  const theme = `${root}packages/MeeshySDK/Sources/MeeshyUI/Theme/`;
  return swiftDesignTokens({
    designTokens: readFileSync(`${theme}DesignTokens.swift`, 'utf8'),
    colors: readFileSync(`${theme}MeeshyColors.swift`, 'utf8'),
  });
}
