require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const path = require('path');
const cors = require('cors');
const SibApiV3Sdk = require('sib-api-v3-sdk');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const helmet = require('helmet');
const winston = require('winston');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.use(cors({
    origin: process.env.CLIENT_URL || 'http://localhost:5500'
}));
app.use(helmet());

// Obsługa webhooków Stripe - używamy express.raw zamiast bodyParser.json()
app.use('/webhook', express.raw({ type: 'application/json' }));

// Konfiguracja logów
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    defaultMeta: { service: 'ebook-service' },
    transports: [
        new winston.transports.File({ filename: 'error.log', level: 'error' }),
        new winston.transports.File({ filename: 'combined.log' })
    ]
});

if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
        format: winston.format.simple()
    }));
}

// Ograniczenie prób pobierania
const downloadLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 godzina
    max: 5, // 5 prób na godzinę
    message: 'Zbyt wiele prób pobrania. Spróbuj ponownie później.'
});

// Konfiguracja Brevo/Sendinblue API
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKey = defaultClient.authentications['api-key'];
apiKey.apiKey = process.env.BREVO_API_KEY;
const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();

// Połączenie z MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/zdrowe-slodkosci', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('Połączono z MongoDB');
}).catch(err => {
    console.error('Błąd połączenia z MongoDB:', err);
    logger.error('Błąd połączenia z MongoDB:', err);
});

// Schema klienta
const customerSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    purchaseDate: { type: Date, default: Date.now },
    stripeSessionId: { type: String },
    product: { type: String },
    downloadCount: { type: Number, default: 0 }
});

const Customer = mongoose.model('Customer', customerSchema);

// Tabela produktów
const storeItems = new Map([
    [1, { priceInCents: 3900, name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta' }]
]);

// Endpoint do utworzenia sesji Stripe
app.post('/create-checkout-session', async (req, res) => {
    try {
        const { items, email } = req.body;
        
        if (!email) {
            return res.status(400).json({ error: 'Adres email jest wymagany' });
        }
        
        const sessionItems = items.map(item => {
            const storeItem = storeItems.get(item.id);
            if (!storeItem) {
                throw new Error(`Produkt o ID ${item.id} nie istnieje`);
            }
            
            return {
                price_data: {
                    currency: 'pln',
                    product_data: {
                        name: storeItem.name,
                        description: 'eBook z przepisami na niskokaloryczne ciasta i desery',
                        // Dodaj obrazek produktu, jeśli dostępny
                        // images: ['https://twoja-domena.pl/images/ebook-cover.jpg']
                    },
                    unit_amount: storeItem.priceInCents,
                },
                quantity: item.quantity,
            }
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik'], // Dodaj BLIK dla klientów z Polski
            mode: 'payment',
            line_items: sessionItems,
            success_url: `${process.env.CLIENT_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL}/cancel.html`,
            customer_email: email,
            metadata: {
                product: 'ebook-zdrowe-slodkosci'
            }
        });

        res.json({ url: session.url });
    } catch (error) {
        logger.error('Błąd w tworzeniu sesji płatności:', error);
        res.status(500).json({ error: error.message });
    }
});


// Endpoint do obsługi webhooków Stripe
// Obsługa webhooków - używaj express.raw dla webhooków Stripe
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;
  
    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.log(`Webhook Error: ${err.message}`);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  
    // Obsłuż różne typy wydarzeń
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object;
        // Tutaj możesz dodać kod do obsługi pomyślnie zakończonej sesji płatności
        console.log('Płatność zakończona pomyślnie!', session);
        break;
      default:
        console.log(`Nieobsługiwany typ wydarzenia: ${event.type}`);
    }
  
    res.status(200).send();
  });

  app.use((req, res, next) => {
    if (req.originalUrl === '/webhook') {
      next();
    } else {
      express.json()(req, res, next);
    }
  });



// Funkcja do generowania bezpiecznego linku do pobierania
function generateDownloadLink(email) {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return `${process.env.CLIENT_URL}/download/${token}`;
}

