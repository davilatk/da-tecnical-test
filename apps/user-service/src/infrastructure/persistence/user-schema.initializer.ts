import { USER_SCHEMA_STATEMENTS } from './user-schema.js';

export interface SqlQuery {
  query(sql: string): Promise<unknown>;
}

export class UserSchemaInitializer {
  constructor(private readonly database: SqlQuery) {}

  async apply(): Promise<void> {
    for (const statement of USER_SCHEMA_STATEMENTS) {
      await this.database.query(statement);
    }
  }
}
