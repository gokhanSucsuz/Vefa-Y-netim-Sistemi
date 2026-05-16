import mongoose from 'mongoose';
import { ApplicantModel, StaffModel, UserModel } from '../api/models.js';
import crypto from 'crypto';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/vefa';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'vefa-sydv-secure-encryption-key-2026-64-chars-long-string-needed';

const IV_LENGTH = 16;
function getEncryptionKey() {
  return crypto.createHash('sha256').update(String(ENCRYPTION_KEY)).digest();
}

function encrypt(text: string): string {
  if (!text) return '';
  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv('aes-256-cbc', getEncryptionKey(), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
  } catch (e) {
    console.error("Encryption error:", e);
    return text;
  }
}

const neighborhoods = [
  "1. Murat", "Abdurrahman", "Atatürk", "Babademirtaş", "Barutluk", "Çavuşbey", 
  "Cumhuriyet", "Dilaverbey", "Fatih", "İstasyon", "Karaağaç", "Kocasinan", 
  "Kurtuluş", "Medrese Alibey", "Menzilahir", "Meydan", "Mithatpaşa", "Nişancıpaşa"
];

async function generateMockData() {
    try {
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB');

        // Clear existing data (optional, but requested for fresh mock)
        await ApplicantModel.deleteMany({});
        await StaffModel.deleteMany({});
        // We probably shouldn't clear Users as it might lock the super admin out if they aren't careful, 
        // but for a clean mock we'll follow instructions if it's a reset.
        // Actually, let's just ADD the mock data.

        // 1. Generate 85 households (Applicants)
        console.log('Generating 85 households...');
        const applicants = [];
        let totalPeople = 0;
        for (let i = 1; i <= 85; i++) {
            const haneSize = Math.floor(Math.random() * 4) + 1; // 1-4 people per hane
            totalPeople += haneSize;
            
            applicants.push({
                name: `Hane Reisi ${i}`,
                surname: `Soyisim ${i}`,
                tcNo: encrypt(`100000000${i.toString().padStart(2, '0')}`),
                phone: encrypt(`0555${i.toString().padStart(7, '0')}`),
                address: encrypt(`${neighborhoods[i % neighborhoods.length]} Mahallesi, Sokak ${i}, No: ${i}`),
                neighborhood: neighborhoods[i % neighborhoods.length],
                haneNo: encrypt(`HANE-${1000 + i}`),
                birthDate: '1970-01-01',
                gender: i % 2 === 0 ? 'Erkek' : 'Kadın',
                maritalStatus: 'Evli',
                householdSize: haneSize,
                priority: i,
                lat: 41.675 + (Math.random() - 0.5) * 0.01,
                lng: 26.570 + (Math.random() - 0.5) * 0.01,
            });
        }
        // If totalPeople < 200, add more to some hanes
        let idx = 0;
        while (totalPeople < 200) {
            applicants[idx % applicants.length].householdSize!++;
            totalPeople++;
            idx++;
        }
        await ApplicantModel.insertMany(applicants);
        console.log(`Generated 85 households with a total of ${totalPeople} people.`);

        // 2. Generate 6 staff records
        console.log('Generating 6 staff members...');
        const staffList = [];
        for (let i = 1; i <= 6; i++) {
            staffList.push({
                name: `Personel ${i}`,
                surname: `Soyad ${i}`,
                phone: encrypt(`0544${i.toString().padStart(7, '0')}`),
                role: 'Temizlik Personeli',
                tcNo: encrypt(`200000000${i.toString().padStart(2, '0')}`),
                password: encrypt('123456'),
                isActive: true
            });
        }
        const createdStaff = await StaffModel.insertMany(staffList);
        
        // Designated teammates (Staff 1 and Staff 2)
        await (StaffModel as any).findByIdAndUpdate(createdStaff[0]._id, { partnerId: createdStaff[1]._id.toString() });
        await (StaffModel as any).findByIdAndUpdate(createdStaff[1]._id, { partnerId: createdStaff[0]._id.toString() });
        
        console.log('Mock data generation complete!');
        process.exit(0);
    } catch (err) {
        console.error('Error generating mock data:', err);
        process.exit(1);
    }
}

generateMockData();
