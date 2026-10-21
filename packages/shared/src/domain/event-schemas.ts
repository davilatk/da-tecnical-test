export const DOMAIN_EVENT_ENVELOPE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
  properties: {
    eventId: { type: 'string', minLength: 1 },
    eventType: {
      type: 'string',
      enum: ['auth.user.logged_in', 'auth.role.assigned', 'user.created', 'user.updated', 'user.deleted'],
    },
    occurredAt: { type: 'string', format: 'date-time' },
    actorId: { type: 'string', minLength: 1 },
    targetId: { type: 'string', minLength: 1 },
    serviceSource: { type: 'string', enum: ['auth-service', 'user-service'] },
    payload: { type: 'object' },
  },
} as const;

export const AUTH_USER_LOGGED_IN_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  allOf: [
    { $ref: '#/$defs/envelope' },
    {
      properties: {
        eventType: { const: 'auth.user.logged_in' },
        serviceSource: { const: 'auth-service' },
        payload: {
          type: 'object',
          additionalProperties: false,
          required: ['email'],
          properties: { email: { type: 'string', format: 'email' } },
        },
      },
    },
  ],
  $defs: {
    envelope: {
      type: 'object',
      additionalProperties: false,
      required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
      properties: {
        eventId: { type: 'string', minLength: 1 },
        eventType: { type: 'string' },
        occurredAt: { type: 'string', format: 'date-time' },
        actorId: { type: 'string', minLength: 1 },
        targetId: { type: 'string', minLength: 1 },
        serviceSource: { type: 'string' },
        payload: { type: 'object' },
      },
    },
  },
} as const;

export const AUTH_ROLE_ASSIGNED_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
  properties: {
    eventId: { type: 'string', minLength: 1 },
    eventType: { const: 'auth.role.assigned' },
    occurredAt: { type: 'string', format: 'date-time' },
    actorId: { type: 'string', minLength: 1 },
    targetId: { type: 'string', minLength: 1 },
    serviceSource: { const: 'auth-service' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['role'],
      properties: { role: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] } },
    },
  },
} as const;

export const USER_CREATED_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
  properties: {
    eventId: { type: 'string', minLength: 1 },
    eventType: { const: 'user.created' },
    occurredAt: { type: 'string', format: 'date-time' },
    actorId: { type: 'string', minLength: 1 },
    targetId: { type: 'string', minLength: 1 },
    serviceSource: { const: 'user-service' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['email', 'fullName', 'department', 'status', 'roles'],
      properties: {
        email: { type: 'string', format: 'email' },
        fullName: { type: 'string', minLength: 1 },
        department: { type: 'string', minLength: 1 },
        status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
        roles: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', enum: ['ADMIN', 'USER', 'AUDITOR'] },
        },
      },
    },
  },
} as const;

export const USER_UPDATED_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
  properties: {
    eventId: { type: 'string', minLength: 1 },
    eventType: { const: 'user.updated' },
    occurredAt: { type: 'string', format: 'date-time' },
    actorId: { type: 'string', minLength: 1 },
    targetId: { type: 'string', minLength: 1 },
    serviceSource: { const: 'user-service' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['changedFields'],
      properties: {
        changedFields: {
          type: 'array',
          minItems: 1,
          uniqueItems: true,
          items: { type: 'string', enum: ['fullName', 'department', 'status'] },
        },
      },
    },
  },
} as const;

export const USER_DELETED_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  additionalProperties: false,
  required: ['eventId', 'eventType', 'occurredAt', 'actorId', 'targetId', 'serviceSource', 'payload'],
  properties: {
    eventId: { type: 'string', minLength: 1 },
    eventType: { const: 'user.deleted' },
    occurredAt: { type: 'string', format: 'date-time' },
    actorId: { type: 'string', minLength: 1 },
    targetId: { type: 'string', minLength: 1 },
    serviceSource: { const: 'user-service' },
    payload: {
      type: 'object',
      additionalProperties: false,
      required: ['email'],
      properties: { email: { type: 'string', format: 'email' } },
    },
  },
} as const;

export const DOMAIN_EVENT_SCHEMAS = {
  'auth.user.logged_in': AUTH_USER_LOGGED_IN_SCHEMA,
  'auth.role.assigned': AUTH_ROLE_ASSIGNED_SCHEMA,
  'user.created': USER_CREATED_SCHEMA,
  'user.updated': USER_UPDATED_SCHEMA,
  'user.deleted': USER_DELETED_SCHEMA,
} as const;
