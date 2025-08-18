#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { run } from '../src/cli/program.js';

const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

process.exitCode = await run(process.argv, manifest.version);
