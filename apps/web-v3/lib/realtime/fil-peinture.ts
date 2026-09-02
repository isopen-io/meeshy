import { annonceDeLaPiece, annonceDuPrisme, type Accuse, type Citation, type PieceJointe, type Reaction } from '@/lib/api/fil';
import { formeDePiece } from '@/lib/api/formes';
import { initiales, TEINTES, teinteDeLAvatar } from '@/lib/avatar';
import { FIL, libelleDeCitation } from '@/lib/contenu/fil';
import { metaDePiece } from '@/lib/poids';
import { cleDuJour, heureLocale, libelleDuJour } from '@/lib/temps';

import type { Bulle, EtatDuFil, Frappeur } from './fil-etat';

/**
 * LA PEINTURE DU FIL — ce que le module de participation fait au DOM, et rien
 * d'autre : il REMPLIT des fentes dans un balisage que le serveur a écrit
 * (`app/connecte/fil-lignes.ts` rend chaque ligne ET les `<template>` que ce
 * module clone — la ligne, le séparateur de jour, la palette de réactions).
 * Aucune balise n'est composée ici : une ligne peinte en direct et une ligne
 * rechargée sont le même HTML, parce qu'elles viennent de la même fonction ;
 * les initiales, la teinte, les libellés et les jours viennent des mêmes
 * modules (`lib/avatar.ts`, `lib/contenu/fil.ts`, `lib/temps.ts`) que le
 * serveur lit.
 *
 * LA LISTE EST SERVIE DU PLUS RÉCENT AU PLUS ANCIEN et affichée à l'envers
 * (`column-reverse`, feuille du fil) : le premier `<li>` du DOM est le message
 * du bas. Insérer, regrouper, poser les jours se font donc en parcourant le
 * DOM À REBOURS — l'ordre chronologique —, et un séparateur de jour se pose
 * APRÈS la première ligne de son jour dans le DOM, c'est-à-dire au-dessus
 * d'elle à l'écran.
 *
 * Ce que ce module ajoute au document, parce que seul le navigateur peut le
 * savoir : l'HEURE LOCALE (le serveur rend un relatif, il ignore le fuseau)
 * et les JOURS dans le fuseau du lecteur ; le compte des « nouveaux messages »
 * quand le lecteur lit plus haut ; le nom de qui écrit ; le bouton « Réagir »
 * de chaque ligne, cloné du gabarit — jamais servi inerte.
 *
 * Il ne SAIT rien de l'état : `EtatDuFil` (`fil-etat.ts`) est calculé ailleurs,
 * pur ; ici on le projette. La projection est IDEMPOTENTE : repeindre le même
 * état ne touche pas un nœud — c'est ce qui garde le défilement et la sélection
 * à leur place (Instant App Principles, « zero unnecessary re-render »).
 */

export type Peintre = {
  readonly liste: HTMLOListElement;
  readonly gabarit: HTMLTemplateElement;
  readonly gabaritDeJour: HTMLTemplateElement | null;
  readonly gabaritDePalette: HTMLTemplateElement | null;
  readonly frappe: HTMLElement | null;
  /** La fente « N en ligne » de l'en-tête — servie au membre, absente chez l'invité (`fil-vue.ts`). */
  readonly enLigne: HTMLElement | null;
  /**
   * Le nom sous lequel le lecteur écrit — celui que le document a servi
   * (`data-nom`). Une ligne du lecteur porte « Vous » à la place du nom, et
   * c'est SON nom, pas ce mot, qui donne ses initiales et sa teinte.
   */
  readonly nomDuLecteur: string;
  readonly langueDuDocument: string;
};

export const peintre = (main: HTMLElement): Peintre | null => {
  const liste = main.querySelector<HTMLOListElement>('ol.lignes');
  const gabarit = main.querySelector<HTMLTemplateElement>('template#gabarit-ligne');
  if (liste === null || gabarit === null) return null;
  return {
    liste,
    gabarit,
    gabaritDeJour: main.querySelector<HTMLTemplateElement>('template#gabarit-jour'),
    gabaritDePalette: main.querySelector<HTMLTemplateElement>('template#gabarit-palette'),
    frappe: main.querySelector<HTMLElement>('#frappe'),
    enLigne: main.querySelector<HTMLElement>('.fil-tete .en-ligne'),
    nomDuLecteur: main.dataset.nom ?? FIL.vous,
    langueDuDocument: document.documentElement.lang || 'fr',
  };
};

