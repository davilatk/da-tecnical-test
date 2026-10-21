import { ValidateBy, type ValidationOptions } from 'class-validator';
import {
  DEPARTMENT_RULE_MESSAGE,
  EMAIL_RULE_MESSAGE,
  FULL_NAME_RULE_MESSAGE,
  PASSWORD_RULE_MESSAGE,
  STATUS_RULE_MESSAGE,
  parseDepartment,
  parseEmail,
  parseFullName,
  parsePassword,
  parseStatus,
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

export function IsContractFullName(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractFullName', (value) => parseFullName(value).ok, FULL_NAME_RULE_MESSAGE, options);
}

export function IsContractDepartment(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractDepartment', (value) => parseDepartment(value).ok, DEPARTMENT_RULE_MESSAGE, options);
}

export function IsContractStatus(options?: ValidationOptions): PropertyDecorator {
  return contractValidator('isContractStatus', (value) => parseStatus(value).ok, STATUS_RULE_MESSAGE, options);
}
