// 1. IMPORTS AND CONFIGURATIONS
const express = require("express");
const path = require("path");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const http = require("http");
const WebSocket = require("ws");
const axios = require("axios");
const nodemailer = require("nodemailer");
const fs = require("fs");
const sharp = require("sharp");
const potrace = require("potrace");
require("dotenv").config();
const rateLimit = require("express-rate-limit");
const Airtable = require("airtable");

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
const email = process.env.EMAIL_CREDENTIALS.split(":")[0];
const password = process.env.EMAIL_CREDENTIALS.split(":")[1];
const HEADERS = {
  Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
  "Content-Type": "application/json",
};
const ELEVENLABS_HEADERS = {
  "xi-api-key": process.env.ELEVENLABS_API_KEY,
  "Content-Type": "application/json",
};
const clients = {};
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base("appGJeYbeaiWUaxhe");
let globalCast;
let globalDataStore = {};
let subdomain;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../client")));

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
let currentSpeaker = "";
let voice = "";
let transcriptThreshold = 750;
let transcriptSummarized = false;

// 2. ROUTES

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
  let url = `${protocol}://${req.get("host")}${req.originalUrl}`;
  if (subdomain && subdomain !== "ego-proxy") {
    fetchProxyData([subdomain], async (err, proxy) => {
      if (err || !proxy || proxy.length === 0) {
        console.error("Error fetching proxy data or no data found:", err);
        return res.render("create", { proxyDomain, progress });
      }
      res.redirect(`${url}introduction`);
    });
  } else {
    res.render("create", { proxyDomain, progress });
  }
});

// SiteId Route
app.get("/:siteId", async (req, res) => {
  const siteId = req.params.siteId;
  if (
    !siteId ||
    siteId.trim() === "" ||
    siteId === "undefined" ||
    siteId === "favicon.ico"
  ) {
    return res.status(404).send("Not found");
  }
  const parts = req.hostname.split(".");
  subdomain = parts.length > 1 ? parts[0] : "";
  let gptModel = process.env.CT === siteId ? "gpt-4" : "gpt-4";
  if (subdomain && subdomain !== "ego-proxy") {
    console.log("Subdomain:", subdomain);
  } else {
    console.log("No subdomain detected");
  }
  try {
    const data = await fetchContextAndProxies(siteId, subdomain);
    if (!data) {
      return res.render("create");
    }
    data.transcriptThreshold = transcriptThreshold;
    data.hasShareParam = req.query.hasOwnProperty("share");
    let lowerCaseProxies = Object.keys(data.proxies).reduce((result, key) => {
      result[key.toLowerCase()] = data.proxies[key];
      return result;
    }, {});
    updateContextMessages(siteId, subdomain, lowerCaseProxies, data);
    cleanDataForPublic(data);
    res.render("chat", data);
  } catch (err) {
    console.error(err.message);
    res.render("create");
  }
});

