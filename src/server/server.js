// 1. IMPORTS AND CONFIGURATIONS

const express = require("express");
const session = require("express-session");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const { db, auth: adminAuth } = require("./services/firebase");
const {
  openai,
  elevenLabs,
  ELEVENLABS_ENDPOINTS,
  uploadBase64ToFirebase,
} = require("./services/api");
require("dotenv").config();
const path = require("path");
const http = require("http");

// Constants
const app = express();
app.set('trust proxy', 1); 
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const port = process.env.PORT || 3001;

const emailCredentials = process.env.EMAIL_CREDENTIALS;
let emailUser, emailPass;
if (emailCredentials) {
  [emailUser, emailPass] = emailCredentials.split(":");
} else {
  console.error(
    "EMAIL_CREDENTIALS not set in .env file. Email functionality will fail."
  );
  emailUser = "defaultuser@example.com";
  emailPass = "defaultpass";
}

const clients = {};
const CT = process.env.CT;
let globalDataStore = {};
let gptModel = process.env.NODE_ENV === "development" ? "gpt-4o" : "gpt-4o";
let proxyList = [];


console.log(`SERVER_STARTUP: Current NODE_ENV: '${process.env.NODE_ENV}'`);
const IN_PROD = process.env.NODE_ENV === "production";
console.log(`SERVER_STARTUP: IN_PROD evaluated to: ${IN_PROD}`);
console.log(`SERVER_STARTUP: DEV_HOST is: '${process.env.DEV_HOST}'`);
const calculatedDomain = IN_PROD ? ".ego-proxy.com" : (process.env.DEV_HOST === 'localhost' ? 'localhost' : '.myapp.local');
console.log(`SERVER_STARTUP: Calculated cookie domain will be: '${calculatedDomain}'`);

app.use(
  session({
    secret: process.env.BACKEND_SESSION_KEY || "BACKEND_SESSION_KEY",
    resave: false, // Don't save session if unmodified
    saveUninitialized: false, // Don't create session until something stored
    cookie: {
      httpOnly: true, // Prevents client-side JS from accessing the cookie
      secure: IN_PROD, // True in production (requires HTTPS)
      // For cross-subdomain cookies:
      // Production: '.yourdomain.com' (e.g., '.ego-proxy.com')
      // Development: 'localhost' might work for localhost and its direct subdomains on some browsers.
      // For more robust local cross-subdomain testing, consider editing your /etc/hosts file
      // to use something like 'local.app' and 'jarno.local.app' mapped to 127.0.0.1,
      // then set domain: '.local.app'.
      domain: IN_PROD ? ".ego-proxy.com" : ".myapp.local", // Adjust for your actual production domain
      path: "/", // Cookie available across all paths
      maxAge: 1000 * 60 * 60 * 24 * 14, // e.g., 14 days
    },
    // For production, you'd add a persistent store here, e.g.:
    // store: new RedisStore({ client: redisClient }),
  })
);

app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ limit: "25mb", extended: true }));

app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    req.appUser = {
      // Use a distinct name like appUser to avoid collision with Firebase req.user
      uid: req.session.userId,
      email: req.session.email,
      isLoggedIn: true,
    };
  } else {
    req.appUser = { isLoggedIn: false };
  }
  next();
});

app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "../views"));
app.use(express.static(path.join(__dirname, "../client")));

const TIMEOUT_DURATION = 30000;
app.use((req, res, next) => {
  if (req.session && req.session.userId) {
    // You can attach a simplified user object to req if needed for templates/other middleware
    // For now, just knowing req.session.userId exists is enough for basic auth check
  }
  const timeout = setTimeout(() => {
    if (!res.headersSent) {
      console.error(`Request timed out for ${req.method} ${req.originalUrl}`);
      res.status(503).render("error", {
        message: "The request timed out. Please try again later.",
        error: { status: 503, stack: "Request timed out" },
      });
    }
  }, TIMEOUT_DURATION);
  res.on("finish", () => clearTimeout(timeout));
  res.on("close", () => clearTimeout(timeout));
  next();
});

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: emailUser, pass: emailPass },
});

let currentSpeaker = "";
let voice = "";
const transcriptThreshold = 1500;

// Middleware to verify Firebase ID token
async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    // Don't block GET page loads, req.firebaseUser will be undefined
    return next();
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    req.firebaseUser = await adminAuth.verifyIdToken(idToken); // Use req.firebaseUser to avoid clash
    console.log(
      `Firebase Token verified for user: ${req.firebaseUser.uid} for path ${req.path}`
    );
  } catch (error) {
    console.error(
      "Error verifying Firebase ID token for path " + req.path + ":",
      error.message
    );
    // Don't block, req.firebaseUser will be undefined
  }
  return next();
}

async function ensureAuthenticatedSession(req, res, next) {
  if (req.session && req.session.userId) {
    // Attach a user object to req for easier access in route handlers
    // This req.user will be different from the one set by verifyFirebaseToken
    req.userFromSession = {
      uid: req.session.userId,
      email: req.session.email,
      // Add other details if stored in session
    };
    return next();
  }
  res.status(401).json({
    success: false,
    error: "Unauthorized: User not logged in via session.",
  });
}

// 2. ROUTES AND HANDLERS

app.post("/api/auth/session-login", async (req, res) => {
  const { firebaseIdToken } = req.body;
  if (!firebaseIdToken) {
    return res
      .status(400)
      .json({ success: false, error: "Firebase ID token is required." });
  }
  try {
    const decodedToken = await adminAuth.verifyIdToken(firebaseIdToken);
    req.session.userId = decodedToken.uid;
    req.session.email = decodedToken.email;
    console.log(
      `Session established for user: ${decodedToken.uid}, email: ${decodedToken.email}`
    );
    res.status(200).json({
      success: true,
      message: "Session established.",
      user: { userId: decodedToken.uid, email: decodedToken.email },
    });
  } catch (error) {
    console.error(
      "Error verifying Firebase ID token or establishing session:",
      error
    );
    res.status(401).json({
      success: false,
      error: "Invalid Firebase token or failed to establish session.",
    });
  }
});

