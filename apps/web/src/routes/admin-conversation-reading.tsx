import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';

import {
  ADMIN_MESSAGES_PAGE_SIZE,
  adminConversationMessagesQueryKey,
  loadAdminSovereignThread,
  MOTIF_LONGUEUR_MINIMALE,
} from '@/lib/api/admin-conversations';
import type { AdminDeps } from '@/lib/api/admin';
import { apiDeps } from '@/lib/api/deps';
import type { Viewer } from '@/lib/api/viewer';
import { place } from '@/lib/grouping';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import { useThreadScene } from '@/lib/reading-mode/scene';
import { AdminSkeleton } from '@/routes/admin-parts';
import { ThreadModes } from '@/routes/thread-modes';

/**
 * **LA VRAIE VUE CONVERSATION, SOUS ADMINISTRATION** (#6862, lot C) — le SEUL
 * site du chantier qui rende le fil d'un membre à un administrateur, et le
 * seul qui construise un prisme de lecture pour quelqu'un d'autre.
 *
 * ## POURQUOI PAS UN RENDU MAISON
 *
 * `admin-conversation.tsx` en portait un : des `<li>` plats, sans bulle, sans
 * regroupement, sans citation, sans Prisme. Il n'était pas « simplifié » — il
 * était FAUX sur ce qu'il prétendait montrer. Un administrateur qui lit une
 * conversation doit voir CE QUE LE MEMBRE A VU : la même disposition, les
 * mêmes suites, la même protection, et surtout la même LANGUE. Un second
 * rendu, si fidèle soit-il le jour où on l'écrit, diverge au premier lot qui
 * touche le fil — le dépôt a déjà payé trois fois cette leçon sur le Prisme.
 *
 * On monte donc `ThreadModes`, le composant que le fil monte, avec les
 * capacités d'écriture ABSENTES (jamais bouchonnées : § doc-comment de
 * `ThreadModes`). Ce qui manque ici manque pour une raison : on ne répond pas
 * à la place de quelqu'un, on ne réagit pas en son nom, et on ne consomme
 * SURTOUT pas la vue unique d'un tiers — la consommation est irréversible et
 * détruirait la pièce que l'administration vient constater.
 *
 * ## LE PRISME EST CELUI DU MEMBRE, PAS CELUI DE L'ADMINISTRATEUR
 *
 * `readerLanguages` et `readerLocale` arrivent EN PROP. C'est déjà comme ça
 * que `ThreadModes` fonctionne — aucun composant de rendu du fil ne lit la
 * session — et c'est ce qui rend ce lot possible sans toucher une seule peau.
 * Leur construction vit dans `lib/admin/prisme-membre.ts`, qui porte la raison
 * pour laquelle le rang 4 (la locale de l'appareil) y est DÉLIBÉRÉMENT omis.
 *
 * ## LE MOTIF EST DEMANDÉ AVANT LA REQUÊTE, ET IL EST FIGÉ
 *
 * Le schéma AJV de la route refuse `reason` sous dix caractères, par un 400,
 * avant son handler. Demander le motif d'abord évite à l'administrateur de
 * découvrir la règle par un échec — et surtout, cela rend le geste DÉLIBÉRÉ :
 * on n'ouvre pas une conversation privée en tapant sur une ligne, on l'ouvre
 * en écrivant pourquoi. `AdminAuditLog` consigne ce texte.
 *
 * La requête n'est donc PAS armée tant que le motif n'est pas validé
 * (`enabled`), et le motif validé est FIGÉ : le rendre modifiable relancerait
 * une lecture sous un autre motif que celui déjà consigné.
 *
 * ## RIEN DE CE QUI EST LU ICI NE TOUCHE LE DISQUE
 *
 * La clé descend d'`ADMIN_SOUVERAIN_PREFIXE`, qu'exclut le filtre de
 * déshydratation (`query-client.ts`), et `gcTime: 0` ne la garde pas en
 * mémoire au-delà de l'écran. Emprunter `messagesQueryKey` — la clé du fil
 * ordinaire — écrirait le contenu d'une conversation privée dans
 * `localStorage`, où il survivrait à la session sans qu'`AdminAuditLog` en
 * sache rien.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';

/**
 * LE MODE DE LECTURE DE L'ADMINISTRATION — `focal`, le mode PAR DÉFAUT du
 * produit (D-7). Ce n'est pas un choix esthétique : la consigne est de montrer
 * la vue du produit, et le produit ouvre un fil en Focal. Le mode n'est pas
 * réglable ici — un sélecteur de mode dans une fenêtre de lecture souveraine
 * ajouterait un geste sans rapport avec ce qu'on est venu constater.
 */