// Proxy Update Route
app.post("/update-proxy", async (req, res) => {
  const { contentId, content } = req.body;
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 ? parts[0] : "";
  try {
    const proxyData = await findProxyDataByName(subdomain);
    if (proxyData) {
      const updatedRecord = await base("Proxies").update(proxyData.id, {
        [contentId]: content,
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
    res
      .status(500)
      .json({ error: `Failed to update due to error: ${error.message}` });
  }
});

// Chat Route
app.post("/ask/", async (req, res) => {
  const { question, submitTo, transcript, siteId } = req.body;
  if (!question || !submitTo || !transcript || !siteId) {
    return res.status(400).send({ error: "Missing required fields" });
  }
  const dataForSiteId = globalDataStore[siteId];
  if (!dataForSiteId) {
    return res.status(400).send({ error: "Data not found for siteId" });
  }
  const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Include one of the following emotions in parentheses at the very end of your response: Smile, Frown, Anxious, Surprise, Skeptical, Serious, Laugh. Do not use any other expressions than the ones listed. For example: I'm feeling great today! (Smile):\nCharacters: ${globalCast}\n`;
  const proxies = dataForSiteId.proxies;
  const context = dataForSiteId.context;
  currentSpeaker = submitTo;
  voice = ELEVENLABS_API_ENDPOINT;
  if (currentSpeaker in ELEVENLABS_ENDPOINTS) {
    voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
  } else if (ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity]) {
    voice = ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity];
  }
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 ? parts[0] : "";
  if (
    transcript.length > transcriptThreshold &&
    siteId === "introduction" &&
    proxies[currentSpeaker][siteId] === undefined
  ) {
    try {
      const transcriptSummary = await summarizeTranscript(transcript, siteId);
      transcriptSummarized = true;
      let proxyData = await findProxyDataByName(subdomain);
      if (proxyData) {
        await base("Proxies").update(proxyData.id, {
          [siteId]: transcriptSummary,
        });
      }
      proxyData = await findProxyDataByName(subdomain);
      proxies[proxyData.Proxy].message = proxyData.message;
      context.message = `${proxyData.Proxy} has updated itself to use the following introduction: "${transcriptSummary}"\n ${proxyData.Proxy} will introduce themself, provide an overview of their introduction and keep the conversation flowing with questions.`;
      const payload = createPayload(
        context.message,
        `${userMessage}${context.message}`
      );
      const assistantMessage = await getAssistantResponse(payload);
      res.send({
        personalityUpdated: true,
        transcriptSummary,
        answer: `${submitTo}: Personality updated! (Smile)`,
      });
    } catch (error) {
      res.status(500).send({ error: "Failed to summarize transcript" });
    }
  } else {
    const systemMessage = `${proxies[currentSpeaker].message || ""}${
      dataForSiteId.context.message || ""
    }${proxies[currentSpeaker][siteId] || ""}`;
    const payload = createPayload(systemMessage, userMessage + transcript);
    const assistantMessage = await getAssistantResponse(payload);
    res.send({ answer: assistantMessage });
  }
});

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
      res.status(500).json({ message: "Error sending email" });
    } else {
      res.status(200).json({ message: "Feedback sent successfully" });
    }
  });
});

// Synthesize Route
app.post("/synthesize", apiLimiter, async (req, res) => {
  const { text } = req.body;
  if (!text) {
    return res
      .status(400)
      .send({ error: "Missing text field in request body" });
  }
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
  try {
    const response = await axios.post(voice, data, {
      headers: ELEVENLABS_HEADERS,
      responseType: "arraybuffer",
    });
    res.set("Content-Type", "audio/mpeg");
    res.send(Buffer.from(response.data, "binary"));
  } catch (error) {
    res.status(500).send({ error: "Failed to communicate with ElevenLabs." });
  }
});

// Proxy Creation Route
const storage = multer.memoryStorage();
const upload = multer({ storage });
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.post("/create-proxy", upload.single("file"), async (req, res) => {
  const proxyName = req.body.proxyName;
  const genderIdentity = req.body.genderIdentity;
  const ethnicity = req.body.ethnicity;
  let nameExists = await checkNameExists(proxyName);
  if (nameExists) {
    return res.status(409).json({ message: "Name is already in use" });
  }
  const base64String = req.file.buffer.toString("base64");
  const photoDescription = await describeImageBase(base64String);
  if (photoDescription.toLowerCase().includes("error")) {
    return res
      .status(409)
      .json({
        message: photoDescription + " Please try again with a different photo.",
      });
  }
  const clientId = req.body.clientId;
  const ws = clients[clientId];
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    return res.status(404).json({ message: "WebSocket connection not found." });
  }
  ws.send(
    JSON.stringify({
      event: "processingStarted",
      message: "Update about your request...",
    })
  );
  res
    .status(202)
    .json({
      message: "Processing started, you will be notified upon completion.",
    });
  initiateProxyCreation(req, ws, photoDescription, ethnicity).catch((error) => {
    ws.send(JSON.stringify({ error: "Error in background processing" }));
  });
});

// WebSocket Connection
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients[clientId] = ws;
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

// 3. FUNCTIONS

async function fetchContextAndProxies(siteId, subdomain) {
  try {
    const airTableBase = await findBase(siteId);
    if (!airTableBase) {
      throw new Error("Site ID not found in any base");
    }
    const records = await base(airTableBase)
      .select({ filterByFormula: `{siteId} = '${siteId}'` })
      .firstPage();
    if (records.length === 0) {
      return null;
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
    }
    context.submitToOptions = updateOptionsWithSubdomain(
      context.submitToOptions,
      subdomain
    );
    const proxies = await fetchProxies(context.submitToOptions);
    const submitAsProxies = await fetchProxies(context.submitAsOptions);
    globalDataStore[siteId] = {
      context,
      proxies: convertProxiesToMap(proxies),
      submitAsProxies: convertProxiesToMap(submitAsProxies),
    };
    globalCast = [
      ...new Set([...context.submitToOptions, ...context.submitAsOptions]),
    ].join(", ");
    return globalDataStore[siteId];
  } catch (err) {
    throw new Error("Error fetching context and proxies: " + err.message);
  }
}

