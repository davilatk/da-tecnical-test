import { ValidateBy, type ValidationOptions } from 'class-validator';
import {
  EMAIL_RULE_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  ROLE_RULE_MESSAGE,
  parseEmail,
  parsePassword,
  parseRole,
} from '../../domain/input-rules.js';

function contractValidator(name: string, validate: (value: unknown) => boolean, message: string, options?: ValidationOptions) {
  return ValidateBy(
    {
      name,
      validator: {
        validate: (value: unknown) => validate(value),
        defaultMessage: () => message,
      },
    },
    options,
  );
}

export function IsContractEmail(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractEmail', (value) => parseEmail(value).ok, EMAIL_RULE_MESSAGE, options);
}

export function IsContractPassword(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractPassword', (value) => parsePassword(value).ok, PASSWORD_RULE_MESSAGE, options);
}

export function IsContractRole(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractRole', (value) => parseRole(value).ok, ROLE_RULE_MESSAGE, options);
}
