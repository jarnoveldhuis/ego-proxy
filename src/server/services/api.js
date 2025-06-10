const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const { bucket } = require("./firebase"); // Assuming firebase.js is correctly set up
require("dotenv").config();
const FormData = require('form-data'); // Import FormData
// At the top of api.js
const { createPayload } = require('./utils');

// API Configuration
const OPENAI_API_ENDPOINT =
  process.env.OPENAI_API_ENDPOINT ||
  "https://api.openai.com/v1/chat/completions";
const ELEVENLABS_API_ENDPOINT =
  process.env.ELEVENLABS_API_ENDPOINT ||
  "https://api.elevenlabs.io/v1/text-to-speech/GBv7mTt0atIp3Br8iCZE"; // Default voice, can be overridden

const OPENAI_HEADERS = {
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  "Content-Type": "application/json",
};

const ELEVENLABS_HEADERS = {
  "xi-api-key": process.env.ELEVENLABS_API_KEY,
  "Content-Type": "application/json",
};

async function uploadBase64ToFirebase(base64Image) {
  try {
    const buffer = Buffer.from(base64Image, "base64");
    const filename = `images/${uuidv4()}.png`;

    const file = bucket.file(filename);

    const metadata = {
      metadata: {
        firebaseStorageDownloadTokens: uuidv4(),
      },
      contentType: "image/png",
      cacheControl: "public, max-age=31536000",
    };

    await file.save(buffer, {
      metadata: metadata,
      public: true, // Make sure the file is publicly accessible
    });

    return `https://firebasestorage.googleapis.com/v0/b/${
      bucket.name
    }/o/${encodeURIComponent(filename)}?alt=media&token=${
      metadata.metadata.firebaseStorageDownloadTokens
    }`;
  } catch (error) {
    console.error("Error uploading to Firebase:", error);
    throw new Error("Failed to upload image to Firebase Storage");
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
      console.error("Error in OpenAI chat completion:", error.response?.data || error.message);
      throw new Error("Failed to communicate with OpenAI.");
    }
  },

  async buildPersonaFromHandles(handles) {
    if (!handles || !Array.isArray(handles)) {
        return [];
    }
  
    const personaPromises = handles
        .filter(h => h.handle) // Only process handles that were provided
        .map(async (h) => {
            const { platform, handle } = h;
            console.log(`Building persona for ${platform} handle: ${handle}`);
            
            // The LLM acts as our researcher. It will perform the search and analysis.
            const researcherSystemPrompt = `You are a world-class investigative researcher and psychologist. Your task is to analyze a person's public online presence based on a social media handle and produce a structured JSON output.
  
            1.  First, conduct a search for the provided handle on the specified platform.
            2.  Analyze the content of the public posts you find.
            3.  Based on your analysis, determine your confidence level (High, Medium, Low) that you have found the correct, active, and singular public profile for this handle.
            4.  Create a concise, one-paragraph psychological summary of the persona projected through these posts. Focus on tone, recurring themes, and communication style.
            5.  Return ONLY a single, minified JSON object with no other text or explanation.
  
            The JSON object must have this exact structure:
            {"platform":"${platform}","handle":"${handle}","confidence":"<High/Medium/Low>","summary":"<Your one-paragraph summary>"}
            `;
            
            const userQuery = `Analyze the ${platform} user with the handle: "${handle}"`;
            const payload = createPayload(researcherSystemPrompt, userQuery); 
  
            try {
                const responseString = await this.chatCompletion(payload);
                // The LLM should return a JSON string. We parse it to ensure it's valid.
                const personaData = JSON.parse(responseString);
                return personaData;
            } catch (error) {
                console.error(`Failed to build persona for ${handle} on ${platform}:`, error);
                // Return a failure object so the frontend knows it didn't work
                return {
                    platform: platform,
                    handle: handle,
                    confidence: "Low",
                    summary: "Could not retrieve or analyze data for this handle."
                };
            }
        });
  
    return Promise.all(personaPromises);
  }
  ,
  async generateImage(prompt) { // For generating new images from scratch
    try {
      const response = await axios.post(
        "https://api.openai.com/v1/images/generations",
        {
          model: "gpt-image-1", // Or "dall-e-3" if preferred for new generations
          prompt,
          n: 1,
          size: "1024x1024",
          response_format: "b64_json", // Request base64 directly
        },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      );

      const base64Image = response.data.data[0]?.b64_json;
      if (!base64Image) throw new Error("No image data from OpenAI generation.");
      
      return await uploadBase64ToFirebase(base64Image); // Upload and return URL
    } catch (error) {
      console.error("Error in OpenAI image generation:", error.response?.data || error.message);
      throw new Error("Failed to generate image with OpenAI.");
    }
  },

  async editImage(base64Image, prompt) { // Replaces generateImageVariation, uses FormData
    try {
      const imageBuffer = Buffer.from(base64Image, 'base64');
      
      const form = new FormData();
      // OpenAI API for edits often prefers/requires PNG.
      form.append('image', imageBuffer, { filename: 'input_image.png', contentType: 'image/png' });
      form.append('prompt', prompt);
      form.append('model', 'gpt-image-1'); // Use gpt-image-1 for advanced edits
      form.append('n', 1);
      form.append('size', '1024x1024'); // Or other supported sizes
      // REMOVED: form.append('response_format', 'b64_json'); // This line caused the error

      const response = await axios.post(
        'https://api.openai.com/v1/images/edits',
        form,
        {
          headers: {
            ...form.getHeaders(), // Axios will set the correct Content-Type for FormData
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          },
        }
      );
  
      // The API should still return b64_json by default or as its primary way for this model/endpoint combo
      const editedBase64 = response.data.data[0]?.b64_json; 
      if (!editedBase64) {
        console.error("OpenAI editImage response did not contain b64_json:", response.data);
        throw new Error('No image data (b64_json) received from OpenAI image edit.');
      }
  
      return editedBase64; // Return raw base64 for further processing or upload by caller
    } catch (error) {
      // Log the full error response if available
      if (error.response) {
        console.error('OpenAI API Error Response:', error.response.data);
      }
      console.error('Error in OpenAI image edit:', error.message);
      throw new Error('Failed to edit image with OpenAI.');
    }
  },
  
  async describeImage(base64) {
    try {
      const response = await axios.post(
        OPENAI_API_ENDPOINT, // Assuming this is the chat completions endpoint for GPT-4o
        {
          model: "gpt-4o",
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "You are an author describing a character inspired by this picture. Describe the image as an a children's cartoon to your illustrator. The background must be pure black. If a description can not be generated, return the word 'error:' with a description of the issue.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: `data:image/png;base64,${base64}`, // Standardize to PNG assumption
                  },
                },
              ],
            },
          ],
          max_tokens: 300 
        },
        {
          headers: OPENAI_HEADERS,
        }
      );

      if (!response.data.choices?.[0]?.message?.content) {
        throw new Error("No content received from OpenAI for image description");
      }

      const content = response.data.choices[0].message.content;
      if (content.toLowerCase().startsWith("error:")) {
        throw new Error(content);
      }

      return content;
    } catch (error) {
      console.error("Error in OpenAI image description:", error.response?.data || error.message);
      throw new Error(error.message || "Failed to describe image with OpenAI.");
    }
  },
};

