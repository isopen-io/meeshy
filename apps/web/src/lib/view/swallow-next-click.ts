/**
 * LE CLIC QUI SUIT UN GESTE EST AVALÉ — le relâcher d'un appui long (#11211) ou
 * d'un tirage (#17243) tombe sur ce qui est sous le doigt, et l'activerait. Un
 * seul clic, celui qui vient ; un nouvel appui lève l'avalement, et la
 * fonction rendue le lève aussi (démontage).
 */
export function swallowNextClick(): () => void {
  const swallow = (event: Event): void => {
    event.preventDefault();
    event.stopPropagation();
    detach();
  };
  function detach(): void {
    window.removeEventListener('click', swallow, true);
    window.removeEventListener('pointerdown', detach, true);
  }
  window.addEventListener('click', swallow, true);
  window.addEventListener('pointerdown', detach, true);
  return detach;
}
