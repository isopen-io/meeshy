import { Suspense, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useStore } from 'zustand';

import { apiDeps } from '@/lib/api/deps';
import { sessionStore } from '@/lib/api/session';
import { MOOD_NOTE_MAX_LENGTH } from '@/lib/api/status';
import { performMoodPost } from '@/lib/api/status-actions';
import { useStatusMoods } from '@/lib/api/query';
import { resolveViewer } from '@/lib/api/viewer';
import { translate } from '@/lib/i18n-catalog';
import { moodComposeText } from '@/lib/i18n-mood-compose-catalog';
import { currentInterfaceLanguage, type InterfaceLanguage } from '@/lib/interface-language';
import { useOnline } from '@/lib/net/online';
import { navigate } from '@/lib/router';
import { useMentionSource } from '@/lib/view/mention-source';
import { moodPublishStep } from '@/lib/view/mood-bare-publish';
import { useMentionField } from '@/lib/view/use-mention-field';
import { ComposerEmojiSheet } from '@/components/composer-sheets-lazy';
import { Glyph } from '@/components/glyph';
import { MentionFieldPanel } from '@/components/mention-suggestions';
import { selfRailEntry } from '@/lib/view/story-rail-self';
import { Link, href } from '@/routes/route-table';

/**
 * **MON HUMEUR** (#6150) — la seconde porte de ma cellule du rail, à son
 * adresse propre (`/status/new`).
 *
 * ## DÉLIBÉRÉMENT MINIMAL — c'est la directive, pas une économie
 *
 * Directive porteur du 2026-09-17 : « Ce flow doit pas etre lourd, des choses
 * simples facilement implémentables et répliquant ce qui existe sur iOS ». On
 * prend donc de `ComposerMoodSurface.swift` (1 108 lignes) ses DEUX pièces
 * utiles — la grille d'emojis et un mot court — et rien d'autre. Ce que cet
 * écran ne fait PAS est une issue de suivi, jamais une dette silencieuse.
 *
 * ## POURQUOI UNE ADRESSE, PAS UN MODE DE `/stories/new`
 *
 * Une humeur n'est pas une story : `Post.type = 'STATUS'`, corpus distinct côté
 * passerelle (`?scope=statuses`), ni scène, ni durée, ni média. Et le bouton
 * système « retour » doit refermer la composition d'humeur SEULE — un mode
 * d'un autre écran ferait remonter d'un cran de trop.
 *
 * ## CE QUI SE VOIT AVANT LE RÉSEAU
 *
 * L'humeur EN COURS est lue depuis le cache que le rail alimente déjà
 * (`useStatusMoods`, même clé) : arriver ici ne déclenche aucune requête et
 * n'affiche aucun squelette, et l'emoji courant est pré-sélectionné.
 * `performMoodPost` écrit dans ce même cache avant d'appeler le réseau — la
 * pastille du rail a changé avant que l'écran ne se referme.
 */

/**
 * LES HUMEURS OFFERTES — celles que le schéma cite en exemple
 * (`Post.moodEmoji`, `schema.prisma` : « ex: "😴", "🎉", "💪", "☕" ») et leurs
 * voisines immédiates. Une grille FERMÉE plutôt qu'un sélecteur d'emoji
 * complet : douze choix se touchent sans réfléchir, et zéro configuration
 * obligatoire (dimension 7). Qui veut autre chose ouvre la feuille d'emojis
 * du dépôt par `MoodMoreButton` (#10527).
 */
export const MOOD_CHOICES: readonly string[] = [
  '😊',
  '🎉',
  '💪',
  '☕',
  '😴',
  '🤔',
  '🔥',
  '😌',
  '🥳',
  '😢',
  '❤️',
  '🚀',
];

