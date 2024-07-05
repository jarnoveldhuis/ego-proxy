let thinkingTimer;
const thinkDelay = 2000;

let userName = "Jarno";
let userRole = "Product Management";
let userResume = `
Resume:
          Results-driven Product Manager with a technical background, specialized in automating workflows, improving communication, and translating customer feedback into actionable insights. Known for enhancing customer satisfaction and streamlining operations through innovative solutions. Excels in collaborative environments, seeking to leverage my skills to drive product success and deliver unique customer experiences.
          
          Experience:
          Bluecore
          AUGUST 2022 - September 2023 - Technical Program Manager
          Spearheaded Scrum ceremonies to crystallize work priorities and align the engineering team with overarching company goals, boosting morale by illustrating the tangible impact of their work.
          Orchestrated seamless communication between key stakeholders, employing recurring meetings to dynamically adjust the Gantt chart, promptly navigating dependencies and unforeseen obstacles, and maintaining executive transparency through diligent email updates.
          Innovated an automation solution for Gantt chart creation using Smartsheets and Jira integration, fostering real-time adjustments to the project timeline and enhancing the accuracy of sprint planning.
          Designed visually appealing and insightful dashboards using SQL queries in Looker, trimming manual TPM time by an hour and eradicating potential user errors.
          MARCH  2021 - July 2022 - Associate Program Manager
          Developed and automated a world-class incident management process using Firehydrant, reducing incident mitigation time from 24 hours to 30 minutes.
          Automated reporting to surface actionable insights for engineering leadership, supporting data-driven decision-making.
          Led efforts to coordinate successful performance during the Holiday season, resulting in zero incidents and a smooth customer experience.
          Streamlined the process of pulling reliability data from multiple hours a day to under an hour per week, optimizing team efficiency.
          Facilitated vendor selection and software implementation, ensuring alignment with organizational needs and goals.
          OCTOBER  2019 - March 2021 - Product Support Engineer Lead
          Collaborated with the product team to plan, build, and launch user-friendly features.
          Established a scalable process to foster collaboration between support and development teams.
          Integrated Zendesk with Jira, enhancing engineering responsiveness and support's ability to update customers on bug status.
          Served as an experienced and respected leader on the support team, influencing positive cultural changes and fostering a customer-centric mindset.
          Organized time for team connection and camaraderie during the pandemic, contributing to a positive and supportive work environment.
          Maintained a 100% CSAT score throughout the year through strategic leadership and process improvements.
          
          Instinite (instinite.com)
          SEPTEMBER  2018 - Present - Founder
          Designed and developed a task prioritizer that uses deadlines, completion time estimates, and task importance to rank and suggest the next steps for users, streamlining productivity.
          Actively working on an AI-powered version of the task prioritizer, utilizing Language Model technology, with further LLM AI-related projects in development.
          
          Activate (Formerly Bloglovin)
          APRIL  2017 - JULY 2018 - Senior Manager of SaaS Strategies & Customer Success
          Provided insightful technical and strategic guidance to agencies and brands, enhancing the success of influencer marketing campaigns.
          Proactively nurtured client relationships by sharing regular updates, collecting vital feedback, and facilitating collaboration with the development team.
          Conducted in-depth market research to inform the product roadmap, aligning strategies for sales and product innovation.
          Leveraged user interactions to define clear requirements for growth-driving platform enhancements, ensuring responsiveness to customer needs.
          AUGUST 2015 - APRIL 2017 - Product Support Manager
          Reconstructed support efforts to place emphasis on seamless collaboration between the community and the development team.
          Oversaw the launch and fine-tuning of a ticket system to enable effortlessly detailed documentation of recurring site issues.
          Developed specifications for new site features to eliminate unnecessary reliance on customer support.
          Participated in the recruitment process and was responsible for training, mentoring and management of support team.
          Leadership has resulted in a 50% decrease in caseload and an average response rate under 3 hours. 
          
          Squarespace
          JUNE 2014 - AUGUST 2015 - Product Solutions Lead
          Identified critical user pain points and facilitated communication with the development team, resulting in targeted solutions that enhanced user experience and reduced recurring problems.
          Instituted a comprehensive server-related bug tracking system, prioritizing issues based on significance. This strategic alignment allowed for better focus on key product needs, streamlining the development process.
          Spearheaded rigorous testing on new product features prior to release, ensuring quality and functionality, maintaining brand integrity, and boosting customer satisfaction.
          APRIL 2013 - JUNE 2014 - Customer Operations Lead
          Managed shift efficiency and created detailed performance reports for management.
          Innovated department resources to make work easier and enjoyable, boosting team morale.
          Facilitated new employee success via personal training and process documentation.
          Engaged with users warmly and accurately, maintaining a friend-like rapport.
          Regularly updated the knowledge base to reflect platform changes.
          Apple G Real Estate
          OCTOBER 2012 - MARCH 2013 - Sales Agent
          Designed visually pleasing ads for apartment leads and optimized their exposure to various social platforms.
          Worked closely with clients to match them with the apartment that best fits their needs.
          
          Technical Skills:
          SQL
          Looker (KPI Dashboards)
          Incident Management Tools (e.g., FireHydrant)
          Integration between tools like Jira, Zendesk, etc.
          AI/LLM Development
          
          Program Management Skills
          Agile and Scrum
          Gantt Chart Creation & Automation
          Sprint Velocity Tracking
          Vendor Management
          
          Communication & Leadership Skills:
           Stakeholder Communication
          Team Leadership & Motivation
          Interdepartmental Collaboration
          Client Relationship Management
          
          Problem-Solving & Innovation:
          Creative Solutions Development
          Process Automation
          Customer-Centric Innovation
          Gamification in Support
          
          Customer Support & Satisfaction:
          CSAT Score Maintenance
          Support Process Improvement
          Customer Needs Identification
          
          Education:
          SEPTEMBER 2007 - MAY 2010
          Western Connecticut State University - Bachelor of Arts, Psychology
`;

