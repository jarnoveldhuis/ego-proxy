// 1. IMPORTS AND CONFIGURATIONS
const express = require("express");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");
const nodemailer = require("nodemailer");
// const fs = require("fs");
// const sharp = require("sharp");
const potrace = require("potrace");
require("dotenv").config();
const rateLimit = require("express-rate-limit");
var Airtable = require("airtable");

// Constants
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3001;
const API_ENDPOINT =
  process.env.OPENAI_API_ENDPOINT ||
  "https://api.openai.com/v1/chat/completions";
const ELEVENLABS_API_ENDPOINT =
  process.env.ELEVENLABS_API_ENDPOINT ||
  "https://api.elevenlabs.io/v1/text-to-speech/GBv7mTt0atIp3Br8iCZE";
const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const [email, password] = process.env.EMAIL_CREDENTIALS.split(":");
const HEADERS = {
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  "Content-Type": "application/json",
};
const ELEVENLABS_HEADERS = {
  "xi-api-key": process.env.ELEVENLABS_API_KEY,
  "Content-Type": "application/json",
};
const clients = {};
var base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base("appGJeYbeaiWUaxhe");
const ct = process.env.CT;
let globalCast;
let globalDataStore = {};
let subdomain;
let progress;

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../client")));
// Environment variables and API configuration

// Rate Limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
});

// Email Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: email, pass: password },
});

// Airtable Configuration
Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: AIRTABLE_TOKEN,
});

// ElevenLabs Endpoints
const ELEVENLABS_ENDPOINTS = {
  Adam: "https://api.elevenlabs.io/v1/text-to-speech/lj8oyquj3C1V08Xs4x9f",
  Stav: "https://api.elevenlabs.io/v1/text-to-speech/g11iLvGRfVTIS78ofuHa",
  Nick: "https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp",
  Mike: "https://api.elevenlabs.io/v1/text-to-speech/EL0wUO72Pc3LfZ2jqe9b",
  Piero: "https://api.elevenlabs.io/v1/text-to-speech/lgy8xTZLCdWp5GxhftID",
  Jarno: "https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN",
  Ivan: "https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp",
  Male: "https://api.elevenlabs.io/v1/text-to-speech/y1adqrqs4jNaANXsIZnD",
  Female: "https://api.elevenlabs.io/v1/text-to-speech/9iZbnYLpicE89JhjTrR5",
  Donnie: "https://api.elevenlabs.io/v1/text-to-speech/X2295PCUkl7636D0KoSI",
};

// Variables
let currentSpeaker = ""; // default speaker
let voice = "";
let transcriptThreshold = 750;
let transcriptSummarized = false;

// 2. ROUTES

// ?
const { send } = require("process");
const e = require("express");

// Home Route
app.get("/", async (req, res) => {
  let proxyDomain = req.get("host");
  let parts = req.hostname.split(".");

  subdomain = parts.length > 1 ? parts[0] : "";
  let protocol = process.env.NODE_ENV === "production" ? "https" : req.protocol;
  if (req.headers["x-forwarded-proto"]) {
    protocol = req.headers["x-forwarded-proto"].split(",")[0];
  }

  if (process.env.NODE_ENV === "production") {
    protocol = "https";
  }
  let url = protocol + "://" + req.get("host") + req.originalUrl;
  // Check if the subdomain exists
  if (subdomain != "" && subdomain != "ego-proxy") {
    fetchProxyData([subdomain], async (err, proxy) => {
      if (err || !proxy || proxy.length === 0) {
        console.error("Error fetching proxy data or no data found:", err);
        return res.render("create", {
          proxyDomain: proxyDomain,
          progress: progress,
        });
      }
      res.redirect(url + "introduction");
    });
  } else {
    res.render("create", { proxyDomain: proxyDomain, progress: progress });
  }
});

// SiteId Route
app.get("/:siteId", async (req, res) => {
  const siteIdDecoy = req.params.siteId;
  // Exclude favicon.ico requests
  if (
    !siteIdDecoy ||
    siteIdDecoy.trim() === "" ||
    siteIdDecoy === "undefined" ||
    siteIdDecoy === "favicon.ico"
  ) {
    console.log("No siteId found or favicon.ico request");
    return res.status(404).send("Not found");
  }

  const parts = req.hostname.split(".");
  const siteId = siteIdDecoy;
  let subdomain = "";

  // Check for subdomain
  if (parts.length > 1 && parts[0] !== "ego-proxy") {
    subdomain = parts[0];
  }

  if (process.env.CT === siteId) {
    gptModel = "gpt-4";
  }

  console.log(`GPT Model: ${gptModel}`);

  if (subdomain != "" && subdomain != "ego-proxy") {
    console.log("Subdomain:", subdomain);
  } else {
    console.log("No subdomain detected");
  }

  try {
    const data = await fetchContextAndProxies(siteId, subdomain);
    if (!data) {
      console.log("No matching records found");
      return res.render("create"); // Handle no matching records case
    }
    data.transcriptThreshold = transcriptThreshold;
    data.hasShareParam = req.query.hasOwnProperty("share");

    // Convert the proxies object to lowercase keys
    let lowerCaseProxies = Object.keys(data.proxies).reduce((result, key) => {
      result[key.toLowerCase()] = data.proxies[key];
      return result;
    }, {});

    updateContextMessages(siteId, subdomain, lowerCaseProxies, data);

    cleanDataForPublic(data); // Prepare data for public use by removing sensitive info
    res.render("chat", data); // Render template with cleaned data
  } catch (err) {
    console.error(err.message);
    res.render("create"); // Render create template if there is an error
  }
});

