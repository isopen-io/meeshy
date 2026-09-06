import { useState } from 'react';

import type { Etat, Message, Piece } from '@/lib/api/modele';
import { servi } from '@/lib/api/prisme';
import type { MessagePlace } from '@/lib/groupage';
import { heure } from '@/lib/groupage';
import { couleurDeLangue, drapeau, nomDeLangue } from '@/lib/langues';

import { Avatar } from './avatar';
import { Glyphe } from './glyphe';
import type { NomDeGlyphe } from './glyphes';

/**
 * LA BULLE — le composant le plus dense de l'interface, et celui sur lequel la
 * fidelite se juge.
 *
 * Trois choses que le rendu iOS fait et qu'on rate en le regardant vite :
 *
 * 1. Le rayon est UNIFORME (18 px, quatre coins), il n'y a NI queue, NI coin
 *    asymetrique, NI ombre, NI degrade de fond. Les ombres ont ete retirees
 *    cote iOS pour la fluidite du defilement — les reposer ici couterait des
 *    passes hors-ecran sur exactement l'appareil vise.
 * 2. L'avatar et le nom vivent DANS le pied de la bulle, pas a cote d'elle, et
 *    ne s'affichent que sur le DERNIER message d'une suite (jamais le
 *    premier), en groupe, et seulement en reception.
 * 3. La bulle ENVOYEE est l'indigo de marque, le MEME dans toutes les
 *    conversations ; seule la bulle RECUE porte l'accent de la conversation.
 */

const COCHES: Record<Etat, { nom: NomDeGlyphe; taille: number; lu: boolean } | null> = {
  'en-attente': { nom: 'clock', taille: 10, lu: false },
  envoye: { nom: 'check', taille: 10, lu: false },
  remis: { nom: 'checks', taille: 10, lu: false },
  lu: { nom: 'checks', taille: 11, lu: true },
};

const LIBELLE_ETAT: Record<Etat, string> = {
  'en-attente': 'en cours d’envoi',
  envoye: 'envoyé',
  remis: 'remis',
  lu: 'lu',
};

function Coche({ etat, deMoi }: { etat: Etat; deMoi: boolean }) {
  if (!deMoi) return null;
  const coche = COCHES[etat];
  if (!coche) return null;
  return (
    <Glyphe
      nom={coche.nom}
      taille={coche.taille}
      titre={LIBELLE_ETAT[etat]}
      {...(coche.lu ? { style: { color: 'var(--color-lu)' } } : {})}
    />
  );
}

