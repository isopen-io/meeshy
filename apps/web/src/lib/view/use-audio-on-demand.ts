import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from 'zustand';

import { transcriptTranslationTracks } from '@meeshy/shared/types/attachment-audio';

import { requestAttachmentTranscription, requestAttachmentTranslation } from '@/lib/api/attachment-processing';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
import {
  TRANSCRIPTION_STAGE,
  TRANSLATIONS_STAGE,
  failedStagesOf,
  mediaProcessingFailures,
  type MediaProcessingFailuresApi,
} from '@/lib/api/media-processing-failures';
import type { Attachment } from '@/lib/api/types';

import { NOTHING_SUPPLIED, translationOffers, withSupplied, type SuppliedAudio } from './audio-on-demand';

/**
 * TRANSCRIRE ET TRADUIRE DEPUIS LE LECTEUR (#9256) — l'état de la page audio
 * plein écran pour ses deux demandes, miroir d'`AudioFullscreenView` iOS
 * (`requestServerTranscription`, la feuille de traduction et
 * `appendTranslatedAudio`).
 *
 * `served` est la pièce ENRICHIE de ce que le lecteur a obtenu — c'est elle,
 * et elle seule, que la page remet à `electAudio` : une descente du Prisme
 * pour le texte et la piste. Une demande « en cours » le reste jusqu'à ce que
 * la pièce porte le résultat, qu'il vienne de la réponse ou du temps réel
 * (`message:attachment-updated`).
 */
export type AudioOnDemandNotice = 'media.audio.transcribe_failed' | 'media.audio.translate_failed';

/**
 * LE PLAFOND D'UNE DEMANDE MISE EN FILE (#10629) — la passerelle répond
 * `processing` et le résultat n'arrive que par le temps réel. S'il n'arrive
 * pas (traducteur arrêté, socket coupée), l'attente se lève au lieu de figer
 * le bouton, et la demande se refait. 90 s (#10759) : un plafond de SILENCE
 * réel, jamais de latence — Whisper met ~25 s sur staging pour un vocal de
 * 4 s, et l'ancien plafond de 20 s rendait « Transcrire » pendant que la tâche
 * tournait encore. L'arrivée du résultat (`audio:transcription-ready`, greffé
 * sur la pièce) lève l'attente dès qu'elle arrive.
 */
export const ON_DEMAND_STALL_MS = 90_000;

export type AudioOnDemand = {
  readonly served: Attachment;
  /** La langue de la pièce : celle de sa transcription, sinon celle du message. */
  readonly originalLanguage: string;
  /** Les versions qu'on peut ÉCOUTER : l'original et chaque traduction qui porte une piste. */
  readonly versions: readonly string[];
  readonly offers: readonly string[];
  readonly transcribing: boolean;
  /** La zone « Transcrire » a un effet : pas de transcription servie, et le serveur lit le vocal. */
  readonly canTranscribe: boolean;
  readonly pendingLanguages: readonly string[];
  /** La DERNIÈRE langue demandée dont la version vient d'arriver — la page s'y place. */
  readonly arrived: string | null;
  readonly notice: AudioOnDemandNotice | null;
  readonly transcribe: () => void;
  readonly requestTranslation: (language: string) => void;
};

const TRANSCRIPTION_KEY = '#transcription';
const NO_LANGUAGES: readonly string[] = [];

