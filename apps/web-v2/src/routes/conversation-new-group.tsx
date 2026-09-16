import { Avatar } from '@/components/avatar';
import { Field } from '@/components/field';
import { Glyph } from '@/components/glyph';
import type { PersonSummary } from '@/lib/api/friend-requests';
import { GROUP_DESCRIPTION_MAX, GROUP_TITLE_MAX, type GroupDraft, type GroupField } from '@/lib/conversation-new/group';
import { colorForName } from '@meeshy/shared/utils/conversation-colors';
import { initialsOf } from '@/lib/view/conversation';

/**
 * **LE COMPOSEUR D'UN GROUPE** (#6706) — le nom, la description, qui en est, et
 * le geste qui le crée.
 *
 * Extrait de `conversation-new.tsx` pour la raison habituelle (budget de
 * taille) et pour une seconde : la liste des personnes sert les DEUX modes,
 * alors que ceci ne sert qu'au groupe. Un lecteur qui cherche « comment on
 * choisit quelqu'un » n'a pas à traverser « comment on nomme un groupe ».
 *
 * **`onInput` sur les champs texte, jamais `onChange`** — leçon 617 : sous
 * happy-dom un `input` dispatché ne déclenche pas `onChange`, et un champ ainsi
 * câblé se remplit à l'œil sans jamais rapporter à son hôte.
 *
 * **Les personnes choisies sont RETIRABLES d'ici.** Sans cela, se tromper
 * obligerait à remonter la liste pour retrouver la ligne et la dé-sélectionner —
 * le choix se défait là où il se voit.
 */

const FIELD_TINT = 'var(--color-ios-brand)';
const INPUT_CLASS = 'min-w-0 flex-1 bg-transparent text-body outline-none';

export type GroupComposerProps = {
  readonly draft: GroupDraft;
  /** Les personnes choisies, RÉSOLUES — l'écran les tient, ce composant les montre. */
  readonly chosen: readonly PersonSummary[];
  readonly busy: boolean;
  readonly online: boolean;
  readonly refusedField: GroupField | null;
  readonly refusalMessage: string | null;
  readonly focused: 'title' | 'description' | null;
  readonly onEdit: (field: 'title' | 'description', value: string) => void;
  readonly onFocus: (field: 'title' | 'description' | null) => void;
  readonly onRemove: (participantId: string) => void;
  readonly onSubmit: () => void;
};

export function GroupComposer({
  draft,
  chosen,
  busy,
  online,
  refusedField,
  refusalMessage,
  focused,
  onEdit,
  onFocus,
  onRemove,
  onSubmit,
}: GroupComposerProps) {
  const errorFor = (field: GroupField): string | undefined =>
    refusedField === field && refusalMessage !== null ? refusalMessage : undefined;

  const disabled = busy || !online;

  return (
    <form
      noValidate
      data-group-composer
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="grid gap-3 px-4 pt-3"
    >
      <Field
        id="group-title"
        label="Nom du groupe"
        icon="users"
        tint={FIELD_TINT}
        focused={focused === 'title'}
        error={errorFor('title')}
      >
        {({ id, describedBy }) => (
          <input
            id={id}
            name="title"
            data-group-title
            aria-describedby={describedBy}
            aria-required="true"
            aria-invalid={refusedField === 'title'}
            autoComplete="off"
            maxLength={GROUP_TITLE_MAX}
            value={draft.title}
            placeholder="Équipe déploiement"
            onInput={(event) => onEdit('title', event.currentTarget.value)}
            onFocus={() => onFocus('title')}
            onBlur={() => onFocus(null)}
            className={INPUT_CLASS}
            style={{ minHeight: 44, color: 'var(--color-ios-ink)' }}
          />
        )}
      </Field>

      <Field
        id="group-description"
        label="Description (facultative)"
        tint={FIELD_TINT}
        focused={focused === 'description'}
        error={errorFor('description')}
      >
        {({ id, describedBy }) => (
          <textarea
            id={id}
            name="description"
            data-group-description
            aria-describedby={describedBy}
            aria-invalid={refusedField === 'description'}
            rows={2}
            maxLength={GROUP_DESCRIPTION_MAX}
            value={draft.description}
            placeholder="À quoi sert ce groupe ?"
            onInput={(event) => onEdit('description', event.currentTarget.value)}
            onFocus={() => onFocus('description')}
            onBlur={() => onFocus(null)}
            className="min-w-0 flex-1 resize-none bg-transparent py-2.5 text-body outline-none"
            style={{ color: 'var(--color-ios-ink)' }}
          />
        )}
      </Field>

      <ChosenPeople chosen={chosen} error={errorFor('participants')} onRemove={onRemove} />

      <button
        type="submit"
        data-group-submit
        disabled={disabled}
        aria-busy={busy}
        className="grid w-full place-items-center rounded-[14px] font-bold text-white transition-opacity"
        style={{
          minHeight: 52,
          backgroundColor: 'var(--color-ios-brand)',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        {busy ? 'Création du groupe…' : 'Créer le groupe'}
      </button>

      {online ? null : (
        <p className="text-center text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Hors ligne — le groupe se créera quand le réseau sera revenu.
        </p>
      )}
    </form>
  );
}

/**
 * QUI EN EST — et le refus de la LISTE se pose ICI, sous les pastilles, parce
 * que c'est là que le geste qui le corrige se trouve.
 */
function ChosenPeople({
  chosen,
  error,
  onRemove,
}: {
  readonly chosen: readonly PersonSummary[];
  readonly error: string | undefined;
  readonly onRemove: (participantId: string) => void;
}) {
  return (
    <div className="grid gap-1.5">
      <span className="text-caption font-medium" style={{ color: 'var(--color-ios-ink-3)' }}>
        {chosen.length === 0 ? 'Personne choisie' : `${chosen.length} personne${chosen.length > 1 ? 's' : ''}`}
      </span>
      {chosen.length === 0 ? (
        <p className="text-caption" style={{ color: 'var(--color-ios-ink-2)' }}>
          Touchez des personnes dans la liste pour les ajouter.
        </p>
      ) : (
        <ul data-group-chosen className="flex flex-wrap gap-2">
          {chosen.map((person) => {
            const name = person.displayName ?? person.username;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  data-group-remove={person.id}
                  onClick={() => onRemove(person.id)}
                  aria-label={`Retirer ${name}`}
                  className="flex items-center gap-2 rounded-chip py-1 ps-1 pe-2.5"
                  style={{ minHeight: 44, backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink)' }}
                >
                  <Avatar initials={initialsOf(name)} color={colorForName(name)} size={28} />
                  <span className="max-w-[9rem] truncate text-caption font-medium">{name}</span>
                  <span aria-hidden="true" style={{ color: 'var(--color-ios-ink-3)' }}>
                    <Glyph name="x" size={12} />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {error === undefined ? null : (
        <p role="alert" className="text-caption" style={{ color: 'var(--ios-error)' }}>
          {error}
        </p>
      )}
    </div>
  );
}
