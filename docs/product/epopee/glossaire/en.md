# The epic’s glossary — English

> Translated term for term from `fr.md`, the source, after the design `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` (§ 2, § 3, § 4). If the two disagree, the design is right, then `fr.md`, and this glossary is corrected. Issue: #11174.
>
> This glossary is the authority for the game’s English texts on the web, on iOS and in the gateway: **one term per concept, the same everywhere.**
>
> Its checkable projection is `packages/shared/design/game-epic-vocabulary/en.json` (banned words and canonical names), applied by the web guard `apps/web/src/lib/game/epic-vocabulary.test.ts` to every value of the English game catalogues. A rule that enters here enters there, in the same commit. Format: `README.md`.

## What never changes

- **The rules of the game**: thresholds, prices, gains, caps. No number moves.
- **The wire keys**: `etincelle`, `lumiere`, the rank, league and Flame-form keys, the served field names. Only the displayed TEXT changes.
- The parameters (`{count}`, `{level}`…) and the plural families (`.one`, `.other`) of each key.

## The story on one page

The signed-in player is **the hero**. Their quest: to become a **Legend**. Beyond it, the **Myth** awaits only a hundred chosen ones, “those whom the god of their ancestors walks before”.

Every real exchange makes **sparks** fly. Together, they form **your light**. Your **ancestors** watch over you: each night, they send you a **dream** to fulfill; at each evolution, they **send you a sign**. At Ambassador, they reveal themselves: you recognize their land among seven (Eternal Africa, Solar Egypt, Olympus, Celestial Empire, Northern Lights, Abysses, Neon).

**Mee and Meo**, two hummingbirds, carry messages between the two worlds. They guide each step and speak the story’s voice. They act or speak: never a decoration.

**The god of the ancestors** is never named nor drawn. They speak only once, at the threshold of the Myth.

## The two voices

| Voice | Where | Form | Example |
|---|---|---|---|
| **A, the summary** | player banner, pills, crest next to a name, frames of the main Progress view | a short name and its number | “Bridge-builder IV”, “12 Meeshes · Pouch”, “Jade · 4th” |
| **B, the story first** | detailed Progress page, concept cards, Mee and Meo’s cards, signs from the ancestors, detail sheets, rule book | the sentence leads, the exact number follows in small type | “Your Pouch holds 12 Meeshes”, then in small type “the Casket at 50” |

An unclassified surface: if there is room for a sentence, B; otherwise A. Banned words disappear in both voices.

The tone: plain, warm English written for a 13-year-old, one idea per sentence. In a sentence, “glory” is lowercase and follows the number: “+250 glory”. A signed amount is never separated from the word before it by a breaking space (` ` before “+”).

## Banned words (everywhere)

| Banned word | What replaces it |
|---|---|
| increase, raise (a number) | grow, feed, awaken, shine brighter |
| counter | the concept’s name (“your glory”, “your Flame”) |
| value, real value | “your light” |
| convertible, pocket, in your pocket | “your light” |
| potential | nothing: say what you have |
| debt | “a shadow veils N sparks of your light” (the **Shadow**) |
| record (lifetime total) | “received since the beginning” |
| level record | “your highest light” |
| Flame record, streak record | “your longest Flame” |
| Meesh record | “minted since the beginning” |
| N more before X, still needed for X | in small type, “N to X” |
| cost, costs (on a card) | a sentence: “it binds N sparks of your light”; the arithmetic goes in the rules |
| left after, will remain | nothing: no subtraction on a card |
| rate, rate table | “each move makes its own sparks fly” |
| base price, percentage, factor (on a card) | nothing: the arithmetic lives in the rules |
| league | joust |
| rank, ranking (in the joust) | place |
| pseudonym, nickname | joust name |
| duo, duo mission | alliance |
| season | journey |
| season stars | strides |
| season step | stop |
| prestige, Prestige stars | rebirth, Ages |
| freeze | Vigil |
| streak | Flame |
| mission, daily missions | the dream; an act |
| chest of the day, daily chest | the Offering |
| achievement | great deed |
| badge | medal |
| notebook, progress notebook | the Chronicle |
| constellation (the concept) | the ancestors’ sky |
| celebration | sign from the ancestors |
| step, milestone (in the game) | trial (every ten levels), stop (the journey) |
| treasury, treasure (the concept, lowercase) | the Legacy |
| “+250 Glory” | “+250 glory” |

