import { useState } from 'react';

import { Glyph } from '@/components/glyph';
import { PeerAvatar } from '@/components/peer-avatar';
import type { CommunityActionDeps } from '@/lib/api/community-actions';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { usePeopleCandidates } from '@/lib/communities/use-people-candidates';
import { communityAccent } from '@/lib/communities/view';
import { translateMembership as t } from '@/lib/i18n-community-membership-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **AJOUTER DES MEMBRES DÈS LA CRÉATION** (#6376) — miroir
 * `CommunityCreateScreen.memberSearchSection` (`packages/MeeshySDK/Sources/MeeshyUI/Community/`) :
 * un champ de recherche, les personnes choisies en pastilles qu'on retire
 * d'un geste, puis les résultats que l'on coche. Rien n'est proposé avant la
 * première lettre (comme iOS) ; dès elle, les AMIS du cache persisté répondent
 * aussitôt, et la recherche de la passerelle s'y ajoute à deux lettres — la
 * même source que la feuille « Inviter » (`usePeopleCandidates`).
 *
 * Le choix reste LOCAL : rien ne part avant « Créer la communauté », qui crée
 * puis invite par le port de l'invitation (`performCreateCommunityWithMembers`).
 */

const ROW_MIN_HEIGHT = 56;

export function CommunityNewMembers({
  deps,
  language,
  chosen,
  onToggle,
}: {
  readonly deps: CommunityActionDeps;
  readonly language: InterfaceLanguage;
  readonly chosen: ReadonlyMap<string, PersonSummary>;
  readonly onToggle: (person: PersonSummary) => void;
}) {
  const [query, setQuery] = useState('');
  const view = usePeopleCandidates({ deps, query });
  const typed = query.trim() !== '';
  const people = [...view.friends, ...view.others];
  const nameOf = (person: PersonSummary) => person.displayName ?? person.username;

  return (
    <section aria-labelledby="community-new-members-title" className="grid gap-3" data-community-new-members>
      <h2 id="community-new-members-title" className="text-body font-semibold" style={{ color: 'var(--color-ios-ink-2)' }}>
        {t(language, 'community.create.members.title')}
      </h2>
      <label
        className="flex items-center gap-2 rounded-chip px-3 focus-within:outline-2 focus-within:outline-offset-2"
        style={{ minHeight: 44, backgroundColor: 'var(--color-ios-fill)', outlineColor: 'var(--color-ios-brand)' }}
      >
        <Glyph name="magnifyingGlass" size={18} style={{ color: 'var(--color-ios-ink-3)' }} />
        <span className="sr-only">{t(language, 'community.create.members.search')}</span>
        <input
          type="search"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={query}
          placeholder={t(language, 'community.create.members.search')}
          onInput={(event) => setQuery(event.currentTarget.value)}
          onChange={() => undefined}
          data-community-new-members-search
          className="w-0 min-w-0 flex-1 bg-transparent text-body outline-none"
          style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
        />
      </label>
      {chosen.size === 0 ? null : (
        <ul className="flex flex-wrap gap-2" aria-live="polite">
          {[...chosen.values()].map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onClick={() => onToggle(person)}
                aria-label={t(language, 'community.create.members.remove', { name: nameOf(person) })}
                data-community-new-members-chosen={person.id}
                className="flex items-center gap-1 rounded-full px-3 text-caption font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ minHeight: 44, color: 'var(--color-ios-on-brand)', backgroundColor: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
              >
                <span className="max-w-40 truncate">{nameOf(person)}</span>
                <Glyph name="x" size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {typed ? (
        <ul className="overflow-hidden rounded-card" style={{ backgroundColor: 'var(--color-ios-fill)' }}>
          {people.map((person) => {
            const selected = chosen.has(person.id);
            return (
              <li key={person.id}>
                <button
                  type="button"
                  role="checkbox"
                  aria-checked={selected}
                  onClick={() => onToggle(person)}
                  data-community-new-members-candidate={person.id}
                  className="flex w-full items-center gap-3 px-3 py-2 text-start focus-visible:outline-2 focus-visible:-outline-offset-2"
                  style={{ minHeight: ROW_MIN_HEIGHT, outlineColor: 'var(--color-ios-brand)' }}
                >
                  <PeerAvatar presenceKey={person.id} ringRef={person.ring ?? null} initials={initialsOf(nameOf(person))} color={communityAccent(nameOf(person))} size={40} {...(person.avatar === null ? {} : { src: person.avatar })} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body font-medium" style={{ color: 'var(--color-ios-ink)' }}>
                      {nameOf(person)}
                    </span>
                    <span className="truncate text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
                      @{person.username}
                    </span>
                  </span>
                  {selected ? <Glyph name="check" size={20} style={{ color: 'var(--color-ios-brand)' }} /> : null}
                </button>
              </li>
            );
          })}
          {people.length > 0 ? null : (
            <li role="status" className="px-3 py-4 text-center text-body" style={{ color: 'var(--color-ios-ink-2)' }} data-community-new-members-empty>
              {t(language, view.fetching ? 'community.invite.searching' : 'community.invite.empty')}
            </li>
          )}
        </ul>
      ) : null}
    </section>
  );
}
