import type { MentionCandidate } from '@/lib/api/mention-suggestions';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';

import { Avatar } from './avatar';

/** L'identifiant d'une rangée — `aria-activedescendant` du champ le vise. */
export const mentionOptionId = (listId: string, index: number): string => `${listId}-option-${index}`;

/**
 * LA LISTE DE MENTIONS, POSÉE AU-DESSUS DU COMPOSEUR (#7826) — miroir de
 * `ComposerMentionStrip.swift` : avatar, nom, `@pseudo` ; et, quand il n'y a
 * personne, le mot « personne » plutôt qu'un silence (iOS 2026-09-05 : une
 * bande qui disparaît ne se distingue pas d'une fonction cassée).
 *
 * FLOTTANTE (`absolute`, `bottom: 100%`), jamais dans le flux : s'ouvrir ne
 * doit pas faire sauter le composeur ni re-mesurer les marges du fil à
 * chaque lettre tapée.
 *
 * LE FOCUS NE QUITTE JAMAIS LE CHAMP — c'est le motif ARIA « textbox + listbox
 * à descendant actif » : le champ porte `aria-activedescendant`, les flèches
 * déplacent la rangée active, la liste n'est jamais une étape de tabulation.
 * Un appui sur une rangée l'insère sans voler le focus (`preventDefault` sur
 * `pointerdown`, motif du bouton d'envoi) : le clavier virtuel ne se referme
 * pas entre la lettre tapée et la personne choisie.
 */
export function MentionSuggestions({
  listId,
  items,
  activeIndex,
  language,
  onPick,
  onHighlight,
}: {
  readonly listId: string;
  readonly items: readonly MentionCandidate[];
  readonly activeIndex: number;
  readonly language: InterfaceLanguage;
  readonly onPick: (candidate: MentionCandidate) => void;
  readonly onHighlight: (index: number) => void;
}) {
  const label = translate(language, 'composer.mention.suggestions');
  return (
    <div
      data-mention-suggestions
      className="glass-prominent absolute inset-x-3 bottom-full mb-2 overflow-hidden rounded-card shadow-cast"
      style={{ zIndex: 5 }}
    >
      <p role="status" className="sr-only">
        {translate(language, 'composer.mention.count', { count: String(items.length) })}
      </p>
      {items.length === 0 ? (
        <p className="px-4 py-3 text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          {translate(language, 'composer.mention.empty')}
        </p>
      ) : (
        <ul id={listId} role="listbox" aria-label={label} className="overflow-y-auto py-1" style={{ maxHeight: 264 }}>
          {items.map((candidate, index) => {
            const selected = index === activeIndex;
            return (
              <li
                key={candidate.id}
                id={mentionOptionId(listId, index)}
                role="option"
                aria-selected={selected}
                data-mention-option={candidate.username}
                onPointerDown={(e) => e.preventDefault()}
                onPointerEnter={() => onHighlight(index)}
                onClick={() => onPick(candidate)}
                className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2"
                style={selected ? { backgroundColor: 'color-mix(in srgb, var(--accent) 14%, transparent)' } : undefined}
              >
                <Avatar
                  initials={initialsOf(candidate.displayName)}
                  color={colorForName(candidate.displayName)}
                  size={32}
                  {...(candidate.avatar === undefined ? {} : { src: candidate.avatar })}
                />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                    {candidate.displayName}
                  </span>
                  <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }} dir="ltr">
                    @{candidate.username}
                  </span>
                </span>
                {candidate.badge === 'friend' ? (
                  <span
                    className="shrink-0 rounded-chip px-2 py-1 text-chip"
                    style={{ color: 'var(--accent)', backgroundColor: 'color-mix(in srgb, var(--accent) 10%, transparent)' }}
                  >
                    {translate(language, 'composer.mention.badge.friend')}
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
