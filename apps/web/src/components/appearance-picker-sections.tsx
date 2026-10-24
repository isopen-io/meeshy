import type { ReactElement } from 'react';
import type { AppearanceDesign } from '@meeshy/shared/types/appearance-design';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import { APPEARANCE_GAMUT, GAMUT_KEYS } from '@meeshy/shared/utils/appearance-gamut';

import { withAccent as withAccentVars } from '@/lib/accent';
import { designStyle } from '@/lib/appearance/backdrop-view';
import { type AppearanceChange, designBackground, isChosen, signatureBackground, solidBackground, withAccent, withBackground } from '@/lib/appearance/picker-model';
import type { WallpaperNames, WallpaperPack } from '@/lib/appearance/wallpaper-catalog';
import { appearanceText, type AppearanceCatalogKey } from '@/lib/i18n-appearance-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { ColorScheme } from '@/lib/scheme';
import { backdropStyleVars } from '@/lib/view/thread-backdrop';

import { ChoiceGroup, PickerSection, type ChoiceItem } from './appearance-picker-parts';
import { PackLottieLayer } from './pack-lottie-layer';

import '@/styles/appearance-picker.css';

/**
 * **LES RANGÉES DU SÉLECTEUR** (#10631, § 9) : Signature et les modèles des
 * packs installés, la couleur unie, l'accent. Chaque toucher rend la nouvelle
 * apparence à l'hôte, qui l'applique aussitôt (optimiste) et l'envoie.
 */
type Common = {
  readonly appearance: ConversationAppearance;
  readonly language: InterfaceLanguage;
  readonly rtl: boolean;
  readonly scheme: ColorScheme;
  readonly onChoose: (change: AppearanceChange) => void;
};

const SWATCH = 32;

const swatch = (color: string): ReactElement => (
  <span aria-hidden className="block rounded-full" style={{ width: SWATCH, height: SWATCH, backgroundColor: color, boxShadow: 'inset 0 0 0 1px color-mix(in srgb, currentColor 22%, transparent)' }} />
);

/** La vignette d'un modèle ; un modèle animé y joue déjà sa couche (#10815), sous le même budget que le reste. */
function DesignThumb({ pack, design, scheme, accent }: { readonly pack: string; readonly design: AppearanceDesign; readonly scheme: ColorScheme; readonly accent: string }) {
  return (
    <span aria-hidden data-appearance-thumb className="relative block overflow-hidden rounded-chip" style={{ width: 52, height: 68, ...designStyle({ pack, design, scheme, accent }) }}>
      <PackLottieLayer lottie={design.lottie} />
    </span>
  );
}

export function BackgroundSection({
  appearance,
  language,
  rtl,
  scheme,
  accent,
  packs,
  names,
  onChoose,
}: Common & { readonly accent: string; readonly packs: readonly WallpaperPack[]; readonly names: WallpaperNames | null }) {
  const t = (key: AppearanceCatalogKey, params?: Readonly<Record<string, string>>): string => appearanceText(language, key, params);
  const { background } = appearance;
  const signature: ChoiceItem = {
    key: 'signature',
    label: t('appearance.signature'),
    selected: background.kind === 'signature',
    onSelect: () => onChoose((current) => withBackground(current, signatureBackground())),
    content: (
      <span
        aria-hidden
        data-appearance-signature-thumb
        className="appearance-signature-thumb grid place-items-center rounded-chip text-caption font-semibold"
        style={withAccentVars(accent, { width: 52, height: 68, ...backdropStyleVars() })}
      >
        S
      </span>
    ),
  };
  return (
    <PickerSection title={t('appearance.background')} marker="data-appearance-background">
      <ChoiceGroup label={t('appearance.signature')} items={[signature]} rtl={rtl} size={60} marker="data-appearance-signature" />
      {packs.map((pack) => {
        const packName = names?.packs[pack.slug]?.name ?? pack.slug;
        const items: readonly ChoiceItem[] = pack.designs.map((design) => ({
          key: `${pack.slug}/${design.key}`,
          label: names?.designs[design.key] ?? design.key,
          selected: isChosen(background, designBackground(pack.slug, design.key)),
          onSelect: () => onChoose((current) => withBackground(current, designBackground(pack.slug, design.key))),
          content: <DesignThumb pack={pack.slug} design={design} scheme={scheme} accent={accent} />,
        }));
        return <ChoiceGroup key={pack.slug} label={t('appearance.pack_group', { name: packName })} items={items} rtl={rtl} size={60} marker="data-appearance-pack" />;
      })}
    </PickerSection>
  );
}

export function SolidSection({ appearance, language, rtl, scheme, names, onChoose }: Common & { readonly names: WallpaperNames | null }) {
  const t = (key: AppearanceCatalogKey): string => appearanceText(language, key);
  const items: readonly ChoiceItem[] = GAMUT_KEYS.map((color) => ({
    key: color,
    label: names?.gamut[color] ?? APPEARANCE_GAMUT[color].name,
    selected: isChosen(appearance.background, solidBackground(color)),
    onSelect: () => onChoose((current) => withBackground(current, solidBackground(color))),
    content: swatch(APPEARANCE_GAMUT[color][scheme].surface),
  }));
  return (
    <PickerSection title={t('appearance.solid')} marker="data-appearance-solid">
      <ChoiceGroup label={t('appearance.solid')} items={items} rtl={rtl} marker="data-appearance-solid-group" />
    </PickerSection>
  );
}

export function AccentSection({ appearance, language, rtl, scheme, names, onChoose }: Common & { readonly names: WallpaperNames | null }) {
  const t = (key: AppearanceCatalogKey): string => appearanceText(language, key);
  const automatic: ChoiceItem = {
    key: 'auto',
    label: t('appearance.auto'),
    selected: appearance.accent === null,
    onSelect: () => onChoose((current) => withAccent(current, null)),
    content: (
      <span aria-hidden className="grid place-items-center rounded-full text-caption font-bold" style={{ width: SWATCH, height: SWATCH, border: '2px dashed var(--color-ios-ink-2)', color: 'var(--color-ios-ink-2)' }}>
        A
      </span>
    ),
  };
  const colors: readonly ChoiceItem[] = GAMUT_KEYS.map((color) => ({
    key: color,
    label: names?.gamut[color] ?? APPEARANCE_GAMUT[color].name,
    selected: appearance.accent === color,
    onSelect: () => onChoose((current) => withAccent(current, color)),
    content: swatch(APPEARANCE_GAMUT[color][scheme].accent),
  }));
  return (
    <PickerSection title={t('appearance.accent')} marker="data-appearance-accent">
      <ChoiceGroup label={t('appearance.accent')} items={[automatic, ...colors]} rtl={rtl} marker="data-appearance-accent-group" />
    </PickerSection>
  );
}
