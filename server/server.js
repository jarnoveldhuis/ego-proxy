// 1. IMPORTS AND CONFIGURATIONS

// Core modules
const path = require("path");
const http = require("http");

// Third-party modules
const express = require("express");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
// axios is used by api.js, not directly needed here unless for other purposes
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const Airtable = require("airtable");

// Import from services/api.js
const { openai, elevenLabs, ELEVENLABS_ENDPOINTS, uploadBase64ToFirebase } = require("./services/api");
require("dotenv").config();

// Constants
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3001;

const AIRTABLE_TOKEN = process.env.AIRTABLE_TOKEN;
const emailCredentials = process.env.EMAIL_CREDENTIALS;
let emailUser, emailPass;
if (emailCredentials) {
  [emailUser, emailPass] = emailCredentials.split(":");
} else {
  console.error("EMAIL_CREDENTIALS not set in .env file. Email functionality will fail.");
  // Provide default or handle error appropriately
  emailUser = "defaultuser@example.com";
  emailPass = "defaultpass";
}


// VARIABLES
const clients = {};
const airtableBaseId = process.env.AIRTABLE_BASE_ID || "appGJeYbeaiWUaxhe"; // Use env var, provide default
const base = new Airtable({ apiKey: AIRTABLE_TOKEN }).base(airtableBaseId);
const CT = process.env.CT;
let globalDataStore = {};
let gptModel = process.env.NODE_ENV === "development" ? "gpt-4o" : "gpt-4o"; // Set model based on env
let proxyList = [];

// MIDDLEWARE
// Increase limits for base64 image uploads and URL encoded data
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));
app.use(express.static(path.join(__dirname, "public"))); // If you have a 'public' folder in 'server'
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views")); // Assuming 'views' is one level up from 'server'
app.use(express.static(path.join(__dirname, "../client"))); // Assuming 'client' is one level up from 'server'

const TIMEOUT_DURATION = 30000; // 30 seconds, adjust as needed

app.use((req, res, next) => {
  const timeout = setTimeout(() => {
    if (!res.headersSent) { // Check if headers already sent
      console.error(`Request timed out for ${req.method} ${req.originalUrl}`);
      res.status(503).render("error", {
        message: "The request timed out. Please try again later.",
        error: { status: 503, stack: "Request timed out" },
      });
    }
  }, TIMEOUT_DURATION);

  res.on("finish", () => clearTimeout(timeout));
  res.on("close", () => clearTimeout(timeout)); // Handle abrupt client disconnects

  next();
});

// Rate Limiter (apply to specific routes if needed, or globally)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Max requests from an IP in windowMs. Adjust as needed.
  standardHeaders: true,
  legacyHeaders: false,
});
// app.use(apiLimiter); // Apply globally or to specific routes

// Email Transporter
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: emailUser, pass: emailPass },
});

// Airtable Configuration
Airtable.configure({
  endpointUrl: "https://api.airtable.com",
  apiKey: AIRTABLE_TOKEN,
});

// Global Variables (scoped where possible, avoid if not necessary)
let currentSpeaker = ""; // Consider if this needs to be global or request-specific
let voice = ""; // Consider if this needs to be global or request-specific
const transcriptThreshold = 1500;

// 2. ROUTES AND HANDLERS

// Home Route (from user's file)
app.get("/", async (req, res) => {
  const proxyDomain = req.get("host");
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 ? parts[0] : "";
  let protocol = req.protocol;

  if (req.headers["x-forwarded-proto"]) {
    protocol = req.headers["x-forwarded-proto"].split(",")[0];
  }

  if (process.env.NODE_ENV === "production" && req.headers["x-forwarded-proto"] !== "https") {
     protocol = "https"; 
  }

  const url = protocol + "://" + req.get("host") + req.originalUrl;

  if (subdomain && subdomain !== "www" && subdomain !== "ego-proxy" && !req.path.startsWith("/public") && !req.path.startsWith("/client")) { 
    try {
      const proxy = await fetchProxies([subdomain]); 
      if (!proxy || proxy.length === 0) {
        console.error("No proxy data found for subdomain:", subdomain);
        return res.render("create", { proxyDomain });
      }
      // Assuming siteId is the same as subdomain for direct proxy access
      res.redirect(`${protocol}://${subdomain}.${req.get("host")}/meet`); 
    } catch (error) {
      console.error("Error fetching proxies for subdomain redirect:", error);
      res.render("create", { proxyDomain });
    }
  } else {
    res.render("create", { proxyDomain });
  }
});

