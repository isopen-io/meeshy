import { useState } from 'react';

import type { Status, Message, Attachment } from '@/lib/api/model';
import { served } from '@/lib/api/prism';
import type { PlacedMessage } from '@/lib/grouping';
import { time } from '@/lib/grouping';
import { languageColor, flag, languageName } from '@/lib/languages';

import { Avatar } from './avatar';
import { Glyph } from './glyph';
import type { GlyphName } from './glyphs';

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

const CHECKS: Record<Status, { name: GlyphName; size: number; read: boolean } | null> = {
  pending: { name: 'clock', size: 10, read: false },
  sent: { name: 'check', size: 10, read: false },
  delivered: { name: 'checks', size: 10, read: false },
  read: { name: 'checks', size: 11, read: true },
};

const STATUS_LABEL: Record<Status, string> = {
  pending: 'en cours d’envoi',
  sent: 'envoyé',
  delivered: 'remis',
  read: 'lu',
};

function Check({ status, isMine }: { status: Status; isMine: boolean }) {
  if (!isMine) return null;
  const check = CHECKS[status];
  if (!check) return null;
  return (
    <Glyph
      name={check.name}
      size={check.size}
      title={STATUS_LABEL[status]}
      {...(check.read ? { style: { color: 'var(--color-read)' } } : {})}
    />
  );
}

/** La bande de drapeaux du pied — au plus QUATRE, dedupliquees. */
function Flags({
  languages,
  active,
  onPick,
}: {
  languages: readonly string[];
  active: string | null;
  onPick: (code: string) => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {languages.slice(0, 4).map((code) => {
        const isActive = code === active;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onPick(code)}
            aria-pressed={isActive}
            /* 22 px et non 44 : exception documentee cote iOS — elargir cette
               cible grandirait CHAQUE bulle traduite. La compensation est que
               le meme geste existe ailleurs a taille pleine (menu « Plus »). */
            className="grid size-[22px] place-items-center rounded-menu leading-none transition-colors"
            title={languageName(code)}
          >
            <span className="flex flex-col items-center gap-px">
              <span style={{ fontSize: isActive ? 12 : 11 }}>{flag(code)}</span>
              <span
                className="block rounded-full"
                style={{
                  width: 10,
                  height: 1.5,
                  backgroundColor: isActive ? languageColor(code) : 'transparent',
                }}
              />
            </span>
          </button>
        );
      })}
    </span>
  );
}

/** Le panneau qui s'ouvre SOUS le texte quand on tape un drapeau. */
function SecondaryText({ code, text, isMine }: { code: string; text: string; isMine: boolean }) {
  const color = languageColor(code);
  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)` }} />
        <span className="size-1 rounded-full" style={{ backgroundColor: color }} />
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${color} 40%, transparent)` }} />
      </div>
      <div
        className="mt-2 rounded-menu px-2 py-2"
        style={{ backgroundColor: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        <p className="flex items-center gap-1.5 text-mini font-semibold" style={{ color: color }}>
          <span>{flag(code)}</span>
          <span>{languageName(code)}</span>
        </p>
        <p
          className="mt-1 text-title"
          lang={code}
          style={{ color: isMine ? 'color-mix(in srgb, white 85%, transparent)' : 'var(--color-ios-ink-2)' }}
        >
          {text}
        </p>
      </div>
    </div>
  );
}

function Quote({ quote, isMine }: { quote: NonNullable<Message['repliesTo']>; isMine: boolean }) {
  return (
    <button
      type="button"
      className="mb-1.5 flex w-full rounded-quote text-left"
      style={{ backgroundColor: isMine ? 'var(--color-quote-mine)' : 'var(--color-quote)' }}
      aria-label={`Aller au message de ${quote.author}`}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: isMine ? 'color-mix(in srgb, white 70%, transparent)' : 'var(--accent)',
        }}
        aria-hidden
      />
      {/* Le nom et le texte cite COULENT DANS LE MEME PARAGRAPHE (directive
          iOS #5103) : deux lignes separees feraient de la citation un bloc
          aussi haut que le message, et c'est le message qu'on vient lire. */}
      <span className="min-w-0 py-2 pr-2.5 pl-2 text-title">
        <span className="font-semibold" style={{ color: isMine ? 'white' : 'var(--accent)' }}>
          {quote.author}{' '}
        </span>
        <span className="line-clamp-2" style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-ios-ink-2)' }}>
          {quote.excerpt}
        </span>
      </span>
    </button>
  );
}

