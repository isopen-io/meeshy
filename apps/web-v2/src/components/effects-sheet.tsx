import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

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
 */
const { SHAKE, ZOOM, EXPLODE, CONFETTI, FIREWORKS, WAOO, GLOW, PULSE, RAINBOW, SPARKLE } = MESSAGE_EFFECT_FLAGS;

const ENTRANCE_EFFECTS: readonly { readonly flag: number; readonly label: string }[] = [
  { flag: SHAKE, label: 'Secousse' },
  { flag: ZOOM, label: 'Zoom' },
  { flag: EXPLODE, label: 'Explosion' },
  { flag: CONFETTI, label: 'Confettis' },
  { flag: FIREWORKS, label: "Feux d'artifice" },
  { flag: WAOO, label: 'Waouh' },
];

const PERMANENT_EFFECTS: readonly { readonly flag: number; readonly label: string }[] = [
  { flag: GLOW, label: 'Lueur' },
  { flag: PULSE, label: 'Pulsation' },
  { flag: RAINBOW, label: 'Arc-en-ciel' },
  { flag: SPARKLE, label: 'Scintillant' },
];

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
      className="rounded-full px-3.5 py-2 text-title font-medium"
      style={
        active
          ? { backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)', color: 'var(--accent)' }
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
