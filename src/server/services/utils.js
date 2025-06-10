const gptModel = process.env.NODE_ENV === "development" ? "gpt-4o" : "gpt-4o";

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

module.exports = {
  createPayload,
};