import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { createTraceId } from '@toka/shared';
import type { AuthenticatedActor } from '../application/authenticated-actor.js';
import { GetAuditLogsUseCase } from '../application/get-audit-logs.use-case.js';
import { GetAuditStatsUseCase } from '../application/get-audit-stats.use-case.js';
import type { AuditLogPage } from '../domain/audit-log.js';
import type { AuditQueryInput, AuditStats } from '../domain/audit-query.js';
import { ListAuditsQueryDto } from './dto/list-audits-query.dto.js';
import { NestJwtAuthGuard } from './http/nest-jwt-auth.guard.js';
import { RequireRoles } from './http/require-roles.js';

export interface AuditRequest {
  traceId?: string;
  actor?: AuthenticatedActor;
}

@Controller('audits')
@UseGuards(NestJwtAuthGuard)
@RequireRoles('ADMIN', 'AUDITOR')
export class AuditsController {
  constructor(
    private readonly getLogs: GetAuditLogsUseCase,
    private readonly getStats: GetAuditStatsUseCase,
  ) {}

  @Get('stats')
  stats(@Req() request: AuditRequest): Promise<AuditStats> {
    return this.getStats.execute(request.actor ?? null, traceIdOf(request));
  }

  @Get()
  list(@Query() query: ListAuditsQueryDto, @Req() request: AuditRequest): Promise<AuditLogPage> {
    return this.getLogs.execute(toQuery(query), request.actor ?? null, traceIdOf(request));
  }
}

function toQuery(query: ListAuditsQueryDto): AuditQueryInput {
  return {
    ...(query.eventType !== undefined ? { eventType: query.eventType } : {}),
    ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
    ...(query.limit !== undefined ? { limit: query.limit } : {}),
  };
}

function traceIdOf(request: AuditRequest): string {
  if (request.traceId !== undefined && request.traceId.trim().length > 0) {
    return request.traceId.trim();
  }
  return createTraceId();
}
