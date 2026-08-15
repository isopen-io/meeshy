/**
 * Suite de vecteurs pour conversationAccentPalette et colorForName.
 *
 * Format dual :
 *
 * 1. Cas PALETTE (conversationAccentPalette) :
 *    input: { name, type, language?, theme? }
 *    expected: { primary, secondary, accent } — chaînes hex strictement identiques
 *
 * 2. Cas COLORFORNAME (colorForName) :
 *    input: { colorForName: string }
 *    expected: { hex: string } — valeur hex strictement identique
 *
 * Égalité STRICTE : pas de tolérance (contrat LWS-2, critère contractuel).
 * Les chaînes hex sont comparées via Object.is au sein de closeEnough.
 *
 * Cas de troncature documenté (contrat LWS-2 §0, focal-implementation-contract.md) :
 *   fr + group + travel → primary #31B6BA (canal G brut 182.3 → 182 = 0xB6,
 *   canal B brut 186.9 → 186 = 0xBA, pas d'arrondi).
 *
 * @see packages/shared/utils/conversation-colors.ts
 * @see packages/shared/fixtures/reading-modes/accent.vectors.json
 */

import { runVectors } from './harness.js';
import { conversationAccentPalette, colorForName } from '../../utils/conversation-colors.js';

type AccentInput =
  | { readonly name: string; readonly type: string; readonly language?: string; readonly theme?: string }
  | { readonly colorForName: string };

type AccentExpected =
  | { readonly primary: string; readonly secondary: string; readonly accent: string }
  | { readonly hex: string };

/**
 * Adaptateur qui dispatche vers conversationAccentPalette (palette) ou
 * colorForName (repli) selon la présence de `colorForName` dans l'input.
 */
function adaptAccent(input: AccentInput): AccentExpected {
  if ('colorForName' in input) {
    return { hex: colorForName(input.colorForName) };
  } else {
    return conversationAccentPalette(input);
  }
}

runVectors<AccentInput, AccentExpected>('accent', adaptAccent);
