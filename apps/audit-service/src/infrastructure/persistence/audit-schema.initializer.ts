export interface IndexSynchronizer {
  syncIndexes(): Promise<unknown>;
}

export class AuditSchemaInitializer {
  constructor(private readonly logs: IndexSynchronizer) {}

  async apply(): Promise<void> {
    await this.logs.syncIndexes();
  }
}