## One word, one meaning

| Word | It now means | It no longer means |
|---|---|---|
| Ember | the Flame’s first form | the first level phase (→ Spark) |
| Spark | the unit, and the first phase of light | — (as in French, the first phase bears the unit’s name) |
| Light | your light, the whole thread (the hero’s Light) | a level phase (→ Gleam) |
| Chest | the Legacy’s fourth container | the chest of the day (→ the Offering) |
| Treasure | the Legacy’s fifth container (capitalized) | the whole concept (→ the Legacy) |
| Star | the sky: the Star phase, the ancestors’ sky, star fragments, a medal’s stars | Prestige (→ Ages), the season (→ strides), the label of a medal’s thresholds (→ Marks) |
| Step | onboarding only (“Step 2 of 7”, “The seven steps”, “First steps”) | the ten-level threshold (→ trial), the season (→ stop); the journey counts **strides**, never steps |
| Rank | the name the world gives the hero | the place in the joust (→ place) |
| Record | nothing anymore | see “since the beginning”, “your highest light”, “your longest Flame”, “minted since the beginning” |
| Phase | one of the twenty states of your light | — (never “tier”: that word belonged to every ladder at once) |
| Form | one of the Flame’s five shapes | — |
| Container | one of the Legacy’s six vessels (Purse → Reserve) | — |
| Rung | one of the five steps of a rank (V to I) | — |
| Mark | one of a medal’s seven thresholds | — |
| Bind | what minting does to your light (“binds part of your light into a coin”) | — (never “freeze”, which was the Vigil’s old name, nor “seal”, which is the Journey Seal) |

## The concepts

### The Light (level — `game.level.*`, `game.tier.*`, `level-steps` trials)

- **What it is**: the hero’s light, passing through twenty phases. Their level is the number in the ring.
- **The twenty phases**: **Spark** (key `etincelle`, never “Ember”), Glimmer, **Gleam** (key `lumiere`, never “Light”), Radiance, Ray, Dawn, Comet, Star, Constellation, Galaxy, then Nebula, Pulsar, Quasar, Supernova, Magnetar, Cluster, Supercluster, Cosmos, Infinity, Singularity.
- **The trial**: every ten levels, from 10 to 100, the ancestors ask for a trial (a Meesh, a dream, a Flame, a rank). Until it is passed, the light waits.
- **The rank opens the light**: Supernova is the limit below Ambassador, Ambassador opens up to Singularity, Oracle lifts every limit.
- **A**: ring “34” · Radiance; “Level 34”.
- **B**: “Your light shines as Radiance”, then in small type “level 34 · 3,200 sparks to level 35”.
- **Banned**: “N more before level X” → “N sparks to level X”; “step”, “tier” → “trial”, “phase”; “level record” → “your highest light”.

### Sparks (`game.sparks.*`, `game.points.*`)

- **What it is**: the unit. Every real exchange makes sparks fly; together, they form **your light**.
- **The names**: the pocket = “your light”; the cycle = “this Age” / “since your last rebirth”; the lifetime total = “received since the beginning”; the debt = **the Shadow**.
- **The card** is called “Sparks”. Its head: “Your light”, **108,233 sparks** large, “377,752 received since the beginning” small.
- **A**: “108,233 sparks”.
- **B**: “Your light holds 108,233 sparks”, then in small type “377,752 received since the beginning”.
- **The Shadow**: “A shadow veils N sparks of your light: your next sparks will clear it. While it’s there, no Meesh can be minted.”
- **Banned**: “convertible”, “real value”, “potential”, “spark record”, “in your pocket” → “your light”; “debt” → the Shadow; “rate” → “each move makes its own sparks fly”.

