export class GameError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function fail(code, message) {
  throw new GameError(code, message);
}
