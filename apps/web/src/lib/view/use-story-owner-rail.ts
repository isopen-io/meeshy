import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';

import { apiConfig } from '@/lib/api/config';
import { currentCredential } from '@/lib/api/client';
import { translate } from '@/lib/i18n-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';
import type { FileDeliveryHost } from '@/lib/media/deliver-file';
import { shareStory } from '@/lib/stories/share-story';
import * as storySaveStore from '@/lib/stories/save-store';

/**
 * **LE TÉLÉCHARGEMENT ET LA LIVRAISON SONT CHARGÉS À LA DEMANDE** (mesure
 * `measure-weight.mjs`, plafond `story_reader` 11 Ko NON ARBITRÉ, #7116) —
 * même motif D-54 que le client TUS du studio (`post-media-upload.ts`,
 * chargé à la PREMIÈRE sélection de fichier) : `downloadFile` et
 * `fileDeliveryPortal` ne pèsent sur AUCUN lecteur qui ne tape jamais
 * « Enregistrer » — l'auteur d'une story qui ne le fait jamais aujourd'hui,
 * ou tout visiteur d'une story qui n'est pas la sienne (le bouton ne lui est
 * même pas montré).
 *
 * `shareStory` RESTE STATIQUE, volontairement : D-48 exige que le partage
 * parte DANS le geste, sans attente réseau préalable, sous peine que
 * `navigator.share` refuse (l'activation utilisateur expire) — un `import()`
 * paresseux réintroduirait exactement l'attente que D-48 interdit, au premier
 * tap d'une session qui n'a pas encore ce chunk en cache.
 */

/**
 * **LE RAIL DU PLAN AUTEUR** (#7116) — extrait de `routes/story.tsx` (déjà
 * hors budget à 996 lignes avant ce lot, § périmètre de la spécification) :
 * « Vues », « Partager », « Enregistrer ».
 *
 * **DEUX REPRÉSENTATIONS DE LA PROGRESSION, VOLONTAIREMENT DISTINCTES.**
 * `lib/stories/save-store.ts` garde l'état SURVIVANT (idempotence, contrôleur
 * d'annulation) sous sa forme DÉJÀ MISE À L'ÉCHELLE de l'anneau (« report(id,
 * 0.5) ⇒ 0,45 », T6) — c'est ce qui lui permet de rester la source pour
 * `lockDelivery`/`cancel` sans connaître `StoryActionRail`. Ce composant, lui,
 * reçoit la progression BRUTE du téléchargement (0..1) et applique LUI-MÊME
 * `downloadShare` (`saving: { progress: 0.4 } ⇒ 36 %`, T2) — c'est la forme
 * que `downloadFile` produit nativement (un ratio d'octets). Ce hook tient
 * donc un état LOCAL pour le RENDU (alimenté par le même `onProgress` que le
 * store) plutôt que de faire subir à la valeur déjà réduite du store une
 * seconde réduction, qui la fausserait.
 */
export type StoryOwnerRailState = {
  readonly viewersOpen: boolean;
  readonly openViewers: () => void;
  readonly closeViewers: () => void;
  readonly saving: { readonly progress: number; readonly cancellable: boolean; readonly reduceMotion: boolean } | null;
  readonly onShare: () => void;
  readonly onSave: () => void;
  readonly onCancelSave: () => void;
};

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function browserFileDeliveryHost(): FileDeliveryHost {
  if (typeof document === 'undefined') return {};
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const canShareFiles =
    nav !== undefined && typeof nav.canShare === 'function' ? (data: { readonly files: readonly File[] }) => nav.canShare({ files: [...data.files] }) : undefined;
  const shareFiles =
    nav !== undefined && typeof nav.share === 'function' ? (data: { readonly files: readonly File[] }) => nav.share({ files: [...data.files] }) : undefined;
  return {
    document: { createElement: (tag: string) => document.createElement(tag), body: document.body },
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    ...(canShareFiles !== undefined ? { canShareFiles } : {}),
    ...(shareFiles !== undefined ? { shareFiles } : {}),
  };
}

