// 1. IMPORTS AND CONFIGURATIONS

// Core modules
const path = require("path");
const http = require("http");

// Third-party modules
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const axios = require("axios");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const Airtable = require("airtable");
require("dotenv").config();

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

// VARIABLES
const clients = {};
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base("appGJeYbeaiWUaxhe");
const CT = process.env.CT;
let globalDataStore = {};
let gptModel;
let proxyList = [];

// MIDDLEWARE
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../client")));

const TIMEOUT_DURATION = 25000; // 25 seconds (giving some buffer before Heroku's 30s timeout)

app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    res.status(503).render("error", {
      message: "The request timed out. Please try again later.",
      error: { status: 503, stack: "" },
    });
  }, TIMEOUT_DURATION);

  res.on("finish", () => clearTimeout(timeout));
  res.on("close", () => clearTimeout(timeout));

  next();
});

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
  YarnMan: "https://api.elevenlabs.io/v1/text-to-speech/6xnAUTtxFAYoyHtOWgDN",
  Ivan: "https://api.elevenlabs.io/v1/text-to-speech/e3oQ7D1OPPzhbJU50Qxp",
  Male: "https://api.elevenlabs.io/v1/text-to-speech/y1adqrqs4jNaANXsIZnD",
  Female: "https://api.elevenlabs.io/v1/text-to-speech/9iZbnYLpicE89JhjTrR5",
  Donnie: "https://api.elevenlabs.io/v1/text-to-speech/X2295PCUkl7636D0KoSI",
};

// Variables
let currentSpeaker = "";
let voice = "";
const transcriptThreshold = 1500;

// 2. ROUTES AND HANDLERS

// Home Route
app.get("/", async (req, res) => {
  const proxyDomain = req.get("host");
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 ? parts[0] : "";
  let protocol = req.protocol;

  if (req.headers["x-forwarded-proto"]) {
    protocol = req.headers["x-forwarded-proto"].split(",")[0];
  }

  if (process.env.NODE_ENV === "production") {
    protocol = "https";
  }

  const url = protocol + "://" + req.get("host") + req.originalUrl;

  if (subdomain && subdomain !== "ego-proxy") {
    try {
      const proxy = await fetchProxies([subdomain]);
      if (!proxy || proxy.length === 0) {
        console.error("No proxy data found");
        return res.render("create", { proxyDomain });
      }
      res.redirect(url + "meet");
    } catch (error) {
      console.error("Error fetching proxies:", error);
      res.render("create", { proxyDomain });
    }
  } else {
    res.render("create", { proxyDomain });
  }
});

