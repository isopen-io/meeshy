import { prismFor, resolveAudioTrack, servedTranscript, type Served, type ServedTrack } from '@/lib/api/prism';
import type { Attachment } from '@/lib/api/types';

/**
 * `MediaCarrier` (#6221, § 5 étape 5) — CE QUE LA VISIONNEUSE REMET AU BAS DU
 * CADRE (`bottomMetadataOverlay`, `ConversationMediaGalleryView.swift:690-760`) :
 * l'auteur, la date d'envoi, et une légende DÉJÀ SERVIE par le Prisme — la
 * MÊME descente que le texte du message, jamais une seconde (cycle 128).
 * `caption: null` ⇒ pas de légende ; `sender: null` (jamais un « ? ») ⇒ pas
 * de bloc auteur (loi 4). Posé par `bubble.tsx`/`focal-row.tsx` depuis ce
 * qu'ils ont déjà résolu — ce type ne RÉSOUT rien, il ne fait que VOYAGER.
 */
export type MediaCarrier = {
  readonly caption: Served | null;
  readonly sender: { readonly displayName: string } | null;
  readonly sentAt: string;
};

/**
 * `mediaCarrierOf` (#6169, § 5 étape f de la spécification « grille de
 * médias ») — COMPOSE un `MediaCarrier` depuis ce que l'hôte
 * (`bubble.tsx`/`focal-row.tsx`) a DÉJÀ résolu. Ne RÉSOUT rien : `caption`
 * VOYAGE telle que reçue (la MÊME `Served` que le corps du message, cycle
 * 128 — une seconde descente ici referait exactement l'erreur que ce cycle
 * a fermée sur trois clients). `sender: null` (jamais un « ? ») dès que
 * `message.sender` est absent OU que son `displayName` est vide — un
 * identifiant illisible n'est pas une identité à montrer (loi 4).
 *
 * `CarrierMessageSource` prend le SEUL sous-ensemble de `Message` dont cette
 * fonction a besoin (`sender?.displayName`, `createdAt`) — jamais
 * `Pick<Message, …>`, qui aurait exigé un `Participant` COMPLET (rôle,
 * permissions…) chez chaque appelant, y compris les témoins.
 *
 * NON MÉMOÏSÉE chez `bubble.tsx`/`focal-row.tsx` (écart ASSUMÉ avec la
 * spécification #6169, qui demandait un `useMemo` sur des primitives) —
 * vérifié dans le CODE, pas deviné : `carrier` n'atteint QUE `MediaViewer`
 * (`attachment-blocks.tsx`, chunk à la demande, monté SEULEMENT si
 * `openIndex !== null`, jamais `memo`-isé), JAMAIS `MediaGrid` (le seul
 * descendant `memo`-isé de cette chaîne, qui ne reçoit ni ne lit `carrier`).
 * Une identité instable sur `carrier` ne fait donc sauter AUCUNE
 * optimisation `memo` existante — le coût qu'un `useMemo` éviterait est nul,
 * mesuré sur le graphe de props réel, pas supposé. Introduire le PREMIER
 * hook de `bubble.tsx` (591 l., trois retours anticipés AVANT le rendu de
 * `Attachments`) pour un gain nul aurait été le risque que ce lot n'a pas à
 * prendre — si un futur consommateur `memo`-isé lit un jour `carrier`
 * directement, MESURER alors, et mémoïser à cet endroit-là.
 */
export type CarrierMessageSource = {
  readonly sender?: { readonly displayName?: string } | null;
  readonly createdAt: Date;
};

export function mediaCarrierOf(params: { readonly message: CarrierMessageSource; readonly caption: Served }): MediaCarrier {
  const { message, caption } = params;
  const displayName = message.sender?.displayName;
  return {
    sender: displayName !== undefined && displayName !== '' ? { displayName } : null,
    sentAt: message.createdAt.toISOString(),
    caption,
  };
}

/**
 * L'ÉLECTION D'UNE PIÈCE JOINTE (#5805) — la composition en DEUX temps que
 * `api/prism.ts` sépare volontairement : `servedTranscript` élit le TEXTE,
 * `resolveAudioTrack` REÇOIT sa langue pour élire la PISTE — jamais une
 * seconde descente (CLAUDE.md § Prisme, cycle 128 ; `tasks/lessons.md` § 284).
 *
 * DEUX FONCTIONS, PAS UNE (revue #5805). Le lot livrait un `electMedia` unique
 * que l'IMAGE appelait aussi : une image recevait donc une « piste audio
 * servie » dont l'`url` était… son propre fichier PNG, et le dépouillement
 * `transcriptTranslationTracks` tournait à chaque rendu de chaque image pour
 * une valeur jetée. Un nom qui promet une piste audio et rend un PNG est une
 * seconde langue pour la même chose (directive porteur 3b) ; trente écrans
 * copieraient l'appel qui la produit. La frontière est donc celle du CONTENU :
 * - `electDescription` — le TEXTE d'une pièce, et rien d'autre (image, fichier) ;
 * - `electAudio` — le texte ET la piste d'un VOCAL, d'UNE descente.
 */
