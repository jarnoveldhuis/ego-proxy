//Personality Functions

let personalityAttributes = {
  neuroticism: "",
  openness: "",
  agreeableness: "",
  conscientiousness: "",
  extroversion: "",
  senseOfHumor: "",
};

const personalityDescriptions = {
  neuroticism: {
    Sensitive: "tends to feel stress easily",
    Balanced: "can occasionally feel stressed",
    Composed: "rarely feels stressed",
  },
  openness: {
    Conservative: "appreciates familiarity",
    Curious: "is open to new ideas",
    Adventurous: "loves exploring new ideas",
  },
  agreeableness: {
    Skeptical: "enjoys arguing",
    Cooperative: "is easy to get along with",
    Compassionate: "always puts others first",
  },
  conscientiousness: {
    Casual: "tend to go with the flow",
    Organized: "are generally organized",
    Meticulous: "are meticulously organized and detail-oriented",
  },
  extroversion: {
    Introverted: "prefer quiet time alone",
    Ambiverted: "enjoy a mix of social and alone time",
    Extroverted: "love being around people",
  },
  senseOfHumor: {
    Dry: "have a dry and sarcastic sense of humor",
    Playful: "have a playful and silly sense of humor",
    Witty: "are witty or clever with their humor",
    Dark: "have a dark and NSFW sense of humor",
    None: "are serious and less inclined towards humor",
  },
};

function createPersonalityDescription() {
  return `This person ${
    personalityDescriptions.neuroticism[personalityAttributes.neuroticism]
  }, ${personalityDescriptions.openness[personalityAttributes.openness]}, and ${
    personalityDescriptions.agreeableness[personalityAttributes.agreeableness]
  }. They ${
    personalityDescriptions.conscientiousness[
      personalityAttributes.conscientiousness
    ]
  } and ${
    personalityDescriptions.extroversion[personalityAttributes.extroversion]
  }. They ${
    personalityDescriptions.senseOfHumor[personalityAttributes.senseOfHumor]
  }.`;
}

function updateAppearance(attribute, value) {
  // appearanceAttributes[attribute] = value;
  // let appearance = createAppearanceDescription();
  // document.getElementById('imageDescription').value = appearance; // Assumes there's a textarea to display this
}

// Listen for changes on all select elements within the appearance tab
document
  .querySelectorAll("#appearance select, #basic-info select")
  .forEach((select) => {
    select.addEventListener("change", function () {
      // The attribute to update is the id of the select element
      let attribute = this.id;
      let description = this.options[this.selectedIndex].text; // Gets the text of the selected option
      updateAppearance(this.id, description);
    });
  });

// Appearance Functions

let appearanceAttributes = {
  ethnicity: "",
  genderIdentity: "",
  hairLine: "",
  facialShape: "",
  noseShape: "",
  eyeColor: "",
  skinTone: "",
  hairColor: "",
  hairLength: "",
  hairStyle: "",
  facialHair: "",
  eyebrowShape: "",
  lipFullness: "",
  ageAppearance: "",
};



function updatePersonality(attribute, value) {
    personalityAttributes[attribute] = value;
    let personality = createPersonalityDescription();
    document.getElementById("personalityDescription").textContent = personality;
  }
  
  document.querySelectorAll("#personality select").forEach((select) => {
    select.addEventListener("change", function () {
      updatePersonality(this.id, this.value);
    });
  });