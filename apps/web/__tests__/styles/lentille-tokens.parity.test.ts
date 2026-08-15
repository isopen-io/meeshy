import * as fs from 'fs';
import * as path from 'path';

/**
 * Lentille Tokens Parity Test
 *
 * Verifies bidirectional consistency between:
 * - packages/shared/design/lentille-tokens.json (source of truth)
 * - apps/web/styles/lentille-tokens.css (CSS implementation)
 *
 * Philosophy: MeeshyTokenParityTest — "never repair the test by copying the drifted value;
 * repair the token instead."
 *
 * This test ensures:
 * 1. Every numeric value in JSON has a corresponding CSS custom property
 * 2. Every CSS custom property has a corresponding JSON value
 * 3. Values match and have correct units (px, ms, em, or unitless)
 * 4. Key naming is consistent (kebab-case)
 */

interface TokenValue {
  key: string;
  value: string;
  unit: string;
}

function extractCSSTokens(cssContent: string): Map<string, TokenValue> {
  const tokens = new Map<string, TokenValue>();

  // Match CSS custom properties: --lentille-...
  const regex = /--lentille-([a-z0-9-]+):\s*([^;]+);/g;

  let match;
  while ((match = regex.exec(cssContent)) !== null) {
    const varName = `--lentille-${match[1]}`;
    const varValue = match[2].trim();

    // Parse value and unit
    const unitMatch = varValue.match(/^([-\d.]+)(px|ms|em|%)?$|^([-\d.]+)$/);
    if (unitMatch) {
      const numericValue = unitMatch[1] || unitMatch[3];
      const unit = unitMatch[2] || '';
      tokens.set(varName, {
        key: varName,
        value: numericValue,
        unit,
      });
    }
  }

  return tokens;
}

function extractUnitSuffix(key: string): { cleanKey: string; unit: string } {
  // Check for Em, Ms, Px suffixes in the key
  if (key.endsWith('Em')) {
    return { cleanKey: key.slice(0, -2), unit: 'em' };
  }
  if (key.endsWith('Ms')) {
    return { cleanKey: key.slice(0, -2), unit: 'ms' };
  }
  if (key.endsWith('Px')) {
    return { cleanKey: key.slice(0, -2), unit: 'px' };
  }

  // Check for string percentages
  if (typeof key === 'string' && key.includes('%')) {
    return { cleanKey: key, unit: '%' };
  }

  return { cleanKey: key, unit: '' };
}

function getExpectedUnit(fullKebabKey: string, originalKey: string, value: any, unitFromSuffix: string): string {
  // If there's a unit suffix, use it
  if (unitFromSuffix) {
    return unitFromSuffix;
  }

  // String values with %
  if (typeof value === 'string') {
    if (value.includes('%')) return '%';
    if (value.includes('em')) return 'em';
  }

  // Check kebab-case key for unitless patterns
  // Unitless: opacity, weight, line-height, ratios, max-count, max-entries, ease-out
  if (
    fullKebabKey.includes('opacity') ||
    fullKebabKey.includes('ease-out') ||
    fullKebabKey.includes('line-height') ||
    fullKebabKey.includes('weight') ||
    fullKebabKey.includes('max-entries') ||
    fullKebabKey.includes('max-count')
  ) {
    return '';
  }

  // Default: pixels
  return 'px';
}

function convertCamelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function extractJSONTokens(jsonContent: string): Map<string, TokenValue> {
  const tokens = new Map<string, TokenValue>();
  const json = JSON.parse(jsonContent);

  function traverse(obj: any, section: string, path: string[] = []) {
    for (const key in obj) {
      if (!obj.hasOwnProperty(key)) continue;
      if (key === '$source') continue;

      const value = obj[key];
      const newPath = [...path, key];

      // Skip purely descriptive fields
      if (key.includes('Description') && typeof value === 'string') {
        continue;
      }

      // Skip non-numeric/non-dimension fields
      if (typeof value === 'boolean') {
        continue;
      }

      // Process numeric values
      if (typeof value === 'number') {
        // Extract unit suffix from the current key (last in path)
        const { cleanKey, unit: unitFromSuffix } = extractUnitSuffix(key);

        // Build full key path with cleaned key
        const pathWithCleanKey = [...path, cleanKey];
        const fullKey = pathWithCleanKey.map(convertCamelToKebab).join('-');
        const cssVarName = `--lentille-${section}-${fullKey}`;
        const unit = getExpectedUnit(fullKey, key, value, unitFromSuffix);

        tokens.set(cssVarName, {
          key: cssVarName,
          value: String(value),
          unit,
        });
      }
      // Process string values that are CSS values (%, em)
      else if (typeof value === 'string') {
        if (value.includes('%') || value.includes('em')) {
          const { cleanKey, unit: unitFromSuffix } = extractUnitSuffix(key);

          const pathWithCleanKey = [...path, cleanKey];
          const fullKey = pathWithCleanKey.map(convertCamelToKebab).join('-');
          const cssVarName = `--lentille-${section}-${fullKey}`;
          const unit = getExpectedUnit(fullKey, key, value, unitFromSuffix);

          // Extract numeric value from string
          const numericMatch = value.match(/^([-\d.]+)/);
          const numericValue = numericMatch ? numericMatch[1] : value;

          tokens.set(cssVarName, {
            key: cssVarName,
            value: numericValue,
            unit,
          });
        }
      }
      // Recurse for nested objects
      else if (typeof value === 'object' && value !== null) {
        traverse(value, section, newPath);
      }
    }
  }

  // Process both 'list' and 'thread' sections
  if (json.list) {
    traverse(json.list, 'list');
  }
  if (json.thread) {
    traverse(json.thread, 'thread');
  }

  return tokens;
}

describe('Lentille Tokens Parity Test', () => {
  let cssTokens: Map<string, TokenValue>;
  let jsonTokens: Map<string, TokenValue>;

  beforeAll(() => {
    // Read CSS file
    const cssPath = path.join(__dirname, '../../styles/lentille-tokens.css');
    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    cssTokens = extractCSSTokens(cssContent);

    // Read JSON file
    const jsonPath = path.join(__dirname, '../../../../packages/shared/design/lentille-tokens.json');
    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    jsonTokens = extractJSONTokens(jsonContent);
  });

  test('CSS tokens exist for all JSON values', () => {
    const missing: string[] = [];
    const divergent: Array<{ key: string; expected: string; actual?: string }> = [];

    for (const [jsonKey, jsonValue] of jsonTokens) {
      const cssValue = cssTokens.get(jsonKey);

      if (!cssValue) {
        missing.push(
          `${jsonKey}: expected value '${jsonValue.value}${jsonValue.unit}', not found in CSS`,
        );
      } else if (cssValue.value !== jsonValue.value || cssValue.unit !== jsonValue.unit) {
        divergent.push({
          key: jsonKey,
          expected: `${jsonValue.value}${jsonValue.unit}`,
          actual: `${cssValue.value}${cssValue.unit}`,
        });
      }
    }

    const errors: string[] = [];

    if (missing.length > 0) {
      errors.push(`Missing in CSS (${missing.length}):\n  ${missing.join('\n  ')}`);
    }

    if (divergent.length > 0) {
      const divergentList = divergent
        .map(({ key, expected, actual }) => `${key}: expected '${expected}', got '${actual}'`)
        .join('\n  ');
      errors.push(`Divergent values (${divergent.length}):\n  ${divergentList}`);
    }

    expect(errors).toEqual([]);
  });

  test('JSON values exist for all CSS tokens', () => {
    const orphaned: string[] = [];

    for (const [cssKey] of cssTokens) {
      if (!jsonTokens.has(cssKey)) {
        orphaned.push(cssKey);
      }
    }

    if (orphaned.length > 0) {
      const errorMsg = `Orphaned CSS variables (in CSS but missing from JSON, ${orphaned.length}):\n  ${orphaned.join('\n  ')}`;
      expect(errorMsg).toEqual('');
    }

    expect(orphaned).toEqual([]);
  });

  test('Token coverage summary', () => {
    const summary = {
      cssTokenCount: cssTokens.size,
      jsonTokenCount: jsonTokens.size,
      verified: Array.from(jsonTokens.keys()).filter(k => cssTokens.has(k)).length,
    };

    expect(summary.cssTokenCount).toBe(summary.jsonTokenCount);
    expect(summary.verified).toBe(summary.jsonTokenCount);

    console.log(
      `\n✓ Token Parity: ${summary.verified}/${summary.jsonTokenCount} tokens verified\n`,
    );
  });
});
