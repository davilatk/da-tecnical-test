import { bindAiAgentApi } from '../../application/stores/ai-agent.store';
import { bindAuditApi } from '../../application/stores/audit.store';
import { bindAuthApi } from '../../application/stores/auth.store';
import { bindUserApi } from '../../application/stores/user.store';
import { aiAgentApi, auditApi, authApi, userApi } from './api';

export function bindApiPorts(): void {
  bindAuthApi(authApi);
  bindUserApi(userApi);
  bindAuditApi(auditApi);
  bindAiAgentApi(aiAgentApi);
}