app.get("/api/auth/status", (req, res) => {
  if (req.appUser && req.appUser.isLoggedIn) {
    res.status(200).json({
      success: true,
      loggedIn: true,
      user: { userId: req.appUser.uid, email: req.appUser.email },
    });
  } else {
    res.status(200).json({ success: true, loggedIn: false, user: null });
  }
});

app.post("/api/auth/session-logout", (req, res) => {
  const userId = req.session.userId;
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res
        .status(500)
        .json({ success: false, error: "Failed to logout." });
    }
    // The cookie name 'connect.sid' is the default for express-session.
    // If you configured a different name in session options, use that name here.
    res.clearCookie("connect.sid", {
      domain: IN_PROD
        ? ".ego-proxy.com"
        : process.env.DEV_COOKIE_DOMAIN || "localhost",
      path: "/",
    });
    console.log(`Session destroyed for user: ${userId || "unknown"}`);
    res
      .status(200)
      .json({ success: true, message: "Logged out successfully." });
  });
});

// 3. APPLICATION ROUTES

// Home Route (keep existing)
app.get("/", async (req, res) => {
  const fullRequestHost = req.get("host");
  const currentHostname = req.hostname;
  const parts = currentHostname.split(".");
  const accessedSubdomain =
    parts.length > 1 &&
    parts[0].toLowerCase() !== "www" &&
    parts[0].toLowerCase() !== "ego-proxy"
      ? parts[0]
      : null;

  let protocol = req.protocol;
  if (req.headers["x-forwarded-proto"]) {
    protocol = req.headers["x-forwarded-proto"].split(",")[0];
  }
  if (IN_PROD && protocol !== "https") {
    protocol = "https";
  }
  // Pass appUser (derived from session) to the template
  const templateData = {
    proxyDomain: fullRequestHost,
    appUser: req.appUser, // Contains { uid, email, isLoggedIn } or { isLoggedIn: false }
  };

  if (
    accessedSubdomain &&
    !req.path.startsWith("/public") &&
    !req.path.startsWith("/client")
  ) {
    // Existing logic to redirect if a specific proxy subdomain is accessed
    try {
      console.log(
        `Home route: Proxy subdomain '${accessedSubdomain}' detected. Attempting redirect.`
      );
      const proxiesData = await fetchProxies([accessedSubdomain]);
      if (!proxiesData || proxiesData.length === 0) {
        console.warn(
          `No proxy data found for subdomain: ${accessedSubdomain}. Rendering create page as fallback.`
        );
        return res.render("create", {
          proxyDomain: fullRequestHost,
          user: req.user,
        });
      }
      const proxyDetails = proxiesData[0];
      const proxyTargetName = proxyDetails.Proxy;
      let redirectBase = fullRequestHost;
      if (fullRequestHost.startsWith(accessedSubdomain + ".")) {
        redirectBase = fullRequestHost.substring(accessedSubdomain.length + 1);
      }
      return res.redirect(
        `${protocol}://${proxyTargetName}.${redirectBase}/meet`
      );
    } catch (error) {
      console.error("Error during subdomain redirect:", error);
      return res.render("create", {
        proxyDomain: fullRequestHost,
        user: req.user,
      });
    }
  } else {
    console.log(
      "Home route: Rendering create page. Client-side will use /api/auth/status."
    );
    // Pass appUser which contains isLoggedIn status. create.js will use /api/auth/status
    // but this initial status can prevent UI flicker.
    res.render("create", templateData);
  }
});

// Dashboard Route - now uses session for primary auth check
app.get("/dashboard", ensureAuthenticatedSession, async (req, res) => {
  const fullRequestHost = req.get("host");
  let protocol = req.protocol;
  if (req.headers["x-forwarded-proto"]) {
    protocol = req.headers["x-forwarded-proto"].split(",")[0];
  }
  if (process.env.NODE_ENV === "production" && protocol !== "https") {
    protocol = "https";
  }

  if (!req.user) {
    // If verifyFirebaseToken somehow didn't catch this (e.g., if modified)
    // or if you want to redirect non-logged-in users trying to access /dashboard directly
    return res.redirect("/"); // Or to a login page
  }

  // User is logged in, fetch and render their dashboard
  try {
    const userId = req.user.uid;
    const snapshot = await db
      .collection("proxies")
      .where("userId", "==", userId)
      .get();
    const userProxies = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      const proxySub = data.Proxy.toLowerCase();
      // ... construct meetUrl carefully based on IN_PROD and dev domain setup ...
      let baseDomainForLinks = IN_PROD
        ? "ego-proxy.com"
        : process.env.DEV_COOKIE_DOMAIN || "localhost";
      if (
        !IN_PROD &&
        baseDomainForLinks === "localhost" &&
        req.get("host").includes(":")
      ) {
        baseDomainForLinks = req.get("host").split(":")[0]; // e.g. jarno.localhost from jarno.localhost:3001
      }

      userProxies.push({
        id: doc.id,
        name: data.OriginalProxyName || data.Proxy,
        imageUrl:
          data.friendly && data.friendly.length > 0
            ? data.friendly[0].url
            : data.joy && data.joy.length > 0
            ? data.joy[0].url
            : "/img/logo.png",
        proxySubdomain: proxySub,
        meetUrl: `${protocol}://${proxySub}.${baseDomainForLinks}${
          IN_PROD ? "" : ":" + port
        }/meet`,
      });
    });

    console.log(
      `User ${userId} rendering dashboard with ${userProxies.length} proxies.`
    );
    res.render("dashboard", {
      appUser: req.appUser, // Pass session-derived user
      proxies: userProxies,
      proxyDomain: fullRequestHost,
    });
  } catch (error) {
    console.error("Error fetching user proxies for /dashboard route:", error);
    res.status(500).render("error", {
      user: req.user,
      message: "Error loading your dashboard.",
      error,
    });
  }
});

// SiteId Route - MODIFIED
// In src/server/server.js

