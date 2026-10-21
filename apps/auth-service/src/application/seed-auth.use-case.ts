import type { Logger, UserRole } from '@toka/shared';
import { USER_ROLES } from '@toka/shared';
import { AuthCredential } from '../domain/auth-credential.js';
import { internalError, isApplicationError } from './application-error.js';
import type { Clock, CredentialRepository, IdGenerator, PasswordHasher, RoleRepository } from './ports.js';

export const SEED_ADMIN_EMAIL = 'admin@toka.com';
export const SEED_ADMIN_PASSWORD = 'Admin123!';
export const SEED_ADMIN_ROLES: readonly UserRole[] = ['ADMIN'];

export class SeedAuthUseCase {
  constructor(
    private readonly credentials: CredentialRepository,
    private readonly roles: RoleRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly logger: Logger,
  ) {}

  async execute(traceId: string): Promise<void> {
    try {
      for (const role of USER_ROLES) {
        await this.roles.insertIfMissing(role);
      }
      const existing = await this.credentials.findByEmail(SEED_ADMIN_EMAIL);
      if (existing) {
        this.logger.info(traceId, 'auth seed completed', { email: SEED_ADMIN_EMAIL, created: false });
        return;
      }
      const passwordHash = await this.hasher.hash(SEED_ADMIN_PASSWORD);
      const credential = AuthCredential.create({
        id: this.ids.nextUserId(),
        email: SEED_ADMIN_EMAIL,
        passwordHash,
        roles: SEED_ADMIN_ROLES,
        now: this.clock.now(),
      });
      await this.credentials.save(credential);
      this.logger.info(traceId, 'auth seed completed', { email: SEED_ADMIN_EMAIL, created: true });
    } catch (error) {
      if (isApplicationError(error)) {
        throw error;
      }
      throw internalError(this.logger, traceId, error);
    }
  }
}