// SiteId Route (from user's file)
app.get("/:siteId", async (req, res) => {
  const siteId = req.params.siteId;

  if (!siteId || ["undefined", "favicon.ico", "client", "public"].includes(siteId.trim())) {
    console.log("Invalid siteId or static asset request in /:siteId");
    return res.status(404).send("Not found");
  }

  const parts = req.hostname.split(".");
  const subdomain =
    parts.length > 1 && parts[0] !== "www" && parts[0] !== "ego-proxy" ? parts[0] : "";

  if (CT === siteId) { 
    gptModel = "gpt-4"; 
  }

  console.log(`GPT Model for /:siteId route: ${gptModel}`);

  const guests = req.query.guest
    ? decodeURIComponent(req.query.guest).split(",")
    : [];

  try {
    const data = await fetchContextAndProxies(siteId, subdomain, guests);
    if (!data) {
      console.log(`No matching records found for siteId: ${siteId}, subdomain: ${subdomain}`);
      return res.render("create", { proxyDomain: req.get("host") });
    }

    data.transcriptThreshold = transcriptThreshold;
    data.hasShareParam = req.query.hasOwnProperty("share");

    if (typeof data.proxies !== 'object' || data.proxies === null) {
        console.error("data.proxies is not an object:", data.proxies);
        data.proxies = {}; 
    }
    
    const lowerCaseProxies = Object.keys(data.proxies).reduce((result, key) => {
      result[key.toLowerCase()] = data.proxies[key];
      return result;
    }, {});

    updateContextMessages(siteId, subdomain, lowerCaseProxies, data); 
    cleanDataForPublic(data); 
    res.render("chat", data);
  } catch (err) {
    console.error(`Error in /:siteId route for ${siteId}:`, err.message);
    res.render("create", { proxyDomain: req.get("host") }); 
  }
});


// Proxy Update Route (from user's file)
app.post("/update-proxy", apiLimiter, async (req, res) => {
  const parts = req.hostname.split(".");
  const subdomain = parts.length > 1 && parts[0] !== "www" && parts[0] !== "ego-proxy" ? parts[0] : "";
  const { contentId, content } = req.body;

  if (!subdomain) {
    return res.status(400).json({ error: "Subdomain could not be determined or is invalid." });
  }
  if (!contentId || !content) {
    return res.status(400).json({ error: "Missing contentId or content in request body."})
  }

  try {
    const proxyData = await findProxyDataByName(subdomain); 
    if (proxyData && proxyData.id) {
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
    console.error("Error updating Airtable in /update-proxy:", error);
    res
      .status(500)
      .json({ error: `Failed to update due to error: ${error.message}` });
  }
});


// Chat Route (from user's file)
app.post("/ask/", apiLimiter, async (req, res) => {
  const {
    question,
    submitAs,
    submitTo,
    transcript,
    siteId,
    training,
    tutorial,
  } = req.body;

  let routeTimeout; 

  try {
    routeTimeout = setTimeout(() => { 
        if (!res.headersSent) {
          console.error("Timeout in /ask route before response sent.");
          return res.status(503).json({
            error: "Request timed out. The server took too long to process your request.",
          });
        }
      }, 28000); 

    if (!question || !submitTo || !transcript || !siteId) {
      clearTimeout(routeTimeout);
      return res.status(400).send({ error: "Missing required fields" });
    }

    const dataForSiteId = globalDataStore[siteId];
    if (!dataForSiteId) {
      clearTimeout(routeTimeout);
      return res.status(400).send({ error: `Data not found for siteId: ${siteId}. Please refresh or check site ID.` });
    }

    const emotions = "Angry, Confused, Laugh, Sad, Fear, Disgust, Embarrassed"; 
    const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Each line should express one of the following emotions: ${emotions}.\nBegin your response with "${submitTo}:" and include the relevant emotions in parentheses at the very end of your response. For example:\n${submitTo}: I'm feeling great today! (Joy)\nDo not use any other expressions than the ones listed and do not use any of these emotions twice in a row. Never change the casing of the name. `;

    const proxies = dataForSiteId.proxies || {};
    const context = dataForSiteId.context || {};
    currentSpeaker = submitTo; 
    const currentProxy = proxies[currentSpeaker] || {};
    
    if (ELEVENLABS_ENDPOINTS[currentSpeaker]) {
      voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
    } else if (currentProxy.genderIdentity && ELEVENLABS_ENDPOINTS[currentProxy.genderIdentity]) {
      voice = ELEVENLABS_ENDPOINTS[currentProxy.genderIdentity];
    } else {
      voice = ELEVENLABS_ENDPOINTS.GBv7mTt0atIp3Br8iCZE || ELEVENLABS_ENDPOINTS.Male; 
    }
    console.log(`Voice selected for ${currentSpeaker}: ${voice}`);


    if (transcript.length > transcriptThreshold && (training || tutorial)) {
      console.log("Transcript summary conditions met. Summarizing...");
      const transcriptSummary = await summarizeTranscript( 
        transcript,
        siteId, 
        currentSpeaker,
        proxies[currentSpeaker]?.[siteId] 
      );
      console.log("Transcript summarized successfully: ", transcriptSummary);

      let proxyDataToUpdate = await findProxyDataByName(currentSpeaker);

      if (proxyDataToUpdate && proxyDataToUpdate.id) {
        await base("Proxies").update(proxyDataToUpdate.id, {
          [siteId]: transcriptSummary, 
        });
        if(proxies[currentSpeaker]) proxies[currentSpeaker][siteId] = transcriptSummary;

      } else {
        console.error(`No matching Airtable row found for proxyName: ${currentSpeaker} to update summary.`);
      }
      
      clearTimeout(routeTimeout);
      return res.send({
        personalityUpdated: true,
        transcriptSummary: transcriptSummary,
        answer: `${submitTo}: My personality profile has been updated based on our conversation! (Friendly)`,
      });

    } else { 
      const contextMessage = context.message || "Default general context message";
      const proxyPersonalProfile = currentProxy[siteId] || currentProxy.message || "I am a helpful assistant.";

      const progress = Math.floor((transcript.length / transcriptThreshold) * 100);
      let storyProgress = `\nThe story is now ${progress}% complete. Use the transcript thus far and Joseph Campbells' Hero's journey framework to inform what happens next.\n`;
      
      let charactersInScene = proxyList.filter(proxy => proxy && proxy.toLowerCase() !== "you" && proxy.toLowerCase() !== "interviewer");

      let systemMessage = `You are a screenwriter writing the next line of dialogue for ${currentSpeaker}. Your personality is: "${proxyPersonalProfile}". The overall context is: "${contextMessage}". Characters in the scene: ${charactersInScene.join(", ")}. Their personalities are: ${Object.entries(proxies)
        .filter(([name]) => charactersInScene.includes(name))
        .map(([name, details]) => `${name}: ${details[siteId] || details.message || 'Default personality'}`)
        .join("\n")}`;
      
      const payload = createPayload( 
        systemMessage,
        transcript + storyProgress + userMessage
      );
      // console.log("Response Payload for /ask:", payload.messages[0].content, payload.messages[1].content);
      const assistantMessage = await getAssistantResponse(payload); 
      clearTimeout(routeTimeout);
      res.send({ answer: assistantMessage });
    }
  } catch (error) {
    if(routeTimeout) clearTimeout(routeTimeout); 
    console.error("Error in /ask route:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your /ask request." });
  }
});


