import { ConfigError } from '../core/errors.js';
import { isArray, isPlainObject, isString } from '../core/assert.js';
import { assertDay } from '../core/dates.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { compositeSample } from '../grading/sample.js';
import { gradeSample } from '../grading/special.js';
import { toCsv } from '../io/csv.js';
import { checkAgainstSpec } from './orders.js';

/**
 * The outbound manifest.
 *
 * A rail shipment is a string of cars and the buyer grades what arrives, not
 * what each car left as. So the manifest composites the cars into one sample,
 * grades that, and checks it against the order before the train moves rather
 * than after it arrives, which is when it becomes somebody else's discount.
 */

export function buildManifest(input) {
  isPlainObject(input, 'manifest');
  const order = isPlainObject(input.order, 'order');
  const cars = isArray(input.cars, 'cars', { minLength: 1 }).map((car) => {
    isPlainObject(car, 'car');
    return {
      car: isString(car.car, 'car'),
      ticket: car.ticket === undefined ? null : isString(car.ticket, 'ticket'),
      bushels: car.bushels,
      sample: car.sample,
      seal: car.seal ?? null,
    };
  });

  const wrongGrain = cars.filter((car) => car.sample.commodity !== order.commodity);
  if (wrongGrain.length > 0) {
    throw new ConfigError(
      'WRONG_COMMODITY_ON_CAR',
      `${wrongGrain[0].car} is not ${order.commodity}`,
      {
        car: wrongGrain[0].car,
        commodity: order.commodity,
      }
    );
  }

  const weighted = cars.map((car) =>
    Object.freeze({ ...car.sample, grams: car.bushels, id: car.car })
  );
  const composite = compositeSample(weighted, { id: `${input.number ?? order.number}-composite` });
  const graded = gradeSample(order.commodity, composite);
  const check = checkAgainstSpec(order, composite);

  return {
    number: input.number ?? `MAN-${order.number}`,
    day: assertDay(input.day, 'day'),
    house: input.house ?? 'unnamed house',
    order,
    cars,
    bushels: cars.reduce((sum, car) => sum + car.bushels, 0),
    composite,
    grade: graded,
    check,
    releasable: check.ok,
  };
}

export function renderManifest(manifest) {
  const parts = [
    heading(`${manifest.house} manifest ${manifest.number}`),
    keyValue([
      ['Order', manifest.order.number],
      ['Buyer', manifest.order.buyer],
      ['Destination', manifest.order.destination ?? 'not stated'],
      ['Shipped', manifest.day],
      ['Cars', String(manifest.cars.length)],
      ['Bushels', formatBushels(manifest.bushels)],
      ['Composite grade', manifest.grade.label],
    ]),
    '',
    renderTable(
      [
        { header: 'car', key: 'car' },
        { header: 'ticket', value: (car) => car.ticket ?? '' },
        { header: 'seal', value: (car) => car.seal ?? '' },
        { header: 'bushels', value: (car) => formatBushels(car.bushels), align: 'right' },
      ],
      manifest.cars
    ),
  ];
  if (manifest.releasable) {
    parts.push('', 'Meets the order. Release it.');
  } else {
    parts.push('', 'Hold this train:', ...manifest.check.failures.map((why) => `  ${why}`));
  }
  return parts.join('\n');
}

export function manifestCsv(manifest) {
  return toCsv(manifest.cars, [
    { header: 'manifest', value: () => manifest.number },
    { header: 'day', value: () => manifest.day },
    { header: 'order', value: () => manifest.order.number },
    { header: 'car', key: 'car' },
    { header: 'ticket', value: (car) => car.ticket ?? '' },
    { header: 'seal', value: (car) => car.seal ?? '' },
    { header: 'bushels', value: (car) => formatBushels(car.bushels) },
  ]);
}

/** The car pulling the composite down, which is the one to leave behind. */
export function worstCar(manifest, factorId) {
  const scored = manifest.cars
    .filter((car) => typeof car.sample[factorId] === 'number')
    .map((car) => ({ car: car.car, value: car.sample[factorId], bushels: car.bushels }));
  if (scored.length === 0) return null;
  return scored.reduce((worst, entry) => (entry.value > worst.value ? entry : worst));
}
