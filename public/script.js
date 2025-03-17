document.addEventListener('DOMContentLoaded', () => {
  let threadId = null; // Variable para almacenar threadId entre mensajes
  const userInput = document.getElementById('userInput');
  const sendButton = document.getElementById('sendButton');
  const chatLog = document.getElementById('chatLog');

  // Mensaje inicial opcional
  addMessageToChat(
    'Hola, soy tu asistente de farmacias en Cáceres. ¿En qué puedo ayudarte?',
    'assistant'
  );

  // Event Listeners para enviar mensajes
  sendButton.addEventListener('click', sendMessage);
  userInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendMessage();
    }
  });

  /**
   * Función para enviar mensajes al servidor
   */
  function sendMessage() {
    const message = userInput.value.trim();
    if (!message) return;

    // Añade el mensaje del usuario al chat
    addMessageToChat(message, 'user');
    userInput.value = '';

    // Envía el mensaje al servidor, pasando el threadId si existe
    fetch('/api/createThreadAndRun', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, threadId }),
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`HTTP error: ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        // Verificar que `threadId` se actualiza correctamente
        if (data.threadId) {
          threadId = data.threadId;
          console.log('Nuevo threadId:', threadId); // Debug
        }
      
        // Muestra la respuesta del asistente
        addMessageToChat(data.assistant, 'assistant');
      })
      .catch((err) => {
        console.error('Error al enviar mensaje:', err);
        addMessageToChat('Error interno. Intenta de nuevo.', 'assistant');
      });
  }

  /**
   * Función para añadir mensajes al chat
   * @param {string} text - El contenido del mensaje en Markdown
   * @param {string} role - 'user' o 'assistant'
   */
  function addMessageToChat(text, role) {
    const div = document.createElement('div');
    div.classList.add('message', role);

    if (role === 'assistant') {
      // Convierte Markdown a HTML usando marked.js
      const markdown = text;
      const rawHTML = marked.parse(markdown);

      // Sanitiza el HTML resultante usando DOMPurify
      const sanitizedHTML = DOMPurify.sanitize(rawHTML);

      // Inserta el HTML sanitizado en el div
      div.innerHTML = sanitizedHTML;
    } else {
      // Inserta el contenido como texto plano para mensajes del usuario
      div.textContent = text;
    }

    chatLog.appendChild(div);
    chatLog.scrollTop = chatLog.scrollHeight;
  }
});