export function StatusComposeHeader({ language }: { readonly language: InterfaceLanguage }) {
  return (
    <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
      <Link
        to="list"
        /* `pending.back` — PAS une clé à moi : « Revenir aux conversations »
           dit exactement ce que ce lien fait (`to="list"`), et c'est déjà celle
           que `StoriesHeader` emploie pour le même retour. Une clé de plus
           n'aurait ajouté que du poids au catalogue et une seconde vérité à
           traduire dans sept langues. */
        aria-label={translate(language, 'pending.back')}
        className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ outlineColor: 'var(--color-ios-brand)' }}
      >
        <span aria-hidden="true" className="text-lg leading-none">‹</span>
      </Link>
      <h1 className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {translate(language, 'status.compose.title')}
      </h1>
    </header>
  );
}

/**
 * LA GRILLE — un `radiogroup`, jamais douze boutons indépendants : ce que
 * l'utilisateur fait ici est CHOISIR UN parmi douze, et c'est ce rôle qui
 * l'annonce juste au lecteur d'écran et lui donne la navigation par flèches
 * que le clavier attend d'un choix exclusif.
 */
export function MoodGrid({
  language,
  selected,
  onSelect,
}: {
  readonly language: InterfaceLanguage;
  readonly selected: string | undefined;
  readonly onSelect: (emoji: string) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={translate(language, 'status.compose.pick')}
      data-mood-grid
      className="grid grid-cols-4 gap-3 px-4 py-2 sm:grid-cols-6"
    >
      {MOOD_CHOICES.map((emoji) => {
        const actif = emoji === selected;
        return (
          <button
            key={emoji}
            type="button"
            role="radio"
            aria-checked={actif}
            aria-label={emoji}
            data-mood-choice={emoji}
            onClick={() => {
              onSelect(emoji);
            }}
            className="grid place-items-center rounded-card focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minWidth: 44,
              minHeight: 44,
              aspectRatio: '1',
              fontSize: 26,
              outlineColor: 'var(--color-ios-brand)',
              background: actif ? 'var(--color-ios-brand)' : 'var(--color-ios-card)',
              boxShadow: actif ? '0 0 0 2px var(--color-ios-brand)' : 'none',
            }}
          >
            <span aria-hidden="true">{emoji}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * **UN AUTRE EMOJI QUE CEUX PROPOSÉS** (#10527) — la porte vers la feuille
 * d'emojis du dépôt (`ComposerEmojiSheet`, celle du composeur et des
 * commentaires : tous les emojis, par catégories, avec recherche et récents
 * depuis #10531). HORS du `radiogroup` : ce
 * bouton n'est pas un treizième choix, il en ouvre d'autres.
 */
export function MoodMoreButton({
  language,
  onOpen,
}: {
  readonly language: InterfaceLanguage;
  readonly onOpen: () => void;
}) {
  const label = moodComposeText(language, 'status.compose.more');
  return (
    <div className="flex px-4 pb-1">
      <button
        type="button"
        data-mood-more
        aria-label={label}
        aria-haspopup="dialog"
        onClick={onOpen}
        className="inline-flex items-center gap-2 rounded-chip px-3 text-check focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          minWidth: 44,
          minHeight: 44,
          color: 'var(--color-ios-ink-2)',
          backgroundColor: 'var(--color-ios-card)',
          outlineColor: 'var(--color-ios-brand)',
        }}
      >
        <Glyph name="plus" size={16} />
        <span aria-hidden="true">{label}</span>
      </button>
    </div>
  );
}

/**
 * **« SANS UN PETIT MOT ? »** (#10527) — la question prend la PLACE du bouton
 * Publier, là où le doigt se trouve déjà : chacune des deux réponses est à un
 * geste. Le focus va à « Ajouter un mot », la réponse qui ne publie rien, et
 * c'est lui qui fait lire la question au lecteur d'écran (`aria-labelledby`).
 */
export function MoodBareQuestion({
  language,
  onAddWord,
  onPublish,
}: {
  readonly language: InterfaceLanguage;
  readonly onAddWord: () => void;
  readonly onPublish: () => void;
}) {
  const titleId = useId();
  const addRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    addRef.current?.focus();
  }, []);
  return (
    <div role="alertdialog" aria-labelledby={titleId} data-mood-bare className="mb-3 flex flex-col gap-2">
      <p id={titleId} className="text-center text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {moodComposeText(language, 'status.compose.bare.ask')}
      </p>
      <div className="flex gap-2">
        <button
          ref={addRef}
          type="button"
          data-mood-bare-add
          onClick={onAddWord}
          className="grid flex-1 place-items-center rounded-chip px-4 py-3 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, background: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          {moodComposeText(language, 'status.compose.bare.add')}
        </button>
        <button
          type="button"
          data-mood-bare-publish
          onClick={onPublish}
          className="grid flex-1 place-items-center rounded-chip px-4 py-3 text-body font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{
            minHeight: 44,
            color: 'var(--color-ios-ink)',
            backgroundColor: 'var(--color-ios-card)',
            outlineColor: 'var(--color-ios-brand)',
          }}
        >
          {moodComposeText(language, 'status.compose.bare.publish')}
        </button>
      </div>
    </div>
  );
}

