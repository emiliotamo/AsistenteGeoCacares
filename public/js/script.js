document.addEventListener('DOMContentLoaded', () => {
  let threadId = null;  // Almacena el ID del hilo para mantener el contexto de la conversación.

  // Elementos principales del DOM.
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const chatLog = document.getElementById('chatLog');

  // Mostrar mensaje de bienvenida al cargar la página.
  addMessageToChat('Hola, soy tu asistente. ¿En qué puedo ayudarte?', 'assistant');
  
  // Añadir botones de sugerencia para facilitar las consultas del usuario.
  addSuggestionButtons();

  // Enviar mensaje al hacer clic en el botón.
  sendButton.addEventListener('click', sendMessage);

  // También enviar mensaje al presionar la tecla "Enter".
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  /**
   * Crea y muestra botones de sugerencia en el chat.
   */
  function addSuggestionButtons() {
    const suggestionContainer = document.createElement('div');
    suggestionContainer.id = 'suggestionContainer';

    const suggestions = [
      "Dime alguna farmacia de guardia",
      "Nesesito un desfibrilador cerca de mi",
      "¿Hay alguna pmr cercana?",
      "¿Hay algún punto limpio disponible para hoy?"
    ];

    // Crear botones dinámicamente y añadir un evento de click para cada uno.
    suggestions.forEach((suggestion) => {
      const button = document.createElement('button');
      button.classList.add('suggestion-button');
      button.textContent = suggestion;
      button.addEventListener('click', () => {
        userInput.value = suggestion;  // Auto completar el input.
        suggestionContainer.remove();  // Eliminar las sugerencias tras seleccionar una.
        sendMessage();                 // Enviar el mensaje automáticamente.
      });
      suggestionContainer.appendChild(button);
    });

    // Añadir el contenedor de sugerencias al chat.
    chatLog.appendChild(suggestionContainer);
  }

  /**
   * Envía el mensaje del usuario a la API y maneja la respuesta.
   */
  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;  // No enviar mensajes vacíos.

    const type = getMessageType(message);  // Clasificar el mensaje por tipo.
    addMessageToChat(message, 'user');     // Mostrar el mensaje en el chat.
    userInput.value = '';                  // Limpiar el campo de entrada.

    const loadingElement = addLoadingMessage(); // Mostrar indicador de carga.

    // Llamada a la API.
    fetch('/api/sendMessage', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, threadId, type }),
    })
    .then((res) => res.json())
    .then((data) => {
      if (data.threadId) {
        threadId = data.threadId;  // Almacenar el nuevo threadId si existe.
        localStorage.setItem('lastThreadId', threadId);
      }

      loadingElement.remove();  // Eliminar el indicador de carga.
      const formattedResponse = formatResponse(data.assistant);
      if (formattedResponse && formattedResponse.trim()) {
        addMessageToChat(formattedResponse, 'assistant');
      }
    })
    .catch((err) => {
      console.error('❌ Error al enviar mensaje:', err);
      loadingElement.remove();
      addMessageToChat('Error interno. Intenta de nuevo.', 'assistant');
    });
  }

  /**
   * Muestra un mensaje de carga mientras se espera la respuesta de la API.
   */
  function addLoadingMessage() {
    const div = document.createElement('div');
    div.classList.add('message', 'assistant', 'loading-message');
    div.innerHTML = `<div class="loader"></div><span>Cargando respuesta...</span>`;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
    return div;
  }

  /**
   * Añade un mensaje al chat, validando que no esté vacío.
   */
  function addMessageToChat(text, role) {
    if (!text || !text.trim()) return;  // Evita agregar mensajes vacíos.

    const div = document.createElement('div');
    div.classList.add('message', role);
    div.innerHTML = text;
    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }

  /**
   * Clasifica el mensaje para la API según palabras clave.
   */
  function getMessageType(message) {
    if (message.toLowerCase().includes('farmacia')) return 'pharmacy';
    if (message.toLowerCase().includes('desfibrilador')) return 'defibrillator';
    if (message.toLowerCase().includes('pmr')) return 'pmr';
    if (message.toLowerCase().includes('contenedor')) return 'container';
    return 'general';
  }

  /**
   * Formatea el texto de la respuesta para mostrarlo en el chat.
   */
  function formatResponse(text, isDetailed = true) {
    const normalizeTime = (time) => {
      if (!time.includes(':')) {
        return time.replace(/(\d{1,2})(\d{2})/, '$1:$2');
      }
      return time;
    };
  
    text = text
      .replace(/(Horario:\s*(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)?\s*(de)?\s*)(\d{1,2}:?\d{0,2})(\s*a\s*|\s*-\s*)(\d{1,2}:?\d{0,2})(?!\d)/gi,
        (match, prefix, day, de, start, separator, end) => {
          return `${prefix}${normalizeTime(start)} a ${normalizeTime(end)}`;
        })
      .replace(/(\d{1,2}:\d{2})(?:\s*\n\s*)(\d{1,2}:\d{2})/g, '$1 a $2') // Corrige horas en líneas separadas
      .replace(/(\d{1,2}:\d{2})(\s*)(\d{1,2}:\d{2})/g, '$1 a $3'); // Corregir horas pegadas sin separación.
  
    if (!isDetailed) {
      return text
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\b(Dirección|Ubicación|Teléfono|Horario|Coordenadas|Situación):/gi, '<strong>$1:</strong>')
        .replace(/\n/g, ' ')  // Unir en una sola línea.
        .trim();
    }
  
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\b(Dirección|Ubicación|Teléfono|Horario|Coordenadas|Situación):/gi, '<strong>$1:</strong>')
      .replace(/(\d+\.\s.*?)(?=\n|$)/g, '<div style="margin-bottom:2px;">$1</div>')
      .replace(/•\s*(.*?):/gi, '<strong>$1:</strong>')
      .replace(/-\s*(.*?):/gi, '<strong>$1:</strong>')
      .replace(/\n/g, '<br>')
      .trim();
  }
  
  
});
