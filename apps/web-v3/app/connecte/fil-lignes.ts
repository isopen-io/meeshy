import { svgDuSprite } from '@/app/actifs-inlines';
import { echappe } from '@/app/socle';
import { annonceDeLaPiece, annonceDuPrisme, type Citation, type GenreDeCitation, type Message, type PieceJointe } from '@/lib/api/fil';
import { FORME_PAR_GENRE, formeDePiece } from '@/lib/api/formes';
import { initiales, teinteDeLAvatar } from '@/lib/avatar';
import { EMOJIS_DE_LA_PALETTE, FIL, libelleDeCitation } from '@/lib/contenu/fil';
import { metaDePiece } from '@/lib/poids';
import { cleDuJour, libelleDuJour } from '@/lib/temps';

import { quand } from './vue';

/**
 * UNE LIGNE DU FIL — le site UNIQUE de sa forme.
 *
 * Le serveur la rend pour chaque message servi ; il la rend aussi UNE fois de
 * plus, vide, dans un `<template id="gabarit-ligne">` que le module de
 * participation CLONE pour peindre ce qui arrive en direct (`lib/realtime/
 * fil-peinture.ts`). Deux rendus, un seul balisage : le module remplit des
 * FENTES (`.nom`, `.texte`, `.langue`, `time`, `.accuse`…), il n'écrit aucune
 * balise — sans quoi la bulle reçue en direct et la bulle rechargée auraient
 * fini par différer, et c'est exactement la jumelle que la conception interdit.
 * Les initiales et la teinte de l'avatar viennent de `lib/avatar.ts`, le même
 * module que le peintre lit : un auteur a UNE couleur, servie ou peinte.
 *
 * LE FIL EST PLAT (charte règle 26) : avatar, nom, texte, méta. Les messages
 * consécutifs d'un même auteur, à moins de cinq minutes, se SUIVENT — l'avatar
 * et le nom ne se répètent pas, le regard file. Les JOURS sont posés par le
 * serveur (`lib/temps.ts`, en UTC — écart possible autour de minuit, corrigé
 * par le module dans le fuseau du lecteur) : sans JavaScript, le fil a ses
 * jours. Un séparateur est un `<li>` ORDINAIRE de la liste — jamais un
 * `role="separator"`, qu'axe refuse dans un `<ol>` (règle `list`).
 *
 * LES RÉACTIONS SONT DES CONTRÔLES : chaque pastille servie est un
 * `<form method="post">` qui bascule l'emoji par la route de la porte (la
 * passerelle expose `POST /reactions` et `DELETE /reactions/:id/:emoji` aux
 * membres comme aux invités, `routes/reactions.ts:71-72`). Sans JavaScript, on
 * réagit donc à ce qui porte déjà une réaction ; le bouton « Réagir » et la
 * palette n'existent que dans le gabarit — le module les clone, et sans lui
 * aucun contrôle inerte n'est rendu (charte règle 7).
 *
 * `lang="xx"` est posé sur tout nœud rendu dans une langue ≠ `<html lang>` :
 * c'est ce qui part À CÔTÉ du texte (cycle 123), et le gate B le lit.
 */

export const IDENTIFIANT_DU_GABARIT = 'gabarit-ligne';
export const IDENTIFIANT_DU_GABARIT_DE_JOUR = 'gabarit-jour';
export const IDENTIFIANT_DU_GABARIT_DE_PALETTE = 'gabarit-palette';

/** Les deux champs du formulaire de réaction — lus par les deux routes du fil. */
export const CHAMP_DE_LA_REACTION = 'reaction';
export const CHAMP_DU_MESSAGE_CIBLE = 'message';

const FENETRE_DE_SUITE_MS = 5 * 60_000;

const avatar = (message: Message): string =>
  message.anonyme
    ? `<span class="avatar fantome" aria-hidden="true">${svgDuSprite('ph-ghost')}</span>`
    : `<span class="avatar ${teinteDeLAvatar(message.auteur)}" aria-hidden="true">${echappe(initiales(message.auteur))}</span>`;

const langAttribut = (langue: string | null, langueDuDocument: string): string =>
  langue !== null && langue !== langueDuDocument ? ` lang="${echappe(langue)}"` : '';

