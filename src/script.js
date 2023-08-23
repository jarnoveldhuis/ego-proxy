function askBot() {
    const userInput = document.getElementById('userInput').value;
    const botResponse = document.getElementById('botResponse');
    
    fetch('/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ question: userInput })
    })
    .then(response => response.json())
    .then(data => {
      botResponse.textContent = data.answer;
    })
    .catch(error => {
      botResponse.textContent = 'Error communicating with the bot.';
      console.error('Error:', error);
    });
  }
  