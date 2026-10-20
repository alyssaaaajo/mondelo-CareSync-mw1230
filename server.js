require('dotenv').config();
const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306,
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'caresync_db',
  waitForConnections: true,
  connectionLimit: 10,
  dateStrings: true
});

app.use(express.json({ limit: '32kb' }));
app.get('/', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (_req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/style.css', (_req, res) => res.sendFile(path.join(__dirname, 'style.css')));
app.get('/app.js', (_req, res) => res.sendFile(path.join(__dirname, 'app.js')));

const clean = (v) => typeof v === 'string' ? v.trim() : '';
const validId = (v) => /^[1-9]\d*$/.test(String(v)) && Number.isSafeInteger(Number(v));
const invalid = (res, message) => res.status(400).json({ message });

function patientData(body) {
  const name = clean(body.name), gender = clean(body.gender);
  const contact = clean(body.contact), address = clean(body.address);
  const age = Number(body.age);
  if (!name || name.length > 100) return { error: 'Patient name must contain 1–100 characters.' };
  if (!Number.isInteger(age) || age < 0 || age > 130) return { error: 'Age must be a whole number from 0 to 130.' };
  if (!['Male', 'Female', 'Other'].includes(gender)) return { error: 'Select a valid gender.' };
  if (!contact || contact.length > 30) return { error: 'Contact must contain 1–30 characters.' };
  if (address.length > 255) return { error: 'Address cannot exceed 255 characters.' };
  return { values: [name, age, gender, contact, address || null] };
}
function doctorData(body) {
  const name = clean(body.name), specialization = clean(body.specialization), contact = clean(body.contact);
  if (!name || name.length > 100) return { error: 'Doctor name must contain 1–100 characters.' };
  if (!specialization || specialization.length > 100) return { error: 'Specialization must contain 1–100 characters.' };
  if (!contact || contact.length > 30) return { error: 'Contact must contain 1–30 characters.' };
  return { values: [name, specialization, contact] };
}
function appointmentData(body) {
  const patientId = body.patient_id, doctorId = body.doctor_id;
  const date = clean(body.appointment_date), time = clean(body.appointment_time);
  const reason = clean(body.reason), status = clean(body.status) || 'Scheduled';
  if (!validId(patientId) || !validId(doctorId)) return { error: 'Choose a valid patient and doctor.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T12:00:00Z`)) || new Date(`${date}T12:00:00Z`).toISOString().slice(0, 10) !== date) return { error: 'Choose a valid appointment date.' };
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: 'Choose a valid appointment time.' };
  if (reason.length > 255) return { error: 'Reason cannot exceed 255 characters.' };
  if (!['Scheduled', 'Completed', 'Cancelled'].includes(status)) return { error: 'Choose a valid status.' };
  return { values: [Number(patientId), Number(doctorId), date, `${time}:00`, reason || null, status] };
}

function fail(res, error) {
  console.error('Database error:', error);
  if (error.code === 'ER_ROW_IS_REFERENCED_2') return res.status(409).json({ message: 'This record has appointments. Delete or reassign those appointments first.' });
  if (error.code === 'ER_NO_REFERENCED_ROW_2') return res.status(400).json({ message: 'The selected patient or doctor does not exist.' });
  return res.status(500).json({ message: 'Database error. Check server logs.' });
}
function asyncRoute(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
}
function resourceRoutes(endpoint, table, columns, parse) {
  const select = `SELECT * FROM ${table}`;
  const keys = columns.join(', ');
  const placeholders = columns.map(() => '?').join(', ');
  const assignments = columns.map(c => `${c} = ?`).join(', ');
  app.get(`/api/${endpoint}`, asyncRoute(async (_req, res) => {
    const [rows] = await pool.query(`${select} ORDER BY id DESC`);
    res.json(rows);
  }));
  app.get(`/api/${endpoint}/:id`, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
    const [rows] = await pool.execute(`${select} WHERE id = ?`, [req.params.id]);
    if (!rows.length) return res.status(404).json({ message: 'Record not found.' });
    res.json(rows[0]);
  }));
  app.post(`/api/${endpoint}`, asyncRoute(async (req, res) => {
    const parsed = parse(req.body || {});
    if (parsed.error) return invalid(res, parsed.error);
    try {
      const [result] = await pool.execute(`INSERT INTO ${table} (${keys}) VALUES (${placeholders})`, parsed.values);
      res.status(201).json({ message: 'Record added successfully.', id: result.insertId });
    } catch (error) { return fail(res, error); }
  }));
  app.put(`/api/${endpoint}/:id`, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
    const parsed = parse(req.body || {});
    if (parsed.error) return invalid(res, parsed.error);
    try {
      const [result] = await pool.execute(`UPDATE ${table} SET ${assignments} WHERE id = ?`, [...parsed.values, req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Record not found.' });
      res.json({ message: 'Record updated successfully.' });
    } catch (error) { return fail(res, error); }
  }));
  app.delete(`/api/${endpoint}/:id`, asyncRoute(async (req, res) => {
    if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
    try {
      const [result] = await pool.execute(`DELETE FROM ${table} WHERE id = ?`, [req.params.id]);
      if (!result.affectedRows) return res.status(404).json({ message: 'Record not found.' });
      res.json({ message: 'Record deleted successfully.' });
    } catch (error) { return fail(res, error); }
  }));
}