/**
 * LES SIX FORMES D'UNE BULLE, DEUX AXES, DEUX TABLES (issue #4835).
 *
 * Un message se lit dans sa forme propre parce que sa forme DÉRIVE de son
 * type — jamais parce qu'une branche a été écrite pour elle. Deux axes, parce
 * qu'un message peut porter les deux à la fois : ce qu'il PORTE (une pièce
 * jointe : image, vidéo, audio, fichier) et ce qu'il CITE (une provenance, une
 * réponse, une publication). Chaque axe a UNE table (`FORME_PAR_GENRE`,
 * `GLYPHE_PAR_CITATION`) et UNE fonction de rendu (`piece`, `citation`) ; il
 * n'existe aucun `if` par forme, donc aucun endroit où deux formes puissent
 * diverger au premier correctif. Le glyphe est élu par `data-genre` dans la
 * FEUILLE, exactement comme l'accusé élit sa coche : le module qui repeint
 * change un attribut, il ne redessine rien.
 *
 * `FORME_PAR_GENRE` a QUITTÉ ce fichier (`lib/api/formes.ts`) : déclarée ici en
 * `const` non exportée, elle n'était la table que du rendu SERVI, pendant que
 * le peintre du temps réel, `lib/api/fil.ts` et `lib/poids.ts` réécrivaient la
 * même règle en comparaisons littérales de genre. Le même message avait deux
 * formes selon qu'il arrivait par le document ou par le socket.
 */

/**
 * TOUS les glyphes d'une table sont rendus, et `data-genre` en élit UN dans la
 * feuille. C'est ce qui permet au module de participation de changer un
 * attribut plutôt que de redessiner un tracé — la même mécanique que l'accusé
 * et ses deux coches.
 */
const glyphes = (table: Readonly<Record<string, string>>): string =>
  Object.entries(table)
    .map(([genre, nom]) => `<span class="glyphe" data-genre="${genre}" aria-hidden="true">${svgDuSprite(nom)}</span>`)
    .join('');

const GLYPHE_PAR_GENRE: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(FORME_PAR_GENRE).map(([genre, forme]) => [genre, forme.glyphe]),
);

/**
 * UN BLOC PAR PIÈCE — ce que la cible dessine, et ce que le rendu servi
 * empilait en DEUX (une affiche de téléchargement, puis un lecteur natif : le
 * même fichier annoncé deux fois, avec son nom de fichier en texte primaire
 * d'un bloc que `cible/rich.png` ne dessine pas).
 *
 * Le genre décide du bloc, et lui seul (`lib/api/formes.ts`) :
 *
 *   • `lecteur === null` (image, fichier) ⇒ une AFFICHE : un `<a>` au glyphe de
 *     son genre. Rien ne se télécharge avant le geste — pas d'`<img>`, donc
 *     aucune photo du fil ne part sur une 3G rurale sans qu'on l'ait demandée.
 *     Le lien OUVRE UN ONGLET (`target="_blank" rel="noopener"`) : `download`
 *     est IGNORÉ hors origine — et la passerelle est une autre origine que le
 *     document (`gate.meeshy.me` face à `meeshy.me`) —, si bien que toucher une
 *     pièce jointe NAVIGUAIT l'onglet vers le fichier brut : le fil, la position
 *     de lecture et le socket étaient perdus, et rien ne l'annonçait. Le geste
 *     est désormais NOMMÉ dans le nom accessible de la cible.
 *   • `lecteur !== null` (audio, vidéo) ⇒ un LECTEUR : un `<details>` dont le
 *     `<summary>` EST l'affiche de lecture (rond `ph-fill-play`, durée et poids
 *     posés dessus), et dont le contenu est le média natif en `preload="none"`.
 *     Un `<details>` s'ouvre SANS JavaScript : zéro octet avant la pression,
 *     et la commande accessible que le navigateur donne gratuitement.
 *
 * L'adresse est ABSOLUE, sur l'origine publique de la passerelle
 * (`lib/api/fil.ts`, `urlDePiece`) : un chemin relatif se résoudrait contre le
 * document, où la passerelle n'est pas. La SOURCE du lecteur est la PISTE
 * (`piece.piste`), celle que la langue du texte servi a élue : on entend ce
 * qu'on lit (cycle 128).
 */
const etiquetteDePiece = (nom: string, meta: string): string =>
  '<span class="etiquette">' +
  `<span class="nom-de-piece">${echappe(nom)}</span>` +
  `<span class="poids"${meta === '' ? ' hidden' : ''}>${echappe(meta)}</span>` +
  '</span>';