// Proxy Update Route
app.post("/update-proxy", async (req, res) => {
  let parts = req.hostname.split(".");
  let subdomain = parts.length > 1 ? parts[0] : "";
  const { contentId, content } = req.body;
  try {
    const proxyData = await findProxyDataByName(subdomain); // Ensure subdomain is defined
    if (proxyData) {
      const updatedRecord = await base("Proxies").update(proxyData.id, {
        [contentId]: content, // Dynamic field update based on contentId
      });
      res.json({
        success: true,
        message: "Record updated successfully",
        updatedRecord,
      });
    } else {
      throw new Error(`No matching row found for proxyName: ${subdomain}`);
    }
  } catch (error) {
    console.error("Error updating Airtable:", error);
    res
      .status(500)
      .json({ error: `Failed to update due to error: ${error.message}` });
  }
});

// Chat Route
app.post("/ask/", async (req, res) => {
  const { question, submitTo, transcript, siteId, hosts, isTraining } = req.body;
  if (!question || !submitTo || !transcript || !siteId) {
    return res.status(400).send({ error: "Missing required fields" });
  }

  const dataForSiteId = globalDataStore[siteId];
  if (!dataForSiteId) {
    return res.status(400).send({ error: "Data not found for siteId" });
  }
  const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Include one of the following emotions in parentheses at the very end of your response: Smile, Frown, Anxious, Surprise, Skeptical, Serious, Laugh. Do not use any other expressions than the ones listed. Make sure your response reflects the emotion clearly. For example: I'm feeling great today! (Smile):\nCharacters: ${globalCast}\n`;
  const proxies = dataForSiteId.proxies;
  const context = dataForSiteId.context;
  currentSpeaker = submitTo;
  console.log("Current speaker:", currentSpeaker);
  const currentProxy = proxies[currentSpeaker] || {};
  voice = ELEVENLABS_API_ENDPOINT;

  if (currentSpeaker in ELEVENLABS_ENDPOINTS) {
    voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
    console.log("Voice:", voice);
  } else if (ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity]) {
    console.log("Gender speaker:", currentSpeaker);
    voice = ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity];
  } else {
    console.log("Generic speaker:", currentSpeaker);
    voice = ELEVENLABS_API_ENDPOINT;
  }

  let parts = req.hostname.split(".");
  let subdomain = parts.length > 1 ? parts[0] : "";
  console.log("Training:", isTraining);
  if (!dataForSiteId) {
    return res.status(400).send({ error: "Data not found for siteId" });
  }
  // Attempt to summarize the transcript if conditions are met

  if (
    transcript.length > transcriptThreshold && (proxies[currentSpeaker][siteId] === undefined || isTraining)
  ) {
    try {
      console.log("Transcript summary conditions met. Summarizing...");
      transcriptSummary = await summarizeTranscript(transcript, siteId);
      transcriptSummarized = true;
      console.log("Transcript summarized successfully: ", transcriptSummary);

      // Update the database
      console.log("Finding proxy name...");
      let proxyData = await findProxyDataByName(subdomain);

      column = siteId;

      console.log("Updating database with transcript summary...");
      if (proxyData) {
        await base("Proxies").update(proxyData.id, {
          [siteId]: transcriptSummary,
        });
      } else {
        console.error(`No matching row found for proxyName: ${subdomain}`);
        res.send({
          error: `No matching row found for proxyName: ${subdomain}`,
        });
      }
      console.log(
        `Updating local proxyData for " ${subdomain}  data with transcript summary...`
      );
      proxyData = await findProxyDataByName(subdomain);

      // Update the local data store
      proxies[proxyData.Proxy].message = proxyData.message;

      const proxyMessage =
        `${currentProxy.message} This character has just updated it's introduction.` ||
        "Default speaker message";

      context.message = `${proxyData.Proxy} has updated itself to use the following introduction: "${transcriptSummary}"\n ${proxyData.Proxy} will introduce themself, provide an overview of their personality and keep the conversation flowing with questions.`;

      const contextMessage = context.message;

      const systemMessage = `${proxyMessage}\nScene: ${contextMessage}`;

      const freshUserMessage = `${userMessage}${context.message}`;
      // Process and send response
      const payload = createPayload(systemMessage, freshUserMessage);
      // console.log("Payload:", payload);
      console.log("Getting assistant response...");
      const assistantMessage = await getAssistantResponse(payload);
      // calculateAndLogCost(userMessage, assistantMessage);
      const currentURL = req.protocol + "://" + req.get("host") + "/" + siteId;
      const profileURL = req.protocol + "://" + req.get("host");

      res.send({
        personalityUpdated: true,
        transcriptSummary: transcriptSummary,
        answer: `${submitTo}: Personality updated! (Smile)`,
      });
    } catch (error) {
      console.error("Error summarizing transcript:", error);
      res.status(500).send({ error: "Failed to summarize transcript" });
    }
  } else {
    // Handle training process
    const contextMessage =
      dataForSiteId.context.message || "Default general message";
    const proxyMessage = currentProxy.message || "";
    const proxyContext = proxies[currentSpeaker][siteId] || "";
    // console.log("Proxy context:", proxyContext);
    const progress = Math.floor(
      (transcript.length / transcriptThreshold) * 100
    );
    const intelligence =
      siteId === "introduction"
        ? ` Your intelligence is developing with each response. Training is ` +
          progress +
          `% complete.\n`
        : "";
    const systemMessage = `${proxyMessage}${intelligence}${contextMessage}${proxyContext}`;
    const payload = createPayload(systemMessage, userMessage + transcript);
    // console.log("Payload:", payload);

    const assistantMessage = await getAssistantResponse(payload);
    // calculateAndLogCost(userMessage, assistantMessage);
    res.send({ answer: assistantMessage });
  }
});


