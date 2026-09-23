import { kindOf } from './message';
import type { Delivery } from './message';
import { forwardAttributionOf, forwardLabelOf, systemRowOf, systemRowText } from './message-badges';
import { bodyKindOf, placeOf, storyCitationOf } from './message-body';
import { time } from '@/lib/grouping';
import { rendersContent, type ProtectionKind, type RevealPhase } from '@/lib/reading-mode/protection';
import type { Attachment, Message } from '@/lib/api/types';
import { translate, type InterfaceCatalogKey } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * LE LIBELLÉ D'ACCESSIBILITÉ D'UN MESSAGE — SITE UNIQUE, partagé par la
 * rangée plate (Focal/Script) et la bulle : `routes/thread-modes.tsx` pose
 * `role="article"` + `aria-label` sur `[data-row]`, LA MÊME ancre pour les
 * deux peaux (#5774, travail 2/3). Avant ce module, l'`aria-label` posé là
 * valait `Message de ${sender}` — un lecteur d'écran annonçait l'auteur et
 * RIEN d'autre : ni le texte servi, ni une citation, ni un média, ni un
 * accusé, ni un badge.
 *
 * Port de `MessageAccessibilityLabelComposer.compose`
 * (`apps/ios/Meeshy/Features/Main/Focal/Preferences/MessageAccessibilityLabelComposer.swift:36-93`),
 * DANS L'ORDRE iOS : « Sans compte » (participant `anonymous`, jamais pour
 * soi — écart ASSUMÉ ajouté par la revue #5935, voir plus bas) → auteur (ou
 * « Vous » pour un message à soi — le NOM est alors ABSENT, pas remplacé) →
 * citation → texte SERVI → pièces jointes (images/vidéos/audios/fichiers) →
 * heure → accusé de réception (SEULEMENT sur un message à soi) → modifié →
 * épinglé → éphémère → réactions.
 *
 * Chaque segment est OMIS quand il n'a rien à dire — jamais une virgule
 * flottante ni un « undefined » : un message texte simple sans historique
 * rend `"Bruno Bêta, Bonjour, 09:02"`, pas plus.
 *
 * ET LA PROTECTION GOUVERNE CE LIBELLÉ (revue #5774). La première forme de ce
 * module composait `servedText` SANS regarder `protectionOf` : la rangée
 * peignait « Message supprimé » ou un contenu FLOUTÉ pendant que
 * `aria-label` annonçait le texte EN CLAIR à tout lecteur d'écran — mesuré
 * sur `/c/c-protection` : `aria-label="Amina Diallo, Le code du coffre est
 * 4817-2290., 10:14"`, et `check-thread-states.mjs` rouge sur ses quatre
 * assertions « nulle part dans le DOM — attributs compris ».
 *
 * C'est la leçon 275 du `CLAUDE.md` racine, rejouée sur une autre charge :
 * « une protection de CONTENU se mesure sur tout ce que la charge
 * TRANSPORTE ». Ici la charge est le NOM ACCESSIBLE, et ce qui partait à
 * côté du pixel gardé était le secret lui-même. La règle a donc UN site :
 * `composeMessageLabel` prend la PROTECTION et sert le même placeholder que
 * la surface, jamais le texte.
 */

/**
 * LE VOCABULAIRE DU PLACEHOLDER — celui que les surfaces PEIGNENT déjà
 * (`components/protected-content.tsx` : `ProtectionNotice` pour
 * supprimé/brûlé, `aria-label="Contenu masqué"` pour le voile) : un second
 * vocabulaire ferait dire deux choses différentes à l'œil et à l'oreille
 * pour un même état.
 */
const PROTECTED_LABEL_KEY = {
  deleted: 'message.deleted',
  burned: 'message.burned.a11y',
  expired: 'message.expired.a11y',
  veiled: 'message.veiled',
  /** Le contenu N'EST PAS dans la charge — voir `ProtectedContent.revealable`
   * (#6862). Distinct de `veiled`, où le texte est là et se révèle : annoncer
   * « masqué » ferait attendre un geste qui n'existe pas. */
  withheld: 'message.withheld',
} as const satisfies Readonly<Record<Exclude<ProtectionKind, 'standard'> | 'withheld', InterfaceCatalogKey>>;

const pluralize = (count: number, singular: string, plural: string): string =>
  `${count} ${count === 1 ? singular : plural}`;

/** Minuscule le PREMIER caractère seul — un nom de groupe transféré (« Salon »)
 * ne doit pas perdre sa majuscule au milieu de la phrase. La casse se plie à
 * la LANGUE du libellé (#7337), jamais au français : `toLocaleLowerCase` n'a
 * de règle propre qu'en turc, mais poser `'fr-FR'` sur un texte allemand ou
 * arabe déclarait une langue que ce texte n'a pas. */
const lowerFirst = (text: string, language: InterfaceLanguage): string =>
  text.length === 0 ? text : text.charAt(0).toLocaleLowerCase(language) + text.slice(1);

/**
 * Compte les pièces jointes PAR CATÉGORIE, dans l'ordre iOS : images, vidéos,
 * audios, fichiers.
 *
 * EXPORTÉ (#7020) pour que le CONSTAT peint par `ProtectionNotice` sur un
 * message dont la passerelle a RETENU le contenu emploie exactement le même
 * vocabulaire que l'oreille : « un second vocabulaire ferait dire deux choses
 * différentes à l'œil et à l'oreille pour un même état » (doc-comment de
 * `PROTECTED_LABEL`, quelques lignes plus haut). Il n'y a rien à dupliquer —
 * `kindOf` et `pluralize` vivent déjà ici.
 */
export function attachmentSegments(attachments: readonly Attachment[] | undefined): readonly string[] {
  if (attachments === undefined || attachments.length === 0) return [];
  const counts = { image: 0, video: 0, audio: 0, file: 0 };
  for (const attachment of attachments) counts[kindOf(attachment)] += 1;

  const segments: string[] = [];
  if (counts.image > 0) segments.push(pluralize(counts.image, 'image', 'images'));
  if (counts.video > 0) segments.push(pluralize(counts.video, 'vidéo', 'vidéos'));
  if (counts.audio > 0) segments.push(pluralize(counts.audio, 'audio', 'audios'));
  if (counts.file > 0) segments.push(pluralize(counts.file, 'fichier', 'fichiers'));
  return segments;
}

/** Le mot d'accusé, dans le vocabulaire déjà servi par le pied de rangée (`Check`, `message-blocks.tsx`). */
function deliveryWord(delivery: Delivery | null): string | undefined {
  switch (delivery) {
    case 'pending':
      return 'en cours d’envoi';
    case 'sent':
      return 'envoyé';
    case 'delivered':
      return 'distribué';
    case 'read':
      return 'lu';
    case null:
      return undefined;
  }
}

/** Les réactions, dans l'ordre stable de `Object.entries` — même vocabulaire que `reactionEntries`. */
function reactionsSegment(reactionSummary: Record<string, number> | undefined): string | undefined {
  if (reactionSummary === undefined) return undefined;
  const entries = Object.entries(reactionSummary).filter(([, count]) => count > 0);
  if (entries.length === 0) return undefined;
  return `réactions : ${entries.map(([emoji, count]) => `${emoji} ${count}`).join(', ')}`;
}

export type MessageLabelInput = {
  readonly message: Message;
  /** `isMineOf(message, viewerId)` — jamais recalculé ici (un seul site de la règle). */
  readonly isMine: boolean;
  /** Le texte SERVI par le Prisme (`served(...).text`), jamais `message.content` brut. */
  readonly servedText: string;
  /** `checkStatusOf(message, localDelivery)` — `null` hors accusé à peindre (message d'autrui, envoi échoué). */
  readonly delivery: Delivery | null;
  /**
   * `protectionOf(message, now)` — la MÊME loi que la surface consomme
   * (`lib/reading-mode/protection.ts`), jamais recalculée ici. OBLIGATOIRE :
   * un défaut à `'standard'` rendrait la fuite silencieuse au premier
   * appelant qui l'oublie.
   */
  readonly protection: ProtectionKind;
  /**
   * LE CONTENU N'EST PAS DANS LA CHARGE (#6862) — le même verdict SERVI que
   * `ProtectedContent.revealable` consomme, et pour la même raison : le
   * libellé lu doit dire ce que la rangée PEINT. Sans lui, un lecteur d'écran
   * annonçait le nom de l'auteur puis rien du tout, là où l'œil voit
   * « Contenu retenu ».
   */
  readonly contentWithheld?: boolean;
  /**
   * LA PHASE DE RÉVÉLATION (#7092) — l'autre moitié de la matrice que
   * `rendersContent` consulte : « la rangée monte-t-elle ses enfants ? ».
   * Sans elle, le libellé rejouerait la protection par un `if` recopié, la
   * jumelle exacte que le doc-comment de `lib/reading-mode/protection.ts`
   * interdit — et que `protected-content.tsx:183-190` refuse déjà pour le
   * rendu.
   *
   * DÉFAUT `hidden`, ET C'EST LA VÉRITÉ DE L'APPELANT D'AUJOURD'HUI :
   * `thread-modes.tsx:378` pose `aria-label` sur le nœud PARENT de
   * `ProtectedContent`, qui tient la phase en état LOCAL — une rangée voilée
   * y est donc au repos au moment où le libellé se compose. Le jour où cette
   * phase remontera, ce paramètre dit déjà quoi en faire ; d'ici là il tient
   * la branche fermée, jamais ouverte par défaut (fail-closed).
   */
  readonly phase?: RevealPhase;
  /**
   * LA LANGUE D'INTERFACE (#7337) — celle du LECTEUR, jamais celle du
   * contenu : ce libellé est de l'interface (tombstone, badge de transfert),
   * pas du message. `thread-modes.tsx` la lit une fois par rendu de liste
   * (`currentInterfaceLanguage()`), jamais une fois par rangée.
   *
   * ELLE EST OBLIGATOIRE, et c'est la même discipline que `protection`
   * ci-dessus : un défaut silencieux ferait servir une langue au premier
   * appelant qui l'oublie, et le défaut serait invisible — le français
   * s'affiche « correctement » pour qui le parle.
   */
  readonly language: InterfaceLanguage;
};

/**
 * Compose le libellé complet d'une rangée de message — appelé UNE fois par
 * rangée montée (Focal, Script ou Bulles), jamais recalculé par sous-partie.
 */
export function composeMessageLabel({
  message,
  isMine,
  servedText,
  delivery,
  protection,
  language,
  contentWithheld = false,
  phase = { phase: 'hidden' },
}: MessageLabelInput): string {
  /**
   * UN MESSAGE SYSTÈME EST SYSTÈME AVANT D'ÊTRE SUPPRIMÉ (#5936, même loi que
   * `systemRowOf` — « un message système est système AVANT d'être
   * supprimé », `BubbleContentBuilder.swift:52`) : son libellé est le TEXTE
   * de la notice SEUL, jamais l'auteur ni l'heure — la rangée qu'il peint
   * (`SystemNotice`) ne montre rien d'autre.
   */
  const systemRow = systemRowOf(message);
  if (systemRow !== null) return systemRowText(systemRow);

  /**
   * TROIS ÉTATS NE PEIGNENT AUCUN CHROME — un tombstone plat, ou rien du
   * tout (`focal-row.tsx:192` rend un nœud VIDE pour l'expiré). Leur libellé
   * est le tombstone SEUL : ni auteur, ni heure, ni pièce jointe — rien de ce
   * que la rangée ne montre pas.
   */
  if (protection === 'deleted' || protection === 'burned' || protection === 'expired') {
    return translate(language, PROTECTED_LABEL_KEY[protection]);
  }

  const segments: string[] = [];

  /**
   * « SANS COMPTE » ENTRE DANS LE LIBELLÉ (revue #5935, défauts 1/4) — un
   * écart ASSUMÉ avec iOS, documenté en D-32. `FocalIdentityHeader.swift`
   * pose le fantôme `theatermasks.fill` comme un NŒUD SÉPARÉ, absorbé sans
   * reste par `.accessibilityElement(children: .combine)` — sur iOS le
   * marqueur est donc PRONONCÉ, lui aussi, juste avant le nom. Le web pose
   * la même information en `aria-label` du glyphe (`GlyphSvg`,
   * `focal-row.tsx`) ; masquer tout `[data-identity]` pour éviter la
   * double lecture (voir `thread-modes.tsx`) le ferait taire. Le composer
   * ICI, dans le même ordre visuel (avant le nom), tient donc la parité que
   * l'iconographie seule ne suffit plus à porter.
   */
  const isAnonymous = !isMine && message.sender?.type === 'anonymous';
  if (isAnonymous) segments.push('Sans compte');

  const author = message.sender?.displayName;
  if (!isMine && author !== undefined && author !== '') segments.push(author);

  /**
   * LE VOILE remplace le TEXTE **et** l'inventaire des pièces jointes : « 1
   * image » sur un message à vue unique dit déjà ce que le flou cache.
   *
   * **`withheld` EST L'EXCEPTION, et c'est une décision du SERVEUR, pas d'ici**
   * (#7020). Ce cas ne se produit que dans la lecture souveraine de
   * l'administration (`contentWithheld` n'a pas d'autre appelant du chantier),
   * et `servedAttachment` (`sovereign-message-projection.ts`) y LISTE
   * délibérément les pièces d'un message retenu — type, poids, durée — en
   * disant pourquoi : « un administrateur doit pouvoir CONSTATER qu'un média
   * existe ». Taire l'inventaire ici retirait à un lecteur SOUS MOTIF ÉCRIT et
   * SOUS TRACE D'AUDIT ce que le voile donne déjà à un membre ordinaire
   * (`data-masked-media`) : « deux photos ont été retenues » et « un texte a
   * été retenu » s'annonçaient d'une seule phrase.
   */
  if (contentWithheld) {
    segments.push(translate(language, PROTECTED_LABEL_KEY.withheld), ...attachmentSegments(message.attachments));
  } else if (!rendersContent(protection, phase)) {
    segments.push(translate(language, PROTECTED_LABEL_KEY.veiled));
  } else {
    /**
     * LA CITATION EST UN ENFANT DE LA RANGÉE, DONC ELLE SUIT SA MATRICE
     * (#7092) — elle se prononce ICI, dans la branche qui dit que les enfants
     * sont MONTÉS, jamais avant le dispatch. Composée plus haut, elle
     * annonçait « réponse à Amina Diallo » au-dessus d'un constat de contenu
     * retenu et d'un substitut voilé : le second vocabulaire que le
     * doc-comment de `PROTECTED_LABEL` existe pour interdire, pris en défaut
     * sur un autre segment que le texte.
     *
     * UNE STORY CITÉE REMPLACE LA CITATION ORDINAIRE (#5936) — « réponse à sa
     * story », jamais « réponse à {auteur} » : c'est une SCÈNE, pas la parole
     * de quelqu'un (`storyCitationOf`, miroir `BubbleStoryCitationCard`).
     */
    const storyCitation = storyCitationOf(message);
    if (storyCitation !== null) {
      segments.push('réponse à sa story');
    } else if (message.replyTo) {
      const quotedAuthor = message.replyTo.sender?.displayName ?? 'expéditeur inconnu';
      segments.push(`réponse à ${quotedAuthor}`);
    }

    /**
     * STICKER / EMOJI SEUL (#5936) — `bodyKindOf` est la MÊME loi que la
     * rangée consomme pour peindre : un sticker prend un segment dédié
     * (« sticker 🔥 »), un emoji seul rend le texte BRUT (jamais `servedText`
     * traduit — un emoji n'a pas de langue).
     */
    const body = bodyKindOf(message);
    if (body.kind === 'sticker') {
      segments.push(body.sticker.emoji !== undefined ? `sticker ${body.sticker.emoji}` : 'sticker');
    } else if (body.kind === 'emoji-only') {
      segments.push(message.content);
    } else if (servedText !== '') {
      segments.push(servedText);
    }
    segments.push(...attachmentSegments(message.attachments));

    /** Le LIEU (#5936, `a11y.message.location`) — APRÈS les pièces jointes,
     * miroir `nonMediaAccessibilityParts` (`:152-158`). */
    const place = placeOf(message);
    if (place !== null) segments.push(`Position : ${place.name ?? 'lieu partagé'}`);
  }

  segments.push(time(message.createdAt));

  if (isMine) {
    const word = deliveryWord(delivery);
    if (word !== undefined) segments.push(word);
  }

  if (message.isEdited) segments.push('modifié');
  if (message.pinnedAt !== undefined) segments.push('épinglé');
  /**
   * « TRANSFÉRÉ » APRÈS « ÉPINGLÉ » (#5936, § 9 Q8 de la spécification) —
   * ÉCART ASSUMÉ avec iOS : `MessageAccessibilityLabelComposer.swift:82-90`
   * ne le prononce pas du tout. Ce que l'œil voit (`Badges`), l'oreille
   * l'entend aussi.
   */
  const attribution = forwardAttributionOf(message);
  if (attribution !== null) segments.push(lowerFirst(forwardLabelOf(attribution, language), language));
  if (message.expiresAt !== undefined) segments.push('éphémère');

  /* LES EFFETS DÉCORATIFS ne se prononcent plus (#7596) : ils s'EXÉCUTENT à
     l'écran, et les énumérer au lecteur d'écran ferait d'une décoration une
     information — la même chose que le compteur que l'œil ne voit plus. */
  const reactions = reactionsSegment(message.reactionSummary);
  if (reactions !== undefined) segments.push(reactions);

  return segments.join(', ');
}
