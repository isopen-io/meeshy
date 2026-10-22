"""Quantités plurielles : ce que la CLDR exige d'une langue, et ce que le catalogue fournit.

Les sept langues cibles et leurs catégories cardinales (CLDR 44) :

  en de            one other
  fr es it pt      one many other      (many : multiples exacts de 10^6)
  ar               zero one two few many other

Le catalogue fait foi : une variation `plural` devient un `<plurals>` avec EXACTEMENT
les quantités qu'il fournit. Une quantité exigée par la CLDR et absente fait échouer
la génération, en nommant la clé et la langue, plutôt que de laisser Android retomber
en silence sur `other` : c'est une traduction à faire, pas un détail.

Une seule issue de secours, déclarée par l'entrée du manifeste (`fillMissingQuantities`) :
reprendre le texte de `other` pour les quantités absentes, ce que fait iOS lui-même
quand une catégorie manque.
"""
from __future__ import annotations

from typing import Dict, Mapping, Tuple

from android_xml_writer import QUANTITY_ORDER


class PluralError(ValueError):
    pass


_CLDR_CARDINAL: Dict[str, Tuple[str, ...]] = {
    "en": ("one", "other"),
    "de": ("one", "other"),
    "fr": ("one", "many", "other"),
    "es": ("one", "many", "other"),
    "it": ("one", "many", "other"),
    "pt": ("one", "many", "other"),
    "ar": ("zero", "one", "two", "few", "many", "other"),
}


def required_quantities(locale_code: str) -> Tuple[str, ...]:
    try:
        return _CLDR_CARDINAL[locale_code]
    except KeyError:
        raise PluralError(f"langue sans règle plurielle connue : {locale_code}") from None


def resolve_quantities(
    *, key: str, locale_code: str, provided: Mapping[str, str], fill_missing: bool = False
) -> Tuple[Tuple[str, str], ...]:
    unknown = sorted(quantity for quantity in provided if quantity not in QUANTITY_ORDER)
    if unknown:
        raise PluralError(f"clé « {key} » [{locale_code}] : quantité inconnue {', '.join(unknown)}")
    if "other" not in provided:
        raise PluralError(f"clé « {key} » [{locale_code}] : la quantité « other » est obligatoire")
    missing = [quantity for quantity in required_quantities(locale_code) if quantity not in provided]
    if missing and not fill_missing:
        raise PluralError(
            f"clé « {key} » [{locale_code}] : quantité(s) CLDR absente(s) du catalogue : {', '.join(missing)}"
        )
    completed = {**provided, **{quantity: provided["other"] for quantity in missing}}
    return tuple((quantity, completed[quantity]) for quantity in QUANTITY_ORDER if quantity in completed)