const afficheDePiece = (url: string, nom: string, meta: string): string =>
  `<a class="media" href="${echappe(url)}" target="_blank" rel="noopener" aria-label="${echappe(FIL.telecharger(nom, meta))}">` +
  `<span class="vignette">${glyphes(GLYPHE_PAR_GENRE)}</span>` +
  etiquetteDePiece(nom, meta) +
  '</a>';

const lecteurDePiece = ({ balise, source, nom, meta }: { readonly balise: 'audio' | 'video'; readonly source: string; readonly nom: string; readonly meta: string }): string =>
  '<details class="media lecteur">' +
  '<summary>' +
  `<span class="lire" aria-hidden="true">${svgDuSprite('ph-fill-play')}</span>` +
  `<span class="hors-ecran">${echappe(FIL.lire(nom, meta))}</span>` +
  '<span class="rail" aria-hidden="true"></span>' +
  etiquetteDePiece(nom, meta) +
  '</summary>' +
  `<${balise} controls preload="none" src="${echappe(source)}"></${balise}>` +
  '</details>';

/**
 * CE QU'UN TRANSCRIT ANNONCE — et pourquoi ce n'est plus « Sous-titres fr ».
 *
 * La pastille de sous-titres PROMETTAIT une piste que le `<video>` ne porte
 * pas : la passerelle n'expose aucun WebVTT, et fabriquer des minutages depuis
 * un texte plein serait inventer (régime 3). Un tap sur « lire » donnait donc
 * la vidéo espagnole SANS sous-titres, sous un badge qui en promettait en
 * français — le Prisme ANNONCÉ sans être APPLIQUÉ (cycle 123).
 *
 * Ce que l'écran sert VRAIMENT, il le dit : la transcription est traduite, elle
 * se lit juste dessous, et l'original est à un geste. La phrase vient de la
 * planche (« Transcrit du yoruba · lire en français »), au CODE près — charte
 * règle 23.
 */
const transcritDePiece = (piece: PieceJointe, langueDuDocument: string): string => {
  if (piece.transcription === null) return '';
  const annonce = annonceDeLaPiece(piece);
  const servie = piece.langueServie ?? piece.langueDeTranscription;
  const original =
    annonce === null || piece.transcriptionOriginale === null
      ? ''
      : '<details class="transcrit-original">' +
        `<summary>${svgDuSprite('ph-text-aa')}${echappe(FIL.original)}</summary>` +
        `<p${langAttribut(annonce.origine, langueDuDocument)}>${echappe(piece.transcriptionOriginale)}</p></details>`;
  return (
    `<p class="transcription"${langAttribut(servie, langueDuDocument)}>` +
    `<span class="hors-ecran">${echappe(FIL.transcription)} </span><span class="texte-transcrit">${echappe(piece.transcription)}</span></p>` +
    (annonce === null ? '' : `<p class="transcrit">${echappe(FIL.transcrit(annonce.origine, annonce.servie))}</p>`) +
    original
  );
};

const piece = (piece: PieceJointe, langueDuDocument: string): string => {
  const forme = formeDePiece(piece.genre);
  const meta = metaDePiece(piece);
  const bloc =
    forme.lecteur === null
      ? afficheDePiece(piece.url, piece.nom, meta)
      : lecteurDePiece({ balise: forme.lecteur, source: piece.piste, nom: piece.nom, meta });

  return `<li data-piece="${echappe(piece.id)}" data-genre="${piece.genre}">${bloc}${transcritDePiece(piece, langueDuDocument)}</li>`;
};

/**
 * Le gabarit d'une pièce porte les DEUX blocs — l'affiche et le lecteur — et
 * les DEUX médias natifs. Le module en RETIRE ceux que le genre ne demande pas
 * (`fil-peinture.ts`), il n'en compose aucun : une pièce peinte et une pièce
 * servie sont alors le même balisage, au nœud près.
 */
