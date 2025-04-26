require("dotenv").config();
const { Resend } = require("resend");
const fs = require("fs");
const path = require("path");
console.log("📨 Start wysyłania e-maila...");
console.log("🔑 Klucz API:", process.env.RESEND_API_KEY);

const resend = new Resend(process.env.RESEND_API_KEY);

async function sendEbookEmail(email) {
    console.log(`📨 Rozpoczęcie wysyłania e-maila do: ${email}`);
    try {
        console.log(`📨 Wysyłanie e-maila do: ${email}`);

        // Ścieżka do eBooka
        const filePath = path.join(__dirname, "ebooks", "zdrowe_slodkosci.pdf");

        // Odczytanie pliku PDF i przekonwertowanie na base64
        const fileContent = fs.readFileSync(filePath).toString("base64");

        // Wysłanie e-maila
        const response = await resend.emails.send({
            from: "noreply@healthycakes.pl", // Ważne: użyj zweryfikowanej domeny w Resend "noreply@resend.dev"
            to: email,
            subject: "🍰 Twoje Zdrowe ciasta są gotowe do pobrania!",
            html: `
                <!DOCTYPE html>
                <html lang="pl">
                <head>
                    <meta charset="UTF-8">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <title>Twój eBook | Zdrowe ciasta</title>
                    <style>
                        :root {
                            --primary-color: #8bc34a;
                            --primary-dark: #689f38;
                            --text-color: #333;
                            --light-bg: #f9f9f9;
                        }
                        
                        body {
                            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                            line-height: 1.6;
                            color: #333;
                            background-color: #f9f9f9;
                            margin: 0;
                            padding: 0;
                        }
                        
                        .container {
                            max-width: 600px;
                            margin: 0 auto;
                            padding: 20px;
                            background-color: white;
                            border-radius: 10px;
                            box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                        }
                        
                        .header {
                            text-align: center;
                            padding: 20px 0;
                            border-bottom: 1px solid #eee;
                        }
                        
                        .logo {
                            font-size: 24px;
                            font-weight: bold;
                            color: #8bc34a;
                        }
                        
                        .content {
                            padding: 30px 20px;
                        }
                        
                        h1 {
                            font-size: 24px;
                            margin-bottom: 20px;
                            color: #8bc34a;
                            text-align: center;
                        }
                        
                        p {
                            font-size: 16px;
                            margin-bottom: 15px;
                            color: #666;
                        }
                        
                        .steps {
                            margin: 30px 0;
                        }
                        
                        .step {
                            background-color: #f0f7e6;
                            border-left: 4px solid #8bc34a;
                            padding: 15px 20px;
                            margin-bottom: 15px;
                            border-radius: 0 5px 5px 0;
                        }
                        
                        .step-number {
                            color: #8bc34a;
                            font-weight: bold;
                            margin-right: 10px;
                        }
                        
                        .footer {
                            text-align: center;
                            font-size: 14px;
                            color: #999;
                            margin-top: 30px;
                            padding-top: 20px;
                            border-top: 1px solid #eee;
                        }
                        
                        .auto-message {
                            font-size: 12px;
                            color: #999;
                            margin-top: 15px;
                            font-style: italic;
                        }
                        
                        .contact-info {
                            margin-top: 20px;
                            font-size: 14px;
                        }
                        
                        .social-links {
                            margin-top: 15px;
                        }
                        
                        .social-links a {
                            color: #8bc34a;
                            text-decoration: none;
                        }
                        
                        .contact-email a {
                            color: #8bc34a;
                            text-decoration: none;
                        }
                    </style>
                </head>
                <body>
                    <div class="container">
                        <div class="header">
                            <link rel="icon" href="images/logo.png" type="image/png">
                        </div>
                        
                        <div class="content">
                            <h1>Dziękujemy za zakup!</h1>
                            
                            <p>Witaj,</p>
                            <p>Dziękujemy za zakup naszego eBooka "Zdrowe ciasta!"</p>
                            <p>Twój eBook został dołączony do tej wiadomości jako załącznik.</p>
                            
                            <div class="steps">
                                <div class="step">
                                    <span class="step-number">1.</span>
                                    Pobierz załącznik "Zdrowe-Slodkosci.pdf".
                                </div>
                                <div class="step">
                                    <span class="step-number">2.</span>
                                    Otwórz plik za pomocą dowolnego czytnika plików PDF.
                                </div>
                                <div class="step">
                                    <span class="step-number">3.</span>
                                    Ciesz się zdrowymi przepisami i smacznego! 🍰
                                </div>
                            </div>
                            
                            <p>Mamy nadzieję, że nasze przepisy zainspirują Cię do tworzenia pysznych i zdrowych Ciasta!</p>
                            
                            <div class="contact-info">
                                <p>Masz pytania? Skontaktuj się z nami:</p>
                                <p class="contact-email">📧 <a href="mailto:kontakt@mail.healthycakes.pl">kontakt@mail.healthycakes.pl</a></p>                           
                            </div>
                            
                            <div class="auto-message">
                                <p>Ta wiadomość została wygenerowana automatycznie. Prosimy nie odpowiadać na ten adres e-mail.</p>
                            </div>
                        </div>
                        
                        <div class="footer">
                            <p>&copy; 2025 healthycakes.pl. Wszystkie prawa zastrzeżone.</p>
                            <div class="social-links">
                                <p>Śledź nas: <a href="https://instagram.com/healthycakes.pl">Instagram</a></p>
                            </div>
                            <div class="contact-email">
                                <p>Kontakt: <a href="mailto:kontakt@mail.healthycakes.pl">kontakt@mail.healthycakes.pl</a></p>
                            </div>
                        </div>
                    </div>
                </body>
                </html>
            `,
            attachments: [
                {
                    filename: "Zdrowe-Slodkosci.pdf",
                    content: fileContent,
                    contentType: "application/pdf"
                }
            ]
        });

        console.log("✅ Odpowiedź z Resend:", JSON.stringify(response, null, 2));
    } catch (error) {
        console.error("❌ Błąd wysyłki e-maila:", error);
    }
}

module.exports = { sendEbookEmail };
