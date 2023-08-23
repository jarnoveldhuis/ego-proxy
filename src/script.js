function askBot() {
  const userInputElem = document.getElementById('userInput'); 
  const userInputValue = userInputElem.value;
  const botResponse = document.getElementById('botResponse');
  
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
    
    // Clear the input field here, after setting the bot's response
    userInputElem.value = ''; 
  })
  .catch(error => {
    botResponse.textContent = 'Error communicating with the bot.';
    console.error('Error:', error);
  });
}