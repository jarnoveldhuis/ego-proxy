const nodemailer = require('nodemailer');
require('dotenv').config();

const [email, password] = process.env.EMAIL_CREDENTIALS.split(':');

console.log('Starting email test script...');
console.log('Email:', email);
console.log('Password length:', password);

async function sendTestEmail() {
  console.log('Creating transporter...');
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user: email,
      pass: password,
    },
    tls: {
      rejectUnauthorized: false,
    },
    logger: true,
    debug: true,
    connectionTimeout: 10000, // 10 seconds
  });

  console.log('Transporter created.');

  try {
    console.log('Verifying transporter...');
    await transporter.verify();
    console.log('Server is ready to take our messages');
  } catch (error) {
    console.error('Transporter verification failed:', error);
    return;
  }

  const mailOptions = {
    from: `"Test" <${email}>`,
    to: email, // Send email to yourself
    subject: 'Test Email from Nodemailer',
    text: 'This is a test email to verify Nodemailer configuration.',
  };

  console.log('Attempting to send email...');

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Test email sent:', info.response);
  } catch (error) {
    console.error('Error sending test email:', error);
  }

  console.log('Email test script execution completed.');
}

sendTestEmail().catch((error) => {
  console.error('Unexpected error in sendTestEmail:', error);
});
