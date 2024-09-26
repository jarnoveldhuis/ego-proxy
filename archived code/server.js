const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3001;

app.use(bodyParser.json());
app.use(express.static('src'));  // Serve static files from 'public' directory

const API_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const HEADERS = {
  'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
  'Content-Type': 'application/json'
};

// let systemVariables = {
//   name: "Jarno",
//   role: "Product Management",
//   company: ""
//   // Add more variables as required
// };

app.post('/ask', async (req, res) => {
  try {
    const userMessage = req.body.question;
    const { name = "Jarno", role = "Product Management", resume=`
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
    ` } = req.body;  // Use default values if not provided
    const payload = {
      model: "gpt-4",
      messages: [
        {
          "role": "system",
          "content": `Your name is ${name} and you are being interviewed for a ${role} position. 
          Respond with a blend of philosophy, reverence, and empathy.
          Always respond in 4 sentences or less.
          Ask a follow-up question when you don't have enough information to answer. 
          
          
          Resume:
          ${resume}
          `
        },
        {
          "role": "assistant",
          "content": "Hi, I'm ${name}. Let's get started, shall we?"
        },
        {
          "role": "user",
          "content": userMessage
        }
      ]
      ,
      temperature: 1,
      max_tokens: 256,
      top_p: 1,
      frequency_penalty: 0,
      presence_penalty: 0,

    };

    const response = await axios.post(API_ENDPOINT, payload, { headers: HEADERS });
    const assistantMessage = response.data.choices[0].message.content;
    res.send({ answer: assistantMessage });
  } catch (error) {
    res.status(500).send({ error: 'Failed to communicate with OpenAI.' });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
