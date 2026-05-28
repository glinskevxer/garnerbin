# garnerbin

Receiving, grading, storage and settlement for a country grain elevator.

This is the office side of the house. A load comes across the scale, the probe
truck pulls a sample, the grader reads it, and everything after that is
arithmetic that has to be right and has to be explainable to the grower
standing at the window.

## What it does

- Grades corn, soybeans, hard and soft red winter wheat and grain sorghum
  against the federal tables, including the special grades and the conditions
  that force sample grade.
- Turns net pounds into settlement bushels: dockage off the gross, then shrink
  off what is left, at the house shrink factor.
- Settles a load against a posted discount schedule, a premium scale, a drying
  schedule and the
  commodity checkoff, and prints a statement a grower can follow with a
  calculator.
- Keeps contracts of all six kinds, applies loads to them, rolls the futures leg
  and prices the open one.
- Ages open storage, charges delayed price, tracks warehouse receipts.
- Holds the bin ledger, works out blends, and prints the daily position with the
  unhedged column the lender reads.
- Marks the hedge book and works the margin call back to initial.
- Keeps grower accounts and prints the payables book and the statements.
- Plans rail loading against the gross rail load and the cube, whichever bites,
  and ranks destinations by what they net back at the pit.

## Running it

```
npm install
npm test
node bin/garnerbin.js --help
```

A whole worked day lives in `examples/`. Every command below runs against it:

```
npm run validate
npm run bids
npm run grade
npm run milling
npm run settle
npm run register
npm run position
npm run haulers
npm run season
npm run contracts
npm run bins
npm run space
npm run storage
npm run accounts
npm run hedge
npm run cars
npm run ship
npm run queue
npm run blend
npm run exceptions
npm run doctor
npm run book
npm run close
npm run audit
```

## The things worth knowing before changing anything

**Money is never a float.** A price is an integer count of points, where a point
is a ten thousandth of a dollar. A dollar amount is an integer count of cents. A
bushel figure is an integer count of hundredths of a bushel. `src/core/money.js`
is the only place that converts between them.

**Dockage comes off before shrink.** Dockage is not grain and the house never
owned it, so it leaves on the gross weight. Shrink is water leaving the grain
that is actually there, so it comes off what is left. The other order takes
shrink on the weed seed and cannot be explained to anybody.

**Settlement bushels use the legal weight, not the test weight.** A light load of
corn still divides by 56. The test weight earns a discount, not fewer bushels.

**Moisture is not a grade factor.** A load at twenty two percent is still No. 2
corn. It is expensive No. 2 corn.

**Every date is a calendar day string and every calculation runs through UTC.** A
settlement worked out in Kansas comes out the same on a laptop set to Auckland.

## Layout

| where            | what                                                          |
| ---------------- | ------------------------------------------------------------- |
| `src/core`       | money, units, dates, rounding, text                           |
| `src/commodity`  | the five things the house takes                               |
| `src/grading`    | factors, the federal tables, dockage, samples, certificates   |
| `src/weights`    | moisture, shrink, drying, tickets, the settlement weight path |
| `src/pricing`    | the board, the basis, discount schedules                      |
| `src/settlement` | settling a load and printing the statement                    |
| `src/contracts`  | the six kinds, applications, rolls, pricing, delayed price    |
| `src/storage`    | storage accrual and warehouse receipts                        |
| `src/inventory`  | bins, the bin ledger, blending, the position                  |
| `src/hedging`    | hedge lots and the margin call                                |
| `src/loadout`    | shipping orders and rail                                      |
| `src/accounts`   | grower accounts and the postings on them                      |
| `src/config`     | the house file and what it refuses                            |
| `src/io`         | csv, fixed width, the json store, the schema, importers       |
| `src/report`     | the register, grade distribution, exceptions, the season      |
| `src/audit`      | the sealed journal and the replay that audits it              |
| `src/cli`        | the commands                                                  |
| `tests`          | one file per module, mirroring `src`                          |
