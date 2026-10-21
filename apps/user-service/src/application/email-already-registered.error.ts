export class EmailAlreadyRegisteredError extends Error {
  constructor() {
    super('email is already registered');
    this.name = 'EmailAlreadyRegisteredError';
  }
}
