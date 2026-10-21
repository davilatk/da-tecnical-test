import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { EVENT_TYPES } from '@toka/shared';
import { Schema as MongooseSchema } from 'mongoose';

export const AUDIT_LOG_COLLECTION = 'audit_logs';

@Schema({ collection: AUDIT_LOG_COLLECTION, versionKey: false, timestamps: false })
export class AuditLogDocument {
  @Prop({ type: String, required: true })
  eventId!: string;

  @Prop({ type: String, required: true, enum: [...EVENT_TYPES] })
  eventType!: string;

  @Prop({ type: Date, required: true })
  occurredAt!: Date;

  @Prop({ type: String, required: true })
  actorId!: string;

  @Prop({ type: String, required: true })
  targetId!: string;

  @Prop({ type: String, required: true, enum: ['auth-service', 'user-service'] })
  serviceSource!: string;

  @Prop({ type: MongooseSchema.Types.Mixed, required: true })
  payload!: Record<string, unknown>;

  @Prop({ type: Date, required: true })
  createdAt!: Date;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLogDocument);

AuditLogSchema.index({ eventId: 1 }, { unique: true });
AuditLogSchema.index({ occurredAt: -1, eventId: -1 });
AuditLogSchema.index({ eventType: 1, occurredAt: -1 });
AuditLogSchema.index({ actorId: 1, occurredAt: -1 });
