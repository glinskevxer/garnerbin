import { ConfigError } from '../core/errors.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue } from '../core/text.js';
import { createSample } from '../grading/sample.js';
import { applyShipment, createShippingOrder, openOrder, orderStatus } from '../loadout/orders.js';
import { buildManifest, manifestCsv, renderManifest, worstCar } from '../loadout/manifest.js';
import { describePlan, planCars, trainCheck } from '../loadout/rail.js';
import { readJsonFile, writeOut } from './desk.js';

/**
 * Shipping out.
 *
 * The order says what the buyer will take. The cars say what is actually
 * loaded. This checks the second against the first before the train moves, and
 * when it does not meet the spec it names the car pulling the composite down,
 * because leaving one car behind is usually cheaper than reworking a train.
 */

export function runShip(options) {
  const document = readJsonFile(options.file, 'shipping file');
  if (!Array.isArray(document.orders)) {
    throw new ConfigError('NO_ORDERS', `${options.file} carries no orders array`, {
      path: options.file,
    });
  }
  const orders = new Map(
    document.orders.map((entry) => [entry.number, createShippingOrder(entry)])
  );
  const shipments = (document.shipments ?? []).filter(
    (shipment) => !options.order || shipment.order === options.order
  );
  if (shipments.length === 0) {
    throw new ConfigError('NOTHING_TO_SHIP', 'no shipment on that file matches', {
      order: options.order ?? null,
    });
  }

  const results = shipments.map((shipment) => {
    const order = orders.get(shipment.order);
    if (!order) {
      throw new ConfigError('NO_SUCH_ORDER', `${shipment.order} is not on the file`, {
        order: shipment.order,
        orders: [...orders.keys()],
      });
    }
    const cars = shipment.cars.map((car) => ({ ...car, sample: createSample(car.sample) }));
    const manifest = buildManifest({
      order,
      cars,
      day: shipment.day,
      house: options.house ?? 'Rush Creek Grain',
      number: shipment.number,
    });
    let position = openOrder(order);
    for (const car of cars) {
      position = applyShipment(position, {
        ticket: car.ticket ?? car.car,
        bushels: car.bushels,
        day: shipment.day,
        car: car.car,
      });
    }
    const plan = planCars(manifest.bushels, shipment.car ?? 'hopper4750', order.commodity);
    return { manifest, status: orderStatus(position), plan, train: trainCheck(cars.length) };
  });

  const parts = [heading('Loading out')];
  for (const result of results) {
    parts.push('', renderManifest(result.manifest));
    parts.push(
      '',
      keyValue([
        ['Ordered', formatBushels(result.status.ordered)],
        ['On this train', formatBushels(result.status.shipped)],
        ['Left on the order', formatBushels(result.status.remaining)],
        ['Cars needed for the lot', describePlan(result.plan)],
        [
          'Rate',
          result.train.qualifies
            ? `makes the ${result.train.size} car rate`
            : `${result.train.carsShort} cars short of ${result.train.size}`,
        ],
      ])
    );
    if (!result.manifest.releasable) {
      const worst = worstCar(result.manifest, 'damagedTotal');
      if (worst) {
        parts.push(
          `Leaving ${worst.car} behind would take ${worst.value} percent damage out of the composite.`
        );
      }
    }
  }

  if (options.out) writeOut(options.out, manifestCsv(results[0].manifest), 'manifest');
  return { results, text: parts.join('\n') };
}

export function register(program) {
  program
    .command('ship')
    .description('check a loaded train against the order before it moves')
    .requiredOption('-f, --file <path>', 'the shipping file with the orders and the cars')
    .option('--order <number>', 'only this order')
    .option('--house <name>', 'the house name for the manifest')
    .option('-o, --out <path>', 'write the manifest to a csv')
    .action((options) => {
      const result = runShip(options);
      console.log(result.text);
      if (result.results.some((entry) => !entry.manifest.releasable)) process.exitCode = 1;
    });
}