document.getElementById('settingsModal').addEventListener('submit', function(event) {
  event.preventDefault();

  const nameElem = event.target.querySelector('input[name="name"]');
  const roleElem = event.target.querySelector('input[name="role"]');
  const resumeElem = event.target.querySelector('textarea[name="resume"]');
  
  userName = nameElem.value || "Jarno"; // Default to "Jarno" if not provided
  userRole = roleElem.value || "Product Management"; // Default to "Product Management" if not provided
  userResume = resumeElem.value || `
  Resume:
          Results-driven Product Manager with a technical background, specialized in automating workflows, improving communication, and translating customer feedback into actionable insights. Known for enhancing customer satisfaction and streamlining operations through innovative solutions. Excels in collaborative environments, seeking to leverage my skills to drive product success and deliver unique customer experiences.
          
          Experience:
          Bluecore
          AUGUST 2022 - September 2023 - Technical Program Manager
          Spearheaded Scrum ceremonies to crystallize work priorities and align the engineering team with overarching company goals, boosting morale by illustrating the tangible impact of their work.
          Orchestrated seamless communication between key stakeholders, employing recurring meetings to dynamically adjust the Gantt chart, promptly navigating dependencies and unforeseen obstacles, and maintaining executive transparency through diligent email updates.
          Innovated an automation solution for Gantt chart creation using Smartsheets and Jira integration, fostering real-time adjustments to the project timeline and enhancing the accuracy of sprint planning.
          Designed visually appealing and insightful dashboards using SQL queries in Looker, trimming manual TPM time by an hour and eradicating potential user errors.
          MARCH  2021 - July 2022 - Associate Program Manager
          Developed and automated a world-class incident management process using Firehydrant, reducing incident mitigation time from 24 hours to 30 minutes.
          Automated reporting to surface actionable insights for engineering leadership, supporting data-driven decision-making.
          Led efforts to coordinate successful performance during the Holiday season, resulting in zero incidents and a smooth customer experience.
          Streamlined the process of pulling reliability data from multiple hours a day to under an hour per week, optimizing team efficiency.
          Facilitated vendor selection and software implementation, ensuring alignment with organizational needs and goals.
          OCTOBER  2019 - March 2021 - Product Support Engineer Lead
          Collaborated with the product team to plan, build, and launch user-friendly features.
          Established a scalable process to foster collaboration between support and development teams.
          Integrated Zendesk with Jira, enhancing engineering responsiveness and support's ability to update customers on bug status.
          Served as an experienced and respected leader on the support team, influencing positive cultural changes and fostering a customer-centric mindset.
          Organized time for team connection and camaraderie during the pandemic, contributing to a positive and supportive work environment.
          Maintained a 100% CSAT score throughout the year through strategic leadership and process improvements.
          
          Instinite (instinite.com)
          SEPTEMBER  2018 - Present - Founder
          Designed and developed a task prioritizer that uses deadlines, completion time estimates, and task importance to rank and suggest the next steps for users, streamlining productivity.
          Actively working on an AI-powered version of the task prioritizer, utilizing Language Model technology, with further LLM AI-related projects in development.
          
          Activate (Formerly Bloglovin)
          APRIL  2017 - JULY 2018 - Senior Manager of SaaS Strategies & Customer Success
          Provided insightful technical and strategic guidance to agencies and brands, enhancing the success of influencer marketing campaigns.
          Proactively nurtured client relationships by sharing regular updates, collecting vital feedback, and facilitating collaboration with the development team.
          Conducted in-depth market research to inform the product roadmap, aligning strategies for sales and product innovation.
          Leveraged user interactions to define clear requirements for growth-driving platform enhancements, ensuring responsiveness to customer needs.
          AUGUST 2015 - APRIL 2017 - Product Support Manager
          Reconstructed support efforts to place emphasis on seamless collaboration between the community and the development team.
          Oversaw the launch and fine-tuning of a ticket system to enable effortlessly detailed documentation of recurring site issues.
          Developed specifications for new site features to eliminate unnecessary reliance on customer support.
          Participated in the recruitment process and was responsible for training, mentoring and management of support team.
          Leadership has resulted in a 50% decrease in caseload and an average response rate under 3 hours. 
          
          Squarespace
          JUNE 2014 - AUGUST 2015 - Product Solutions Lead
          Identified critical user pain points and facilitated communication with the development team, resulting in targeted solutions that enhanced user experience and reduced recurring problems.
          Instituted a comprehensive server-related bug tracking system, prioritizing issues based on significance. This strategic alignment allowed for better focus on key product needs, streamlining the development process.
          Spearheaded rigorous testing on new product features prior to release, ensuring quality and functionality, maintaining brand integrity, and boosting customer satisfaction.
          APRIL 2013 - JUNE 2014 - Customer Operations Lead
          Managed shift efficiency and created detailed performance reports for management.
          Innovated department resources to make work easier and enjoyable, boosting team morale.
          Facilitated new employee success via personal training and process documentation.
          Engaged with users warmly and accurately, maintaining a friend-like rapport.
          Regularly updated the knowledge base to reflect platform changes.
          Apple G Real Estate
          OCTOBER 2012 - MARCH 2013 - Sales Agent
          Designed visually pleasing ads for apartment leads and optimized their exposure to various social platforms.
          Worked closely with clients to match them with the apartment that best fits their needs.
          
          Technical Skills:
          SQL
          Looker (KPI Dashboards)
          Incident Management Tools (e.g., FireHydrant)
          Integration between tools like Jira, Zendesk, etc.
          AI/LLM Development
          
          Program Management Skills
          Agile and Scrum
          Gantt Chart Creation & Automation
          Sprint Velocity Tracking
          Vendor Management
          
          Communication & Leadership Skills:
           Stakeholder Communication
          Team Leadership & Motivation
          Interdepartmental Collaboration
          Client Relationship Management
          
          Problem-Solving & Innovation:
          Creative Solutions Development
          Process Automation
          Customer-Centric Innovation
          Gamification in Support
          
          Customer Support & Satisfaction:
          CSAT Score Maintenance
          Support Process Improvement
          Customer Needs Identification
          
          Education:
          SEPTEMBER 2007 - MAY 2010
          Western Connecticut State University - Bachelor of Arts, Psychology
  `; 


  // Reset the bot's response when settings change
  const botResponse = document.getElementById('botResponse');
  botResponse.textContent = `Hello, my name is ${userName} and I'm excited to be here for the ${userRole} interview. Let's get started, shall we?`;
  document.getElementById("settingsModal").style.display = "none";
  // Reset any other UI elements as necessary
});

