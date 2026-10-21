import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useAiAgentStore } from '../application/stores/ai-agent.store';
import { adminUser, askResponse, ingestResponse, plainUser } from './fixtures';
import { installMockApis, renderAt, resetClientState, seedSession } from './test-utils';

describe('AssistantPage y MetricsPanel', () => {
  beforeEach(() => {
    resetClientState();
  });

  it('envía la pregunta y deshabilita el envío mientras carga', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    let resolveAsk: (value: typeof askResponse) => void = () => undefined;
    ports.ai.ask.mockReturnValue(
      new Promise((resolve) => {
        resolveAsk = resolve;
      }),
    );
    seedSession(plainUser);
    renderAt('/assistant');
    expect(screen.getByText('Haz una pregunta para ver las métricas')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ingerir documentos' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Pregunta'), '¿Quién está activo?');
    expect(screen.getByLabelText('Contador de pregunta')).toHaveTextContent('19/2000');
    await user.click(screen.getByRole('button', { name: 'Preguntar' }));
    expect(await screen.findByText('Pensando…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Preguntar/ })).toBeDisabled();
    expect(ports.ai.ask).toHaveBeenCalledWith({
      question: '¿Quién está activo?',
      topK: 5,
      includeLiveData: true,
    });

    resolveAsk(askResponse);
    expect(await screen.findByText(askResponse.answer)).toBeInTheDocument();
    expect(screen.getByText('Flujo de alta de usuarios 0.81')).toBeInTheDocument();
    expect(screen.getByText('Directorio de usuarios (tiempo real) 1.00')).toBeInTheDocument();
    expect(screen.getByText('842 ms')).toBeInTheDocument();
    expect(screen.getByText('Prompt: 1210')).toBeInTheDocument();
    expect(screen.getByText('Completion: 96')).toBeInTheDocument();
    expect(screen.getByText('Total: 1306')).toBeInTheDocument();
    expect(screen.getByText('US$ 0.000603')).toBeInTheDocument();
    expect(screen.getByText('Aprobada')).toBeInTheDocument();
    expect(screen.getByText('1.00')).toBeInTheDocument();
    expect(screen.getByText('✓ answer_not_empty')).toBeInTheDocument();
    expect(screen.getByText('✗ no_sensitive_data')).toBeInTheDocument();
  });

  it('no envía una pregunta vacía y permite apagar los datos en tiempo real', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    seedSession(plainUser);
    renderAt('/assistant');
    await user.click(screen.getByRole('button', { name: 'Preguntar' }));
    expect(screen.getByText('La pregunta es obligatoria')).toBeInTheDocument();
    expect(ports.ai.ask).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Pregunta'), 'Hola');
    await user.click(screen.getByRole('switch', { name: 'Incluir datos en tiempo real' }));
    await user.clear(screen.getByLabelText('topK'));
    await user.type(screen.getByLabelText('topK'), '3');
    await user.click(screen.getByRole('button', { name: 'Preguntar' }));
    await waitFor(() => {
      expect(ports.ai.ask).toHaveBeenCalledWith({
        question: 'Hola',
        topK: 3,
        includeLiveData: false,
      });
    });
  });

  it('muestra la ingesta solo a ADMIN', async () => {
    const user = userEvent.setup();
    const ports = installMockApis();
    ports.ai.ingest.mockResolvedValue(ingestResponse);
    seedSession(adminUser);
    renderAt('/assistant');
    await user.click(screen.getByRole('button', { name: 'Ingerir documentos' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(screen.getByLabelText('Título'), 'Política de roles');
    await user.type(screen.getByLabelText('Origen'), 'knowledge/roles-policy.md');
    await user.type(screen.getByLabelText('Contenido'), 'Solo ADMIN asigna roles.');
    await user.click(screen.getByRole('button', { name: 'Ingerir' }));
    expect(ports.ai.ingest).toHaveBeenCalledWith({
      documents: [
        {
          title: 'Política de roles',
          source: 'knowledge/roles-policy.md',
          content: 'Solo ADMIN asigna roles.',
        },
      ],
    });
    expect(await screen.findByText(/Fragmentos indexados: 3/)).toBeInTheDocument();
    expect(screen.getByText(/gemini-embedding-001/)).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();

    act(() => {
      useAiAgentStore.getState().clearConversation();
    });
    expect(screen.queryByText(askResponse.answer)).not.toBeInTheDocument();
  });
});
