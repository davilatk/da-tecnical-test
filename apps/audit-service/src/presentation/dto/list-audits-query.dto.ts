import { EVENT_TYPES, type EventType } from '@toka/shared';
import { Transform, Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min, MinLength } from 'class-validator';
import { ACTOR_ID_RULE, EVENT_TYPE_RULE, LIMIT_RULE, MAX_AUDIT_LIMIT } from '../../domain/audit-query.js';

export class ListAuditsQueryDto {
  @IsOptional()
  @IsIn(EVENT_TYPES, { message: EVENT_TYPE_RULE })
  eventType?: EventType;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString({ message: ACTOR_ID_RULE })
  @MinLength(1, { message: ACTOR_ID_RULE })
  actorId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: LIMIT_RULE })
  @Min(1, { message: LIMIT_RULE })
  @Max(MAX_AUDIT_LIMIT, { message: LIMIT_RULE })
  limit?: number;
}