const gabaritDePiece = (): string =>
  '<li data-piece="" data-genre="fichier">' +
  afficheDePiece('', '', '') +
  '<details class="media lecteur"><summary>' +
  `<span class="lire" aria-hidden="true">${svgDuSprite('ph-fill-play')}</span>` +
  '<span class="hors-ecran"></span>' +
  '<span class="rail" aria-hidden="true"></span>' +
  etiquetteDePiece('', '') +
  '</summary>' +
  '<audio controls preload="none"></audio>' +
  '<video controls preload="none"></video>' +
  '</details>' +
  `<p class="transcription" hidden><span class="hors-ecran">${echappe(FIL.transcription)} </span><span class="texte-transcrit"></span></p>` +
  '<p class="transcrit" hidden></p>' +
  '<details class="transcrit-original" hidden>' +
  `<summary>${svgDuSprite('ph-text-aa')}${echappe(FIL.original)}</summary><p></p></details>` +
  '</li>';

/**
 * LES CITATIONS — le second axe. La forme est la même pour les trois genres :
 * une vignette au glyphe du genre, le libellé que `libelleDeCitation` compose
 * (site unique, partagé avec le module), et l'aperçu de ce qui est cité, avec
 * sa langue quand la passerelle la sert.
 *
 * AUCUNE n'est un CONTRÔLE. La planche fait mener la vignette d'une story à
 * `/stories/:id` et celle d'un média à `/chats/:id/medias` — deux routes que la
 * v3 ne sert pas encore : la charte règle 7 tranche (« un `<a href>` vers une
 * route SERVIE — tant que sa destination n'existe pas, il n'est pas rendu »),
 * et rien d'inerte n'est offert au doigt.
 */
const GLYPHE_PAR_CITATION: Readonly<Record<GenreDeCitation, string>> = {
  transfert: 'ph-arrow-bend-up-right',
  reponse: 'ph-chat-teardrop-text',
  story: 'ph-sparkle',
};

const citation = (citation: Citation, langueDuDocument: string): string =>
  `<li class="citation" data-genre="${citation.genre}" data-cite="${echappe(citation.cible)}">` +
  `<span class="vignette">${glyphes(GLYPHE_PAR_CITATION)}</span>` +
  '<span class="dit">' +
  `<span class="quoi">${echappe(libelleDeCitation(citation))}</span>` +
  (citation.apercu === ''
    ? '<span class="apercu" hidden></span>'
    : `<span class="apercu"${langAttribut(citation.langue, langueDuDocument)}>${echappe(citation.apercu)}</span>`) +
  '</span></li>';

const citationsHtml = (message: Message, langueDuDocument: string): string =>
  message.citations.length === 0
    ? ''
    : `<ul class="citations" aria-label="${echappe(FIL.citations)}">${message.citations.map((c) => citation(c, langueDuDocument)).join('')}</ul>`;

/** Le gabarit d'une citation : les TROIS glyphes, dont `data-genre` élit un. */
const gabaritDeCitation = (): string =>
  '<ul class="citations" aria-label="' +
  echappe(FIL.citations) +
  '" hidden><li class="citation" data-genre="reponse" data-cite="">' +
  `<span class="vignette">${glyphes(GLYPHE_PAR_CITATION)}</span>` +
  '<span class="dit"><span class="quoi"></span><span class="apercu"></span></span>' +
  '</li></ul>';

const pieces = (message: Message, langueDuDocument: string): string =>
  message.pieces.length === 0
    ? ''
    : `<ul class="pieces">${message.pieces.map((p) => piece(p, langueDuDocument)).join('')}</ul>`;

/**
 * UNE PASTILLE DE RÉACTION EST UN FORMULAIRE : le même geste bascule l'emoji
 * sans JavaScript (POST vers la porte, Post/Redirect/Get) et avec (le module
 * intercepte la soumission et émet `reaction:add` / `reaction:remove`).
 * `aria-pressed` dit si la réaction est la MIENNE — ce que la liste REST ne
 * sert pas (`messages-list-query.ts`, #4177) : servie, la pastille est
 * « inconnue » ; le module l'apprend des événements `userId === moi`.
 */
const pastilleDeReaction = ({
  emoji,
  nombre,
  messageId,
  adresse,
}: {
  readonly emoji: string;
  readonly nombre: number;
  readonly messageId: string;
  readonly adresse: string;
}): string =>
  `<li data-emoji="${echappe(emoji)}"><form method="post" action="${echappe(adresse)}" class="reagir-par">` +
  `<input type="hidden" name="${CHAMP_DE_LA_REACTION}" value="${echappe(emoji)}"/>` +
  `<input type="hidden" name="${CHAMP_DU_MESSAGE_CIBLE}" value="${echappe(messageId)}"/>` +
  `<button type="submit" class="reaction" data-emoji="${echappe(emoji)}"><span class="emoji">${echappe(emoji)}</span> <span class="nombre">${nombre}</span></button>` +
  '</form></li>';

