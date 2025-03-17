require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

/**
 * Clase ApiService:
 * Encapsula las llamadas a la API municipal
 */
class ApiService {
  constructor(apiKey) {
    this.axiosInstance = axios.create({
      baseURL: 'https://aplicaciones05.ayto-caceres.es/DesarrolloApi',
      headers: {
        'Content-Type': 'application/json',
        'OpenAi-ApiKey': apiKey
      }
    });
  }

  async createThreadAndRun(payload) {
    const response = await this.axiosInstance.post(
      '/api/AssistantOpenAiV2/v2/CreateThreadAndRun',
      payload
    );
    return response.data;
  }

  async createRun(threadId, payload) {
    const response = await this.axiosInstance.post(
      `/api/AssistantOpenAiV2/v2/CreateRun/${threadId}`,
      payload
    );
    return response.data;
  }

  async retrieveRun(threadId, runId) {
    const response = await this.axiosInstance.get(
      `/api/AssistantOpenAiV2/v2/RetrieveRun/${threadId}/${runId}`
    );
    return response.data;
  }

  async listMessages(threadId) {
    const response = await this.axiosInstance.get(
      `/api/AssistantOpenAiV2/v2/ListMesage/${threadId}`
    );
    return response.data;
  }

  async submitToolOutputs(threadId, runId, toolOutputs) {
    const response = await this.axiosInstance.post(
      `/api/AssistantOpenAiV2/v2/SubmitToolOutputs/${threadId}/${runId}`,
      { tool_outputs: toolOutputs }
    );
    return response.data;
  }
}

/**
 * runAssistantFlow: flujo principal del asistente
 */
async function runAssistantFlow(apiService, userMessage, existingThreadId = null) {
  let runResp;

  if (existingThreadId) {
    console.log(`Usando threadId existente: ${existingThreadId}`);

    // Si ya existe un threadId, usa CreateRun
    runResp = await apiService.createRun(existingThreadId, {
      assistant_id: 'asst_LaCKtLYCXbB6lHslfYtS9cES',
      additional_messages: [
        {
          role: 'user',
          content: userMessage,
          attachments: [],
        },
      ],
    });
  } else {
    console.log('Creando un nuevo thread');

    // Si no existe threadId, crea uno nuevo
    runResp = await apiService.createThreadAndRun({
      assistant_id: 'asst_LaCKtLYCXbB6lHslfYtS9cES',
      thread: {
        messages: [
          {
            role: 'user',
            content: userMessage,
            attachments: [],
          },
        ],
      },
    });
  }

  // Asegurar que obtenemos los IDs correctos
  const threadId = existingThreadId || runResp.thread_id || runResp.thread?.id;
  let runId = runResp.id;

  if (!threadId || !runId) {
    throw new Error(`No se obtuvo threadId o runId. Respuesta: ${JSON.stringify(runResp, null, 2)}`);
  }

  console.log(`ThreadId: ${threadId}, RunId: ${runId}`);

  // Esperar a que el asistente complete su ejecución
  while (true) {
    console.log(`Estado del run: ${runResp.status}`);

    if (runResp.required_action && runResp.required_action.type === 'submit_tool_outputs') {
      const calls = runResp.required_action.submit_tool_outputs.tool_calls;
      if (Array.isArray(calls) && calls.length > 0) {
        const toolCall = calls[0];
        let respuesta = '';

        try {
          console.log('Consultando GeoServer para obtener farmacias...');
          const geoServerUrl =
            'https://ide.caceres.es/geoserver/toponimia/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=toponimia%3Afarmacias&maxFeatures=50&outputFormat=application%2Fjson';
          const geoResp = await axios.get(geoServerUrl);
          const geoData = geoResp.data;

          respuesta = parsearFarmacias(geoData);
        } catch (err) {
          console.error('Error consultando GeoServer:', err.message);
          respuesta = 'No se pudo obtener la lista de farmacias en este momento.';
        }

        const toolOutputs = [
          {
            tool_call_id: toolCall.id,
            output: respuesta,
          },
        ];

        console.log('Enviando tool_outputs al asistente...');
        runResp = await apiService.submitToolOutputs(threadId, runId, toolOutputs);
        runId = runResp.id;
      }
    }

    if (runResp.status === 'completed') {
      console.log('El asistente ha completado la ejecución.');
      break;
    }

    if (['failed', 'cancelled'].includes(runResp.status)) {
      console.error('La ejecución del asistente falló o fue cancelada.');
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));

    console.log('Obteniendo estado actualizado del asistente...');
    runResp = await apiService.retrieveRun(threadId, runId);
  }

  // Obtener los mensajes del asistente
  console.log('Obteniendo los mensajes del asistente...');
  const messagesData = await apiService.listMessages(threadId);
  const messages = messagesData.data || messagesData;

  console.log('Mensajes obtenidos:', messages);

  // **Nueva Lógica para obtener la última respuesta válida del asistente**
  const assistantMessages = messages
    .filter((msg) => msg.role === 'assistant')
    .sort((a, b) => b.created_at - a.created_at); // Ordenar del más reciente al más antiguo

  if (assistantMessages.length > 0) {
    const latestMessage = assistantMessages[0];
    const content = latestMessage.content;

    if (Array.isArray(content)) {
      const textPart = content.find((c) => c.type === 'text');
      if (textPart && textPart.text?.value) {
        console.log('Última respuesta del asistente:', textPart.text.value);
        return { content: textPart.text.value, threadId };
      }

      console.log('Contenido en otro formato:', JSON.stringify(content, null, 2));
      return { content: JSON.stringify(content, null, 2), threadId };
    } else {
      console.log('Última respuesta del asistente:', content);
      return { content, threadId };
    }
  }

  console.log('No se encontró una respuesta válida del asistente.');
  return { content: 'No se encontró respuesta del asistente.', threadId };
}


