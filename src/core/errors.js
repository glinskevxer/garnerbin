/**
 * Every failure the elevator software raises carries a stable code, because the
 * scale house prints the code on the ticket and the office looks it up. Message
 * text gets reworded every other season; the codes do not move.
 */

const CODE_PATTERN = /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$/;

export class GarnerbinError extends Error {
  constructor(code, message, details = {}) {
    if (!CODE_PATTERN.test(code)) {
      throw new Error(`error code ${JSON.stringify(code)} is not screaming snake case`);
    }
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.details = Object.freeze({ ...details });
    Error.captureStackTrace?.(this, new.target);
  }

  /** What the scale house prints. Short, and it leads with the code. */
  toLine() {
    return `${this.code}: ${this.message}`;
  }

  toJSON() {
    return { name: this.name, code: this.code, message: this.message, details: this.details };
  }
}

/** A configuration file said something the loader cannot act on. */
export class ConfigError extends GarnerbinError {}

/** A scale ticket, probe sample or grade sheet does not hold together. */
export class TicketError extends GarnerbinError {}

/** The grade tables were asked for something they do not cover. */
export class GradeError extends GarnerbinError {}

/** A contract, an application against one, or a roll was refused. */
export class ContractError extends GarnerbinError {}

/** Bins, transfers and inventory disagreed with each other. */
export class InventoryError extends GarnerbinError {}

/** Money, bushels or a price came out of range or lost precision. */
export class ArithmeticError extends GarnerbinError {}

/** A file we read or wrote is not shaped the way the importer expects. */
export class FormatError extends GarnerbinError {}

const CLASSES = {
  ConfigError,
  TicketError,
  GradeError,
  ContractError,
  InventoryError,
  ArithmeticError,
  FormatError,
};

/**
 * Rebuild an error from the JSON form. Used when a worker process hands a
 * failure back to the command that spawned it.
 */
export function reviveError(payload) {
  if (payload === null || typeof payload !== 'object') {
    throw new TypeError('reviveError needs the object produced by toJSON');
  }
  const Cls = CLASSES[payload.name] ?? GarnerbinError;
  return new Cls(payload.code, payload.message, payload.details ?? {});
}

export function isGarnerbinError(value) {
  return value instanceof GarnerbinError;
}

/** True when the caller can retry the same input and expect a different answer. */
export function isTransient(error) {
  if (!isGarnerbinError(error)) return false;
  return error.details.transient === true;
}