export const reactionsHtml = (message: Message, adresse: string): string =>
  message.reactions.length === 0
    ? `<ul class="reactions" aria-label="${echappe(FIL.reactions)}" hidden></ul>`
    : `<ul class="reactions" aria-label="${echappe(FIL.reactions)}">` +
      message.reactions
        .map((r) => pastilleDeReaction({ emoji: r.emoji, nombre: r.nombre, messageId: message.id, adresse }))
        .join('') +
      '</ul>';

/**
 * L'accusé porte ses DEUX glyphes — une coche pour « envoyé », deux pour « reçu »
 * et « lu » — et `data-accuse` élit celui qui se voit (feuille du fil). Le
 * module qui fait passer une ligne de « reçu » à « lu » ne dessine rien : il
 * change un attribut, et le glyphe suit.
 */
const accuseHtml = (accuse: Message['accuse']): string =>
  `<span class="accuse" data-accuse="${accuse}" title="${echappe(FIL.accuse[accuse])}">` +
  `<span class="coche" aria-hidden="true">${svgDuSprite('ph-check')}</span>` +
  `<span class="coches" aria-hidden="true">${svgDuSprite('ph-checks')}</span>` +
  `<span class="hors-ecran">${echappe(FIL.accuse[accuse])}</span></span>`;

const accuse = (message: Message): string => (message.deMoi && !message.systeme ? accuseHtml(message.accuse) : '');

/**
 * La pastille de langue (charte règle 22) : `ph-translate` + le code de la
 * langue d'ORIGINE, rendue SEULEMENT quand une traduction est servie. Sur un
 * message déjà dans la langue du lecteur, elle n'apprendrait rien.
 *
 * Ce qu'elle annonce vient d'`annonceDuPrisme` (`lib/api/fil.ts`) — le TEXTE
 * d'abord, puis ce que le message PORTE : sur un message dont le vocal est le
 * seul contenu, elle disparaissait avec le texte absent, et le lecteur ne
 * savait pas qu'il lisait une transcription traduite. La cible la dessine
 * pourtant sous la vidéo SANS texte de `cible/rich.png`.
 */
const pastille = (message: Message): string => {
  const annonce = annonceDuPrisme(message);
  return annonce === null
    ? ''
    : `<span class="langue" title="${echappe(FIL.traduitDepuis)}">${svgDuSprite('ph-translate')}<span class="code">${echappe(annonce.origine)}</span></span>`;
};

const original = (message: Message, langueDuDocument: string): string =>
  message.langueServie !== null && !message.protege && !message.supprime
    ? `<details class="original"><summary>${svgDuSprite('ph-text-aa')}${echappe(FIL.original)}</summary>` +
      `<p${langAttribut(message.langueOriginale, langueDuDocument)}>${echappe(message.texteOriginal)}</p></details>`
    : '';

const texte = (message: Message, langueDuDocument: string): string => {
  if (message.supprime) return `<p class="texte">${echappe(FIL.supprime)}</p>`;
  const langue = message.langueServie ?? message.langueOriginale;
  return `<p class="texte"${langAttribut(langue, langueDuDocument)}>${echappe(message.texte)}</p>`;
};

const classes = (message: Message, suite: boolean): string =>
  [
    'ligne',
    message.deMoi ? 'mien' : '',
    suite ? 'suite' : '',
    message.systeme ? 'systeme' : '',
    message.supprime ? 'supprime' : '',
    message.protege ? 'protege' : '',
  ]
    .filter((classe) => classe !== '')
    .join(' ');

const attributs = (message: Message): string =>
  `id="m-${echappe(message.id)}" data-id="${echappe(message.id)}"` +
  (message.clientMessageId === null ? '' : ` data-cid="${echappe(message.clientMessageId)}"`) +
  (message.auteurId === null ? '' : ` data-auteur="${echappe(message.auteurId)}"`) +
  (message.ecritA === null ? '' : ` data-ecrit="${echappe(message.ecritA)}"`) +
  (message.langueServie === null ? '' : ` data-servie="${echappe(message.langueServie)}"`) +
  (message.langueOriginale === null ? '' : ` data-origine="${echappe(message.langueOriginale)}"`);