async function generateContent(transcript, context, systemContent) {
  const payload = {
    model: gptModel,
    messages: [
      {
        role: "system",
        content: systemContent,
      },
      { role: "user", content: transcript },
    ],
    temperature: 1,
    max_tokens: 500,
    top_p: 1,
    frequency_penalty: 0.5,
    presence_penalty: 0,
  };

  try {
    const response = await axios.post(API_ENDPOINT, payload, {
      headers: HEADERS,
    });
    const summary = response.data.choices[0].message.content.trim();
    return summary;
  } catch (error) {
    console.error("Error while generating content:", error);
    return "Failed to generate content.";
  }
}

async function summarizeTranscript(transcript, context) {
  if (context === "introduction") {
    systemContent =
    "Use the responses by 'you' in this transcript to create a character portrait in 100 words. Do not take everything at face value. Look for clues about unspoken traits like a psycho-analyst. Write the summary in the tone of Alan Watts. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves. Only include the prompt, do not include a line labelling it as a prompt.";}
    else if (context === "interview") {
    systemContent = "Use the responses in this transcript to generate a professional experience profile similar in format to a resume.";
  }
    else if (context === "dating") {
    systemContent = "Use the responses in this transcript to generate a dating profile.";
  }
    else if (context === "debate") {
    systemContent = "Use the responses in this transcript to create a profile of this user's beliefs.";
  }
  return await generateContent(transcript, context, systemContent);
}

