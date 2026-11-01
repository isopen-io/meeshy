import { useId } from 'react';

import type { CreationEncryptionMode, CreationEncryptionOffer } from '@meeshy/shared/utils/conversation-creation-encryption';
import { CREATION_ENCRYPTION_KEY, CREATION_UNAVAILABILITY_KEY } from '@/lib/conversation-new/encryption';
import { translateConversationEncryption, type ConversationEncryptionCatalogKey } from '@/lib/i18n-conversation-encryption-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { FACT_KEY } from '@/lib/view/conversation-encryption-explanation';
import { useConversationEncryptionCatalog } from '@/lib/view/use-conversation-encryption-catalog';

/**
 * **LE CHOIX DU CHIFFREMENT À LA CRÉATION** (décision du 2026-11-01) — une
 * liste de modes à la manière d'iOS : un mode par ligne, sa phrase dessous,
 * la coche du mode retenu. Ce que l'écran offre vient de la loi partagée
 * (`webCreationEncryptionOffer`) ; ce composant ne fait que le montrer.
 *
 * **Des boutons radio NATIFS dans un `<fieldset>`** : le groupe est nommé par
 * sa légende, chaque mode par son seul titre (`aria-labelledby` : la ligne
 * entière reste la cible du toucher sans que la phrase entre dans le nom),
 * sa phrase en description
 * (`aria-describedby`), et les flèches du clavier passent d'un mode à l'autre
 * sans une ligne de code. Un mode « bientôt » est `disabled` : visible, lu,
 * jamais choisi.
 *
 * Les mots vivent dans le catalogue du chiffrement, chargé à la demande comme
 * pour la fiche de la feuille de détails : le catalogue d'interface est à son
 * plafond. Tant qu'il charge, la place est tenue (`aria-busy`) — le mode
 * présélectionné part de toute façon si l'on crée avant.
 */
const MUTED = 'var(--color-ios-ink-2)';

export function CreationEncryptionPicker({
  offer,
  selected,
  onSelect,
}: {
  readonly offer: CreationEncryptionOffer;
  readonly selected: CreationEncryptionMode;
  readonly onSelect: (mode: CreationEncryptionMode) => void;
}) {
  const language = currentInterfaceLanguage();
  const ready = useConversationEncryptionCatalog(language);
  const baseId = useId();

  if (!ready) return <div aria-busy="true" className="px-4 pt-3" style={{ minHeight: 44 }} data-creation-encryption-loading />;

  const t = (key: ConversationEncryptionCatalogKey): string => translateConversationEncryption(language, key);
  const name = `${baseId}-mode`;

  return (
    <fieldset data-creation-encryption className="grid gap-1 px-4 pt-3">
      <legend className="pb-1 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-3)' }}>
        {t('conversationEncryption.section')}
      </legend>
      <div className="overflow-hidden rounded-[14px]" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        {offer.choices.map((choice, index) => {
          const keys = CREATION_ENCRYPTION_KEY[choice.mode];
          const descriptionKey = choice.unavailability === null ? keys.detail : CREATION_UNAVAILABILITY_KEY[choice.unavailability];
          const titleId = `${baseId}-${choice.mode}-title`;
          const descriptionId = `${baseId}-${choice.mode}-detail`;
          const checked = choice.available && selected === choice.mode;
          return (
            <label
              key={choice.mode}
              data-creation-encryption-choice={choice.mode}
              className={`flex items-center gap-3 px-4 py-3 ${choice.available ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
              style={{
                minHeight: 44,
                ...(index === 0 ? {} : { borderTop: '1px solid color-mix(in srgb, var(--color-ios-ink-3) 25%, transparent)' }),
              }}
            >
              <span className="grid min-w-0 flex-1 gap-0.5">
                <span id={titleId} data-creation-encryption-title className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                  {t(keys.title)}
                </span>
                {descriptionKey === null ? null : (
                  <span id={descriptionId} className="text-caption" style={{ color: MUTED }}>
                    {t(descriptionKey)}
                  </span>
                )}
              </span>
              <input
                type="radio"
                name={name}
                value={choice.mode}
                checked={checked}
                disabled={!choice.available}
                aria-labelledby={titleId}
                {...(descriptionKey === null ? {} : { 'aria-describedby': descriptionId })}
                onChange={() => onSelect(choice.mode)}
                className="size-5 shrink-0"
                style={{ accentColor: 'var(--color-ios-brand)' }}
              />
            </label>
          );
        })}
      </div>
      <p data-creation-encryption-footer className="px-1 pt-1 text-caption" style={{ color: MUTED }}>
        {t(FACT_KEY.endToEndNeverTurnedOff)}
      </p>
    </fieldset>
  );
}
