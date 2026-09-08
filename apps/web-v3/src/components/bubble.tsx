import { useState } from 'react';

import { deliveryOf, isMineOf, translationsOf } from '@/lib/view/message';
import { initialsOf } from '@/lib/view/conversation';
import type { LocalDelivery } from '@/lib/view/message';
import { served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';
import { languageBand, mountsBottomLine } from '@/lib/reading-mode/meta';
import { ephemeralOf, protectionOf } from '@/lib/reading-mode/protection';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import { EphemeralBadge, ProtectedContent, ProtectionNotice } from './protected-content';
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

const defaultNow = (): number => Date.now();

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
 *
 * LA PROTECTION (D-23, #5676) — `deleted` SEUL ne monte AUCUNE bulle :
 * `BubbleDeletedView` (`Bubble/BubbleSystemViews.swift`) est une vue À PART,
 * une capsule alignée du côté de l'expéditeur avec l'espace opposé de 50 px,
 * jamais le fond indigo/accent. `expired` ne rend rien (`EmptyView`).
 * `veiled` ET `burned` gardent la bulle entière (fond, rayon, pied) et
 * enveloppent SEULEMENT citation/pièces-jointes/texte/panneau secondaire —
 * jamais la bande de reprise d'un envoi échoué (`:131-145` reste HORS voile).
 * `burned` REJOINT `veiled` : c'est `ThemedMessageBubble.swift:305-324`
 * exactement (`.burned where !isRevealed → BubbleBurnedView`, sinon le
 * contenu) — la bulle iOS montre déjà le contenu PENDANT la fenêtre de
 * révélation et ne bascule sur `BubbleBurnedView` qu'une fois éteinte.
 * Le pied N'AFFICHE `PrismPastille`/`Flags` QUE quand `mountsBottomLine(...)`
 * l'autorise (critère c, #5676 — la bulle APPELLE enfin la loi du pied
 * qu'elle ignorait) : un message voilé ne montre plus JAMAIS sa langue
 * d'origine en clair.
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
  expired = false,
  onConsumeViewOnce,
  onEphemeralExpired,
  now = defaultNow,
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
  /** FORCÉ par l'hôte quand `EphemeralBadge.onExpired` s'est déclenché pour CE message. */
  expired?: boolean;
  /** Consomme une vue unique (D-10, `lib/api/view-once.ts`). */
  onConsumeViewOnce?: (messageId: string) => Promise<boolean>;
  onEphemeralExpired?: (messageId: string) => void;
  /** Horloge injectable — jamais `Date.now()` lu directement. */
  now?: () => number;
}) {
  const { message, tail } = place;
  const nowMs = now();
  const kind = expired ? 'expired' : protectionOf(message, nowMs);
  const isMine = isMineOf(message, viewerId);
  // TOUJOURS appelé, quel que soit `kind` — les règles des hooks interdisent
  // un retour anticipé AVANT un hook.
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  if (kind === 'expired') return null;

  /**
   * `deleted` SEUL prend la vue à part, SANS bulle. `burned` REJOINT
   * `veiled` plus bas — c'est exactement `ThemedMessageBubble.swift:305-324`
   * (`.burned where !blurController.isRevealed → BubbleBurnedView`, SINON le
   * contenu standard) : la bulle iOS montre déjà le contenu PENDANT la
   * fenêtre de révélation et ne bascule sur le tombstone qu'une fois la
   * fenêtre éteinte. Router `burned` ici COUPERAIT cette fenêtre à l'instant
   * même où la consommation serveur répond — avant les 5 s payées par le
   * lecteur (D-23 §1.4 point 4).
   */
  if (kind === 'deleted') {
    return (
      <div data-message={message.id} style={{ marginBottom: tail ? 6 : 2 }}>
        <ProtectionNotice kind={kind} surface="bubble" isMine={isMine} />
      </div>
    );
  }

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

  // `kind === 'veiled' | 'burned'` toutes deux passent par `ProtectedContent`.
  const isProtected = kind !== 'standard';
  const footerLanguages = languageBand({
    originalLanguage: message.originalLanguage,
    preferredLanguages: languages,
    translations: translations.map((t) => t.language),
    servedLanguage: rendered.language,
  });
  const secondary =
    openLanguage === null
      ? null
      : openLanguage === message.originalLanguage
        ? message.content
        : (translations.find((t) => t.language === openLanguage)?.text ?? null);

  const reactions = reactionEntries(message.reactionSummary);
  const ephemeral = ephemeralOf(message.expiresAt, nowMs);

  /** LE PIED — la loi (D-23, #5676) : jamais de drapeau en clair sur un message voilé, un seul jeu par suite. */
  const showsBottomLine = mountsBottomLine({
    hasTranslation: translations.length > 0,
    isVeiled: isProtected,
    isLastInGroup: tail,
    hasReactions: reactions.length > 0,
  });

  const receivedBg = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-opacity), transparent)';
  const receivedHairline = 'color-mix(in srgb, var(--accent) var(--ios-bubble-other-hairline-opacity), transparent)';

  const contentBlock = (
    <>
      {message.replyTo ? (
        <Quote quote={message.replyTo} isMine={isMine} onJump={() => onJumpToMessage(message.replyTo!.id)} />
      ) : null}
      {message.attachments ? <Attachments attachments={message.attachments} /> : null}

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
    </>
  );

  return (
    <div
      data-message={message.id}
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
        {/* LE BADGE ÉPHÉMÈRE — AU-DESSUS de la bulle, HORS du fond coloré
            (`BubbleStandardLayout.swift:543-550`). Aligné du côté de la bulle. */}
        {ephemeral.state === 'running' && message.expiresAt !== undefined ? (
          <div className={`mb-1 flex ${isMine ? 'justify-end' : 'justify-start'}`}>
            <EphemeralBadge
              expiresAt={message.expiresAt}
              now={now}
              onExpired={() => onEphemeralExpired?.(message.id)}
            />
          </div>
        ) : null}

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
          {/*
            LA BANDE DE REPRISE EST **DANS** LA BULLE, pas sous le fil — c'est
            le parti d'iOS, et il vaut mieux que le nôtre : un bandeau global
            dirait « un envoi a échoué » sans dire LEQUEL, et sur un fil de
            cinquante messages c'est une information inutilisable. Ici l'échec
            est attaché au message qui a échoué, et le geste de reprise est à
            l'endroit où le regard se pose déjà. HORS VOILE (D-23) : un échec
            se voit même sur un message protégé.
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

          {isProtected ? (
            <ProtectedContent
              messageId={message.id}
              kind={kind}
              isViewOnce={message.isViewOnce}
              contentLength={message.content.length}
              attachmentCount={message.attachments?.length ?? 0}
              surface="bubble"
              isMine={isMine}
              onConsumeViewOnce={onConsumeViewOnce}
              now={now}
            >
              {contentBlock}
            </ProtectedContent>
          ) : (
            contentBlock
          )}

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
                {/* PrismPastille/Flags N'APPARAISSENT QUE quand la loi du pied
                    l'autorise (D-23, critère c) — la bulle IGNORAIT cette loi
                    avant ce lot et rendait ces contrôles sur CHAQUE message,
                    voilé compris (`bulle.md` § 9 écart 5). */}
                {showsBottomLine ? (
                  <>
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
                  </>
                ) : null}
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
