const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')('sk_test_TWÓJ_KLUCZ_PRYWATNY_STRIPE');
const nodemailer = require('nodemailer');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());

// Konfiguracja transportera email
const transporter = nodemailer.createTransport({
  service: 'gmail', // lub inny serwis
  auth: {
    user: 'twój_email@gmail.com',
    pass: 'twoje_hasło_lub_token'
  }
});

// Endpoint do tworzenia sesji płatności Stripe
app.post('/create-checkout-session', async (req, res) => {
  const { email, product } = req.body;
  
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'pln',
            product_data: {
              name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta',
              description: 'eBook z przepisami na niskokaloryczne ciasta i desery',
              images: ['https://twoja-domena.pl/images/ebook-cover.jpg']
            },
            unit_amount: 3900, // 39 PLN w groszach
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

// Endpoint webhook Stripe do nasłuchiwania zdarzeń
app.post('/webhook', bodyParser.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = 'whsec_TWÓJ_SEKRET_WEBHOOKA';
  
  let event;
  
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
  } catch (err) {
    console.error(`Błąd webhooka: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  // Obsługa płatności zakończonej sukcesem
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    // Wysłanie ebooka na adres email klienta
    const mailOptions = {
      from: 'twoj_email@gmail.com',
      to: session.customer_email,
      subject: '🍰 Twoje "Zdrowe Słodkości" są gotowe do pobrania!',
      html: `
        <div style="font-family