app.get("/:siteId", verifyFirebaseToken, async (req, res) => {
  const siteIdParam = req.params.siteId; // Use a different name to avoid conflict with 'siteId' key

  if (
    !siteIdParam ||
    ["undefined", "favicon.ico", "client", "public"].includes(
      siteIdParam.trim()
    )
  ) {
    console.log("Invalid siteId or static asset request in /:siteId");
    return res.status(404).send("Not found");
  }

  const parts = req.hostname.split(".");
  const subdomainFromHost =
    parts.length > 1 && parts[0] !== "www" && parts[0] !== "ego-proxy"
      ? parts[0]
      : "";

  // Determine the current proxy's identifier (lowercase) - prioritize host, fallback to path
  const currentProxyIdentifier = (
    subdomainFromHost || siteIdParam
  ).toLowerCase();

  console.log(
    `Accessing /:siteId - Path: ${siteIdParam}, Subdomain: ${subdomainFromHost}, Identifier: ${currentProxyIdentifier}`
  );

  if (CT === siteIdParam) {
    gptModel = "gpt-4";
  }

  console.log(`GPT Model for /:siteId route: ${gptModel}`);

  const guests = req.query.guest
    ? decodeURIComponent(req.query.guest).split(",")
    : [];

  try {
    const data = await fetchContextAndProxies(
      siteIdParam,
      currentProxyIdentifier,
      guests
    );
    if (!data) {
      // console.log(`No matching records for siteId: ${siteIdParam}, subdomain: ${currentProxyIdentifier}`);
      return res.render("create", {
        proxyDomain: req.get("host"),
        appUser: req.appUser,
      });
    }

    data.transcriptThreshold = transcriptThreshold; // Assuming this is defined
    data.hasShareParam = req.query.hasOwnProperty("share");
    if (typeof data.proxies !== "object" || data.proxies === null)
      data.proxies = {};

    const mainProxyData = data.proxies[currentProxyIdentifier];
    data.siteId = siteIdParam;
    data.proxyDisplayName = mainProxyData
      ? mainProxyData.OriginalProxyName || mainProxyData.Proxy
      : currentProxyIdentifier;
    data.currentProxySubdomain = currentProxyIdentifier;
    data.proxyOwnerId = mainProxyData ? mainProxyData.userId : null;

    // Crucially, pass the application user (from session) to the template
    data.appUser = req.appUser;
    // The client-side chat.js will use /api/auth/status if it needs to confirm,
    // but this initial appUser helps determine owner vs. guest views/permissions.
    // loggedInUserId was previously from Firebase token, now should use appUser.uid
    data.loggedInUserId =
      req.appUser && req.appUser.isLoggedIn ? req.appUser.uid : null;

    const lowerCaseProxies = Object.keys(data.proxies).reduce((result, key) => {
      result[key.toLowerCase()] = data.proxies[key];
      return result;
    }, {});
    updateContextMessages(
      siteIdParam,
      currentProxyIdentifier,
      lowerCaseProxies,
      data
    );

    data.appUser = req.appUser;
    data.loggedInUserId = req.appUser.isLoggedIn ? req.appUser.uid : null; // Use appUser

    res.render("chat", data);
  } catch (err) {
    console.error(
      `Error in /:siteId route for ${siteIdParam} (identifier: ${currentProxyIdentifier}):`,
      err.message
    );
    res.render("create", {
      proxyDomain: req.get("host"),
      appUser: req.appUser,
    });
  }
});

// API: /api/my-proxies - Already updated to use ensureAuthenticatedSession, which is good.
app.get("/api/my-proxies", ensureAuthenticatedSession, async (req, res) => {
  try {
    const userId = req.appUser.uid; // Use uid from req.appUser set by ensureAuthenticatedSession
    const snapshot = await db
      .collection("proxies")
      .where("userId", "==", userId)
      .get();
    const userProxies = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      userProxies.push({
        id: doc.id,
        name: data.OriginalProxyName || data.Proxy,
        imageUrl:
          data.friendly && data.friendly.length > 0
            ? data.friendly[0].url
            : data.joy && data.joy.length > 0
            ? data.joy[0].url
            : "/img/logo.png",
        proxySubdomain: data.Proxy,
      });
    });
    res.json({ success: true, proxies: userProxies });
  } catch (error) {
    console.error("Error fetching user proxies (session based):", error);
    res.status(500).json({ success: false, error: "Failed to fetch proxies." });
  }
});

// Proxy Update Route - MODIFIED
app.post(
  "/update-proxy",
  apiLimiter,
  ensureAuthenticatedSession,
  async (req, res) => {
    // req.appUser is now available from ensureAuthenticatedSession
    const loggedInUserId = req.appUser.uid;

    const parts = req.hostname.split("."); // This gets hostname of the server, not necessarily the proxy being updated if it's via API
    // If this API is meant to be called from a proxy's page, the subdomain might be in req.body or a param
    // For now, assuming 'subdomain' refers to the proxy to be updated and is determined correctly
    const { contentId, content, proxyNameToUpdate } = req.body; // Expect proxyNameToUpdate if not derived from host

    // Determine the proxy to update, e.g., from proxyNameToUpdate or if API is on proxy's host
    const targetSubdomain =
      proxyNameToUpdate ||
      (parts.length > 1 && parts[0] !== "www" && parts[0] !== "ego-proxy"
        ? parts[0]
        : "");

    if (!targetSubdomain) {
      return res
        .status(400)
        .json({
          error:
            "Target proxy subdomain could not be determined or is invalid.",
        });
    }
    if (contentId === undefined || content === undefined) {
      return res
        .status(400)
        .json({ error: "Missing contentId or content in request body." });
    }

    try {
      const proxyData = await findProxyDataByName(targetSubdomain);
      if (proxyData && proxyData.id) {
        if (proxyData.userId !== loggedInUserId) {
          console.warn(
            `Permission Denied: User ${loggedInUserId} tried to edit proxy ${targetSubdomain} owned by ${proxyData.userId}`
          );
          return res
            .status(403)
            .json({ error: "Permission denied: You do not own this proxy." });
        }
        const proxyRef = db.collection("proxies").doc(proxyData.id);
        await proxyRef.update({ [contentId]: content });
        res.json({ success: true, message: "Record updated successfully" });
      } else {
        console.error(
          `No matching doc found for proxyName: ${targetSubdomain} in /update-proxy`
        );
        return res
          .status(404)
          .json({ error: `Proxy '${targetSubdomain}' not found.` });
      }
    } catch (error) {
      console.error("Error updating Firestore in /update-proxy:", error);
      res
        .status(500)
        .json({ error: `Failed to update due to error: ${error.message}` });
    }
  }
);

