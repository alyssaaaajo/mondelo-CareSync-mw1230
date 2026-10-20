# CareSync – Healthcare Management System

Full-stack clinic CRUD demo built with HTML, CSS, JavaScript, Node.js, Express, and MySQL.

## Requirements
- Node.js 18+
- MySQL 8+ running locally

## Setup
1. Open `database.sql` in MySQL Workbench and execute **all** statements (lightning-bolt button). It creates `caresync_db` and its three tables.
2. In the project directory, copy `.env.example` to `.env` and edit the values, especially `DB_PASSWORD`. Do not put the password in `server.js` or commit `.env` to Git.
3. Open a terminal in the CareSync folder and run:
   ```bash
   npm install
   npm start
   ```
4. Visit **http://localhost:3000** in your browser. Do not open `index.html` directly as a file, because the frontend needs the running API server.

## API endpoints

| Action | Patients | Doctors | Appointments |
|---|---|---|---|
| Get all | GET `/api/patients` | GET `/api/doctors` | GET `/api/appointments` |
| Get one | GET `/api/patients/:id` | GET `/api/doctors/:id` | GET `/api/appointments/:id` |
| Create | POST `/api/patients` | POST `/api/doctors` | POST `/api/appointments` |
| Update | PUT `/api/patients/:id` | PUT `/api/doctors/:id` | PUT `/api/appointments/:id` |
| Delete | DELETE `/api/patients/:id` | DELETE `/api/doctors/:id` | DELETE `/api/appointments/:id` |

POST/PUT examples:
```json
{"name":"Maria Santos","age":27,"gender":"Female","contact":"09123456789","address":"Cebu City"}
```
```json
{"name":"Dr. Jane Cruz","specialization":"Pediatrics","contact":"09123450000"}
```
```json
{"patient_id":1,"doctor_id":1,"appointment_date":"2026-10-25","appointment_time":"09:30","reason":"Checkup","status":"Scheduled"}
```

## Notes
- Create a patient and doctor before scheduling an appointment.
- Patients/doctors with appointments cannot be deleted until their appointments are deleted/reassigned (foreign keys).
- This is an **educational local demo**, **not** a secure production medical records system. For real patient data, implement authentication, role-based access, audit logs, backups, HTTPS, and applicable privacy safeguards before use.
