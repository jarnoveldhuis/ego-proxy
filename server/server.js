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
let transcriptThreshold = 1000;
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
    fetchProxies([subdomain]).then((proxy) => {
      if (!proxy || proxy.length === 0) {
        console.error("No proxy data found");
        return res.render("create", {
          proxyDomain: proxyDomain,
          progress: progress,
        });
      }
      res.redirect(url + "meet");
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

  // Extract and decode the guest parameter
  const guests = req.query.guest
    ? decodeURIComponent(req.query.guest).split(",")
    : [];

  // Log the guests array
  // console.log("Guests:", guests);

  try {
    const data = await fetchContextAndProxies(siteId, subdomain, guests);
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
    console.log("updatedContextMessages...");
    cleanDataForPublic(data); // Prepare data for public use by removing sensitive info
    console.log("rendering chat");
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
  const {
    question,
    submitAs,
    submitTo,
    transcript,
    siteId,
    hosts,
    training,
    tutorial,
  } = req.body;
  if (!question || !submitTo || !transcript || !siteId) {
    return res.status(400).send({ error: "Missing required fields" });
  }
  const dataForSiteId = globalDataStore[siteId];

  if (!dataForSiteId) {
    return res.status(400).send({ error: "Data not found for siteId" });
  }
  emotions = "Angry, Confused, Joy, Laugh, Sad, Fear, Disgust, Embarassed";
  // Similar:
  // Embarassed, Anger, Disgust
  // Joy
  const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Each line should express one of the following emotions: ${emotions}. Include the relevant emotions in parentheses at the very end of your response. For example:

I'm feeling great today! (Joy):

Do not use any other expressions than the ones listed and do not use any of these emotions twice in a row. \nCharacters: ${globalCast}\n`;
  const proxies = dataForSiteId.proxies;
  const context = dataForSiteId.context;
  const profile = proxies[submitAs] ? proxies[submitAs][siteId] : "";
  currentSpeaker = submitTo;
  previousSpeaker = submitAs;
  const currentProxy = proxies[currentSpeaker] || {};
  voice = ELEVENLABS_API_ENDPOINT;

  if (currentSpeaker in ELEVENLABS_ENDPOINTS) {
    voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
    console.log("Voice:", voice);
  } else if (ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity]) {
    voice = ELEVENLABS_ENDPOINTS[proxies[currentSpeaker].genderIdentity];
  } else {
    console.log("Generic speaker:", currentSpeaker);
    voice = ELEVENLABS_API_ENDPOINT;
  }

  let parts = req.hostname.split(".");
  let subdomain = parts.length > 1 ? parts[0] : "";
  if (!dataForSiteId) {
    return res.status(400).send({ error: "Data not found for siteId" });
  }
  // Attempt to summarize the transcript if conditions are met
  console.log("Transcript length:", transcript.length);
  if (transcript.length > transcriptThreshold && (training || tutorial)) {
    try {
      console.log("Transcript summary conditions met. Summarizing...");
      transcriptSummary = await summarizeTranscript(
        transcript,
        siteId,
        subdomain,
        profile
      );
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
        `${currentProxy.message} This character has just updated it's personality.` ||
        "Default speaker message";

      context.message = `${proxyData.Proxy} has updated itself to use the following personality: "${transcriptSummary}"\n ${proxyData.Proxy} will introduce themself, provide an overview of their personality and keep the conversation flowing with questions.\n`;

      const contextMessage = context.message;

      const systemMessage = `${proxyMessage}\nScene: ${contextMessage}\n`;

      const freshUserMessage = `${userMessage}${context.message}`;
      // Process and send response
      const payload = createPayload(systemMessage, freshUserMessage);
      console.log("Payload:", payload);
      console.log("Getting assistant response...");
      const assistantMessage = await getAssistantResponse(payload);
      // calculateAndLogCost(userMessage, assistantMessage);
      const currentURL = req.protocol + "://" + req.get("host") + "/" + siteId;
      const profileURL = req.protocol + "://" + req.get("host");

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
    const proxyContext = proxies[currentSpeaker][siteId] || "";

    const progress = Math.floor(
      (transcript.length / transcriptThreshold) * 100
    );
    const intelligence =
      siteId === "meet" ? ` Conversation is ` + progress + `% complete.\n` : "";
    const previousProxy = proxies[previousSpeaker] || "";

    if (previousProxy[siteId]) {
      previousProxyProfile =
        " Here is the profile of the person you're speaking to: \n" +
        previousProxy[siteId];
    } else {
      previousProxyProfile = "";
    }

    const systemMessage = `${proxyMessage}${contextMessage}`;

    const payload = createPayload(
      systemMessage + previousProxyProfile,
      userMessage + transcript
    );
    const assistantMessage = await getAssistantResponse(payload);
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

async function summarizeTranscript(transcript, context, user, profile) {
  revise = profile
    ? ` Incorporate details from their previous profile:
  "${profile}".`
    : "";
  if (context === "meet") {
    systemContent = `Use the responses by 'you' in this transcript to create a character portrait in 100 words. Include speech patterns. Do not take everything at face value. Look for clues about unspoken traits like a psycho-analyst. Write the summary in the tone of Alan Watts. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves. Only include the prompt, do not include a line labelling it as a prompt. ${revise}`;
  } else if (context === "interview") {
    systemContent = `Use the responses in this transcript to generate a concise summary of ${user}'s professional experience. Optimize this summary to be used as a ChatGPT system prompt to inform how the character behaves during an interview. Do not use Markdown.${revise}`;
  } else if (context === "dating") {
    systemContent = `Use the responses in this transcript to generate a dating profile for ${user}. Do not use Markdown.${revise}`;
  } else if (context === "debate") {
    systemContent = `Use the responses in this transcript to create a profile of ${user}'s beliefs.  Do not use Markdown.${revise}`;
  }
  console.log("systemContent:", systemContent);
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

// Configure multer for file storage
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// Serve static files from the "uploads" directory
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.post("/create-proxy", upload.single("file"), async (req, res) => {
  const proxyName = req.body.proxyName;
  genderIdentity = req.body.genderIdentity;
  const ethnicity = req.body.ethnicity !== "Other" ? req.body.ethnicity : req.body.otherEthnicity;
  console.log("ethnicity", ethnicity)
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
https://www.google.com/url?sa=i&url=https%3A%2F%2Fwww.interviewmagazine.com%2Fculture%2Fstavros-halkias-on-ozempic-hunter-biden-and-paneras-charged-lemonade&psig=AOvVaw2Qd4vHrcWVwLGhzBEpSJJf&ust=1726088704197000&source=images&cd=vfe&opi=89978449&ved=0CBQQjRxqFwoTCLCIg9ajuYgDFQAAAAAdAAAAABAE
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
// description prompt. Begin with an overall impression. Next include face shape, nose shape, eye color, complexion, hair color/style/length, facial hair, eyebrows, Lips, perceived age, build, and any other relevent details.
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
              text: "You are an author describing a character inspired by this picture. Describe the image as an adult swim cartoon to your illustrator. Do not mention facial expressions. The background must be pure black. If a description can not be generated, return the word 'error:' with a description of the issue. Do not identify the individual.",
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
    if (siteId !== ct) {
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

    // console.log("Updated submitToOptions:", context.submitToOptions);
    const publicProxyNames = await fetchPublicProxyNames(subdomain);
    const yourProxyNames = await fetchYourProxyNames(subdomain);

    const proxyList = [
      ...new Set([
        ...context.submitToOptions,
        ...context.submitAsOptions,
        ...guests,
      ]),
    ];
    const proxies = await fetchProxies(proxyList);
    // const submitAsProxies = await fetchProxies(context.submitAsOptions);
    // const guestProxies = await fetchProxies(guests);

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
      // submitAsProxies: submitAsProxies.reduce((acc, proxy) => {
      //   acc[proxy.fields.Proxy] = proxy.fields;
      //   return acc;
      // }, {}),
      publicProxies: publicProxyNames.reduce((acc, proxy) => {
        acc.push(proxy);
        return acc;
      }, []),
      yourProxies: yourProxyNames.reduce((acc, proxy) => {
        acc.push(proxy);
        return acc;
      }, []),
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

    globalCast = [
      ...new Set([...context.submitToOptions, ...context.submitAsOptions]),
    ].join(", ");
    return data; // Return the data along with any global updates
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
          reject(err); // Handle errors
        } else {
          const publicProxyNames = publicProxies
            .map((proxy) => proxy.fields.Proxy)
            .filter(
              (proxyName) => proxyName.toLowerCase() !== subdomain.toLowerCase()
            );
          resolve(publicProxyNames); // Resolve with the filtered names of public proxies
        }
      });
  });
}

// Function to fetch proxy names associated with the same email as the given siteId
function fetchYourProxyNames(subdomain) {
  return new Promise((resolve, reject) => {
    // First, find the email associated with the given siteId
    base("Proxies")
      .select({
        filterByFormula: `{siteId} = '${subdomain}'`,
        maxRecords: 1,
      })
      .firstPage((err, records) => {
        if (err) {
          return reject(err); // Handle errors
        }
        if (records.length === 0) {
          return resolve([]); // No records found
        }

        const email = records[0].fields.email; // Assuming the email field is named 'Email'

        // Now, find all proxies associated with this email
        base("Proxies")
          .select({
            filterByFormula: `{email} = '${email}'`,
          })
          .all((err, proxies) => {
            if (err) {
              return reject(err); // Handle errors
            }
            const proxyNames = proxies
              .map((proxy) => proxy.fields.Proxy)
              .filter(
                (proxyName) =>
                  proxyName.toLowerCase() !== subdomain.toLowerCase()
              );
            resolve(proxyNames); // Resolve with the filtered names of proxies
          });
      });
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
function updateOptionsWithSubdomain(options = [], subdomain, guests = []) {
  // Ensure options is always an array
  if (!Array.isArray(options)) {
    options = [options]; // Convert to array if it's not
  }
  return [subdomain, ...options, ...guests];
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

  // Exclude any additional elements like color palettes or reference shades.
  let avatarDescription = `Appearance:
  ${photoDescription}

  Style Details: Capture the essence of this description using a Low-Poly children's cartoon style with geometric shapes and flat colors emphasizing a clear, recognizable likeness without detailed textures. Add a subtle psychadelic effect to the image to make it more visually interesting.

  Important:
  - The eyes must be directed straight forward.
  - The background must be pure black.
  - The emotion of the image must be cartoonishly exaggerated and extreme.`;
  console.log("Avatar Description:", avatarDescription);

  domain = req.get("host");

  // Check if the name already exists in the database
  const nameExists = await checkNameExists(proxyName);

  if (nameExists) {
    throw new Error("Name is already in use");
  }

  let emotions = {
    angryUrl: "",
    angryPrompt: "",
    friendlyUrl: "", // Updated 'think' to 'friendly'
    friendlyPrompt: "",
    confusedUrl: "", // Updated 'listen' to 'confused'
    confusedPrompt: "",
    speakUrl: "",
    speakPrompt: "",
    joyUrl: "", // Updated 'joy' to 'joy'
    joyPrompt: "",
    sadUrl: "", // Updated 'smile' to 'sad'
    sadPrompt: "",
    sadnessUrl: "",
    sadnessPrompt: "",
    fearUrl: "",
    fearPrompt: "",
    disgustUrl: "",
    disgustPrompt: "",
    embarassedUrl: "", // Added 'embarassed'
    embarassedPrompt: "",
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
        Math.floor(filledEmotions),
        "of",
        Math.floor(totalLength),
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
    sendProgress(ws);
    console.log("Beginning emotion generation...");

    let emotionInstructions = `Render a ${ethnicity} ${genderIdentity} staring straight ahead against a pure black background in an extreme state of`;

    let speakDescription = `${emotionInstructions} TALKING! MOUTH MUST BE OPEN!`;

    let friendlyDescription = `${emotionInstructions} FRIENDLINESS!`;

    let confusedDescription = `${emotionInstructions} CONFUSION!`;

    let joyDescription = `${emotionInstructions} JOY AND LAUGHTER!`;

    let sadDescription = `${emotionInstructions} DESPAIR!`;

    let disgustedDescription = `${emotionInstructions} DISGUST!`;

    let angryDescription = `${emotionInstructions} ANGER!`;

    let afraidDescription = `${emotionInstructions} FEAR!`;

    let embarassedDescription = `${emotionInstructions} EMBARASSMENT!`;

    let intriguedDescription = `${emotionInstructions} INTRIGUED!`;

    // Prompt Array for Each Emotion
    let subsequentPrompts = [
      `${speakDescription}
      ${avatarDescription}`,
      `${friendlyDescription}
      ${avatarDescription}`,
      `${confusedDescription}
      ${avatarDescription}`,
      `${joyDescription}
      ${avatarDescription}`,
      `${sadDescription}
      ${avatarDescription}`,
      `${disgustedDescription}
      ${avatarDescription}`,
      `${angryDescription}
      ${avatarDescription}`,
      `${afraidDescription}
      ${avatarDescription}`,
      `${embarassedDescription}
      ${avatarDescription}`,
      `${intriguedDescription}
      ${avatarDescription}`,
    ];

    // Response Processing for Emotions
    const processResponse = (response, index) => {
      switch (index) {
        case 0:
          emotions.speakUrl = response.data.data[0].url;
          emotions.speakPrompt = response.data.data[0].revised_prompt;
          break;
        case 1:
          emotions.friendlyUrl = response.data.data[0].url; // Updated to 'friendly'
          emotions.friendlyPrompt = response.data.data[0].revised_prompt;
          break;
        case 2:
          emotions.confusedUrl = response.data.data[0].url; // Updated to 'confused'
          emotions.confusedPrompt = response.data.data[0].revised_prompt;
          break;
        case 3:
          emotions.joyUrl = response.data.data[0].url;
          emotions.joyPrompt = response.data.data[0].revised_prompt;
          break;
        case 4:
          emotions.sadUrl = response.data.data[0].url; // Updated to 'sad'
          emotions.sadPrompt = response.data.data[0].revised_prompt;
          break;
        case 5:
          emotions.disgustUrl = response.data.data[0].url;
          emotions.disgustPrompt = response.data.data[0].revised_prompt;
          break;
        case 6:
          emotions.angryUrl = response.data.data[0].url;
          emotions.angryPrompt = response.data.data[0].revised_prompt;
          break;
        case 7:
          emotions.fearUrl = response.data.data[0].url;
          emotions.fearPrompt = response.data.data[0].revised_prompt;
          break;
        case 8:
          emotions.embarassedUrl = response.data.data[0].url;
          emotions.embarassedPrompt = response.data.data[0].revised_prompt;
          break;
        case 9:
          emotions.intriguedUrl = response.data.data[0].url;
          emotions.intriguedPrompt = response.data.data[0].revised_prompt;
          break;
        default:
          console.warn(`No case for index ${index}`);
      }
    };
    console.log("subsequentPrompts:", subsequentPrompts); 
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
        genderIdentity: genderIdentity,
        speak: [{ url: emotions.speakUrl }],
        friendly: [{ url: emotions.friendlyUrl }],
        confused: [{ url: emotions.confusedUrl }],
        joy: [{ url: emotions.joyUrl }],
        sad: [{ url: emotions.sadUrl }],
        disgust: [{ url: emotions.disgustUrl }],
        fear: [{ url: emotions.fearUrl }],
        angry: [{ url: emotions.angryUrl }],
        embarassed: [{ url: emotions.embarassedUrl }],
        intrigued: [{ url: emotions.intriguedUrl }],
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

  async function sendMail(emotions, proxyEmail, proxyName, domain) {
    return new Promise((resolve, reject) => {
      try {
        console.log("Sending email...");

        const mailOptions = {
          from: `"Ego-Proxy" <${email}>`,
          to: `${proxyEmail}`, // List of recipients
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
            <p>Once trained, you can access its profile <a href='https://${proxyName}.${domain}'>here</a>.
            </p>
          `,
          attachments: [
            {
              filename: "image.jpg",
              path: emotions.joyUrl,
              cid: "image@cid", //same cid value as in the html img src
            },
          ],
        };

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

  // Updated route handler function
  function handleSendMail(req, res) {
    const emotions = req.body.emotions; // Assuming emotions are passed in the request body
    const { proxyEmail, proxyName, domain } = req.body; // Add any other necessary fields

    sendMail(emotions, proxyEmail, proxyName, domain)
      .then((message) => {
        res.status(200).json({ message });
      })
      .catch((error) => {
        res.status(500).json({ message: error.message });
      });
  }

  // Route to send mail
  app.post("/send-mail", handleSendMail);
}