// Feedback Route (from user's file)
app.post("/send-feedback", apiLimiter, (req, res) => {
  const { feedback } = req.body;
  if (!feedback) return res.status(400).json({ message: "Feedback content is missing." });

  const mailOptions = {
    from: `"Ego-Proxy Feedback" <${emailUser}>`, 
    to: emailUser, 
    subject: "Ego-Proxy Feedback Received",
    text: `Feedback: ${feedback} \n\nSent from host: ${req.get("host")}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.error("Error sending feedback email:", error);
      res
        .status(500)
        .json({ message: "Error sending feedback email", error: error.message });
    } else {
      console.log("Feedback email sent: " + info.response);
      res.status(200).json({ message: "Feedback sent successfully" });
    }
  });
});


// Voice Synthesis Route (from user's file)
app.post("/synthesize", apiLimiter, async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res
        .status(400)
        .send({ error: "Missing text field in request body" });
    }

    console.log("Synthesizing speech for:", text.substring(0, 50) + "...");
    console.log("Using voice ID for synthesis:", voice); 

    const audioBuffer = await elevenLabs.synthesizeSpeech(text, voice);
    res.set("Content-Type", "audio/mpeg");
    res.send(audioBuffer);
  } catch (error) {
    console.error("Error in /synthesize route:", error.message);
    res.status(500).send({ error: "Failed to synthesize speech with ElevenLabs." });
  }
});

const storage = multer.memoryStorage();
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 20 * 1024 * 1024 } 
});


app.post("/create-proxy", upload.single("file"), async (req, res) => {
  const { proxyName, genderIdentity, proxyEmail, clientId } = req.body; 
  const ethnicity =
    req.body.ethnicity !== "Other"
      ? req.body.ethnicity
      : req.body.otherEthnicity;

  let routeHttpTimeout; 
  
  try {
    routeHttpTimeout = setTimeout(() => { 
        if (!res.headersSent) {
          console.error("Timeout in /create-proxy before initial response.");
          return res.status(503).json({
            message: "Request timed out waiting for initial processing acknowledgement.",
          });
        }
      }, 28000); 

    if (!req.file) {
      clearTimeout(routeHttpTimeout);
      return res.status(400).json({ message: "No image file uploaded." });
    }
     if (!proxyName || !genderIdentity || !ethnicity ) {
      clearTimeout(routeHttpTimeout);
      return res.status(400).json({ message: "Missing required fields: proxyName, genderIdentity, or ethnicity." });
    }

    const nameExists = await checkNameExists(proxyName); 
    if (nameExists) {
      clearTimeout(routeHttpTimeout);
      console.log(`Proxy name "${proxyName}" already exists.`);
      return res.status(409).json({ message: "Name is already in use. Please choose a different name." });
    }
    
    const ws = clients[clientId];
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      clearTimeout(routeHttpTimeout);
      console.log(`WebSocket connection not found or not open for clientId: ${clientId}`);
      return res
        .status(404) 
        .json({ message: "WebSocket connection not found or not open. Please refresh and try again." });
    }

    clearTimeout(routeHttpTimeout); 
    res.status(202).json({ 
      message: "Processing started. You will be notified via WebSocket about the progress.",
    });

    initiateProxyCreation(req, ws, ethnicity, genderIdentity, proxyName, proxyEmail)
      .catch((error) => { 
        console.error("Error during background proxy creation process:", error);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "error", event: "proxyCreationFailedCritical", message: error.message || "A critical error occurred during background proxy creation." }));
        }
      });

  } catch (error) { 
    if (routeHttpTimeout) clearTimeout(routeHttpTimeout);
    console.error("Error in /create-proxy route handler:", error);
    if (!res.headersSent) {
        res.status(500).json({ message: error.message || "An unexpected error occurred." });
    }
  }
});


// WebSocket Connection (from user's file, slightly modified)
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients[clientId] = ws;
  console.log(`New client connected with ID: ${clientId}`);
  ws.send(JSON.stringify({ type: "clientId", clientId })); 

  ws.on("message", (message) => {
    try {
      let parsedMessage;
      if (typeof message === 'string') {
        parsedMessage = JSON.parse(message);
      } else if (Buffer.isBuffer(message)) {
        parsedMessage = JSON.parse(message.toString());
      } else {
        console.warn("Received WebSocket message in unexpected format:", message);
        return;
      }
      
      if (parsedMessage.type === "ping") { 
        ws.send(JSON.stringify({ type: "pong" }));
      }
    } catch (error) {
      console.error("Error parsing WebSocket message or unexpected format:", message, error);
    }
  });

  ws.on("close", () => {
    delete clients[clientId];
    console.log(`Client ${clientId} disconnected`);
  });

  ws.on("error", (error) => {
    console.error(`WebSocket error for client ${clientId}:`, error);
    delete clients[clientId];
  });
});

app.use((req, res, next) => {
  res.status(404).render("error", {
    message: "Page not found. We looked everywhere!",
    error: { status: 404, stack: `Route: ${req.originalUrl}` },
  });
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err.stack);
  res.status(err.status || 500);
  res.render("error", {
    message: err.message || "Oops! Something went terribly wrong.",
    error: process.env.NODE_ENV === "development" ? err : { status: err.status || 500 },
  });
});


// Start Server
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Current GPT Model: ${gptModel}`); 
});