const texte = (racine: ParentNode, selecteur: string, valeur: string): void => {
  const noeud = racine.querySelector<HTMLElement>(selecteur);
  if (noeud !== null && noeud.textContent !== valeur) noeud.textContent = valeur;
};

const montre = (racine: ParentNode, selecteur: string, visible: boolean): void => {
  const noeud = racine.querySelector<HTMLElement>(selecteur);
  if (noeud !== null && noeud.hidden === visible) noeud.hidden = !visible;
};

const poseLang = (noeud: HTMLElement | null, langue: string | null, langueDuDocument: string): void => {
  if (noeud === null) return;
  const voulu = langue !== null && langue !== langueDuDocument ? langue : '';
  if (voulu === '') noeud.removeAttribute('lang');
  else if (noeud.getAttribute('lang') !== voulu) noeud.setAttribute('lang', voulu);
};

const classe = (noeud: HTMLElement, nom: string, actif: boolean): void => {
  if (noeud.classList.contains(nom) !== actif) noeud.classList.toggle(nom, actif);
};

const CLASSES_D_ENVOI: readonly string[] = ['envoi-attente', 'envoi-hors-ligne', 'envoi-echec'];

const classeDEnvoi = (bulle: Bulle): string | null =>
  bulle.envoi === 'en-attente'
    ? 'envoi-attente'
    : bulle.envoi === 'hors-ligne'
      ? 'envoi-hors-ligne'
      : bulle.envoi === 'en-echec'
        ? 'envoi-echec'
        : null;

const clone = <T extends Element>(gabarit: HTMLTemplateElement | null, selecteur: string): T | null => {
  const modele = gabarit?.content.querySelector<T>(selecteur) ?? null;
  return modele === null ? null : (modele.cloneNode(true) as T);
};

const poseAuDebut = <T extends HTMLElement>(ligne: HTMLElement, hote: string, noeud: T | null): T | null => {
  const parent = ligne.querySelector<HTMLElement>(hote);
  if (parent === null || noeud === null) return null;
  parent.prepend(noeud);
  return noeud;
};

const poseApres = <T extends HTMLElement>(ligne: HTMLElement, voisin: string, noeud: T | null): T | null => {
  const avant = ligne.querySelector<HTMLElement>(voisin);
  if (avant === null || noeud === null) return null;
  avant.after(noeud);
  return noeud;
};

const remplisLAvatar = (ligne: HTMLElement, bulle: Bulle): void => {
  const initiale = ligne.querySelector<HTMLElement>('.avatar:not(.fantome)');
  const fantome = ligne.querySelector<HTMLElement>('.avatar.fantome');
  if (initiale !== null) initiale.hidden = bulle.anonyme && fantome !== null;
  if (fantome !== null) fantome.hidden = !bulle.anonyme;
  if (initiale === null || bulle.anonyme) return;
  const voulues = initiales(bulle.auteur);
  if (initiale.textContent !== voulues) initiale.textContent = voulues;
  const teinte = teinteDeLAvatar(bulle.auteur);
  TEINTES.forEach((t) => classe(initiale, t, t === teinte));
};

/**
 * LES PIÈCES PEINTES — le même balisage que la ligne servie, cloné du gabarit,
 * puis DÉPOUILLÉ de ce que le genre ne demande pas. Le gabarit porte les deux
 * blocs (l'affiche et le lecteur) et les deux médias natifs ; ce module en
 * RETIRE, il n'en compose aucun — `formeDePiece` (`lib/api/formes.ts`) décide,
 * exactement comme pour la ligne servie. Écrite ici en comparaisons littérales
 * de genre (`piece.genre !== 'audio'`, `piece.genre === 'video'`…), la règle
 * était une SECONDE table : donner un lecteur à un genre neuf changeait la
 * ligne servie sans changer la ligne peinte.
 *
 * LA GARDE DE TÊTE NE SORT PLUS SUR UNE LISTE VIDE. `bullesDuDocument` pose
 * `pieces: []` sur toute ligne SERVIE ; sortir avant l'estampille laissait
 * `data-empreinte` indéfini, si bien que le PREMIER
 * `audio:transcription-ready` d'un vocal déjà servi tombait dans la branche
 * d'ADOPTION — il estampillait l'empreinte NEUVE et rendait sans rien peindre.
 * La transcription n'apparaissait jamais et le lecteur continuait d'entendre la
 * piste ORIGINALE, alors que le module avait bien calculé la française
 * (cycle 128, « on entend ce qu'on lit »). Seul un SECOND événement peignait.
 * `remplisLesCitations`, juste dessous, était juste : la garde y sort après
 * l'estampille, et c'est elle qu'on suit.
 */
