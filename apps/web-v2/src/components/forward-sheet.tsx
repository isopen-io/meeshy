import { useState } from 'react';

import { useConversations } from '@/lib/api/query';
import { accentOf } from '@/lib/accent';
import { avatarOf, initialsOf, titleOf } from '@/lib/view/conversation';
import { translate } from '@/lib/i18n-catalog';
import { currentInterfaceLanguage } from '@/lib/interface-language';

import { Avatar } from './avatar';
import { Sheet, SheetEmpty } from './sheet';

/**
 * LA FEUILLE DE DESTINATAIRES DU TRANSFERT (#5866) — la seconde étape du
 * geste tranché par le porteur (#5989) : le menu ARME la sélection, la barre
 * la VALIDE, cette feuille dit VERS QUI.
 *
 * **CACHE-FIRST, ET C'EST POUR ÇA QU'ELLE LIT `useConversations()`.**
 * `useConversationsSnapshot()` (ce que `thread.tsx` observe déjà) est posé
 * `enabled: false` : il OBSERVE le cache sans jamais le remplir — parfait
 * pour un compteur de non-lus, ruineux ici, où un lecteur arrivé par lien
 * direct (`/c/:id`, cache de liste vide) n'aurait JAMAIS de destinataire à
 * choisir. La requête complète sert donc le cache IMMÉDIATEMENT quand il en
 * a (aucun squelette, principe non négociable du dépôt) et ne va au réseau
 * que s'il est vide ou périmé. Elle n'est montée QUE pendant que la feuille
 * est ouverte : ouvrir un fil ne déclenche toujours aucune requête de liste.
 *
 * **LA CONVERSATION COURANTE N'EST PAS RETIRÉE.** Re-transférer dans le fil
 * où l'on est est un geste légitime (citer plus bas un message ancien), et le
 * serveur ne l'interdit pas ; une absence inexpliquée dans la liste coûterait
 * plus qu'elle ne protège.
 *
 * Le filtre est LOCAL, sur ce que le cache porte — jamais une seconde route
 * de recherche : la liste servie est déjà celle que la Lentille montre.
 */
export function ForwardSheet({
  viewerId,
  onPick,
  onClose,
}: {
  readonly viewerId: string;
  readonly onPick: (conversationId: string) => void;
  readonly onClose: () => void;
}) {
  const lang = currentInterfaceLanguage();
  const [search, setSearch] = useState('');
  const query = useConversations();
  const conversations = query.data ?? [];
  const needle = search.trim().toLocaleLowerCase(lang);
  const shown =
    needle === '' ? conversations : conversations.filter((c) => titleOf(c, viewerId).toLocaleLowerCase(lang).includes(needle));

  return (
    <Sheet
      title={translate(lang, 'forward.title')}
      searchLabel={translate(lang, 'forward.search.label')}
      searchPlaceholder={translate(lang, 'forward.search.placeholder')}
      search={search}
      onSearchChange={setSearch}
      onClose={onClose}
    >
      {shown.length > 0 ? (
        shown.map((conversation) => {
          const name = titleOf(conversation, viewerId);
          const src = avatarOf(conversation, viewerId);
          return (
            <li key={conversation.id}>
              <button
                type="button"
                data-forward-target={conversation.id}
                onClick={() => onPick(conversation.id)}
                className="flex w-full items-center gap-3 px-4 text-left text-body"
                style={{ minHeight: 56, color: 'var(--color-ios-ink)' }}
              >
                <Avatar
                  initials={initialsOf(name)}
                  color={accentOf(conversation)}
                  size={36}
                  {...(src === undefined ? {} : { src })}
                />
                <span className="flex-1 truncate font-medium">{name}</span>
              </button>
            </li>
          );
        })
      ) : /* LE SQUELETTE NE SORT QUE SUR UN CACHE VIDE (démarrage à froid) —
           `isPending` est FAUX dès que TanStack a des pages en cache, même
           périmées : c'est exactement la distinction que le principe
           « Cache-First, Network-Second » demande. Une recherche sans
           résultat n'est pas un chargement : elle rend l'état VIDE. */
      query.isPending && needle === '' ? (
        <li
          data-forward-loading
          aria-busy="true"
          className="px-4 py-6 text-center text-title"
          style={{ color: 'var(--color-ios-ink-2)' }}
        >
          …
        </li>
      ) : (
        <SheetEmpty label={translate(lang, 'forward.empty')} />
      )}
    </Sheet>
  );
}
