const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const SibApiV3Sdk = require('sib-api-v3-sdk'); // Brevo/Sendinblue SDK

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.use('/webhook', bodyParser.raw({type: 'application/json'}));

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