const empreinteDesPieces = (pieces: readonly PieceJointe[]): string =>
  pieces
    .map((piece) => `${piece.id}:${piece.url}:${piece.piste}:${piece.transcription ?? ''}:${piece.transcriptionOriginale ?? ''}:${piece.langueServie ?? ''}`)
    .join('|');

/** Le nœud que la pièce ne demande pas SORT ; celui qu'elle demande perd son `hidden` de gabarit. */
const retireSauf = (racine: ParentNode, selecteur: string, garde: boolean): void => {
  const noeud = racine.querySelector<HTMLElement>(selecteur);
  if (noeud === null) return;
  if (garde) noeud.hidden = false;
  else noeud.remove();
};

const peinsUnePiece = (noeud: HTMLLIElement, piece: PieceJointe, langueDuDocument: string): void => {
  const forme = formeDePiece(piece.genre);
  const meta = metaDePiece(piece);
  noeud.dataset.piece = piece.id;
  noeud.dataset.genre = piece.genre;

  // Le bloc que le genre ne demande pas SORT du clone : une pièce peinte et une
  // pièce servie portent alors le même balisage, au nœud près.
  noeud.querySelector(forme.lecteur === null ? 'details.lecteur' : 'a.media')?.remove();
  // Le média natif que la table ne NOMME pas sort avec lui : la balise vient de
  // `forme.lecteur`, jamais d'une comparaison de genre écrite ici.
  noeud.querySelectorAll('audio, video').forEach((media) => {
    if (media.tagName.toLowerCase() !== forme.lecteur) media.remove();
  });

  const lien = noeud.querySelector<HTMLAnchorElement>('a.media');
  if (lien !== null) {
    if (piece.url === '') lien.removeAttribute('href');
    else lien.href = piece.url;
    lien.setAttribute('aria-label', FIL.telecharger(piece.nom, meta));
  }
  // Le lecteur joue la PISTE — celle que la langue du texte servi a élue
  // (cycle 128) —, jamais l'adresse de téléchargement.
  const media = noeud.querySelector<HTMLMediaElement>('audio, video');
  if (media !== null && piece.piste !== '') media.src = piece.piste;
  texte(noeud, 'details.lecteur > summary > .hors-ecran', FIL.lire(piece.nom, meta));

  texte(noeud, '.nom-de-piece', piece.nom);
  texte(noeud, '.poids', meta);
  montre(noeud, '.poids', meta !== '');

  // Ce que la pièce ne DIT pas sort du clone, comme le bloc qu'elle ne demande
  // pas : une pièce sans transcription porte alors le même balisage servie que
  // peinte, au nœud près — c'est ce que le témoin des quatre genres oppose.
  const annonce = piece.transcription === null ? null : annonceDeLaPiece(piece);
  const original = annonce !== null && piece.transcriptionOriginale !== null;
  retireSauf(noeud, '.transcription', piece.transcription !== null);
  retireSauf(noeud, '.transcrit', annonce !== null);
  retireSauf(noeud, 'details.transcrit-original', original);

  texte(noeud, '.texte-transcrit', piece.transcription ?? '');
  poseLang(noeud.querySelector<HTMLElement>('.transcription'), piece.langueServie ?? piece.langueDeTranscription, langueDuDocument);
  if (annonce !== null) texte(noeud, '.transcrit', FIL.transcrit(annonce.origine, annonce.servie));
  if (original) {
    texte(noeud, 'details.transcrit-original p', piece.transcriptionOriginale ?? '');
    poseLang(noeud.querySelector<HTMLElement>('details.transcrit-original p'), annonce?.origine ?? null, langueDuDocument);
  }
};

const remplisLesPieces = (ligne: HTMLElement, pieces: readonly PieceJointe[], gabarit: HTMLTemplateElement, langueDuDocument: string): void => {
  const liste = ligne.querySelector<HTMLUListElement>('ul.pieces');
  if (liste === null) return;
  const empreinte = empreinteDesPieces(pieces);
  if (liste.dataset.empreinte === empreinte) return;
  if (liste.dataset.empreinte === undefined && liste.querySelector('li[data-piece]:not([data-piece=""])') !== null) {
    liste.dataset.empreinte = empreinte;
    return;
  }
  liste.dataset.empreinte = empreinte;

  liste.replaceChildren(
    ...pieces.map((piece) => {
      const noeud = clone<HTMLLIElement>(gabarit, 'ul.pieces > li') ?? document.createElement('li');
      peinsUnePiece(noeud, piece, langueDuDocument);
      return noeud;
    }),
  );
  liste.hidden = pieces.length === 0;
};