// 3. FUNCTIONS (definitions for functions called in routes)

function updateContextMessages(siteId, subdomain, lowerCaseProxies, data) {
    if (!globalDataStore[siteId]) globalDataStore[siteId] = JSON.parse(JSON.stringify(data)); 

    const currentProxyData = lowerCaseProxies[subdomain.toLowerCase()];

    if (siteId === "meet" && currentProxyData && typeof currentProxyData.meet !== "undefined") {
        globalDataStore[siteId].context.message = `Say hello and introduce yourself by your name, ${currentProxyData.Proxy || subdomain}. Share a detailed overview of yourself. Ask questions to keep a conversation flowing.`;
    } else if (siteId === "interview" && currentProxyData && typeof currentProxyData.meet !== "undefined") {
        globalDataStore[siteId].context.message = `You are interviewing ${currentProxyData.Proxy || subdomain} for a job.`;
    }

    if (subdomain && subdomain !== "" && subdomain !== "www" && subdomain !== "ego-proxy") {
        data.meet = currentProxyData ? typeof currentProxyData.meet === "undefined" : true;
        data.training = currentProxyData ? typeof currentProxyData[siteId] === "undefined" : true;
    } else {
        data.meet = true;
        data.training = true;
    }
}

async function fetchContextAndProxies(siteId, subdomain, guests) {
  try {
    console.log(`Workspaceing context and proxies for siteId: "${siteId}", subdomain: "${subdomain}"`);
    const airTableBaseName = await findBase(siteId); 
    if (!airTableBaseName) {
      if (subdomain) {
        console.log(`SiteId "${siteId}" not in Contexts, attempting to treat as proxy name for subdomain "${subdomain}"`);
        const directProxyData = await fetchProxies([subdomain]);
        if (directProxyData && directProxyData.length > 0) {
            const proxyMap = directProxyData.reduce((acc, proxy) => {
                if (proxy.fields && proxy.fields.Proxy) acc[proxy.fields.Proxy] = proxy.fields;
                return acc;
            }, {});
            const data = {
                context: { siteId: siteId, submitAsOptions: [subdomain], submitToOptions: [subdomain], message: `Chatting with ${subdomain}` },
                proxies: proxyMap,
                publicProxies: [],
                yourProxies: [subdomain]
            };
            globalDataStore[siteId] = JSON.parse(JSON.stringify(data));
            return data;
        } else {
             console.error(`Neither context for siteId "${siteId}" nor proxy for subdomain "${subdomain}" found.`);
             return null; 
        }
      } else {
        console.error(`Site ID "${siteId}" not found in any context base and no subdomain provided.`);
        return null; 
      }
    }

    const records = await base(airTableBaseName)
      .select({ filterByFormula: `{siteId} = '${siteId}'` })
      .firstPage();
      
    if (records.length === 0) {
      console.log(`No context records found for siteId "${siteId}" in table "${airTableBaseName}".`);
      return null;
    }

    const context = records[0].fields;
    context.submitAsOptions = context.submitAsOptions || [];
    context.submitToOptions = context.submitToOptions || [];

    if (siteId !== CT) { 
        context.submitAsOptions = updateOptionsWithSubdomain(context.submitAsOptions, subdomain, guests);
        context.submitToOptions = updateOptionsWithSubdomain(context.submitToOptions, subdomain, guests);
    }

    const publicProxyNames = await fetchPublicProxyNames(subdomain); 
    const yourProxyNames = await fetchYourProxyNames(subdomain);   

    proxyList = [...new Set([...context.submitToOptions, ...context.submitAsOptions, ...guests])].filter(Boolean);

    const fetchedProxies = await fetchProxies(proxyList); 

    const proxiesMap = fetchedProxies.reduce((acc, proxy) => {
        if (proxy.fields && proxy.fields.Proxy) {
            acc[proxy.fields.Proxy] = proxy.fields; 
        }
        return acc;
    }, {});

    const normalizeOption = (option) => {
        const foundProxy = fetchedProxies.find(p => p.fields.Proxy && p.fields.Proxy.toLowerCase() === option.toLowerCase());
        return foundProxy ? foundProxy.fields.Proxy : option;
    };

    context.submitToOptions = [...new Set([...context.submitToOptions, ...guests])].map(normalizeOption).filter(Boolean);
    context.submitAsOptions = [...new Set([...context.submitAsOptions, ...guests])].map(normalizeOption).filter(Boolean);

    const data = {
      context: context,
      proxies: proxiesMap,
      publicProxies: publicProxyNames,
      yourProxies: yourProxyNames,
    };
    
    if (!globalDataStore[siteId]) { 
        globalDataStore[siteId] = {};
    }
    globalDataStore[siteId] = JSON.parse(JSON.stringify(data)); 

    return data;
  } catch (err) {
    console.error("Detailed error fetching context and proxies: ", err);
    throw new Error("Error fetching context and proxies: " + err.message);
  }
}