// ElevenLabs API Calls
const elevenLabs = {
  async synthesizeSpeech(text, voiceEndpoint = ELEVENLABS_API_ENDPOINT) {
    try {
      const response = await axios.post(
        voiceEndpoint,
        {
          text,
          model_id: "eleven_monolingual_v1",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.5, 
            use_speaker_boost: true,
          },
        },
        {
          headers: ELEVENLABS_HEADERS,
          responseType: "arraybuffer",
        }
      );
      return Buffer.from(response.data, "binary");
    } catch (error) {
      console.error("Error in ElevenLabs speech synthesis:", error.response?.data || error.message);
      throw new Error("Failed to communicate with ElevenLabs.");
    }
  },
};

module.exports = {
  openai,
  elevenLabs,
  uploadBase64ToFirebase, // Export for use in server.js
  ELEVENLABS_ENDPOINTS: { 
    Adam: "https://api.elevenlabs.io/v1/text-to-speech/VR6AewLTigWG4xSOukaG", 
    Stav: "https://api.elevenlabs.io/v1/text-to-speech/g5CIjAEEtosuUq4l1xXY", 
    Nick: "https://api.elevenlabs.io/v1/text-to-speech/ErXwobaYiN019P7DETECT", 
    Mike: "https://api.elevenlabs.io/v1/text-to-speech/oWAxZDx7w5VEj9dCyTzz", 
    Piero: "https://api.elevenlabs.io/v1/text-to-speech/5Jt2C5x5iN019P7DETECT", 
    Jarno: "https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN", 
    YarnMan: "https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN",
    Ivan: "https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp",
    Male: "https://api.elevenlabs.io/v1/text-to-speech/VR6AewLTigWG4xSOukaG", 
    Female: "https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM", 
    Donnie: "https://api.elevenlabs.io/v1/text-to-speech/X2295PCUkl7636D0KoSI",
    GBv7mTt0atIp3Br8iCZE: "https://api.elevenlabs.io/v1/text-to-speech/GBv7mTt0atIp3Br8iCZE"
  },
};