/**
 * Deux messages se SUIVENT quand le même auteur écrit deux fois en moins de
 * cinq minutes — jamais autour d'une ligne système, qui coupe le fil, ni à
 * travers un séparateur de jour.
 */
export const estUneSuite = (message: Message, precedent: Message | null): boolean =>
  precedent !== null &&
  !message.systeme &&
  !precedent.systeme &&
  message.auteurId !== null &&
  message.auteurId === precedent.auteurId &&
  message.ecritA !== null &&
  precedent.ecritA !== null &&
  cleDuJour(message.ecritA) === cleDuJour(precedent.ecritA) &&
  Date.parse(message.ecritA) - Date.parse(precedent.ecritA) < FENETRE_DE_SUITE_MS;

const heure = (message: Message, maintenant: number): string =>
  message.ecritA === null
    ? '<time></time>'
    : `<time datetime="${echappe(message.ecritA)}">${echappe(quand(message.ecritA, maintenant))}</time>`;

/** Le séparateur de jour — UN `<li>` ordinaire, `data-jour` porte la clé locale que le module relit. */
export const separateurDeJour = ({ iso, maintenant, langueDuDocument }: { readonly iso: string; readonly maintenant: number; readonly langueDuDocument: string }): string =>
  `<li class="jour" data-jour="${echappe(cleDuJour(iso))}"><time datetime="${echappe(iso)}">${echappe(libelleDuJour(iso, maintenant, langueDuDocument))}</time></li>`;

export const ligne = ({
  message,
  precedent,
  maintenant,
  langueDuDocument,
  adresse,
}: {
  readonly message: Message;
  readonly precedent: Message | null;
  readonly maintenant: number;
  readonly langueDuDocument: string;
  /** L'adresse de la porte — l'`action` des formulaires de réaction. */
  readonly adresse: string;
}): string => {
  if (message.systeme) {
    return (
      `<li class="${classes(message, false)}" ${attributs(message)}>` +
      `<div class="corps"><p class="texte">${svgDuSprite('ph-ghost')} ${echappe(message.texte)}</p>${heure(message, maintenant)}</div>` +
      '</li>'
    );
  }

  return (
    `<li class="${classes(message, estUneSuite(message, precedent))}" ${attributs(message)}>` +
    avatar(message) +
    '<div class="corps">' +
    '<p class="qui">' +
    `<span class="nom">${echappe(message.deMoi ? FIL.vous : message.auteur)}</span>` +
    (message.anonyme ? `<span class="anonyme">${svgDuSprite('ph-ghost')}${echappe(FIL.anonyme)}</span>` : '') +
    '</p>' +
    // L'ORDRE de la cible : ce que le message CITE, puis ce qu'il PORTE, puis
    // ce qu'il DIT. Une photo suivie de sa légende, jamais une légende suivie
    // de sa photo — et une citation au-dessus de la réponse qu'elle motive.
    citationsHtml(message, langueDuDocument) +
    pieces(message, langueDuDocument) +
    texte(message, langueDuDocument) +
    original(message, langueDuDocument) +
    '<p class="meta">' +
    pastille(message) +
    (message.edite ? `<span class="modifie">${echappe(FIL.modifie)}</span>` : '') +
    // La PLACE du bouton « Réagir », réservée : le module y pose le bouton sans
    // déplacer l'heure ni l'accusé (sondé : sans elle, ils glissaient de 56 px à
    // l'arrivée du module). Vide, elle n'est pas un contrôle — rien d'inerte.
    '<span class="reagir-slot"></span>' +
    heure(message, maintenant) +
    accuse(message) +
    '</p>' +
    reactionsHtml(message, adresse) +
    '</div>' +
    '</li>'
  );
};

/**
 * Les lignes, et leurs JOURS. `messages` arrive dans l'ordre CHRONOLOGIQUE ;
 * la liste est SERVIE du plus récent au plus ancien — c'est ce que la feuille
 * retourne (`column-reverse`) pour que le document arrive en bas de lui-même,
 * sans un script pour le faire sauter (`aria-label` de la liste : « du plus
 * récent au plus ancien »). Un séparateur de jour SUIT donc, dans le DOM, la
 * première ligne de son jour — au-dessus d'elle à l'écran, exactement où le
 * module le repose (`fil-peinture.ts`, `recale`). Un message sans instant
 * s'attache au jour courant.
 */
