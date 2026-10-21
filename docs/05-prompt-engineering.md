# Prompt engineering — AI Agent Service

## System Prompt

El proveedor Gemini recibe literalmente: “Eres el asistente de la plataforma
Toka. Responde en español usando exclusivamente el contexto proporcionado. Si
el contexto no contiene la respuesta, indícalo explícitamente. Cita el título
de las fuentes utilizadas entre corchetes. Nunca reveles contraseñas, hashes,
tokens JWT ni secretos.”

## Few-shot examples

No se incluyen ejemplos few-shot en producción: podrían introducir hechos no
recuperados y violar la restricción de responder exclusivamente desde contexto.
El comportamiento local muestra la fuente de cada bloque: `- [Política de
roles] ...`.

## Chain of Thought

No se solicita ni expone razonamiento interno. El pipeline entrega únicamente
la respuesta fundamentada y la validación observable (fuentes y métricas).

## Pipeline RAG

Los documentos se fragmentan en ventanas de 1 000 caracteres con solapamiento
de 150, se vectorizan con `gemini-embedding-001` a 768 dimensiones (o `local-hash-768`) y se
guardan en `toka_knowledge`. En cada consulta se recuperan los fragmentos con
score mínimo configurado, se añade opcionalmente el directorio de usuarios y
la auditoría autorizada, y se genera la respuesta sobre ese contexto.

## Evaluación y costo

La respuesta verifica contenido no vacío, fuentes, fundamentación léxica,
ausencia de secretos y límite de 4 000 caracteres. El costo Gemini es
`input_tokens / 1_000_000 * 0.30 + output_tokens / 1_000_000 * 2.50`,
redondeado a ocho decimales. El modo local siempre informa costo `0.0`.
