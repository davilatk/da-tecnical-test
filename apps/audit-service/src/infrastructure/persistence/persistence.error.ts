export class PersistenceError extends Error {
  constructor() {
    super('audit log persistence failed');
    this.name = 'PersistenceError';
  }
}
