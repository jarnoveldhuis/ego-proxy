function askBot() {
  const userInputElem = document.getElementById('userInput'); 
  const userInputValue = userInputElem.value;

  // Clear the input field immediately after the function runs
  userInputElem.value = '';

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
    botResponse.textContent = data.answer;
    botResponse.classList.remove('loading');
  })
  .catch(error => {
    botResponse.textContent = 'Error communicating with the bot.';
    botResponse.classList.remove('loading');
    console.error('Error:', error);
  });
}