const DIRECTORY = { directory: true } as const;

export default function StatusComposeScreen() {
  const language = currentInterfaceLanguage();
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiDeps.source, session }), [session]);
  const moods = useStatusMoods();
  const queryClient = useQueryClient();
  const online = useOnline();

  /* MON HUMEUR COURANTE, par la MÊME loi que la pastille du rail — jamais une
     seconde lecture du corpus, qui pourrait un jour élire une autre ligne que
     celle que la pastille montre. */
  const courante = useMemo(
    () => selfRailEntry({ viewerId: viewer.id ?? undefined, groups: [], moods: moods.data ?? [], now: Date.now() })?.moodEmoji,
    [viewer.id, moods.data],
  );

  const [choisi, setChoisi] = useState<string | undefined>(undefined);
  const [note, setNote] = useState('');
  /* LA NOTE D'UNE HUMEUR EST LE `content` DU POST MOOD — la passerelle y lit
     les mentions comme dans toute publication (#7846). Pas encore publiée :
     la recherche passe par l'annuaire. */
  const noteRef = useRef<HTMLInputElement>(null);
  const mentionSource = useMentionSource(DIRECTORY);
  const mention = useMentionField({ text: note, fieldRef: noteRef, onText: setNote, source: mentionSource });
  const [enVol, setEnVol] = useState(false);
  const [refus, setRefus] = useState(false);
  const [feuille, setFeuille] = useState(false);
  const [demande, setDemande] = useState(false);

  const selection = choisi ?? courante;
  const viewerId = viewer.id ?? undefined;
  /**
   * **HORS LIGNE, PUBLIER EST INERTE — loi 4, un contrôle existe s'il a un
   * effet.** `performMoodPost` refuse hors ligne (rien qu'on ne puisse tenir) :
   * laisser le bouton ACTIF donnait un clic qui ne produisait strictement rien
   * de visible — ni humeur, ni message, ni mouvement. Le bouton s'éteint donc
   * avec le réseau, et l'état hors ligne dessiné juste au-dessus dit pourquoi ;
   * l'inverse — un bouton vif au-dessus d'un message « hors ligne » — aurait
   * fait porter l'explication par un texte que personne ne lit avant d'avoir
   * cliqué.
   */
  const publiable = selection !== undefined && viewerId !== undefined && !enVol && online;

  /* LA QUESTION NE VIT QUE TANT QU'ELLE A UN SENS : un mot écrit, le réseau
     perdu ou un envoi en vol la retirent sans qu'on ait à la refermer. */
  const question = demande && publiable && moodPublishStep({ note }) === 'ask';

  const valider = () => {
    if (moodPublishStep({ note }) === 'ask') {
      setDemande(true);
      return;
    }
    void publier();
  };

  const publier = async () => {
    if (selection === undefined || viewerId === undefined) return;
    setDemande(false);
    setEnVol(true);
    setRefus(false);
    const out = await performMoodPost({
      moodEmoji: selection,
      note,
      deps: {
        source: apiDeps.source,
        transport: apiDeps.transport,
        queryClient,
        viewerId,
        isOnline: () => online,
      },
    });
    setEnVol(false);
    if (out.status === 'saved') {
      navigate(href('list'), true);
      return;
    }
    if (out.status === 'refused') setRefus(true);
  };

  return (
    <main className="flex h-dvh flex-col overflow-hidden pt-safe">
      <StatusComposeHeader language={language} />

      <div className="scrollbar-none flex-1 overflow-y-auto pb-safe">
        {/* L'APERÇU — ce qui sera posé, gros, avant de publier. Sans lui, le
            seul retour d'un choix est un cadre coloré de 44 px. */}
        <p data-mood-preview className="py-4 text-center" style={{ fontSize: 56, lineHeight: 1 }}>
          <span aria-hidden="true">{selection ?? '\u{1F4AD}'}</span>
        </p>

        <MoodGrid language={language} selected={selection} onSelect={setChoisi} />
        <MoodMoreButton
          language={language}
          onOpen={() => {
            setFeuille(true);
          }}
        />

        <div className="relative px-4 py-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
              {translate(language, 'status.compose.note')}
            </span>
            <input
              ref={noteRef}
              data-mood-note
              type="text"
              value={note}
              maxLength={MOOD_NOTE_MAX_LENGTH}
              placeholder={translate(language, 'status.compose.note')}
              onInput={(e) => {
                setNote(e.currentTarget.value);
                mention.syncCaret(e.currentTarget);
              }}
              onFocus={mention.onFocus}
              onBlur={mention.onBlur}
              onClick={(e) => mention.syncCaret(e.currentTarget)}
              onKeyUp={(e) => mention.syncCaret(e.currentTarget)}
              onKeyDown={(e) => void mention.onKeyDown(e.nativeEvent)}
              {...mention.aria}
              className="w-full rounded-card px-3 py-2.5 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{
                backgroundColor: 'var(--color-ios-card)',
                color: 'var(--color-ios-ink)',
                outlineColor: 'var(--color-ios-brand)',
              }}
            />
          </label>
          <MentionFieldPanel field={mention} language={language} placement="below" />
        </div>

        {/* LES DEUX ÉTATS DESSINÉS — hors ligne AVANT le geste (on ne promet
            rien qu'on ne puisse tenir), refus APRÈS. */}
        {online ? null : (
          <p role="status" data-mood-offline className="px-4 pb-2 text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
            {translate(language, 'status.compose.offline')}
          </p>
        )}
        {refus ? (
          <p role="alert" data-mood-error className="px-4 pb-2 text-check" style={{ color: 'var(--color-ios-danger, #f33)' }}>
            {translate(language, 'status.compose.error')}
          </p>
        ) : null}
      </div>

      <div className="shrink-0 px-4 pb-safe">
        {question ? (
          <MoodBareQuestion
            language={language}
            onAddWord={() => {
              setDemande(false);
              noteRef.current?.focus();
            }}
            onPublish={() => {
              void publier();
            }}
          />
        ) : (
          <button
            type="button"
            data-mood-publish
            disabled={!publiable}
            onClick={() => {
              valider();
            }}
            className="mb-3 grid w-full place-items-center rounded-chip px-5 py-3 text-body font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              background: publiable ? 'var(--color-ios-brand)' : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
              outlineColor: 'var(--color-ios-brand)',
            }}
          >
            {translate(language, enVol ? 'status.compose.publishing' : 'status.compose.publish')}
          </button>
        )}
      </div>

      {feuille ? (
        <Suspense fallback={null}>
          <ComposerEmojiSheet
            title={moodComposeText(language, 'status.compose.more')}
            onPick={(emoji) => {
              setFeuille(false);
              setChoisi(emoji);
            }}
            onClose={() => {
              setFeuille(false);
            }}
          />
        </Suspense>
      ) : null}
    </main>
  );
}
