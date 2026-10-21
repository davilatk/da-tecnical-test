import { Inject, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard.js';

// Nest instancia por su cuenta las clases de @UseGuards e ignora el provider con factory de JwtAuthGuard;
// este adaptador recibe por DI la instancia configurada en el módulo.
@Injectable()
export class NestJwtAuthGuard implements CanActivate {
  constructor(@Inject(JwtAuthGuard) private readonly guard: JwtAuthGuard) {}

  canActivate(context: ExecutionContext): Promise<boolean> {
    return this.guard.canActivate(context);
  }
}
