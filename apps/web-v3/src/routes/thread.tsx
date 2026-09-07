import { useState } from 'react';

import { Avatar } from '@/components/avatar';
import { Bubble } from '@/components/bubble';
import { Composer } from '@/components/composer';
import { Glyph } from '@/components/glyph';
import { CONVERSATIONS, MESSAGES, PARTICIPANTS, VIEWER_ID } from '@/lib/api/fixtures';
import type { Message } from '@/lib/api/types';
import { accentOf, withAccent } from '@/lib/accent';
import { initialsOf, isGroup, peerOf, presenceOf, titleOf, unreadOf } from '@/lib/view/conversation';
import { useParams } from '@/lib/router';
import { dayLabel, place } from '@/lib/grouping';
import { Link } from '@/routes/route-table';
import { READER_LANGUAGES } from '@/lib/reader';

/**
 * LE FIL.
 *
 * L'en-tete FLOTTE au-dessus des messages (il n'y a aucune barre de navigation
 * systeme dans l'app iOS) et se REPLIE : au repos il ne montre que le retour,
 * la grappe d'actions et l'avatar ; taper l'avatar DEPLIE le titre et les
 * etiquettes. La bande depliee ne porte AUCUNE action — c'est un arbitrage
 * iOS explicite, et il tient : deux etats, deux roles.
 *
 * Le bouton de retour porte le compte de non-lus des AUTRES conversations.
 */
