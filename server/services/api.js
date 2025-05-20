const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { bucket } = require('./firebase');
require('dotenv').config();

// API Configuration
const OPENAI_API_ENDPOINT = process.env.OPENAI_API_ENDPOINT || 'https://api.openai.com/v1/chat/completions';
const ELEVENLABS_API_ENDPOINT = process.env.ELEVENLABS_API_ENDPOINT || 'https://api.elevenlabs.io/v1/text-to-speech/GBv7mTt0atIp3Br8iCZE';

const OPENAI_HEADERS = {
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  'Content-Type': 'application/json',
};

const ELEVENLABS_HEADERS = {
  'xi-api-key': process.env.ELEVENLABS_API_KEY,
  'Content-Type': 'application/json',
};

async function uploadBase64ToFirebase(base64Image) {
  try {
    const buffer = Buffer.from(base64Image, 'base64');
    const filename = `images/${uuidv4()}.png`;

    const file = bucket.file(filename);

    const metadata = {
      metadata: {
        firebaseStorageDownloadTokens: uuidv4(),
      },
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000',
    };

    await file.save(buffer, {
      metadata: metadata,
      public: true,
    });

    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(filename)}?alt=media&token=${metadata.metadata.firebaseStorageDownloadTokens}`;
  } catch (error) {
    console.error('Error uploading to Firebase:', error);
    throw new Error('Failed to upload image to Firebase Storage');
  }
}

// OpenAI API Calls
const openai = {
  async chatCompletion(payload) {
    try {
      const response = await axios.post(OPENAI_API_ENDPOINT, payload, {
        headers: OPENAI_HEADERS,
      });
      return response.data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error in OpenAI chat completion:', error);
      throw new Error('Failed to communicate with OpenAI.');
    }
  },

  async generateImage(prompt) {
    try {
      const response = await axios.post(
        'https://api.openai.com/v1/images/generations',
        {
          model: 'gpt-image-1',
          prompt,
          n: 1,
          size: '1024x1024',
        },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );

      const base64Image = response.data.data[0]?.b64_json;
      if (!base64Image) throw new Error('No image data from OpenAI.');
    
      // Upload to Firebase
      const imageUrl = await uploadBase64ToFirebase(base64Image);

      return imageUrl;
    } catch (error) {
      console.error('Error in OpenAI image generation:', error);
      throw new Error('Failed to generate image with OpenAI.');
    }
  },

  async describeImage(base64) {
    try {
      const response = await axios.post(
        OPENAI_API_ENDPOINT,
        {
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'You are an author describing a character inspired by this picture. Describe the image as an a children\'s cartoon to your illustrator. The background must be pure black. If a description can not be generated, return the word \'error:\' with a description of the issue.',
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/jpeg;base64,${base64}`,
                  },
                },
              ],
            },
          ],
        },
        {
          headers: OPENAI_HEADERS,
        }
      );
      
      if (!response.data.choices?.[0]?.message?.content) {
        throw new Error('No content received from OpenAI');
      }
      
      const content = response.data.choices[0].message.content;
      if (content.toLowerCase().includes('error:')) {
        throw new Error(content);
      }
      
      return content;
    } catch (error) {
      console.error('Error in OpenAI image description:', error);
      if (error.response?.data) {
        console.error('OpenAI API Error:', error.response.data);
      }
      throw new Error(error.message || 'Failed to describe image with OpenAI.');
    }
  }
};

// ElevenLabs API Calls
const elevenLabs = {
  async synthesizeSpeech(text, voiceEndpoint = ELEVENLABS_API_ENDPOINT) {
    try {
      const response = await axios.post(
        voiceEndpoint,
        {
          text,
          model_id: 'eleven_monolingual_v1',
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5,
            use_speaker_boost: true,
          },
        },
        {
          headers: ELEVENLABS_HEADERS,
          responseType: 'arraybuffer',
        }
      );
      return Buffer.from(response.data, 'binary');
    } catch (error) {
      console.error('Error in ElevenLabs speech synthesis:', error);
      throw new Error('Failed to communicate with ElevenLabs.');
    }
  }
};

module.exports = {
  openai,
  elevenLabs,
  ELEVENLABS_ENDPOINTS: {
    Adam: 'https://api.elevenlabs.io/v1/text-to-speech/lj8oyquj3C1V08Xs4x9f',
    Stav: 'https://api.elevenlabs.io/v1/text-to-speech/g11iLvGRfVTIS78ofuHa',
    Nick: 'https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp',
    Mike: 'https://api.elevenlabs.io/v1/text-to-speech/EL0wUO72Pc3LfZ2jqe9b',
    Piero: 'https://api.elevenlabs.io/v1/text-to-speech/lgy8xTZLCdWp5GxhftID',
    Jarno: 'https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN',
    YarnMan: 'https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN',
    Ivan: 'https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp',
    Male: 'https://api.elevenlabs.io/v1/text-to-speech/y1adqrqs4jNaANXsIZnD',
    Female: 'https://api.elevenlabs.io/v1/text-to-speech/9iZbnYLpicE89JhjTrR5',
    Donnie: 'https://api.elevenlabs.io/v1/text-to-speech/X2295PCUkl7636D0KoSI',
  }
}; 