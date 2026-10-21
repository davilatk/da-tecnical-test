import { compileSchema } from './schema-engine.js';

const validateEmail = compileSchema({
  type: 'string',
  format: 'email',
});

export function isEmail(value: unknown): value is string {
  return validateEmail(value) === true;
}

function isObjectPrototype(prototype: object): boolean {
  if (Object.getPrototypeOf(prototype) !== null) {
    return false;
  }
  const constructor: unknown = Reflect.get(prototype, 'constructor');
  return typeof constructor === 'function' && constructor.name === 'Object';
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype === null) {
    return true;
  }
  return typeof prototype === 'object' && (prototype === Object.prototype || isObjectPrototype(prototype));
}