function Voice({ attachment }: { attachment: Extract<Attachment, { kind: 'voice' }> }) {
  const [playing, setPlaying] = useState(false);
  return (
    <div className="flex items-center gap-2.5 py-1">
      <button
        type="button"
        onClick={() => setPlaying((v) => !v)}
        className="grid size-[34px] shrink-0 place-items-center rounded-chip"
        style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, transparent))' }}
        aria-label={playing ? 'Mettre en pause' : 'Lire le message vocal'}
      >
        <Glyph name="fillPlay" size={13} className="text-white" />
      </button>
      {/* La forme d'onde est REELLE (48 barres cote iOS), jamais decorative :
          sa silhouette est ce qui permet de reperer un passage a l'oreille. */}
      <span className="flex h-6 flex-1 items-center gap-px" aria-hidden>
        {attachment.waves.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(12, h * 100)}%`,
              backgroundColor: 'currentColor',
              opacity: playing && i < attachment.waves.length / 3 ? 1 : 0.45,
            }}
          />
        ))}
      </span>
      <span className="shrink-0 text-time tabular-nums">
        {Math.floor(attachment.duration / 60)}:{String(attachment.duration % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

function Attachments({ attachments }: { attachments: readonly Attachment[] }) {
  return (
    <>
      {attachments.map((attachment, i) => {
        if (attachment.kind === 'voice') return <Voice key={i} attachment={attachment} />;
        if (attachment.kind === 'image') {
          return (
            <div
              key={i}
              /* 300 x 240 pour une image seule, rayon 16 — la grille iOS.
                 `aspect-ratio` tient la place AVANT que l'image arrive : c'est
                 la moitie du CLS sur un reseau lent. */
              className="grid max-w-[300px] place-items-center overflow-hidden rounded-card bg-black/40"
              style={{ aspectRatio: '300 / 240' }}
              role="img"
              aria-label={attachment.description}
            >
              <Glyph name="image" size={40} className="opacity-40" />
            </div>
          );
        }
        if (attachment.kind === 'file') {
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Glyph name="file" size={24} />
              <span className="min-w-0 flex-1 truncate text-title">{attachment.name}</span>
              <span className="text-time opacity-70">{Math.round(attachment.bytes / 1024)} Ko</span>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

export function Bubble({
  place,
  languages,
  isGrouped,
}: {
  place: PlacedMessage;
  languages: readonly string[];
  isGrouped: boolean;
}) {
  const { message, tail } = place;
  const isMine = message.isMine;
  const [openLanguage, setOpenLanguage] = useState<string | null>(null);

  const rendu = served(languages, message.originalLanguage, message.translations, message.content);

  /**
   * L'identite ne se montre QUE : en groupe, en reception, et sur la QUEUE
   * d'une suite. Trois conditions, et c'est la troisieme qu'on oublie —
   * l'afficher sur la tete donnerait un fil visuellement juste mais different
   * d'iOS a chaque suite de deux messages.
   */
  const showsIdentity = isGrouped && !isMine && tail;

  const footerLanguages = [...new Set([message.originalLanguage, ...message.translations.map((t) => t.language)])];
  const secondary =
    openLanguage === null
      ? null
      : openLanguage === message.originalLanguage
        ? message.content
        : (message.translations.find((t) => t.language === openLanguage)?.text ?? null);

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
          className="rounded-bubble px-3.5 py-2.5"
          style={
            isMine
              ? { backgroundColor: 'var(--color-bubble-mine)', color: 'white' }
              : { backgroundColor: receivedBg, border: `1px solid ${receivedHairline}`, color: 'var(--color-ios-ink)' }
          }
        >
          {message.repliesTo ? <Quote quote={message.repliesTo} isMine={isMine} /> : null}
          {message.attachments ? <Attachments attachments={message.attachments} /> : null}
          {rendu.text ? (
            /* Le contenu AFFICHE est deja la traduction preferee, rendu
               exactement comme du contenu natif — ni encadre, ni italique, ni
               annonce. C'est le Prisme : la traduction ne se signale que par
               la pastille du pied. `lang` porte la langue REELLEMENT servie,
               pour que la synthese vocale la prononce juste. */
            <p className="text-bubble leading-[1.35] whitespace-pre-wrap" lang={rendu.language}>
              {rendu.text}
            </p>
          ) : null}

          {secondary !== null ? (
            <SecondaryText code={openLanguage as string} text={secondary} isMine={isMine} />
          ) : null}

          <div
            className={`flex items-start gap-2 ${showsIdentity ? 'pt-2' : 'pt-1'}`}
            style={{ color: isMine ? 'var(--color-meta-mine)' : 'var(--color-meta)' }}
          >
            {showsIdentity ? (
              <Avatar
                initials={message.author.initials}
                tint={message.author.tint}
                size={32}
                name={message.author.name}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {showsIdentity ? (
                <span className="text-title font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
                  {message.author.name}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="grid size-[22px] place-items-center rounded-menu"
                  style={{ color: 'var(--color-i400)' }}
                  aria-label="Langues de ce message"
                >
                  <Glyph name="translate" size={12} />
                </button>
                <Flags
                  languages={footerLanguages}
                  active={openLanguage}
                  onPick={(code) => setOpenLanguage((v) => (v === code ? null : code))}
                />
                <span className="flex-1" />
                <time className="text-time font-medium tabular-nums" dateTime={message.sentAt}>
                  {time(message.sentAt)}
                </time>
                <Check status={message.status} isMine={isMine} />
              </div>
            </div>
          </div>
        </div>

        {message.reactions?.length ? (
          /* Les reactions se posent en DEBORD du coin bas, du cote OPPOSE au
             bord d'ecran : a moitie sous la bulle, a moitie dehors. Les
             centrer sous la bulle les ferait passer pour un contenu. */
          <div
            className={`absolute flex gap-1 ${isMine ? 'left-0 -translate-x-1' : 'right-0 translate-x-1'}`}
            style={{ bottom: -8 }}
          >
            {message.reactions.map((r) => (
              <span
                key={r.glyph}
                className="flex items-center gap-0.5 rounded-chip px-1.5 py-0.5 text-check"
                style={{
                  backgroundColor: 'var(--color-ios-card)',
                  border: '1px solid var(--color-edge)',
                }}
              >
                <span aria-hidden>{r.glyph}</span>
                <span className="tabular-nums opacity-70">{r.count}</span>
                <span className="offscreen">{r.count} réaction{r.count > 1 ? 's' : ''} {r.glyph}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
