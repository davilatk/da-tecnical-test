import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
} from '@heroui/react';
import { useEffect, useState } from 'react';
import { useAuditStore } from '../../application/stores/audit.store';
import { EVENT_TYPES } from '../../domain/constants';
import type { AuditQuery, AuditStats, EventType } from '../../domain/contracts';
import { formatDateTime } from '../../domain/formatters';
import { validateAuditLimit } from '../../domain/validators';
import { selectionValue } from '../selection';

type EventFilter = EventType | 'ALL';

export function AuditPage() {
  const items = useAuditStore((state) => state.items);
  const stats = useAuditStore((state) => state.stats);
  const status = useAuditStore((state) => state.status);
  const error = useAuditStore((state) => state.error);
  const storedQuery = useAuditStore((state) => state.query);
  const fetchAudits = useAuditStore((state) => state.fetchAudits);
  const fetchStats = useAuditStore((state) => state.fetchStats);
  const resetQuery = useAuditStore((state) => state.resetQuery);
  const [eventType, setEventType] = useState<EventFilter>(storedQuery.eventType ?? 'ALL');
  const [actorId, setActorId] = useState(storedQuery.actorId ?? '');
  const [limit, setLimit] = useState(String(storedQuery.limit ?? 50));
  const [limitError, setLimitError] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetchStats();
    void fetchAudits();
  }, [fetchAudits, fetchStats]);

  async function applyFilters(): Promise<void> {
    const parsedLimit = Number(limit);
    if (!validateAuditLimit(parsedLimit)) {
      setLimitError('El límite debe estar entre 1 y 100');
      return;
    }
    setLimitError(null);
    const query: AuditQuery = { limit: parsedLimit };
    if (eventType !== 'ALL') {
      query.eventType = eventType;
    }
    const trimmedActor = actorId.trim();
    if (trimmedActor !== '') {
      query.actorId = trimmedActor;
    }
    await fetchAudits(query);
  }

  async function clearFilters(): Promise<void> {
    resetQuery();
    setEventType('ALL');
    setActorId('');
    setLimit('50');
    setLimitError(null);
    await fetchAudits();
  }

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-toka-steel">Cumplimiento</p>
        <h1 className="text-2xl font-semibold text-toka-navy">Historial y estadísticas de auditoría</h1>
      </header>
      {stats === null && status !== 'error' ? <Spinner label="Cargando estadísticas" /> : null}
      {stats !== null ? <StatsGrid stats={stats} /> : null}
      {error !== null ? <p role="alert">{error.message}</p> : null}
      <div className="grid gap-3 md:grid-cols-4">
        <Select
          aria-label="Tipo de evento"
          label="Tipo de evento"
          selectedKeys={[eventType]}
          onSelectionChange={(keys) => {
            const value = selectionValue(keys);
            if (value === 'ALL' || EVENT_TYPES.some((item) => item === value)) {
              setEventType(value === '' ? 'ALL' : (value as EventFilter));
            }
          }}
        >
          {[{ key: 'ALL', label: 'Todos' }, ...EVENT_TYPES.map((item) => ({ key: item, label: item }))].map(
            (option) => (
              <SelectItem key={option.key}>{option.label}</SelectItem>
            ),
          )}
        </Select>
        <Input label="Actor" value={actorId} onValueChange={setActorId} />
        <Input
          type="number"
          label="Límite"
          value={limit}
          onValueChange={setLimit}
          isInvalid={limitError !== null}
          {...(limitError !== null ? { errorMessage: limitError } : {})}
        />
        <div className="flex items-end gap-2">
          <Button color="primary" onPress={() => void applyFilters()}>
            Aplicar
          </Button>
          <Button variant="flat" onPress={() => void clearFilters()}>
            Limpiar
          </Button>
        </div>
      </div>
      <Table aria-label="Eventos de auditoría">
        <TableHeader>
          <TableColumn>Fecha</TableColumn>
          <TableColumn>Evento</TableColumn>
          <TableColumn>Actor</TableColumn>
          <TableColumn>Objetivo</TableColumn>
          <TableColumn>Origen</TableColumn>
          <TableColumn>Payload</TableColumn>
        </TableHeader>
        <TableBody emptyContent="No hay eventos de auditoría">
          {items.map((item) => (
            <TableRow key={item.eventId}>
              <TableCell>{formatDateTime(item.occurredAt)}</TableCell>
              <TableCell>
                <Chip variant="flat">{item.eventType}</Chip>
              </TableCell>
              <TableCell>{item.actorId}</TableCell>
              <TableCell>{item.targetId}</TableCell>
              <TableCell>{item.serviceSource}</TableCell>
              <TableCell>
                <Button size="sm" variant="flat" onPress={() => setPayload(item.payload)}>
                  Ver payload
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Modal isOpen={payload !== null} onOpenChange={(open) => { if (!open) setPayload(null); }}>
        <ModalContent>
          <ModalHeader>Payload</ModalHeader>
          <ModalBody>
            <pre className="overflow-auto text-sm">{JSON.stringify(payload, null, 2)}</pre>
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={() => setPayload(null)}>
              Cerrar
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}

function StatsGrid({ stats }: { stats: AuditStats }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <article className="rounded-2xl border border-toka-navy/10 bg-white p-4 shadow-sm" aria-label="total">
        <h2 className="text-sm text-toka-slate">total</h2>
        <p className="text-2xl font-semibold text-toka-navy">{stats.total}</p>
      </article>
      {EVENT_TYPES.map((eventType) => (
        <article
          key={eventType}
          className="rounded-2xl border border-toka-navy/10 bg-white p-4 shadow-sm"
          aria-label={eventType}
        >
          <h2 className="text-sm text-toka-slate">{eventType}</h2>
          <p className="text-2xl font-semibold text-toka-navy">{stats.byEventType[eventType]}</p>
        </article>
      ))}
    </div>
  );
}