function fetchPublicProxyNames(subdomain) {
  return new Promise((resolve, reject) => {
    base("Proxies")
      .select({ filterByFormula: `FIND("Yes", {public})` })
      .all((err, publicProxies) => {
        if (err) {
          console.error("Error fetching public proxies:", err);
          reject(err);
        } else {
          const publicProxyNames = publicProxies
            .map((proxy) => proxy.fields.Proxy)
            .filter(proxyName => proxyName && subdomain && proxyName.toLowerCase() !== subdomain.toLowerCase());
          resolve(publicProxyNames);
        }
      });
  });
}

function fetchYourProxyNames(subdomain) {
  return new Promise((resolve, reject) => {
    if (!subdomain) return resolve([]); 
    base("Proxies")
      .select({ filterByFormula: `LOWER({siteId}) = LOWER('${subdomain}')`, maxRecords: 1 }) 
      .firstPage((err, records) => {
        if (err) { console.error("Error fetching initial proxy for email:", err); return reject(err); }
        if (records.length === 0 || !records[0].fields.email) return resolve([]);

        const email = records[0].fields.email;
        
        base("Proxies")
          .select({ filterByFormula: `{email} = '${email}'`})
          .all((err, proxies) => {
            if (err) { console.error("Error fetching proxies by email:", err); return reject(err); }
            const proxyNames = proxies
              .map((proxy) => proxy.fields.Proxy)
              .filter(proxyName => proxyName && proxyName.toLowerCase() !== subdomain.toLowerCase());
            resolve(proxyNames);
          });
      });
  });
}