// SiteId Route
app.get("/:siteId", async (req, res) => {
  const siteId = req.params.siteId;

  if (!siteId || ["undefined", "favicon.ico"].includes(siteId.trim())) {
    console.log("Invalid siteId or favicon.ico request");
    return res.status(404).send("Not found");
  }

  const parts = req.hostname.split(".");
  const subdomain =
    parts.length > 1 && parts[0] !== "ego-proxy" ? parts[0] : "";

  if (CT === siteId) {
    gptModel = "gpt-4";
  }

  console.log(`GPT Model: ${gptModel}`);

  const guests = req.query.guest
    ? decodeURIComponent(req.query.guest).split(",")
    : [];

  try {
    const data = await fetchContextAndProxies(siteId, subdomain, guests);
    if (!data) {
      console.log("No matching records found");
      return res.render("create");
    }

    data.transcriptThreshold = transcriptThreshold;
    data.hasShareParam = req.query.hasOwnProperty("share");

    const lowerCaseProxies = Object.keys(data.proxies).reduce((result, key) => {
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
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 ? parts[0] : "";
  const { contentId, content } = req.body;

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
    console.error("Error updating Airtable:", error);
    res
      .status(500)
      .json({ error: `Failed to update due to error: ${error.message}` });
  }
});

// Chat Route
app.post("/ask/", async (req, res) => {
  const {
    question,
    submitAs,
    submitTo,
    transcript,
    siteId,
    guests,
    training,
    tutorial,
  } = req.body;

  // Set a specific timeout for this route
  let routeTimeout = setTimeout(() => {
    if (!res.headersSent) {
      return res.status(503).json({
        error:
          "Request timed out. The server took too long to process your request.",
      });
    }
  }, 25000);

  try {
    if (!question || !submitTo || !transcript || !siteId) {
      return res.status(400).send({ error: "Missing required fields" });
    }

    const dataForSiteId = globalDataStore[siteId];
    if (!dataForSiteId) {
      return res.status(400).send({ error: "Data not found for siteId" });
    }

    const emotions = "Angry, Confused, Laugh, Sad, Fear, Disgust, Embarrassed";
    const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Each line should express one of the following emotions: ${emotions}.\nBegin your response with "${submitTo}:" and include the relevant emotions in parentheses at the very end of your response. For example:\n${submitTo}: I'm feeling great today! (Joy)\nDo not use any other expressions than the ones listed and do not use any of these emotions twice in a row. Never change the casing of the name. `;

    const proxies = dataForSiteId.proxies;
    const context = dataForSiteId.context;
    const profile = proxies[submitAs] ? proxies[submitAs][siteId] : "";
    currentSpeaker = submitTo;
    const currentProxy = proxies[currentSpeaker] || {};
    voice = ELEVENLABS_API_ENDPOINT;

    if (currentSpeaker in ELEVENLABS_ENDPOINTS) {
      voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
      console.log("Voice:", voice);
    } else if (ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity]) {
      voice = ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity];
    } else {
      console.log("Generic speaker:", currentSpeaker);
    }

    const parts = req.hostname.split(".");
    const subdomain = parts.length > 1 ? parts[0] : "";

    console.log("Transcript length:", transcript.length);

    if (transcript.length > transcriptThreshold && (training || tutorial)) {
      try {
        console.log("Transcript summary conditions met. Summarizing...");
        const transcriptSummary = await summarizeTranscript(
          transcript,
          siteId,
          subdomain,
          profile
        );
        console.log("Transcript summarized successfully: ", transcriptSummary);

        let proxyData = await findProxyDataByName(subdomain);

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

        proxyData = await findProxyDataByName(subdomain);
        proxies[proxyData.Proxy].message = proxyData.message;

        const proxyMessage =
          `${currentProxy.message} This character has just updated its personality.` ||
          "Default speaker message";

        context.message = `${proxyData.Proxy} has updated itself to use the following personality: "${transcriptSummary}"\n ${proxyData.Proxy} will introduce themself, provide an overview of their personality and keep the conversation flowing with questions.\n`;

        const systemMessage = `${proxyMessage}\n ${context.message}\n`;

        const freshUserMessage = `${userMessage}${context.message}`;

        const payload = createPayload(systemMessage, freshUserMessage);
        console.log("Training Complete Payload:", payload);
        console.log("Getting assistant response...");
        const assistantMessage = await getAssistantResponse(payload);

        res.send({
          personalityUpdated: true,
          transcriptSummary: transcriptSummary,
          answer: `${submitTo}: Personality updated! (Friendly)`,
        });
      } catch (error) {
        console.error("Error summarizing transcript:", error);
        res.status(500).send({ error: "Failed to summarize transcript" });
      }
    } else {
      const contextMessage =
        dataForSiteId.context.message || "Default general message";
      const proxyMessage = currentProxy.message || "";

      const progress = Math.floor(
        (transcript.length / transcriptThreshold) * 100
      );
      let storyProgress = `\nThe story is now ${progress}% complete. Use the transcript thus far and Joseph Campbells' Hero's journey framework to inform what happens next.\n`;

      const previousProxy = proxies[submitAs] || "";
      const previousProxyProfile = previousProxy[siteId]
        ? " Here is the profile of the person you're speaking to: \n" +
          previousProxy[siteId]
        : "";

      let characters = proxyList.filter(
        (proxy) => proxy.toLowerCase() !== "you"
      );

      let systemMessage = `You are a screenwriter writing the next line of dialogue for one of the following characters: ${characters.join(
        ", "
      )}. Here is a summary of each each character's personality: ${Object.keys(
        proxies
      )
        .map((proxy) => `${proxy}: ${proxies[proxy].message}`)
        .join("\n")}\n ${contextMessage}`;
      const payload = createPayload(
        systemMessage,
        transcript + storyProgress + userMessage
      );
      console.log("Response Payload:", payload);
      const assistantMessage = await getAssistantResponse(payload);
      res.send({ answer: assistantMessage });
    }
    clearTimeout(routeTimeout);
    res.send({ answer: assistantMessage });
  } catch (error) {
    // Clear timeout to prevent double response
    clearTimeout(routeTimeout);
    console.error("Error in /ask route:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your request." });
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
      console.error("Error sending email:", error);
      res
        .status(500)
        .json({ message: "Error sending email", error: error.message });
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

// Configure multer for file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.post("/create-proxy", upload.single("file"), async (req, res) => {
  const { proxyName, genderIdentity, proxyEmail } = req.body;
  const ethnicity =
    req.body.ethnicity !== "Other"
      ? req.body.ethnicity
      : req.body.otherEthnicity;
  // Set a timeout for this route
  let routeTimeout = setTimeout(() => {
    if (!res.headersSent) {
      return res.status(503).json({
        message:
          "Request timed out. The server took too long to process your request.",
      });
    }
  }, 25000);
  try {
    const nameExists = await checkNameExists(proxyName);
    if (nameExists) {
      console.log("Name already exists, sending 409 response");
      return res.status(409).json({ message: "Name is already in use" });
    }

    const base64String = req.file.buffer.toString("base64");
    const photoDescription = await describeImageBase(base64String);

    if (photoDescription.toLowerCase().includes("error")) {
      console.log("Error detected in photo description, sending 400 response");
      return res.status(409).json({
        message: photoDescription + " Please try again with a different photo.",
      });
    }

    const clientId = req.body.clientId;
    const ws = clients[clientId];
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log("WebSocket connection not found, sending 404 response");
      return res
        .status(404)
        .json({ message: "WebSocket connection not found." });
    }

    ws.send(
      JSON.stringify({
        event: "processingStarted",
        message: "Update about your request...",
      })
    );
    clearTimeout(routeTimeout);
    res.status(202).json({
      message: "Processing started, you will be notified upon completion.",
    });

    initiateProxyCreation(req, ws, photoDescription, ethnicity).catch(
      (error) => {
        console.error("Error in background processing:", error);
        ws.send(JSON.stringify({ error: "Error in background processing" }));
      }
    );
  } catch (error) {
    clearTimeout(routeTimeout);

    console.error("Error:", error);
    res.status(500).json({ message: error.message });
  }
});