// Feedback Route
app.post("/send-feedback", (req, res) => {
  const { feedback } = req.body;

  const mailOptions = {
    from: `"Ego-Proxy" <${email}>`,
    to: email,
    subject: "Ego-Proxy Feedback",
    text: `Feedback: ${feedback} \n\n Sent from: ${req.get("host")}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.log(error);
      res.status(500).json({ message: "Error sending email" });
    } else {
      console.log("Email sent: " + info.response);
      res.status(200).json({ message: "Feedback sent successfully" });
    }
  });
});

// Voice Synthesis Route
app.post("/synthesize", apiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res
        .status(400)
        .send({ error: "Missing text field in request body" });
    }

    // Select the ElevenLabs endpoint URL based on the current speaker
    // voice = ELEVENLABS_ENDPOINTS[currentSpeaker]
    console.log("voice:", voice);
    console.log("currentSpeaker:", currentSpeaker);

    const elevenLabsApiEndpoint = voice || ELEVENLABS_API_ENDPOINT;
    const data = {
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    };

    const response = await axios.post(elevenLabsApiEndpoint, data, {
      headers: ELEVENLABS_HEADERS,
      responseType: "arraybuffer",
    });
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(response.data, "binary"));
  } catch (error) {
    console.error("Error:", error);
    res.status(500).send({ error: "Failed to communicate with ElevenLabs." });
  }
});

function updateContextMessages(siteId, subdomain, lowerCaseProxies, data) {
  // Update the context message for the introduction site
  if (
    siteId === "introduction" &&
    lowerCaseProxies[subdomain].introduction !== undefined
  ) {
    globalDataStore[
      siteId
    ].context.message = `Say hello and introduce yourself by your name ${lowerCaseProxies[subdomain].Proxy} and share a detailed overview of yourself. Ask questions to keep a conversation flowing.`;
  }

  // Update the context message for the interview site
  if (
    siteId == "interview" &&
    lowerCaseProxies[subdomain].introduction !== undefined
  ) {
    globalDataStore[
      siteId
    ].context.message = `You are interviewing ${lowerCaseProxies[subdomain].Proxy} for a job.`;
  }

  if (subdomain != "" && subdomain != "ego-proxy") {
    data.introduction = lowerCaseProxies[subdomain].introduction === undefined;
    data.training = lowerCaseProxies[subdomain][siteId] === undefined;
    console.log("training:", data.training);
  } else {
    data.introduction = true;
    data.training = true;
    console.log(
      "Defaulting introduction and training to true due to no subdomain"
    );
  }
}

// Configure multer for file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.post("/create-proxy", upload.single("file"), async (req, res) => {
  const proxyName = req.body.proxyName;
  genderIdentity = req.body.genderIdentity;
  const ethnicity = req.body.ethnicity;

  let nameExists;
  try {
    nameExists = await checkNameExists(proxyName);
    if (nameExists) {
      throw new Error("Name is already in use");
    }
  } catch (error) {
    console.error("Error:", error);
    // Handle the error
  }
  if (nameExists) {
    console.log("Name already exists, sending 409 response");
    return res.status(409).json({ message: "Name is already in use" });
  }

  const base64String = req.file.buffer.toString("base64");
  let photoDescription = await describeImageBase(base64String);

  if (photoDescription.toLowerCase().includes("error")) {
    console.log("Error detected in photo description, sending 400 response");
    res.status(409).json({
      message: photoDescription + " Please try again with a different photo.",
    });
    return;
  }

  const clientId = req.body.clientId;
  const ws = clients[clientId];
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    console.log("WebSocket connection not found, sending 404 response");
    return res.status(404).json({ message: "WebSocket connection not found." });
  }

  ws.send(
    JSON.stringify({
      event: "processingStarted",
      message: "Update about your request...",
    })
  );
  res.status(202).json({
    message: "Processing started, you will be notified upon completion.",
  });

  initiateProxyCreation(req, ws, photoDescription, ethnicity).catch((error) => {
    console.error("Error in background processing:", error);
    ws.send(JSON.stringify({ error: "Error in background processing" }));
  });
});

// WebSocket Connection
wss.on("connection", (ws) => {
  const clientId = uuidv4(); // Generate a new UUID for the client
  // Store the clientId and ws in your tracking object or map
  clients[clientId] = ws;
  console.log(`New client connected with ID: ${clientId}`);

  // Optionally, send the clientId back to the client
  ws.send(JSON.stringify({ type: "clientId", clientId }));

  ws.on("message", (message) => {
    const data = JSON.parse(message);
    if (data.event === "ping") {
      ws.send(JSON.stringify({ event: "pong" }));
    }
  });
});

server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

if (process.env.NODE_ENV === "development") {
  gptModel = "gpt-4o";
} else {
  gptModel = "gpt-4";
}
console.log("Model:", gptModel);

// 3. FUNCTIONS

async function describeImageBase(base64) {
  const apiEndpoint = "https://api.openai.com/v1/chat/completions";
  const response = await axios.post(
    apiEndpoint,
    {
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Describe this fictional face. Include face shape, nose shape, eye color, complexion, hair color/style/length, facial hair, eyebrows, Lips, perceived age, build, and any other relevent details. Do not mention facial expression if possible. Your response will be used to generate an image. If description can not be generated, return the word 'error:' with a description of the issue. Do not identify the individual.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${base64}`,
              },
            },
          ],
        },
      ],
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
    }
  );
  return response.data.choices[0].message.content;
}