function askBot() {
  const userInputElem = document.getElementById('userInput');
  const botImage = document.getElementById('botImage'); // Get the image element
  const userInputValue = userInputElem.value;
  const nameElem = document.querySelector('input[name="name"]');
  const roleElem = document.querySelector('input[name="role"]');
  const resumeElem = document.querySelector('textarea[name="resume"]');
  const nameValue = nameElem.value;
  const resumeValue = resumeElem.value;


  // Clear the input field immediately after the function runs
  userInputElem.value = '';

  // Update to thinking image
  thinkingTimer = setTimeout(() => {
    botImage.src = "/img/think.svg";
  }, thinkDelay);

  const botResponse = document.getElementById('botResponse');

  // Set an immediate response message
  botResponse.textContent = '';

  // Add a 'loading' class to the botResponse element
  botResponse.classList.add('loading');

  fetch('/ask', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question: userInputValue, name: userName, role: userRole, resume: userResume })
  })
    .then(response => response.json())
    .then(data => {
      clearTimeout(thinkingTimer);
      botResponse.textContent = data.answer;
      botResponse.classList.remove('loading');
      // Change the image when the API call finishes successfully
      botImage.src = "/img/neutral.svg"; // Change to the path of your success image or back to the original
      checkOverlap()
    })
    .catch(error => {
      clearTimeout(thinkingTimer);
      botResponse.textContent = 'Error communicating with the bot.';
      botResponse.classList.remove('loading');
      botImage.src = "/img/error.svg";
      console.error('Error:', error);
    });
}