// WebSocket Connection
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients[clientId] = ws;
  console.log(`New client connected with ID: ${clientId}`);
  ws.send(JSON.stringify({ type: "clientId", clientId }));

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      if (data.event === "ping") {
        ws.send(JSON.stringify({ event: "pong" }));
      }
    } catch (error) {
      console.error("Error parsing WebSocket message:", error);
    }
  });
});

app.use((req, res, next) => {
  res.status(404).render('error', {
    message: 'Page not found',
    error: { status: 404, stack: '' }
  });
});

app.use((err, req, res, next) => {

  console.error(err.stack);
  res.status(err.status || 500);
  res.render('error', {
    message: err.message || 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
});

// Start Server
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

// Set GPT Model based on environment
if (process.env.NODE_ENV === "development") {
  gptModel = "gpt-4o";
} else {
  gptModel = "gpt-4o";
}
console.log("Model:", gptModel);

// 3. FUNCTIONS

// Update Context Messages
function updateContextMessages(
  siteId,
  subdomain,
  lowerCaseProxies,
  data,
  currentSpeaker
) {
  // Update the context message for the meet site if personality exists.
  if (siteId === "meet" && lowerCaseProxies[subdomain].meet !== undefined) {
    globalDataStore[
      siteId
    ].context.message = `Say hello and introduce yourself by your name. Share a detailed overview of yourself. Ask questions to keep a conversation flowing.`;
  }

  // Update the context message for the interview site
  if (siteId == "interview" && lowerCaseProxies[subdomain].meet !== undefined) {
    globalDataStore[
      siteId
    ].context.message = `You are interviewing ${lowerCaseProxies[subdomain].Proxy} for a job.`;
  }

  if (subdomain != "" && subdomain != "ego-proxy") {
    data.meet = lowerCaseProxies[subdomain].meet === undefined;
    data.training = lowerCaseProxies[subdomain][siteId] === undefined;
  } else {
    data.meet = true;
    data.training = true;
  }
}

// Describe Image Base
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
              text: "You are an author describing a character inspired by this picture. Describe the image as an a children's cartoon to your illustrator. Do not mention facial expressions or anything in the backgroud. The background must be pure black. If a description can not be generated, return the word 'error:' with a description of the issue. Do not identify the individual.",
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
async function fetchContextAndProxies(siteId, subdomain, guests) {
  try {
    console.log("Fetching context and proxies for siteId:", siteId);
    const airTableBase = await findBase(siteId);
    if (!airTableBase) {
      throw new Error("Site ID not found in any base");
    }

    const records = await base(airTableBase)
      .select({
        filterByFormula: `{siteId} = '${siteId}'`,
      })
      .firstPage();
    if (records.length === 0) {
      return null;
    }

    const context = records[0].fields;
    if (siteId !== CT) {
      if (
        !context.submitAsOptions.includes("You") &&
        !context.submitAsOptions.includes("Interviewer")
      ) {
        context.submitAsOptions = updateOptionsWithSubdomain(
          context.submitAsOptions,
          subdomain,
          guests
        );
      }
      context.submitToOptions = updateOptionsWithSubdomain(
        context.submitToOptions,
        subdomain,
        guests
      );
    }

    const publicProxyNames = await fetchPublicProxyNames(subdomain);
    const yourProxyNames = await fetchYourProxyNames(subdomain);

    proxyList = [
      ...new Set([
        ...context.submitToOptions,
        ...context.submitAsOptions,
        ...guests,
      ]),
    ];

    const proxies = await fetchProxies(proxyList);

    context.submitToOptions = [
      ...new Set([...context.submitToOptions, ...guests]),
    ];

    context.submitAsOptions = [
      ...new Set([...context.submitAsOptions, ...guests]),
    ];

    const data = {
      context: context,
      proxies: proxies.reduce((acc, proxy) => {
        acc[proxy.fields.Proxy] = proxy.fields;
        return acc;
      }, {}),
      publicProxies: publicProxyNames,
      yourProxies: yourProxyNames,
    };

    context.submitToOptions = context.submitToOptions.map((option) => {
      return (
        proxies.find(
          (proxy) => proxy.fields.Proxy.toLowerCase() === option.toLowerCase()
        )?.fields.Proxy || option
      );
    });

    context.submitAsOptions = context.submitAsOptions.map((option) => {
      return (
        proxies.find(
          (proxy) => proxy.fields.Proxy.toLowerCase() === option.toLowerCase()
        )?.fields.Proxy || option
      );
    });

    globalDataStore[siteId] = JSON.parse(JSON.stringify(data));

    return data;
  } catch (err) {
    throw new Error("Error fetching context and proxies: " + err.message);
  }
}

// Proxies to be shared with the public
function fetchPublicProxyNames(subdomain) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        filterByFormula: `FIND("Yes", {public})`,
      })
      .all((err, publicProxies) => {
        if (err) {
          reject(err);
        } else {
          const publicProxyNames = publicProxies
            .map((proxy) => proxy.fields.Proxy)
            .filter(
              (proxyName) => proxyName.toLowerCase() !== subdomain.toLowerCase()
            );
          resolve(publicProxyNames);
        }
      });
  });
}

