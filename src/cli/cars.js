import { bushelsFromDecimal, formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { assertCommodityId } from '../commodity/registry.js';
import {
  CAR_IDS,
  carCapacity,
  describePlan,
  GROSS_RAIL_LOAD_LB,
  planCars,
  SHUTTLE_CARS,
  trainCheck,
} from '../loadout/rail.js';

/**
 * Planning a rail shipment.
 *
 * It prints both limits for every car on the line, not just the one that binds
 * for the car the loader asked about, because the useful answer to "we are two
 * cars short of a shuttle" is often a different car type rather than more
 * grain.
 */

export function runCars(options) {
  const commodity = assertCommodityId(options.commodity);
  const bushels = bushelsFromDecimal(Number(options.bushels));
  const tareLb = options.tare === undefined ? undefined : Number(options.tare);
  const grossLb = options.gross === undefined ? GROSS_RAIL_LOAD_LB : Number(options.gross);
  const carOptions = { tareLb, grossLb };

  const plan = planCars(bushels, options.car, commodity, carOptions);
  const train = trainCheck(plan.cars, { size: Number(options.train ?? SHUTTLE_CARS) });

  const comparison = CAR_IDS.map((id) => {
    const capacity = carCapacity(id, commodity, id === options.car ? carOptions : {});
    return {
      car: id,
      weight: formatBushels(capacity.byWeight),
      volume: formatBushels(capacity.byVolume),
      takes: formatBushels(capacity.bushels),
      binding: capacity.binding,
      cars: planCars(bushels, id, commodity, id === options.car ? carOptions : {}).cars,
    };
  });

  const text = [
    heading(`Loading ${formatBushels(bushels)} bushels of ${commodity}`),
    keyValue([
      ['Car', options.car],
      ['Takes', formatBushels(plan.bushels)],
      ['Limited by', plan.binding],
      ['Cars', String(plan.cars)],
      ['Last car', plan.partialCarBushels === 0 ? 'full' : formatBushels(plan.partialCarBushels)],
      [
        'Train',
        train.qualifies
          ? `makes the ${train.size} car rate`
          : `${train.carsShort} cars short of ${train.size}`,
      ],
    ]),
    '',
    renderTable(
      [
        { header: 'car', key: 'car' },
        { header: 'by weight', key: 'weight', align: 'right' },
        { header: 'by cube', key: 'volume', align: 'right' },
        { header: 'takes', key: 'takes', align: 'right' },
        { header: 'binds on', key: 'binding' },
        { header: 'cars', key: 'cars', align: 'right' },
      ],
      comparison
    ),
    '',
    describePlan(plan),
  ].join('\n');

  return { plan, train, comparison, text };
}

export function register(program) {
  program
    .command('cars')
    .description('plan a rail shipment against the weight limit and the cube')
    .requiredOption('-b, --bushels <bushels>', 'how many bushels to ship')
    .option('--commodity <id>', 'the grain', 'corn')
    .option('--car <type>', `the car type: ${CAR_IDS.join(', ')}`, 'hopper4750')
    .option('--tare <pounds>', 'the tare weight of the actual cars')
    .option('--gross <pounds>', 'the gross rail load the track will take')
    .option('--train <cars>', 'the string length the rate needs', String(SHUTTLE_CARS))
    .action((options) => {
      const result = runCars(options);
      console.log(result.text);
      if (!result.train.qualifies) process.exitCode = 1;
    });
}
