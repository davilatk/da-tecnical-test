export type UnconfirmedAuditReason = 'invalid' | 'persistence';

export class UnconfirmedAuditEventError extends Error {
  constructor(readonly reason: UnconfirmedAuditReason) {
    super(reason === 'invalid' ? 'audit event is invalid' : 'audit event was not persisted');
    this.name = 'UnconfirmedAuditEventError';
  }
}