// Fetch your proxy names
function fetchYourProxyNames(subdomain) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        filterByFormula: `{siteId} = '${subdomain}'`,
        maxRecords: 1,
      })
      .firstPage((err, records) => {
        if (err) {
          return reject(err);
        }
        if (records.length === 0) {
          return resolve([]);
        }

        const email = records[0].fields.email;

        base("Proxies")
          .select({
            filterByFormula: `{email} = '${email}'`,
          })
          .all((err, proxies) => {
            if (err) {
              return reject(err);
            }
            const proxyNames = proxies
              .map((proxy) => proxy.fields.Proxy)
              .filter(
                (proxyName) =>
                  proxyName.toLowerCase() !== subdomain.toLowerCase()
              );
            resolve(proxyNames);
          });
      });
  });
}

// Find proxy data by name
function findProxyDataByName(proxyName) {
  return new Promise((resolve, reject) => {
    const queryOptions = {
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
          resolve(null);
          return;
        }
        const record = records[0];
        const data = {
          id: record.id,
          message: record.fields.message,
          Proxy: record.fields.Proxy,
        };
        resolve(data);
      });
  });
}

// Fetch all proxies for the siteId and sort
function fetchProxies(submitOptions) {
  return new Promise((resolve, reject) => {
    const formula = submitOptions
      .map((option) => `LOWER({Proxy}) = LOWER('${option}')`)
      .join(", ");

    base("Proxies")
      .select({
        filterByFormula: `OR(${formula})`,
      })
      .firstPage((err, proxies) => {
        if (err) {
          reject(err);
        } else {
          const optionsOrder = new Map();
          submitOptions.forEach((option, index) => {
            optionsOrder.set(option.toLowerCase(), index);
          });

          const sortedProxies = proxies.sort((a, b) => {
            const indexA = optionsOrder.get(a.fields.Proxy.toLowerCase());
            const indexB = optionsOrder.get(b.fields.Proxy.toLowerCase());
            return indexA - indexB;
          });

          resolve(sortedProxies);
        }
      });
  });
}