async function fetchProxies(submitOptions) {
  const formula = submitOptions
    .map((option) => `LOWER({Proxy}) = LOWER('${option}')`)
    .join(", ");
  const proxies = await base("Proxies")
    .select({ filterByFormula: `OR(${formula})` })
    .firstPage();
  const optionsOrder = new Map(
    submitOptions.map((option, index) => [option.toLowerCase(), index])
  );
  return proxies.sort(
    (a, b) =>
      optionsOrder.get(a.fields.Proxy.toLowerCase()) -
      optionsOrder.get(b.fields.Proxy.toLowerCase())
  );
}

function updateOptionsWithSubdomain(options = [], subdomain) {
  return options.length > 0 ? [subdomain, ...options] : [subdomain];
}

function convertProxiesToMap(proxies) {
  return proxies.reduce((acc, proxy) => {
    acc[proxy.fields.Proxy] = proxy.fields;
    return acc;
  }, {});
}

async function findBase(siteId) {
  const basesToCheck = ["Contexts", "Proxies"];
  for (const baseName of basesToCheck) {
    const records = await base(baseName)
      .select({ filterByFormula: `{siteId} = '${siteId}'` })
      .firstPage();
    if (records.length > 0) {
      return baseName;
    }
  }
  return null;
}

function cleanDataForPublic(data) {
  function deleteProperties(obj) {
    Object.keys(obj).forEach((property) => {
      if (
        property.toLowerCase().includes("message") ||
        property.toLowerCase().includes("description")
      ) {
        delete obj[property];
      } else if (typeof obj[property] === "object" && obj[property] !== null) {
        deleteProperties(obj[property]);
      }
    });
  }
  deleteProperties(data);
  return data;
}

function updateContextMessages(siteId, subdomain, lowerCaseProxies, data) {
  if (
    siteId === "introduction" &&
    lowerCaseProxies[subdomain].introduction !== undefined
  ) {
    globalDataStore[
      siteId
    ].context.message = `Say hello and introduce yourself by your name ${lowerCaseProxies[subdomain].Proxy} and share a detailed overview of yourself. Ask questions to keep a conversation flowing.`;
  }
  if (
    siteId === "interview" &&
    lowerCaseProxies[subdomain].introduction !== undefined
  ) {
    globalDataStore[
      siteId
    ].context.message = `You are interviewing ${lowerCaseProxies[subdomain].Proxy} for a job.`;
  }
  if (subdomain && subdomain !== "ego-proxy") {
    data.introduction = lowerCaseProxies[subdomain].introduction === undefined;
    data.training = lowerCaseProxies[subdomain][siteId] !== undefined;
  } else {
    data.introduction = true;
    data.training = true;
  }
}

async function summarizeTranscript(transcript, context) {
  const payload = {
    model: gptModel,
    messages: [
      {
        role: "system",
        content:
          "Use the responses by 'you' in this transcript to create a character portrait in 100 words. Do not take everything at face value. Look for clues about unspoken traits like a psycho-analyst. You speak like Alan Watts. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves. Only include the prompt, do not include a line labelling it as a prompt.",
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
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    return "Failed to summarize.";
  }
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
    throw new Error("Failed to communicate with OpenAI.");
  }
}

async function findProxyDataByName(proxyName) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        filterByFormula: `LOWER({Proxy})="${proxyName.toLowerCase()}"`,
        maxRecords: 1,
      })
      .firstPage((err, records) => {
        if (err) {
          reject(err);
        } else if (records.length === 0) {
          resolve(null);
        } else {
          resolve({
            id: records[0].id,
            Message: records[0].fields.message,
            Proxy: records[0].fields.Proxy,
          });
        }
      });
  });
}

function fetchProxyData(subdomain, callback) {
  const formula = subdomain
    .map((condition) => `LOWER({Proxy}) = LOWER('${condition}')`)
    .join(", ");
  base("Proxies")
    .select({ filterByFormula: `OR(${formula})` })
    .firstPage((err, records) => {
      if (err) {
        callback(err, null);
      } else {
        callback(null, records[0]?.fields);
      }
    });
}

