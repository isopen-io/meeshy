// La règle d'empiètement (prompt § 5.7), partagée par le détecteur (overlap.mjs) et le calcul des ancres (anchors.mjs).
// À l'échelle de design : overlap ≤ 250 px, depth ≤ 6 px, face = 0 ; une mise en page `selfie` (déclarée par le
// manifeste) est exemptée de l'overlap et de la profondeur, jamais du visage.
export const RULE = { overlap: 250, depth: 6, face: 0 };

export const isSelfie = (layout) => /^selfie/i.test((layout ?? '').trim());

export function verdict({ overlap, depth, face, selfie }) {
  if (face > RULE.face) return 'face';
  if (selfie) return 'ok';
  return overlap > RULE.overlap || depth > RULE.depth ? 'hors-regle' : 'ok';
}