function findProxyDataByName(proxyName) {
  return new Promise((resolve, reject) => {
    if (!proxyName || typeof proxyName !== 'string') return resolve(null); 
    const sanitizedProxyName = proxyName.replace(/"/g, '\\"');
    const queryOptions = {
      filterByFormula: `LOWER({Proxy}) = LOWER("${sanitizedProxyName}")`, 
      maxRecords: 1,
    };
    base("Proxies")
      .select(queryOptions)
      .firstPage((err, records) => {
        if (err) {
          console.error("Airtable select error in findProxyDataByName:", err);
          reject(err);
          return;
        }
        if (records.length === 0) {
          console.log(`No matching record found for proxyName: "${proxyName}"`);
          resolve(null);
          return;
        }
        const record = records[0];
        const data = {
          id: record.id,
          message: record.fields.message || "", 
          Proxy: record.fields.Proxy,
          ...(record.fields.siteId && { [record.fields.siteId]: record.fields[record.fields.siteId] || "" })
        };
        resolve(data);
      });
  });
}

function fetchProxies(submitOptions) {
    return new Promise((resolve, reject) => {
        if (!submitOptions || submitOptions.length === 0) {
            return resolve([]);
        }
        const sanitizedOptions = submitOptions.map(option => typeof option === 'string' ? option.replace(/'/g, "\\'") : '');

        const formula = sanitizedOptions
            .filter(Boolean) 
            .map(option => `LOWER({Proxy}) = LOWER('${option}')`)
            .join(", ");

        if (!formula) return resolve([]); 

        base("Proxies")
            .select({ filterByFormula: `OR(${formula})` })
            .all((err, proxies) => { 
                if (err) {
                    console.error("Error fetching proxies in fetchProxies:", err);
                    reject(err);
                } else {
                    const optionsOrder = new Map();
                    sanitizedOptions.forEach((option, index) => { 
                        optionsOrder.set(option.toLowerCase(), index);
                    });

                    const sortedProxies = proxies.sort((a, b) => {
                        const nameA = a.fields.Proxy ? a.fields.Proxy.toLowerCase() : "";
                        const nameB = b.fields.Proxy ? b.fields.Proxy.toLowerCase() : "";
                        const indexA = optionsOrder.get(nameA);
                        const indexB = optionsOrder.get(nameB);

                        if (indexA === undefined && indexB === undefined) return 0;
                        if (indexA === undefined) return 1; 
                        if (indexB === undefined) return -1;
                        return indexA - indexB;
                    });
                    resolve(sortedProxies);
                }
            });
    });
}

function updateOptionsWithSubdomain(options = [], subdomain, guests = []) {
  if (!Array.isArray(options)) options = [options].filter(Boolean); 
  if (!Array.isArray(guests)) guests = [guests].filter(Boolean);
  
  let updatedOptions = [];
  if (subdomain && typeof subdomain === 'string' && subdomain.trim() !== "") updatedOptions.push(subdomain);
  
  updatedOptions = [...updatedOptions, ...options, ...guests];
  return [...new Set(updatedOptions)].filter(Boolean); 
}

async function findBase(siteId) {
  if (!siteId || typeof siteId !== 'string') {
      console.log("findBase called with invalid siteId.");
      return null;
  }
  console.log("Finding base for siteId:", siteId);
  const basesToCheck = ["Contexts"]; 
  for (const baseName of basesToCheck) {
    try {
        const records = await base(baseName)
            .select({ filterByFormula: `{siteId} = '${siteId.replace(/'/g, "\\'")}'`, maxRecords: 1 }) 
            .firstPage();
        if (records.length > 0) {
            console.log(`SiteId "${siteId}" found in base: "${baseName}"`);
            return baseName; 
        }
    } catch (error) {
        console.error(`Error checking base "${baseName}" for siteId "${siteId}":`, error);
    }
  }
  console.log(`SiteId "${siteId}" not found in any pre-defined context bases.`);
  return null; 
}


function cleanDataForPublic(data) {
  if (typeof data !== 'object' || data === null) return data;
  let cleanedData = JSON.parse(JSON.stringify(data)); 
  function deleteSensitiveProperties(obj) {
    if (typeof obj !== 'object' || obj === null) return;
    for (const property in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, property)) {
        const sensitiveKeywords = ["message", "description", "email", "token", "key", "password", "secret"];
        if (sensitiveKeywords.some(keyword => property.toLowerCase().includes(keyword))) {
          delete obj[property];
        } else if (typeof obj[property] === "object") {
          deleteSensitiveProperties(obj[property]); 
        }
      }
    }
  }
  deleteSensitiveProperties(cleanedData);
  return cleanedData;
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
  return await openai.chatCompletion(payload); 
}

function checkNameExists(name) {
  return new Promise((resolve, reject) => {
    if (!name || typeof name !== 'string') return resolve(false); 
    const sanitizedName = name.replace(/"/g, '\\"');
    base("Proxies")
      .select({ filterByFormula: `LOWER({Proxy}) = LOWER("${sanitizedName}")`, maxRecords: 1 })
      .firstPage((err, records) => {
        if (err) { console.error("Error in checkNameExists:", err); reject(err); return; }
        resolve(records.length > 0);
      });
  });
}

async function sendMail(generatedUrls, proxyEmail, proxyName, domain) {
  if (!proxyEmail) {
    console.error("Proxy email is missing for sendMail");
    return Promise.reject(new Error("Proxy email is missing. Cannot send confirmation."));
  }
  if (!generatedUrls || !generatedUrls.joy) { 
    console.error("Joy URL is missing in generatedUrls for sendMail");
    return Promise.reject(new Error("Required image URL (joy) for email is missing."));
  }

  return new Promise((resolve, reject) => {
    try {
      console.log(`Preparing to send proxy creation email to: ${proxyEmail}`);
      const mailOptions = {
        from: `"Ego-Proxy" <${emailUser}>`, 
        to: proxyEmail,
        subject: "Your Ego-Proxy is Ready: " + proxyName,
        html: `
          <p>Meet your new Ego-Proxy:</p>
          <p>Name: ${proxyName}</p>
          <p>
            <a href='https://${proxyName}.${domain}/meet'>
              <img src="${generatedUrls.joy}" style="max-width: 300px; border: 1px solid #ddd;" alt="${proxyName} - Joyful Expression" />
            </a>
          </p>
          <p><a href='https://${proxyName}.${domain}/meet'>Click here</a> to meet and further train your proxy to emulate you.
          </p>
          <p>Best,<br/>The Ego-Proxy Team</p>
        `,
      };
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error("Error sending email:", error);
          reject(new Error("Error sending email: " + error.message));
        } else {
          console.log("Confirmation email sent successfully to " + proxyEmail + ": " + info.response);
          resolve("Proxy creation email sent.");
        }
      });
    } catch (error) {
      console.error("Critical error in sendMail function structure:", error);
      reject(new Error("Critical error in sendMail function structure: " + error.message));
    }
  });
}

async function generateContent(transcript, context, systemContent) { 
  const payload = createPayload(systemContent, transcript); 
  try {
    console.log("Generating content with system prompt:", systemContent.substring(0,100) + "...");
    return await openai.chatCompletion(payload);
  } catch (error) {
    console.error("Error while generating content via openai.chatCompletion:", error);
    return "Failed to generate content due to an internal error."; 
  }
}