export default function ThreadScreen() {
  const { conversation: id } = useParams<'/c/$conversation'>();
  const conversation = CONVERSATIONS.find((c) => c.id === id) ?? CONVERSATIONS[0]!;
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<readonly Message[]>(MESSAGES);
  const [typing] = useState(true);

  const otherUnread = CONVERSATIONS.filter((c) => c.id !== conversation.id).reduce(
    (total, c) => total + unreadOf(c),
    0,
  );
  const placed = place(messages);
  const group = isGroup(conversation);
  const title = titleOf(conversation, VIEWER_ID);
  const accent = accentOf(conversation);
  const viewer = PARTICIPANTS.find((p) => p.userId === VIEWER_ID);

  const send = (text: string) => {
    /**
     * OPTIMISTIC UPDATE : le message apparait AVANT le reseau, en etat
     * « en-attente ». C'est non negociable sur la 3G visee — attendre l'accuse
     * du serveur avant de peindre ferait un composeur qui semble ne rien faire
     * pendant deux secondes.
     */
    const now = new Date();
    setMessages((previous) => [
      ...previous,
      {
        id: `local-${now.getTime()}`,
        conversationId: conversation.id,
        senderId: VIEWER_ID,
        ...(viewer === undefined ? {} : { sender: viewer }),
        content: text,
        originalLanguage: 'fr',
        messageType: 'text',
        messageSource: 'user',
        isEdited: false,
        isViewOnce: false,
        viewOnceCount: 0,
        isBlurred: false,
        // Rien n'est encore parti : `deliveredCount` à 0 est ce que
        // `deliveryOf` lit comme « en attente », sans champ inventé.
        deliveredCount: 0,
        readCount: 0,
        reactionCount: 0,
        isEncrypted: false,
        translations: [],
        createdAt: now,
        timestamp: now,
      },
    ]);
  };

  return (
    /* `h-dvh` + `overflow-hidden`, et NON `min-h-dvh` : c'est ce qui fait la
       difference entre une PAGE (le document entier defile, le composeur suit)
       et une APPLICATION (seule la zone des messages defile, l'en-tete et le
       composeur sont des bords fixes). Avec `min-h-dvh` le composeur recouvrait
       les derniers messages — le defaut le plus visible du premier rendu. */
    <div className="flex h-dvh flex-col overflow-hidden" style={withAccent(accent)}>
      <header
        className="z-10 shrink-0 backdrop-blur-xl"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-surface) 80%, transparent)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2">
          <Link
            to="list"
            className="relative grid size-11 shrink-0 place-items-center rounded-chip"
            style={{ color: 'var(--accent)' }}
            aria-label={otherUnread > 0 ? `Retour — ${otherUnread} messages non lus ailleurs` : 'Retour'}
          >
            <Glyph name="caretLeft" size={22} />
            {otherUnread > 0 ? (
              <span
                className="absolute top-0 right-0 grid min-h-4 min-w-4 place-items-center rounded-chip px-1 text-[9px] font-semibold text-white"
                style={{ backgroundColor: 'var(--color-error)' }}
                aria-hidden
              >
                {otherUnread}
              </span>
            ) : null}
          </Link>

          {expanded ? (
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="truncate text-title font-bold" style={{ color: 'var(--color-ios-ink)' }}>
                {title}
              </h1>
              <p className="flex items-center gap-1 text-mini" style={{ color: 'var(--color-ios-ink-2)' }}>
                <Glyph name="lock" size={9} style={{ color: 'var(--color-ok)' }} />
                {group ? `${conversation.memberCount} participants` : 'Chiffré de bout en bout'}
              </p>
            </div>
          ) : (
            <>
              <span className="flex-1" />
              <button
                type="button"
                className="grid size-11 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Appeler"
              >
                <span
                  className="grid size-7 place-items-center rounded-chip"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyph name="phone" size={13} />
                </span>
              </button>
              <button
                type="button"
                className="grid size-11 place-items-center"
                style={{ color: 'var(--accent)' }}
                aria-label="Rechercher dans la conversation"
              >
                <span
                  className="grid size-7 place-items-center rounded-chip"
                  style={{ backgroundColor: 'color-mix(in srgb, var(--accent) 18%, transparent)' }}
                >
                  <Glyph name="magnifyingGlass" size={13} />
                </span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Replier l’en-tête' : 'Déplier l’en-tête'}
            className="shrink-0"
          >
            <Avatar
              initials={initialsOf(title)}
              color={accent}
              size={44}
              {...(group ? {} : { presence: presenceOf(peerOf(conversation, VIEWER_ID)) })}
            />
          </button>
        </div>
      </header>

      <main id="contenu" className="flex flex-1 flex-col justify-end overflow-y-auto px-3.5 pt-2 pb-2">
        <ol>
          {placed.map((p) => (
            <li key={p.message.id}>
              {p.opensDay ? (
                <div className="flex justify-center py-1.5">
                  <span
                    className="rounded-chip px-3 py-1 text-time font-semibold backdrop-blur-md"
                    style={{
                      color: 'var(--color-day-ink)',
                      border: '0.5px solid var(--color-day-hairline)',
                      backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 70%, transparent)',
                    }}
                  >
                    {dayLabel(p.message.createdAt)}
                  </span>
                </div>
              ) : null}
              <Bubble place={p} languages={READER_LANGUAGES} isGrouped={group} viewerId={VIEWER_ID} />
            </li>
          ))}
        </ol>

        {typing ? (
          /* L'indicateur de frappe est une VRAIE cellule du flux, en queue —
             pas un overlay : il pousse le fil comme le ferait un message, donc
             l'arrivee du vrai message ne fait sauter aucune ligne. */
          <div className="flex items-end gap-1.5 py-1">
            <Avatar initials="AD" color={accent} size={18} />
            <span
              className="flex items-center gap-1.5 rounded-chip px-3 py-2"
              style={{ backgroundColor: 'var(--color-ios-card)' }}
            >
              <span className="text-time" style={{ color: 'var(--color-ios-ink-2)' }}>
                Amina écrit
              </span>
              <span className="flex gap-[3px]" aria-hidden>
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="size-[5px] rounded-full"
                    style={{
                      backgroundColor: 'var(--accent)',
                      animation: 'typingDot 1s ease-in-out infinite',
                      animationDelay: `${i * 0.18}s`,
                    }}
                  />
                ))}
              </span>
            </span>
          </div>
        ) : null}
      </main>

      <div className="shrink-0">
        <Composer onSend={send} />
      </div>
    </div>
  );
}
