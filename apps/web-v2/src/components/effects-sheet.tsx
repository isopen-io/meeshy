import { DECORATIVE_EFFECTS } from '@/lib/effects';

import { Sheet } from './sheet';

/**
 * LA FEUILLE D'EFFETS (#6175) — miroir de `EffectsPickerView.swift:65-96`,
 * réduite à DEUX sections : « Animation d'entrée » et « Effet permanent ».
 * La section « Comportement » d'iOS (éphémère/flou/vue unique COMME BITS)
 * n'est PAS reprise — elle pose une SECONDE porte vers des faits que la
 * rangée haute pilote déjà par ses propres bascules (`isBlurEnabled`,
 * `ephemeralDuration`), ce que `apps/ios/CLAUDE.md` § 3 interdit (« une
 * porte n'a pas de jumelle »). Issue iOS compagnon (§ 1.2 point 3 de la
 * spécification #6175, § 9 Q6).
 *
 * Chaque puce est un TOGGLE indépendant (miroir `EffectChip.swift:6-38` —
 * `flags.contains(flag) ? remove : insert`), jamais un choix exclusif.
 *
 * Les deux sections sont dérivées de `DECORATIVE_EFFECTS` (`lib/effects.ts`,
 * revue-correction #6175 défaut majeur 1) — le SITE UNIQUE des dix bits et de
 * leurs libellés français, aussi lu par `compose-protection.ts` (le compte) et
 * par le rendu du fil (`message-blocks.tsx`). Avant ce lot, ces deux tableaux
 * étaient déclarés ICI, séparément du compte : une troisième liste (pour le
 * RENDU sur la bulle) les aurait fait diverger toutes les trois.
 */
const ENTRANCE_EFFECTS: readonly { readonly flag: number; readonly label: string }[] = DECORATIVE_EFFECTS.filter(
  (effect) => effect.kind === 'entrance',
);

const PERMANENT_EFFECTS: readonly { readonly flag: number; readonly label: string }[] = DECORATIVE_EFFECTS.filter(
  (effect) => effect.kind === 'persistent',
);

function EffectChip({
  active,
  label,
  onToggle,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={active}
      aria-label={`${label}, ${active ? 'actif' : 'inactif'}`}
      /* CIBLE ≥ 44 (dimension 5, revue-correction #6175) — `py-2` seul
         mesurait 36 px de haut au navigateur, sous la barre. */
      className="inline-flex min-h-11 items-center rounded-full px-3.5 text-title font-medium"
      style={
        active
          ? {
              /* L'ENCRE NE PORTE PAS L'ÉTAT (revue-correction #6175) — une
                 encre `--accent` sur un lavis d'accent tombe sous AA pour
                 tout un pan de la palette des conversations, exactement ce
                 que `composer-language-pill.tsx:16-25` a déjà mesuré. Le
                 lavis et le liseré disent l'état ; l'encre reste lisible. */
              backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)',
              color: 'var(--color-ios-ink)',
            }
          : { backgroundColor: 'color-mix(in srgb, var(--color-ios-ink) 8%, transparent)', color: 'var(--color-ios-ink-2)' }
      }
    >
      {label}
    </button>
  );
}

function EffectSection({
  title,
  items,
  flags,
  onToggle,
}: {
  readonly title: string;
  readonly items: readonly { readonly flag: number; readonly label: string }[];
  readonly flags: number;
  readonly onToggle: (flag: number) => void;
}) {
  return (
    <li className="px-4 py-2">
      <p className="mb-2 text-title font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {title}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <EffectChip key={item.flag} active={(flags & item.flag) !== 0} label={item.label} onToggle={() => onToggle(item.flag)} />
        ))}
      </div>
    </li>
  );
}

export function EffectsSheet({
  flags,
  onChange,
  onClose,
}: {
  /** Les bits DÉCORATIFS uniquement (`ComposeProtection.effectFlags`). */
  readonly flags: number;
  readonly onChange: (flags: number) => void;
  readonly onClose: () => void;
}) {
  const toggle = (flag: number) => onChange((flags & flag) !== 0 ? flags & ~flag : flags | flag);

  return (
    <Sheet title="Effets du message" onClose={onClose}>
      <EffectSection title="Animation d'entrée" items={ENTRANCE_EFFECTS} flags={flags} onToggle={toggle} />
      <EffectSection title="Effet permanent" items={PERMANENT_EFFECTS} flags={flags} onToggle={toggle} />
    </Sheet>
  );
}
