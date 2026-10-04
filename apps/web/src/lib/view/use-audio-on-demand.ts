import { useMemo, useState } from 'react';

import { transcriptTranslationTracks } from '@meeshy/shared/types/attachment-audio';

import { requestAttachmentTranscription, requestAttachmentTranslation } from '@/lib/api/attachment-processing';
import type { ConversationsDeps } from '@/lib/api/conversations';
import { apiDeps } from '@/lib/api/deps';
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

export type AudioOnDemand = {
  readonly served: Attachment;
  /** La langue de la pièce : celle de sa transcription, sinon celle du message. */
  readonly originalLanguage: string;
  /** Les versions qu'on peut ÉCOUTER : l'original et chaque traduction qui porte une piste. */
  readonly versions: readonly string[];
  readonly offers: readonly string[];
  readonly transcribing: boolean;
  readonly pendingLanguages: readonly string[];
  /** La DERNIÈRE langue demandée dont la version vient d'arriver — la page s'y place. */
  readonly arrived: string | null;
  readonly notice: AudioOnDemandNotice | null;
  readonly transcribe: () => void;
  readonly requestTranslation: (language: string) => void;
};

export function useAudioOnDemand({
  attachment,
  fallbackLanguage,
  readerLanguages,
  deps,
}: {
  readonly attachment: Attachment;
  readonly fallbackLanguage: string;
  readonly readerLanguages: readonly string[];
  readonly deps?: ConversationsDeps;
}): AudioOnDemand {
  const [supplied, setSupplied] = useState<SuppliedAudio>(NOTHING_SUPPLIED);
  const [transcribeAsked, setTranscribeAsked] = useState(false);
  const [requested, setRequested] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<AudioOnDemandNotice | null>(null);

  const served = useMemo(() => withSupplied(attachment, supplied), [attachment, supplied]);
  const originalLanguage = served.transcription?.language ?? fallbackLanguage;
  const versions = useMemo(
    () => [...new Set([originalLanguage, ...Object.keys(transcriptTranslationTracks(served.translations))])].filter((code) => code !== ''),
    [originalLanguage, served.translations],
  );
  const offers = useMemo(() => translationOffers({ readerLanguages, versions }), [readerLanguages, versions]);
  const pendingLanguages = requested.filter((code) => !versions.includes(code));
  const arrived = [...requested].reverse().find((code) => versions.includes(code)) ?? null;
  const transport = deps ?? apiDeps;

  const transcribe = (): void => {
    if (transcribeAsked && served.transcription == null) return;
    setNotice(null);
    setTranscribeAsked(true);
    void requestAttachmentTranscription({ ...transport, attachmentId: attachment.id }).then((result) => {
      if (!result.ok) {
        setTranscribeAsked(false);
        setNotice('media.audio.transcribe_failed');
        return;
      }
      const transcription = result.data.transcription;
      if (transcription !== null) setSupplied((current) => ({ ...current, transcription }));
    });
  };

  const requestTranslation = (language: string): void => {
    if (requested.includes(language) && !versions.includes(language)) return;
    setNotice(null);
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
    });
  };

  return {
    served,
    originalLanguage,
    versions,
    offers,
    transcribing: transcribeAsked && served.transcription == null,
    pendingLanguages,
    arrived,
    notice,
    transcribe,
    requestTranslation,
  };
}
