'use client';

import { useCallback, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { cn } from '@/lib/utils';
import { Button } from '@/components/v2/Button';
import {
  AudienceUserPicker,
  AUDIENCE_VISIBILITIES,
  isAudienceIncomplete,
} from '@/components/v2/AudienceUserPicker';
import { PUBLICATION_VISIBILITY_OPTIONS } from '@/components/v2/publication-visibility';
import { ReferencePicker } from '@/components/composer/ReferencePicker';
import { ReferenceChipRow } from '@/components/composer/ReferenceChipRow';
import { useReferences } from '@/hooks/composer/useReferences';
import { useFormatAudienceMemory } from '@/hooks/composer/useFormatAudienceMemory';
import { removingHandle } from '@meeshy/shared/utils/composer-references';
import type { PostVisibility } from '@meeshy/shared/types/post';
import type { PostReferenceDisplay, PostReferenceInput } from '@meeshy/shared/types/post-reference';

/**
 * La surface MOOD — le format STATUS du meuble (W6).
 *
 * Port frais, dans l'esprit de `ComposerDocumentSurface` (W3) : elle N'A
 * JAMAIS MODIFIÉ `components/v2/StatusComposer.tsx`, qui restait monté tel
 * quel jusqu'à son retrait à la Task W9 (contrairement à la STORY, absorbée
 * à W5 — le mood n'avait aucun canevas à partager entre deux enrobages, donc
 * rien à extraire en commun). Les constantes qui suivent (`MOOD_EMOJIS`,
 * `MAX_CONTENT_LENGTH`) sont donc DUPLIQUÉES depuis ce qu'était
 * `StatusComposer.tsx` plutôt qu'importées : le composer hérité a depuis été
 * supprimé (W9), et en dépendre aurait créé une dépendance qui aurait cassé
 * ce jour-là — même choix que `CHAR_LIMIT`/`MEDIA_LIMIT` dans
 * `ComposerDocumentSurface.tsx`.
 *
 * Ce que cette surface AJOUTE au-delà de la parité, tel que le plan le nomme
 * explicitement (§ Task W6) :
 *
 *  1. **la BASCULE d'emoji** — retaper l'emoji déjà choisi le désélectionne.
 *     Le composer hérité n'avait que la sélection (`onClick={() =>
 *     setSelectedEmoji(emoji)}`, jamais de désélection). Loi reprise TELLE
 *     QUELLE de `ComposerMoodPolicy.toggling` (iOS,
 *     `ComposerMoodSurface.swift:59-65`) ;
 *  2. **l'AUDIENCE, et sa mémoire PAR FORMAT** (loi 10) — le défaut mesuré
 *     (plan §A.3 point 5) : « tout mood web naît PUBLIC », le composer hérité
 *     n'exposant aucun sélecteur. `useFormatAudienceMemory('status')` retient
 *     le dernier choix sous la même clé que `@AppStorage("lastStatusVisibility")`
 *     côté iOS. **Capacité AJOUTÉE, pas une parité tenue** — si la revue la
 *     retire, rien d'autre n'en dépend (elle est la SEULE tâche du lot qui
 *     ajoute une capacité au-delà du port).
 *
 * Ce qui reste un port fidèle : la grille de dix emojis et les références en
 * tri-état (`useReferences().payload`, jamais `[]`).
 *
 * ### Le plafond de 140 — MÊME mécanisme que le composer hérité, plus un filet
 *
 * Ce n'est PAS une capacité ajoutée, et l'écrire « troncature, pas refus de
 * frappe » serait une loi plus large que ce que ce fichier tient. Le champ
 * porte `maxLength={MAX_CONTENT_LENGTH}`, exactement comme
 * `StatusComposer.tsx` : c'est le NAVIGATEUR qui refuse la 141ᵉ frappe et
 * rogne un collage, donc `handleContentChange` n'est jamais appelé avec plus
 * de 140 caractères sur le chemin nominal. La troncature de
 * `handleContentChange` est le FILET — elle rattrape ce qui échappe à
 * l'attribut (composition IME sur certains moteurs, écriture programmatique)
 * pour que le plafond tienne en toutes circonstances.
 *
 * L'ISSUE, elle, est bien celle d'iOS (`ComposerMoodPolicy.truncate` : coller
 * 300 caractères en garde les premiers plutôt que de ne rien écrire) — c'est
 * le MÉCANISME qui diverge, parce que le web a un plafond natif que SwiftUI
 * n'a pas. La VALEUR (140) reste celle du web ; sa divergence avec le 122
 * d'iOS est CONSIGNÉE côté iOS (`ComposerMoodPolicy.contentLimit`) comme
 * n'appartenant à aucun portage d'écran isolé — ce lot ne la referme pas.
 *
 * ### Le geste « effacer » NE passe pas par le canal de création
 *
 * `StatusComposer.handleClear` (`:74-81`) publiait `{ moodEmoji: '' }` sur le
 * même `onPublish` qu'une création. Ce chemin est INATTEIGNABLE dans le
 * composer hérité : son unique montage (`PostsFeedScreen.tsx`) ne passe pas
 * `currentStatus`, donc le bouton n'est jamais peint. En faire un champ
 * documenté du contrat de cette surface le rendrait atteignable — et la
 * charge qu'il émettait ne porte AUCUN porteur de contenu, ce que le gateway
 * refuse : `CreatePostSchema.refine(hasAnyContentCarrier)`
 * (`services/gateway/src/routes/posts/types.ts`) rend 400 VALIDATION_ERROR sur
 * `{ type: 'STATUS', moodEmoji: '' }`, `''.trim()` étant faux et aucun autre
 * porteur n'étant présent (`useCreateStatusMutation` ne remplit ni `content`
 * ni `mediaIds`).
 *
 * PUBLIER et EFFACER sont donc DEUX intentions, et elles ont deux canaux :
 * `onPublish` et `onClearStatus`. Rien dans un type ne distinguait la
 * seconde tant qu'elle empruntait le premier.
 *
 * Ce qu'elle n'a PAS : aucun éventail de format. La porte `moodChip`, résolue
 * par `composerOpening` (`composer-contract.ts`), rend TOUJOURS
 * `offeredFormats: ['status']` — et un
 * éventail à une seule entrée ne peint rien (`ComposerFormatFan`, loi de W2) —
 * donc le monter ici serait du code mort, jamais exercé. Le jour où le REPOST
 * d'un mood (porte `repost`, `sourceFormat: 'status'`, qui offre bien
 * `['status', 'post']`) atteint le web, cette surface devra gagner `door` /
 * `onFormatChange` / `routableFormats`, au même titre que `StoryComposerSurface` —
 * dette NOMMÉE, pas un oubli (W8, hors périmètre de ce lot).
 */

const REFERENCE_MODES: readonly Exclude<PostReferenceDisplay, 'INLINE'>[] = ['NOTE', 'SILENT'];

/** Identique à `StatusComposer.tsx:31`. */
const MOOD_EMOJIS = ['😴', '🎉', '💪', '☕', '🔥', '💭', '🎵', '📚', '✈️', '❤️'] as const;

/** Identique à `StatusComposer.tsx:32` — voir « Le plafond de 140 » ci-dessus. */
const MAX_CONTENT_LENGTH = 140;

/**
 * Le cran où le compteur passe en alerte — 90 % du plafond, le même ratio que
 * `CHAR_COUNT_THRESHOLD`/`CHAR_LIMIT` de `ComposerDocumentSurface.tsx`
 * (4500/5000). Ce n'est PAS le 101/122 (≈ 82,8 %) d'iOS : la VALEUR du
 * plafond diverge déjà (140 contre 122, section ci-dessus) donc en reprendre
 * le seuil absolu n'aurait aucun sens sur une base différente — le ratio est
 * ce que cette surface partage avec le reste du web, pas avec iOS.
 */
const WARNING_THRESHOLD = 126;

/**
 * Ce que la surface rend à son appelant. Déclaré ICI (pas dans
 * `components/composer/payload.ts`) : contrairement à `ComposerDocumentPayload`,
 * partagé par DEUX fichiers indépendants qui risquaient de diverger, cette
 * forme n'a qu'un seul producteur — cette surface — donc rien à réconcilier.
 *
 * `moodEmoji` n'est JAMAIS vide : un mood sans emoji ne publie pas
 * (`canPublish`), et l'effacement d'un mood existant emprunte son propre canal
 * (`onClearStatus`) plutôt que celui-ci — voir la note de fichier.
 */
export interface ComposerStatusPayload {
  moodEmoji: string;
  content?: string;
  visibility?: PostVisibility;
  /** Présente UNIQUEMENT sous EXCEPT/ONLY — jamais `[]` sous une autre audience. */
  visibilityUserIds?: string[];
  /** Références DÉCLARÉES, non-INLINE. Absente (jamais `[]`) si personne n'est référencé. */
  mentions?: readonly PostReferenceInput[];
}

export interface ComposerMoodSurfaceProps {
  /**
   * Un mood DÉJÀ PUBLIÉ. Il SÈME la composition — emoji présélectionné, texte
   * prérempli — et il est la moitié « il y a quelque chose à effacer » du
   * bouton Effacer. `undefined`/`null` ⇒ composition fraîche.
   *
   * La graine est VIVANTE : elle peut arriver après le montage (requête en
   * vol), et elle est alors adoptée. Voir le re-semis plus bas.
   */
  readonly currentStatus?: { moodEmoji: string; content?: string } | null;
  readonly onPublish: (payload: ComposerStatusPayload) => void;
  /**
   * L'autre moitié du bouton Effacer : le canal par lequel l'effacement
   * voyage. Sans lui, le bouton n'est PAS peint — un geste d'effacement n'a
   * aucune raison d'exister si l'hôte n'a rien à quoi le brancher, et il ne
   * doit surtout pas retomber sur `onPublish`, que le serveur refuse (voir la
   * note de fichier). Ce que cet hôte en fait n'est pas décidé ici.
   */
  readonly onClearStatus?: () => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

/**
 * L'identité d'une graine, réduite à ce qu'elle sème. Deux rendus de la même
 * graine n'en font qu'UNE, même si l'hôte en refabrique l'objet à chaque
 * rendu : c'est sur cette CLÉ que le re-semis se déclenche, jamais sur
 * l'identité de l'objet — la leçon n°2 de W1-W3, appliquée à la graine.
 */
function seedKeyOf(currentStatus: ComposerMoodSurfaceProps['currentStatus']): string {
  return JSON.stringify([currentStatus?.moodEmoji ?? null, currentStatus?.content ?? null]);
}

export function ComposerMoodSurface({
  currentStatus,
  onPublish,
  onClearStatus,
  disabled = false,
  className,
}: ComposerMoodSurfaceProps) {
  const { t } = useI18n('common');
  const [emoji, setEmoji] = useState<string>(currentStatus?.moodEmoji ?? '');
  const [content, setContent] = useState<string>(currentStatus?.content ?? '');
  const [seededKey, setSeededKey] = useState<string>(() => seedKeyOf(currentStatus));
  const { visibility, remember } = useFormatAudienceMemory('status');
  const [visibilityUserIds, setVisibilityUserIds] = useState<string[]>([]);
  const { references, pick, drop, clear: clearReferences, payload: referencesPayload } = useReferences();
  const [referencePickerOpen, setReferencePickerOpen] = useState(false);

  // La graine est VIVANTE. Un `useState(currentStatus?.…)` ne se sème qu'au
  // MONTAGE : un mood qui arrive APRÈS (requête en vol) laisserait la grille
  // vide et le champ vide sous un bouton Effacer déjà peint, et l'auteur
  // devrait tout retaper. Le composer hérité re-semait pour cette raison
  // (`StatusComposer.tsx`, `useEffect(..., [open, currentStatus])`).
  //
  // Re-semis pendant le RENDU plutôt que dans un effet, comme le meuble le
  // fait pour la porte : React ré-exécute immédiatement ce composant avec le
  // nouvel état, sans jamais valider à l'écran la frame semée à moitié.
  //
  // L'adoption ne remplit que le VIDE — jamais elle ne remplace ce que
  // l'auteur vient de poser (`ComposerMoodSeeding.adopt`, iOS : « emoji et
  // text ne remplissent que le vide »). C'est ce qui neutralise la course
  // entre la frappe et la réponse de la requête.
  const seedKey = seedKeyOf(currentStatus);
  if (seededKey !== seedKey) {
    setSeededKey(seedKey);
    setEmoji((current) => (current === '' ? currentStatus?.moodEmoji ?? '' : current));
    setContent((current) => (current === '' ? currentStatus?.content ?? '' : current));
  }

  // La BASCULE : retaper l'emoji déjà choisi le désélectionne
  // (`ComposerMoodPolicy.toggling`, iOS).
  const handleToggleEmoji = useCallback((option: string) => {
    setEmoji((current) => (current === option ? '' : option));
  }, []);

  // Le FILET du plafond, pas son mécanisme nominal : c'est `maxLength` sur le
  // champ que le navigateur applique (refus de la 141ᵉ frappe, collage rogné).
  // Cette troncature rattrape ce qui lui échappe — composition IME sur
  // certains moteurs, écriture programmatique — pour que le plafond tienne en
  // toutes circonstances. Voir « Le plafond de 140 » dans la note de fichier.
  const handleContentChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setContent(value.length > MAX_CONTENT_LENGTH ? value.slice(0, MAX_CONTENT_LENGTH) : value);
  }, []);

  const handlePickReference = useCallback(
    (person: { username: string; userId?: string }, display: PostReferenceDisplay) => {
      pick(person, 'picker', display);
      if (display !== 'INLINE') {
        setContent((c) => removingHandle(person.username, c));
      }
    },
    [pick],
  );

  const handleVisibilityChange = useCallback(
    (next: PostVisibility) => {
      remember(next);
      if (!(AUDIENCE_VISIBILITIES as readonly string[]).includes(next)) {
        setVisibilityUserIds([]);
      }
    },
    [remember],
  );

  // Un mood SANS emoji ne part pas — la seule règle de publication du format
  // (`ComposerMoodPolicy.canPublish`, iOS), et une audience nommée ne part
  // jamais vide (`isAudienceIncomplete`, même garde que les trois autres
  // surfaces du meuble).
  const canPublish = emoji.length > 0 && !disabled && !isAudienceIncomplete(visibility, visibilityUserIds.length);

  const handlePublish = useCallback(() => {
    if (!canPublish) return;

    onPublish({
      moodEmoji: emoji,
      content: content.trim() || undefined,
      visibility,
      visibilityUserIds: (AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility)
        ? visibilityUserIds
        : undefined,
      ...(referencesPayload.length > 0 ? { mentions: referencesPayload } : {}),
    });

    setEmoji('');
    setContent('');
    setVisibilityUserIds([]);
    clearReferences();
  }, [canPublish, emoji, content, visibility, visibilityUserIds, onPublish, referencesPayload, clearReferences]);

  // Le geste « effacer » : il remet le formulaire à zéro et emprunte SON
  // canal. Il ne publie rien — voir la note de fichier.
  const handleClear = useCallback(() => {
    setEmoji('');
    setContent('');
    setVisibilityUserIds([]);
    clearReferences();
    onClearStatus?.();
  }, [onClearStatus, clearReferences]);

  const charCount = content.length;

  return (
    <div className={cn('space-y-6', className)} data-testid="composer-status-surface">
      <div className="space-y-3">
        <div
          className="grid grid-cols-5 gap-3 justify-items-center"
          data-testid="composer-status-emoji-grid"
        >
          {MOOD_EMOJIS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => handleToggleEmoji(option)}
              disabled={disabled}
              className={cn(
                'w-12 h-12 flex items-center justify-center rounded-full text-2xl',
                'transition-all duration-300',
                'hover:bg-[var(--gp-hover)] active:scale-90',
                emoji === option
                  ? 'ring-2 ring-[var(--gp-terracotta)] ring-offset-2 ring-offset-[var(--gp-surface)] bg-[var(--gp-terracotta)]/10 scale-110'
                  : 'bg-[var(--gp-parchment)]',
              )}
              aria-label={`Mood ${option}`}
              aria-pressed={emoji === option}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div
        className="flex flex-wrap items-center justify-center gap-2"
        data-testid="composer-status-visibility-options"
      >
        {PUBLICATION_VISIBILITY_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            data-testid={`composer-status-visibility-${opt.id}`}
            onClick={() => handleVisibilityChange(opt.id)}
            disabled={disabled}
            aria-pressed={visibility === opt.id}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300',
              visibility === opt.id
                ? 'bg-[var(--gp-terracotta)] text-white'
                : 'bg-[var(--gp-hover)] text-[var(--gp-text-secondary)] hover:text-[var(--gp-text-primary)]',
            )}
          >
            <span aria-hidden="true">{opt.icon}</span>
            {t(opt.labelKey)}
          </button>
        ))}
      </div>

      {(AUDIENCE_VISIBILITIES as readonly string[]).includes(visibility) && (
        <AudienceUserPicker
          mode={visibility as 'EXCEPT' | 'ONLY'}
          selectedIds={visibilityUserIds}
          onChange={setVisibilityUserIds}
        />
      )}

      <div className="space-y-2">
        <input
          type="text"
          value={content}
          onChange={handleContentChange}
          placeholder={t('statusComposer.placeholder')}
          aria-label={t('statusComposer.placeholder')}
          maxLength={MAX_CONTENT_LENGTH}
          disabled={disabled}
          className={cn(
            'w-full px-4 py-2.5 rounded-xl text-sm',
            'bg-[var(--gp-parchment)] text-[var(--gp-text-primary)]',
            'placeholder:text-[var(--gp-text-muted)]',
            'border border-[var(--gp-border)]',
            'focus:outline-none focus:ring-2 focus:ring-[var(--gp-terracotta)]/50 focus:border-[var(--gp-terracotta)]',
            'transition-colors duration-300',
          )}
        />
        <div className="flex items-center justify-between">
          <ReferencePicker
            references={references}
            onChange={handlePickReference}
            onRemove={drop}
            modes={REFERENCE_MODES}
            open={referencePickerOpen}
            onOpenChange={setReferencePickerOpen}
          />
          <span
            data-testid="composer-status-char-count"
            className={cn(
              'text-xs transition-colors duration-300',
              charCount >= WARNING_THRESHOLD ? 'text-[var(--gp-error)] font-medium' : 'text-[var(--gp-text-muted)]',
            )}
          >
            {charCount}/{MAX_CONTENT_LENGTH}
          </span>
        </div>
        {references.length > 0 && (
          <ReferenceChipRow references={references} onOpen={() => setReferencePickerOpen(true)} />
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="primary" onClick={handlePublish} disabled={!canPublish} className="w-full">
          {t('publish')}
        </Button>

        {currentStatus && onClearStatus && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClear}
            disabled={disabled}
            className="w-full text-[var(--gp-text-muted)]"
          >
            {t('statusComposer.clear')}
          </Button>
        )}
      </div>
    </div>
  );
}

ComposerMoodSurface.displayName = 'ComposerMoodSurface';
