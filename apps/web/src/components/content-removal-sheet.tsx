import { useEffect, useId, useRef, useState } from 'react';

import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';
import { MODERATION_REASON_MAX, MODERATION_REASON_MIN, moderationReasonOf } from '@/lib/view/content-removal';

import { Sheet } from './sheet';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/**
 * **LE MOTIF DU RETRAIT** (#11150) — UNE feuille pour les quatre surfaces où
 * la modération retire le contenu d'un autre : un message, une publication,
 * une story, un commentaire. Le motif est OBLIGATOIRE (`moderationReasonOf`,
 * 3 à 500 caractères nettoyés) : « Retirer » reste désactivé tant qu'il ne
 * l'est pas, et la feuille dit pourquoi on le demande — l'auteur en sera
 * prévenu.
 *
 * Le focus part sur le champ ; Échap et le voile annulent (la feuille s'en
 * charge). `onConfirm` reçoit le motif NETTOYÉ.
 */
export function ContentRemovalSheet({
  onConfirm,
  onCancel,
}: {
  readonly onConfirm: (reason: string) => void;
  readonly onCancel: () => void;
}) {
  const language = currentInterfaceLanguage();
  const [text, setText] = useState('');
  const field = useRef<HTMLTextAreaElement>(null);
  const fieldId = useId();
  const reason = moderationReasonOf(text);

  useEffect(() => {
    const timer = setTimeout(() => field.current?.focus(), 0);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Sheet title={translate(language, 'moderation.remove.title')} presentation="centered" bodyAs="div" dialogData={{ 'data-content-removal-sheet': '' }} onClose={onCancel}>
      <div className="grid gap-4 px-5 pb-5 pt-2">
        <div className="grid gap-1">
          <label htmlFor={fieldId} className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'moderation.remove.reason.label')}
          </label>
          <textarea
            id={fieldId}
            ref={field}
            data-content-removal-reason
            rows={3}
            maxLength={MODERATION_REASON_MAX}
            required
            value={text}
            onInput={(event) => setText(event.currentTarget.value)}
            onChange={() => undefined}
            aria-describedby={`${fieldId}-notice ${fieldId}-bounds`}
            className={`rounded-card px-4 py-3 text-body ${FOCUS}`}
            style={{ backgroundColor: 'var(--color-ios-card)', border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          />
          <span id={`${fieldId}-notice`} className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'moderation.remove.reason.notice')}
          </span>
          <span id={`${fieldId}-bounds`} data-content-removal-bounds className="text-caption tabular-nums" style={{ color: 'var(--color-ios-ink-3)' }}>
            {translate(language, 'moderation.remove.reason.bounds', { min: String(MODERATION_REASON_MIN), max: String(MODERATION_REASON_MAX) })}{' '}
            {translate(language, 'moderation.remove.reason.count', { count: String(text.trim().length), max: String(MODERATION_REASON_MAX) })}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            data-content-removal="cancel"
            onClick={onCancel}
            className={`rounded-card px-5 text-body font-semibold ${FOCUS}`}
            style={{ minHeight: 48, border: '1px solid var(--color-edge)', color: 'var(--color-ios-ink)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'common.cancel')}
          </button>
          <button
            type="button"
            data-content-removal="confirm"
            disabled={reason === null}
            onClick={() => {
              if (reason !== null) onConfirm(reason);
            }}
            className={`rounded-card px-5 text-body font-semibold text-ios-on-brand disabled:opacity-40 ${FOCUS}`}
            style={{ minHeight: 48, backgroundColor: 'var(--color-error)', outlineColor: 'var(--color-ios-brand)' }}
          >
            {translate(language, 'moderation.remove.action')}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