/** La bande de drapeaux du pied — au plus QUATRE, dedupliquees. */
function Drapeaux({
  langues,
  active,
  surChoix,
}: {
  langues: readonly string[];
  active: string | null;
  surChoix: (code: string) => void;
}) {
  return (
    <span className="flex items-center gap-0.5">
      {langues.slice(0, 4).map((code) => {
        const estActive = code === active;
        return (
          <button
            key={code}
            type="button"
            onClick={() => surChoix(code)}
            aria-pressed={estActive}
            /* 22 px et non 44 : exception documentee cote iOS — elargir cette
               cible grandirait CHAQUE bulle traduite. La compensation est que
               le meme geste existe ailleurs a taille pleine (menu « Plus »). */
            className="grid size-[22px] place-items-center rounded-menu leading-none transition-colors"
            title={nomDeLangue(code)}
          >
            <span className="flex flex-col items-center gap-px">
              <span style={{ fontSize: estActive ? 12 : 11 }}>{drapeau(code)}</span>
              <span
                className="block rounded-full"
                style={{
                  width: 10,
                  height: 1.5,
                  backgroundColor: estActive ? couleurDeLangue(code) : 'transparent',
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
function TexteSecondaire({ code, texte, deMoi }: { code: string; texte: string; deMoi: boolean }) {
  const couleur = couleurDeLangue(code);
  return (
    <div className="pt-2">
      <div className="flex items-center gap-1.5" aria-hidden>
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${couleur} 40%, transparent)` }} />
        <span className="size-1 rounded-full" style={{ backgroundColor: couleur }} />
        <span className="h-px flex-1" style={{ backgroundColor: `color-mix(in srgb, ${couleur} 40%, transparent)` }} />
      </div>
      <div
        className="mt-2 rounded-menu px-2 py-2"
        style={{ backgroundColor: `color-mix(in srgb, ${couleur} 12%, transparent)` }}
      >
        <p className="flex items-center gap-1.5 text-mini font-semibold" style={{ color: couleur }}>
          <span>{drapeau(code)}</span>
          <span>{nomDeLangue(code)}</span>
        </p>
        <p
          className="mt-1 text-titre"
          lang={code}
          style={{ color: deMoi ? 'color-mix(in srgb, white 85%, transparent)' : 'var(--color-ios-encre-2)' }}
        >
          {texte}
        </p>
      </div>
    </div>
  );
}

function Citation({ citation, deMoi }: { citation: NonNullable<Message['repondA']>; deMoi: boolean }) {
  return (
    <button
      type="button"
      className="mb-1.5 flex w-full rounded-citation text-left"
      style={{ backgroundColor: deMoi ? 'var(--color-citation-moi)' : 'var(--color-citation)' }}
      aria-label={`Aller au message de ${citation.auteur}`}
    >
      <span
        className="w-1 shrink-0 rounded-full"
        style={{
          backgroundColor: deMoi ? 'color-mix(in srgb, white 70%, transparent)' : 'var(--accent)',
        }}
        aria-hidden
      />
      {/* Le nom et le texte cite COULENT DANS LE MEME PARAGRAPHE (directive
          iOS #5103) : deux lignes separees feraient de la citation un bloc
          aussi haut que le message, et c'est le message qu'on vient lire. */}
      <span className="min-w-0 py-2 pr-2.5 pl-2 text-titre">
        <span className="font-semibold" style={{ color: deMoi ? 'white' : 'var(--accent)' }}>
          {citation.auteur}{' '}
        </span>
        <span className="line-clamp-2" style={{ color: deMoi ? 'var(--color-meta-moi)' : 'var(--color-ios-encre-2)' }}>
          {citation.extrait}
        </span>
      </span>
    </button>
  );
}

function Vocal({ piece }: { piece: Extract<Piece, { genre: 'vocal' }> }) {
  const [joue, setJoue] = useState(false);
  return (
    <div className="flex items-center gap-2.5 py-1">
      <button
        type="button"
        onClick={() => setJoue((v) => !v)}
        className="grid size-[34px] shrink-0 place-items-center rounded-pastille"
        style={{ background: 'linear-gradient(135deg, var(--accent), color-mix(in srgb, var(--accent) 70%, transparent))' }}
        aria-label={joue ? 'Mettre en pause' : 'Lire le message vocal'}
      >
        <Glyphe nom="fillPlay" taille={13} className="text-white" />
      </button>
      {/* La forme d'onde est REELLE (48 barres cote iOS), jamais decorative :
          sa silhouette est ce qui permet de reperer un passage a l'oreille. */}
      <span className="flex h-6 flex-1 items-center gap-px" aria-hidden>
        {piece.ondes.map((h, i) => (
          <span
            key={i}
            className="flex-1 rounded-full"
            style={{
              height: `${Math.max(12, h * 100)}%`,
              backgroundColor: 'currentColor',
              opacity: joue && i < piece.ondes.length / 3 ? 1 : 0.45,
            }}
          />
        ))}
      </span>
      <span className="shrink-0 text-heure tabular-nums">
        {Math.floor(piece.duree / 60)}:{String(piece.duree % 60).padStart(2, '0')}
      </span>
    </div>
  );
}

function Pieces({ pieces }: { pieces: readonly Piece[] }) {
  return (
    <>
      {pieces.map((piece, i) => {
        if (piece.genre === 'vocal') return <Vocal key={i} piece={piece} />;
        if (piece.genre === 'image') {
          return (
            <div
              key={i}
              /* 300 x 240 pour une image seule, rayon 16 — la grille iOS.
                 `aspect-ratio` tient la place AVANT que l'image arrive : c'est
                 la moitie du CLS sur un reseau lent. */
              className="grid max-w-[300px] place-items-center overflow-hidden rounded-carte bg-black/40"
              style={{ aspectRatio: '300 / 240' }}
              role="img"
              aria-label={piece.description}
            >
              <Glyphe nom="image" taille={40} className="opacity-40" />
            </div>
          );
        }
        if (piece.genre === 'fichier') {
          return (
            <div key={i} className="flex items-center gap-2 py-1">
              <Glyphe nom="file" taille={24} />
              <span className="min-w-0 flex-1 truncate text-titre">{piece.nom}</span>
              <span className="text-heure opacity-70">{Math.round(piece.octets / 1024)} Ko</span>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

export function Bulle({
  place,
  langues,
  estGroupe,
}: {
  place: MessagePlace;
  langues: readonly string[];
  estGroupe: boolean;
}) {
  const { message, queue } = place;
  const deMoi = message.deMoi;
  const [langueOuverte, setLangueOuverte] = useState<string | null>(null);

  const rendu = servi(langues, message.langueOriginale, message.traductions, message.contenu);

  /**
   * L'identite ne se montre QUE : en groupe, en reception, et sur la QUEUE
   * d'une suite. Trois conditions, et c'est la troisieme qu'on oublie —
   * l'afficher sur la tete donnerait un fil visuellement juste mais different
   * d'iOS a chaque suite de deux messages.
   */
  const montreIdentite = estGroupe && !deMoi && queue;

  const languesDuPied = [...new Set([message.langueOriginale, ...message.traductions.map((t) => t.langue)])];
  const secondaire =
    langueOuverte === null
      ? null
      : langueOuverte === message.langueOriginale
        ? message.contenu
        : (message.traductions.find((t) => t.langue === langueOuverte)?.texte ?? null);

  const fondRecu = 'color-mix(in srgb, var(--accent) var(--ios-bulle-recue-opacite), transparent)';
  const filetRecu = 'color-mix(in srgb, var(--accent) var(--ios-bulle-recue-filet-opacite), transparent)';

  return (
    <div
      className={`flex ${deMoi ? 'justify-end' : 'justify-start'}`}
      /* L'espacement vertical DEPEND de la place dans le groupe : 6 px en
         queue, 2 px au milieu. C'est ce qui fait lire une suite comme un
         bloc plutot que comme des messages independants. */
      style={{ marginBottom: queue ? 6 : 2 }}
    >
      <div
        className="relative max-w-[70%] min-w-0"
        style={{ marginInlineStart: deMoi ? 50 : 0, marginInlineEnd: deMoi ? 0 : 50 }}
      >
        <div
          className="rounded-bulle px-3.5 py-2.5"
          style={
            deMoi
              ? { backgroundColor: 'var(--color-bulle-moi)', color: 'white' }
              : { backgroundColor: fondRecu, border: `1px solid ${filetRecu}`, color: 'var(--color-ios-encre)' }
          }
        >
          {message.repondA ? <Citation citation={message.repondA} deMoi={deMoi} /> : null}
          {message.pieces ? <Pieces pieces={message.pieces} /> : null}
          {rendu.texte ? (
            /* Le contenu AFFICHE est deja la traduction preferee, rendu
               exactement comme du contenu natif — ni encadre, ni italique, ni
               annonce. C'est le Prisme : la traduction ne se signale que par
               la pastille du pied. `lang` porte la langue REELLEMENT servie,
               pour que la synthese vocale la prononce juste. */
            <p className="text-bulle leading-[1.35] whitespace-pre-wrap" lang={rendu.langue}>
              {rendu.texte}
            </p>
          ) : null}

          {secondaire !== null ? (
            <TexteSecondaire code={langueOuverte as string} texte={secondaire} deMoi={deMoi} />
          ) : null}

          <div
            className={`flex items-start gap-2 ${montreIdentite ? 'pt-2' : 'pt-1'}`}
            style={{ color: deMoi ? 'var(--color-meta-moi)' : 'var(--color-meta)' }}
          >
            {montreIdentite ? (
              <Avatar
                initiales={message.auteur.initiales}
                teinte={message.auteur.teinte}
                taille={32}
                nom={message.auteur.nom}
              />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              {montreIdentite ? (
                <span className="text-titre font-semibold" style={{ color: 'var(--color-ios-encre)' }}>
                  {message.auteur.nom}
                </span>
              ) : null}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  className="grid size-[22px] place-items-center rounded-menu"
                  style={{ color: 'var(--color-i400)' }}
                  aria-label="Langues de ce message"
                >
                  <Glyphe nom="translate" taille={12} />
                </button>
                <Drapeaux
                  langues={languesDuPied}
                  active={langueOuverte}
                  surChoix={(code) => setLangueOuverte((v) => (v === code ? null : code))}
                />
                <span className="flex-1" />
                <time className="text-heure font-medium tabular-nums" dateTime={message.envoyeA}>
                  {heure(message.envoyeA)}
                </time>
                <Coche etat={message.etat} deMoi={deMoi} />
              </div>
            </div>
          </div>
        </div>

        {message.reactions?.length ? (
          /* Les reactions se posent en DEBORD du coin bas, du cote OPPOSE au
             bord d'ecran : a moitie sous la bulle, a moitie dehors. Les
             centrer sous la bulle les ferait passer pour un contenu. */
          <div
            className={`absolute flex gap-1 ${deMoi ? 'left-0 -translate-x-1' : 'right-0 translate-x-1'}`}
            style={{ bottom: -8 }}
          >
            {message.reactions.map((r) => (
              <span
                key={r.glyphe}
                className="flex items-center gap-0.5 rounded-pastille px-1.5 py-0.5 text-coche"
                style={{
                  backgroundColor: 'var(--color-ios-carte)',
                  border: '1px solid var(--color-liseré)',
                }}
              >
                <span aria-hidden>{r.glyphe}</span>
                <span className="tabular-nums opacity-70">{r.compte}</span>
                <span className="hors-ecran">{r.compte} réaction{r.compte > 1 ? 's' : ''} {r.glyphe}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
