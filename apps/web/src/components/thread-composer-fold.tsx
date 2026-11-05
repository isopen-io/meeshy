import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { Glyph, GlyphSvg } from '@/components/glyph';
import { FEED_GLYPHS } from '@/components/glyphs-feed';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { deviceComposerFoldMemory, type ComposerFoldMemory } from '@/lib/view/composer-fold-memory';

const FOLD_TARGET_PX = 44;

export type ComposerFoldSpec = {
  readonly conversationId: string;
  readonly memory?: ComposerFoldMemory;
};

/**
 * LE REPLI DE LA BARRE D'UNE CONVERSATION (#9955 côté web, #16341) — miroir
 * de `foldableConversationComposer` (iOS) et du repli des commentaires du web
 * (`comment-composer.tsx`) : le ⌄, tout à droite, réduit la barre à UNE bulle ;
 * la bulle la rouvre. La barre reste MONTÉE, à hauteur nulle : le brouillon,
 * les pièces jointes et la citation vivent dans le composeur et ne dépendent
 * d'aucun démontage. Une saisie qui commence (le focus entre dans le champ —
 * « Répondre », « dis-lui salut ») rouvre la barre, comme sur iOS.
 *
 * L'état est retenu PAR CONVERSATION (#16341) : on le retrouve en revenant, y
 * compris après un rechargement ; une conversation jamais touchée reste dépliée.
 */
export function ThreadComposerFold({ spec, children }: { readonly spec: ComposerFoldSpec; readonly children: ReactNode }) {
  const { conversationId } = spec;
  const memory = spec.memory ?? deviceComposerFoldMemory();
  const language = currentInterfaceLanguage();
  const bodyId = useId();
  const [folded, setFolded] = useState(() => memory.isFolded(conversationId));
  const foldRef = useRef<HTMLButtonElement | null>(null);
  const unfoldRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    setFolded(memory.isFolded(conversationId));
  }, [memory, conversationId]);

  const choose = (next: boolean) => {
    setFolded(next);
    memory.remember(conversationId, next);
    requestAnimationFrame(() => (next ? unfoldRef : foldRef).current?.focus());
  };

  const reopenOnTyping = () => {
    if (!folded) return;
    setFolded(false);
    memory.remember(conversationId, false);
  };

  return (
    <div data-composer-fold-host="" className="flex items-end" style={folded ? { justifyContent: 'center' } : undefined}>
      {folded ? (
        <button
          ref={unfoldRef}
          type="button"
          data-composer-unfold=""
          aria-label={translate(language, 'conversation.composer.unfold')}
          aria-expanded={false}
          aria-controls={bodyId}
          onClick={() => choose(false)}
          className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            width: FOLD_TARGET_PX,
            height: FOLD_TARGET_PX,
            background: 'var(--color-ios-card)',
            color: 'var(--color-ios-ink)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          <GlyphSvg glyph={FEED_GLYPHS.chatCircle} size={20} />
        </button>
      ) : null}
      <div
        id={bodyId}
        data-composer-fold-body=""
        onFocus={reopenOnTyping}
        className="min-w-0 flex-1"
        style={folded ? { height: 0, overflow: 'hidden', opacity: 0, flex: '0 0 0px' } : undefined}
      >
        {children}
      </div>
      {folded ? null : (
        <button
          ref={foldRef}
          type="button"
          data-composer-fold=""
          aria-label={translate(language, 'conversation.composer.fold')}
          aria-expanded
          aria-controls={bodyId}
          onPointerDown={(event) => event.preventDefault()}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => choose(true)}
          className="grid shrink-0 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ width: FOLD_TARGET_PX, height: FOLD_TARGET_PX, color: 'var(--color-ios-ink-2)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <Glyph name="caretDown" size={14} />
        </button>
      )}
    </div>
  );
}
