import { AUTH_SCHEMA_STATEMENTS } from './auth-schema.js';

export interface SqlQuery {
  query(sql: string): Promise<unknown>;
}

export class AuthSchemaInitializer {
  constructor(private readonly database: SqlQuery) {}

  async apply(): Promise<void> {
    for (const statement of AUTH_SCHEMA_STATEMENTS) {
      await this.database.query(statement);
    }
  }
}
