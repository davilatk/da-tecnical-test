import {
  Button,
  Chip,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Switch,
  Textarea,
  Tooltip,
} from '@heroui/react';
import { useState, type KeyboardEvent } from 'react';
import { ApiClientError } from '../../application/api-client-error';
import { useAiAgentStore } from '../../application/stores/ai-agent.store';
import type { IngestDocument } from '../../domain/contracts';
import { formatScore } from '../../domain/formatters';
import { validateBoundedText, validateQuestion, validateTopK } from '../../domain/validators';
import { MetricsPanel } from '../components/metrics-panel';
import { useAuthSession } from '../hooks/use-auth-session';

export function AssistantPage() {
  const { isAdmin } = useAuthSession();
  const messages = useAiAgentStore((state) => state.messages);
  const lastResponse = useAiAgentStore((state) => state.lastResponse);
  const lastIngest = useAiAgentStore((state) => state.lastIngest);
  const status = useAiAgentStore((state) => state.status);
  const error = useAiAgentStore((state) => state.error);
  const ask = useAiAgentStore((state) => state.ask);
  const ingest = useAiAgentStore((state) => state.ingest);
  const clearConversation = useAiAgentStore((state) => state.clearConversation);
  const [question, setQuestion] = useState('');
  const [includeLiveData, setIncludeLiveData] = useState(true);
  const [topK, setTopK] = useState('5');
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [topKError, setTopKError] = useState<string | null>(null);
  const [ingesting, setIngesting] = useState(false);

  const loading = status === 'loading';

  async function submit(): Promise<void> {
    if (loading) {
      return;
    }
    const nextQuestionError = validateQuestion(question);
    const parsedTopK = Number(topK);
    const nextTopKError = validateTopK(parsedTopK) ? null : 'topK debe estar entre 1 y 10';
    setQuestionError(nextQuestionError);
    setTopKError(nextTopKError);
    if (nextQuestionError !== null || nextTopKError !== null) {
      return;
    }
    try {
      await ask({
        question: question.trim(),
        topK: parsedTopK,
        includeLiveData,
      });
      setQuestion('');
    } catch (caught) {
      if (!(caught instanceof ApiClientError)) {
        return;
      }
    }
  }

  function onQuestionKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-toka-steel">Conocimiento</p>
          <h1 className="text-2xl font-semibold text-toka-navy">Consola del agente IA</h1>
        </div>
        <Button variant="flat" onPress={clearConversation}>
          Limpiar conversación
        </Button>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
        <div className="flex min-h-[36rem] flex-col gap-3">
          <div
            className="flex flex-1 flex-col gap-3 overflow-y-auto rounded-2xl border border-toka-navy/10 bg-white p-4 shadow-sm"
            aria-label="Conversación"
          >
            {messages.length === 0 && !loading ? (
              <p className="m-auto max-w-sm text-center text-sm text-[#5f6368]">
                Pregunta sobre identidades, roles y auditoría.
              </p>
            ) : null}
            {messages.map((message) => (
              <article
                key={message.id}
                aria-label={message.role === 'user' ? 'Mensaje del usuario' : 'Mensaje del asistente'}
                className={`flex max-w-[90%] flex-col gap-2 rounded-2xl px-4 py-3 ${
                  message.role === 'user'
                    ? 'self-end bg-toka-navy text-white'
                    : 'self-start bg-toka-mist text-toka-ink'
                }`}
              >
                <p>{message.content}</p>
                {message.response !== undefined ? (
                  <div className="flex flex-wrap gap-2">
                    {message.response.sources.map((source, index) => (
                      <Tooltip key={`${message.id}-${source.source}-${index}`} content={source.source}>
                        <Chip variant="flat">
                          {source.title} {formatScore(source.score)}
                        </Chip>
                      </Tooltip>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {loading ? <p>Pensando…</p> : null}
          </div>
          <div
            className={`rounded-[28px] border bg-white px-3 pb-2 pt-3 shadow-[0_1px_3px_rgba(60,64,67,0.12),0_4px_12px_rgba(60,64,67,0.06)] transition-shadow focus-within:shadow-[0_1px_3px_rgba(0,42,94,0.16),0_6px_16px_rgba(0,42,94,0.08)] ${
              questionError !== null ? 'border-danger' : 'border-[#dadce0] focus-within:border-toka-navy'
            }`}
          >
            <Textarea
              aria-label="Pregunta"
              placeholder="Pregunta al asistente"
              minRows={1}
              maxRows={8}
              variant="flat"
              value={question}
              onValueChange={setQuestion}
              onKeyDown={onQuestionKeyDown}
              isInvalid={questionError !== null}
              classNames={{
                inputWrapper:
                  'bg-transparent px-2 py-0 shadow-none data-[hover=true]:bg-transparent group-data-[focus=true]:bg-transparent',
                input: 'text-base text-[#1f1f1f] placeholder:text-[#80868b]',
              }}
              {...(questionError !== null ? { errorMessage: questionError } : {})}
            />
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3 px-1">
              <div className="flex flex-wrap items-center gap-3">
                <Switch size="sm" isSelected={includeLiveData} onValueChange={setIncludeLiveData}>
                  Incluir datos en tiempo real
                </Switch>
                <Input
                  type="number"
                  label="topK"
                  size="sm"
                  className="w-24"
                  value={topK}
                  onValueChange={setTopK}
                  isInvalid={topKError !== null}
                  {...(topKError !== null ? { errorMessage: topKError } : {})}
                />
                <p aria-label="Contador de pregunta" className="text-xs text-[#80868b]">
                  {question.length}/2000
                </p>
              </div>
              <Button
                color="primary"
                radius="full"
                className="h-10 px-4 font-medium"
                isDisabled={loading}
                isLoading={loading}
                onPress={() => void submit()}
                startContent={loading ? null : <SendIcon />}
              >
                Preguntar
              </Button>
            </div>
          </div>
          {error !== null ? <p role="alert">{error.message}</p> : null}
          {isAdmin ? (
            <IngestPanel
              open={ingesting}
              onOpen={() => setIngesting(true)}
              onClose={() => setIngesting(false)}
              chunksIndexed={lastIngest?.chunksIndexed ?? null}
              embeddingModel={lastIngest?.embeddingModel ?? null}
              onIngest={ingest}
            />
          ) : null}
        </div>
        <MetricsPanel metrics={lastResponse?.metrics ?? null} />
      </div>
    </section>
  );
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 19V5M12 5l-6 6M12 5l6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IngestPanel({
  open,
  onOpen,
  onClose,
  chunksIndexed,
  embeddingModel,
  onIngest,
}: {
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  chunksIndexed: number | null;
  embeddingModel: string | null;
  onIngest: (req: { documents: IngestDocument[] }) => Promise<unknown>;
}) {
  const [title, setTitle] = useState('');
  const [source, setSource] = useState('');
  const [content, setContent] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(): Promise<void> {
    const titleState = validateBoundedText(title, 1, 200);
    const sourceState = validateBoundedText(source, 1, 500);
    const contentState = validateBoundedText(content, 1, 100000);
    if (titleState !== null || sourceState !== null || contentState !== null) {
      setFieldError('Completa título (1–200), origen (1–500) y contenido (1–100000).');
      return;
    }
    setFieldError(null);
    setSubmitting(true);
    try {
      await onIngest({
        documents: [
          {
            title: title.trim(),
            source: source.trim(),
            content: content.trim(),
          },
        ],
      });
      setTitle('');
      setSource('');
      setContent('');
      onClose();
    } catch (error) {
      if (error instanceof ApiClientError) {
        setFieldError(error.body.message);
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-label="Ingesta" className="flex flex-col gap-2">
      <Button variant="bordered" onPress={onOpen}>
        Ingerir documentos
      </Button>
      {chunksIndexed !== null && embeddingModel !== null ? (
        <p>
          Fragmentos indexados: {chunksIndexed}. Modelo: {embeddingModel}
        </p>
      ) : null}
      <Modal isOpen={open} onOpenChange={(next) => { if (!next) onClose(); }}>
        <ModalContent>
          <ModalHeader>Ingerir documentos</ModalHeader>
          <ModalBody className="gap-3">
            <Input label="Título" value={title} onValueChange={setTitle} />
            <Input label="Origen" value={source} onValueChange={setSource} />
            <Textarea label="Contenido" minRows={4} value={content} onValueChange={setContent} />
            {fieldError !== null ? <p role="alert">{fieldError}</p> : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="light" onPress={onClose}>
              Cancelar
            </Button>
            <Button color="primary" isLoading={submitting} isDisabled={submitting} onPress={() => void submit()}>
              Ingerir
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </section>
  );
}
