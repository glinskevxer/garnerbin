import { ConfigError } from '../core/errors.js';
import { formatBushels } from '../core/money.js';
import { heading, keyValue, renderTable } from '../core/text.js';
import { bushelColumn, numberColumn, textColumn } from '../report/columns.js';
import { capacityOf, fillPercent } from '../inventory/bins.js';
import { aerationAdvice, allowableStorageDays } from '../inventory/aeration.js';
import { binCondition, createReadingSet, findHotSpots } from '../inventory/temperature.js';
import { binOf, readHouse, readJsonFile } from './desk.js';

/**
 * The walk around sheet.
 *
 * One line a bin: what is in it, how full it is, what the cables say, whether
 * the fan should be running and how long the grain in it will keep. The last
 * two are the ones that stop a bin going out of condition, and they are the two
 * nobody works out standing on a ladder in the dark.
 */

export function runBins(options) {
  const house = readHouse(options.house);
  const holdings = readJsonFile(options.file, 'holdings file');
  if (!Array.isArray(holdings.holdings)) {
    throw new ConfigError('NO_HOLDINGS', `${options.file} carries no holdings array`, {
      path: options.file,
    });
  }
  const cables = options.cables ? readJsonFile(options.cables, 'cable file') : null;
  const weather = cables?.weather ?? null;

  const rows = holdings.holdings.map((entry) => {
    const bin = binOf(house, entry.bin);
    const held = entry.bushels ?? 0;
    const condition = cables?.bins?.[entry.bin] ?? null;
    const readings = (cables?.readings ?? []).filter((reading) => reading.bin === entry.bin);
    const set = readings.length > 0 ? createReadingSet(readings) : null;

    let advice = null;
    if (condition && weather && entry.commodity) {
      advice = aerationAdvice({
        commodity: entry.commodity,
        grainMoisture: condition.grainMoisture,
        grainTempF: condition.grainTempF,
        airTempF: weather.airTempF,
        relativeHumidity: weather.relativeHumidity,
      });
    }

    return {
      bin: bin.id,
      holding: entry.commodity,
      capacity: capacityOf(bin),
      held,
      fill: fillPercent(bin, held),
      grainTempF: condition?.grainTempF ?? null,
      moisture: condition?.grainMoisture ?? null,
      condition: set === null ? '' : binCondition(set),
      hotSpots: set === null ? 0 : findHotSpots(set).length,
      fan: advice === null ? '' : advice.run ? 'run' : 'hold',
      why: advice?.reason ?? '',
      keepsDays:
        condition && entry.commodity
          ? allowableStorageDays(entry.commodity, condition.grainMoisture, condition.grainTempF)
          : null,
    };
  });

  const parts = [
    heading(`${house.name} bins on ${options.day ?? cables?.day ?? holdings.day ?? 'today'}`),
    '',
    renderTable(
      [
        textColumn('bin', 'bin'),
        textColumn('holding', 'holding', { blank: 'empty' }),
        bushelColumn('capacity', 'capacity'),
        bushelColumn('in it', 'held'),
        numberColumn('full pct', 'fill', { places: 1 }),
        numberColumn('degrees', 'grainTempF'),
        numberColumn('moisture', 'moisture', { places: 1 }),
        textColumn('cables', 'condition'),
        textColumn('fan', 'fan'),
        numberColumn('keeps days', 'keepsDays'),
      ],
      rows
    ),
  ];

  const running = rows.filter((row) => row.fan === 'run');
  const watching = rows.filter((row) => row.condition === 'watch' || row.condition === 'going off');
  if (running.length > 0) {
    parts.push('', 'Run the fans on:', ...running.map((row) => `  ${row.bin}, ${row.why}`));
  }
  if (watching.length > 0) {
    parts.push(
      '',
      'Look at:',
      ...watching.map(
        (row) => `  ${row.bin}, cables say ${row.condition}, ${row.hotSpots} spots over`
      )
    );
  }
  parts.push(
    '',
    keyValue([
      ['Bins', String(rows.length)],
      ['In the house', formatBushels(rows.reduce((sum, row) => sum + row.held, 0))],
      ['Fans to run', String(running.length)],
    ])
  );

  return { rows, running, watching, text: parts.join('\n') };
}

export function register(program) {
  program
    .command('bins')
    .description('walk the bins, read the cables and say which fans to run')
    .requiredOption('-c, --house <path>', 'the house configuration file')
    .requiredOption('-f, --file <path>', 'the holdings file')
    .option('--cables <path>', 'a cable reading file with the weather on it')
    .option('-d, --day <day>', 'the day to label the sheet')
    .action((options) => {
      const result = runBins(options);
      console.log(result.text);
      if (result.watching.length > 0) process.exitCode = 1;
    });
}