### Rank (glory — `game.glory.*`, `game.rank.*`)

- **What it is**: the name the world gives the hero. Glory grants it, and it never goes back.
- **The ranks**: Whisper, Echo, Voice, Storyteller, Bridge-builder, Polyglot, Ambassador, Orator, Oracle, Legend, then the **Myth** (a hundred chosen ones).
- **The rungs**: five per rank, from V (the first) to I (the highest).
- **A**: “Bridge-builder IV”; “glory 44,600”.
- **B**: “They call you Bridge-builder”, then in small type “second rung · glory 44,600”.
- **Banned**: “N more Glory before X” → “N glory to X”; “+250 Glory” → “+250 glory”; “counter” → “your glory”.

### The Legacy (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **What it is**: the coins kept for your line. **Minting a Meesh binds part of your light into a numbered coin**: your light, and so your level, drops by as much; what you received stays received.
- **The Meeshes card** is called “The Legacy”.
- **The containers** (unchanged): Purse (1), Pouch (10), Casket (50), Chest (100, rank Voice I), Treasure (500, Polyglot III), Reserve (1,000, Ambassador III).
- **The editions**: silver; gold (every hundredth); prism (every thousandth).
- **A**: “88 Meeshes · Casket”.
- **B**: “Your Casket”, **88 Meeshes** large, “the Chest opens at 100”, “91 minted since the beginning”.
- **The mint**: “Meesh no. 92 — It binds 10,423 sparks of your light, which holds 108,233.”; the button “Mint with Mee and Meo”, “+1,000 glory” small inside.
- **Banned**: “costs”, “left after”, “base price … % at level …” → nothing on the card; “Meesh record” → “minted since the beginning”; “convertible” → “your light”; “treasury” (the concept) → “the Legacy”.

### The Dream and the Offering (`game.mission.*`, `game.chest.*`)

- **What it is**: each night, the ancestors send a **dream** in three acts, richer and richer in glory.
- **The names**: **Act I**, **Act II**, **Act III**, sometimes the **Golden Act**. The three acts complete make **the Offering** appear, a veiled gift (closed, it reveals nothing). The **Prism Hour**: an hour when every act counts double. Changing an act takes a Meesh.
- **A**: “Dream 2/3”.
- **B**: “Tonight’s dream · 2 acts of 3”, then in small type “Act III is worth 250 glory”.
- **Verbs**: a dream is **fulfilled**; an act is **completed**.
- **Banned**: “daily missions” → “the dream”; “mission” → “act”; “chest of the day” → “the Offering”; “10 daily missions” (trial) → “10 dreams fulfilled”.

### The Flame (`game.flame.*`)

- **What it is**: the fire the ancestors entrust to the hero. One move a day tends it.
- **The forms**: Ember (1 day), Flame (7), Blaze (30), Luminary (100), Sun (365).
- **The Vigil** keeps the Flame lit for one day away (two at most, one Meesh each). Once out, the Flame can be relit within 48 hours (three Meeshes).
- **It feeds your dreams**: each day adds sparks to each act, up to half as much again.
- **A**: “▲ 23 d”, “Flame 23 days”.
- **B**: “Your Flame has burned for 23 days”, then in small type “+46 % on your dreams”.
- **Banned**: “freeze” → “Vigil”; “streak” → “Flame”; “streak record” → “your longest Flame”.

### The Joust and the Alliance (`game.league.*`, `game.duo.*`)

- **What it is**: each week, thirty heroes of similar light measure themselves under their **joust name**.
- **The circles** (unchanged): Quartz, Amber, Jade, Sapphire, Ruby, Amethyst, Diamond, Prism. In a sentence the circle comes first: “the Jade joust”, “Jade joust · 4th”.
- The top seven **climb to the next circle**, the bottom five go back down, the top three receive a **cup**. The **Friends’ Joust** is always open.
- **The Alliance**: once a week, with a friend; if each of you does your part, the reward doubles.
- **A**: “Jade · 4th”.
- **B**: “Jade joust · 4th place”, then in small type “the top 7 climb to Sapphire”.
- **Banned**: “league” → “joust”; “rank”, “ranking” in the joust → “place”; “pseudonym”, “nickname” → “joust name”; “duo”, “duo mission” → “alliance”.

