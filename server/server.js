require('dotenv').config()

const express = require('express')

const app = express()

app.use(express.json())

const cors = require('cors')

app.use(
    cors({
        origin: 'http://localhost:5500'
    })
)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)

const storeItems = new Map([
    [1, { priceInCents: 1000, name: 'Ebook healthy cake'}]
])

app.post('/create-checkout-session', async (req, res) => {
    try{
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'blik'], // Add BLIK for Polish customers
            mode: 'payment',
            line_items: req.body.items.map(item => {
                const storeItem = storeItems.get(item.id)
                return {
                    price_data: {
                        currency: 'pln',
                        product_data: {
                            name: storeItem.name,
                        },
                        unit_amount: storeItem.priceInCents,    
                    },
                    quantity: item.quantity,
                }
            }),
            success_url: `${process.env.CLIENT_URL}/success.html`,  
            cancel_url: `${process.env.CLIENT_URL}/cancel.html`   
        })
        res.json({ url: session.url})
    }catch {
        res.status(500).json({ error: e.message})
    }

})

app.listen(3000, () => {
    console.log('Server is listening on port 3000')
})