// Fetch context and proxies
async function fetchContextAndProxies(siteId, subdomain) {
  try {
    console.log("Fetching context and proxies for siteId:", siteId);
    const airTableBase = await findBase(siteId);
    if (!airTableBase) {
      throw new Error("Site ID not found in any base");
    }
    console.log("Airtable base:", airTableBase);
    const records = await base(airTableBase)
      .select({
        filterByFormula: `{siteId} = '${siteId}'`,
      })
      .firstPage();
    if (records.length === 0) {
      return null; // No records found
    }

    const context = records[0].fields;

    if (
      !context.submitAsOptions.includes("You") &&
      !context.submitAsOptions.includes("Interviewer")
    ) {
      context.submitAsOptions = updateOptionsWithSubdomain(
        context.submitAsOptions,
        subdomain
      );
      console.log("Updated submitAsOptions:", context.submitAsOptions);
    }
    context.submitToOptions = updateOptionsWithSubdomain(
      context.submitToOptions,
      subdomain
    );
    console.log("Updated submitToOptions:", context.submitToOptions);

    const proxies = await fetchProxies(context.submitToOptions);
    const submitAsProxies = await fetchProxies(context.submitAsOptions);
    const publicProxies = await fetchPublicProxies();

    const data = {
      context: context,
      proxies: proxies.reduce((acc, proxy) => {
        acc[proxy.fields.Proxy] = proxy.fields;
        return acc;
      }, {}),
      submitAsProxies: submitAsProxies.reduce((acc, proxy) => {
        acc[proxy.fields.Proxy] = proxy.fields;
        return acc;
      }, {}),
    };

    context.submitToOptions = proxies.map((proxy) => proxy.fields.Proxy);
    context.submitAsOptions = submitAsProxies.map(
      (proxy) => proxy.fields.Proxy
    );

    globalDataStore[siteId] = JSON.parse(JSON.stringify(data));

    globalCast = [
      ...new Set([...context.submitToOptions, ...context.submitAsOptions]),
    ].join(", ");

    return data; // Return the data along with any global updates
  } catch (err) {
    throw new Error("Error fetching context and proxies: " + err.message);
  }
}

// Proxies to be shared with the public
function fetchPublicProxies() {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        filterByFormula: `FIND("Yes", {public})`,
      })
      .all((err, publicProxies) => {
        if (err) {
          reject(err); // Handle errors
        } else {
          const proxies = publicProxies.map((proxy) => ({
            proxy: proxy.fields.Proxy,
            serious: proxy.fields.serious,
          }));
          resolve(proxies); // Resolve with the proxies
        }
      });
  });
}

// Fetch all data  main proxy to render profile.
function fetchProxyData(subdomain, callback) {
  // Constructing the formula based on conditions
  const formula = subdomain
    .map((condition) => `LOWER({Proxy}) = LOWER('${condition}')`)
    .join(", ");

  base("Proxies")
    .select({
      filterByFormula: `OR(${formula})`,
    })
    .firstPage((err, records) => {
      if (err) {
        callback(err, null);
        return;
      }
      // Process and return the first record data
      const proxy = records[0]?.fields;
      callback(null, proxy);
    });
}

// REDUNDAT - Fetch single proxy data by name.
async function findProxyDataByName(proxyName) {
  return new Promise((resolve, reject) => {
    let queryOptions = {
      filterByFormula: `LOWER({Proxy})="${proxyName.toLowerCase()}"`,
      maxRecords: 1,
    };
    base("Proxies")
      .select(queryOptions)
      .firstPage((err, records) => {
        if (err) {
          console.error(err);
          reject(err);
          return;
        }
        if (records.length === 0) {
          console.log("No matching record found");
          resolve(null); // Explicitly resolve to null to indicate no record was found.
          return;
        }
        let record = records[0];
        let data = {
          id: record.id,
          Message: record.fields.message, // Assuming 'Message' is the field name in Airtable
          Proxy: record.fields.Proxy, // Assuming 'Proxy' is another field name
        };
        resolve(data);
      });
  });
}

//Fetch all proxies for the siteId and sort
function fetchProxies(submitOptions) {
  return new Promise((resolve, reject) => {
    // Building the formula correctly
    const formula = submitOptions
      .map((option) => `LOWER({Proxy}) = LOWER('${option}')`)
      .join(", ");

    base("Proxies")
      .select({
        filterByFormula: `OR(${formula})`,
      })
      .firstPage((err, proxies) => {
        if (err) {
          reject(err); // Handle errors
        } else {
          // Create a map of the submitOptions to maintain their order
          const optionsOrder = new Map();
          submitOptions.forEach((option, index) => {
            optionsOrder.set(option.toLowerCase(), index);
          });

          // Sort the proxies based on the original submitOptions order
          const sortedProxies = proxies.sort((a, b) => {
            const indexA = optionsOrder.get(a.fields.Proxy.toLowerCase());
            const indexB = optionsOrder.get(b.fields.Proxy.toLowerCase());
            return indexA - indexB;
          });

          resolve(sortedProxies); // Resolve with the sorted proxies
        }
      });
  });
}

// Add subdomain as submit option
function updateOptionsWithSubdomain(options = [], subdomain) {
  // Ensure options is always an array
  if (!Array.isArray(options)) {
    options = [options]; // Convert to array if it's not
  }
  if (options.length > 0) {
    return [subdomain, ...options];
  }
  return [subdomain];
}

// Find context base
async function findBase(siteId) {
  console.log("Finding base for siteId:", siteId);
  const basesToCheck = ["Contexts", "Proxies"]; // List of bases to check
  for (const baseName of basesToCheck) {
    console.log("Checking base:", baseName);
    const records = await base(baseName)
      .select({
        filterByFormula: `{siteId} = '${siteId}'`,
      })
      .firstPage();

    if (records.length > 0) {
      console.log("Site ID found in base:", baseName);
      return baseName;
    }
  }
  return null; // Return null if siteId is not found in any base
}

