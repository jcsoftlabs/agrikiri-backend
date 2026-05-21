import dotenv from 'dotenv';
import path from 'path';

// Charger le .env AVANT d'importer le service
dotenv.config({ path: path.join(__dirname, '../.env') });

import { sendWelcomeEmail } from '../src/services/email.service';

async function main() {
  const email = 'christopherjer05@gmail.com';
  console.log(`Tentative d'envoi d'un email de bienvenue à ${email}...`);
  
  try {
    await sendWelcomeEmail({
      to: email,
      firstName: 'Christopher',
    });
    console.log('✅ Email envoyé avec succès !');
  } catch (error) {
    console.error('❌ Erreur lors de l\'envoi :', error);
  }
}

main();
