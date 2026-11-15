import { useEffect, useState } from 'react';

import { feedbackIssuesFor, FEEDBACK_GOOD_RATING, type CallFeedbackIssue, type CallFeedbackPrompt, type CallFeedbackRating } from '@/lib/calls/call-feedback';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { GlyphSvg } from './glyph';
import { CALL_FEEDBACK_GLYPHS } from './glyphs-call-feedback';

/**
 * **LA NOTE D'APRÈS-APPEL** (#8072) — une carte discrète en bas de l'écran,
 * après l'appel qui vient de finir (quand `feedbackPromptFor` l'a tiré) :
 * elle ne couvre rien, on continue d'utiliser l'app dessous. 4 ou 5 étoiles
 * partent d'un toucher ; en dessous, elle demande ce qui a gêné. Elle se
 * retire seule si personne n'y touche.
 */

export const FEEDBACK_IDLE_MS = 20_000;

const RATINGS: readonly CallFeedbackRating[] = [1, 2, 3, 4, 5];
const STAR = 'var(--ios-warning)';

export function CallFeedbackCard({
  prompt,
  language,
  onRate,
  onSkip,
}: {
  readonly prompt: CallFeedbackPrompt;
  readonly language: InterfaceLanguage;
  readonly onRate: (rating: CallFeedbackRating, issues: readonly CallFeedbackIssue[]) => void;
  readonly onSkip: () => void;
}) {
  const [rating, setRating] = useState<CallFeedbackRating | null>(null);
  const [issues, setIssues] = useState<readonly CallFeedbackIssue[]>([]);

  useEffect(() => {
    if (rating !== null) return undefined;
    const handle = setTimeout(onSkip, FEEDBACK_IDLE_MS);
    return () => clearTimeout(handle);
  }, [rating, onSkip]);

  const pick = (value: CallFeedbackRating) => {
    if (value >= FEEDBACK_GOOD_RATING) {
      onRate(value, []);
      return;
    }
    setRating(value);
  };
  const toggle = (issue: CallFeedbackIssue) =>
    setIssues((current) => (current.includes(issue) ? current.filter((item) => item !== issue) : [...current, issue]));

  return (
    <div className="pointer-events-none fixed inset-x-0 z-[150] flex justify-center px-4" style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)' }}>
      <section
        aria-labelledby="call-feedback-title"
        className="pointer-events-auto flex w-full max-w-sm flex-col gap-3 rounded-card p-4 shadow-lg"
        style={{ backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)', boxShadow: 'var(--shadow-lg)' }}
        data-call-feedback={prompt.callId}
      >
        <div className="flex items-start gap-2">
          <h2 id="call-feedback-title" className="min-w-0 flex-1 text-body font-semibold">
            {translate(language, 'callFeedback.title', { name: prompt.title })}
          </h2>
          <button
            type="button"
            aria-label={translate(language, 'callFeedback.skip')}
            onClick={onSkip}
            className="-m-2 grid size-11 shrink-0 place-items-center rounded-full"
            style={{ color: 'var(--color-ios-ink-3)' }}
          >
            <GlyphSvg glyph={CALL_FEEDBACK_GLYPHS.x} size={18} />
          </button>
        </div>
        <div className="flex justify-center gap-1">
          {RATINGS.map((value) => {
            const lit = rating !== null && value <= rating;
            return (
              <button
                key={value}
                type="button"
                aria-label={translate(language, 'callFeedback.stars', { count: String(value) })}
                aria-pressed={rating === value}
                onClick={() => pick(value)}
                className="grid size-11 place-items-center rounded-full transition-transform active:scale-90"
                style={{ color: lit ? STAR : 'var(--color-ios-ink-3)' }}
                data-call-feedback-star={value}
              >
                <GlyphSvg glyph={lit ? CALL_FEEDBACK_GLYPHS.starFill : CALL_FEEDBACK_GLYPHS.star} size={28} />
              </button>
            );
          })}
        </div>
        {rating === null ? null : (
          <>
            <p className="text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'callFeedback.issuesTitle')}
            </p>
            <div className="flex flex-wrap gap-2">
              {feedbackIssuesFor(prompt.media).map((issue) => {
                const on = issues.includes(issue);
                return (
                  <button
                    key={issue}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggle(issue)}
                    className="min-h-11 rounded-chip px-3 text-check"
                    style={{
                      backgroundColor: on ? 'var(--color-ios-brand)' : 'var(--color-ios-surface)',
                      color: on ? 'var(--color-ios-on-brand)' : 'var(--color-ios-ink)',
                    }}
                    data-call-feedback-issue={issue}
                  >
                    {translate(language, `callFeedback.issue.${issue}`)}
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onRate(rating, issues)}
                className="min-h-11 rounded-full px-5 text-body font-semibold"
                style={{ backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' }}
              >
                {translate(language, 'callFeedback.send')}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