function cleanDataForPublic(data) {
  // Remove sensitive properties from the data
  function deleteProperties(obj) {
    Object.keys(obj).forEach((property) => {
      if (
        property.toLowerCase().includes("message") ||
        property.toLowerCase().includes("description")
        // property.toLowerCase().includes("prompt")
      ) {
        delete obj[property]; // Delete the property if it matches the keywords
      } else if (typeof obj[property] === "object" && obj[property] !== null) {
        deleteProperties(obj[property]); // Recursively delete in nested objects
      }
    });
  }

  deleteProperties(data);
  return data;
}

function createPayload(systemMsg, userMsg) {
  return {
    model: gptModel,
    messages: [
      { role: "system", content: systemMsg },
      { role: "user", content: userMsg },
    ],
    temperature: 1,
    max_tokens: 500,
    top_p: 1,
    frequency_penalty: 0.5,
    presence_penalty: 0,
  };
}

async function getAssistantResponse(payload) {
  try {
    const response = await axios.post(API_ENDPOINT, payload, {
      headers: HEADERS,
    });
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error while getting assistant response:", error);
    throw new Error("Failed to communicate with OpenAI.");
  }
}



function checkNameExists(name) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        // Filter the records
        filterByFormula: `{Proxy} = '${name}'`,
      })
      .firstPage((err, records) => {
        if (err) {
          reject(err);
          return;
        }
        // If any records are returned, the name exists
        resolve(records.length > 0);
      });
  });
}