### The Journey (`game.season.*`)

- **What it is**: every eight weeks, the ancestors send the hero on a journey to the **land of a language**: French, Spanish, Arabic, Swahili, Japanese, Portuguese, Hindi, Chinese (“in the land of French”).
- **The strides**: each act completed carries you a few strides (1 for an act, 2 for Act III, 3 for the Golden Act, 5 for an alliance). Four strides lead to the next **stop**; forty stops make the journey. At the end, the **journey cup**.
- **The Journey Seal** (10 Meeshes) adds collectibles, with no advantage.
- **A**: “Journey 1 · stop 9/40”.
- **B**: “In the land of French · 9th stop”, then in small type “2 strides to the next stop”.
- **Banned**: “season” → “journey”; “season stars” → “strides”; “season step” → “stop”.

### Rebirth (`game.prestige.*`)

- **What it is**: at level 100, when their light has become a Galaxy, the hero can be reborn. Their light becomes a Spark again and their legend enters a new **Age**. The ancestors offer them a trophy and great glory. Nothing else is lost.
- **The Ages**: First Age (before any rebirth), Second Age… up to the Sixth Age (five rebirths at most).
- **A**: “Age II”.
- **B**: “Your legend lives its Second Age”.
- **Banned**: “prestige” → “rebirth”; Prestige “stars” → “Ages”.

### The traces of the legend

| Before | In the epic | Details |
|---|---|---|
| celebration, photo moment | **sign from the ancestors** | “Your ancestors send you a sign”: an animation, a frame, a photo with Mee and Meo |
| progress notebook | **the Chronicle** | the book of the legend, where each sign is immortalized |
| achievements | **Great Deeds** | rarities unchanged; a great deed is **done** |
| showcase, trophies | **Trophies** | joust and journey cups, rebirth and Flame trophies |
| badges | **Medals** | materials: Copper, Bronze, Silver, Gold, Platinum, Obsidian, Prism; a medal climbs seven **marks** |
| Atlas | **the Atlas** | one stamp per language truly exchanged |
| Constellation, star fragments | **the ancestors’ sky** | ten star fragments light a star; each star offers an adornment |

- **Banned**: “achievement” → “great deed”; “badge” → “medal”; “notebook” → “Chronicle”; “constellation” (the concept) → “the ancestors’ sky”; “celebration” → “sign from the ancestors”.

### Momentum and Challenges

Unchanged (Élans = **Momentum**, Défis = **Challenges**). “Momentum multiplies the sparks that fly.” “Your next moves bring {factor} times more.”

## The names of the Progress frames (voice A)

The Light · Sparks · The Legacy · Rank · The Flame · The Dream · The Joust · The Journey · Rebirth · Momentum · Medals · Challenges · Great Deeds · Trophies · The Atlas.

The rule book adds: The Meesh · The Offering · The Legacy · The Trials · The Alliance.

## Decisions taken for English, to review

- **Light phases are “phases”**, never “tiers” or “states”: “tier” used to name every ladder (level, treasury, medals) at once.
- **The journey walks in strides**: English “step” already names onboarding (“Step 2 of 7”), so the French *pas* becomes **stride**, and *halte* becomes **stop**.
- **“Gleam”** replaces “Light” for the phase keyed `lumiere`, as French moved it to *Clarté*: “Light” now belongs to the hero’s whole light.
- **“Bind”** translates *figer*: “Minting binds part of your light into a coin”.
- **“The Legacy”** translates *l’Héritage*; the containers keep their names.
- **“Vigil”** translates *la Veilleuse* (the old “freeze”).
- The verb **“mint”** stays (it was already the English word for *frapper*).
