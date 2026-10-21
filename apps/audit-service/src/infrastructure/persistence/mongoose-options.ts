import { AUDIT_DB_NAME, type AuditConfig } from '../config/audit-config.js';

export interface AuditMongoConnection {
  uri: string;
  dbName: typeof AUDIT_DB_NAME;
  autoIndex: true;
}

export function mongooseRootOptions(config: AuditConfig): AuditMongoConnection {
  return {
    uri: config.mongoUri,
    dbName: AUDIT_DB_NAME,
    autoIndex: true,
  };
}
