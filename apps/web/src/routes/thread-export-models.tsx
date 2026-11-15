import { ALL_TEMPLATE_IDS } from '@/lib/export/message-card-templates';
import { modelName, modelTemplate, type CardModel } from '@/lib/export/message-card-models';
import { translateExportCard } from '@/lib/i18n-export-card-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { REST } from './thread-export-controls';
import { CardThumb, type ThumbSource } from './thread-export-thumb';

/**
 * **LA RANGÉE « STYLES »** (#18673, miroir de `MessageCardModelRow`) — les
 * maquettes, chacune peinte sur le message avec son nom dessous, puis l'accès
 * aux combinaisons de palette, police et liaison.
 */
export function ModelRow({
  language,
  models,
  selected,
  sourceOf,
  onPick,
  onCombinations,
}: {
  readonly language: InterfaceLanguage;
  readonly models: readonly CardModel[];
  readonly selected: string | null;
  readonly sourceOf: (model: CardModel) => ThumbSource;
  readonly onPick: (model: CardModel) => void;
  readonly onCombinations: () => void;
}) {
  return (
    <>
      {models.map((model) => {
        const name = modelName(model, language);
        return (
          <div key={model.id} className="flex shrink-0 flex-col items-center gap-1" style={{ width: 64 }}>
            <CardThumb
              id={modelTemplate(model)}
              source={sourceOf(model)}
              label={name}
              pressed={model.id === selected}
              width={64}
              onPick={() => onPick(model)}
              data={{ 'data-export-model': model.id }}
            />
            <span aria-hidden="true" className="w-full truncate text-center text-mini" style={{ color: 'var(--color-ios-ink)', fontWeight: model.id === selected ? 700 : 500 }}>
              {name}
            </span>
          </div>
        );
      })}
      <button
        type="button"
        data-export-gallery=""
        onClick={onCombinations}
        aria-label={translateExportCard(language, 'export.card.gallery.title')}
        className="grid shrink-0 place-items-center rounded-field px-3 text-center focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minWidth: 76, minHeight: 72, ...REST }}
      >
        <span className="text-title font-bold leading-none">{ALL_TEMPLATE_IDS.length}</span>
        <span className="text-mini font-semibold">{translateExportCard(language, 'export.card.models.combinations')}</span>
      </button>
    </>
  );
}
