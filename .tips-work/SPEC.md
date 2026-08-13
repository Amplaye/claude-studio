# "Did you know?" tips — shared spec

You are writing entries for a "Did you know?" line shown on the new-session screen of
a VS Code extension. The reader is a developer, but these tips are deliberately NOT
about code — they are about the world. They should feel like the best fact you heard
this month.

## Output

Write a single JSON file (path given in your task) containing **exactly one JSON array**.
No prose before or after, no markdown fences. Each element:

```json
{ "en": "English sentence.", "it": "Frase italiana.", "cat": "astronomy" }
```

- `en` — one sentence, 60–190 characters, ending in a full stop.
- `it` — the same fact in natural, idiomatic Italian. Translate the *meaning*, not the
  words. Correct Italian typography: no space before punctuation, use « » only if needed.
- `cat` — short lowercase slug, no spaces (e.g. `astronomy`, `etymology`, `marine-life`).

The file must be valid JSON: escape any internal quotes, and prefer avoiding them.

## Rules

1. **Exactly the number of items requested.** Count before you finish.
2. **True and checkable.** If you are not confident it is accurate, leave it out.
   Prefer solid, well-documented facts over spectacular-but-shaky ones.
3. **Self-contained.** No "as mentioned", no reference to other tips.
4. **No prefix.** Never begin with "Did you know" / "Lo sapevi" — the UI prints that
   label itself. Never begin with "Fun fact".
5. **Timeless wording.** No "recently", "currently", "last year", "as of today",
   "scientists just discovered". These go stale on a screen that ships for years.
6. **Surprising.** "Water is wet" is worthless. The test: would a curious adult say
   "huh, I didn't know that"?
7. **Vary the sentence shape.** Do not let most entries start with "The". Mix openings:
   start with a number, a place, a name, a verb, a subordinate clause.
8. **No duplicates**, and no two entries making the same point in different words.
9. Plain text only: no markdown, no emoji, no ALL CAPS, no exclamation marks.
10. Keep it apolitical and non-gruesome. No living-person gossip, no medical advice,
    no tips that could be read as instructions for harm.

## Myths that are FALSE — never include these or anything like them

Goldfish have a three-second memory; the Great Wall is visible from space with the
naked eye; we use only 10% of our brains; lightning never strikes the same place
twice; Napoleon was unusually short; blood in veins is blue; Vikings wore horned
helmets; a penny dropped from a skyscraper can kill; bulls are enraged by red;
Einstein failed maths; humans have exactly five senses; sugar makes children
hyperactive; you must wait an hour after eating before swimming; hair and nails keep
growing after death; Columbus's contemporaries thought the Earth was flat; the
tongue has distinct taste-zone maps; chameleons change colour to match backgrounds;
Mount Everest is the tallest mountain measured from base to peak; camels store water
in their humps; ostriches bury their heads in sand; bats are blind; you swallow
spiders in your sleep; different alcohols cause different kinds of drunkenness.

## Good examples

```json
{ "en": "Honey found in Egyptian tombs was still edible after three thousand years, because its low water content and acidity leave bacteria nowhere to grow.", "it": "Il miele ritrovato nelle tombe egizie era ancora commestibile dopo tremila anni: poca acqua e molta acidità non lasciano ai batteri alcuno spazio per crescere.", "cat": "food" }
{ "en": "Iceland has no mosquitoes, one of very few inhabited places on Earth where the insect has never established itself.", "it": "In Islanda non ci sono zanzare: è uno dei pochissimi luoghi abitati al mondo dove l'insetto non ha mai messo radici.", "cat": "nature" }
{ "en": "Oxford University was already teaching when the Aztec capital Tenochtitlan was founded, making it older than the Aztec empire itself.", "it": "L'Università di Oxford teneva già lezioni quando fu fondata Tenochtitlan: è più antica dell'impero azteco.", "cat": "history" }
```

## Italian typography — important

The interface already speaks Italian and it uses **proper accented characters**.
Write `è`, `più`, `già`, `qualità`, `perché`, `così`, `È` — never the ASCII
workarounds `e'`, `piu'`, `gia'`. The file is UTF-8; accented letters are correct
and expected.

For the elision apostrophe (`l'insetto`, `dell'impero`) use the plain straight
quote `'`, not a curly one. Never put a double quote inside a string.