// Chat Route (keep existing, but ensure it doesn't bypass ownership for profile updates if those happen here)
app.post("/ask/", apiLimiter, ensureAuthenticatedSession, async (req, res) => {
  const loggedInUserId = req.user ? req.user.uid : null;
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
          error:
            "Request timed out. The server took too long to process your request.",
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
      return res.status(400).send({
        error: `Data not found for siteId: ${siteId}. Please refresh or check site ID.`,
      });
    }

    const emotions = "Angry, Confused, Laugh, Sad, Fear, Disgust, Embarrassed";
    const userMessage = `Add a single line of dialogue to this script to advance the plot. Never add more than one line of dialogue. Each line should express one of the following emotions: ${emotions}.\nBegin your response with "${submitTo}:" and include the relevant emotions in parentheses at the very end of your response. For example:\n${submitTo}: I'm feeling great today! (Joy)\nDo not use any other expressions than the ones listed and do not use any of these emotions twice in a row. Never change the casing of the name. `;

    const proxies = dataForSiteId.proxies || {};
    const context = dataForSiteId.context || {};
    currentSpeaker = submitTo;
    const currentProxy = proxies[currentSpeaker.toLowerCase()] || {}; // Ensure lowercase access

    if (ELEVENLABS_ENDPOINTS[currentSpeaker]) {
      voice = ELEVENLABS_ENDPOINTS[currentSpeaker];
    } else if (
      currentProxy.genderIdentity &&
      ELEVENLABS_ENDPOINTS[currentProxy.genderIdentity]
    ) {
      voice = ELEVENLABS_ENDPOINTS[currentProxy.genderIdentity];
    } else {
      voice =
        ELEVENLABS_ENDPOINTS.GBv7mTt0atIp3Br8iCZE || ELEVENLABS_ENDPOINTS.Male;
    }
    console.log(`Voice selected for ${currentSpeaker}: ${voice}`);

    if (transcript.length > transcriptThreshold && (training || tutorial)) {
      console.log("Transcript summary conditions met. Summarizing...");

      const proxyDataToUpdate = await findProxyDataByName(currentSpeaker);
      if (
        proxyDataToUpdate &&
        proxyDataToUpdate.userId !== loggedInUserId &&
        loggedInUserId !== null
      ) {
        clearTimeout(routeTimeout);
        console.warn(
          `Permission Denied: User ${loggedInUserId} tried to train proxy ${currentSpeaker} owned by ${proxyDataToUpdate.userId}`
        );
        return res.status(403).json({
          error: "Permission denied: You cannot train a proxy you do not own.",
        });
      }

      const transcriptSummary = await summarizeTranscript(
        transcript,
        siteId,
        currentSpeaker,
        proxies[currentSpeaker.toLowerCase()]?.[siteId]
      );
      console.log("Transcript summarized successfully: ", transcriptSummary);

      if (proxyDataToUpdate && proxyDataToUpdate.id) {
        const proxyRef = db.collection("proxies").doc(proxyDataToUpdate.id);
        await proxyRef.update({
          [siteId]: transcriptSummary, // e.g., 'meet': 'summary text'
        });
        if (proxies[currentSpeaker.toLowerCase()])
          proxies[currentSpeaker.toLowerCase()][siteId] = transcriptSummary;
      } else {
        console.error(
          `No matching Firestore doc found for proxyName: ${currentSpeaker} to update summary.`
        );
      }

      clearTimeout(routeTimeout);
      return res.send({
        personalityUpdated: true,
        transcriptSummary: transcriptSummary,
        answer: `${submitTo}: My personality profile has been updated based on our conversation! (Friendly)`,
      });
    } else {
      const contextMessage =
        context.message || "Default general context message";
      const proxyPersonalProfile =
        currentProxy[siteId] ||
        currentProxy.message ||
        "I am a helpful assistant.";

      const progress = Math.floor(
        (transcript.length / transcriptThreshold) * 100
      );
      let storyProgress = `\nThe story is now ${progress}% complete. Update the script with the most engaging dialogue.\n`;

      let charactersInScene = proxyList.filter(
        (proxy) =>
          proxy &&
          proxy.toLowerCase() !== "you" &&
          proxy.toLowerCase() !== "interviewer"
      );

      let systemMessage = `You are a screenwriter writing the next line of dialogue for ${currentSpeaker}: "${proxyPersonalProfile}". The overall context is: "${contextMessage}". Characters in the scene: ${charactersInScene.join(
        ", "
      )}. Their personalities are: ${Object.entries(proxies)
        .filter(([name]) => charactersInScene.includes(name))
        .map(
          ([name, details]) =>
            `${name}: ${
              details[siteId] || details.message || "Default personality"
            }`
        )
        .join("\n")}`;

      const payload = createPayload(
        systemMessage,
        transcript + storyProgress + userMessage
      );
      const assistantMessage = await getAssistantResponse(payload);
      clearTimeout(routeTimeout);
      res.send({ answer: assistantMessage });
    }
  } catch (error) {
    if (routeTimeout) clearTimeout(routeTimeout);
    console.error("Error in /ask route:", error);
    res
      .status(500)
      .json({ error: "An error occurred while processing your /ask request." });
  }
});

