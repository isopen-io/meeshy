import { useQueryClient } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { useStore } from 'zustand/react';

import { performPreferenceAction, performRowAction } from '@/lib/api/conversation-actions';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { customNameOf } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { conversationStore, effectiveFlagsOf, withPreferenceOverrides } from '@/lib/conversation-store';
import { manageText, type ConversationManageCatalogKey } from '@/lib/i18n-conversation-manage-catalog';
import { loadRowMenuCatalog } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { titleOf } from '@/lib/view/conversation';
import type { RowFlagActionId } from '@/lib/view/row-actions';

import { ConversationRenameDialog } from './conversation-rename-dialog';
import { SwitchRow } from './conversation-settings-section';

/**
 * **MES OPTIONS SUR CETTE CONVERSATION** (#7836) — l'onglet Options d'iOS
 * (`ConversationPreferencesTab.swift`) réduit à ce que le web sait déjà faire
 * depuis la liste : nom personnel, épingler, sourdine, archiver. Ce sont les
 * MÊMES gestes que le menu d'une ligne (`performRowAction`,
 * `performPreferenceAction`) : même correction optimiste dans
 * `conversationStore`, même appel, même retour arrière — la liste et la
 * feuille montrent toujours la même valeur.
 *
 * Préférences PROPRES AU LECTEUR : elles valent pour tout membre inscrit,
 * quel que soit son rang, et pour aucun visiteur sans compte.
 */
const FLAGS: readonly { readonly action: RowFlagActionId; readonly field: 'isPinned' | 'isMuted' | 'isArchived'; readonly key: ConversationManageCatalogKey }[] = [
  { action: 'pin', field: 'isPinned', key: 'conversationManage.options.pin' },
  { action: 'mute', field: 'isMuted', key: 'conversationManage.options.mute' },
  { action: 'archive', field: 'isArchived', key: 'conversationManage.options.archive' },
];

export function ConversationOptionsSection({
  conversation,
  viewerId,
  deps,
  language,
}: {
  readonly conversation: Conversation;
  readonly viewerId: string;
  readonly deps: ConversationsDeps;
  readonly language: InterfaceLanguage;
}) {
  const t = (key: ConversationManageCatalogKey) => manageText(language, key);
  const headingId = useId();
  const queryClient = useQueryClient();
  const overrides = useStore(conversationStore, (state) => state.overrides);
  const [renaming, setRenaming] = useState(false);
  const flags = effectiveFlagsOf(conversation, overrides);
  const effective = withPreferenceOverrides([conversation], overrides)[0] ?? conversation;
  const customName = customNameOf(effective);
  const actionDeps = { ...deps, store: conversationStore, queryClient };

  const openRename = async () => {
    await loadRowMenuCatalog(language);
    setRenaming(true);
  };

  return (
    <section aria-labelledby={headingId} className="px-4 pb-6" data-conversation-options>
      <h4 id={headingId} className="pb-2 text-caption font-semibold uppercase" style={{ color: 'var(--color-ios-ink-2)' }}>
        {t('conversationManage.options.section')}
      </h4>
      <div className="overflow-hidden rounded-card" style={{ backgroundColor: 'var(--color-ios-card)' }}>
        <button
          type="button"
          onClick={() => void openRename()}
          data-conversation-options-rename
          className="flex w-full items-center justify-between gap-3 px-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
          style={{ minHeight: 52, outlineColor: 'var(--accent)' }}
        >
          <span className="flex min-w-0 flex-col">
            <span className="text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
              {t('conversationManage.options.custom_name')}
            </span>
            <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
              {customName ?? t('conversationManage.options.custom_name.placeholder')}
            </span>
          </span>
        </button>
        {FLAGS.filter(({ field }) => !(field === 'isArchived' && flags.archiveLocked === true)).map(({ action, field, key }) => (
          <SwitchRow
            key={action}
            label={t(key)}
            checked={flags[field]}
            onChange={() => void performRowAction({ conversationId: conversation.id, action, deps: actionDeps })}
            marker={`data-conversation-option-${action}`}
          />
        ))}
      </div>
      {renaming ? (
        <ConversationRenameDialog
          language={language}
          customName={customName}
          originalName={titleOf({ ...conversation, userPreferences: [] }, viewerId)}
          onSave={(name) => {
            setRenaming(false);
            void performPreferenceAction({ conversationId: conversation.id, patch: { customName: name }, deps: actionDeps });
          }}
          onCancel={() => setRenaming(false)}
        />
      ) : null}
    </section>
  );
}