// window.addEventListener("load", function() {
//   toggleSettingsModal();
// });

// Change the image when the user clicks on the text field
document.getElementById('userInput').addEventListener('focus', function () {
  document.getElementById('botImage').src = "/img/neutral.svg";
});

let typingTimer; // Timer identifier
const doneTypingInterval = 2000;

document.getElementById('userInput').addEventListener('keydown', function () {
  clearTimeout(typingTimer);
  document.getElementById('botImage').src = "/img/listening.svg";
  typingTimer = setTimeout(doneTyping, doneTypingInterval);
});

function doneTyping() {
  document.getElementById('botImage').src = "/img/neutral.svg"; // Switch back to the original image
}

const inputElement = document.getElementById('userInput');
const imageElement = document.getElementById('botImage');

// inputElement.addEventListener('focus', function() {
//   imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
// });

document.addEventListener('DOMContentLoaded', (event) => {
  const inputElement = document.getElementById('userInput');
  const imageElement = document.getElementById('botImage');

  inputElement.addEventListener('focus', function() {
    console.log('Input got focus, trying to scroll image into view.');
    imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
});

document.addEventListener('DOMContentLoaded', (event) => {
  // Set default bot's response
  const botResponse = document.getElementById('botResponse');
  botResponse.textContent = `Hello, my name is ${userName}. I'm here for the ${userRole} interview. Let's get started, shall we?`;

  // Call the askBot function if you want to communicate with your server immediately
  // askBot();  
});

// document.addEventListener('DOMContentLoaded', (event) => {
//   const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

//   if (isIOS) {
//       const inputElement = document.getElementById('userInput');
//       const imageElement = document.getElementById('botImage');

//       inputElement.addEventListener('focus', function() {
//           console.log('Input got focus, trying to scroll image into view.');
//           imageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
//       });
//   }
// });
const field = document.getElementById("userInput");

field.addEventListener("focus", () => {
  field.style.marginBottom = 0;
});
function checkOverlap() {
  const svgElement = document.getElementById("botImage");
  const textElement = document.getElementById("botResponse");

  const svgRect = svgElement.getBoundingClientRect();
  const textRect = textElement.getBoundingClientRect();

  const overlap = !(svgRect.right < textRect.left || 
                    svgRect.left > textRect.right || 
                    svgRect.bottom < textRect.top || 
                    svgRect.top > textRect.bottom);

  svgElement.style.opacity = overlap ? 0.5 : 1;
  
}

// document.getElementById('showFormBtn').addEventListener('click', function() {
//   const form = document.getElementById('settingsForm');
//   form.style.display = 'block';
// });

document.getElementById('showFormBtn').addEventListener('click', function() {
  const form = document.getElementById('settingsForm');
  if(form.style.display === 'none' || form.style.display === '') {
    form.style.display = 'block';
  } else {
    form.style.display = 'none';
  }
});


// Run checkOverlap function when the window resizes or other events that could trigger overlap
window.addEventListener("resize", checkOverlap);

function toggleSettingsModal() {
  const modal = document.getElementById("settingsModal");
  modal.style.display = "block";
}

function closeSettingsModal() {
  const modal = document.getElementById("settingsModal");
  modal.style.display = "none";
}

// If clicked outside of the modal, close it
window.onclick = function(event) {
  const modal = document.getElementById("settingsModal");
  if (event.target == modal) {
      modal.style.display = "none";
  }
}
    window.location.replace("https://jarno.ego-proxy.com/interview");