// Feedback Route (keep existing)
app.post("/send-feedback", apiLimiter, (req, res) => {
  const { feedback } = req.body;
  if (!feedback)
    return res.status(400).json({ message: "Feedback content is missing." });

  const mailOptions = {
    from: `"Ego-Proxy Feedback" <${emailUser}>`,
    to: emailUser,
    subject: "Ego-Proxy Feedback Received",
    text: `Feedback: ${feedback} \n\nSent from host: ${req.get("host")}`,
  };

  transporter.sendMail(mailOptions, function (error, info) {
    if (error) {
      console.error("Error sending feedback email:", error);
      res.status(500).json({
        message: "Error sending feedback email",
        error: error.message,
      });
    } else {
      console.log("Feedback email sent: " + info.response);
      res.status(200).json({ message: "Feedback sent successfully" });
    }
  });
});

// Voice Synthesis Route (keep existing)
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
    res
      .status(500)
      .send({ error: "Failed to synthesize speech with ElevenLabs." });
  }
});

const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB limit
});

// Create Proxy Route (keep existing, already associates userId via WebSocket)
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
        console.error("Timeout in /create-proxy before response sent.");
        res.status(503).json({ message: "Request timed out." });
      }
    }, 28000);

    if (!req.file || !proxyName || !genderIdentity || !ethnicity || !clientId) {
      clearTimeout(routeHttpTimeout);
      return res
        .status(400)
        .json({ message: "Missing required fields (including clientId)." });
    }

    const ws = clients[clientId] ? clients[clientId].ws : null;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      clearTimeout(routeHttpTimeout);
      console.log(
        `WebSocket connection not found or not open for clientId: ${clientId}`
      );
      return res
        .status(404)
        .json({ message: "WebSocket connection not found. Please refresh." });
    }

    const nameExists = await checkNameExists(proxyName);
    if (nameExists) {
      clearTimeout(routeHttpTimeout);
      return res.status(409).json({ message: "Name is already in use." });
    }

    clearTimeout(routeHttpTimeout);
    res.status(202).json({ message: "Processing started." });

    initiateProxyCreation(
      req,
      ws,
      ethnicity,
      genderIdentity,
      proxyName,
      proxyEmail,
      clientId
    ).catch((error) => {
      console.error("Error during background proxy creation process:", error);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: "error",
            event: "proxyCreationFailedCritical",
            message: error.message || "A critical error occurred.",
          })
        );
      }
    });
  } catch (error) {
    if (routeHttpTimeout) clearTimeout(routeHttpTimeout);
    console.error("Error in /create-proxy route handler:", error);
    if (!res.headersSent) {
      res
        .status(500)
        .json({ message: error.message || "An unexpected error occurred." });
    }
  }
});

// WebSocket Connection (keep existing)
wss.on("connection", (ws) => {
  const clientId = uuidv4();
  clients[clientId] = { ws: ws, userId: null };
  console.log(`New client connected with ID: ${clientId}`);
  ws.send(JSON.stringify({ type: "clientId", clientId }));

  ws.on("message", async (message) => {
    try {
      let parsedMessage;
      if (Buffer.isBuffer(message)) {
        parsedMessage = JSON.parse(message.toString());
      } else {
        parsedMessage = JSON.parse(message);
      }

      if (parsedMessage.type === "ping") {
        ws.send(JSON.stringify({ type: "pong" }));
      } else if (
        parsedMessage.type === "associateUser" &&
        parsedMessage.token
      ) {
        console.log(`Received associateUser for clientId: ${clientId}`);
        try {
          const decodedToken = await adminAuth.verifyIdToken(
            parsedMessage.token
          );
          if (clients[clientId]) {
            clients[clientId].userId = decodedToken.uid;
            console.log(
              `Associated user ${decodedToken.uid} with client ${clientId}`
            );
            ws.send(
              JSON.stringify({
                type: "info",
                message:
                  "Login successful! Your proxy will be saved to your account.",
              })
            );
          }
        } catch (error) {
          console.error(
            `Failed to associate user for ${clientId}:`,
            error.message
          );
          ws.send(
            JSON.stringify({
              type: "error",
              message: "Login verification failed. Please try again.",
            })
          );
        }
      }
    } catch (error) {
      console.error(
        "Error parsing WebSocket message or unexpected format:",
        message,
        error
      );
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

// Error Handlers (keep existing)
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
    error:
      process.env.NODE_ENV === "development"
        ? err
        : { status: err.status || 500 },
  });
});

// Start Server (keep existing)
server.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
  console.log(`Current GPT Model: ${gptModel}`);
});

// 3. FUNCTIONS (Keep existing, ensure findProxyDataByName and fetchProxies are robust)

function updateContextMessages(siteId, subdomain, lowerCaseProxies, data) {
  if (!globalDataStore[siteId])
    globalDataStore[siteId] = JSON.parse(JSON.stringify(data));

  const currentProxyData = lowerCaseProxies[subdomain.toLowerCase()];

  if (
    siteId === "meet" &&
    currentProxyData &&
    typeof currentProxyData.meet !== "undefined"
  ) {
    globalDataStore[
      siteId
    ].context.message = `Say hello and introduce yourself by your name, ${
      currentProxyData.OriginalProxyName || subdomain
    }. Share a detailed overview of yourself. Ask questions to keep a conversation flowing.`;
  } else if (
    siteId === "interview" &&
    currentProxyData &&
    typeof currentProxyData.meet !== "undefined"
  ) {
    globalDataStore[siteId].context.message = `You are interviewing ${
      currentProxyData.OriginalProxyName || subdomain
    } for a job.`;
  }

  if (
    subdomain &&
    subdomain !== "" &&
    subdomain !== "www" &&
    subdomain !== "ego-proxy"
  ) {
    data.meet = currentProxyData
      ? typeof currentProxyData.meet === "undefined"
      : true;
    data.training = currentProxyData
      ? typeof currentProxyData[siteId] === "undefined"
      : true;
  } else {
    data.meet = true;
    data.training = true;
  }
}

async function fetchContextFromFirestore(siteId) {
  try {
    const contextRef = db.collection("contexts").doc(siteId);
    const doc = await contextRef.get();
    if (!doc.exists) {
      console.log(`No context found for siteId: ${siteId}`);
      return null;
    }
    console.log(`Context found for siteId: ${siteId}`);
    return doc.data();
  } catch (error) {
    console.error(`Error fetching context "${siteId}" from Firestore:`, error);
    return null;
  }
}