/**
 * LES CITATIONS PEINTES — le même balisage que la ligne servie, cloné du
 * gabarit : le module remplit `.quoi` (le libellé, composé par le SITE UNIQUE
 * `libelleDeCitation`) et `.apercu` (avec sa langue), et `data-genre` élit le
 * glyphe dans la feuille. Aucune balise n'est composée ici.
 *
 * Une ligne SERVIE porte déjà ses citations, que l'état relu du document ne
 * reconstruit pas (`bullesDuDocument`) : au premier passage, on les ADOPTE
 * plutôt que de les effacer. `data-cite` distingue une citation servie du
 * gabarit, dont la cible est vide — le même discriminant que `data-piece`.
 */
const empreinteDesCitations = (citations: readonly Citation[]): string =>
  citations.map((c) => `${c.genre}:${c.cible}:${c.source ?? ''}:${c.apercu}:${c.langue ?? ''}`).join('|');

const remplisLesCitations = (ligne: HTMLElement, citations: readonly Citation[], gabarit: HTMLTemplateElement, langueDuDocument: string): void => {
  const liste = ligne.querySelector<HTMLUListElement>('ul.citations');
  if (liste === null) return;
  const empreinte = empreinteDesCitations(citations);
  if (liste.dataset.empreinte === empreinte) return;
  if (liste.dataset.empreinte === undefined && liste.querySelector('li.citation:not([data-cite=""])') !== null) {
    liste.dataset.empreinte = empreinte;
    return;
  }
  liste.dataset.empreinte = empreinte;

  liste.replaceChildren(
    ...citations.map((citation) => {
      const noeud = clone<HTMLLIElement>(gabarit, 'ul.citations > li.citation') ?? document.createElement('li');
      noeud.dataset.genre = citation.genre;
      noeud.dataset.cite = citation.cible;
      texte(noeud, '.quoi', libelleDeCitation(citation));
      texte(noeud, '.apercu', citation.apercu);
      montre(noeud, '.apercu', citation.apercu !== '');
      poseLang(noeud.querySelector<HTMLElement>('.apercu'), citation.langue, langueDuDocument);
      return noeud;
    }),
  );
  liste.hidden = citations.length === 0;
};

const empreinteDesReactions = (reactions: readonly Reaction[]): string =>
  reactions.map((r) => `${r.emoji}:${r.nombre}:${r.mienne ? 1 : 0}`).join('|');

/**
 * Les pastilles sont des FORMULAIRES, clonés du gabarit : le même balisage que
 * la pastille servie, `aria-pressed` en plus quand elle est la mienne.
 */
const remplisLesReactions = (ligne: HTMLElement, bulle: Bulle, gabarit: HTMLTemplateElement): void => {
  const liste = ligne.querySelector<HTMLUListElement>('ul.reactions');
  if (liste === null) return;
  const attendu = empreinteDesReactions(bulle.reactions);
  if (liste.dataset.empreinte === attendu) return;
  liste.dataset.empreinte = attendu;
  liste.replaceChildren(
    ...bulle.reactions.map((reaction) => {
      const item = clone<HTMLLIElement>(gabarit, 'ul.reactions > li') ?? document.createElement('li');
      item.dataset.emoji = reaction.emoji;
      const emoji = item.querySelector<HTMLInputElement>('input[name="reaction"]');
      const cible = item.querySelector<HTMLInputElement>('input[name="message"]');
      if (emoji !== null) emoji.value = reaction.emoji;
      if (cible !== null) cible.value = bulle.id;
      const bouton = item.querySelector<HTMLButtonElement>('button.reaction');
      if (bouton !== null) {
        bouton.dataset.emoji = reaction.emoji;
        bouton.setAttribute('aria-pressed', reaction.mienne ? 'true' : 'false');
      }
      texte(item, '.emoji', reaction.emoji);
      texte(item, '.nombre', String(reaction.nombre));
      return item;
    }),
  );
  liste.hidden = bulle.reactions.length === 0;
};