async function describeImageBase(base64) {
  const response = await axios.post(
    "https://api.openai.com/v1/chat/completions",
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
              image_url: { url: `data:image/jpeg;base64,${base64}` },
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

async function checkNameExists(name) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({ filterByFormula: `{Proxy} = '${name}'` })
      .firstPage((err, records) => {
        if (err) {
          reject(err);
        } else {
          resolve(records.length > 0);
        }
      });
  });
}

async function initiateProxyCreation(req, ws, photoDescription, ethnicity) {
  const { proxyName, genderIdentity, proxyEmail } = req.body;
  let style = `abstract low poly avatar`;
  let styleDetails =
    "The depiction should focus on basic shapes and flat colors. The goal is to create a simple, abstract representation of the subject's emotion. The face should be directed straight forward and have a pure white background.";
  let avatarDescription = `Generate a ${style} for a ${genderIdentity} of ${ethnicity} descent using this description: ${photoDescription} ${styleDetails}`;

  const nameExists = await checkNameExists(proxyName);
  if (nameExists) {
    throw new Error("Name is already in use");
  }

  const emotions = {
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
    const percentageComplete = Math.floor(
      ((filledEmotions + 6) / (totalLength + 6)) * 100
    );
    return percentageComplete;
  };

  const sendProgress = (ws) => {
    const progress = calculateProgress();
    ws.send(JSON.stringify({ event: "progress", progress }));
  };

  const apiEndpoint = "https://api.openai.com/v1/images/generations";
  const subsequentPrompts = [
    `${avatarDescription}`,
    `${avatarDescription} The subject is surprised. Emphasize this in their facial expression: ${surpriseDescription}`,
    `${avatarDescription} The subject is confused. Emphasize this in their facial expression:: ${thinkDescription}`,
    `${avatarDescription} The subject is listening intently. Emphasize this in their facial: ${listenDescription}`,
    `${avatarDescription} The subject is speaking. Emphasize this in their facial expression: ${speakDescription}`,
    `${avatarDescription} The subject is gleeful. Emphasize this in their facial expression: ${laughDescription}`,
    `${avatarDescription} The subject is gleeful. Emphasize this in their facial expression: ${smileDescription}`,
    `${avatarDescription} The subject is sad. Emphasize this in their facial expression: ${frownDescription}`,
    `${avatarDescription} The subject is anxious. Emphasize this in their facial expression: ${anxiousDescription}`,
    `${avatarDescription} The subject is skeptical. Emphasize this in their facial expression: ${skepticalDescription}`,
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

  const requests = subsequentPrompts.map((prompt, index) =>
    axios
      .post(
        apiEndpoint,
        { model: "dall-e-3", prompt, n: 1, size: "1024x1024" },
        { headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` } }
      )
      .then((response) => {
        processResponse(response, index);
        sendProgress(ws);
      })
      .catch((err) => {
        console.error(`Error with axios post for prompt index ${index}:`, err);
      })
  );

  await Promise.allSettled(requests);

  base("Proxies")
    .create({
      Proxy: proxyName,
      avatarDescription,
      genderIdentity,
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
      ws.send(JSON.stringify({ error: "Error updating Airtable" }));
      throw err;
    });

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ event: "complete", proxyName }));
  }

  async function sendMail() {
    const mailOptions = {
      from: `"Ego-Proxy" <${email}>`,
      to: proxyEmail,
      subject: `Proxy Created: ${proxyName}`,
      html: `
        <p>Meet your proxy:</p>
        <p>Name: ${proxyName}</p>
        <p>
          <a href='https://${proxyName}.${req.get("host")}/introduction'>
            <img src="cid:image@cid" style="max-width: 300px;" alt="Proxy Image" />
          </a>
        </p>
        <p><a href='https://${proxyName}.${req.get(
        "host"
      )}/introduction'>Click here</a> to train your proxy to emulate your introduction.</p>
        <p>Once trained, you can access its profile <a href='https://${proxyName}.${req.get(
        "host"
      )}'>here</a>.</p>
      `,
      attachments: [
        {
          filename: "image.jpg",
          path: emotions.initialUrl,
          cid: "image@cid",
        },
      ],
    };

    transporter.sendMail(mailOptions, function (error, info) {
      if (error) {
        res.status(500).json({ message: "Error sending email" });
      } else {
        res.status(200).json({ message: "Proxy Created" });
      }
    });
  }
  sendMail();
}