async function fetchContextAndProxies(siteId, subdomain, guests) {
  try {
    console.log(
      `Fetching context and proxies for siteId: "${siteId}", subdomain: "${subdomain}"`
    );
    const context = await fetchContextFromFirestore(siteId);

    if (!context) {
      console.error(`No context found for siteId: "${siteId}".`);
      return null;
    }

    context.submitAsOptions = context.submitAsOptions || [];
    context.submitToOptions = context.submitToOptions || [];

    if (siteId !== CT) {
      // CT seems to be a special case
      context.submitAsOptions = updateOptionsWithSubdomain(
        context.submitAsOptions,
        guests
      );
      context.submitToOptions = updateOptionsWithSubdomain(
        context.submitToOptions,
        subdomain,
        guests
      );
    }

    const publicProxyNames = await fetchPublicProxyNames(subdomain);
    const yourProxyNames = await fetchYourProxyNames(subdomain); // This might need adjustment based on logged-in user

    // Consolidate all potential proxy names that need fetching
    proxyList = [
      ...new Set([
        subdomain,
        ...context.submitToOptions,
        ...context.submitAsOptions,
        ...guests,
      ]),
    ].filter(Boolean);

    const fetchedProxies = await fetchProxies(proxyList);

    const proxiesMap = fetchedProxies.reduce((acc, proxyData) => {
      if (proxyData && proxyData.Proxy) {
        // Use the lowercase 'Proxy' field for mapping
        acc[proxyData.Proxy.toLowerCase()] = proxyData; // Store by lowercase name
      }
      return acc;
    }, {});

    const normalizeOption = (option) => {
      const foundProxy = fetchedProxies.find(
        (p) => p.Proxy && p.Proxy.toLowerCase() === option.toLowerCase()
      );
      return foundProxy ? foundProxy.OriginalProxyName : option; // Display original name
    };

    context.submitToOptions = [
      ...new Set([subdomain, ...context.submitToOptions, ...guests]),
    ]
      .map(normalizeOption)
      .filter(Boolean);
    context.submitAsOptions = [
      ...new Set([...context.submitAsOptions, ...guests, subdomain]),
    ]
      .map(normalizeOption)
      .filter(Boolean);

    const data = {
      context: context,
      proxies: proxiesMap, // This now contains proxies keyed by their lowercase name
      publicProxies: publicProxyNames,
      yourProxies: yourProxyNames, // This will be populated by client-side if needed
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

async function fetchPublicProxyNames(subdomain) {
  try {
    const snapshot = await db
      .collection("proxies")
      .where("public", "==", "Yes")
      .get();
    const publicProxyNames = [];
    snapshot.forEach((doc) => {
      const proxyName = doc.data().OriginalProxyName || doc.data().Proxy;
      if (
        proxyName &&
        subdomain &&
        proxyName.toLowerCase() !== subdomain.toLowerCase()
      ) {
        publicProxyNames.push(proxyName);
      }
    });
    return publicProxyNames;
  } catch (error) {
    console.error("Error fetching public proxies from Firestore:", error);
    return [];
  }
}

async function fetchYourProxyNames(subdomain) {
  // This function might be better handled client-side with auth
  if (!subdomain) return [];
  try {
    const initialProxy = await findProxyDataByName(subdomain);
    if (!initialProxy || !initialProxy.email) return []; // If no email, can't find "your" other proxies this way
    const email = initialProxy.email;
    const snapshot = await db
      .collection("proxies")
      .where("email", "==", email)
      .get();
    const proxyNames = [];
    snapshot.forEach((doc) => {
      const proxyName = doc.data().OriginalProxyName || doc.data().Proxy;
      if (proxyName && proxyName.toLowerCase() !== subdomain.toLowerCase()) {
        proxyNames.push(proxyName);
      }
    });
    return proxyNames;
  } catch (error) {
    console.error("Error fetching your proxies from Firestore:", error);
    return [];
  }
}

async function findProxyDataByName(proxyName) {
  if (!proxyName || typeof proxyName !== "string") {
    console.warn(
      "findProxyDataByName called with invalid proxyName:",
      proxyName
    );
    return null;
  }
  try {
    const sanitizedProxyName = proxyName.toLowerCase();
    const snapshot = await db
      .collection("proxies")
      .where("Proxy", "==", sanitizedProxyName)
      .limit(1)
      .get();

    if (snapshot.empty) {
      console.log(
        `No matching doc found for proxyName (lowercase): "${sanitizedProxyName}"`
      );
      return null;
    }
    const doc = snapshot.docs[0];
    const data = doc.data();
    data.id = doc.id;
    return data;
  } catch (error) {
    console.error(
      "Firestore query error in findProxyDataByName for " + proxyName + ":",
      error
    );
    return null;
  }
}

async function fetchProxies(submitOptions) {
  if (!submitOptions || submitOptions.length === 0) {
    return [];
  }
  const uniqueOptions = [
    ...new Set(
      submitOptions.map((opt) =>
        typeof opt === "string" ? opt.toLowerCase() : opt
      )
    ),
  ];

  const fetchPromises = uniqueOptions
    .filter((option) => option && typeof option === "string")
    .map((option) => findProxyDataByName(option));

  try {
    const results = await Promise.all(fetchPromises);
    return results.filter(Boolean);
  } catch (error) {
    console.error("Error fetching multiple proxies in fetchProxies:", error);
    return [];
  }
}

function updateOptionsWithSubdomain(
  options = [],
  subdomainOrGuests,
  additionalGuests = []
) {
  let combined = [];
  if (Array.isArray(subdomainOrGuests)) {
    combined = [...options, ...subdomainOrGuests];
  } else if (subdomainOrGuests && typeof subdomainOrGuests === "string") {
    combined = [...options, subdomainOrGuests];
  } else {
    combined = [...options];
  }
  combined = [...combined, ...additionalGuests];
  return [
    ...new Set(
      combined.map((opt) => (typeof opt === "string" ? opt.trim() : opt))
    ),
  ].filter(Boolean);
}

function cleanDataForPublic(data) {
  // May not be needed if auth is strict
  if (typeof data !== "object" || data === null) return data;
  let cleanedData = JSON.parse(JSON.stringify(data));
  function deleteSensitiveProperties(obj) {
    if (typeof obj !== "object" || obj === null) return;
    for (const property in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, property)) {
        const sensitiveKeywords = [
          "message",
          "description",
          "email",
          "token",
          "key",
          "password",
          "secret",
        ];
        if (
          sensitiveKeywords.some((keyword) =>
            property.toLowerCase().includes(keyword)
          )
        ) {
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

async function checkNameExists(name) {
  if (!name || typeof name !== "string") return false;
  try {
    const sanitizedName = name.toLowerCase();
    const snapshot = await db
      .collection("proxies")
      .where("Proxy", "==", sanitizedName)
      .limit(1)
      .get();
    return !snapshot.empty;
  } catch (error) {
    console.error("Error in checkNameExists:", error);
    return false; // Default to false on error to prevent blocking valid names
  }
}

async function sendMail(generatedUrls, proxyEmail, proxyName, domain) {
  if (!proxyEmail) {
    console.error("Proxy email is missing for sendMail");
    return Promise.reject(
      new Error("Proxy email is missing. Cannot send confirmation.")
    );
  }
  if (!generatedUrls || !generatedUrls.joy) {
    console.error("Joy URL is missing in generatedUrls for sendMail");
    return Promise.reject(
      new Error("Required image URL (joy) for email is missing.")
    );
  }
  const proxySubdomain = proxyName.toLowerCase();
  const hostParts = domain.split(".");
  const baseDomain =
    hostParts.length > 1 ? hostParts.slice(1).join(".") : domain; // e.g., ego-proxy.com or localhost:3001

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
            <a href='http://${proxySubdomain}.${baseDomain}/meet'>
              <img src="${generatedUrls.joy}" style="max-width: 300px; border: 1px solid #ddd;" alt="${proxyName} - Joyful Expression" />
            </a>
          </p>
          <p><a href='http://${proxySubdomain}.${baseDomain}/meet'>Click here</a> to meet and further train your proxy to emulate you.
          </p>
          <p>Best,<br/>The Ego-Proxy Team</p>
        `,
      };
      transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
          console.error("Error sending email:", error);
          reject(new Error("Error sending email: " + error.message));
        } else {
          console.log(
            "Confirmation email sent successfully to " +
              proxyEmail +
              ": " +
              info.response
          );
          resolve("Proxy creation email sent.");
        }
      });
    } catch (error) {
      console.error("Critical error in sendMail function structure:", error);
      reject(
        new Error(
          "Critical error in sendMail function structure: " + error.message
        )
      );
    }
  });
}

async function generateContent(transcript, context, systemContent) {
  const payload = createPayload(systemContent, transcript);
  try {
    console.log(
      "Generating content with system prompt:",
      systemContent.substring(0, 100) + "..."
    );
    return await openai.chatCompletion(payload);
  } catch (error) {
    console.error(
      "Error while generating content via openai.chatCompletion:",
      error
    );
    return "Failed to generate content due to an internal error.";
  }
}

async function summarizeTranscript(transcript, siteId, user, profile) {
  let systemContent = "";
  let revise = profile
    ? ` Incorporate details from their previous profile: "${profile}".`
    : "";

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

async function initiateProxyCreation(
  req,
  ws,
  ethnicity,
  genderIdentity,
  proxyName,
  proxyEmail,
  clientId
) {
  console.log(
    `Initiating proxy creation for: ${proxyName}, Ethnicity: ${ethnicity}, Gender: ${genderIdentity}, ClientID: ${clientId}`
  );
  const domain = req.get("host");

  const emotionsToGenerate = {
    speak: "neutral with mouth open.",
    friendly: "neutral with mouth closed.",
    confused: "confusion.",
    joy: "laughter.",
    sad: "sadness.",
    disgust: "disgust.",
    angry: "anger.",
    fear: "fear.",
    embarrassed: "embarrassment. Blushing.",
    intrigued: "interest. Eyebrow raised.",
  };
  const generatedEmotionUrls = {
    speak: null,
    friendly: null,
    confused: null,
    joy: null,
    sad: null,
    disgust: null,
    angry: null,
    fear: null,
    embarrassed: null,
    intrigued: null,
  };

  const totalSteps =
    2 + Object.keys(emotionsToGenerate).length + 1 + (proxyEmail ? 1 : 0);
  let completedSteps = 0;

  const sendProgress = (stepMessage, increment = true) => {
    if (increment) {
      completedSteps++;
    }
    const currentProgressSteps = Math.min(completedSteps, totalSteps);
    const percentageComplete = Math.floor(
      (currentProgressSteps / totalSteps) * 100
    );

    console.log(
      `Proxy Creation Progress for ${proxyName}: ${percentageComplete}% (${stepMessage})`
    );
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "progress",
          event: "progress",
          percentage: percentageComplete,
          message: stepMessage,
          step: currentProgressSteps,
          totalSteps: totalSteps,
        })
      );
    }
  };

  try {
    sendProgress(`Starting creation for ${proxyName}...`, true);

    const baseImageBuffer = req.file.buffer;
    const uploadedImageBase64 = baseImageBuffer.toString("base64");

    const baseStyleDefinition = `Style: Altcomix style emphasizing a clear, recognizable likeness of a ${ethnicity} ${genderIdentity} without detailed textures. The eyes must be directed straight forward. The background must be pure black. The overall emotion and expression should be exaggerated in a cartoonish way.`;
    const neutralStylePrompt = `A neutral facial expression. ${baseStyleDefinition}`;

    sendProgress("Applying artistic style to your image...", false);

    console.log(
      `Generating styled base image for ${proxyName} with prompt: "${neutralStylePrompt.substring(
        0,
        100
      )}..."`
    );
    const styledBaseImageBase64 = await openai.editImage(
      uploadedImageBase64,
      neutralStylePrompt
    );

    sendProgress("Base image styled. Preparing emotional expressions...", true);

    console.log(
      `Starting concurrent generation of emotional variations for ${proxyName}...`
    );
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "info",
          event: "emotionGenerationBatchStart",
          message: "Generating all emotional expressions...",
        })
      );
    }

    const emotionEditPromises = Object.entries(emotionsToGenerate).map(
      async ([emotionKey, emotionDescription]) => {
        const emotionSpecificPrompt = `The character should appear the same but conveying ${emotionDescription}. ${baseStyleDefinition}`;
        console.log(
          `  [Starting] Generation for ${emotionKey} for ${proxyName}`
        );
        try {
          const finalEmotionImageBase64 = await openai.editImage(
            styledBaseImageBase64,
            emotionSpecificPrompt
          );
          const url = await uploadBase64ToFirebase(finalEmotionImageBase64);
          console.log(
            `  [Completed] ${emotionKey} for ${proxyName} - URL: ${
              url ? "OK" : "Failed Upload"
            }`
          );
          sendProgress(`Generated ${emotionKey} expression`, true);
          return { emotionKey, url, success: true };
        } catch (error) {
          console.error(
            `  [Failed] Generation for ${emotionKey} for ${proxyName}:`,
            error.message
          );
          sendProgress(`Failed to generate ${emotionKey} expression`, true);
          return {
            emotionKey,
            url: null,
            success: false,
            error: error.message,
          };
        }
      }
    );

    const results = await Promise.allSettled(emotionEditPromises);

    results.forEach((result) => {
      if (result.status === "fulfilled" && result.value.success) {
        generatedEmotionUrls[result.value.emotionKey] = result.value.url;
      } else if (result.status === "fulfilled" && !result.value.success) {
        console.error(
          `Fulfilled but failed task for ${result.value.emotionKey}: ${result.value.error}`
        );
      } else if (result.status === "rejected") {
        console.error(
          `An unexpected error occurred in an emotion generation promise (rejected):`,
          result.reason
        );
      }
    });

    console.log(
      `All emotional image generation tasks attempted for ${proxyName}. Preparing to save to Firestore...`
    );
    sendProgress("Saving proxy details to Firestore...", true);

    const userId = clients[clientId] ? clients[clientId].userId : null;
    console.log(
      `Saving proxy ${proxyName}. Associated User ID: ${userId || "None"}`
    );

    const proxyData = {
      Proxy: proxyName.toLowerCase(),
      OriginalProxyName: proxyName,
      userId: userId,
      genderIdentity: genderIdentity,
      email: proxyEmail || null,
      imagePrefix: `img/Guest/${proxyName}/`, // This might be legacy if all images are URLs
      speak: generatedEmotionUrls.speak
        ? [{ url: generatedEmotionUrls.speak }]
        : [],
      friendly: generatedEmotionUrls.friendly
        ? [{ url: generatedEmotionUrls.friendly }]
        : [],
      confused: generatedEmotionUrls.confused
        ? [{ url: generatedEmotionUrls.confused }]
        : [],
      joy: generatedEmotionUrls.joy ? [{ url: generatedEmotionUrls.joy }] : [],
      sad: generatedEmotionUrls.sad ? [{ url: generatedEmotionUrls.sad }] : [],
      disgust: generatedEmotionUrls.disgust
        ? [{ url: generatedEmotionUrls.disgust }]
        : [],
      fear: generatedEmotionUrls.fear
        ? [{ url: generatedEmotionUrls.fear }]
        : [],
      angry: generatedEmotionUrls.angry
        ? [{ url: generatedEmotionUrls.angry }]
        : [],
      embarrassed: generatedEmotionUrls.embarrassed
        ? [{ url: generatedEmotionUrls.embarrassed }]
        : [],
      intrigued: generatedEmotionUrls.intrigued
        ? [{ url: generatedEmotionUrls.intrigued }]
        : [],
      public: "No", // Default to not public
      createdAt: new Date(),
    };
    const docRef = await db.collection("proxies").add(proxyData);

    console.log(
      `Successfully created proxy record for ${proxyName} with ID: ${docRef.id} for user ${userId}`
    );

    if (proxyEmail && generatedEmotionUrls.joy) {
      sendProgress("Sending confirmation email...", true);
      console.log(
        `Sending confirmation email to ${proxyEmail} for ${proxyName}...`
      );
      await sendMail(generatedEmotionUrls, proxyEmail, proxyName, domain);
    } else {
      if (!proxyEmail)
        console.log("No email provided, skipping confirmation email.");
      if (!generatedEmotionUrls.joy)
        console.log("Joy URL missing, cannot send image in email.");
      if (proxyEmail && !generatedEmotionUrls.joy) {
        // Ensure step is counted if email was intended but image failed
        completedSteps++;
      }
    }

    const finalPercentage = 100;
    const finalStepMessage = "Proxy creation complete!";
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(
        JSON.stringify({
          type: "progress",
          event: "progress",
          percentage: finalPercentage,
          message: finalStepMessage,
          step: totalSteps, // Ensure this reflects actual completion
          totalSteps: totalSteps,
        })
      );
      ws.send(
        JSON.stringify({
          type: "success",
          event: "proxyCreated",
          proxyName: proxyName, // Original case name
          proxySubdomain: proxyName.toLowerCase(), // Subdomain
          domain: domain, // Full host domain
          message: "Proxy created successfully! You can now meet your proxy.",
          data: {
            proxyName: proxyName,
            proxySubdomain: proxyName.toLowerCase(),
            domain: domain,
            email: proxyEmail,
            urls: generatedEmotionUrls,
          },
        })
      );
    }
  } catch (err) {
    console.error(
      `Critical error during initiateProxyCreation for ${proxyName}:`,
      err
    );
    if (ws.readyState === WebSocket.OPEN) {
      const errorMessage =
        err && err.message
          ? err.message
          : "An undefined error occurred during proxy creation.";
      ws.send(
        JSON.stringify({
          type: "error",
          event: "proxyCreationFailedFull",
          message: `Failed to create proxy. ${errorMessage}`,
          details: err
            ? JSON.stringify(err, Object.getOwnPropertyNames(err))
            : "Error details unavailable.",
        })
      );
    }
  }
}
