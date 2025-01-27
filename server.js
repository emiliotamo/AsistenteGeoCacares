require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

/**
 * Clase ApiService:
 * Encapsula las llamadas a la API municipal
 * (CreateThreadAndRun, RetrieveRun, ListMesage, SubmitToolOutputs).
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
 * Lógica principal:
 * 1) CreateThreadAndRun con el mensaje del usuario
 * 2) Polling con retrieveRun hasta "completed"/"failed"/"cancelled"
 * 3) Si la IA pide la herramienta "Farmacias", llamamos a GeoServer
 * 4) Enviamos el resultado con submitToolOutputs
 * 5) Al finalizar, listMessages para obtener el mensaje final del asistente
 */
async function runAssistantFlow(apiService, userMessage) {
  // 1) Llama a CreateThreadAndRun
  let runResp = await apiService.createThreadAndRun({
    assistant_id: 'asst_LaCKtLYCXbB6lHslfYtS9cES', 
    thread: {
      messages: [
        {
          role: 'user',
          content: userMessage,
          attachments: [],
          metadata: {}
        }
      ],
      metadata: {}
    }
  });

  // Obtenemos threadId y runId
  const threadId = runResp.thread_id || runResp.thread?.id;
  let runId = runResp.id;
  if (!threadId || !runId) {
    throw new Error(
      `No se obtuvo threadId o runId. Respuesta: ${JSON.stringify(runResp, null, 2)}`
    );
  }

  // 2) Polling: mientras no esté "completed"...
  while (true) {
    if (runResp.required_action && runResp.required_action.type === 'submit_tool_outputs') {
      const calls = runResp.required_action.submit_tool_outputs.tool_calls;
      if (Array.isArray(calls) && calls.length > 0) {
        const toolCall = calls[0];
        console.log('El asistente solicita tool call:', toolCall);
        let respuesta = '';

        try {
          // Llamamos a GeoServer
          // (Puedes filtrar por farmacias de guardia, etc., si tienes un endpoint distinto)
          const geoServerUrl = 'https://ide.caceres.es/geoserver/toponimia/ows?service=WFS&version=1.0.0&request=GetFeature&typeName=toponimia%3Afarmacias&maxFeatures=50&outputFormat=application%2Fjson';
          
          const geoResp = await axios.get(geoServerUrl);
          const geoData = geoResp.data; // GeoJSON

          // Parseamos
          respuesta = parsearFarmacias(geoData);

        } catch (err) {
          console.error('Error consultando GeoServer:', err.message);
          respuesta = 'No se pudo obtener la lista de farmacias en este momento.';
        }

        // respondemos con submitToolOutputs
        const toolOutputs = [
          {
            tool_call_id: toolCall.id,
            output: respuesta
          }
        ];
        runResp = await apiService.submitToolOutputs(threadId, runId, toolOutputs);
        runId = runResp.id; 
      }
    }

    // Revisamos el estado
    if (runResp.status === 'completed') {
      console.log('Run completado con éxito.');
      break;
    }
    if (['failed', 'cancelled'].includes(runResp.status)) {
      console.warn(`Run finalizó con estado: ${runResp.status}`);
      break;
    }

    // Si sigue en "queued" o "in_progress", volvemos a consultar
    console.log(`Run en estado "${runResp.status}". Llamamos a retrieveRun...`);
    runResp = await apiService.retrieveRun(threadId, runId);
  }

  // 3) Cuando finaliza, listMessages para obtener el mensaje final
  const messagesData = await apiService.listMessages(threadId);
  const messages = messagesData.data || messagesData; // depende de la estructura real

  // Buscamos el último mensaje con role = "assistant"
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      const content = messages[i].content; // puede ser array
      if (Array.isArray(content)) {
        const textPart = content.find(c => c.type === 'text');
        if (textPart && textPart.text?.value) {
          return textPart.text.value;
        }
        return JSON.stringify(content, null, 2);
      } else {
        return content; // si fuese un string directo
      }
    }
  }

  return 'No se encontró respuesta del asistente.';
}



/**
 * parsearFarmacias(data):
 * - data es un GeoJSON con "features"
 * - Devuelve un string con la info que queremos
 */
function parsearFarmacias(data) {
  if (!data || !data.features || data.features.length === 0) {
    return '<p>No se encontraron farmacias.</p>';
  }

  // Construimos una lista ordenada en HTML
  let html = '<ol>';
  data.features.forEach((feature, index) => {
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
    const { message } = req.body;
    const finalText = await runAssistantFlow(apiService, message);
    return res.json({ assistant: finalText }); // Asegúrate de que finalText contiene HTML
  } catch (error) {
    console.error('Error en createThreadAndRun:', error);
    return res.status(500).json({ assistant: 'Error interno del servidor' });
  }
});

/**
 * Rutas opcionales de depuración
 */
app.get('/api/retrieveRun', async (req, res) => {
  try {
    const { threadId, runId } = req.query;
    const data = await apiService.retrieveRun(threadId, runId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en retrieveRun' });
  }
});

app.get('/api/listMessages', async (req, res) => {
  try {
    const { threadId } = req.query;
    const data = await apiService.listMessages(threadId);
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Error en listMessages' });
  }
});

// Iniciamos el servidor
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
