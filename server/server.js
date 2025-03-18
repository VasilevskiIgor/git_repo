require('dotenv').config()

const express = require('express')
const app = express()
const cors = require('cors')

// Pozwól na dane w formacie JSON
app.use(express.json())

// Poprawiona konfiguracja CORS - akceptuje wszystkie źródła
app.use(cors())

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const storeItems = new Map([
    [1, { priceInCents: 3900, name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta'}]
])

// Na serwerze
app.post('/create-checkout-session', async (req, res) => {
    try {
        // Uprość konfigurację - użyj tylko karty jako metody płatności
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'], // Tymczasowo usuń 'blik'
            mode: 'payment',
            line_items: [
                {
                    price_data: {
                        currency: 'pln',
                        product_data: {
                            name: 'Zdrowe Słodkości: 50 przepisów na dietetyczne ciasta',
                        },
                        unit_amount: 3900,    
                    },
                    quantity: 1,
                }
            ],
            customer_email: req.body.email || undefined,
            success_url: `${process.env.CLIENT_URL || 'http://localhost:5500'}/success.html`,  
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5500'}/cancel.html`   
        });
        
        console.log('Session created:', session.id);
        res.json({ url: session.url });
    } catch (e) {
        console.error('Error creating checkout session:', e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(3000, () => {
    console.log('Server is listening on port 3000')
})

