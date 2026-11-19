"""
Forme servie d'un horodatage (#19596) : ISO 8601 en UTC, millisecondes, suffixe `Z`.

C'est la forme de `Date.prototype.toISOString()`, celle que la passerelle sert
sous `format: 'date-time'` et qu'un décodeur strict accepte. Un `datetime` naïf
est lu comme une heure LOCALE, ce que rend `datetime.now()`.
"""

from datetime import datetime, timezone
from typing import Optional


def served_utc(moment: Optional[datetime]) -> Optional[str]:
    if moment is None:
        return None
    utc = moment.astimezone(timezone.utc)
    return f"{utc.strftime('%Y-%m-%dT%H:%M:%S')}.{utc.microsecond // 1000:03d}Z"