async function summarizeTranscript(transcript, siteId, user, profile) { 
  let systemContent = ""; 
  let revise = profile ? ` Incorporate details from their previous profile: "${profile}".` : "";

  if (siteId === "meet") {
    let person = !profile ? "You" : user;
    systemContent = `Use the responses by '${person}' in this transcript to conduct a profound psychological analysis of the communication transcript. Distill the essence of the individual's personality into a 100-word character portrait that reveals:
Psychological Dimensions: Core communication archetypes, Emotional landscape and defense mechanisms, Implicit belief systems, Linguistic fingerprints and rhetorical strategies.
Analytical Framework: Decode subtext beyond literal language, Identify underlying motivations and worldview, Extract patterns of thought and expression, Recognize subtle emotional undertones.
Persona Generation Guidelines: Maintain authentic voice and communication rhythm, Reflect nuanced psychological complexity, Preserve individual's unique cognitive and emotional signature, Avoid stereotyping or reductive characterization.
System Prompt Construction Criteria: Create response generation instructions, Define interaction boundaries, Establish consistent personality expression, Capture linguistic and emotional variability.
Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves. Only include the prompt, do not include a line labelling it as a prompt. Do not mention name. ${revise}`;
  } else if (siteId === "interview") {
    systemContent = `Use the responses in this transcript to generate a concise summary of ${user}'s professional experience. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves during an interview. Do not use Markdown.${revise}`;
  } else if (siteId === "date") {
    systemContent = `Use the responses in this transcript to generate a dating profile for ${user}. Do not use Markdown.${revise}`;
  } else if (siteId === "debate") {
    systemContent = `Use the responses in this transcript to create a profile of ${user}'s beliefs.  Do not use Markdown.${revise}`;
  } else if (siteId === "adventure") {
    systemContent = `Use the responses in this transcript to create a profile of ${user}'s adventure style.  Do not use Markdown.${revise}`;
  } else {
    systemContent = `Summarize the personality of ${user} based on this transcript. ${revise}`;
  }
  return await generateContent(transcript, siteId, systemContent); 
}