/**
 * Le bouton « Réagir », cloné dans la PLACE que chaque ligne servie lui réserve
 * (`.reagir-slot`, `fil-lignes.ts`) : il arrive sans déplacer l'heure ni
 * l'accusé. Une ligne servie n'en porte aucun ; une ligne clonée l'a déjà.
 */
const poseLeBoutonReagir = (ligne: HTMLElement, bulle: Bulle, gabarit: HTMLTemplateElement): void => {
  if (bulle.systeme || bulle.supprime || bulle.protege || ligne.querySelector('.reagir') !== null) return;
  const place = ligne.querySelector<HTMLElement>('.reagir-slot');
  const bouton = clone<HTMLButtonElement>(gabarit, 'button.reagir');
  if (place !== null && bouton !== null) place.append(bouton);
};

/** Retirer les contrôles de réaction — quand la porte se ferme (410, place fermée, session expirée). La place reste : rien ne bouge. */
export const retireLesControlesDeReaction = (p: Peintre): void => {
  p.liste.querySelectorAll('button.reagir').forEach((bouton) => bouton.remove());
};

/**
 * Remplir les FENTES d'une ligne — la même pour une ligne servie et pour un
 * clone du gabarit. Tout ce qui ne change pas n'est pas touché.
 */
export const remplis = (ligne: HTMLElement, bulle: Bulle, p: Peintre): void => {
  ligne.dataset.id = bulle.id;
  ligne.id = `m-${bulle.id}`;
  if (bulle.clientMessageId !== null) ligne.dataset.cid = bulle.clientMessageId;
  if (bulle.auteurId !== null) ligne.dataset.auteur = bulle.auteurId;
  if (bulle.ecritA !== null) ligne.dataset.ecrit = bulle.ecritA;
  if (bulle.langueServie !== null) ligne.dataset.servie = bulle.langueServie;
  else delete ligne.dataset.servie;

  classe(ligne, 'mien', bulle.deMoi);
  classe(ligne, 'systeme', bulle.systeme);
  classe(ligne, 'supprime', bulle.supprime);
  classe(ligne, 'protege', bulle.protege);
  CLASSES_D_ENVOI.forEach((nom) => classe(ligne, nom, classeDEnvoi(bulle) === nom));

  remplisLAvatar(ligne, bulle);
  texte(ligne, '.nom', bulle.deMoi ? FIL.vous : bulle.auteur);
  montre(ligne, '.anonyme', bulle.anonyme);

  // Une parole RETIRÉE ne reste pas sous les yeux : la mention remplace le
  // texte — la même que celle que le serveur sert (`fil-lignes.ts`) — et tout
  // ce qui la citait (original, langue, pièces, réactions) s'efface avec elle.
  const corps = ligne.querySelector<HTMLElement>('.texte');
  if (corps !== null) {
    const voulu = bulle.supprime ? FIL.supprime : bulle.texte;
    if (corps.textContent !== voulu) corps.textContent = voulu;
    poseLang(corps, bulle.supprime ? null : (bulle.langueServie ?? bulle.langueOriginale), p.langueDuDocument);
  }

  // Une ligne SERVIE ne porte NI la pastille NI « Voir l'original » tant que
  // rien n'est traduit — les rendre à vide coûterait un tracé par ligne, sur
  // une 3G rurale. Quand une traduction ARRIVE, la fente manque donc : le
  // module la CLONE du gabarit, exactement comme le bouton « Réagir ».
  const visibleOriginal = bulle.langueServie !== null && !bulle.protege && !bulle.supprime;
  const original = ligne.querySelector<HTMLDetailsElement>('details.original') ?? (visibleOriginal ? poseApres(ligne, '.texte', clone<HTMLDetailsElement>(p.gabarit, 'details.original')) : null);
  if (original !== null) {
    original.hidden = !visibleOriginal;
    if (visibleOriginal) {
      const paragraphe = original.querySelector<HTMLElement>('p');
      texte(original, 'p', bulle.texteOriginal);
      poseLang(paragraphe, bulle.langueOriginale, p.langueDuDocument);
    }
  }

  // La pastille annonce ce qui a été RÉSOLU — le texte d'abord, puis ce que le
  // message PORTE : sur un vocal sans texte, elle disparaissait avec le texte
  // absent (`lib/api/fil.ts`, `annonceDuPrisme`).
  // LA PASTILLE DIT CE QUI A ÉTÉ RÉSOLU — le texte d'abord, puis ce que le
  // message PORTE (`annonceDuPrisme`) : sur un vocal sans texte, elle
  // disparaissait avec le texte absent.
  //
  // Et elle ne CONTREDIT pas le document quand l'état n'en sait pas assez :
  // `bullesDuDocument` ne reconstruit PAS les pièces (`pieces: []`), donc une
  // pastille dont la source est un vocal traduit serait effacée au premier
  // repeint. On ne décide donc que lorsque les pièces sont CONNUES de l'état —
  // soit qu'il les porte, soit que la ligne n'en ait aucune.
  const annonce = bulle.supprime ? null : annonceDuPrisme(bulle);
  const piecesConnues =
    bulle.pieces.length > 0 || ligne.querySelector('ul.pieces > li[data-piece]:not([data-piece=""])') === null;
  const pastille = ligne.querySelector<HTMLElement>('.meta .langue') ?? (annonce === null ? null : poseAuDebut(ligne, '.meta', clone<HTMLElement>(p.gabarit, '.meta .langue')));
  if (pastille !== null && (annonce !== null || piecesConnues)) {
    pastille.hidden = annonce === null;
    if (annonce !== null) texte(pastille, '.code', annonce.origine);
  }

  montre(ligne, '.modifie', bulle.edite && !bulle.supprime);
  texte(ligne, '.etat-envoi', bulle.envoi === 'hors-ligne' ? FIL.horsLigne : FIL.enAttente);
  if (bulle.raison !== null) texte(ligne, '.echec .raison', bulle.raison);

  const heure = ligne.querySelector<HTMLTimeElement>('time');
  if (heure !== null && bulle.ecritA !== null) {
    if (heure.dateTime !== bulle.ecritA) heure.dateTime = bulle.ecritA;
    const locale = heureLocale(bulle.ecritA, p.langueDuDocument);
    if (heure.textContent !== locale) heure.textContent = locale;
  }

  const accuse = ligne.querySelector<HTMLElement>('.accuse');
  if (accuse !== null) {
    accuse.hidden = !(bulle.deMoi && !bulle.systeme);
    if (accuse.dataset.accuse !== bulle.accuse) {
      accuse.dataset.accuse = bulle.accuse;
      accuse.title = FIL.accuse[bulle.accuse];
      texte(accuse, '.hors-ecran', FIL.accuse[bulle.accuse]);
    }
  }

  const pieces = ligne.querySelector<HTMLElement>('ul.pieces');
  const citations = ligne.querySelector<HTMLElement>('ul.citations');
  if (bulle.supprime) {
    if (pieces !== null) pieces.hidden = true;
    if (citations !== null) citations.hidden = true;
  } else {
    remplisLesPieces(ligne, bulle.pieces, p.gabarit, p.langueDuDocument);
    remplisLesCitations(ligne, bulle.citations, p.gabarit, p.langueDuDocument);
  }
  if (bulle.supprime) {
    const reactions = ligne.querySelector<HTMLElement>('ul.reactions');
    if (reactions !== null) reactions.hidden = true;
    ligne.querySelector('.reagir')?.remove();
  } else {
    remplisLesReactions(ligne, bulle, p.gabarit);
    poseLeBoutonReagir(ligne, bulle, p.gabarit);
  }
};