// Update options with subdomain
function updateOptionsWithSubdomain(options = [], subdomain, guests = []) {
  if (!Array.isArray(options)) {
    options = [options];
  }
  return [subdomain, ...options, ...guests];
}

// Find context base
async function findBase(siteId) {
  console.log("Finding base for siteId:", siteId);
  const basesToCheck = ["Contexts", "Proxies"];
  for (const baseName of basesToCheck) {
    console.log("Checking base:", baseName);
    const records = await base(baseName)
      .select({
        filterByFormula: `{siteId} = '${siteId}'`,
      })
      .firstPage();

    if (records.length > 0) {
      console.log(siteId, "not found in base:", baseName);
      return baseName;
    }
  }
  return null;
}

// Clean data for public
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

// Create Payload for OpenAI
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

// Get Assistant Response from OpenAI
async function getAssistantResponse(payload) {
  try {
    const response = await axios.post(API_ENDPOINT, payload, {
      headers: HEADERS,
    });
    console.log("Data:", response.data);
    return response.data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Error while getting assistant response:", error);
    throw new Error("Failed to communicate with OpenAI.");
  }
}

// Check if Name Exists in Airtable
function checkNameExists(name) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({
        filterByFormula: `{Proxy} = '${name}'`,
      })
      .firstPage((err, records) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(records.length > 0);
      });
  });
}