async function initiateProxyCreation(req, ws, photoDescription, ethnicity) {
  console.log("Creating proxy...");
  let { proxyName, genderIdentity, proxyEmail } = req.body;

  // Other possible styles: low poly, Material Design, Polygonal
  // let style = `flat, minimalistic, low poly depiction, abstract, poorly drawn`;
  // The depiction should focus on basic shapes and flat colors. The goal is to create a simple, abstract representation of the subject.
  let style = `abstract low poly avatar`;
  let styleDetails =
    "The depiction should focus on basic shapes and flat colors. The goal is to create a simple, abstract representation of the subject's emotion. The face should be directed straight forward and have a pure white background.";
  // Exclude any additional elements like color palettes or reference shades.
  let avatarDescription = `Generate a ${style} for a ${genderIdentity} of ${ethnicity} descent using this description:
    ${photoDescription}
    ${styleDetails}`;

  domain = req.get("host");

  // Check if the name already exists in the database
  const nameExists = await checkNameExists(proxyName);

  if (nameExists) {
    throw new Error("Name is already in use");
  }

  // Emotions
  let emotions = {
    initialUrl: "",
    initialPrompt: "",
    surpriseUrl: "",
    surprisePrompt: "",
    thinkUrl: "",
    thinkPrompt: "",
    listenUrl: "",
    listenPrompt: "",
    speakUrl: "",
    speakPrompt: "",
    laughUrl: "",
    laughPrompt: "",
    smileUrl: "",
    smilePrompt: "",
    skepticalUrl: "",
    skepticalPrompt: "",
    frownUrl: "",
    frownPrompt: "",
    anxiousUrl: "",
    anxiousPrompt: "",
  };

  const calculateProgress = () => {
    const totalLength = Object.keys(emotions).length;
    const filledEmotions = Object.values(emotions).filter(
      (url) => url !== ""
    ).length;
    if (filledEmotions === 1) {
      console.log("Image Prompt Generated");
    }
    if (filledEmotions > 1) {
      console.log(
        "Images Generated",
        Math.floor(filledEmotions) / 2,
        "of",
        Math.floor(totalLength) / 2,
        "filled."
      );
    }
    const percentageComplete = Math.floor(
      ((filledEmotions + 6) / (totalLength + 6)) * 100
    );
    console.log(percentageComplete + "% complete");
    return percentageComplete;
  };

  const sendProgress = (ws) => {
    const currentTime = new Date().toLocaleTimeString();
    console.log("Current time:", currentTime);
    const progress = calculateProgress();
    ws.send(JSON.stringify({ event: "progress", progress }));
    console.log("Progress sent:", progress);
  };

  try {
    apiEndpoint = "https://api.openai.com/v1/images/generations";
    // let initialImageResponse = await axios
    //   .post(
    //     apiEndpoint,
    //     {
    //       model: "dall-e-3",
    //       // style: natural,
    //       prompt: `${avatarDescription}`,
    //       n: 1,
    //       size: "1024x1024",
    //     },
    //     { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
    //   )
    //   .catch((err) => {
    //     console.error("Error with initial axios post:", err);
    //     throw err;
    //   });
    // emotions.initialUrl = initialImageResponse.data.data[0].url;
    // const revised_prompt = initialImageResponse.data.data[0].revised_prompt;
    // let laughDescription = `Features a wide, open-mouth smile showing teeth, with eyes squinted and crow's feet at the corners. Eyebrows are relaxed. Cheeks are raised, and the face appears vibrant and animated, often with a slight head tilt back if the laughter is hearty.`;
    sendProgress(ws);
    console.log("Beginning emotion generation...");

    let listenDescription = `Eyebrows raised very high and arched, eyes wide and intensely focused forward with pupils dilated. Head tilted forward, neck extended, with one hand thoughtfully posed on the chin creating an expression of keen engagement and alert attentiveness.`;

    let speakDescription = `Mouth wide open in a large oval, as if caught mid-sentence, with the tongue visible inside. Eyebrows arched high, emphasizing vigorous participation. Eyes are wide and focused directly ahead, with a slight glimmer of enthusiasm. Facial muscles are animated, cheeks raised, creating a lively and expressive look.`;

    let thinkDescription = `Face showing exaggerated concentration with eyebrows deeply furrowed and eyes turned sharply to the side. One hand scratching a comically oversized head, fingers splayed. Mouth downturned in a pronounced scowl, lower lip protruding, portraying intense contemplation and bewilderment.`;

    let laughDescription = `Oversized, beaming smile stretching ear-to-ear, showing all teeth, including the molars. Eyes squeezed into thin lines with pronounced crinkles at the corners, creating crow's feet. Eyebrows arched high and curved, forehead smooth, creating a radiantly open and joyful expression. Cheeks are pushed up, adding to the cheerful demeanor.`;

    let smileDescription = `A gentle, closed-lip smile with the corners of the mouth upturned. Eyes softly crinkled at the outer edges, with a relaxed and serene gaze. Eyebrows in a natural, raised position, conveying a friendly and pleasant expression. Cheeks have a lift, adding warmth to the face.`;

    let frownDescription = `Deep frown with heavily furrowed and converging eyebrows, creating deep lines between them. Eyelids drooping significantly, tear filled eyes looking downward. Mouth turned down in a pronounced arc, with the corners pulled down sharply, creating an exaggerated and unmistakable expression of sadness. The chin is wrinkled, adding to the sorrowful look.`;

    let surpriseDescription = `Eyebrows raised to the hairline, eyes bulging like saucers with pupils dilated. Mouth open wide in an exaggerated O-shape. Face captures extreme shock, with a large sweat droplet on the forehead and flushed cheeks, highlighting intense surprise.`;

    let anxiousDescription = `Face etched with overt anxiety, with eyebrows raised. Bulging eyes staring to the side, rimmed by heavy bags and bloodshot. Forehead dripping with sweat. Cheeks red with embarassment. Lips pinched tightly or turned down dramatically, showing tension. Jaw clenched with visible muscle strain, neck tense, illustrating exaggerated stress and alertness.`;

    let skepticalDescription = `One eyebrow arched higher than the other, creating an asymmetrical look. Eyes narrowed with a pronounced side glance, showing suspicion. A smirk bordering on a grimace, with one corner of the mouth raised higher than the other. Cheeks are drawn in, creating subtle lines on the face, conveying skepticism and questioning credibility with a distinctively expressive flair.`;

    let subsequentPrompts = [
      `${avatarDescription}`,
      `${avatarDescription}
      The subject is surprised. Emphasize this in their facial expression: ${surpriseDescription}`,
      `${avatarDescription}
      The subject is confused. Emphasize this in their facial expression:: ${thinkDescription}`,
      `${avatarDescription}
      The subject is listeningin intently. Emphasize this in their facial: ${listenDescription}`,
      `${avatarDescription}
      The subject is speaking. Emphasize this in their facial expression: ${speakDescription}`,
      `${avatarDescription}
      The subject is gleeful. Emphasize this in their facial expression: ${laughDescription}`,
      `${avatarDescription}
      The subject is gleeful. Emphasize this in their facial expression: ${smileDescription}`,
      `${avatarDescription}
      The subject is sad. Emphasize this in their facial expression: ${frownDescription}`,
      `${avatarDescription}
      The subject is anxious. Emphasize this in their facial expression: ${anxiousDescription}`,
      `${avatarDescription}
      The subject is skeptical. Emphasize this in their facial expression: ${skepticalDescription}`,
    ];

    const processResponse = (response, index) => {
      switch (index) {
        case 0:
          emotions.initialUrl = response.data.data[0].url;
          emotions.initialPrompt = response.data.data[0].revised_prompt;
          break;
        case 1:
          emotions.surpriseUrl = response.data.data[0].url;
          emotions.surprisePrompt = response.data.data[0].revised_prompt;
          break;
        case 2:
          emotions.thinkUrl = response.data.data[0].url;
          emotions.thinkPrompt = response.data.data[0].revised_prompt;
          break;
        case 3:
          emotions.listenUrl = response.data.data[0].url;
          emotions.listenPrompt = response.data.data[0].revised_prompt;
          break;
        case 4:
          emotions.speakUrl = response.data.data[0].url;
          emotions.speakPrompt = response.data.data[0].revised_prompt;
          break;
        case 5:
          emotions.laughUrl = response.data.data[0].url;
          emotions.laughPrompt = response.data.data[0].revised_prompt;
          break;
        case 6:
          emotions.smileUrl = response.data.data[0].url;
          emotions.smilePrompt = response.data.data[0].revised_prompt;
          break;
        case 7:
          emotions.frownUrl = response.data.data[0].url;
          emotions.frownPrompt = response.data.data[0].revised_prompt;
          break;
        case 8:
          emotions.anxiousUrl = response.data.data[0].url;
          emotions.anxiousPrompt = response.data.data[0].revised_prompt;
          break;
        case 9:
          emotions.skepticalUrl = response.data.data[0].url;
          emotions.skepticalPrompt = response.data.data[0].revised_prompt;
          break;
        default:
          console.warn(`No case for index ${index}`);
      }
    };

    // Create an array of promises for the axios requests
    const requests = subsequentPrompts.map((prompt, index) =>
      axios
        .post(
          apiEndpoint,
          {
            model: "dall-e-3",
            prompt,
            n: 1,
            size: "1024x1024",
          },
          { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
        )
        .then((response) => {
          processResponse(response, index);
          sendProgress(ws); // Call sendProgress after processing the response
        })
        .catch((err) => {
          console.error(
            `Error with axios post for prompt index ${index}:`,
            err
          );
        })
    );

    // Wait for all requests to complete
    await Promise.allSettled(requests);

    base("Proxies")
      .create({
        Proxy: proxyName,
        avatarDescription: avatarDescription,
        genderIdentity: genderIdentity,
        subsequentPrompt: subsequentPrompts.join("\n"),
        serious: [{ url: emotions.initialUrl }],
        seriousDescription: emotions.initialPrompt,
        surprise: [{ url: emotions.surpriseUrl }],
        surpriseDescription: emotions.surprisePrompt,
        think: [{ url: emotions.thinkUrl }],
        thinkDescription: emotions.thinkPrompt,
        listen: [{ url: emotions.listenUrl }],
        listenDescription: emotions.listenPrompt,
        speak: [{ url: emotions.speakUrl }],
        speakDescription: emotions.speakPrompt,
        laugh: [{ url: emotions.laughUrl }],
        laughDescription: emotions.laughPrompt,
        smile: [{ url: emotions.smileUrl }],
        smileDescription: emotions.smilePrompt,
        frown: [{ url: emotions.frownUrl }],
        frownDescription: emotions.frownPrompt,
        anxious: [{ url: emotions.anxiousUrl }],
        anxiousDescription: emotions.anxiousPrompt,
        skeptical: [{ url: emotions.skepticalUrl }],
        skepticalDescription: emotions.skepticalPrompt,
        imagePrefix: "img/Guest/",
        email: proxyEmail,
      })
      .catch((err) => {
        console.error("Error with base create:", err);
        throw err;
      });

    // Add images to Airtable
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "complete", proxyName: proxyName }));
    }
    console.log("Successfully created proxy record in Airtable");
  } catch (err) {
    console.error("Error updating Airtable:", err);
    ws.send(JSON.stringify({ error: "Error updating Airtable" }));
    throw new Error("Error updating Airtable"); // Rethrow or create a new error
  }

  async function sendMail(emotions) {
    try {
      // const seriousUrl = await getSeriousUrl(proxyName);
      const mailOptions = {
        from: `"Ego-Proxy" <${email}>`,
        to: `${proxyEmail}`, // List of recipients
        subject: "Proxy Created: " + proxyName,
        html: `
        <p>Meet your proxy:</p>
        <p>Name: ${proxyName}</p>
        <p>
          <a href='https://${proxyName}.${domain}/introduction'>
            <img src="cid:image@cid" style="max-width: 300px;" alt="Proxy Image" />
          </a>
        </p>
        <p><a href='https://${proxyName}.${domain}/introduction'>Click here</a> to train your proxy to emulate your introduction.
        </p>
        <p>Once trained, you can access it's profile <a href='https://${proxyName}.${domain}'>here</a>.
        </p>
      `,

        attachments: [
          {
            filename: "image.jpg",
            path: emotions.initialUrl,
            cid: "image@cid", //same cid value as in the html img src
          },
        ],
      };

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.log(error);
          res.status(500).json({ message: "Error sending email" });
        } else {
          console.log("Email sent: " + info.response);
          res.status(200).json({ message: "Proxy Created" });
        }
      });
    } catch (error) {
      console.log(error);
      res.status(500).json({ message: "Error fetching URL" });
    }
  }
  sendMail(emotions);
}
