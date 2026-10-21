import { Card, CardBody } from '@heroui/react';

export function AccessDenied() {
  return (
    <Card className="border border-toka-navy/10 shadow-sm">
      <CardBody className="gap-2 border-l-4 border-toka-navy">
        <h1 className="text-xl font-semibold text-toka-navy">Acceso denegado</h1>
        <p>No tienes un rol autorizado para ver esta sección.</p>
      </CardBody>
    </Card>
  );
}
