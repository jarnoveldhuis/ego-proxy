let thinkingTimer;
const thinkDelay = 2000;

function askBot() {
  const userInputElem = document.getElementById('userInput');
  const botImage = document.getElementById('botImage'); // Get the image element
  const userInputValue = userInputElem.value;

  // Clear the input field immediately after the function runs
  userInputElem.value = '';

  // Update to thinking image
  thinkingTimer = setTimeout(() => {
    botImage.src = "/img/think.svg";
  }, thinkDelay);

  const botResponse = document.getElementById('botResponse');

  // Set an immediate response message
  botResponse.textContent = '';

  // Add a 'loading' class to the botResponse element
  botResponse.classList.add('loading');

  fetch('/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question: userInputValue })
  })
    .then(response => response.json())
    .then(data => {
      clearTimeout(thinkingTimer);
      botResponse.textContent = data.answer;
      botResponse.classList.remove('loading');
      // Change the image when the API call finishes successfully
      botImage.src = "/img/neutral.svg"; // Change to the path of your success image or back to the original
    })
    .catch(error => {
      clearTimeout(thinkingTimer);
      botResponse.textContent = 'Error communicating with the bot.';
      botResponse.classList.remove('loading');
      console.error('Error:', error);
    });
}

// window.addEventListener("load", function() {
//   askBot();
// });

// Change the image when the user clicks on the text field
document.getElementById('userInput').addEventListener('focus', function () {
  document.getElementById('botImage').src = "/img/neutral.svg";
});

let typingTimer; // Timer identifier
const doneTypingInterval = 1000;

document.getElementById('userInput').addEventListener('keydown', function () {
  clearTimeout(typingTimer);
  document.getElementById('botImage').src = "/img/listening.svg";
  typingTimer = setTimeout(doneTyping, doneTypingInterval);
});

function doneTyping() {
  document.getElementById('botImage').src = "/img/neutral.svg"; // Switch back to the original image
}

const inputElement = document.getElementById('userInput');
const imageElement = document.getElementById('botImage');

inputElement.addEventListener('focus', function() {
  imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

document.addEventListener('DOMContentLoaded', (event) => {
  const inputElement = document.getElementById('userInput');
  const imageElement = document.getElementById('botImage');

  inputElement.addEventListener('focus', function() {
    console.log('Input got focus, trying to scroll image into view.');
    imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.addEventListener('DOMContentLoaded', (event) => {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

  if (isIOS) {
      const inputElement = document.getElementById('userInput');
      const imageElement = document.getElementById('botImage');

      inputElement.addEventListener('focus', function() {
          console.log('Input got focus, trying to scroll image into view.');
          imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
  }
});
const field = document.getElementById("userInput");

field.addEventListener("focus", () => {
  field.style.marginBottom = 0;
});
