/** L'étoile d'une case épinglée — la même sur un Mee et sur un sticker de « Mes stickers ». */
export function FavoriteStar() {
  return (
    <span
      aria-hidden
      data-favorite-star
      className="pointer-events-none absolute left-1 top-1 grid h-5 w-5 place-items-center rounded-full text-caption"
      style={{ backgroundColor: 'var(--accent)', color: 'var(--color-ios-on-brand)' }}
    >
      ★
    </span>
  );
}
