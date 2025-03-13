const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_YOUR_STRIPE_SECRET_KEY');
const path = require('path');
const SibApiV3Sdk = require('sib-api-v3-sdk'); // Brevo/Sendinblue SDK

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.use('/webhook', bodyParser.raw({type: 'application/json'}));

// Configure Brevo/Sendinblue API
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['xsmtpsib-b9c931cf615fa0e2f4c07360d7917eca109538ce121b6e5dfc31598865da2c9c-aB1pgzkA5SrNIV0C'];
apiKey.apiKey = 'xsmtpsib-b9c931cf615fa0e2f4c07360d7917eca109538ce121b6e5dfc31598865da2c9c-aB1pgzkA5SrNIV0C';
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Endpoint to create Stripe checkout session
app.post('/create-checkout-session', async (req, res) => {
  const { email, product } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'blik'], // Add BLIK for Polish customers
      line_items: [
        {
          price_data: {
            currency: 'pln',
            product_data: {
              name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta',
              description: 'eBook z przepisami na niskokaloryczne ciasta i desery',
              images: ['https://twoja-domena.pl/images/ebook-cover.jpg']
            },
            unit_amount: 3900, // 39 PLN in grosz
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${req.headers.origin}/sukces?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${req.headers.origin}/anulowano`,
      customer_email: email,
      metadata: {
        product: product
      }
    });
    
    res.json({ id: session.id });
  } catch (error) {
    console.error('Błąd w sesji płatności:', error);
    res.status(500).json({ error: error.message });
  }
});

// Stripe webhook to listen for successful payments
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_YOUR_WEBHOOK_SECRET';
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Błąd webhooka: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Handle successful payment
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      // Send email with PDF attachment via Brevo
      await sendEbookEmail(session.customer_email);
      console.log(`Email sent to ${session.customer_email}`);
    } catch (error) {
      console.error('Error sending email:', error);
    }
  }
  
  res.json({received: true});
});

// Function to send email with PDF attachment via Brevo
async function sendEbookEmail(email) {
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  
  sendSmtpEmail.subject = '🍰 Twoje "Zdrowe Słodkości" są gotowe do pobrania!';
  sendSmtpEmail.htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #8bc34a; text-align: center;">Dziękujemy za zakup!</h1>
      <p>Witaj,</p>
      <p>Dziękujemy za zakup eBooka "Zdrowe Słodkości". Twój PDF jest dołączony do tej wiadomości.</p>
      <p>Możesz również pobrać go, klikając poniższy przycisk:</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="{{params.download_link}}" style="background-color: #8bc34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Pobierz eBook</a>
      </div>
      <p>Życzymy wielu wspaniałych wypieków!</p>
      <p>Zespół Zdrowe Słodkości</p>
    </div>
  `;
  sendSmtpEmail.sender = { name: 'Zdrowe Słodkości', email: 'your-email@domain.com' };
  sendSmtpEmail.to = [{ email: email }];
  
  // Add PDF attachment
  sendSmtpEmail.attachment = [
    {
      content: Buffer.from(fs.readFileSync(path.join(__dirname, 'ebooks/zdrowe-slodkosci.pdf'))).toString('base64'),
      name: 'Zdrowe-Slodkosci-ebook.pdf'
    }
  ];
  
  // Add parameters for template variables if needed
  sendSmtpEmail.params = {
    download_link: 'https://twoja-domena.pl/download/zdrowe-slodkosci-ebook.pdf'
  };
  
  return apiInstance.sendTransacEmail(sendSmtpEmail);
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});


//Store Customer Data and Download Protection

const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

// MongoDB connection
mongoose.connect('mongodb://localhost:27017/zdrowe-slodkosci', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Customer schema
const customerSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  purchaseDate: { type: Date, default: Date.now },
  stripeSessionId: { type: String },
  product: { type: String },
  downloadCount: { type: Number, default: 0 }
});

const Customer = mongoose.model('Customer', customerSchema);

// Create secure download route
app.get('/download/:token', async (req, res) => {
  try {
    // Verify JWT token
    const decoded = jwt.verify(req.params.token, 'YOUR_JWT_SECRET');
    
    // Find customer
    const customer = await Customer.findOne({ email: decoded.email });
    
    if (!customer) {
      return res.status(404).send('Customer not found');
    }
    
    // Update download count
    customer.downloadCount += 1;
    await customer.save();
    
    // Send the PDF file
    const filePath = path.join(__dirname, 'ebooks/zdrowe-slodkosci.pdf');
    
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('File not found');
    }
    
    res.download(filePath, 'Zdrowe-Slodkosci-ebook.pdf');
    
  } catch (error) {
    console.error('Download error:', error);
    res.status(400).send('Invalid or expired download link');
  }
});

// Create a secure download link
function generateDownloadLink(email) {
  const token = jwt.sign({ email }, 'YOUR_JWT_SECRET', { expiresIn: '30d' });
  return `https://twoja-domena.pl/download/${token}`;
}

// Modify the webhook handler to store customer data
app.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_YOUR_WEBHOOK_SECRET';
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    try {
      // Store customer in database
      const customer = new Customer({
        email: session.customer_email,
        stripeSessionId: session.id,
        product: session.metadata.product
      });
      
      await customer.save();
      
      // Generate secure download link
      const downloadLink = generateDownloadLink(session.customer_email);
      
      // Send email with custom download link
      const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
      // ... (same email setup as before)
      sendSmtpEmail.params = {
        download_link: downloadLink
      };
      
      await apiInstance.sendTransacEmail(sendSmtpEmail);
      
    } catch (error) {
      console.error('Error processing payment:', error);
    }
  }
  
  res.json({received: true});
});

// 1. Use environment variables for sensitive information
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const jwtSecret = process.env.JWT_SECRET;
const brevoApiKey = process.env.BREVO_API_KEY;

// 2. Rate limiting to prevent abuse
const rateLimit = require('express-rate-limit');

const downloadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 attempts per hour
  message: 'Zbyt wiele prób pobrania. Spróbuj ponownie później.'
});

app.use('/download', downloadLimiter);

// 3. Implement logging for security monitoring
const winston = require('winston');
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  defaultMeta: { service: 'ebook-service' },
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

// Log attempts at unauthorized downloads
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    logger.warn({
      message: 'Unauthorized download attempt',
      ip: req.ip,
      path: req.path
    });
  }
  next(err);
});

// 4. Set appropriate HTTP headers for security
const helmet = require('helmet');
app.use(helmet());

// 5. Verify user IP against purchase records (optional advanced protection)
async function verifyUserForDownload(req, res, next) {
  try {
    const decoded = jwt.verify(req.params.token, jwtSecret);
    const customer = await Customer.findOne({ email: decoded.email });
    
    if (!customer) {
      logger.warn({
        message: 'Download attempt with invalid customer',
        email: decoded.email,
        ip: req.ip
      });
      return res.status(403).send('Unauthorized');
    }
    
    // Store the customer in request for later use
    req.customer = customer;
    next();
  } catch (error) {
    logger.error({
      message: 'Download verification error',
      error: error.message,
      ip: req.ip
    });
    res.status(400).send('Invalid download link');
  }
}

app.get('/download/:token', verifyUserForDownload, (req, res) => {
  // Download logic here...
});