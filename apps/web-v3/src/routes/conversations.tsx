import { useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand/react';

import { Avatar } from '@/components/avatar';
import { Glyph } from '@/components/glyph';
import { LensRow } from '@/components/lens-row';
import { LensSection } from '@/components/lens-sticker';
import { LensSkeletonRows } from '@/components/lens-skeleton';
import { useScene } from '@/lib/lens/scene';
import { apiConfig } from '@/lib/api/config';
import { rowAction, useConversations } from '@/lib/api/query';
import type { Conversation } from '@/lib/api/types';
import { sessionStore } from '@/lib/api/session';
import { resolveViewer } from '@/lib/api/viewer';
import { accentOf } from '@/lib/accent';
import { conversationStore, effectiveFlagsOf, effectiveUnreadOf } from '@/lib/conversation-store';
import { applyFilter, emptinessOf, FILTER_LABELS, LIST_FILTERS, orderConversations, type ListFilter } from '@/lib/lens/filters';
import { partagerInvitation, RETOUR_INVITATION } from '@/lib/view/invitation';
import { QuickActions, type QuickAction } from '@/components/quick-actions';
import { resolveLensSections } from '@/lib/lens/sections';
import { useOnline } from '@/lib/net/online';
import { useReaderLanguages } from '@/lib/view/use-reader';
import { useMinute } from '@/lib/view/use-minute';
import { initialsOf, titleOf } from '@/lib/view/conversation';
import { Link } from '@/routes/route-table';

/**
 * L'ECRAN DE LISTE.
 *
 * Anatomie reprise d'iOS (`ConversationListView`) : un en-tete FLOTTANT (il n'y
 * a aucune barre de navigation systeme dans l'app iOS), un rail de stories, une
 * rangee de filtres, l'empilement de cartes, et une barre de recherche EN BAS —
 * pas en haut. Ce dernier point est le plus contre-intuitif pour qui vient du
 * web, et c'est un choix d'accessibilite : sur un telephone tenu d'une main, le
 * haut de l'ecran est hors de portee du pouce.
 */

/**
 * LA HAUTEUR RÉSERVÉE DU RAIL (#5650, F5/§5 étape 9, revue-correction) —
 * `check-gateway-build.mjs` comparait l'`offsetTop` de la première rangée
 * avant/après résolution et rougissait de 130 px : le rail (avatar 72 +
 * liséré + libellé) se PEIGNAIT VIDE tant que `list.data === undefined`
 * (`conversations` vaut `[]`), puis SAUTAIT à sa hauteur réelle une fois les
 * conversations arrivées.
 *
 * La hauteur se réserve par une TUILE FANTÔME — la MÊME boîte que la vraie,
 * rendue invisible — jamais par un nombre écrit à la main (même discipline
 * que `SkeletonSectionStub`, `components/lens-skeleton.tsx`, et D-4 : aucune
 * cote de géométrie ne s'écrit ici). Un `minHeight: 130` aurait deux torts
 * qu'une tuile n'a pas : il fige une cote qui dérive dès que l'avatar ou la
 * typographie du libellé bougent, et il creuse un TROU de 130 px au-dessus
 * de l'état vide d'un compte qui n'a encore AUCUNE conversation — le tout
 * premier écran d'un nouvel arrivant.
 */
function RailPlaceholderTile() {
  return (
    <li aria-hidden="true" className="flex w-[88px] shrink-0 flex-col items-center gap-1.5" style={{ visibility: 'hidden' }}>
      <span className="grid place-items-center rounded-chip p-[2.5px]">
        <Avatar initials="" color="var(--color-ios-card)" size={72} />
      </span>
      <span className="w-full truncate text-center text-check">&nbsp;</span>
    </li>
  );
}

/**
 * `rowAction` (#5650, F2/F4/§5 étape 9) — RÉFÉRENCE DE MODULE STABLE
 * importée de `lib/api/query.ts` (« l'adaptateur UNIQUE ») : elle applique
 * l'override optimiste PUIS, en source `gateway`, appelle le port réel et
 * arbitre l'issue (`performRowAction`) — `handleRowAction` (module-level, ce
 * fichier) n'existe plus : sa seule responsabilité (l'override immédiat)
 * vit désormais avec l'appel réseau qui la CONFIRME ou la DÉFAIT, un seul
 * geste au lieu de deux fils divergents.
 */

/**
 * L'ÉCHEC DE LA LISTE, à CACHE VIDE — iOS `.syncError`
 * (`ConversationListView.swift:1761-1793`) : icône, titre, sous-titre,
 * « Réessayer » ⇒ `refetch()`, plus la phrase « Hors ligne » quand c'est le
 * cas (même forme que `ProgressionError`, `routes/progression.tsx`).
 *
 * Rendu comme UN `<li>`, jamais un conteneur à part : cet écran garde
 * `<ul ref={frame} id="contenu">` MONTÉ EN PERMANENCE (chargement, échec,
 * contenu réel confondus) — c'est ce qui laisse `useScene(frame)` attacher
 * ses écouteurs UNE fois, au montage, sans jamais les perdre quand l'état
 * bascule (§5 étape 9, revue-correction : un `<ul>` REMPLACÉ par un autre
 * nœud laissait la scène de perspective orpheline — mesuré par
 * `check-lens.mjs`, six invariants rompus).
 */
/** Référence STABLE — un `[]` littéral par rendu changerait l'identité de
 * `conversations` à chaque image et défairait les mémos qui en dépendent. */
const EMPTY_CONVERSATIONS: readonly Conversation[] = [];

/**
 * `content-center` ET NON `place-items-center` SEUL (#5650, revue-correction)
 * — `grid flex-1 place-items-center` centre chaque enfant DANS SA RANGÉE, et
 * les rangées implicites se répartissent sur toute la hauteur : à l'écran,
 * l'icône était collée en haut, le titre au tiers, le bouton en bas — quatre
 * éléments éparpillés au lieu d'un bloc. `align-content: center` TASSE les
 * rangées au centre ; `gap-3` redevient l'espacement réel entre elles.
 */
function ListError({ online, onRetry }: { readonly online: boolean; readonly onRetry: () => void }) {
  return (
    <li role="alert" className="grid flex-1 content-center justify-items-center gap-3 px-6 text-center">
      <span style={{ color: 'var(--color-error)' }}>
        <Glyph name="warningCircle" size={28} />
      </span>
      <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
        {online ? 'Impossible de charger vos conversations' : 'Hors ligne'}
      </p>
      <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
        {/*
          UNE PHRASE DE PRODUIT, JAMAIS LE MESSAGE DU SERVEUR
          (revue-correction #5650) — cette ligne rendait `error.message`,
          c'est-à-dire la CHAÎNE PLATE que la passerelle sert
          (`sendError`) : « Internal server error », « Unauthorized access
          to this conversation »… de l'ANGLAIS technique sur le premier
          écran d'un lecteur francophone, et une fuite d'interne quand la
          chaîne nomme une contrainte ou une table. iOS ne fait pas
          autrement : `conversations.error.title` + un sous-titre FIXE
          (`ConversationListView.swift:1761-1793`), jamais l'erreur brute.
        */}
        {online
          ? 'Réessayez dans un instant — vos messages sont en sécurité.'
          : 'Vos conversations s’afficheront à la reconnexion.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="grid place-items-center rounded-chip px-5 text-body font-semibold text-white"
        style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
      >
        Réessayer
      </button>
    </li>
  );
}

/**
 * **Les portes RÉELLES du démarrage — et elles seules.**
 *
 * iOS en peint NEUF (`ConversationListQuickActions`) : chercher des membres,
 * voir ses contacts, ses affiliations, écrire, story, mood, post, inviter,
 * lien raccourci. La v3.1 n'a de route pour AUCUNE d'entre elles
 * (`route-table.tsx` : `list`, `thread`, `login`, `signup`, `progression`) —
 * les porter toutes ici peindrait huit contrôles qui mentent, c'est-à-dire
 * exactement ce que la revue #5559 a dû DÉFAIRE sur l'en-tête de cet écran.
 *
 * Reste celle qui n'a besoin d'aucune route pour AGIR : inviter. C'est aussi
 * la seule des quatre que l'état vide promettait (« un message, une story, un
 * mood, un post — ou invitez vos amis ») qu'on puisse tenir aujourd'hui ; la
 * phrase a donc été réécrite pour ne plus promettre les trois autres.
 *
 * Les huit portes manquantes sont un chantier de parité, pas un oubli : elles
 * arriveront avec leurs écrans et s'ajouteront ICI — une ligne par porte,
 * impossible à ajouter sans son effet puisque `run` n'est pas optionnel.
 */
const ACTIONS_DE_DEMARRAGE: readonly QuickAction[] = [
  {
    key: 'inviter',
    label: 'Inviter des amis',
    hint: 'Partagez votre lien Meeshy : c’est ainsi que naît une première conversation.',
    glyph: 'linkSimple',
    run: async () => RETOUR_INVITATION[await partagerInvitation(window.location.origin)],
  },
];

export default function ConversationsScreen() {
  const [filter, setFilter] = useState<ListFilter>('all');
  const [search, setSearch] = useState('');
  const frame = useRef<HTMLUListElement | null>(null);
  const { focus, level } = useScene(frame);
  const online = useOnline();

  /**
   * LA SOURCE (#5650) — `useConversations()` sert les fixtures OU la
   * passerelle selon `apiConfig.source`, résolu à la CONSTRUCTION. `session`
   * et `viewer` suivent la même règle que `thread.tsx` (`resolveViewer`,
   * `lib/api/viewer.ts`) : en fixtures, l'identité du POC ; en gateway,
   * la session RÉELLE.
   */
  const list = useConversations();
  /** `loading` — CACHE VIDE ET requête en vol, jamais « une requête est en
   * cours » : un rafraîchissement de fond sur un cache PLEIN ne remet ni
   * squelette ni `aria-busy` (§ Instant App Principles). Et `isError` sur un
   * cache vide est un ÉCHEC, pas un chargement — annoncer « Chargement des
   * conversations » au-dessus d'un `role="alert"` masquerait l'alerte pour
   * un lecteur d'écran, qui n'annonce pas le contenu d'une région occupée. */
  const loading = list.data === undefined && !list.isError;
  const session = useStore(sessionStore, (s) => s.session);
  const viewer = useMemo(() => resolveViewer({ source: apiConfig.source, session }), [session]);
  const { languages: readerLanguages } = useReaderLanguages();
  const conversations = list.data ?? EMPTY_CONVERSATIONS;
  const overrides = useStore(conversationStore, (s) => s.overrides);
  /** Le corpus du RAIL — même précédence iOS que `applyFilter` (l'archivé
   * sort), mémorisé parce qu'il se lit DEUX fois par rendu (la décision de
   * peindre la région, puis les tuiles). */
  const railConversations = useMemo(
    () => conversations.filter((c) => !effectiveFlagsOf(c, overrides).isArchived),
    [conversations, overrides],
  );

  /**
   * LES SECTIONS (#5694, écart 6) — `resolveLensSections` re-partitionne le
   * corpus FILTRÉ (recherche et archives déjà réglées par `applyFilter`) en
   * ÉPINGLES → EN DIRECT → AUJOURD'HUI → HIER → CETTE SEMAINE → PLUS ANCIEN ;
   * chaque section est déjà TRIÉE en interne (`sortConversations`), donc
   * l'ordre issu de `orderConversations` ne sert plus qu'à `emptinessOf` et
   * à la queue de liste — jamais au rendu, désormais porté par les sections.
   * `now`/`timeZone` sont INJECTÉS depuis la peau, jamais lus dans la loi.
   *
   * LES TROIS PASSES SONT MÉMORISÉES ENSEMBLE (revue #5694). Cet écran se
   * re-rend à CHAQUE élection de la scène — plusieurs fois par seconde
   * pendant un défilement — et à chaque entrée/sortie de scène. Refaire à
   * chacun de ces rendus un filtre, un tri et un partitionnement, tous les
   * trois en O(n log n) sur le corpus ENTIER, c'est la dépense qu'on ne
   * peut pas se permettre le jour où la liste sert des centaines de
   * conversations — et c'est la forme que les trente écrans suivants
   * copieront. Les entrées réelles sont peu nombreuses et stables : le
   * filtre, la recherche, les remplacements optimistes du magasin, le fuseau
   * — et LA MINUTE, sans laquelle les sections temporelles gèleraient au
   * montage et « Aujourd'hui » resterait « Aujourd'hui » après minuit.
   */
  const timeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const minute = useMinute();
  const { visible, emptiness, sections } = useMemo(() => {
    const kept = applyFilter({ conversations, filter, search, viewerId: viewer.id ?? '', overrides });
    const ordered = orderConversations(kept, overrides);
    return {
      visible: ordered,
      emptiness: emptinessOf(conversations, ordered),
      sections: resolveLensSections({ conversations: kept, overrides, now: new Date(), timeZone }),
    };
    // `minute` n'entre dans AUCUNE des expressions ci-dessus : c'est
    // volontaire — elle y est la clé qui fait ré-évaluer `new Date()`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations, filter, search, viewer.id, overrides, timeZone, minute]);

  return (
    /* `pt-safe` : l'encoche HAUTE est portee par le CADRE de l'ecran, dans ses
       100dvh (box-sizing: border-box) — jamais par `<body>`, qui l'AJOUTAIT
       et poussait la barre de recherche hors du cadre (#5604, app.css). */
    <div className="flex h-dvh flex-col overflow-hidden pt-safe">
      <header className="flex shrink-0 items-center gap-3 px-4 pt-3 pb-2">
        <h1
          className="flex-1 text-large-title font-bold"
          style={{
            background: 'linear-gradient(90deg, var(--color-ios-brand), var(--color-ios-brand-deep))',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          Meeshy Chats
        </h1>
        {/*
          L'ENTRÉE DU TABLEAU DE BORD « PROGRESSION » (#5547). Sur iOS elle vit
          dans le profil et les réglages (#5698) ; la v3.1 n'a pas encore de
          `/me` (inventaire de parité, V4.0.0) — l'en-tête de la liste est donc
          sa porte jusque-là, à la place où l'utilisateur la chercherait sans
          le savoir. Un `Link`, jamais un bouton qui navigue : `href`, nouvel
          onglet, préchargement à l'intention (`router.tsx` § Link).
        */}
        <Link
          to="progression"
          aria-label="Progression — badges, niveau et série"
          className="grid size-11 shrink-0 place-items-center rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ color: 'var(--color-ios-brand)', outlineColor: 'var(--color-ios-brand)' }}
        >
          <span
            className="grid size-8 place-items-center rounded-chip"
            style={{ backgroundColor: 'color-mix(in srgb, var(--color-ios-brand) 14%, transparent)' }}
          >
            <Glyph name="trophy" size={16} />
          </span>
        </Link>
        {/*
          #5559 revue-correction, défaut 2 : « Créer un lien de partage » et
          « Nouvelle conversation » n'avaient AUCUN gestionnaire — aucune
          route ne les sert aujourd'hui (`route-table.tsx` ne déclare que
          `list`/`thread`). Deux boutons qui ne font RIEN au clic sur
          l'écran PHARE, à côté d'un écran dont tout le reste agit, sont
          pires qu'une absence : ils PROMETTENT un effet qu'ils ne tiennent
          pas. Retirés jusqu'à leur porte réelle (issues compagnon à ouvrir :
          lien de partage — la passerelle expose déjà la création, l'effet
          minimal est une copie presse-papier avec retour visible ; nouvelle
          conversation — un flux de composition à construire) plutôt que de
          laisser deux contrôles mentir.
        */}
      </header>

      {/*
        LE RAIL D'ACCÈS RAPIDE : avatars 88 px, anneau de marque quand non lu.
        #5559 revue-correction, défauts 3 et 9.

        (3) CE N'ÉTAIT NI DES STORIES NI UN CONTRÔLE : quatre `<li>` nus,
        aucun `<a>` ni `<button>`, un anneau qui promettait un contenu que
        rien n'ouvrait. En l'absence d'une route « stories » (issue
        compagnon à ouvrir), la seule destination RÉELLE de chaque avatar
        aujourd'hui est SON FIL — chaque tuile est donc un `Link` vers
        `thread`, exactement ce qu'elle ouvre déjà si on tape la ligne
        correspondante plus bas.

        (9) LE RAIL LIT DÉSORMAIS LA MÊME SOURCE QUE LA LISTE — `CONVERSATIONS`
        filtrées du corpus ARCHIVÉ (`effectiveFlagsOf(...).isArchived`, même
        précédence iOS `:598-601` que `applyFilter`) et `effectiveUnreadOf`
        pour l'anneau. Avant ce correctif, le rail lisait le fil BRUT et
        `unreadOf` seul : marquer « Lu » vidait le badge de la ligne sans
        jamais éteindre l'anneau du rail, archiver sortait la conversation de
        la liste sans jamais la retirer du rail — deux vérités pour un même
        état, sur le MÊME écran.
      */}
      {/*
        LE RAIL NE SE PEINT PAS QUAND IL N'A RIEN À MONTRER (revue-correction
        #5650) — un compte sans conversation, ou dont tout est archivé, ne
        garde ni région étiquetée vide pour le lecteur d'écran ni bande
        blanche au-dessus de son état vide. Pendant le CHARGEMENT en
        revanche, il se peint avec sa tuile fantôme : c'est ce qui tient
        l'`offsetTop` du contenu identique avant et après la résolution.
      */}
      {loading || railConversations.length > 0 ? (
      <section aria-label="Accès rapide aux conversations" className="shrink-0 overflow-x-auto pb-1">
        <ul className="flex gap-3 px-4 py-2">
          {railConversations.length === 0 ? <RailPlaceholderTile /> : null}
          {railConversations.map((c) => {
            const title = titleOf(c, viewer.id ?? '');
            return (
              <li key={c.id} className="flex w-[88px] shrink-0 flex-col items-center gap-1.5">
                <Link
                  to="thread"
                  params={{ conversation: c.id }}
                  aria-label={title}
                  className="flex flex-col items-center gap-1.5 rounded-chip focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{ outlineColor: 'var(--color-ios-brand)' }}
                >
                  <span
                    className="grid place-items-center rounded-chip p-[2.5px]"
                    style={{
                      background:
                        effectiveUnreadOf(c, overrides) > 0
                          ? 'var(--color-ios-brand)'
                          : 'color-mix(in srgb, var(--color-ios-ink-3) 40%, transparent)',
                    }}
                  >
                    <Avatar initials={initialsOf(title)} color={accentOf(c)} size={72} />
                  </span>
                  <span className="w-full truncate text-center text-check" style={{ color: 'var(--color-ios-ink-2)' }}>
                    {title}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
      ) : null}

      <nav aria-label="Filtres" className="shrink-0 overflow-x-auto">
        <ul className="flex gap-2 px-4 py-1.5">
          {LIST_FILTERS.map((f) => {
            const active = f === filter;
            return (
              <li key={f}>
                <button
                  type="button"
                  onClick={() => setFilter(f)}
                  aria-pressed={active}
                  className="rounded-chip px-3 py-1.5 text-title font-medium whitespace-nowrap transition-colors"
                  style={
                    active
                      ? { backgroundColor: 'var(--color-ios-brand)', color: 'white' }
                      : {
                          backgroundColor: 'var(--color-ios-card)',
                          color: 'var(--color-ios-ink-2)',
                          border: '0.5px solid var(--color-edge)',
                        }
                  }
                >
                  {FILTER_LABELS[f]}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/*
        AUCUN `gap` : l'espacement des cartes est ce qui les faisait lire comme
        des boîtes. La Lentille est un flux — les rangées se touchent, et c'est
        la perspective qui les sépare.
      */}
      {/*
        `pt-2` NE VIT PLUS ICI (#5694, correction défaut 3) — c'est `LensSection`
        qui ouvre l'espace au-dessus de CHAQUE en-tête, marge comprise pour la
        première. Un `padding-top` sur ce scrollport décalait le repère de
        `position: sticky` (borné à sa boîte de PADDING) à `y = 8` au lieu de
        `y = 0` : 8 px de rangée défilaient hors de portée de l'en-tête collant
        et s'y peignaient tranchés au-dessus. Voir le doc-comment de `LensSection`.
      */}
      {/*
        `<ul ref={frame} id="contenu">` reste MONTÉ EN PERMANENCE — voir le
        doc-comment de `ListError` : c'est ce qui laisse `useScene(frame)`
        attacher ses écouteurs UNE fois et ne jamais les perdre quand l'état
        du réseau bascule. `aria-busy`/`aria-label` reflètent l'état de
        CHARGEMENT sur ce MÊME nœud, jamais un second conteneur.
      */}
      <ul
        ref={frame}
        id="contenu"
        className="flex flex-1 flex-col overflow-y-auto px-2"
        {...(loading ? { 'aria-busy': true, 'aria-label': 'Chargement des conversations' } : {})}
      >
        {/*
          LES TROIS ÉTATS DU RÉSEAU (#5650, F5/§5 étape 9), même doctrine que
          `ConversationListViewModel.performLoadConversations` : `list.data`
          présent (même STALE) ⇒ peindre SANS spinner ; `undefined` ET
          `isError` (cache VIDE, requête en échec) ⇒ `ListError` avec
          « Réessayer » ; `undefined` seul (cache vide, requête en vol) ⇒ le
          squelette à géométrie exacte. Un refetch de fond qui échoue alors
          qu'une donnée est déjà affichée NE CHANGE RIEN à l'écran (iOS
          `.offline` garde le snapshot) : c'est la branche `list.data`
          présent qui l'assure, quel que soit `list.isError`.
        */}
        {list.data === undefined && list.isError ? (
          <ListError online={online} onRetry={() => void list.refetch()} />
        ) : loading ? (
          <LensSkeletonRows />
        ) : (
          <>
        {/*
          SECTIONS ET STICKERS COLLANTS (#5694, écart 6) — `pinnedViews:
          [.sectionHeaders]` côté iOS. Chaque section est un BLOC (`LensSection`)
          qui contient son en-tête collant puis ses rangées : `position: sticky`
          fait le reste, sans second conteneur de défilement. Le bloc n'est pas
          décoratif — c'est lui qui BORNE le collant, donc qui fait chasser un
          en-tête par le suivant au lieu de les empiler tous en haut (revue
          #5694 ; voir le doc-comment de `LensSticker`).
        */}
        {sections.map((section) => (
          <LensSection key={section.id} id={section.id}>
            {section.conversations.map((c) => (
              <LensRow
                key={c.id}
                conversation={c}
                languages={readerLanguages}
                viewerId={viewer.id ?? ''}
                flags={effectiveFlagsOf(c, overrides)}
                unreadCount={effectiveUnreadOf(c, overrides)}
                onRowAction={rowAction}
                status={{
                  /**
                   * L'APLATISSEMENT AU REPOS (#5694, écart 2) —
                   * `LentilleMagnifiableRow.isMagnified = scene.level > 0 &&
                   * election.electedId == id`
                   * (`Mode/LentilleMagnification.swift:435-437`) : la
                   * rangée élue ne reste MAGNIFIÉE visuellement qu'en scène
                   * ACTIVE. `level` retombe à 0 après `SCENE_REST_DELAY_MS`
                   * d'immobilité (`lens/scene.ts`) — sans ce gate, le
                   * supplément magnifié restait affiché indéfiniment après
                   * la fin du défilement.
                   */
                  magnified: level > 0 && focus === c.id,
                  /* La perspective est écrite par la scène directement dans le
                     style du nœud, à chaque image. Ces valeurs-ci ne sont que
                     l'état de DÉPART, avant la première passe. */
                  alpha: 1,
                  scale: 1,
                  breathing: 0,
                }}
              />
            ))}
          </LensSection>
        ))}
        {/*
          LA QUEUE DE LISTE — une demi-hauteur de fenêtre de vide sous la
          dernière rangée. Sans elle, la bande de focus, ancrée à 140 du bas,
          ne pourrait jamais atteindre les dernières conversations : elles
          resteraient à jamais non magnifiées, et la liste se terminerait par
          une zone morte que rien n'explique.

          ELLE N'EXISTE QUE S'IL Y A UNE RANGÉE À MAGNIFIER. Rendue
          inconditionnellement, elle poussait l'état vide 50 dvh plus bas :
          mesuré à 390×844, le panneau « Aucune conversation ne correspond… »
          commençait à 688 px et finissait à 899 — sa SORTIE, le bouton « Tout
          afficher », tombait donc hors de l'écran. Un état vide dont on ne
          voit pas l'issue est un cul-de-sac, et une cale destinée à la
          magnification n'a rien à caler quand il n'y a rien à magnifier.
        */}
        {/*
          ET LA CALE PORTE LES ACCÈS RAPIDES (2026-09-08). iOS met exactement
          ici les siens — `ConversationListView.listTail`, haut d'une demi-région
          visible, la MÊME hauteur et la MÊME raison. La v3.1 n'y mettait qu'un
          `aria-hidden` : une demi-fenêtre de vide sous la dernière ligne, sans
          une issue, là où l'utilisateur arrive précisément parce qu'il a fini de
          lire sa liste et cherche quoi faire.

          La hauteur reste : c'est elle qui laisse la dernière conversation
          rejoindre la bande de focus. Ce qui change, c'est qu'elle n'est plus
          VIDE — et elle cesse donc d'être `aria-hidden`, puisqu'elle porte
          maintenant quelque chose à lire.
        */}
        {visible.length > 0 ? (
          <li style={{ minHeight: '50dvh', flexShrink: 0 }}>
            <QuickActions
              title="Et maintenant ?"
              subtitle="Meeshy s’écrit à plusieurs — invitez quelqu’un à vous rejoindre."
              actions={ACTIONS_DE_DEMARRAGE}
            />
          </li>
        ) : null}
        {/*
          DEUX états VIDES DISTINCTS (#5559 T15) : `empty-corpus` (aucune
          conversation du tout — l'écran de DÉMARRAGE) contre `empty-filter`
          (un filtre ou une recherche qui ne rend rien sur un corpus non
          vide). Les confondre ferait dire « aucune conversation ne
          correspond à… » à un compte qui n'en a encore AUCUNE — un message
          qui accuse la recherche d'un vide qu'elle n'a pas produit.
        */}
        {emptiness === 'empty-corpus' ? (
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="users" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body font-semibold" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation pour l’instant.
            </p>
            {/*
              LA SORTIE DE L'ÉCRAN DE DÉMARRAGE (2026-09-08). Cet état récitait
              « Un message, une story, un mood, un post — ou invitez vos amis »
              — la phrase d'iOS, où elle SURMONTE neuf boutons — sous ZÉRO
              bouton. Il annonçait quatre gestes et n'en offrait aucun, quand
              `empty-filter`, douze lignes plus bas, a toujours eu sa sortie.

              Un état vide dont on ne voit pas l'issue est un cul-de-sac : le
              commentaire de la cale le dit déjà pour l'état filtré. Celui-ci
              était pire — il DÉCRIVAIT l'issue sans la donner.
            */}
            <QuickActions
              title="Commencez ici"
              subtitle="Meeshy s’écrit à plusieurs — invitez quelqu’un à vous rejoindre."
              actions={ACTIONS_DE_DEMARRAGE}
            />
          </li>
        ) : null}
        {emptiness === 'empty-filter' ? (
          /* Status vide : jamais un spinner, jamais une phrase seule — un
             contour pointille de CONTROLE, un glyphe, une phrase, une sortie. */
          <li
            className="mx-2 mt-8 grid place-items-center gap-3 rounded-hero p-6 text-center"
            style={{ border: '2px dashed color-mix(in srgb, var(--color-ios-brand) 40%, transparent)' }}
          >
            <Glyph name="magnifyingGlass" size={40} style={{ color: 'var(--color-ios-ink-3)' }} />
            <p className="text-body" style={{ color: 'var(--color-ios-ink)' }}>
              Aucune conversation ne correspond à « {search || FILTER_LABELS[filter]} ».
            </p>
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setFilter('all');
              }}
              className="rounded-chip px-5 text-body font-semibold text-white"
              style={{ backgroundColor: 'var(--color-ios-brand)', minHeight: 44 }}
            >
              Tout afficher
            </button>
          </li>
        ) : null}
          </>
        )}
      </ul>

      {/* La barre de recherche EN BAS — a portee du pouce (cf. doc-comment). */}
      <div className="shrink-0 px-4 pt-2 pb-safe">
        <div
          className="flex items-center gap-3 px-4 py-3 backdrop-blur-xl"
          style={{
            borderRadius: 22,
            backgroundColor: 'color-mix(in srgb, var(--color-ios-card) 85%, transparent)',
            border: '1px solid var(--color-edge)',
          }}
        >
          <Glyph name="magnifyingGlass" size={16} style={{ color: 'var(--color-ios-ink-2)' }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            placeholder="Rechercher…"
            aria-label="Rechercher une conversation"
            className="min-w-0 flex-1 bg-transparent text-bubble outline-none placeholder:text-ios-ink-3"
          />
          {search ? (
            <button type="button" onClick={() => setSearch('')} className="grid size-6 place-items-center">
              <Glyph name="x" size={14} title="Effacer" style={{ color: 'var(--color-error)' }} />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
