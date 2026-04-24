import mongoose from 'mongoose';

const ApplicantSchema = new mongoose.Schema({
  name: String,
  surname: String,
  tcNo: String, // Encrypted
  phone: String, // Encrypted
  address: String, // Encrypted
  neighborhood: String,
  haneNo: String, // Encrypted
  birthDate: String,
  gender: String,
  maritalStatus: String,
  notes: String,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const StaffSchema = new mongoose.Schema({
  name: String,
  surname: String,
  phone: String, // Encrypted
  role: String,
  tcNo: String, // Encrypted
  password: String, // Encrypted
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const WorkDaySchema = new mongoose.Schema({
  date: { type: String, unique: true },
  isWorkDay: Boolean,
  notes: String
});

const ScheduleSchema = new mongoose.Schema({
  date: String,
  assignments: [{
    applicantId: String,
    staffIds: [String],
    isCompleted: { type: Boolean, default: false },
    completionDate: String,
    completionNote: String
  }]
});

const ProgramSchema = new mongoose.Schema({
  name: String,
  startDate: String,
  endDate: String,
  scheduleIds: [String],
  isActive: Boolean
});

const AuditLogSchema = new mongoose.Schema({
  userId: String,
  userName: String,
  action: String,
  details: String,
  timestamp: { type: Date, default: Date.now }
});

const AdminSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  role: { type: String, default: 'admin' }
});

const UserSchema = new mongoose.Schema({
  name: String,
  surname: String,
  fullName: String,
  tcNo: { type: String, unique: true }, // Encrypted
  phone: String,
  email: String,
  password: String, // Encrypted/Plain (AES)
  passwordHash: String, // reserved for bcrypt if needed
  role: { type: String, default: 'staff' },
  status: { type: String, default: 'active' },
  createdAt: { type: String, default: () => new Date().toISOString() }
});

export const ApplicantModel = mongoose.models.Applicant || mongoose.model('Applicant', ApplicantSchema);
export const StaffModel = mongoose.models.Staff || mongoose.model('Staff', StaffSchema);
export const WorkDayModel = mongoose.models.WorkDay || mongoose.model('WorkDay', WorkDaySchema);
export const ScheduleModel = mongoose.models.Schedule || mongoose.model('Schedule', ScheduleSchema);
export const ProgramModel = mongoose.models.Program || mongoose.model('Program', ProgramSchema);
export const AuditLogModel = mongoose.models.AuditLog || mongoose.model('AuditLog', AuditLogSchema);
export const AdminModel = mongoose.models.Admin || mongoose.model('Admin', AdminSchema);
export const UserModel = mongoose.models.User || mongoose.model('User', UserSchema);
