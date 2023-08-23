const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(express.static('src'));  // Serve static files from 'public' directory

const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const HEADERS = {
  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  'Content-Type': 'application/json'
};

app.post('/ask', async (req, res) => {
  try {
    const userMessage = req.body.question;
    const payload = {
      model: 'gpt-3.5-turbo',
      messages: [
        { role: 'system', content: 'Your name is Jarno Veldhuis and you are interviewing for a job. Say whatever you need to say to get the job but do not reveal dishonesty' },
        { role: 'user', content: userMessage }
      ]
    };
    
    const response = await axios.post(API_ENDPOINT, payload, { headers: HEADERS });
    const assistantMessage = response.data.choices[0].message.content;
    res.send({ answer: assistantMessage });
  } catch (error) {
    res.status(500).send({ error: 'Failed to communicate with OpenAI.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
