import { useState } from 'react';

import { deliveryOf, isMineOf, translationsOf } from '@/lib/view/message';
import { initialsOf } from '@/lib/view/conversation';
import type { LocalDelivery } from '@/lib/view/message';
import { served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import {
  Attachments,
  Check,
  Flags,
  PrismPastille,
  Quote,
  ReactionChip,
  SecondaryText,
  reactionEntries,
} from './message-blocks';

/**
 * LA BULLE — le composant le plus dense de l'interface, et celui sur lequel la
 * fidelite se juge.
 *
 * Trois choses que le rendu iOS fait et qu'on rate en le regardant vite :
 *
 * 1. Le rayon est UNIFORME (18 px, quatre coins), il n'y a NI queue, NI coin
 *    asymetrique, NI ombre, NI degrade de fond. Les ombres ont ete retirees
 *    cote iOS pour la fluidite du defilement — les reposer ici couterait des
 *    passes offscreen sur exactement l'appareil vise.
 * 2. L'avatar et le nom vivent DANS le pied de la bulle, pas a cote d'elle, et
 *    ne s'affichent que sur le DERNIER message d'une suite (jamais le
 *    premier), en groupe, et seulement en reception.
 * 3. La bulle ENVOYEE est l'indigo de marque, le MEME dans toutes les
 *    conversations ; seule la bulle RECUE porte l'accent de la conversation.
 */

export function Bubble({
  place,
  languages,
  isGrouped,
  viewerId,
  localDelivery,
  onRetry,
  onJumpToMessage,
  highlighted = false,
}: {
  place: PlacedMessage;
  languages: readonly string[];
  isGrouped: boolean;
  viewerId: string;
  /** L'opinion de CE client sur l'envoi, tant que le transport n'a pas tranché. */
  localDelivery?: LocalDelivery;
  onRetry?: () => void;
  /** Saute au message cité (#5566 défaut 10 : le bouton de citation ne faisait rien). */
  onJumpToMessage: (messageId: string) => void;
  /** Mis en évidence brièvement après un saut de citation. */
  highlighted?: boolean;
}) {
  const { message, tail } = place;
  const isMine = isMineOf(message, viewerId);
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  const translations = translationsOf(message);
  const rendered = served({
    preferredLanguages: languages,
    originalLanguage: message.originalLanguage,
    translations: message.translations,
    original: message.content,
  });

  /**
   * L'identite ne se montre QUE : en groupe, en reception, et sur la QUEUE
   * d'une suite. Trois conditions, et c'est la troisieme qu'on oublie —
   * l'afficher sur la tete donnerait un fil visuellement juste mais different
   * d'iOS a chaque suite de deux messages.
   */
  const showsIdentity = isGrouped && !isMine && tail;

  const footerLanguages = [...new Set([message.originalLanguage, ...translations.map((t) => t.language)])];
  const secondary =
    openLanguage === null
      ? null
      : openLanguage === message.originalLanguage
        ? message.content
        : (translations.find((t) => t.language === openLanguage)?.text ?? null);

  const reactions = reactionEntries(message.reactionSummary);

  const receivedBg = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-opacity), transparent)';
  const receivedHairline = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-hairline-opacity), transparent)';

  return (
    <div
      className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
      /* L'espacement vertical DEPEND de la place dans le groupe : 6 px en
         queue, 2 px au milieu. C'est ce qui fait lire une suite comme un
         bloc plutot que comme des messages independants. */
      style={{ marginBottom: tail ? 6 : 2 }}
    >
      <div
        className="relative max-w-[70%] min-w-0"
        style={{ marginInlineStart: isMine ? 50 : 0, marginInlineEnd: isMine ? 0 : 50 }}
      >
        <div
          className="rounded-bubble px-3.5 py-2.5 transition-shadow duration-500"
          style={{
            ...(isMine
              ? { backgroundColor: 'var(--color-bubble-mine)', color: 'white' }
              : { backgroundColor: receivedBg, border: `1px solid ${receivedHairline}`, color: 'var(--color-ios-ink)' }),
            /* Mise en évidence temporaire après un saut de citation — un
               anneau plutôt qu'un fond, pour ne jamais menacer le contraste
               du texte qu'il entoure (#5566 défaut 10). */
            boxShadow: highlighted ? '0 0 0 2.5px var(--accent)' : 'none',
          }}
        >
          {message.replyTo ? (
            <Quote quote={message.replyTo} isMine={isMine} onJump={() => onJumpToMessage(message.replyTo!.id)} />
          ) : null}
          {message.attachments ? <Attachments attachments={message.attachments} /> : null}
          {/*
            LA BANDE DE REPRISE EST **DANS** LA BULLE, pas sous le fil — c'est
            le parti d'iOS, et il vaut mieux que le nôtre : un bandeau global
            dirait « un envoi a échoué » sans dire LEQUEL, et sur un fil de
            cinquante messages c'est une information inutilisable. Ici l'échec
            est attaché au message qui a échoué, et le geste de reprise est à
            l'endroit où le regard se pose déjà.
          */}
          {localDelivery === 'failed' && onRetry !== undefined ? (
            <button
              type="button"
              onClick={onRetry}
              className="mb-1.5 flex w-full items-center gap-1.5 rounded-quote px-2 py-1.5 text-left text-check font-semibold"
              style={{
                backgroundColor: 'color-mix(in srgb, var(--color-error) 18%, transparent)',
                color: isMine ? 'white' : 'var(--color-error)',
              }}
            >
              <Glyph name="warningCircle" size={12} />
              <span className="flex-1">Non envoyé</span>
              <span style={{ textDecoration: 'underline' }}>Réessayer</span>
            </button>
          ) : null}

          {rendered.text ? (
            /* Le contenu AFFICHE est deja la traduction preferee, rendu
               exactement comme du contenu natif — ni encadre, ni italique, ni
               annonce. C'est le Prisme : la traduction ne se signale que par
               la pastille du pied. `lang` porte la langue REELLEMENT servie,
               pour que la synthese vocale la prononce juste. */
            <p className="text-bubble leading-[1.35] whitespace-pre-wrap" lang={rendered.language}>
              {rendered.text}
            </p>
          ) : null}

          {openLanguage !== null && secondary !== null ? (
            <SecondaryText code={openLanguage} text={secondary} isMine={isMine} />
          ) : null}

          <div
            className={`flex items-start gap-2 ${showsIdentity ? 'pt-2' : 'pt-1'}`}
            style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-meta)' }}
          >
            {showsIdentity ? (
              <Avatar
                initials={initialsOf(message.sender?.displayName ?? '')}
                color="var(--accent)"
                size={32}
                name={message.sender?.displayName ?? ''}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {showsIdentity ? (
                <span className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                  {message.sender?.displayName ?? ''}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <PrismPastille
                  servedLanguage={rendered.language}
                  originalLanguage={message.originalLanguage}
                  active={openLanguage}
                  onToggle={() =>
                    setOpenLanguage((v) => (v === message.originalLanguage ? null : message.originalLanguage))
                  }
                />
                <Flags
                  languages={footerLanguages}
                  active={openLanguage}
                  onPick={(code) => setOpenLanguage((v) => (v === code ? null : code))}
                />
                <span className="flex-1" />
                <time
                  className="text-time font-medium tabular-nums"
                  dateTime={new Date(message.createdAt).toISOString()}
                >
                  {time(message.createdAt)}
                </time>
                <Check
                  status={localDelivery === 'pending' ? 'pending' : deliveryOf(message)}
                  isMine={isMine}
                />
              </div>
            </div>
          </div>
        </div>

        {reactions.length > 0 ? (
          /* Les reactions se posent en DEBORD du coin bas, du cote OPPOSE au
             bord d'ecran : a moitie sous la bulle, a moitie dehors. Les
             centrer sous la bulle les ferait passer pour un contenu. */
          <div
            className={`absolute flex gap-1 ${isMine ? 'left-0 -translate-x-1' : 'right-0 translate-x-1'}`}
            style={{ bottom: -8 }}
          >
            {reactions.map(([glyph, count]) => (
              <ReactionChip key={glyph} glyph={glyph} count={count} />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
