import type { ReactNode } from 'react';

import { LENS_DENSITIES, LENS_PARTICLE_PRESETS } from '@meeshy/shared/types/lens-format';
import { GLORY_FRAME_FONTS } from '@meeshy/shared/types/glory-frame-format';

import type { InterfaceLanguage } from '@/lib/interface-language';
import { lensEditorText, type LensEditorTextKey } from '@/lib/lens-packs/editor-texts';
import { LENS_PLACES, type DraftLayer, type LensPlace } from '@/lib/lens-packs/lens-draft';

/**
 * **UNE COUCHE DU BROUILLON** (W16, #11322) — chaque primitive se règle par
 * des choix NOMMÉS (une position, un effet, une densité) et des curseurs
 * bornés par le format : aucune coordonnée, aucun code. Une image se dépose,
 * son adresse se calcule.
 */
const FIELD = 'grid gap-1 text-caption';
const INPUT = 'min-h-11 rounded-xl px-3 text-body';
const INPUT_STYLE = { backgroundColor: 'var(--color-ios-fill)', color: 'var(--color-ios-ink)' } as const;

function Field({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <label className={FIELD}>
      <span>{label}</span>
      {children}
    </label>
  );
}

function Choice<T extends string>({
  language,
  label,
  value,
  options,
  textOf,
  attribute,
  onChange,
}: {
  readonly language: InterfaceLanguage;
  readonly label: LensEditorTextKey;
  readonly value: T;
  readonly options: readonly T[];
  readonly textOf: (option: T) => string;
  readonly attribute: string;
  readonly onChange: (value: T) => void;
}) {
  return (
    <Field label={lensEditorText(language, label)}>
      <select
        {...{ [attribute]: '' }}
        value={value}
        onChange={(event) => {
          const next = options.find((option) => option === event.currentTarget.value);
          if (next !== undefined) onChange(next);
        }}
        className={INPUT}
        style={INPUT_STYLE}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {textOf(option)}
          </option>
        ))}
      </select>
    </Field>
  );
}

function Slider({ label, value, min, max, step, attribute, onChange }: { readonly label: string; readonly value: number; readonly min: number; readonly max: number; readonly step: number; readonly attribute: string; readonly onChange: (value: number) => void }) {
  return (
    <Field label={label}>
      <input {...{ [attribute]: '' }} type="range" min={min} max={max} step={step} value={value} onInput={(event) => onChange(Number(event.currentTarget.value))} />
    </Field>
  );
}

function ImageInput({ language, accept, onChange }: { readonly language: InterfaceLanguage; readonly accept: string; readonly onChange: (file: File | null) => void }) {
  return (
    <Field label={lensEditorText(language, 'image')}>
      <input data-lens-layer-file type="file" accept={accept} onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)} />
    </Field>
  );
}

const placeText = (language: InterfaceLanguage) => (place: LensPlace) => lensEditorText(language, `place.${place}`);

function Body({ language, layer, onChange }: { readonly language: InterfaceLanguage; readonly layer: DraftLayer; readonly onChange: (layer: DraftLayer) => void }) {
  switch (layer.kind) {
    case 'text':
      return (
        <>
          <Field label={lensEditorText(language, 'text')}>
            <input data-lens-layer-text type="text" maxLength={80} value={layer.text} onInput={(event) => onChange({ ...layer, text: event.currentTarget.value })} className={INPUT} style={INPUT_STYLE} />
          </Field>
          <Choice language={language} label="font" value={layer.font} options={GLORY_FRAME_FONTS} textOf={(font) => font} attribute="data-lens-layer-font" onChange={(font) => onChange({ ...layer, font })} />
          <Field label={lensEditorText(language, 'color')}>
            <input data-lens-layer-color type="color" value={layer.color.toLowerCase()} onInput={(event) => onChange({ ...layer, color: event.currentTarget.value.toUpperCase() })} />
          </Field>
          <Slider label={lensEditorText(language, 'size')} value={layer.size} min={0.04} max={0.2} step={0.01} attribute="data-lens-layer-size" onChange={(size) => onChange({ ...layer, size })} />
          <Choice language={language} label="place" value={layer.place} options={LENS_PLACES} textOf={placeText(language)} attribute="data-lens-layer-place" onChange={(place) => onChange({ ...layer, place })} />
        </>
      );
    case 'sticker':
      return (
        <>
          <ImageInput language={language} accept="image/png,image/webp,.png,.webp" onChange={(file) => onChange({ ...layer, file })} />
          <Slider label={lensEditorText(language, 'size')} value={layer.size} min={0.05} max={1} step={0.05} attribute="data-lens-layer-size" onChange={(size) => onChange({ ...layer, size })} />
          <Choice language={language} label="place" value={layer.place} options={LENS_PLACES} textOf={placeText(language)} attribute="data-lens-layer-place" onChange={(place) => onChange({ ...layer, place })} />
        </>
      );
    case 'particles':
      return (
        <>
          <Choice language={language} label="preset" value={layer.preset} options={LENS_PARTICLE_PRESETS} textOf={(preset) => lensEditorText(language, `preset.${preset}`)} attribute="data-lens-layer-preset" onChange={(preset) => onChange({ ...layer, preset })} />
          <Choice language={language} label="density" value={layer.density} options={LENS_DENSITIES} textOf={(density) => lensEditorText(language, `density.${density}`)} attribute="data-lens-layer-density" onChange={(density) => onChange({ ...layer, density })} />
        </>
      );
    case 'lut':
      return (
        <>
          <ImageInput language={language} accept="image/png,.png" onChange={(file) => onChange({ ...layer, file })} />
          <Slider label={lensEditorText(language, 'intensity')} value={layer.intensity} min={0} max={1} step={0.1} attribute="data-lens-layer-intensity" onChange={(intensity) => onChange({ ...layer, intensity })} />
        </>
      );
  }
}

export function LensEditorLayer({
  language,
  layer,
  onChange,
  onRemove,
}: {
  readonly language: InterfaceLanguage;
  readonly layer: DraftLayer;
  readonly onChange: (layer: DraftLayer) => void;
  readonly onRemove: () => void;
}) {
  return (
    <li data-lens-layer={layer.key} data-lens-layer-kind={layer.kind} className="grid gap-2 rounded-2xl p-3" style={{ backgroundColor: 'var(--color-ios-card)' }}>
      <div className="flex items-center justify-between gap-2">
        <span className="font-semibold">{lensEditorText(language, `kind.${layer.kind}`)}</span>
        <button type="button" data-lens-layer-remove onClick={onRemove} className="min-h-11 rounded-full px-3 text-caption" style={{ color: 'var(--color-error)' }}>
          {lensEditorText(language, 'remove')}
        </button>
      </div>
      <Body language={language} layer={layer} onChange={onChange} />
    </li>
  );
}
