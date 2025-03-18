require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

// Validación para la API Key
if (!process.env.OPENAI_API_KEY) {
  console.error("❌ Error: La variable de entorno OPENAI_API_KEY no está definida.");
  process.exit(1);
}

class ApiService {
  constructor(apiKey) {
    this.axiosInstance = axios.create({
      baseURL: 'http://localhost:5010/api/OpenDataSig',
      headers: {
        'Content-Type': 'application/json',
        'OpenAi-ApiKey': apiKey,
      },
    });
  }


  /**
   * Envía el mensaje a la API y retorna la respuesta.
   */
  async sendMessage(threadId, userMessage) {
    const url = threadId ? `/sendMessage?threadId=${encodeURIComponent(threadId)}` : '/sendMessage';
    const payload = { message: userMessage, threadId };

    try {
      const response = await this.axiosInstance.post(url, payload);
      return response.data;
    } catch (error) {
      console.error("❌ Error en ApiService:", error.response?.data || error.message);
      throw error;
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json());

const apiService = new ApiService(process.env.OPENAI_API_KEY);

// Servir archivos estáticos del frontend
app.use('/', express.static('public'));

// Endpoint para recibir mensajes y reenviar a la API.
app.post('/api/sendMessage', async (req, res) => {
  try {
    const { message, threadId } = req.body;

    if (!message) {
      return res.status(400).json({ assistant: "Debes enviar un mensaje válido." });
    }

    const apiResponse = await apiService.sendMessage(threadId, message);
    const assistantText = apiResponse?.mensaje || "Lo siento, no tengo una respuesta en este momento.";
    const newThreadId = apiResponse.threadId || threadId;

    res.json({ assistant: assistantText, threadId: newThreadId });
  } catch (error) {
    console.error("❌ Error en /api/sendMessage:", error);
    res.status(500).json({ assistant: 'Error interno del servidor' });
  }
});

// Configuración del puerto del servidor.
const port = 3000;
app.listen(port, () => {
  console.log(`Servidor escuchando en http://localhost:${port}`);
});
