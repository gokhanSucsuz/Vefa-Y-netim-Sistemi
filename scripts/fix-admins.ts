import mongoose from 'mongoose';
import { UserModel } from '../api/models.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import CryptoJS from 'crypto-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI;
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;

function getEncryptionKey() {
  if (!ENCRYPTION_KEY) return Buffer.alloc(32, 0);
  return crypto.createHash('sha256').update(ENCRYPTION_KEY).digest();
}

function decrypt(text: string): string {
  if (!text || !text.includes(':')) return text;
  try {
    const parts = text.split(':');
    const iv = Buffer.from(parts.shift()!, 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);
    return decrypted.toString();
  } catch (e) {
    return text;
  }
}

async function fixAdmins() {
    if (!MONGODB_URI) {
        console.error('MONGODB_URI is missing');
        process.exit(1);
    }

    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        const users = await UserModel.find({ 
            $or: [{ role: 'admin' }, { email: 'edirnesydv@gmail.com' }, { isSuperAdmin: true }] 
        });

        console.log(`Found ${users.length} potential admins/superadmins.`);

        for (const user of users) {
            const updates: any = {
                role: 'superadmin',
                isSuperAdmin: true,
                isApproved: true,
                status: 'active'
            };

            // If passwordHash is missing but password exists, decrypt and hash it
            if (!user.passwordHash && user.password) {
                const plainPassword = decrypt(user.password);
                if (plainPassword && plainPassword !== user.password) {
                    updates.passwordHash = CryptoJS.SHA256(plainPassword).toString();
                    console.log(`Generated passwordHash for user: ${user.email || user.name}`);
                }
            }

            await UserModel.findByIdAndUpdate(user._id, { $set: updates });
        }

        console.log(`Migration complete.`);
        process.exit(0);
    } catch (err) {
        console.error('Error fixing admins:', err);
        process.exit(1);
    }
}

fixAdmins();
