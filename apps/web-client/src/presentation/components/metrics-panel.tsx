import { Card, CardBody, Chip, Progress } from '@heroui/react';
import type { AskMetrics } from '../../domain/contracts';
import { formatCostUsd, formatScore, parseQualityCheck } from '../../domain/formatters';

interface MetricsPanelProps {
  metrics: AskMetrics | null;
}

export function MetricsPanel({ metrics }: MetricsPanelProps) {
  if (metrics === null) {
    return (
      <Card className="border border-toka-navy/10 shadow-sm">
        <CardBody>
          <p>Haz una pregunta para ver las métricas</p>
        </CardBody>
      </Card>
    );
  }

  const quality = metrics.quality_validation;

  return (
    <div className="flex flex-col gap-3" aria-label="Métricas">
      <Card className="border border-toka-navy/10 shadow-sm">
        <CardBody>
          <p className="text-sm text-toka-slate">Latencia</p>
          <p className="text-lg font-semibold text-toka-navy">{metrics.latency_ms} ms</p>
        </CardBody>
      </Card>
      <Card className="border border-toka-navy/10 shadow-sm">
        <CardBody>
          <p className="text-sm text-toka-slate">Tokens</p>
          <p>Prompt: {metrics.tokens.prompt_tokens}</p>
          <p>Completion: {metrics.tokens.completion_tokens}</p>
          <p>Total: {metrics.tokens.total_tokens}</p>
        </CardBody>
      </Card>
      <Card className="border border-toka-navy/10 shadow-sm">
        <CardBody>
          <p className="text-sm text-toka-slate">Costo estimado</p>
          <p className="text-lg font-semibold text-toka-navy">{formatCostUsd(metrics.estimated_cost_usd)}</p>
        </CardBody>
      </Card>
      <Card className="border border-toka-navy/10 shadow-sm">
        <CardBody className="gap-2">
          <p className="text-sm text-toka-slate">Calidad</p>
          <Chip color={quality.passed ? 'success' : 'danger'} variant="flat">
            {quality.passed ? 'Aprobada' : 'No aprobada'}
          </Chip>
          <Progress
            aria-label={`score ${formatScore(quality.score)}`}
            color="primary"
            value={quality.score * 100}
          />
          <p>{formatScore(quality.score)}</p>
          <ul className="flex flex-col gap-1">
            {quality.checks.map((check) => {
              const parsed = parseQualityCheck(check);
              return (
                <li key={check}>
                  {parsed.passed ? '✓' : '✗'} {parsed.id}
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