const MODE_DE_LECTURE = 'focal' as const;

/* Références STABLES (#5650, F1) : un `[]` écrit en ligne change d'identité à
   chaque rendu, ce qui défait `useMemo`, `place()` et la mémoïsation du fil
   virtualisé — la leçon du CLAUDE.md racine sur `preferredLanguages`. */
const EMPTY_MESSAGES = [] as const;
const EMPTY_TYPISTS = [] as const;
const EMPTY_IDS: ReadonlySet<string> = new Set();

export function AdminConversationReading({
  conversationId,
  language,
  prisme,
  readerLanguages,
  readerLocale,
  viewer,
  deps = apiDeps,
}: {
  readonly conversationId: string;
  /** La langue de l'INTERFACE d'administration (motif, boutons) — jamais celle du contenu. */
  readonly language: InterfaceLanguage;
  /**
   * **LE PRISME DE QUI** — et donc s'il y a quelque chose à ANNONCER.
   *
   * Le bandeau existe parce que le prisme n'est PAS celui du lecteur : sur la
   * fiche d'un membre, l'administrateur lit dans les langues de QUELQU'UN
   * D'AUTRE, et rien d'autre à l'écran ne le lui dirait. Sur
   * `/adm/conversations/:id`, il n'y a aucun membre administré — le prisme y
   * est le sien, comme partout ailleurs dans l'application.
   *
   * Le bandeau y annonçait pourtant « Lu dans le prisme du membre : fr › en »
   * (recette au navigateur, #6862) : une phrase FAUSSE sur la langue servie,
   * qui fait prendre sa propre traduction pour celle d'un tiers. Là où le
   * prisme est celui du lecteur, il n'y a rien à annoncer — la mention par
   * rangée (`data-prism-indicator`) dit déjà qu'un texte est traduit, et c'est
   * exactement ce que le produit dit partout ailleurs.
   *
   * REQUIS, sans défaut : un hôte qui oublierait de le poser hériterait
   * silencieusement de l'affirmation la plus forte des deux.
   */
  readonly prisme: 'membre' | 'lecteur';
  /** LE PRISME DU MEMBRE (ou de l'administrateur hors fiche membre) — face CONTENU. */
  readonly readerLanguages: readonly string[];
  /** La face CADRAGE du même prisme : libellés de jour, dates relatives. */
  readonly readerLocale: string;
  /**
   * QUI EST « MOI » DANS CE FIL. Sur la fiche d'un membre, c'est LE MEMBRE :
   * la conversation s'affiche de son point de vue, ses prises de parole du
   * côté qu'il connaît. Hors fiche membre (`/adm/conversations/:id`), c'est
   * l'administrateur lui-même — s'il participe à la conversation, ses propres
   * messages restent les siens ; sinon rien n'est « à lui », ce qui est la
   * vérité.
   */
  readonly viewer: Viewer;
  /**
   * LE PORT, INJECTABLE — `apiDeps` par défaut, comme partout ailleurs dans
   * l'administration. Un témoin qui doit prouver QUELLE LANGUE est peinte a
   * besoin de poser lui-même les traductions servies : sans cette porte, il ne
   * pourrait mesurer le Prisme qu'à travers un cache seedé, c'est-à-dire pas à
   * travers le chemin qu'un administrateur emprunte.
   */
  readonly deps?: AdminDeps;
}) {
  const [saisie, setSaisie] = useState('');
  /** Le motif VALIDÉ — figé une fois la lecture demandée. */
  const [motif, setMotif] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const [expiredIds, setExpiredIds] = useState<ReadonlySet<string>>(() => new Set());

  const page = useQuery({
    queryKey: adminConversationMessagesQueryKey(conversationId, offset),
    queryFn: async ({ signal }) => {
      const resultat = await loadAdminSovereignThread({
        ...deps,
        conversationId,
        offset,
        reason: motif ?? '',
        signal,
      });
      if (!resultat.ok) throw new Error(resultat.error);
      return resultat.data;
    },
    enabled: motif !== null,
    retry: false,
    gcTime: 0,
  });

  const messages = page.data?.messages ?? EMPTY_MESSAGES;
  const protectedIds = page.data?.protectedIds ?? EMPTY_IDS;
  /* `useMemo` et non un appel nu : `placed` alimente le virtualiseur, le saut
     de citation et la scène. Le reconstruire à chaque rendu leur donnerait une
     identité neuve à chaque fois — la mémoïsation du fil ne tiendrait plus
     rien (« Zero Unnecessary Re-render », CLAUDE.md), même discipline que
     `routes/thread.tsx`. */
  const placed = useMemo(() => place(messages, { locale: readerLocale }), [messages, readerLocale]);

  const scroller = useRef<HTMLElement | null>(null);
  /**
   * LE MÊME VIRTUALISEUR QUE LE FIL, et il n'est pas optionnel : `ThreadModes`
   * n'itère QUE sur `virtualizer.getVirtualItems()` et pose la hauteur totale
   * depuis `getTotalSize()`. Sans lui, la liste ne rend pas une rangée — ce
   * n'est pas une optimisation qu'on pourrait sauter, c'est la structure.
   *
   * `measureElement` plutôt qu'une hauteur fixe, pour la raison qu'écrit
   * `thread.tsx` : les bulles n'ont pas de hauteur commune, et une estimation
   * fixe ferait sauter la barre de défilement à chaque mesure réelle.
   */
  const virtualizer = useVirtualizer({
    count: placed.length,
    getScrollElement: () => scroller.current,
    estimateSize: () => 88,
    overscan: 6,
    getItemKey: (index) => placed[index]?.message.id ?? index,
  });

  const scene = useThreadScene(scroller, { mode: MODE_DE_LECTURE, ready: placed.length > 0 });
  const noteProgrammaticScroll = scene.noteProgrammaticScroll;

  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
    },
    [],
  );

  /**
   * LE SAUT VERS UNE CITATION — CÂBLÉ, jamais bouchonné. La carte de citation
   * porte un bouton ; un bouton qui ne saute nulle part est le contrôle sans
   * effet que la loi 4 interdit. Le saut est BORNÉ à la page chargée : un
   * message cité qui n'y est pas ne bouge rien plutôt que de sauter au hasard.
   */
  const jumpToMessage = useCallback(
    (messageId: string) => {
      const index = placed.findIndex((p) => p.message.id === messageId);
      if (index === -1) return;
      noteProgrammaticScroll();
      virtualizer.scrollToIndex(index, { align: 'center' });
      setHighlightedId(messageId);
      if (highlightTimer.current !== null) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightedId(null), 1600);
    },
    [placed, virtualizer, noteProgrammaticScroll],
  );

  /**
   * UN ÉPHÉMÈRE QUI S'ÉTEINT SOUS LES YEUX S'ÉTEINT ICI AUSSI. La passerelle
   * retient déjà le contenu d'un message expiré ; ce relais couvre le cas où
   * l'échéance tombe PENDANT la lecture. Ne rien câbler laisserait la rangée
   * afficher son minuteur à zéro sans jamais basculer.
   */
  const onEphemeralExpired = useCallback((messageId: string) => {
    setExpiredIds((courant) => (courant.has(messageId) ? courant : new Set([...courant, messageId])));
  }, []);

  const contentWithheld = useCallback((messageId: string) => protectedIds.has(messageId), [protectedIds]);

  const motifSuffisant = saisie.trim().length >= MOTIF_LONGUEUR_MINIMALE;

  if (motif === null) {
    return (
      <div className="grid gap-2" data-admin-reading-gate>
        <label className="grid gap-1 pb-2">
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.convDetail.reasonLabel')}
          </span>
          <textarea
            value={saisie}
            data-admin-reason
            rows={3}
            /* `onInput`, JAMAIS `onChange` — convention du dépôt, et mesurée :
               React fait normalement de `onChange` un synonyme de l'événement
               `input` sur un champ texte, mais l'équivalence repose sur son
               suivi de valeur, que happy-dom ne satisfait pas. Un champ câblé
               `onChange` se monte, s'affiche, se remplit à l'œil — et ne
               rapporte JAMAIS rien à son hôte sous témoin. C'est ce qu'il
               portait, hérité de l'écran qu'il remplace, et aucun témoin
               n'existait pour le dire. */
            onInput={(event) => setSaisie(event.currentTarget.value)}
            className="rounded-card px-4 py-2 text-body"
            style={{ backgroundColor: 'var(--color-ios-surface)', border: '1px solid var(--color-edge)', color: INK }}
          />
          <span className="text-caption" style={{ color: INK2 }}>
            {translateAdmin(language, 'admin.convDetail.reasonHint')}
          </span>
        </label>
        <button
          type="button"
          data-admin-reason-submit
          disabled={!motifSuffisant}
          onClick={() => setMotif(saisie.trim())}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
          style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
        >
          {translateAdmin(language, 'admin.convDetail.read')}
        </button>
      </div>
    );
  }

  if (page.isPending) return <AdminSkeleton rows={6} />;

  if (page.data === undefined) {
    return (
      <p className="text-caption" style={{ color: INK2 }}>
        {translateAdmin(language, 'admin.convList.unavailable')}
      </p>
    );
  }

  if (placed.length === 0) {
    return (
      <p className="text-caption" style={{ color: INK2 }} data-admin-reading-empty>
        {translateAdmin(language, 'admin.convDetail.empty')}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-admin-reading={conversationId}>
      {/* LE PRISME D'UN AUTRE, DIT À VOIX HAUTE — un administrateur qui lit
          dans les langues de quelqu'un d'autre doit le savoir, sinon il prend
          la traduction d'un tiers pour ce qu'il lirait lui-même. Le bandeau ne
          se peint QUE dans ce cas : voir le doc-comment de `prisme`.
          `lang` sur le conteneur reste posé dans les deux cas — le fil est
          rendu dans une langue, et un lecteur d'écran doit le prononcer avec
          la bonne voix, que cette langue soit celle du membre ou la sienne. */}
      {prisme === 'membre' ? (
        <p className="shrink-0 px-4 pb-1 text-caption" style={{ color: INK2 }} data-admin-reading-prism>
          {translateAdmin(language, 'admin.convDetail.memberPrism', { languages: readerLanguages.join(' › ') })}
        </p>
      ) : null}

      {/* `<section>` et non `<div>` : React type le `ref` d'une balise
          sectionnante en `HTMLElement`, le type même qu'attendent
          `useThreadScene` et `Virtualizer<HTMLElement, Element>` — la MÊME
          raison qui fait du fil un `<main ref={scroller}>`. */}
      <section ref={scroller} className="flex min-h-0 flex-1 flex-col overflow-y-auto" lang={readerLocale}>
        <ThreadModes
          mode={MODE_DE_LECTURE}
          viewer={viewer}
          readerLocale={readerLocale}
          placed={placed}
          virtualizer={virtualizer}
          scene={scene}
          readerLanguages={readerLanguages}
          group
          highlightedId={highlightedId}
          expiredIds={expiredIds}
          jumpToMessage={jumpToMessage}
          onEphemeralExpired={onEphemeralExpired}
          contentWithheld={contentWithheld}
          typists={EMPTY_TYPISTS}
        />
      </section>

      <div className="flex shrink-0 justify-between gap-2 px-4 pt-2">
        <button
          type="button"
          data-admin-messages-prev
          disabled={offset === 0}
          onClick={() => setOffset((valeur) => Math.max(0, valeur - ADMIN_MESSAGES_PAGE_SIZE))}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
          style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
        >
          {translateAdmin(language, 'admin.users.previous')}
        </button>
        <button
          type="button"
          data-admin-messages-next
          disabled={!page.data.hasMore}
          onClick={() => setOffset((valeur) => valeur + ADMIN_MESSAGES_PAGE_SIZE)}
          className="rounded-chip px-4 text-body font-semibold disabled:opacity-40"
          style={{ minHeight: 44, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK }}
        >
          {translateAdmin(language, 'admin.users.next')}
        </button>
      </div>
    </div>
  );
}