export const lignes = ({
  messages,
  maintenant,
  langueDuDocument,
  adresse,
}: {
  readonly messages: readonly Message[];
  readonly maintenant: number;
  readonly langueDuDocument: string;
  readonly adresse: string;
}): string =>
  messages
    .map((message, rang) => {
      const precedent = rang === 0 ? null : (messages[rang - 1] ?? null);
      const jour = message.ecritA === null ? '' : cleDuJour(message.ecritA);
      const jourPrecedent = precedent?.ecritA === null || precedent?.ecritA === undefined ? '' : cleDuJour(precedent.ecritA);
      const separateur =
        message.ecritA !== null && jour !== jourPrecedent
          ? separateurDeJour({ iso: message.ecritA, maintenant, langueDuDocument })
          : '';
      return ligne({ message, precedent, maintenant, langueDuDocument, adresse }) + separateur;
    })
    .reverse()
    .join('');

/** Le bouton « Réagir », dans sa place — cloné par le module dans chaque ligne ; jamais servi inerte. */
const boutonReagir = (): string =>
  `<span class="reagir-slot"><button type="button" class="reagir" aria-label="${echappe(FIL.reagir)}">${svgDuSprite('ph-smiley')}</button></span>`;

/**
 * Les GABARITS que le module clone — la ligne complète, chaque fente présente,
 * plus les deux états qui n'existent qu'avec JavaScript : l'attente (horloge,
 * « Envoi en cours ») et l'échec (« Non envoyé », avec son bouton). Ces deux-là
 * ne sont pas dans les lignes servies : sans JavaScript, rien n'attend ni
 * n'échoue à l'écran — la page revient, ou l'erreur est peinte par le serveur.
 * Le séparateur de jour et la palette de réactions ont chacun le leur.
 */
export const gabaritDeLigne = (adresse: string): string =>
  `<template id="${IDENTIFIANT_DU_GABARIT}">` +
  '<li class="ligne" data-id="">' +
  '<span class="avatar t1" aria-hidden="true"></span>' +
  `<span class="avatar fantome" aria-hidden="true" hidden>${svgDuSprite('ph-ghost')}</span>` +
  '<div class="corps">' +
  `<p class="qui"><span class="nom"></span><span class="anonyme">${svgDuSprite('ph-ghost')}${echappe(FIL.anonyme)}</span></p>` +
  gabaritDeCitation() +
  `<ul class="pieces" hidden>${gabaritDePiece()}</ul>` +
  '<p class="texte"></p>' +
  `<details class="original"><summary>${svgDuSprite('ph-text-aa')}${echappe(FIL.original)}</summary><p></p></details>` +
  '<p class="meta">' +
  `<span class="langue" title="${echappe(FIL.traduitDepuis)}">${svgDuSprite('ph-translate')}<span class="code"></span></span>` +
  `<span class="modifie">${echappe(FIL.modifie)}</span>` +
  `<span class="attente">${svgDuSprite('ph-clock')}<span class="etat-envoi">${echappe(FIL.enAttente)}</span></span>` +
  `<span class="echec">${svgDuSprite('ph-warning-circle')}<span class="raison">${echappe(FIL.echec)}</span>` +
  `<button type="button" class="action discrete reessayer">${echappe(FIL.reessayer)}</button></span>` +
  boutonReagir() +
  '<time></time>' +
  accuseHtml('envoye') +
  '</p>' +
  `<ul class="reactions" aria-label="${echappe(FIL.reactions)}" hidden>${pastilleDeReaction({ emoji: '', nombre: 0, messageId: '', adresse })}</ul>` +
  '</div>' +
  '</li>' +
  '</template>' +
  `<template id="${IDENTIFIANT_DU_GABARIT_DE_JOUR}"><li class="jour" data-jour=""><time></time></li></template>` +
  `<template id="${IDENTIFIANT_DU_GABARIT_DE_PALETTE}">` +
  `<dialog class="palette" aria-label="${echappe(FIL.choisirUneReaction)}">` +
  `<form method="dialog"><ul>` +
  EMOJIS_DE_LA_PALETTE.map((emoji) => `<li><button type="submit" class="emoji" value="${echappe(emoji)}">${echappe(emoji)}</button></li>`).join('') +
  `</ul><button type="submit" class="action discrete fermer" value="">${echappe(FIL.fermer)}</button></form>` +
  '</dialog>' +
  '</template>';
