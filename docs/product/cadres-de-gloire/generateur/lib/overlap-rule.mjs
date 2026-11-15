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

// La sélection de la garde : `only` (null = tout) désigne des collections entières ou des cadres. Un nom qui ne
// désigne rien, ou une sélection vide, est un défaut — la garde ne se déclare jamais verte sans rien avoir mesuré.
export function selectFrames(framesByCollection, only) {
  const wanted = only === null ? null : new Set(only);
  const jobs = [...framesByCollection].flatMap(([collection, names]) =>
    names.filter((name) => wanted === null || wanted.has(collection) || wanted.has(name)).map((name) => ({ collection, name })));
  const known = new Set([...framesByCollection].flatMap(([collection, names]) => [collection, ...names]));
  const unknown = only === null ? [] : only.filter((name) => !known.has(name));
  return {
    jobs,
    failures: [
      ...unknown.map((name) => `--only ${name} ne désigne aucune collection ni aucun cadre`),
      ...(jobs.length === 0 ? ['aucun cadre sélectionné : la garde ne mesure rien'] : []),
    ],
  };
}
