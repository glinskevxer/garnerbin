# How garnerbin is put together

Everything here is a plain module of functions over frozen data. There are no
classes with behaviour, no dependency injection and no framework. A settlement
is a function of a ticket, a sample and some schedules, and it can be worked out
in a test in three lines with nothing set up.

## The layers, bottom up

**`src/core`** knows nothing about grain. Money in integer points and cents,
bushels in integer hundredths, calendar days as strings with UTC arithmetic
behind them, the four rounding policies the business uses, and the table
renderer every report prints through.

**`src/commodity`** is the registry of the five things the house takes and the
handful of numbers that differ between them: legal weight, market moisture, when
the crop year rolls, which board hedges it.

**`src/grading`** is the federal tables and everything read off a sample. The
tables are transcribed as data; `grade.js` is the engine that walks them. Special
grades and the conditions that force sample grade sit on top of the numeric
grade rather than inside it.

**`src/weights`** turns pounds into settlement bushels. Moisture, shrink, drying,
the scale ticket itself, and the reconciliation of book against measured.

**`src/pricing`** is the board, the basis, and the schedules the house posts:
discounts as bands, premiums as scales, freight as four kinds of rate.

**`src/settlement`** joins the three of those into money. `settle.js` does one
load; `day.js` does a day against a house, and is the only place that decides
which schedules apply.

**`src/contracts`**, **`src/storage`**, **`src/inventory`**, **`src/hedging`**
and **`src/loadout`** are the rest of the business, each one a small model with
its own vocabulary.

**`src/accounts`** is the grower ledger. The posting kind decides the sign, so
nothing can post a storage charge that pays the grower.

**`src/config`** reads the house file and refuses silent defaults.

**`src/io`** reads and writes: csv the way the outside world sends it, the fixed
width flat file the scale house writes, atomic json, and the little schema the
house file is checked against.

**`src/report`** renders. Nothing in here computes anything a caller could not
have computed itself.

**`src/audit`** is the sealed journal and the replay that audits forwards from
it.

**`src/cli`** is thin. Every command reads files through `desk.js`, calls into
the layers above, and prints. A command that changes something takes an explicit
output path.

## Rules the code follows

- **Nothing is edited in place.** Applying a load to a contract returns a new
  position. Receiving grain returns a new house. The old state is still there,
  which is what makes the history answerable.
- **Errors carry codes.** Every failure is a `GarnerbinError` subclass with a
  screaming snake case code and a details object. The message text can be
  reworded; the codes do not move.
- **Guards throw coded errors, not `TypeError`.** A bad import file reads the
  same in the log as a bad command line.
- **Money never touches a float.** See `src/core/money.js`.
- **Every date is a day string.** See `src/core/dates.js`.
- **Anything under `src` that is not a command is exported from `src/index.js`**,
  and a test fails if it is not.

## Testing

One test file per module, mirroring `src` under `tests`. The suite runs in a few
seconds and does not touch the network. The tests that earn their keep are the
ones that fix a rule rather than a number: dockage comes off before shrink,
settlement bushels use the legal weight, the floor on a minimum price contract is
the cash less the premium.