resourceRoutes('patients', 'patients', ['name', 'age', 'gender', 'contact', 'address'], patientData);
resourceRoutes('doctors', 'doctors', ['name', 'specialization', 'contact'], doctorData);

// Appointments include readable patient / doctor names for the frontend.
app.get('/api/appointments', asyncRoute(async (_req, res) => {
  const [rows] = await pool.query(`
    SELECT a.*, p.name AS patient_name, d.name AS doctor_name
    FROM appointments a
    JOIN patients p ON p.id = a.patient_id
    JOIN doctors d ON d.id = a.doctor_id
    ORDER BY a.appointment_date DESC, a.appointment_time DESC, a.id DESC
  `);
  res.json(rows);
}));
app.get('/api/appointments/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
  const [rows] = await pool.execute('SELECT * FROM appointments WHERE id = ?', [req.params.id]);
  if (!rows.length) return res.status(404).json({ message: 'Appointment not found.' });
  res.json(rows[0]);
}));
app.post('/api/appointments', asyncRoute(async (req, res) => {
  const parsed = appointmentData(req.body || {});
  if (parsed.error) return invalid(res, parsed.error);
  try {
    const [result] = await pool.execute('INSERT INTO appointments (patient_id, doctor_id, appointment_date, appointment_time, reason, status) VALUES (?, ?, ?, ?, ?, ?)', parsed.values);
    res.status(201).json({ message: 'Appointment added successfully.', id: result.insertId });
  } catch (error) { return fail(res, error); }
}));
app.put('/api/appointments/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
  const parsed = appointmentData(req.body || {});
  if (parsed.error) return invalid(res, parsed.error);
  try {
    const [result] = await pool.execute('UPDATE appointments SET patient_id = ?, doctor_id = ?, appointment_date = ?, appointment_time = ?, reason = ?, status = ? WHERE id = ?', [...parsed.values, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ message: 'Appointment not found.' });
    res.json({ message: 'Appointment updated successfully.' });
  } catch (error) { return fail(res, error); }
}));
app.delete('/api/appointments/:id', asyncRoute(async (req, res) => {
  if (!validId(req.params.id)) return invalid(res, 'Invalid ID.');
  const [result] = await pool.execute('DELETE FROM appointments WHERE id = ?', [req.params.id]);
  if (!result.affectedRows) return res.status(404).json({ message: 'Appointment not found.' });
  res.json({ message: 'Appointment deleted successfully.' });
}));

app.use('/api', (_req, res) => res.status(404).json({ message: 'API route not found.' }));
app.use((error, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') return res.status(400).json({ message: 'Invalid JSON request.' });
  fail(res, error);
});
app.listen(PORT, () => console.log(`CareSync running at http://localhost:${PORT}`));
