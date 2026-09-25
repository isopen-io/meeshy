import { useId, type ReactNode } from 'react';

import { DECORATIVE_EFFECTS, withoutDecorativeEffects, type DecorativeEffect } from '@/lib/effects';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

/**
 * LE PANNEAU D'EFFETS (#7980, jumelle web de #7967) — la baguette ne présente
 * plus de feuille : elle bascule ce petit panneau AU-DESSUS de la barre
 * d'outils, à la place du rail de durée éphémère et dans sa forme (fond
 * arrondi, capsules), les deux s'excluant. Miroir `EffectsPickerView.swift`.
 *
 * Deux rangées — ce qui joue à l'ARRIVÉE du message, ce qui l'habille EN
 * PERMANENCE — et « Tout effacer », qui ne paraît que si l'un des dix est
 * armé et ne retire QU'EUX. Le comportement (éphémère, flou, vue unique) n'y
 * figure pas : la barre d'outils le porte déjà, et deux portes pour un même
 * réglage se contrediraient (`apps/ios/CLAUDE.md` § 3).
 *
 * Chaque capsule est un TOGGLE indépendant (miroir `EffectChip.swift`), et
 * les dix viennent de `DECORATIVE_EFFECTS` (`lib/effects.ts`), site unique
 * des bits, de leurs libellés et de leur famille.
 */
const ENTRANCE_EFFECTS = DECORATIVE_EFFECTS.filter((effect) => effect.kind === 'entrance');
const PERMANENT_EFFECTS = DECORATIVE_EFFECTS.filter((effect) => effect.kind === 'persistent');

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
      /* CIBLE ≥ 44 (dimension 5) — la hauteur, comme les capsules du rail
         éphémère (`min-h-11`). */
      className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-title font-semibold"
      style={
        active
          ? {
              /* L'ENCRE NE PORTE PAS L'ÉTAT (revue-correction #6175) : le
                 lavis et le liseré le disent, l'encre reste lisible dans les
                 deux schémas, quelle que soit la couleur de la conversation. */
              backgroundColor: 'color-mix(in srgb, var(--accent) 20%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent)',
              color: 'var(--color-ios-ink)',
            }
          : {
              backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)',
              boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 30%, transparent)',
              color: 'var(--color-ios-ink)',
            }
      }
    >
      {label}
    </button>
  );
}

function EffectRow({
  title,
  items,
  flags,
  onToggle,
  trailing,
}: {
  readonly title: string;
  readonly items: readonly DecorativeEffect[];
  readonly flags: number;
  readonly onToggle: (flag: number) => void;
  readonly trailing?: ReactNode;
}) {
  const titleId = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-6 items-center justify-between gap-2 px-3">
        <p id={titleId} className="text-[12px] font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
          {title}
        </p>
        {trailing}
      </div>
      <div role="group" aria-labelledby={titleId} className="flex gap-2 overflow-x-auto px-3 [scrollbar-width:none]">
        {items.map((item) => (
          <EffectChip key={item.flag} active={(flags & item.flag) !== 0} label={item.label} onToggle={() => onToggle(item.flag)} />
        ))}
      </div>
    </div>
  );
}

export function EffectsPanel({
  flags,
  onChange,
}: {
  /** Les bits DÉCORATIFS (`ComposeProtection.effectFlags`). */
  readonly flags: number;
  readonly onChange: (flags: number) => void;
}) {
  const language = currentInterfaceLanguage();
  const toggle = (flag: number) => onChange((flags & flag) !== 0 ? flags & ~flag : flags | flag);
  const armed = withoutDecorativeEffects(flags) !== flags;

  return (
    <div
      data-composer-effects-panel
      role="group"
      aria-label={translate(language, 'composer.effects.panel')}
      className="mx-2 mt-2 flex flex-col gap-1.5 rounded-[16px] py-2"
      style={{
        backgroundColor: 'color-mix(in srgb, var(--accent) 8%, var(--color-ios-surface))',
        boxShadow: 'inset 0 0 0 0.5px color-mix(in srgb, var(--accent) 20%, transparent)',
      }}
    >
      <EffectRow
        title={translate(language, 'composer.effects.entrance')}
        items={ENTRANCE_EFFECTS}
        flags={flags}
        onToggle={toggle}
        trailing={
          armed ? (
            <button
              type="button"
              data-effects-clear-all
              onClick={() => onChange(withoutDecorativeEffects(flags))}
              className="-my-2.5 inline-flex min-h-11 items-center px-1 text-[12px] font-semibold"
              style={{ color: 'var(--color-error)' }}
            >
              {translate(language, 'composer.effects.clearAll')}
            </button>
          ) : null
        }
      />
      <EffectRow title={translate(language, 'composer.effects.permanent')} items={PERMANENT_EFFECTS} flags={flags} onToggle={toggle} />
    </div>
  );
}