// Funkcja do wysyłania emaila z eBookiem
async function sendEbookEmail(email, downloadLink) {
    try {
        const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
        
        sendSmtpEmail.subject = '🍰 Twoje "Zdrowe Słodkości" są gotowe do pobrania!';
        sendSmtpEmail.htmlContent = `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h1 style="color: #8bc34a; text-align: center;">Dziękujemy za zakup!</h1>
                <p>Witaj,</p>
                <p>Dziękujemy za zakup eBooka "Zdrowe Słodkości". Twój PDF jest dostępny do pobrania poniżej.</p>
                <p>Możesz pobrać go, klikając poniższy przycisk:</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${downloadLink}" style="background-color: #8bc34a; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Pobierz eBook</a>
                </div>
                <p>Życzymy wielu wspaniałych wypieków!</p>
                <p>Zespół Zdrowe Słodkości</p>
            </div>
        `;
        sendSmtpEmail.sender = { name: 'Zdrowe Słodkości', email: process.env.SENDER_EMAIL };
        sendSmtpEmail.to = [{ email: email }];
        
        // Dodaj załącznik PDF, jeśli chcesz wysłać go bezpośrednio w emailu
        // Uwaga: Niektóre systemy pocztowe mogą blokować duże załączniki
        /*
        if (fs.existsSync(path.join(__dirname, 'ebooks/zdrowe-slodkosci.pdf'))) {
            sendSmtpEmail.attachment = [
                {
                    content: Buffer.from(fs.readFileSync(path.join(__dirname, 'ebooks/zdrowe-slodkosci.pdf'))).toString('base64'),
                    name: 'Zdrowe-Slodkosci-ebook.pdf'
                }
            ];
        }
        */
        
        const result = await apiInstance.sendTransacEmail(sendSmtpEmail);
        logger.info('Email wysłany pomyślnie', { email });
        return result;
    } catch (error) {
        logger.error('Błąd wysyłania emaila:', error);
        throw error;
    }
}

// Funkcja do weryfikacji użytkownika przed pobraniem
async function verifyUserForDownload(req, res, next) {
    try {
        const decoded = jwt.verify(req.params.token, process.env.JWT_SECRET);
        const customer = await Customer.findOne({ email: decoded.email });
        
        if (!customer) {
            logger.warn({
                message: 'Próba pobrania z nieprawidłowym klientem',
                email: decoded.email,
                ip: req.ip
            });
            return res.status(403).send('Brak autoryzacji');
        }
        
        // Zapisz dane klienta w request do wykorzystania później
        req.customer = customer;
        next();
    } catch (error) {
        logger.error({
            message: 'Błąd weryfikacji pobrania',
            error: error.message,
            ip: req.ip
        });
        res.status(400).send('Nieprawidłowy link do pobrania');
    }
}

// Endpoint do pobierania eBooka
app.get('/download/:token', downloadLimiter, verifyUserForDownload, (req, res) => {
    try {
        // Aktualizacja licznika pobrań
        req.customer.downloadCount += 1;
        req.customer.save();
        
        // Ścieżka do pliku PDF
        const filePath = path.join(__dirname, 'ebooks/zdrowe-slodkosci.pdf');
        
        // Sprawdzenie czy plik istnieje
        if (!fs.existsSync(filePath)) {
            logger.error('Plik nie istnieje:', filePath);
            return res.status(404).send('Plik nie został znaleziony');
        }
        
        // Wysłanie pliku do pobrania
        res.download(filePath, 'Zdrowe-Slodkosci-ebook.pdf');
        
        logger.info('Plik pobrany pomyślnie', { 
            email: req.customer.email, 
            downloadCount: req.customer.downloadCount 
        });
    } catch (error) {
        logger.error('Błąd pobierania pliku:', error);
        res.status(500).send('Wystąpił błąd podczas pobierania pliku');
    }
});

app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    // Weryfikacja webhooków i inne operacje...
  
    // Obsługa udanej płatności
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      
      try {
        // Zapisz klienta w bazie danych
        const customer = new Customer({
          email: session.customer_email,
          stripeSessionId: session.id,
          product: session.metadata.product
        });
        
        await customer.save();
        
        // Wygeneruj bezpieczny link do pobrania
        const downloadLink = generateDownloadLink(session.customer_email);
        
        // Wyślij email z linkiem do pobrania
        await sendEbookEmail(session.customer_email, downloadLink);
        
        logger.info('Zakup przetworzony pomyślnie', { 
          email: session.customer_email, 
          sessionId: session.id 
        });
      } catch (error) {
        logger.error('Błąd przetwarzania płatności:', error);
      }
    }
    
    // Zwróć odpowiedź sukcesu
    res.json({ received: true });
  });

// Middleware do obsługi błędów
app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
        logger.warn({
            message: 'Nieautoryzowana próba dostępu',
            ip: req.ip,
            path: req.path
        });
        return res.status(401).send('Brak autoryzacji');
    }
    
    logger.error('Błąd serwera:', err);
    res.status(500).send('Wystąpił błąd serwera');
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Serwer uruchomiony na porcie ${PORT}`);
});