export type MediaAttachment = Pick<Attachment, 'transcription' | 'translations' | 'alt' | 'originalName' | 'fileUrl'>;

type ElectionInput = {
  readonly attachment: MediaAttachment;
  readonly readerLanguages: readonly string[];
  /** Traduire (#5814) — une langue EXPLORÉE au rang 0, la MÊME insertion que le texte du message (`prismFor`). */
  readonly displayLanguage?: string | undefined;
  /** La langue de la pièce QUAND elle n'a pas de transcription — `message.originalLanguage`. */
  readonly fallbackLanguage: string;
};

/**
 * LE TEXTE SERVI D'UNE PIÈCE — `alt` d'une image, transcription d'un vocal.
 * C'est lui qui alimente `alt=`, `aria-label` et l'attribut `lang` (cycle 122 :
 * un résolveur n'a corrigé personne tant qu'on ne sait pas QUI l'affiche).
 */
export function electDescription(params: ElectionInput): Served {
  const { attachment, readerLanguages, displayLanguage, fallbackLanguage } = params;
  return servedTranscript({
    preferredLanguages: prismFor({ readerLanguages, displayLanguage }),
    attachment,
    fallbackLanguage,
  });
}

export type ElectedAudio = {
  /** La TRANSCRIPTION servie et sa langue. */
  readonly described: Served;
  /** La PISTE servie — TOUJOURS une piste (l'originale quand `translated === false`), jamais une URL fabriquée. */
  readonly track: ServedTrack;
};

/**
 * LE VOCAL : SON TEXTE ET SA PISTE, D'UNE SEULE DESCENTE.
 *
 * La piste est élue par la langue du TEXTE SERVI, jamais par une descente
 * parallèle : deux descentes serviraient « la réunion est déplacée » au-dessus
 * d'une piste espagnole — un défaut PIRE qu'une traduction absente, parce
 * qu'il a l'air d'une traduction ratée plutôt que d'une traduction manquante
 * (CLAUDE.md § Prisme, cycle 128).
 */
export function electAudio(params: ElectionInput): ElectedAudio {
  const { attachment, fallbackLanguage } = params;
  const described = electDescription(params);
  const track = resolveAudioTrack({
    servedLanguage: described.language,
    originalLanguage: attachment.transcription?.language ?? fallbackLanguage,
    originalUrl: attachment.fileUrl,
    translations: attachment.translations,
  });
  return { described, track };
}

/** La piste seule, sans ses métadonnées de service (`translated` retiré : la convention `null` le remplace). */
export type ElectedTrack = {
  readonly url: string;
  readonly language: string;
  readonly mimeType?: string;
  readonly durationMs?: number;
};

/**
 * LA PISTE SEULE, CONVENTION `null` = ORIGINAL (#5805) — miroir direct de
 * `AudioTrackLanguageResolver.url(for:)`
 * (`apps/ios/Meeshy/Features/Main/Models/AudioTrackLanguageResolver.swift:86-95`),
 * dont la forme Swift rend `nil` pour dire « joue le fichier original ».
 *
 * PROJECTION de `electAudio`, jamais une seconde loi : le widget du fil a
 * besoin des DEUX moitiés (le texte sous l'onde ET le fichier de l'`<audio>`)
 * et appelle donc `electAudio` ; cette forme étroite sert l'appelant qui n'a
 * qu'une PISTE à servir — une bannière de notification, un lecteur détaché de
 * sa transcription — et lui rend la convention que le résolveur iOS emploie,
 * plutôt qu'un `ServedTrack.translated` à tester à côté.
 */
export function electAudioTrack(
  attachment: MediaAttachment,
  preferredLanguages: readonly string[],
  opts?: { readonly displayLanguage?: string; readonly fallbackLanguage?: string },
): ElectedTrack | null {
  const { track } = electAudio({
    attachment,
    readerLanguages: preferredLanguages,
    fallbackLanguage: opts?.fallbackLanguage ?? attachment.transcription?.language ?? 'fr',
    displayLanguage: opts?.displayLanguage,
  });
  if (!track.translated) return null;
  return {
    url: track.url,
    language: track.language,
    ...(track.mimeType !== undefined ? { mimeType: track.mimeType } : {}),
    ...(track.durationMs !== undefined ? { durationMs: track.durationMs } : {}),
  };
}
