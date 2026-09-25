import { useRef } from 'react';

import { MentionFieldPanel } from '@/components/mention-suggestions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useMentionSource } from '@/lib/view/mention-source';
import { useMentionField } from '@/lib/view/use-mention-field';
import type { SceneTextBox } from '@/routes/story-compose-text-box';

const DIRECTORY = { directory: true } as const;

/**
 * LA SAISIE DU TEXTE DE LA SCÈNE (story, post, réel — le studio unique,
 * #7497), extraite de `story-compose.tsx` pour y porter la mention (#7846).
 *
 * TRANSPARENTE ET ALIGNÉE AU PIXEL PRÈS sur ce que le moteur peint pour
 * l'objet SÉLECTIONNÉ (défaut 1, revue-correction #6900) : sa boîte est celle
 * MESURÉE, jamais une largeur/hauteur fixes qui coupaient les lignes ou
 * décalaient le curseur d'une ligne entière. Sans texte peint (objet vide),
 * elle retombe sur le centre par défaut, à la même ancre que l'objet.
 *
 * LA MENTION — la passerelle lit les `@pseudo` du texte d'une scène
 * (`collectMentionableText`, `storyEffects.textObjects[].text`) comme ceux
 * d'une légende. La publication n'existe pas encore : aucune route
 * contextuelle ne sait la classer, la recherche passe par l'ANNUAIRE ; les
 * contacts, eux, viennent du cache comme partout. La liste se pose en HAUT de
 * la scène : le texte qu'on écrit en occupe le centre.
 */
export function StudioTextInput({
  lang,
  targetId,
  layer,
  fallbackLanguage,
  textBox,
  fontSize,
  onText,
  onPublish,
  locked = false,
}: {
  readonly lang: InterfaceLanguage;
  readonly targetId: string | null;
  readonly layer: { readonly text: string; readonly language: string } | null;
  readonly fallbackLanguage: string;
  readonly textBox: SceneTextBox | null;
  readonly fontSize: string | null;
  readonly onText: (value: string) => void;
  readonly onPublish: () => void;
  /** VERROUILLÉE pendant l'envoi (#7707, revue-correction) — le plan publié
   * lit le texte tel qu'il était au premier clic sur Publier ; une frappe
   * après coup partirait dans l'ancienne version, ou serait perdue quand la
   * page quitte le brouillon dès sa story commise. */
  readonly locked?: boolean;
}) {
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const text = layer?.text ?? '';
  const source = useMentionSource(DIRECTORY);
  const mention = useMentionField({ text, fieldRef, onText, source });

  return (
    <>
      <div className="absolute inset-x-0 top-0" style={{ zIndex: 4 }} data-story-mention-anchor>
        <div className="relative">
          <MentionFieldPanel field={mention} language={lang} placement="below" />
        </div>
      </div>
      <label htmlFor="story-studio-text" className="offscreen">
        {translate(lang, 'story.studio.text.label')}
      </label>
      <textarea
        ref={fieldRef}
        id="story-studio-text"
        data-story-text-input
        data-story-text-target={targetId ?? undefined}
        lang={layer?.language ?? fallbackLanguage}
        dir="auto"
        disabled={layer === null || locked}
        value={text}
        onInput={(event) => {
          onText(event.currentTarget.value);
          mention.syncCaret(event.currentTarget);
        }}
        onFocus={mention.onFocus}
        onBlur={mention.onBlur}
        onClick={(event) => mention.syncCaret(event.currentTarget)}
        onKeyUp={(event) => mention.syncCaret(event.currentTarget)}
        {...mention.aria}
        onKeyDown={(event) => {
          if (mention.onKeyDown(event.nativeEvent)) return;
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            onPublish();
          }
        }}
        placeholder={translate(lang, 'story.studio.text.placeholder')}
        rows={1}
        className="absolute resize-none overflow-hidden border-0 bg-transparent p-0 text-center font-semibold text-transparent caret-white placeholder:text-white placeholder:opacity-60"
        style={{
          ...(textBox !== null
            ? { top: textBox.top, left: textBox.left, width: textBox.width, height: textBox.height }
            : { top: '50%', left: '50%', width: '85%', transform: 'translate(-50%, -50%)' }),
          ...(fontSize !== null ? { fontSize } : {}),
          lineHeight: 1.2,
          zIndex: 2,
        }}
      />
    </>
  );
}