export function useAudioOnDemand({
  attachment,
  fallbackLanguage,
  readerLanguages,
  deps,
  stallAfterMs = ON_DEMAND_STALL_MS,
  transcribable = true,
  failures = mediaProcessingFailures,
}: {
  readonly attachment: Attachment;
  readonly fallbackLanguage: string;
  readonly readerLanguages: readonly string[];
  readonly deps?: ConversationsDeps;
  readonly stallAfterMs?: number;
  /** Le serveur peut lire ce vocal (#10700) ; faux ⇒ « Transcrire » n'est pas offert. */
  readonly transcribable?: boolean;
  /** Les pannes DITES par le temps réel (#18537) — injectable, le défaut est le magasin du processus. */
  readonly failures?: MediaProcessingFailuresApi;
}): AudioOnDemand {
  const [supplied, setSupplied] = useState<SuppliedAudio>(NOTHING_SUPPLIED);
  const [transcribeAsked, setTranscribeAsked] = useState(false);
  const [requested, setRequested] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<AudioOnDemandNotice | null>(null);
  const [stalled, setStalled] = useState<readonly string[]>([]);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const stallLater = (key: string): void => {
    timers.current = [...timers.current, setTimeout(() => setStalled((current) => [...current.filter((k) => k !== key), key]), stallAfterMs)];
  };
  const unstall = (key: string): void => setStalled((current) => current.filter((k) => k !== key));

  /**
   * LES PANNES QUE LA PASSERELLE A DITES (#18537). Abonnement par PIÈCE, sur une
   * référence stable à vide (`failedStagesOf`) : un sélecteur qui rendrait un
   * tableau neuf à chaque rendu rendrait sans fin.
   */
  const failedStages = useStore(failures, (state) => failedStagesOf(state, attachment.id));
  const transcriptionFailed = failedStages.includes(TRANSCRIPTION_STAGE);
  const translationsFailed = failedStages.includes(TRANSLATIONS_STAGE);

  const served = useMemo(() => withSupplied(attachment, supplied), [attachment, supplied]);
  const originalLanguage = served.transcription?.language ?? fallbackLanguage;
  const versions = useMemo(
    () => [...new Set([originalLanguage, ...Object.keys(transcriptTranslationTracks(served.translations))])].filter((code) => code !== ''),
    [originalLanguage, served.translations],
  );
  const offers = useMemo(() => translationOffers({ readerLanguages, versions }), [readerLanguages, versions]);
  /**
   * L'ATTENTE SE LÈVE SUR DEUX FAITS DISJOINTS, et il faut les tenir tous les
   * deux : une PREUVE de panne (le temps réel, en ~1 s) ou son ABSENCE prolongée
   * (`stalled`, le plafond de 90 s — socket coupée, traducteur muet). Retirer le
   * second parce que le premier existe rendrait le bouton figé pour toujours
   * exactement quand le signal ne peut pas arriver.
   */
  const pendingLanguages = translationsFailed ? NO_LANGUAGES : requested.filter((code) => !versions.includes(code) && !stalled.includes(code));
  const transcribing = transcribeAsked && served.transcription == null && !stalled.includes(TRANSCRIPTION_KEY) && !transcriptionFailed;
  const arrived = [...requested].reverse().find((code) => versions.includes(code)) ?? null;
  const transport = deps ?? apiDeps;

  /**
   * LA PHRASE DE LA PANNE — le `notice` qu'un refus de REQUÊTE posait déjà, servi
   * désormais aussi par le temps réel. Le verdict du temps réel PRIME sur l'état
   * local : il est la seule preuve d'une panne SURVENUE APRÈS la mise en file, et
   * un `notice` local nul était l'état nominal d'une demande acceptée.
   *
   * La transcription d'abord : sans elle il n'y a rien à traduire, donc c'est
   * elle que le lecteur doit relancer.
   */
  const servedNotice: AudioOnDemandNotice | null = transcriptionFailed
    ? 'media.audio.transcribe_failed'
    : translationsFailed
      ? 'media.audio.translate_failed'
      : notice;

  const transcribe = (): void => {
    if (transcribing) return;
    setNotice(null);
    setTranscribeAsked(true);
    unstall(TRANSCRIPTION_KEY);
    /* Une demande NEUVE efface le verdict de la précédente, sinon le second essai n'affiche jamais son attente. */
    failures.getState().cleared(attachment.id, TRANSCRIPTION_STAGE);
    void requestAttachmentTranscription({ ...transport, attachmentId: attachment.id }).then((result) => {
      if (!result.ok) {
        setTranscribeAsked(false);
        setNotice('media.audio.transcribe_failed');
        return;
      }
      const transcription = result.data.transcription;
      if (transcription !== null) setSupplied((current) => ({ ...current, transcription }));
      else stallLater(TRANSCRIPTION_KEY);
    });
  };

  const requestTranslation = (language: string): void => {
    if (pendingLanguages.includes(language)) return;
    setNotice(null);
    unstall(language);
    failures.getState().cleared(attachment.id, TRANSLATIONS_STAGE);
    setRequested((current) => [...current.filter((code) => code !== language), language]);
    const sourceLanguage = served.transcription?.language;
    void requestAttachmentTranslation({
      ...transport,
      attachmentId: attachment.id,
      targetLanguage: language,
      ...(sourceLanguage !== undefined ? { sourceLanguage } : {}),
    }).then((result) => {
      if (!result.ok) {
        setRequested((current) => current.filter((code) => code !== language));
        setNotice('media.audio.translate_failed');
        return;
      }
      const translation = result.data.translation;
      if (translation !== null) setSupplied((current) => ({ ...current, translations: { ...current.translations, [language]: translation } }));
      else stallLater(language);
    });
  };

  return {
    served,
    originalLanguage,
    versions,
    offers,
    transcribing,
    canTranscribe: transcribable && served.transcription == null,
    pendingLanguages,
    arrived,
    notice: servedNotice,
    transcribe,
    requestTranslation,
  };
}
