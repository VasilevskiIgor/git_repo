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
const { sendEbookEmail } = require("./emailService");
const { Resend } = require('resend');
console.log("📩 sendEbookEmail załadowany:", sendEbookEmail);

const app = express();
const PORT = process.env.PORT || 3001;

//Refresh app
setInterval(() => {
    fetch('https://healthycakes.pl/')
      .then(() => console.log('Ping sent'))
      .catch(console.error);
  }, 14 * 60 * 100); // co 14 minut

// Webhook endpoint with raw body parser
app.post('/webhook', express.raw({type: 'application/json'}), async (req, res) => {
    console.log("🔹 Otrzymano webhook Stripe!");
   
    const sig = req.headers["stripe-signature"];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
        console.log("✅ Webhook zweryfikowany poprawnie");
    } catch (err) {
        console.error("❌ Błąd weryfikacji webhooka:", err.message);
        return res.status(400).send(`Webhook error: ${err.message}`);
    }

    if (event.type === "checkout.session.completed") {
        console.log("✅ Płatność zakończona, przetwarzanie eBooka...");
        const session = event.data.object;
        console.log("📧 Email kupującego:", session.customer_email);

        try {
            // Check if customer already exists
            let customer = await Customer.findOne({ email: session.customer_email });
            
            if (!customer) {
                // Create new customer
                customer = new Customer({
                    email: session.customer_email,
                    stripeSessionId: session.id,
                    product: session.metadata.product || 'ebook-zdrowe-slodkosci'
                });
                
                await customer.save();
                console.log("✅ Nowy klient zapisany w bazie danych:", session.customer_email);
            } else {
                console.log("ℹ️ Klient już istnieje w bazie danych:", session.customer_email);
            }

            console.log("🔄 Próba wywołania sendEbookEmail...");
            await sendEbookEmail(session.customer_email);
            console.log("✅ Funkcja sendEbookEmail wywołana pomyślnie!");
        } catch (error) {
            console.error("❌ Błąd w sendEbookEmail lub zapisie do bazy danych:", error);
            logger.error('Błąd przetwarzania płatności:', {
                error: error.message,
                email: session.customer_email,
                sessionId: session.id
            });
        }
    }

    res.status(200).json({ received: true });
});

// AFTER the webhook route, apply JSON parsing middleware for all other routes
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files and core middleware
app.use(express.static(path.join(__dirname, 'public'), {
    index: 'index.html'
}));

app.use((req, res, next) => {
    console.log(`Żądanie: ${req.method} ${req.url}`);
    next();
});

app.use(cors({
    origin: process.env.CLIENT_URL || `http://localhost:${PORT}`,
    optionsSuccessStatus: 200
}));

app.use(express.static(path.join(__dirname, 'ebooks')));

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

// Połączenie z MongoDB
mongoose.connect(process.env.MONGODB_URI).then(() => {
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

const resend = new Resend(process.env.RESEND_API_KEY);

// Tabela produktów
const storeItems = new Map([
    [1, { priceInCents: 1000, name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta' }]
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
                    },
                    unit_amount: storeItem.priceInCents,
                },
                quantity: item.quantity,
            }
        });

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik'], 
            mode: 'payment',
            line_items: sessionItems,
            success_url: `${process.env.CLIENT_URL || `https://healthycakes.pl`}/success.html?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL || `https://healthycakes.pl`}/index.html`,
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

app.get('/api/customers', async (req, res) => {
    if (process.env.NODE_ENV !== 'production') {
        try {
            const customers = await Customer.find().select('email purchaseDate downloadCount');
            res.json(customers);
        } catch (error) {
            res.status(500).json({ error: error.message });
        }
    } else {
        res.status(403).send('Dostęp zabroniony w środowisku produkcyjnym');
    }
});

// Funkcja do generowania bezpiecznego linku do pobierania
function generateDownloadLink(email) {
    const token = jwt.sign({ email }, process.env.JWT_SECRET, { expiresIn: '30d' });
    return `${process.env.CLIENT_URL || `http://localhost:${PORT}`}/download/${token}`;
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

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
      if (err) {
        console.error('Błąd przy wysyłaniu index.html:', err);
        res.status(500).send('Błąd serwera');
      }
    });
});

// Uruchomienie serwera
app.listen(PORT, () => {
    console.log(`Używany port: ${PORT}`); 
});