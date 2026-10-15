import { useMemo } from 'react';

import { useStatusMoods } from '@/lib/api/query';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import type { MoodPeek } from '@/lib/view/mood-peek';
import { moodPeekContent, type MoodPeekContent } from '@/lib/view/mood-peek-content';
import { useReadingSession } from '@/lib/view/reading-telemetry';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useViewer } from '@/lib/view/use-viewer';

import { Sheet } from './sheet';

/**
 * **L'HUMEUR ET LE TEXTE QUI L'ACCOMPAGNE** (#10528, directive porteur du
 * 2026-10-13) — ce qu'ouvre un toucher sur la pastille d'un avatar. Miroir de
 * la bulle d'iOS (`StatusBubbleController`).
 *
 * Le texte vient du corpus DÉJÀ servi (`?scope=statuses`, la requête du rail :
 * elle est en cache, la feuille s'ouvre sans attente) et descend le Prisme du
 * lecteur. Rien n'est demandé de plus, rien n'est inventé : sans texte, la
 * feuille montre l'humeur seule, sous le nom de son auteur.
 *
 * **L'OUVRIR EST UNE VUE** (#10530, règle de comptage #10483) — comme
 * `StatusBubbleController.show` : pour l'humeur d'un AUTRE, la vue tout de
 * suite, puis sa durée et la séance `STATUS` à la fermeture, dites depuis
 * `mood_avatar`. L'impression, elle, est déjà comptée par la pastille à son
 * apparition ; ma propre humeur ne compte rien. Par la porte existante
 * (`useReadingSession`), jamais une requête écrite ici.
 */
export function MoodPeekSheet({ peek, onClose }: { readonly peek: MoodPeek; readonly onClose: () => void }) {
  const moods = useStatusMoods();
  const { languages } = useReaderLanguages();
  const content = useMemo(
    () => moodPeekContent({ posts: moods.data ?? [], authorId: peek.authorId, emoji: peek.emoji, languages }),
    [moods.data, peek.authorId, peek.emoji, languages],
  );
  const mine = useViewer().id === peek.authorId;
  useReadingSession({
    postId: content.postId,
    active: !mine,
    contentType: 'STATUS',
    surface: 'mood_avatar',
    impressionSource: null,
    openView: true,
  });
  return <MoodPeekBody content={content} name={peek.name} authorId={peek.authorId} onClose={onClose} />;
}

/** Le CORPS, séparé de ses lectures : un témoin le monte sans réseau ni session. */
export function MoodPeekBody({
  content,
  name,
  authorId,
  onClose,
}: {
  readonly content: MoodPeekContent;
  readonly name: string | undefined;
  readonly authorId: string;
  readonly onClose: () => void;
}) {
  const language = currentInterfaceLanguage();
  return (
    <Sheet
      title={translate(language, 'mood.peek.title', { name: name ?? '' })}
      bodyAs="div"
      presentation="bottom"
      dialogData={{ 'data-mood-peek-sheet': authorId }}
      onClose={onClose}
    >
      <div className="grid justify-items-center gap-3 px-6 pb-8 pt-2 text-center">
        <p data-mood-peek-emoji style={{ fontSize: 56, lineHeight: 1 }}>
          {content.emoji}
        </p>
        {content.text === '' ? null : (
          <p
            data-mood-peek-text
            className="max-w-prose whitespace-pre-wrap break-words text-title"
            style={{ color: 'var(--color-ios-ink)' }}
            {...(content.language === undefined ? {} : { lang: content.language })}
            dir="auto"
          >
            {content.text}
          </p>
        )}
      </div>
    </Sheet>
  );
}
