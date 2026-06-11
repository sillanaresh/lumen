// seed.js — the seeded demo corpus: 12 notes on how to learn effectively.
// The benchmark (benchmark.json) is written against THIS corpus; editing these
// notes in the app triggers a corpus-drift warning in the Eval Lab.

export const SEED_VERSION = 'learning-science-v2';

export const SEED_NOTES = [
  {
    id: 'n01',
    title: 'Active recall beats re-reading',
    tags: ['memory', 'study-technique', 'evidence-based'],
    content: `# Active recall beats re-reading

Re-reading *feels* productive because the words get more familiar each pass. But familiarity is not the same as memory. When you close the book and ask yourself "what were the three arguments in that chapter?" — that's when learning actually happens.

## The mechanism

Every retrieval **strengthens the memory trace**. It's why a flashcard you get wrong, then get right, sticks longer than one you merely stared at for ten minutes.

## What this looks like in practice

- Close the textbook and write down what you remember, *then* check
- Turn every heading into a question before reading the section
- After a lecture, summarize it to a rubber duck (or a human) from memory

> The single highest-leverage study habit change most people never make.

Pairs with: **spaced repetition**, **the illusion of competence**.`
  },
  {
    id: 'n02',
    title: 'Spaced repetition: forgetting is the point',
    tags: ['memory', 'study-technique', 'long-term', 'evidence-based'],
    content: `# Spaced repetition: forgetting is the point

The forgetting curve is not a bug, it's the feature. Each time you're *about to forget* something and you retrieve it just in time, the curve flattens.

## Intervals that work

Rather than memorize a schedule, use a tool that does the math (Anki, RemNote, Mochi). But the shape is roughly:

- Day 1 → Day 2 → Day 4 → Day 9 → Day 20 → Day 45 → …

## Why it's so uncomfortable

It deliberately puts you at the edge of forgetting. That discomfort is *learning doing work*. Most people quit because it feels harder than re-reading — which is exactly why it works.

Pairs with: **active recall**, **why we forget**.`
  },
  {
    id: 'n03',
    title: 'The Feynman Technique',
    tags: ['teaching', 'understanding', 'communication'],
    content: `# The Feynman Technique

Pick a concept. Explain it, in plain language, as if teaching a curious 12-year-old. When you get stuck — that stuck point is your real gap in understanding. Go back, fill it in, try again.

## The four steps

1. Choose a concept you think you understand.
2. Write an explanation using simple words. No jargon to hide behind.
3. Identify the cracks: where did you fudge, hand-wave, fall back on a term you can't unpack?
4. Go back to the source, close the gaps, and retry.

## Why it works

Jargon is a *debt you owe* your understanding. Plain language forces you to pay it. If you can't explain it simply, you don't understand it yet — and now you know *where*.

Pairs with: **learning in public**, **mental models**.`
  },
  {
    id: 'n04',
    title: 'Deliberate practice, not just practice',
    tags: ['skill-building', 'mastery', 'focus'],
    content: `# Deliberate practice, not just practice

10,000 hours is a myth as commonly told. It's not *hours* — it's *hours of the right kind*. Driving for 40 years does not make you a world-class driver. Typing for decades does not make you a typist.

## The ingredients

- A specific, just-beyond-reach goal
- Immediate, honest feedback
- Full attention (no multitasking)
- Deliberate repetition of the hard parts — not the comfortable ones

## The discomfort test

If practice feels good the whole time, you're probably not growing. Deliberate practice sits in the **productive discomfort zone**: hard enough that you fail often, easy enough that you don't drown.

Pairs with: **curiosity-driven learning**, **interleaving**.`
  },
  {
    id: 'n05',
    title: 'Interleaving vs. blocking',
    tags: ['study-technique', 'mastery', 'evidence-based'],
    content: `# Interleaving vs. blocking

**Blocking** = drill problem type A for an hour, then B, then C. Feels smooth. Scores poorly on a mixed test.

**Interleaving** = alternate A, B, C, A, C, B… Feels awful. Scores higher on a mixed test *and* in the real world, where problems arrive out of order.

## Why the discomfort

When you block, your brain loads up a pattern and keeps reusing it without re-deciding. Interleaving forces you to *identify which tool to use* every time — which is the actual skill needed when problems show up in the wild.

## One concrete example

Math students solve mixed problem sets covering several chapters. Harder day-to-day. Much better exam performance. Much better transfer months later.

Pairs with: **deliberate practice**, **the illusion of competence**.`
  },
  {
    id: 'n06',
    title: 'Mental models as retrieval scaffolds',
    tags: ['thinking', 'understanding', 'problem-solving'],
    content: `# Mental models as retrieval scaffolds

Facts are slippery. Models are sticky. A single well-structured model lets you regenerate a hundred facts on demand.

## Examples that earn their keep

- **Supply and demand** — explains pricing, queues, dating markets, housing
- **Compounding** — explains money, skill, reputation, atrophy
- **Incentives** — "show me the incentive, I'll show you the outcome"
- **Second-order effects** — what happens *after* the obvious thing happens?

## Collecting models

Treat them like tools. When you notice yourself reaching for the same explanation in three different domains, you've found one worth keeping.

Pairs with: **the Feynman technique**, **curiosity-driven learning**.`
  },
  {
    id: 'n07',
    title: "Why we forget (and why that's fine)",
    tags: ['memory', 'cognitive-science', 'long-term'],
    content: `# Why we forget (and why that's fine)

Forgetting is not a system failure. It's a system working as designed — filtering out signal from noise.

## What we know

Hermann Ebbinghaus in 1885 mapped the **forgetting curve**: most of what you learn today is gone in 24 hours unless you revisit it. Nothing about that has changed.

## The twist

Forgetting *is what makes remembering possible*. If every impression stuck, recall would be flooded and useless. Your brain is a filter, not a hard drive — and filters throw things away on purpose.

## Implication

Don't fight the forgetting. Work *with* it via spacing, retrieval, and connection.

Pairs with: **spaced repetition**, **sleep and memory**.`
  },
  {
    id: 'n08',
    title: 'Curiosity-driven learning compounds',
    tags: ['motivation', 'thinking', 'intrinsic'],
    content: `# Curiosity-driven learning compounds

Learning things you have to learn is expensive. Learning things you *want* to learn is almost free. Curiosity is the cheapest form of attention there is.

## The multiplier

When you're curious:
- You remember more (emotional salience helps encoding)
- You study longer without fatigue
- You spontaneously make connections across fields
- You're willing to sit with confusion instead of bailing

## How to cultivate it

- Follow threads — when something surprises you, *stop and chase it*
- Read widely, not just deeply. Odd domains produce the best analogies.
- Keep a "questions I'd love to answer" list. Bring curiosity to your study, don't expect study to hand you curiosity.

Pairs with: **mental models**, **deliberate practice**.`
  },
  {
    id: 'n09',
    title: 'Sleep and memory consolidation',
    tags: ['memory', 'long-term', 'cognitive-science'],
    content: `# Sleep and memory consolidation

Sleep is when the day's learning is *filed*. Cut sleep and you're studying with a bucket that has a hole.

## What happens overnight

- During slow-wave sleep, the hippocampus replays the day's experiences, and those replays move memories into neocortical long-term storage
- REM sleep appears to link new memories to existing ones — the "sleep on it, you'll see it differently tomorrow" effect is literal

## The math no one likes

Pulling an all-nighter before an exam often scores *worse* than sleeping, even though you spent more hours studying. The brain you bring to the exam with 4 hours of sleep is not the same instrument.

Pairs with: **why we forget**, **spaced repetition**.`
  },
  {
    id: 'n10',
    title: 'Reading with a pen',
    tags: ['reading', 'retention', 'note-taking'],
    content: `# Reading with a pen

Reading with a pen is 3× slower and 10× more productive. Passive reading is entertainment; active reading is learning.

## The minimum ritual

- Underline exactly *one* sentence per page — the most important one
- In the margin, write **why** in three words
- At chapter end, close the book and write one paragraph from memory

## The test

A week after finishing a book, can you explain its three main arguments to a friend? If not, you were entertained, not taught.

Pairs with: **active recall**, **the Feynman technique**.`
  },
  {
    id: 'n11',
    title: 'The illusion of competence',
    tags: ['evidence-based', 'study-technique', 'metacognition'],
    content: `# The illusion of competence

You highlighted the whole page. You re-read the notes three times. You *feel* ready. Then the test arrives and it all evaporates.

## The bug in your metacognition

When information is *familiar*, the brain confuses that for *retrievable*. These are different things. Familiarity is a sense; retrieval is a capacity.

## How to tell the difference

- Can you explain it, out loud, in plain words, right now? Then you know it.
- If you can only nod along when you re-read? You don't.

## The fix

Practice-test yourself early and often. Shift your judgment of readiness from "does this feel familiar?" to "could I reproduce it cold?"

Pairs with: **active recall**, **interleaving**.`
  },
  {
    id: 'n12',
    title: 'Learning in public',
    tags: ['teaching', 'motivation', 'communication'],
    content: `# Learning in public

The fastest way to learn a field is to commit to explaining it to others *while you're still learning it.* The fear of being wrong in public sharpens everything.

## Why it works

- **Retrieval:** writing / teaching is active recall, disguised as a hobby
- **Clarity:** an audience (real or imagined) forces simple language (see: the Feynman technique)
- **Feedback:** the Internet will correct you faster than any textbook will
- **Accountability:** next week you owe the world another post — so this week you actually study

## The bar

You don't need to be an expert to share. You need to be honestly ahead of your reader by one week. A beginner explaining week-2 ideas well is far more useful to week-1 learners than an expert explaining week-30 ideas over their heads.

Pairs with: **the Feynman technique**, **curiosity-driven learning**.`
  },
];