// Send Mail
async function sendMail(emotions, proxyEmail, proxyName, domain) {
  if (!proxyEmail) {
    console.error("Proxy email is missing");
    return Promise.reject(new Error("Proxy email is missing"));
  }
  return new Promise((resolve, reject) => {
    try {
      console.log("Sending email...");

      const mailOptions = {
        from: `"Ego-Proxy" <${email}>`,
        to: `${proxyEmail}`,
        subject: "Proxy Created: " + proxyName,
        html: `
          <p>Meet your proxy:</p>
          <p>Name: ${proxyName}</p>
          <p>
            <a href='https://${proxyName}.${domain}/meet'>
              <img src="cid:image@cid" style="max-width: 300px;" alt="Proxy Image" />
            </a>
          </p>
          <p><a href='https://${proxyName}.${domain}/meet'>Click here</a> to train your proxy to emulate you.
          </p>
        `,
        attachments: [
          {
            filename: "image.jpg",
            path: emotions.joyUrl,
            cid: "image@cid",
          },
        ],
      };

      console.log("Mail options:", mailOptions);

      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error("Error sending email:", error);
          reject(new Error("Error sending email: " + error.message));
        } else {
          console.log("Email sent: " + info.response);
          resolve("Proxy Created");
        }
      });
    } catch (error) {
      console.error("Error in sendMail function:", error);
      reject(new Error("Error in sendMail function: " + error.message));
    }
  });
}

// Generate Content using OpenAI
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

// Summarize Transcript
async function summarizeTranscript(transcript, context, user, profile) {
  revise = profile
    ? ` Incorporate details from their previous profile:
  "${profile}".`
    : "";
  if (context === "meet") {
    console.log("profile:", profile);
    let person = !profile ? "You" : user;
    console.log("Person:", person);
    systemContent = `Use the responses by '${person}' in this transcript to conduct a profound psychological analysis of the communication transcript. Distill the essence of the individual's personality into a 100-word character portrait that reveals:
Psychological Dimensions:

Core communication archetypes
Emotional landscape and defense mechanisms
Implicit belief systems
Linguistic fingerprints and rhetorical strategies

Analytical Framework:

Decode subtext beyond literal language
Identify underlying motivations and worldview
Extract patterns of thought and expression
Recognize subtle emotional undertones

Persona Generation Guidelines:

Maintain authentic voice and communication rhythm
Reflect nuanced psychological complexity
Preserve individual's unique cognitive and emotional signature
Avoid stereotyping or reductive characterization

System Prompt Construction Criteria:

Create response generation instructions
Define interaction boundaries
Establish consistent personality expression
Capture linguistic and emotional variability

Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves. Only include the prompt, do not include a line labelling it as a prompt. Do not mention name. ${revise}`;
  } else if (context === "interview") {
    systemContent = `Use the responses in this transcript to generate a concise summary of ${user}'s professional experience. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves during an interview. Do not use Markdown.${revise}`;
  } else if (context === "date") {
    systemContent = `Use the responses in this transcript to generate a dating profile for ${user}. Do not use Markdown.${revise}`;
  } else if (context === "debate") {
    systemContent = `Use the responses in this transcript to create a profile of ${user}'s beliefs.  Do not use Markdown.${revise}`;
  } else if (context === "adventure") {
    systemContent = `Use the responses in this transcript to create a profile of ${user}'s adventure style.  Do not use Markdown.${revise}`;
  }
  console.log("systemContent:", systemContent);
  return await generateContent(transcript, context, systemContent);
}

