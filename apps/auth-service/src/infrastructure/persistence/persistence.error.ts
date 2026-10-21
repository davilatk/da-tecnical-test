export class PersistenceError extends Error {
  constructor() {
    super('persistence failed');
    this.name = 'PersistenceError';
  }
}