export function useStoryOwnerRail(params: {
  readonly storyId: string | undefined;
  readonly exportMediaId: string | undefined;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly announce: (message: string) => void;
  readonly language: InterfaceLanguage;
}): StoryOwnerRailState {
  const { storyId, exportMediaId, pause, resume, announce, language } = params;
  const [viewersOpen, setViewersOpen] = useState(false);
  const [saving, setSaving] = useState<{ progress: number; cancellable: boolean; reduceMotion: boolean } | null>(null);

  const openViewers = useCallback(() => setViewersOpen(true), []);
  const closeViewers = useCallback(() => setViewersOpen(false), []);

  // La feuille « Vues » met la lecture en pause, exactement comme la feuille
  // de commentaires (`useCommentsSheetHost`, `routes/story.tsx`) : la story
  // n'avance pas sous un lecteur qui regarde qui l'a vue.
  useEffect(() => {
    if (!viewersOpen) return;
    pause();
    return () => resume();
  }, [viewersOpen, pause, resume]);

  // Un changement de story ferme la feuille — le fil de vues d'une story
  // n'hérite pas de celui de sa voisine.
  useEffect(() => {
    setViewersOpen(false);
  }, [storyId]);

  // Le job SURVIT à la story affichée (navigation, fermeture) : on lit l'état
  // du store pour savoir si CETTE story a un job en cours, pour l'idempotence
  // du bouton (`onSave`) — le rendu de la progression reste local (voir
  // doc-comment du module).
  const hasStoreJob = useSyncExternalStore(
    storySaveStore.subscribe,
    () => (storyId === undefined ? false : storySaveStore.getState(storyId) !== null),
    () => false,
  );
  useEffect(() => {
    if (!hasStoreJob) setSaving(null);
  }, [hasStoreJob]);

  const onShare = useCallback(() => {
    if (storyId === undefined) return;
    shareStory({ storyId, language, announce });
  }, [storyId, language, announce]);

  const onCancelSave = useCallback(() => {
    if (storyId === undefined) return;
    storySaveStore.cancel(storyId);
    // `cancel` est SANS EFFET sur un job verrouillé (livraison en cours,
    // `lockDelivery`) — l'état local ne doit alors PAS être effacé, sinon
    // l'anneau disparaîtrait pendant qu'un export tourne encore en arrière-plan.
    if (storySaveStore.getState(storyId) === null) setSaving(null);
  }, [storyId]);

  const onSave = useCallback(() => {
    if (storyId === undefined || exportMediaId === undefined) return;
    const controller = storySaveStore.start(storyId);
    if (controller === null) return; // déjà en cours — idempotent (T6).
    const reduceMotion = prefersReducedMotion();
    setSaving({ progress: 0, cancellable: true, reduceMotion });

    const url = `${apiConfig.base}/api/v1/posts/${encodeURIComponent(storyId)}/media/${encodeURIComponent(exportMediaId)}/export`;
    void Promise.all([import('@/lib/media/download-file'), import('@/lib/media/deliver-file')]).then(
      async ([{ downloadFile }, { fileDeliveryPortal }]) => {
        const result = await downloadFile({
          url,
          fallbackMediaId: exportMediaId,
          deps: { fetchImpl: (input, init) => fetch(input, init), credential: currentCredential },
          signal: controller.signal,
          onProgress: (ratio) => {
            if (ratio === null) return;
            storySaveStore.report(storyId, ratio);
            setSaving((current) => (current === null ? current : { ...current, progress: ratio }));
          },
        });
        if (result.status === 'cancelled') {
          announce(translate(language, 'story.save.cancelled'));
          storySaveStore.finish(storyId);
          setSaving(null);
          return;
        }
        if (result.status !== 'ready') {
          announce(translate(language, 'story.save.failed'));
          storySaveStore.finish(storyId);
          setSaving(null);
          return;
        }
        storySaveStore.lockDelivery(storyId);
        setSaving((current) => (current === null ? current : { ...current, cancellable: false }));
        const portal = fileDeliveryPortal(browserFileDeliveryHost());
        const outcome = portal === null ? 'cancelled' : await portal.deliver(result.blob, result.fileName, result.blob.type);
        announce(translate(language, outcome === 'delivered' ? 'story.save.success' : 'story.save.cancelled'));
        storySaveStore.finish(storyId);
        setSaving(null);
      },
    );
  }, [storyId, exportMediaId, announce, language]);

  return { viewersOpen, openViewers, closeViewers, saving, onShare, onSave, onCancelSave };
}
