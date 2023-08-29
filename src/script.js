function askBot() {
  const userInputElem = document.getElementById('userInput');

  const botImage = document.getElementById('botImage'); // Get the image element
  const userInputValue = userInputElem.value;

  // Clear the input field immediately after the function runs
  userInputElem.value = '';

  // Update to thinking image
  botImage.src = "/img/think1.svg";

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
      // Change the image when the API call finishes successfully
      botImage.src = "/img/listening.svg"; // Change to the path of your success image or back to the original
    })
    .catch(error => {
      botResponse.textContent = 'Error communicating with the bot.';
      botResponse.classList.remove('loading');
      console.error('Error:', error);
    });
}


// Change the image when the user clicks on the text field
document.getElementById('userInput').addEventListener('focus', function () {
document.getElementById('botImage').src = "/img/listening.svg"; // Change to the path of your clicked image
});