import { Avatar } from '@/components/avatar';
import type { FaceRampEntry } from '@/lib/summary/types';
import { initialsOf } from '@/lib/view/conversation';

/**
 * « ILS T'ATTENDENT » — miroir `FaceRampView.swift` (#5695, étape 8). Rail
 * horizontal de pastilles, badge en haut-droite (`awaitingCount`, JAMAIS le
 * score), nom tronqué sur une ligne.
 *
 * ÉCART ASSUMÉ sur le NOMBRE (revue #5695) — iOS sert un patron unique
 * (« %@, %d messages t'attendent », `FaceRampView.swift:71-81`), qui prononce
 * « 1 messages t'attendent » au singulier. Le web accorde le nom ET le verbe :
 * un lecteur d'écran est la seule voix de ce libellé, une faute d'accord s'y
 * entend.
 */
export function FaceRamp({
  entries,
  onTap,
}: {
  readonly entries: readonly FaceRampEntry[];
  readonly onTap: (entry: FaceRampEntry) => void;
}) {
  if (entries.length === 0) return null;
  return (
    <section data-face-ramp aria-label="Ils t'attendent" className="flex flex-col gap-2">
      <h3 className="text-title font-black" style={{ color: 'var(--color-ios-ink)', opacity: 0.92 }}>
        Ils t&rsquo;attendent
      </h3>
      <div className="flex gap-3 overflow-x-auto px-0.5">
        {entries.map((entry) => (
          <button
            key={entry.id}
            type="button"
            data-face
            data-user={entry.id}
            onClick={() => onTap(entry)}
            aria-label={
              entry.awaitingCount === 1
                ? `${entry.displayName}, 1 message t'attend`
                : `${entry.displayName}, ${entry.awaitingCount} messages t'attendent`
            }
            className="relative flex min-h-11 w-12 shrink-0 flex-col items-center gap-1"
          >
            <span className="relative">
              <Avatar
                initials={initialsOf(entry.displayName)}
                color={entry.colorHex}
                size={44}
                presence={entry.presence}
              />
              {entry.awaitingCount > 0 ? (
                <span
                  aria-hidden
                  className="absolute -top-1 -right-1 grid min-h-4 min-w-4 place-items-center rounded-chip px-[5px] text-[10px] font-black text-white"
                  style={{
                    backgroundColor: 'var(--color-ios-brand)',
                    boxShadow: '0 0 0 1.5px var(--color-ios-surface)',
                  }}
                >
                  {entry.awaitingCount}
                </span>
              ) : null}
            </span>
            <span
              className="max-w-[48px] truncate text-mini font-semibold"
              style={{ color: 'var(--color-ios-ink)', opacity: 0.75 }}
            >
              {entry.displayName}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

export default FaceRamp;