// Updated initiateProxyCreation for CONCURRENT emotion image generation
async function initiateProxyCreation(req, ws, ethnicity, genderIdentity, proxyName, proxyEmail) {
  console.log(`Initiating proxy creation for: ${proxyName}, Ethnicity: ${ethnicity}, Gender: ${genderIdentity}`);
  const domain = req.get("host");

  const emotionsToGenerate = {
    speak: "friendliness with mouth open.",
    friendly: "friendliness with mouth closed.",
    confused: "confusion.",
    joy: "joyous LAUGHTER!",
    sad: "sadness.",
    disgust: "disgust.",
    angry: "anger.",
    fear: "fear.",
    embarrassed: "embarrassment.", // Matched user's input
    intrigued: "engagement and curiosity", // Matched user's input, corrected spelling
  };
  const generatedEmotionUrls = { 
    speak: null, friendly: null, confused: null, joy: null, sad: null,
    disgust: null, angry: null, fear: null, embarrassed: null, intrigued: null
  };

  const totalSteps = 1 + Object.keys(emotionsToGenerate).length + 1 + (proxyEmail ? 1 : 0);
  let completedSteps = 0;

  const sendProgress = (stepMessage) => {
    completedSteps++;
    const currentProgressSteps = Math.min(completedSteps, totalSteps);
    const percentageComplete = Math.floor((currentProgressSteps / totalSteps) * 100);
    
    console.log(`Proxy Creation Progress for ${proxyName}: ${percentageComplete}% (${stepMessage})`);
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "progress", 
        event: "progress", // Matched user's frontend expectation
        percentage: percentageComplete, 
        message: stepMessage, 
        step: currentProgressSteps,
        totalSteps: totalSteps 
      }));
    }
  };

  try {
    ws.send(JSON.stringify({ type: "info", event: "proxyCreationStarted", message: `Starting image generation for ${proxyName}...` }));
    
    const baseImageBuffer = req.file.buffer;
    const uploadedImageBase64 = baseImageBuffer.toString("base64");

    const baseStyleDefinition = `Style: Low-Poly children's cartoon with geometric shapes and flat colors, emphasizing a clear, recognizable likeness of a ${ethnicity} ${genderIdentity} without detailed textures. Add a subtle psychedelic effect. The eyes must be directed straight forward. The background must be pure black. The overall emotion and expression should be exaggerated in a cartoonish way.`;
    const neutralStylePrompt = `A neutral facial expression. ${baseStyleDefinition}`;
    
    console.log(`Generating styled base image for ${proxyName} with prompt: "${neutralStylePrompt.substring(0,100)}..."`);
    sendProgress("Applying base style to your image...");
    const styledBaseImageBase64 = await openai.editImage(uploadedImageBase64, neutralStylePrompt);

    // CONCURRENTLY generate emotional variations
    console.log(`Starting concurrent generation of emotional variations for ${proxyName}...`);
    ws.send(JSON.stringify({ type: "info", event: "emotionGenerationBatchStart", message: "Generating all emotional expressions..." }));

    const emotionEditPromises = Object.entries(emotionsToGenerate).map(async ([emotionKey, emotionDescription]) => {
      const emotionSpecificPrompt = `The character should be expressing ${emotionDescription}. ${baseStyleDefinition}`;
      console.log(`  [Starting] Generation for ${emotionKey} for ${proxyName}`);
      try {
        const finalEmotionImageBase64 = await openai.editImage(styledBaseImageBase64, emotionSpecificPrompt);
        console.log(emotionSpecificPrompt)
        const url = await uploadBase64ToFirebase(finalEmotionImageBase64);
        console.log(`  [Completed] ${emotionKey} for ${proxyName} - URL: ${url ? 'OK' : 'Failed Upload'}`);
        sendProgress(`Generated ${emotionKey} expression`);
        return { emotionKey, url, success: true };
      } catch (error) {
        console.error(`  [Failed] Generation for ${emotionKey} for ${proxyName}:`, error.message);
        sendProgress(`Failed to generate ${emotionKey} expression`);
        return { emotionKey, url: null, success: false, error: error.message };
      }
    });

    const results = await Promise.allSettled(emotionEditPromises);

    results.forEach(result => {
      if (result.status === 'fulfilled' && result.value.success) {
        generatedEmotionUrls[result.value.emotionKey] = result.value.url;
      } else if (result.status === 'fulfilled' && !result.value.success) {
        console.error(`Fulfilled but failed task for ${result.value.emotionKey}: ${result.value.error}`);
      } else if (result.status === 'rejected') {
        console.error(`An unexpected error occurred in an emotion generation promise (rejected):`, result.reason);
      }
    });
    
    console.log(`All emotional image generation tasks attempted for ${proxyName}. Preparing to save to Airtable...`);
    sendProgress("Saving proxy details to Airtable...");
    
    await base("Proxies").create({
        "Proxy": proxyName,
        "genderIdentity": genderIdentity,
        // "ethnicity": ethnicity, // User's snippet for Airtable create did not include ethnicity
        "email": proxyEmail,
        "imagePrefix": `img/Guest/${proxyName}/`,
        "speak": generatedEmotionUrls.speak ? [{ url: generatedEmotionUrls.speak }] : undefined,
        "friendly": generatedEmotionUrls.friendly ? [{ url: generatedEmotionUrls.friendly }] : undefined,
        "confused": generatedEmotionUrls.confused ? [{ url: generatedEmotionUrls.confused }] : undefined,
        "joy": generatedEmotionUrls.joy ? [{ url: generatedEmotionUrls.joy }] : undefined,
        "sad": generatedEmotionUrls.sad ? [{ url: generatedEmotionUrls.sad }] : undefined,
        "disgust": generatedEmotionUrls.disgust ? [{ url: generatedEmotionUrls.disgust }] : undefined,
        "fear": generatedEmotionUrls.fear ? [{ url: generatedEmotionUrls.fear }] : undefined,
        "angry": generatedEmotionUrls.angry ? [{ url: generatedEmotionUrls.angry }] : undefined,
        "embarrassed": generatedEmotionUrls.embarrassed ? [{ url: generatedEmotionUrls.embarrassed }] : undefined,
        "intrigued": generatedEmotionUrls.intrigued ? [{ url: generatedEmotionUrls.intrigued }] : undefined,
        // "siteId": proxyName, // User's snippet for Airtable create did not include siteId
      })
      .catch((err) => {
        console.error("Error directly from Airtable base.create() during record creation:", err);
        let newError = new Error(`Airtable create failed directly. Status: ${err.statusCode || 'N/A'}. Message: ${err.message || 'No specific error message.'}. Type: ${err.error || 'N/A'}`);
        newError.statusCode = err.statusCode;
        newError.type = err.error; 
        newError.originalError = err; 
        throw newError; 
      });

    console.log(`Successfully created proxy record in Airtable for ${proxyName}`);
    
    if (proxyEmail && generatedEmotionUrls.joy) {
      sendProgress("Sending confirmation email...");
      console.log(`Sending confirmation email to ${proxyEmail} for ${proxyName}...`);
      await sendMail(generatedEmotionUrls, proxyEmail, proxyName, domain);
    } else {
      if (!proxyEmail) console.log("No email provided, skipping confirmation email.");
      if (!generatedEmotionUrls.joy) console.log("Joy URL missing, cannot send image in email.");
    }
    
    if (ws.readyState === WebSocket.OPEN) {
      const finalPercentage = 100; // Assuming all steps accounted for should lead to 100%
       ws.send(JSON.stringify({ 
           type: "progress", 
           event: "progress", // Use "progress" as per user's frontend code
           percentage: finalPercentage, 
           message: "All steps completed.", 
           step: totalSteps, // Send final step count
           totalSteps: totalSteps 
       }));
      ws.send(JSON.stringify({ 
        type: "success", // Changed from "complete" to "success" for consistency with other type messages
        event: "proxyCreated", // Keep "proxyCreated" as a specific event for success
        proxyName: proxyName, 
        domain: domain, 
        message: "Proxy created successfully! You can now meet your proxy.", 
        data: { proxyName, domain, email: proxyEmail, urls: generatedEmotionUrls } 
      }));
    }

  } catch (err) { 
    console.error(`Critical error during initiateProxyCreation for ${proxyName}:`);
    if (err && typeof err === 'object') {
        console.error("Error properties:", Object.getOwnPropertyNames(err));
        console.error("Error (JSON stringified with properties):", JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    } else {
        console.error("Error object (raw):", err);
    }
    if (err && err.stack) console.error("Stack trace:", err.stack);
    else console.error("No stack trace. Error toString():", err ? err.toString() : "Error was undefined or null");

    if (ws.readyState === WebSocket.OPEN) {
      const errorMessage = (err && err.message) ? err.message : "An undefined error occurred during proxy creation.";
      let errorDetails = err ? (err.details || JSON.stringify(err, Object.getOwnPropertyNames(err))) : "Error object was undefined";
       if (err && err.originalError && err.originalError.message) { 
          errorDetails = `Original Airtable Error: ${err.originalError.message} (Status: ${err.originalError.statusCode || 'N/A'}, Type: ${err.originalError.error || 'N/A'})`;
      } else if (err && err.error && err.message) { 
          errorDetails = `Airtable Error: ${err.type || err.error} - ${err.message} (Status: ${err.statusCode || 'N/A'})`;
      }

      ws.send(JSON.stringify({ 
          type: "error", 
          event: "proxyCreationFailedFull", 
          message: `Failed to create proxy. ${errorMessage}`,
          details: errorDetails 
      }));
    }
  }
}