// Une valeur d'attribut entre guillemets : seuls `\\` et `"` s'y échappent
// (`CSS.escape` manque à jsdom, et n'apporte rien de plus ici).
const attribut = (valeur: string): string => valeur.replace(/["\\]/g, '\\$&');

const trouve = (p: Peintre, bulle: Bulle): HTMLElement | null =>
  p.liste.querySelector<HTMLElement>(`li[data-id="${attribut(bulle.id)}"]`) ??
  (bulle.clientMessageId === null
    ? null
    : p.liste.querySelector<HTMLElement>(`li[data-cid="${attribut(bulle.clientMessageId)}"]`));

const instantDe = (noeud: HTMLElement): number => Date.parse(noeud.dataset.ecrit ?? '') || 0;

/** Les lignes dans l'ordre CHRONOLOGIQUE — l'inverse du DOM, qui va du plus récent au plus ancien. */
const lignesChronologiques = (p: Peintre): readonly HTMLElement[] =>
  [...p.liste.querySelectorAll<HTMLElement>('li.ligne')].reverse();

/**
 * Insérer À SA PLACE dans l'ordre d'écriture — jamais un saut de position. Le
 * DOM va du plus récent au plus ancien : la ligne se pose AVANT la première
 * ligne plus ancienne qu'elle, ou en fin de liste si elle est la plus ancienne.
 */
const insereEnOrdre = (p: Peintre, ligne: HTMLElement, bulle: Bulle): void => {
  const instant = bulle.ecritA === null ? Number.MAX_SAFE_INTEGER : Date.parse(bulle.ecritA);
  const plusAncienne = [...p.liste.querySelectorAll<HTMLElement>('li.ligne')].find((candidat) => instantDe(candidat) <= instant);
  if (plusAncienne === undefined) p.liste.append(ligne);
  else p.liste.insertBefore(ligne, plusAncienne);
};

const estUneSuite = (ligne: HTMLElement, precedente: HTMLElement | null): boolean =>
  precedente !== null &&
  !ligne.classList.contains('systeme') &&
  !precedente.classList.contains('systeme') &&
  (ligne.dataset.auteur ?? '') !== '' &&
  ligne.dataset.auteur === precedente.dataset.auteur &&
  instantDe(ligne) - instantDe(precedente) < 5 * 60_000;

/**
 * Les séparateurs de jour, et le regroupement — recalculés sur l'ordre
 * CHRONOLOGIQUE, dans le fuseau du lecteur. Un séparateur est cloné du gabarit
 * et posé APRÈS la première ligne de son jour dans le DOM (au-dessus d'elle à
 * l'écran) ; ceux que le serveur avait posés dans le sien sont retirés d'abord.
 */
export const recale = (p: Peintre, maintenant: number): void => {
  p.liste.querySelectorAll('li.jour').forEach((jour) => jour.remove());

  let precedente: HTMLElement | null = null;
  let jourPrecedent = '';
  lignesChronologiques(p).forEach((ligne) => {
    const ecrit = ligne.dataset.ecrit ?? '';
    const jour = ecrit === '' ? jourPrecedent : cleDuJour(ecrit);
    if (jour !== jourPrecedent) {
      const separateur = clone<HTMLLIElement>(p.gabaritDeJour, 'li.jour');
      if (separateur !== null) {
        separateur.dataset.jour = jour;
        const heure = separateur.querySelector<HTMLTimeElement>('time');
        if (heure !== null) {
          heure.dateTime = ecrit;
          heure.textContent = libelleDuJour(ecrit, maintenant, p.langueDuDocument);
        }
        ligne.after(separateur);
      }
      jourPrecedent = jour;
      precedente = null;
    }
    classe(ligne, 'suite', estUneSuite(ligne, precedente));
    precedente = ligne;
  });
};

/** Les heures servies en relatif par le serveur passent en heure LOCALE — une fois, au chargement. */
export const recaleLesHeures = (p: Peintre): void => {
  p.liste.querySelectorAll<HTMLTimeElement>('li.ligne time[datetime]').forEach((heure) => {
    const locale = heureLocale(heure.dateTime, p.langueDuDocument);
    if (locale !== '' && heure.textContent !== locale) heure.textContent = locale;
  });
};

/**
 * Projeter l'état sur le DOM, et rendre les lignes qui viennent d'être créées.
 * PEINDRE n'est pas SIGNALER : une page d'historique chargée par le haut, une
 * file hors ligne relue à l'ouverture et un message qui ARRIVE passent tous
 * ici, et seul le dernier est une arrivée — c'est l'appelant qui la teinte
 * (`neuve`) et qui retire la teinte ; mesuré avant, vingt-quatre lignes
 * d'historique restaient surlignées jusqu'au rechargement.
 */
export const peins = (p: Peintre, etat: EtatDuFil, maintenant: number): readonly HTMLElement[] => {
  const neuves: HTMLElement[] = [];

  // Une ligne OPTIMISTE que l'état ne porte plus s'efface : sa bulle servie
  // est déjà là sous un autre nœud (`fil-etat.ts`, `confirme`). Une ligne
  // servie, elle, n'est jamais retirée — supprimée, elle garde sa mention.
  const connues = new Set(etat.bulles.flatMap((bulle) => (bulle.clientMessageId === null ? [bulle.id] : [bulle.id, bulle.clientMessageId])));
  p.liste.querySelectorAll<HTMLElement>('li.ligne[data-cid]').forEach((ligne) => {
    if (!connues.has(ligne.dataset.cid ?? '') && !connues.has(ligne.dataset.id ?? '')) ligne.remove();
  });

  etat.bulles.forEach((bulle) => {
    const existante = trouve(p, bulle);
    if (existante !== null) {
      remplis(existante, bulle, p);
      return;
    }
    const ligne = clone<HTMLElement>(p.gabarit, 'li.ligne');
    if (ligne === null) return;
    remplis(ligne, bulle, p);
    insereEnOrdre(p, ligne, bulle);
    neuves.push(ligne);
  });

  if (neuves.length > 0) recale(p, maintenant);
  peinsLaFrappe(p, etat.frappeurs);
  peinsLaPresence(p, etat.presents.length);
  return neuves;
};

export const peinsLaFrappe = (p: Peintre, frappeurs: readonly Frappeur[]): void => {
  if (p.frappe === null) return;
  const noms = frappeurs.map((f) => f.nom);
  const phrase = noms.length === 0 ? '' : `${noms.join(', ')} ${FIL.frappe}`;
  if (p.frappe.textContent !== phrase) p.frappe.textContent = phrase;
  p.frappe.hidden = phrase === '';
};

/** « N en ligne », dans la fente servie — la même phrase que le serveur, tue à zéro comme lui. */
export const peinsLaPresence = (p: Peintre, presents: number): void => {
  if (p.enLigne === null) return;
  const phrase = ` · ${presents} ${FIL.enLigne}`;
  if (p.enLigne.textContent !== phrase) p.enLigne.textContent = phrase;
  p.enLigne.hidden = presents === 0;
};

/**
 * LA PALETTE — un `<dialog>` cloné du gabarit UNE fois, ouvert en modal (Échap
 * le ferme, le focus y est tenu) ; la promesse rend l'emoji choisi, ou `''`.
 */
export const choisisUneReaction = (p: Peintre): Promise<string> => {
  const existante = document.querySelector<HTMLDialogElement>('dialog.palette');
  const palette = existante ?? clone<HTMLDialogElement>(p.gabaritDePalette, 'dialog.palette');
  if (palette === null) return Promise.resolve('');
  if (existante === null) document.body.append(palette);
  return new Promise((resoud) => {
    palette.returnValue = '';
    palette.addEventListener('close', () => resoud(palette.returnValue), { once: true });
    palette.showModal();
  });
};

/**
 * L'état INITIAL, lu dans ce que le serveur a servi — jamais un second
 * chargement : la page qui vient d'arriver EST le cache (Cache-First). Rendu
 * dans l'ordre chronologique, comme `fil-etat.ts` le tient.
 */
export const bullesDuDocument = (p: Peintre): readonly Bulle[] =>
  lignesChronologiques(p).map((ligne) => {
    const servie = ligne.dataset.servie ?? null;
    const texteServi = ligne.querySelector('.texte')?.textContent ?? '';
    const original = ligne.querySelector('details.original p')?.textContent ?? texteServi;
    const accuse = (ligne.querySelector<HTMLElement>('.accuse')?.dataset.accuse ?? 'envoye') as Accuse;
    const deMoi = ligne.classList.contains('mien');
    return {
      id: ligne.dataset.id ?? '',
      clientMessageId: ligne.dataset.cid ?? null,
      // Ma ligne dit « Vous » : son auteur est le lecteur, dont le document a servi le nom.
      auteur: deMoi ? p.nomDuLecteur : (ligne.querySelector('.nom')?.textContent ?? ''),
      auteurId: ligne.dataset.auteur ?? null,
      anonyme: ligne.querySelector('.anonyme') !== null && !ligne.querySelector<HTMLElement>('.anonyme')!.hidden,
      deMoi,
      systeme: ligne.classList.contains('systeme'),
      texte: texteServi,
      texteOriginal: original,
      langueServie: servie,
      langueOriginale: ligne.dataset.origine ?? null,
      traductions: servie === null ? {} : { [servie]: texteServi },
      ecritA: ligne.dataset.ecrit ?? null,
      protege: ligne.classList.contains('protege'),
      edite: ligne.querySelector('.modifie') !== null && !ligne.querySelector<HTMLElement>('.modifie')!.hidden,
      supprime: ligne.classList.contains('supprime'),
      pieces: [],
      citations: [],
      reactions: [...ligne.querySelectorAll<HTMLElement>('ul.reactions li')].map((item) => ({
        emoji: item.dataset.emoji ?? '',
        nombre: Number(item.querySelector('.nombre')?.textContent ?? '0') || 0,
        mienne: item.querySelector('button.reaction')?.getAttribute('aria-pressed') === 'true',
      })),
      accuse,
      envoi: 'servi' as const,
      raison: null,
    };
  });
