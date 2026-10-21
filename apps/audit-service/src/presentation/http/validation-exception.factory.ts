import type { ApiFieldError } from '@toka/shared';
import type { ValidationError } from 'class-validator';
import { ApplicationError, validationError } from '../../application/application-error.js';

export function validationExceptionFactory(errors: ValidationError[]): ApplicationError {
  return validationError(flattenValidationErrors(errors));
}

export function flattenValidationErrors(errors: readonly ValidationError[], parent?: string): ApiFieldError[] {
  const details: ApiFieldError[] = [];
  for (const error of errors) {
    const field = parent === undefined ? error.property : `${parent}.${error.property}`;
    const constraints = error.constraints ?? {};
    if ('whitelistValidation' in constraints) {
      details.push({ field, message: 'is not allowed' });
    }
    for (const [key, message] of Object.entries(constraints)) {
      if (key === 'whitelistValidation' || message.trim().length === 0) {
        continue;
      }
      details.push({ field, message });
    }
    if (error.children !== undefined && error.children.length > 0) {
      details.push(...flattenValidationErrors(error.children, field));
    }
  }
  return details;
}