/**
 * parsearFarmacias: función para procesar datos de farmacias
 */
function parsearFarmacias(data) {
  if (!data || !data.features || data.features.length === 0) {
    return '<p>No se encontraron farmacias.</p>';
  }

  let html = '<ol>';
  data.features.forEach((feature) => {
    const p = feature.properties;
    const nombreFarmacia = p.nombretitu || 'Sin nombre';
    const via = `${p.tipovia || ''} ${p.nombrevia || ''}, ${p.numpol || ''}`;
    const horario = p.horario || 'Horario no disponible';
    const telefono = p.telefono || 'Sin teléfono';

    html += `
      <li>
        <strong>${nombreFarmacia}</strong><br/>
        <strong>Dirección:</strong> ${via}<br/>
        <strong>Horario:</strong> ${horario}<br/>
        <strong>Teléfono:</strong> ${telefono}
      </li>
    `;
  });
  html += '</ol>';

  return html;
}

// ------------------- Servidor Express -------------------
const app = express();
app.use(cors());
app.use(express.json());

// Instanciamos nuestro ApiService
const apiService = new ApiService(process.env.OPENAI_API_KEY);

// Servir los archivos estáticos desde la carpeta "public"
app.use('/', express.static('public'));

/**
 * Endpoint principal:
 * Recibe el mensaje del usuario, llama runAssistantFlow y devuelve la respuesta final
 */
app.post('/api/createThreadAndRun', async (req, res) => {
  try {
    const { message, threadId } = req.body;
    const response = await runAssistantFlow(apiService, message, threadId);

    // Devuelve la respuesta del asistente y el threadId al cliente
    return res.json({ assistant: response.content, threadId: response.threadId });
  } catch (error) {
    console.error('Error en createThreadAndRun:', error);
    return res.status(500).json({ assistant: 'Error interno del servidor' });
  }
});

// Iniciamos el servidor
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