// Initiate Proxy Creation
async function initiateProxyCreation(req, ws, photoDescription, ethnicity) {
  console.log("Creating proxy...");
  const { proxyName, genderIdentity, proxyEmail } = req.body;

  const avatarDescription = `Appearance: ${photoDescription}

Style Details: Capture the essence of this description using a Low-Poly children's cartoon style with geometric shapes and flat colors emphasizing a clear, recognizable likeness without detailed textures. Add a subtle psychedelic effect to the image to make it more visually interesting.

Important:
- The eyes must be directed straight forward.
- The background must be pure black.
- The emotion of the image must be cartoonishly exaggerated and extreme.`;

  const domain = req.get("host");

  const nameExists = await checkNameExists(proxyName);
  if (nameExists) {
    throw new Error("Name is already in use");
  }

  const emotions = {
    angryUrl: "",
    friendlyUrl: "",
    confusedUrl: "",
    speakUrl: "",
    joyUrl: "",
    sadUrl: "",
    disgustUrl: "",
    fearUrl: "",
    embarrassedUrl: "",
    intriguedUrl: "",
  };

  const calculateProgress = () => {
    const totalLength = Object.keys(emotions).length;
    const filledEmotions = Object.values(emotions).filter(
      (url) => url !== ""
    ).length;
    const percentageComplete = Math.floor(
      ((filledEmotions + 6) / (totalLength + 6)) * 100
    );
    console.log(percentageComplete + "% complete");
    return percentageComplete;
  };

  const sendProgress = () => {
    const progress = calculateProgress();
    ws.send(JSON.stringify({ event: "progress", progress }));
    console.log("Progress sent:", progress);
  };

  try {
    const apiEndpoint = "https://api.openai.com/v1/images/generations";
    sendProgress();

    const emotionInstructions = `I am generating images to represent different emotions and facial expressions. Render a ${ethnicity} ${genderIdentity} staring straight ahead against a pure black background in an extreme state of`;

    const emotionDescriptions = [
      `${emotionInstructions} TALKING! MOUTH MUST BE OPEN!`,
      `${emotionInstructions} FRIENDLINESS!`,
      `${emotionInstructions} CONFUSION! SCRATCHING HEAD!`,
      `${emotionInstructions} JOY AND LAUGHTER!`,
      `${emotionInstructions} DESPAIR!`,
      `${emotionInstructions} DISGUST!`,
      `${emotionInstructions} ANGER!`,
      `${emotionInstructions} FEAR!`,
      `${emotionInstructions} EMBARRASSMENT! Must be blushing!`,
      `${emotionInstructions} INTRIGUE! HAND ON THEIR CHIN!`,
    ];

    const prompts = emotionDescriptions.map(
      (desc) => `${desc}\n${avatarDescription}`
    );

    const processResponse = (response, index) => {
      const url = response.data.data[0].url;
      switch (index) {
        case 0:
          emotions.speakUrl = url;
          break;
        case 1:
          emotions.friendlyUrl = url;
          break;
        case 2:
          emotions.confusedUrl = url;
          break;
        case 3:
          emotions.joyUrl = url;
          break;
        case 4:
          emotions.sadUrl = url;
          break;
        case 5:
          emotions.disgustUrl = url;
          break;
        case 6:
          emotions.angryUrl = url;
          break;
        case 7:
          emotions.fearUrl = url;
          break;
        case 8:
          emotions.embarrassedUrl = url;
          break;
        case 9:
          emotions.intriguedUrl = url;
          break;
        default:
          console.warn(`No case for index ${index}`);
      }
    };

    const requests = prompts.map((prompt, index) =>
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
          sendProgress();
        })
        .catch((err) => {
          console.error(
            `Error with axios post for prompt index ${index}:`,
            err
          );
        })
    );

    await Promise.allSettled(requests);

    base("Proxies")
      .create({
        Proxy: proxyName,
        genderIdentity: genderIdentity,
        speak: [{ url: emotions.speakUrl }],
        friendly: [{ url: emotions.friendlyUrl }],
        confused: [{ url: emotions.confusedUrl }],
        joy: [{ url: emotions.joyUrl }],
        sad: [{ url: emotions.sadUrl }],
        disgust: [{ url: emotions.disgustUrl }],
        fear: [{ url: emotions.fearUrl }],
        angry: [{ url: emotions.angryUrl }],
        embarrassed: [{ url: emotions.embarrassedUrl }],
        intrigued: [{ url: emotions.intriguedUrl }],
        imagePrefix: "img/Guest/",
        email: proxyEmail,
      })
      .catch((err) => {
        console.error("Error with base create:", err);
        throw err;
      });
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ event: "complete", proxyName: proxyName }));
    }
    if (proxyEmail) {
      await sendMail(emotions, proxyEmail, proxyName, domain);
    }
    console.log("Successfully created proxy record in Airtable");
  } catch (err) {
    console.error("Error updating Airtable:", err);
    ws.send(JSON.stringify({ error: "Error updating Airtable" }));
    throw new Error("Error updating Airtable");
  }
}
