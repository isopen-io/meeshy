import { customNameOf } from '@/lib/api/preferences';
import type { Conversation } from '@/lib/api/types';
import { translate } from '@/lib/i18n-catalog';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { titleOf } from '@/lib/view/conversation';

import { ConfirmDialog } from './confirm-dialog';
import { ConversationRenameDialog } from './conversation-rename-dialog';

/**
 * LES FENÊTRES DU MENU D'UNE LIGNE (#10593) — renommer et confirmer un
 * blocage. Chargées AU GESTE (`lazy`, `routes/conversations.tsx`) : la liste
 * n'en paie le poids qu'à la première ouverture.
 *
 * Le nom d'origine proposé en indice est le titre SERVI, sans le nom
 * personnel (`titleOf` sans préférence) — celui qu'un champ vide rendra.
 */
export default function ConversationRowDialogs({
  language,
  viewerId,
  rename,
  block,
  onRename,
  onBlock,
  onClose,
}: {
  readonly language: InterfaceLanguage;
  readonly viewerId: string;
  readonly rename: Conversation | undefined;
  readonly block: Conversation | undefined;
  readonly onRename: (conversation: Conversation, name: string | null) => void;
  readonly onBlock: (conversation: Conversation) => void;
  readonly onClose: () => void;
}) {
  return (
    <>
      {rename === undefined ? null : (
        <ConversationRenameDialog
          language={language}
          customName={customNameOf(rename)}
          originalName={titleOf({ ...rename, userPreferences: [] }, viewerId)}
          onSave={(name) => onRename(rename, name)}
          onCancel={onClose}
        />
      )}
      {block === undefined ? null : (
        <ConfirmDialog
          name="conversation-block"
          title={rowMenuText(language, 'rowMenu.block.title')}
          body={rowMenuText(language, 'rowMenu.block.message')}
          cancelLabel={translate(language, 'common.cancel')}
          confirmLabel={rowMenuText(language, 'rowMenu.block')}
          tone="destructive"
          onConfirm={() => onBlock(block)}
          onCancel={onClose}
        />
      )}
    </>
  );
}
