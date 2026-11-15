import { useQueryClient } from '@tanstack/react-query';
import type { ConversationAppearance } from '@meeshy/shared/types/conversation-appearance';
import { useRef, useState } from 'react';

import { chooseAppearance } from '@/lib/api/conversation-appearance';
import { conversationQueryKey, findCachedConversation, type ConversationsDeps } from '@/lib/api/conversations';
import type { Conversation } from '@/lib/api/types';
import { appearanceOf, withAppearance } from '@/lib/appearance/read';
import { type AppearanceChange, hasAnimatedLayer, SHOP_PATH, withAnimate } from '@/lib/appearance/picker-model';
import { useScheme, useWallpaperDesign } from '@/lib/appearance/use-backdrop';
import { useAppearanceCatalog, useWallpaperPacks } from '@/lib/appearance/use-picker';
import { appearanceText, type AppearanceCatalogKey } from '@/lib/i18n-appearance-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { navigate } from '@/lib/router';
import { backdropStyleVars } from '@/lib/view/thread-backdrop';
import { withAccent as accentVars } from '@/lib/accent';

import { AccentSection, BackgroundSection, SolidSection } from './appearance-picker-sections';
import { PhotoSection } from './appearance-picker-photo';
import { ConversationBackdrop } from './conversation-backdrop';
import { SwitchRow } from './conversation-settings-section';
import { Sheet } from './sheet';

/**
 * **« FOND ET COULEUR »** (#10631, § 9) — le sélecteur du fond et de l'accent
 * PERSONNELS d'une conversation. Chemin nominal en deux gestes : ouvrir la
 * feuille, toucher un modèle. Chaque toucher s'applique IMMÉDIATEMENT (le fil
 * derrière, la ligne de liste et l'aperçu se relisent du cache) et part en
 * `PUT` ; un refus rétablit l'état d'avant et le DIT. Ne montre que ce que le
 * lecteur possède et a installé, puis mène à la boutique filtrée.
 */
const ERROR_BY_CODE: Readonly<Record<string, AppearanceCatalogKey>> = {
  PACK_NOT_OWNED: 'appearance.err_not_owned',
  ATTACHMENT_NOT_AVAILABLE: 'appearance.err_photo',
};

export function ConversationAppearanceSheet({
  conversation,
  accent,
  deps,
  onClose,
}: {
  readonly conversation: Conversation;
  readonly accent: string;
  readonly deps: ConversationsDeps;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  const queryClient = useQueryClient();
  const ready = useAppearanceCatalog(language);
  const scheme = useScheme();
  const rtl = typeof document !== 'undefined' && document.documentElement.dir === 'rtl';
  const { packs, names } = useWallpaperPacks({ deps, language });
  const [draft, setDraft] = useState<ConversationAppearance | null>(null);
  const draftRef = useRef<ConversationAppearance | null>(null);
  const [errorKey, setErrorKey] = useState<AppearanceCatalogKey | null>(null);

  const appearance = appearanceOf(conversation);
  const shown = draft ?? appearance;
  const { background } = shown;
  const chosenDesign = useWallpaperDesign(background.kind === 'design' ? { pack: background.pack, design: background.design } : null);

  const apply = async (next: ConversationAppearance | null): Promise<void> => {
    setErrorKey(null);
    const outcome = await chooseAppearance({ conversationId: conversation.id, appearance: next, deps: { source: deps.source, transport: deps.transport, queryClient } });
    if (!outcome.ok) setErrorKey((outcome.code !== null ? ERROR_BY_CODE[outcome.code] : undefined) ?? 'appearance.err_generic');
  };
  const latest = (): ConversationAppearance => {
    const cached = findCachedConversation(queryClient, conversation.id) ?? queryClient.getQueryData<Conversation>(conversationQueryKey(conversation.id));
    return appearanceOf(cached ?? conversation);
  };
  const choose = (change: AppearanceChange): void => void apply(change(latest()));
  const draftTo = (next: ConversationAppearance): void => {
    draftRef.current = next;
    setDraft(next);
  };
  const commitDraft = (): void => {
    const pending = draftRef.current;
    draftRef.current = null;
    setDraft(null);
    if (pending !== null) void apply(pending);
  };

  if (!ready) return null;
  const t = (key: AppearanceCatalogKey): string => appearanceText(language, key);
  const previewConversation = withAppearance(conversation, shown);
  const common = { appearance: shown, language, rtl, scheme, onChoose: choose } as const;
  const isDefault = appearance.background.kind === 'signature' && appearance.accent === null;

  return (
    <Sheet title={t('appearance.title')} bodyAs="div" onClose={onClose}>
      <div className="flex-1 overflow-y-auto" data-conversation-appearance>
        <div className="px-4 pt-3 pb-4">
          <div
            aria-hidden
            data-appearance-preview
            className="relative flex flex-col justify-end gap-2 overflow-hidden rounded-card p-3"
            style={{ ...accentVars(accent), ...backdropStyleVars(), isolation: 'isolate', height: 132 }}
          >
            <ConversationBackdrop conversation={previewConversation} accent={accent} live={false} deps={deps} />
            <span className="self-start rounded-chip px-3 py-1 text-caption" style={{ backgroundColor: 'var(--color-ios-surface)', color: 'var(--color-ios-ink)' }}>
              {t('appearance.preview')}
            </span>
            <span className="self-end rounded-chip px-3 py-1 text-caption font-semibold" style={{ backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' }}>
              {t('appearance.preview')}
            </span>
          </div>
        </div>

        <BackgroundSection {...common} accent={accent} packs={packs} names={names} />
        <SolidSection {...common} names={names} />
        <PhotoSection
          appearance={shown}
          conversationId={conversation.id}
          deps={deps}
          language={language}
          rtl={rtl}
          onChoose={choose}
          onDraft={draftTo}
          onCommitDraft={commitDraft}
        />
        <AccentSection {...common} names={names} />

        {hasAnimatedLayer(chosenDesign) ? (
          <SwitchRow label={t('appearance.animate')} checked={shown.animate} onChange={(on) => choose((current) => withAnimate(current, on))} marker="data-appearance-animate" />
        ) : null}

        <p role="status" aria-live="polite" className="px-4 text-caption" style={{ color: 'var(--color-error)', minHeight: 20 }} data-appearance-error>
          {errorKey === null ? '' : t(errorKey)}
        </p>

        <div className="flex flex-wrap gap-2 px-4 pb-8">
          <button
            type="button"
            data-appearance-shop
            onClick={() => {
              onClose();
              navigate(SHOP_PATH);
            }}
            className="rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ minHeight: 44, color: 'var(--accent)', border: '1.5px solid var(--accent)', outlineColor: 'var(--accent)' }}
          >
            {t('appearance.shop')}
          </button>
          {isDefault ? null : (
            <button
              type="button"
              data-appearance-reset
              onClick={() => void apply(null)}
              className="rounded-chip px-4 font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--accent)' }}
            >
              {t('appearance.reset')}
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}
